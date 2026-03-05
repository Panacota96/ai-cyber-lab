from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, File, Form, Query, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from apps.agents.knowledge_agent import knowledge_diagnostics
from apps.orchestrator.config import api_host, api_port, data_root, job_worker_enabled, log_dir
from apps.orchestrator.deps import readiness
from apps.orchestrator.graph import run_orchestrator
from libs.command_planner import build_command_plan
from libs.errors import api_error
from libs.exporter import export_project_bundle, export_session_bundle
from libs.graph_backend import (
    build_graph_data,
    graph_backend_status,
    graph_timeline_data,
    query_graph_data,
    subgraph_data,
)
from libs.job_worker import WORKER, job_worker_status
from libs.logs import get_logger, log_stats, read_recent_logs, setup_logging
from libs.proposals import generate_command_proposals
from libs.sessions import end_session, get_current_session, start_session
from libs.trace import new_trace_id, reset_trace_id, set_trace_id, trace_diagnostics, trace_event
from libs.workbench_db import (
    add_evidence,
    cancel_job,
    confirm_job,
    create_finding,
    create_job,
    get_job,
    init_db,
    link_evidence,
    list_evidence,
    list_facts,
    list_findings,
    list_jobs,
    patch_fact,
    project_sessions,
    review_fact_status,
    session_timeline,
    update_finding,
)

setup_logging()
logger = get_logger(__name__)

app = FastAPI(title="AI Cyber Lab Orchestrator", version="0.2.0")


class RouteRequest(BaseModel):
    user_input: str = Field(..., min_length=1)
    project: str | None = None
    trace_id: str | None = None


class SessionStartRequest(BaseModel):
    project: str = Field(..., min_length=1)
    operator: str = "unknown"


class SessionEndRequest(BaseModel):
    project: str = Field(..., min_length=1)
    session_id: str | None = None
    summary: str = ""


class RouteResponse(BaseModel):
    project: str
    route: str
    result: str
    trace_id: str


class PlannerRequest(BaseModel):
    project: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    purpose: str = "recon"
    profile: str = "balanced"
    discoveries: list[str] = Field(default_factory=list)


class ProposalRequest(BaseModel):
    project: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    purpose: str = "recon"
    profile: str = "balanced"
    discoveries: list[str] = Field(default_factory=list)
    providers: list[str] = Field(default_factory=list)


class JobCreateRequest(BaseModel):
    project: str = Field(..., min_length=1)
    cmd: list[str] = Field(..., min_length=1)
    timeout_sec: int = Field(default=120, ge=1, le=3600)
    session_id: str | None = None
    purpose: str = "recon"
    profile: str = "balanced"
    target: str = ""
    plan_id: str = ""
    auto_confirm: bool = False


class FindingCreateRequest(BaseModel):
    project: str = Field(..., min_length=1)
    session_id: str | None = None
    title: str = Field(..., min_length=1)
    severity: str = "medium"
    status: str = "open"
    description: str = ""
    facts: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class FindingUpdateRequest(BaseModel):
    status: str | None = None
    severity: str | None = None
    description: str | None = None
    evidence: list[str] | None = None


class EvidenceLinkRequest(BaseModel):
    finding_id: str | None = None
    report_section: str | None = None


class FactReviewRequest(BaseModel):
    reviewer: str = "operator"


class FactPatchRequest(BaseModel):
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    key_name: str | None = None
    value: str | None = None
    subject_type: str | None = None
    subject_value: str | None = None
    relation: str | None = None
    object_type: str | None = None
    object_value: str | None = None
    details: dict[str, Any] | None = None


class SessionExportRequest(BaseModel):
    project: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1)
    include_pending_facts: bool = True


class ProjectExportRequest(BaseModel):
    project: str = Field(..., min_length=1)
    include_pending_facts: bool = True


