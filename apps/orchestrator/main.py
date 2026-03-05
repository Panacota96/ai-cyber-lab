from __future__ import annotations

import argparse
import json
from typing import Any

import uvicorn
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from apps.agents.knowledge_agent import knowledge_diagnostics
from apps.orchestrator.config import api_host, api_port
from apps.orchestrator.deps import readiness
from apps.orchestrator.graph import run_orchestrator
from libs.errors import api_error
from libs.logs import get_logger, log_stats, read_recent_logs, setup_logging
from libs.sessions import end_session, get_current_session, start_session
from libs.trace import new_trace_id, reset_trace_id, set_trace_id, trace_diagnostics, trace_event

setup_logging()
logger = get_logger(__name__)

app = FastAPI(title="AI Cyber Lab Orchestrator", version="0.1.0")


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


@app.get("/health")
def health() -> dict[str, str]:
    logger.info("health check", extra={"event": "health_check"})
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, object]:
    out = readiness()
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
                "details": {"project": out.get("project"), "route": out.get("route"), "trace_id": trace_id},
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
                "details": {"trace_id": trace_id, "error": str(exc), "error_code": "ROUTE_EXEC_FAILED"},
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


@app.get("/diagnostics")
def diagnostics(project: str = Query(default="default")) -> dict[str, object]:
    out = {
        "readiness": readiness(),
        "trace": trace_diagnostics(),
        "knowledge": knowledge_diagnostics(),
        "log_stats": log_stats(),
        "current_session": get_current_session(project) or {},
        "recent_critical_logs": _critical_logs(limit=50),
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
        extra={"event": "session_started", "details": {"project": req.project, "session_id": session["session_id"]}},
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
        extra={"event": "session_ended", "details": {"project": req.project, "session_id": session["session_id"]}},
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
            extra={"event": "session_started_cli", "details": {"project": args.project, "session_id": out["session_id"]}},
        )
        print(json.dumps(out, indent=2))
        return

    if args.end_session:
        if not args.project:
            parser.error("--project is required for --end-session")
        out = end_session(args.project, session_id=args.session_id, summary=args.summary)
        logger.info(
            "session ended (cli)",
            extra={"event": "session_ended_cli", "details": {"project": args.project, "session_id": out["session_id"]}},
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
                "details": {"project": output.get("project"), "route": output.get("route"), "trace_id": trace_id},
            },
        )
    finally:
        reset_trace_id(token)
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    _run_cli()
