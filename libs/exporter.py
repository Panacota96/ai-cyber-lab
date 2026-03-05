from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.orchestrator.config import data_root
from libs.workbench_db import (
    build_graph,
    get_session,
    list_evidence,
    list_facts,
    list_findings,
    list_jobs,
    project_sessions,
    session_timeline,
)


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def _safe(text: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-._" else "-" for ch in text).strip("-") or "default"


def _export_dir(project: str, scope: str, identifier: str) -> Path:
    base = data_root() / "projects" / _safe(project) / "exports"
    base.mkdir(parents=True, exist_ok=True)
    folder = base / f"{_stamp()}-{scope}-{_safe(identifier)}"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _write_dataset(folder: Path, payload: dict[str, Any]) -> Path:
    path = folder / "dataset.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")
    return path


def _write_markdown(folder: Path, title: str, payload: dict[str, Any]) -> Path:
    session = payload.get("session", {}) if isinstance(payload, dict) else {}
    jobs = payload.get("jobs", []) if isinstance(payload, dict) else []
    findings = payload.get("findings", []) if isinstance(payload, dict) else []
    evidence = payload.get("evidence", []) if isinstance(payload, dict) else []
    facts = payload.get("facts", []) if isinstance(payload, dict) else []
    graph = payload.get("graph", {}) if isinstance(payload, dict) else {}

    lines = [
        f"# {title}",
        "",
        f"- Exported UTC: {datetime.now(timezone.utc).isoformat()}",
        f"- Project: {payload.get('project', 'default')}",
        f"- Session ID: {session.get('session_id', 'n/a') if isinstance(session, dict) else 'n/a'}",
        f"- Jobs: {len(jobs)}",
        f"- Findings: {len(findings)}",
        f"- Evidence: {len(evidence)}",
        f"- Facts: {len(facts)}",
        f"- Graph Nodes: {graph.get('stats', {}).get('nodes', 0) if isinstance(graph, dict) else 0}",
        f"- Graph Edges: {graph.get('stats', {}).get('edges', 0) if isinstance(graph, dict) else 0}",
        "",
        "## Findings",
        "",
    ]

    if isinstance(findings, list) and findings:
        for item in findings[:100]:
            lines.append(
                f"- **{item.get('title', 'Finding')}** | severity={item.get('severity', 'n/a')} | status={item.get('status', 'n/a')}"
            )
    else:
        lines.append("- none")

    lines += ["", "## Key Facts", ""]
    if isinstance(facts, list) and facts:
        for item in facts[:150]:
            lines.append(
                f"- [{item.get('status', 'pending')}] {item.get('subject_type', item.get('key_name', 'fact'))}: "
                f"{item.get('subject_value', item.get('value', ''))}"
            )
    else:
        lines.append("- none")

    path = folder / "report.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def _write_html(folder: Path, title: str, payload: dict[str, Any]) -> Path:
    findings = payload.get("findings", []) if isinstance(payload, dict) else []
    facts = payload.get("facts", []) if isinstance(payload, dict) else []
    graph = payload.get("graph", {}) if isinstance(payload, dict) else {}

    finding_rows = ""
    if isinstance(findings, list):
        for item in findings[:100]:
            finding_rows += (
                "<tr>"
                f"<td>{item.get('title', '')}</td>"
                f"<td>{item.get('severity', '')}</td>"
                f"<td>{item.get('status', '')}</td>"
                "</tr>"
            )

    fact_rows = ""
    if isinstance(facts, list):
        for item in facts[:200]:
            fact_rows += (
                "<tr>"
                f"<td>{item.get('status', '')}</td>"
                f"<td>{item.get('fact_kind', '')}</td>"
                f"<td>{item.get('subject_type', item.get('key_name', ''))}</td>"
                f"<td>{item.get('subject_value', item.get('value', ''))}</td>"
                "</tr>"
            )

    html = f"""<!doctype html>
<html>
<head>
<meta charset='utf-8'/>
<meta name='viewport' content='width=device-width, initial-scale=1'/>
<title>{title}</title>
<style>
body{{font-family:Segoe UI,Tahoma,sans-serif;margin:20px;background:#f5f7fb;color:#111}}
.card{{background:#fff;border:1px solid #d9e2ef;border-radius:10px;padding:14px;margin-bottom:12px}}
table{{width:100%;border-collapse:collapse}}th,td{{border:1px solid #d9e2ef;padding:8px;text-align:left}}th{{background:#f0f4fb}}
</style>
</head>
<body>
<h1>{title}</h1>
<div class='card'>
<p>Project: <strong>{payload.get('project','default')}</strong></p>
<p>Graph: nodes={graph.get('stats',{}).get('nodes',0)} edges={graph.get('stats',{}).get('edges',0)}</p>
</div>
<div class='card'><h2>Findings</h2><table><tr><th>Title</th><th>Severity</th><th>Status</th></tr>{finding_rows or '<tr><td colspan="3">none</td></tr>'}</table></div>
<div class='card'><h2>Facts</h2><table><tr><th>Status</th><th>Kind</th><th>Type</th><th>Value</th></tr>{fact_rows or '<tr><td colspan="4">none</td></tr>'}</table></div>
</body>
</html>"""

    path = folder / "report.html"
    path.write_text(html, encoding="utf-8")
    return path


