from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.orchestrator.config import data_root
from libs.workbench_db import upsert_session


def _slug(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-").lower()
    return text or "default"


def _sessions_dir(project: str) -> Path:
    root = data_root() / "projects" / _slug(project) / "sessions"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _session_file(project: str, session_id: str) -> Path:
    return _sessions_dir(project) / f"{session_id}.json"


def _current_file(project: str) -> Path:
    return _sessions_dir(project) / "current-session.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def start_session(
    project: str, operator: str = "unknown", context: dict[str, Any] | None = None
) -> dict[str, Any]:
    session_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + f"-{secrets.token_hex(3)}"
    payload: dict[str, Any] = {
        "session_id": session_id,
        "project": _slug(project),
        "operator": operator,
        "status": "active",
        "started_utc": _now(),
        "ended_utc": None,
        "context": context or {},
    }

    _session_file(project, session_id).write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _current_file(project).write_text(json.dumps(payload, indent=2), encoding="utf-8")
    upsert_session(payload)
    return payload


def get_current_session(project: str) -> dict[str, Any] | None:
    path = _current_file(project)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def end_session(project: str, session_id: str | None = None, summary: str = "") -> dict[str, Any]:
    current = get_current_session(project)
    if session_id is None and current:
        session_id = str(current.get("session_id"))

    if not session_id:
        raise ValueError("No active session found and no session_id provided")

    path = _session_file(project, session_id)
    if not path.exists():
        raise FileNotFoundError(f"Session file not found: {path}")

    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["status"] = "ended"
    payload["ended_utc"] = _now()
    payload["summary"] = summary
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    upsert_session(payload)

    current_path = _current_file(project)
    if current_path.exists():
        current_payload = json.loads(current_path.read_text(encoding="utf-8"))
        if current_payload.get("session_id") == session_id:
            current_path.unlink(missing_ok=True)

    return payload