def _slug(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-").lower()
    return text or "default"


def _critical_logs(limit: int = 50) -> list[dict[str, Any]]:
    rows = read_recent_logs(lines=1500)
    out: list[dict[str, Any]] = []
    for line in rows:
        try:
            item = json.loads(line)
        except Exception:
            continue
        if str(item.get("level", "")).upper() in {"WARNING", "ERROR", "CRITICAL"}:
            out.append(item)
    return out[-limit:]


def _log_index(limit: int = 50) -> list[dict[str, Any]]:
    logs_root = log_dir()
    rows: list[dict[str, Any]] = []
    if not logs_root.exists():
        return rows

    for item in logs_root.glob("*.log*"):
        try:
            stat = item.stat()
        except Exception:
            continue
        rows.append(
            {
                "name": item.name,
                "path": str(item),
                "size_bytes": stat.st_size,
                "modified_utc": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "modified_epoch": stat.st_mtime,
            }
        )
    rows.sort(key=lambda x: float(x.get("modified_epoch", 0.0)), reverse=True)
    return rows[: max(1, min(limit, 500))]


@app.on_event("startup")
def _startup() -> None:
    init_db()
    if job_worker_enabled():
        WORKER.start()


@app.on_event("shutdown")
def _shutdown() -> None:
    WORKER.stop()


@app.get("/health")
def health() -> dict[str, Any]:
    logger.info("health check", extra={"event": "health_check"})
    return {"status": "ok", "worker": job_worker_status()}


@app.get("/ready")
def ready() -> dict[str, object]:
    out = readiness()
    out["worker"] = job_worker_status()
    logger.info(
        "readiness checked",
        extra={
            "event": "readiness_checked",
            "component": "orchestrator",
            "operation": "ready",
            "details": {"status": out.get("status"), "degraded": out.get("degraded")},
        },
    )
    return out


@app.post("/route")
def route(req: RouteRequest) -> RouteResponse:
    trace_id = req.trace_id or new_trace_id()
    token = set_trace_id(trace_id)
    logger.info(
        "route requested",
        extra={
            "event": "route_requested",
            "details": {
                "project": req.project or "default",
                "input_preview": req.user_input[:200],
                "trace_id": trace_id,
            },
        },
    )
    trace_event(
        "route_requested",
        input_text=req.user_input,
        metadata={"project": req.project or "default", "trace_id": trace_id},
    )
    try:
        out = run_orchestrator(req.user_input, req.project)
        out["trace_id"] = trace_id
        logger.info(
            "route completed",
            extra={
                "event": "route_completed",
                "details": {
                    "project": out.get("project"),
                    "route": out.get("route"),
                    "trace_id": trace_id,
                },
            },
        )
        trace_event(
            "route_completed",
            input_text=req.user_input,
            output_text=json.dumps(out),
            metadata={"trace_id": trace_id},
        )
        return RouteResponse(**out)
    except Exception as exc:
        logger.exception(
            "route failed",
            extra={
                "event": "route_failed",
                "details": {
                    "trace_id": trace_id,
                    "error": str(exc),
                    "error_code": "ROUTE_EXEC_FAILED",
                },
            },
        )
        return JSONResponse(
            status_code=500,
            content=api_error(
                error_code="ROUTE_EXEC_FAILED",
                component="orchestrator",
                operation="route",
                message="route execution failed",
                trace_id=trace_id,
                details={"exception": str(exc)},
            ),
        )
    finally:
        reset_trace_id(token)


@app.post("/planner/commands")
def planner_commands(req: PlannerRequest) -> dict[str, Any]:
    out = build_command_plan(
        project=req.project,
        target_input=req.target,
        purpose=req.purpose,
        profile=req.profile,
        discoveries=req.discoveries,
    )
    logger.info(
        "planner generated commands",
        extra={
            "event": "planner_generated",
            "details": {
                "project": req.project,
                "target": out.get("target", ""),
                "purpose": req.purpose,
                "profile": req.profile,
                "commands": len(out.get("commands", [])),
            },
        },
    )
    return out


@app.post("/proposals/commands")
def proposals_commands(req: ProposalRequest) -> dict[str, Any]:
    out = generate_command_proposals(
        project=_slug(req.project),
        target=req.target.strip(),
        purpose=req.purpose.strip().lower() or "recon",
        aggressiveness=req.profile.strip().lower() or "balanced",
        discoveries=req.discoveries,
        providers=[x.strip().lower() for x in req.providers if x.strip()],
    )
    logger.info(
        "proposal ensemble generated",
        extra={
            "event": "proposal_ensemble_generated",
            "details": {
                "project": req.project,
                "target": req.target,
                "purpose": req.purpose,
                "profile": req.profile,
                "ensemble_count": len(out.get("ensemble", [])),
            },
        },
    )
    return out


@app.post("/jobs")
def jobs_create(req: JobCreateRequest) -> dict[str, Any]:
    session_id = req.session_id
    if not session_id:
        current = get_current_session(req.project) or {}
        session_id = str(current.get("session_id")) if current.get("session_id") else None

    item = create_job(
        project=_slug(req.project),
        session_id=session_id,
        purpose=req.purpose.strip().lower() or "recon",
        profile=req.profile.strip().lower() or "balanced",
        target=req.target.strip(),
        plan_id=req.plan_id.strip(),
        cmd=req.cmd,
        timeout_sec=req.timeout_sec,
    )
    if req.auto_confirm:
        item = confirm_job(str(item.get("job_id"))) or item

    logger.info(
        "job created",
        extra={
            "event": "job_created",
            "details": {
                "project": req.project,
                "job_id": item.get("job_id"),
                "status": item.get("status"),
                "cmd": " ".join(req.cmd)[:240],
            },
        },
    )
    return item


@app.post("/jobs/{job_id}/confirm")
def jobs_confirm(job_id: str) -> Any:
    row = confirm_job(job_id)
    if row is None:
        return JSONResponse(
            status_code=404,
            content=api_error(
                error_code="JOB_NOT_FOUND",
                component="jobs",
                operation="confirm",
                message="job not found",
                details={"job_id": job_id},
            ),
        )
    return row


@app.post("/jobs/{job_id}/cancel")
def jobs_cancel(job_id: str) -> Any:
    row = cancel_job(job_id)
    if row is None:
        return JSONResponse(
            status_code=404,
            content=api_error(
                error_code="JOB_NOT_FOUND",
                component="jobs",
                operation="cancel",
                message="job not found",
                details={"job_id": job_id},
            ),
        )
    return row


@app.get("/jobs")
def jobs_list(
    project: str = Query(..., min_length=1),
    status: str | None = Query(default=None),
    session_id: str | None = Query(default=None),
    purpose: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
) -> dict[str, Any]:
    rows = list_jobs(
        _slug(project),
        status=status.strip().lower() if status else None,
        limit=limit,
        session_id=session_id.strip() if session_id else None,
        purpose=purpose.strip().lower() if purpose else None,
    )
    return {"project": _slug(project), "count": len(rows), "jobs": rows}


@app.get("/jobs/{job_id}")
def jobs_get(job_id: str) -> Any:
    row = get_job(job_id)
    if row is None:
        return JSONResponse(
            status_code=404,
            content=api_error(
                error_code="JOB_NOT_FOUND",
                component="jobs",
                operation="get",
                message="job not found",
                details={"job_id": job_id},
            ),
        )
    return row


@app.get("/projects/{project}/facts")
def project_facts(
    project: str,
    status: str | None = Query(default=None),
    session_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
) -> dict[str, Any]:
    rows = list_facts(
        _slug(project),
        limit=limit,
        status=status.strip().lower() if status else None,
        session_id=session_id.strip() if session_id else None,
    )
    return {"project": _slug(project), "count": len(rows), "facts": rows}


@app.get("/facts/review")
def facts_review_queue(
    project: str = Query(..., min_length=1),
    status: str = Query(default="pending"),
    limit: int = Query(default=200, ge=1, le=2000),
) -> dict[str, Any]:
    norm_status = status.strip().lower()
    if norm_status not in {"pending", "approved", "rejected"}:
        return JSONResponse(
            status_code=400,
            content=api_error(
                error_code="FACT_STATUS_INVALID",
                component="facts",
                operation="review_queue",
                message="invalid fact review status",
                details={"status": status},
            ),
        )
    rows = list_facts(_slug(project), limit=limit, status=norm_status)
    return {"project": _slug(project), "status": norm_status, "count": len(rows), "facts": rows}


@app.post("/facts/review/{fact_id}/approve")
def facts_approve(fact_id: str, req: FactReviewRequest) -> Any:
    row = review_fact_status(fact_id, status="approved", reviewer=req.reviewer)
    if row is None:
        return JSONResponse(
            status_code=404,
            content=api_error(
                error_code="FACT_NOT_FOUND",
                component="facts",
                operation="approve",
                message="fact not found",
                details={"fact_id": fact_id},
            ),
        )
    return row


@app.post("/facts/review/{fact_id}/reject")
def facts_reject(fact_id: str, req: FactReviewRequest) -> Any:
    row = review_fact_status(fact_id, status="rejected", reviewer=req.reviewer)
    if row is None:
        return JSONResponse(
            status_code=404,
            content=api_error(
                error_code="FACT_NOT_FOUND",
                component="facts",
                operation="reject",
                message="fact not found",
                details={"fact_id": fact_id},
            ),
        )
    return row


@app.patch("/facts/review/{fact_id}")
def facts_patch(fact_id: str, req: FactPatchRequest) -> Any:
    row = patch_fact(
        fact_id,
        confidence=req.confidence,
        key_name=req.key_name,
        value=req.value,
        subject_type=req.subject_type,
        subject_value=req.subject_value,
        relation=req.relation,
        object_type=req.object_type,
        object_value=req.object_value,
        details=req.details,
    )
    if row is None:
        return JSONResponse(
            status_code=404,
            content=api_error(
                error_code="FACT_NOT_FOUND",
                component="facts",
                operation="patch",
                message="fact not found",
                details={"fact_id": fact_id},
            ),
        )
    return row


@app.get("/projects/{project}/graph")
def project_graph(
    project: str,
    session_id: str | None = Query(default=None),
    include_pending: bool = Query(default=False),
    limit: int = Query(default=5000, ge=1, le=50000),
) -> dict[str, Any]:
    return build_graph_data(
        _slug(project),
        session_id=session_id.strip() if session_id else None,
        include_pending=include_pending,
        limit=limit,
    )


@app.get("/sessions/{session_id}/graph")
def session_graph(session_id: str, include_pending: bool = Query(default=False)) -> Any:
    events = session_timeline(session_id)
    project = ""
    for event in events:
        if event.get("type") == "session":
            project = str(event.get("data", {}).get("project", ""))
            if project:
                break
    if not project:
        return JSONResponse(
            status_code=404,
            content=api_error(
                error_code="SESSION_NOT_FOUND",
                component="graph",
                operation="session_graph",
                message="session not found",
                details={"session_id": session_id},
            ),
        )
    return build_graph_data(project, session_id=session_id, include_pending=include_pending)


@app.get("/graph/query")
def graph_query(
    project: str = Query(..., min_length=1),
    q: str = Query(..., min_length=1),
    session_id: str | None = Query(default=None),
    include_pending: bool = Query(default=True),
    limit: int = Query(default=5000, ge=1, le=50000),
) -> dict[str, Any]:
    return query_graph_data(
        _slug(project),
        q=q,
        session_id=session_id.strip() if session_id else None,
        include_pending=include_pending,
        limit=limit,
    )


@app.get("/graph/subgraph")
def graph_subgraph(
    project: str = Query(..., min_length=1),
    root: str = Query(..., min_length=1),
    depth: int = Query(default=2, ge=1, le=5),
    session_id: str | None = Query(default=None),
    include_pending: bool = Query(default=True),
    limit: int = Query(default=5000, ge=1, le=50000),
) -> dict[str, Any]:
    return subgraph_data(
        _slug(project),
        root=root,
        depth=depth,
        session_id=session_id.strip() if session_id else None,
        include_pending=include_pending,
        limit=limit,
    )


@app.get("/graph/timeline")
def graph_timeline(
    project: str = Query(..., min_length=1),
    session_id: str | None = Query(default=None),
    include_pending: bool = Query(default=True),
    limit: int = Query(default=500, ge=1, le=5000),
) -> dict[str, Any]:
    return graph_timeline_data(
        _slug(project),
        session_id=session_id.strip() if session_id else None,
        include_pending=include_pending,
        limit=limit,
    )


@app.post("/exports/session")
def export_session(req: SessionExportRequest) -> dict[str, Any]:
    return export_session_bundle(
        project=req.project,
        session_id=req.session_id,
        include_pending_facts=req.include_pending_facts,
    )


@app.post("/exports/project")
def export_project(req: ProjectExportRequest) -> dict[str, Any]:
    return export_project_bundle(project=req.project, include_pending_facts=req.include_pending_facts)


@app.post("/findings")
def findings_create(req: FindingCreateRequest) -> dict[str, Any]:
    row = create_finding(
        project=_slug(req.project),
        session_id=req.session_id,
        title=req.title,
        severity=req.severity,
        status=req.status,
        description=req.description,
        facts=req.facts,
        evidence=req.evidence,
    )
    logger.info(
        "finding created",
        extra={
            "event": "finding_created",
            "details": {"project": req.project, "finding_id": row.get("finding_id")},
        },
    )
    return row


@app.get("/findings")
def findings_list(
    project: str = Query(..., min_length=1),
    session_id: str | None = Query(default=None),
    limit: int = Query(default=300, ge=1, le=2000),
) -> dict[str, Any]:
    rows = list_findings(_slug(project), limit=limit, session_id=session_id.strip() if session_id else None)
    return {"project": _slug(project), "count": len(rows), "findings": rows}


@app.patch("/findings/{finding_id}")
def findings_patch(finding_id: str, req: FindingUpdateRequest) -> Any:
    row = update_finding(
        finding_id,
        status=req.status,
        severity=req.severity,
        description=req.description,
        evidence=req.evidence,
    )
    if row is None:
        return JSONResponse(
            status_code=404,
            content=api_error(
                error_code="FINDING_NOT_FOUND",
                component="findings",
                operation="patch",
                message="finding not found",
                details={"finding_id": finding_id},
            ),
        )
    return row


@app.get("/evidence")
def evidence_list(
    project: str = Query(..., min_length=1),
    session_id: str | None = Query(default=None),
    limit: int = Query(default=300, ge=1, le=2000),
) -> dict[str, Any]:
    rows = list_evidence(_slug(project), limit=limit, session_id=session_id.strip() if session_id else None)
    return {"project": _slug(project), "count": len(rows), "evidence": rows}


@app.post("/evidence/upload")
async def evidence_upload(
    project: str = Form(...),
    session_id: str = Form(default=""),
    finding_id: str = Form(default=""),
    report_section: str = Form(default=""),
    tags: str = Form(default=""),
    screenshot: UploadFile = File(...),
) -> dict[str, Any]:
    raw = await screenshot.read()
    sha256 = hashlib.sha256(raw).hexdigest()
    safe_project = _slug(project)
    evidence_dir = data_root() / "projects" / safe_project / "artifacts" / "uploads"
    evidence_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(screenshot.filename or "evidence.bin").suffix
    filename = f"{sha256[:12]}{suffix or '.bin'}"
    path = evidence_dir / filename
    path.write_bytes(raw)

    tag_list = [x.strip() for x in tags.split(",") if x.strip()]
    row = add_evidence(
        project=safe_project,
        session_id=session_id or None,
        finding_id=finding_id or None,
        report_section=report_section.strip(),
        file_path=str(path),
        file_name=screenshot.filename or filename,
        mime_type=screenshot.content_type or "application/octet-stream",
        sha256=sha256,
        tags=tag_list,
    )
    logger.info(
        "evidence uploaded",
        extra={
            "event": "evidence_uploaded",
            "details": {
                "project": safe_project,
                "evidence_id": row.get("evidence_id"),
                "file_path": str(path),
            },
        },
    )
    return row


@app.post("/evidence/{evidence_id}/link")
def evidence_link(evidence_id: str, req: EvidenceLinkRequest) -> Any:
    row = link_evidence(evidence_id, finding_id=req.finding_id, report_section=req.report_section)
    if row is None:
        return JSONResponse(
            status_code=404,
            content=api_error(
                error_code="EVIDENCE_NOT_FOUND",
                component="evidence",
                operation="link",
                message="evidence not found",
                details={"evidence_id": evidence_id},
            ),
        )
    return row


@app.get("/sessions/{session_id}/timeline")
def sessions_timeline(session_id: str) -> dict[str, Any]:
    events = session_timeline(session_id)
    return {"session_id": session_id, "count": len(events), "events": events}


@app.get("/projects/{project}/sessions")
def sessions_list(
    project: str,
    status: str | None = Query(default=None),
    operator: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
) -> dict[str, Any]:
    rows = project_sessions(
        _slug(project),
        limit=limit,
        status=status.strip().lower() if status else None,
        operator=operator.strip() if operator else None,
        q=q.strip() if q else None,
    )
    return {"project": _slug(project), "count": len(rows), "sessions": rows}


@app.get("/logs")
def logs(lines: int = Query(default=200, ge=1, le=2000)) -> dict[str, object]:
    out = {"stats": log_stats(), "lines": read_recent_logs(lines=lines)}
    logger.info(
        "logs fetched",
        extra={
            "event": "logs_fetched",
            "component": "orchestrator",
            "operation": "logs",
            "details": {"requested_lines": lines, "returned_lines": len(out["lines"])},
        },
    )
    return out


@app.get("/ops/log-index")
def ops_log_index(limit: int = Query(default=50, ge=1, le=500)) -> dict[str, Any]:
    files = _log_index(limit=limit)
    return {
        "log_dir": str(log_dir()),
        "count": len(files),
        "files": files,
        "stats": log_stats(),
    }


@app.get("/ops/health/deep")
def ops_health_deep(project: str = Query(default="default")) -> dict[str, Any]:
    ready = readiness()
    critical = _critical_logs(limit=100)
    return {
        "status": "ok" if str(ready.get("status")) == "ok" else "degraded",
        "project": project,
        "readiness": ready,
        "worker": job_worker_status(),
        "graph_backend": graph_backend_status(),
        "current_session": get_current_session(project) or {},
        "recent_critical_logs": critical,
        "critical_count": len(critical),
        "log_stats": log_stats(),
    }


@app.get("/diagnostics")
def diagnostics(project: str = Query(default="default")) -> dict[str, object]:
    out = {
        "readiness": readiness(),
        "trace": trace_diagnostics(),
        "knowledge": knowledge_diagnostics(),
        "graph_backend": graph_backend_status(),
        "log_stats": log_stats(),
        "current_session": get_current_session(project) or {},
        "recent_critical_logs": _critical_logs(limit=50),
        "worker": job_worker_status(),
    }
    logger.info(
        "diagnostics fetched",
        extra={
            "event": "diagnostics_fetched",
            "component": "orchestrator",
            "operation": "diagnostics",
            "details": {
                "project": project,
                "critical_logs": len(out["recent_critical_logs"]),
                "ready_status": out["readiness"].get("status"),
            },
        },
    )
    return out


@app.post("/sessions/start")
def api_start_session(req: SessionStartRequest) -> dict[str, object]:
    try:
        session = start_session(req.project, operator=req.operator)
    except Exception as exc:
        return JSONResponse(
            status_code=400,
            content=api_error(
                error_code="SESSION_START_FAILED",
                component="session",
                operation="start",
                message="failed to start session",
                details={"error": str(exc)},
            ),
        )
    logger.info(
        "session started",
        extra={
            "event": "session_started",
            "details": {"project": req.project, "session_id": session["session_id"]},
        },
    )
    return session


@app.post("/sessions/end")
def api_end_session(req: SessionEndRequest) -> dict[str, object]:
    try:
        session = end_session(req.project, session_id=req.session_id, summary=req.summary)
    except FileNotFoundError as exc:
        return JSONResponse(
            status_code=404,
            content=api_error(
                error_code="SESSION_NOT_FOUND",
                component="session",
                operation="end",
                message="session not found",
                details={"error": str(exc)},
            ),
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content=api_error(
                error_code="SESSION_END_INVALID",
                component="session",
                operation="end",
                message="invalid session end request",
                details={"error": str(exc)},
            ),
        )
    logger.info(
        "session ended",
        extra={
            "event": "session_ended",
            "details": {"project": req.project, "session_id": session["session_id"]},
        },
    )
    return session


@app.get("/sessions/current")
def api_current_session(project: str = Query(..., min_length=1)) -> dict[str, object]:
    return get_current_session(project) or {}


def _run_cli() -> None:
    parser = argparse.ArgumentParser(description="Run the AI Cyber Lab orchestrator")
    parser.add_argument("input", nargs="?", help="User input routed to one agent")
    parser.add_argument("--project", default=None, help="Project slug")
    parser.add_argument("--serve", action="store_true", help="Run FastAPI server")
    parser.add_argument("--start-session", action="store_true", help="Start a project session")
    parser.add_argument("--end-session", action="store_true", help="End a project session")
    parser.add_argument("--session-id", default=None, help="Specific session id to end")
    parser.add_argument("--operator", default="unknown", help="Operator name for session start")
    parser.add_argument("--summary", default="", help="Session end summary")
    args = parser.parse_args()

    if args.serve:
        logger.info(
            "starting api server",
            extra={
                "event": "api_start",
                "details": {"host": api_host(), "port": api_port()},
            },
        )
        uvicorn.run(
            "apps.orchestrator.main:app",
            host=api_host(),
            port=api_port(),
            reload=False,
            loop="asyncio",
        )
        return

    if args.start_session:
        if not args.project:
            parser.error("--project is required for --start-session")
        out = start_session(args.project, operator=args.operator)
        logger.info(
            "session started (cli)",
            extra={
                "event": "session_started_cli",
                "details": {"project": args.project, "session_id": out["session_id"]},
            },
        )
        print(json.dumps(out, indent=2))
        return

    if args.end_session:
        if not args.project:
            parser.error("--project is required for --end-session")
        out = end_session(args.project, session_id=args.session_id, summary=args.summary)
        logger.info(
            "session ended (cli)",
            extra={
                "event": "session_ended_cli",
                "details": {"project": args.project, "session_id": out["session_id"]},
            },
        )
        print(json.dumps(out, indent=2))
        return

    if not args.input:
        parser.error("input is required unless --serve is set")

    trace_id = new_trace_id()
    token = set_trace_id(trace_id)
    try:
        output = run_orchestrator(args.input, args.project)
        output["trace_id"] = trace_id
        logger.info(
            "cli route completed",
            extra={
                "event": "cli_route_completed",
                "details": {
                    "project": output.get("project"),
                    "route": output.get("route"),
                    "trace_id": trace_id,
                },
            },
        )
    finally:
        reset_trace_id(token)
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    _run_cli()