def export_session_bundle(project: str, session_id: str, include_pending_facts: bool = True) -> dict[str, Any]:
    folder = _export_dir(project, "session", session_id)
    session = get_session(session_id) or {}
    safe_project = _safe(project)
    payload = {
        "project": safe_project,
        "session": session,
        "jobs": list_jobs(safe_project, limit=2000, session_id=session_id),
        "findings": list_findings(safe_project, limit=2000, session_id=session_id),
        "evidence": list_evidence(safe_project, limit=2000, session_id=session_id),
        "facts": list_facts(
            safe_project,
            limit=5000,
            status=None if include_pending_facts else "approved",
            session_id=session_id,
        ),
        "timeline": session_timeline(session_id),
        "graph": build_graph(safe_project, session_id=session_id, include_pending=include_pending_facts),
    }
    dataset = _write_dataset(folder, payload)
    markdown = _write_markdown(folder, f"Session Export {session_id}", payload)
    html = _write_html(folder, f"Session Export {session_id}", payload)
    return {
        "scope": "session",
        "project": safe_project,
        "session_id": session_id,
        "folder": str(folder),
        "dataset_json": str(dataset),
        "report_md": str(markdown),
        "report_html": str(html),
        "counts": {
            "jobs": len(payload["jobs"]),
            "findings": len(payload["findings"]),
            "evidence": len(payload["evidence"]),
            "facts": len(payload["facts"]),
            "timeline": len(payload["timeline"]),
        },
    }


def export_project_bundle(project: str, include_pending_facts: bool = True) -> dict[str, Any]:
    folder = _export_dir(project, "project", project)
    safe_project = _safe(project)
    payload = {
        "project": safe_project,
        "sessions": project_sessions(safe_project, limit=2000),
        "jobs": list_jobs(safe_project, limit=5000),
        "findings": list_findings(safe_project, limit=5000),
        "evidence": list_evidence(safe_project, limit=5000),
        "facts": list_facts(
            safe_project,
            limit=10000,
            status=None if include_pending_facts else "approved",
        ),
        "graph": build_graph(safe_project, include_pending=include_pending_facts),
    }
    dataset = _write_dataset(folder, payload)
    markdown = _write_markdown(folder, f"Project Export {safe_project}", payload)
    html = _write_html(folder, f"Project Export {safe_project}", payload)
    return {
        "scope": "project",
        "project": safe_project,
        "folder": str(folder),
        "dataset_json": str(dataset),
        "report_md": str(markdown),
        "report_html": str(html),
        "counts": {
            "sessions": len(payload["sessions"]),
            "jobs": len(payload["jobs"]),
            "findings": len(payload["findings"]),
            "evidence": len(payload["evidence"]),
            "facts": len(payload["facts"]),
        },
    }
