from __future__ import annotations

import argparse
import html
import json
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, Form
from fastapi.responses import HTMLResponse

from apps.orchestrator.config import api_host, orchestrator_url, ui_port

app = FastAPI(title="AI Cyber Lab UI", version="0.1.0")


def _fetch_json(method: str, path: str, payload: dict[str, Any] | None = None) -> tuple[int, dict[str, Any]]:
    url = f"{orchestrator_url().rstrip('/')}{path}"
    try:
        with httpx.Client(timeout=10.0) as client:
            if method == "GET":
                resp = client.get(url)
            else:
                resp = client.post(url, json=payload or {})
        try:
            return resp.status_code, resp.json()
        except Exception:
            return resp.status_code, {"raw": resp.text}
    except Exception as exc:
        return 503, {"error": str(exc), "url": url}


def _pretty(value: Any) -> str:
    return html.escape(json.dumps(value, indent=2))


def _render(project: str, flash: str = "", detail: Any | None = None) -> str:
    health_code, health = _fetch_json("GET", "/health")
    _, current = _fetch_json("GET", f"/sessions/current?project={project}")
    _, logs = _fetch_json("GET", "/logs?lines=60")
    _, caps = _fetch_json("GET", "/diagnostics?project=" + project)

    flash_block = ""
    if flash:
        flash_block = f"<div style='padding:10px;border:1px solid #a7c7ff;background:#eef4ff;margin-bottom:12px'>{html.escape(flash)}</div>"

    detail_block = ""
    if detail is not None:
        detail_block = (
            "<h3>Result</h3>"
            f"<pre style='background:#111;color:#ddd;padding:12px;overflow:auto'>{_pretty(detail)}</pre>"
        )

    log_lines = logs.get("lines", []) if isinstance(logs, dict) else []
    logs_preview = "\n".join(log_lines[-40:]) if isinstance(log_lines, list) else str(log_lines)

    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>AI Cyber Lab UI</title>
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, sans-serif; margin: 20px; background: #f5f7fb; color: #1a1a1a; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
    .card {{ background: #fff; border: 1px solid #d7deea; border-radius: 10px; padding: 14px; }}
    input, textarea, button {{ width: 100%; margin-top: 8px; padding: 8px; box-sizing: border-box; }}
    button {{ cursor: pointer; background:#103f91;color:#fff;border:none;border-radius:6px; }}
    pre {{ white-space: pre-wrap; }}
    @media (max-width: 900px) {{ .grid {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <h1>AI Cyber Lab Dashboard</h1>
  <p>Orchestrator health: <strong>{health_code}</strong> | status: <strong>{html.escape(str(health.get("status", "unknown")))}</strong></p>
  {flash_block}
  <div class="grid">
    <div class="card">
      <h2>Route Request</h2>
      <form method="post" action="/ui/route">
        <label>Project</label>
        <input name="project" value="{html.escape(project)}"/>
        <label>User Input</label>
        <textarea name="user_input" rows="4" placeholder="nmap recon on 10.10.10.10"></textarea>
        <button type="submit">Run Agent Route</button>
      </form>
    </div>
    <div class="card">
      <h2>Session Control</h2>
      <form method="post" action="/ui/session/start">
        <label>Project</label>
        <input name="project" value="{html.escape(project)}"/>
        <label>Operator</label>
        <input name="operator" value="david"/>
        <button type="submit">Start Session</button>
      </form>
      <form method="post" action="/ui/session/end">
        <label>Project</label>
        <input name="project" value="{html.escape(project)}"/>
        <label>Summary</label>
        <input name="summary" value="session complete"/>
        <button type="submit">End Session</button>
      </form>
      <h3>Current Session</h3>
      <pre>{_pretty(current)}</pre>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <h2>Diagnostics Snapshot</h2>
    <pre>{_pretty(caps)}</pre>
  </div>
  <div class="card" style="margin-top:16px">
    <h2>Recent Logs</h2>
    <pre style='background:#111;color:#ddd;padding:12px;overflow:auto'>{html.escape(logs_preview)}</pre>
  </div>
  {detail_block}
</body>
</html>
"""


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def home(project: str = "demo") -> str:
    return _render(project=project)


@app.post("/ui/route", response_class=HTMLResponse)
def ui_route(project: str = Form(...), user_input: str = Form(...)) -> str:
    code, out = _fetch_json("POST", "/route", {"project": project, "user_input": user_input})
    return _render(project=project, flash=f"/route status={code}", detail=out)


@app.post("/ui/session/start", response_class=HTMLResponse)
def ui_session_start(project: str = Form(...), operator: str = Form("unknown")) -> str:
    code, out = _fetch_json("POST", "/sessions/start", {"project": project, "operator": operator})
    return _render(project=project, flash=f"/sessions/start status={code}", detail=out)


@app.post("/ui/session/end", response_class=HTMLResponse)
def ui_session_end(project: str = Form(...), summary: str = Form("")) -> str:
    code, out = _fetch_json("POST", "/sessions/end", {"project": project, "summary": summary})
    return _render(project=project, flash=f"/sessions/end status={code}", detail=out)


def _run_cli() -> None:
    parser = argparse.ArgumentParser(description="Run AI Cyber Lab UI")
    parser.add_argument("--host", default=api_host())
    parser.add_argument("--port", type=int, default=ui_port())
    args = parser.parse_args()
    uvicorn.run("apps.ui.main:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    _run_cli()
