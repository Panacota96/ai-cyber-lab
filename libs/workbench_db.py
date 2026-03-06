from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.orchestrator.config import data_root
from libs.logs import get_logger

_LOCK = threading.Lock()
logger = get_logger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_path() -> Path:
    root = data_root()
    root.mkdir(parents=True, exist_ok=True)
    return Path(root / "aicl_workbench.db")


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(_db_path(), timeout=30, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def _ensure_column(con: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    cols = [str(r[1]) for r in con.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in cols:
        con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db() -> None:
    with _LOCK:
        con = _conn()
        try:
            cur = con.cursor()
            cur.executescript(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                  session_id TEXT PRIMARY KEY,
                  project TEXT NOT NULL,
                  operator TEXT NOT NULL,
                  status TEXT NOT NULL,
                  started_utc TEXT NOT NULL,
                  ended_utc TEXT,
                  summary TEXT NOT NULL DEFAULT '',
                  context_json TEXT NOT NULL DEFAULT '{}',
                  created_utc TEXT NOT NULL,
                  updated_utc TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS jobs (
                  job_id TEXT PRIMARY KEY,
                  project TEXT NOT NULL,
                  session_id TEXT,
                  status TEXT NOT NULL,
                  purpose TEXT NOT NULL,
                  profile TEXT NOT NULL,
                  target TEXT NOT NULL,
                  plan_id TEXT NOT NULL DEFAULT '',
                  command_json TEXT NOT NULL,
                  timeout_sec INTEGER NOT NULL DEFAULT 120,
                  created_utc TEXT NOT NULL,
                  updated_utc TEXT NOT NULL,
                  started_utc TEXT,
                  ended_utc TEXT,
                  stdout_path TEXT NOT NULL DEFAULT '',
                  stderr_path TEXT NOT NULL DEFAULT '',
                  returncode INTEGER,
                  error TEXT NOT NULL DEFAULT ''
                );

                CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project);
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
                CREATE INDEX IF NOT EXISTS idx_jobs_project_status ON jobs(project, status);
                CREATE INDEX IF NOT EXISTS idx_jobs_session ON jobs(session_id);

                CREATE TABLE IF NOT EXISTS findings (
                  finding_id TEXT PRIMARY KEY,
                  project TEXT NOT NULL,
                  session_id TEXT,
                  title TEXT NOT NULL,
                  severity TEXT NOT NULL,
                  status TEXT NOT NULL,
                  description TEXT NOT NULL,
                  facts_json TEXT NOT NULL DEFAULT '[]',
                  evidence_json TEXT NOT NULL DEFAULT '[]',
                  created_utc TEXT NOT NULL,
                  updated_utc TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_findings_project ON findings(project);
                CREATE INDEX IF NOT EXISTS idx_findings_session ON findings(session_id);

                CREATE TABLE IF NOT EXISTS evidence (
                  evidence_id TEXT PRIMARY KEY,
                  project TEXT NOT NULL,
                  session_id TEXT,
                  finding_id TEXT,
                  report_section TEXT NOT NULL DEFAULT '',
                  file_path TEXT NOT NULL,
                  file_name TEXT NOT NULL,
                  mime_type TEXT NOT NULL,
                  sha256 TEXT NOT NULL,
                  tags_json TEXT NOT NULL DEFAULT '[]',
                  created_utc TEXT NOT NULL,
                  linked_utc TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_evidence_project ON evidence(project);
                CREATE INDEX IF NOT EXISTS idx_evidence_session ON evidence(session_id);
                CREATE INDEX IF NOT EXISTS idx_evidence_finding ON evidence(finding_id);

                CREATE TABLE IF NOT EXISTS facts (
                  fact_id TEXT PRIMARY KEY,
                  project TEXT NOT NULL,
                  session_id TEXT,
                  job_id TEXT,
                  source TEXT NOT NULL,
                  key_name TEXT NOT NULL,
                  value TEXT NOT NULL,
                  confidence REAL NOT NULL DEFAULT 0.5,
                  created_utc TEXT NOT NULL,
                  status TEXT NOT NULL DEFAULT 'pending',
                  reviewer TEXT NOT NULL DEFAULT '',
                  reviewed_utc TEXT,
                  fact_kind TEXT NOT NULL DEFAULT 'entity',
                  entity_type TEXT NOT NULL DEFAULT '',
                  subject_type TEXT NOT NULL DEFAULT '',
                  subject_value TEXT NOT NULL DEFAULT '',
                  relation TEXT NOT NULL DEFAULT '',
                  object_type TEXT NOT NULL DEFAULT '',
                  object_value TEXT NOT NULL DEFAULT '',
                  details_json TEXT NOT NULL DEFAULT '{}'
                );

                CREATE INDEX IF NOT EXISTS idx_facts_project ON facts(project);
                CREATE INDEX IF NOT EXISTS idx_facts_session ON facts(session_id);

                CREATE TABLE IF NOT EXISTS playbooks (
                  playbook_id TEXT PRIMARY KEY,
                  project TEXT NOT NULL,
                  session_id TEXT,
                  category TEXT NOT NULL DEFAULT 'web',
                  target TEXT NOT NULL,
                  objective TEXT NOT NULL DEFAULT '',
                  profile TEXT NOT NULL DEFAULT 'balanced',
                  status TEXT NOT NULL DEFAULT 'draft',
                  metadata_json TEXT NOT NULL DEFAULT '{}',
                  created_utc TEXT NOT NULL,
                  updated_utc TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_playbooks_project ON playbooks(project);
                CREATE INDEX IF NOT EXISTS idx_playbooks_status ON playbooks(status);
                CREATE INDEX IF NOT EXISTS idx_playbooks_project_status ON playbooks(project, status);

                CREATE TABLE IF NOT EXISTS playbook_stages (
                  stage_id TEXT PRIMARY KEY,
                  playbook_id TEXT NOT NULL,
                  project TEXT NOT NULL,
                  stage_order INTEGER NOT NULL DEFAULT 0,
                  stage_key TEXT NOT NULL,
                  title TEXT NOT NULL,
                  status TEXT NOT NULL DEFAULT 'pending',
                  rationale TEXT NOT NULL DEFAULT '',
                  commands_json TEXT NOT NULL DEFAULT '[]',
                  output_expectations_json TEXT NOT NULL DEFAULT '[]',
                  linked_job_ids_json TEXT NOT NULL DEFAULT '[]',
                  reviewer TEXT NOT NULL DEFAULT '',
                  reviewed_utc TEXT,
                  created_utc TEXT NOT NULL,
                  updated_utc TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_playbook_stages_playbook ON playbook_stages(playbook_id);
                CREATE INDEX IF NOT EXISTS idx_playbook_stages_project ON playbook_stages(project);
                CREATE INDEX IF NOT EXISTS idx_playbook_stages_status ON playbook_stages(status);
                CREATE INDEX IF NOT EXISTS idx_playbook_stages_order ON playbook_stages(playbook_id, stage_order);

                CREATE TABLE IF NOT EXISTS engagement_metrics (
                  metric_id TEXT PRIMARY KEY,
                  project TEXT NOT NULL,
                  playbook_id TEXT,
                  session_id TEXT,
                  metric_date TEXT NOT NULL,
                  metric_name TEXT NOT NULL,
                  metric_value REAL NOT NULL,
                  unit TEXT NOT NULL DEFAULT '',
                  notes TEXT NOT NULL DEFAULT '',
                  tags_json TEXT NOT NULL DEFAULT '[]',
                  created_utc TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_engagement_metrics_project ON engagement_metrics(project);
                CREATE INDEX IF NOT EXISTS idx_engagement_metrics_playbook ON engagement_metrics(playbook_id);
                CREATE INDEX IF NOT EXISTS idx_engagement_metrics_name ON engagement_metrics(metric_name);
                """
            )

            # Migration safety for repositories with earlier schema versions.
            _ensure_column(cur.connection, "facts", "status", "TEXT NOT NULL DEFAULT 'pending'")
            _ensure_column(cur.connection, "facts", "reviewer", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(cur.connection, "facts", "reviewed_utc", "TEXT")
            _ensure_column(cur.connection, "facts", "fact_kind", "TEXT NOT NULL DEFAULT 'entity'")
            _ensure_column(cur.connection, "facts", "entity_type", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(cur.connection, "facts", "subject_type", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(cur.connection, "facts", "subject_value", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(cur.connection, "facts", "relation", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(cur.connection, "facts", "object_type", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(cur.connection, "facts", "object_value", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(cur.connection, "facts", "details_json", "TEXT NOT NULL DEFAULT '{}' ")

            # Index creation that depends on migration-added columns must run
            # after _ensure_column() for backward compatibility.
            cur.execute("CREATE INDEX IF NOT EXISTS idx_facts_project ON facts(project)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_facts_session ON facts(session_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_facts_status ON facts(status)")

            con.commit()
        finally:
            con.close()


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    out = dict(row)
    for key in (
        "context_json",
        "command_json",
        "facts_json",
        "evidence_json",
        "metadata_json",
        "commands_json",
        "output_expectations_json",
        "linked_job_ids_json",
        "tags_json",
        "details_json",
    ):
        if key in out and isinstance(out[key], str):
            try:
                out[key] = json.loads(out[key])
            except Exception:
                pass
    return out


def _rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [x for x in (_row_to_dict(r) for r in rows) if x is not None]


def upsert_session(payload: dict[str, Any]) -> None:
    init_db()
    with _LOCK:
        con = _conn()
        try:
            now = _now()
            con.execute(
                """
                INSERT INTO sessions(
                  session_id, project, operator, status, started_utc, ended_utc, summary, context_json, created_utc, updated_utc
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                  project=excluded.project,
                  operator=excluded.operator,
                  status=excluded.status,
                  started_utc=excluded.started_utc,
                  ended_utc=excluded.ended_utc,
                  summary=excluded.summary,
                  context_json=excluded.context_json,
                  updated_utc=excluded.updated_utc
                """,
                (
                    payload.get("session_id"),
                    payload.get("project", "default"),
                    payload.get("operator", "unknown"),
                    payload.get("status", "active"),
                    payload.get("started_utc", now),
                    payload.get("ended_utc"),
                    payload.get("summary", ""),
                    json.dumps(payload.get("context", {}), ensure_ascii=True),
                    now,
                    now,
                ),
            )
            con.commit()
        finally:
            con.close()


def create_job(
    *,
    project: str,
    session_id: str | None,
    purpose: str,
    profile: str,
    target: str,
    plan_id: str,
    cmd: list[str],
    timeout_sec: int,
) -> dict[str, Any]:
    init_db()
    job_id = uuid.uuid4().hex
    now = _now()
    with _LOCK:
        con = _conn()
        try:
            con.execute(
                """
                INSERT INTO jobs(
                  job_id, project, session_id, status, purpose, profile, target, plan_id, command_json, timeout_sec,
                  created_utc, updated_utc
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    project,
                    session_id,
                    "pending",
                    purpose,
                    profile,
                    target,
                    plan_id,
                    json.dumps(cmd, ensure_ascii=True),
                    timeout_sec,
                    now,
                    now,
                ),
            )
            con.commit()
        finally:
            con.close()
    return get_job(job_id) or {}


def get_job(job_id: str) -> dict[str, Any] | None:
    init_db()
    con = _conn()
    try:
        row = con.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        return _row_to_dict(row)
    finally:
        con.close()


def list_jobs(
    project: str,
    status: str | None = None,
    limit: int = 200,
    session_id: str | None = None,
    purpose: str | None = None,
) -> list[dict[str, Any]]:
    init_db()
    con = _conn()
    try:
        clauses = ["project = ?"]
        values: list[Any] = [project]
        if status:
            clauses.append("status = ?")
            values.append(status)
        if session_id:
            clauses.append("session_id = ?")
            values.append(session_id)
        if purpose:
            clauses.append("purpose = ?")
            values.append(purpose)

        values.append(max(1, min(limit, 2000)))
        sql = f"SELECT * FROM jobs WHERE {' AND '.join(clauses)} ORDER BY created_utc DESC LIMIT ?"
        rows = con.execute(sql, tuple(values)).fetchall()
        return _rows_to_dicts(rows)
    finally:
        con.close()


def confirm_job(job_id: str) -> dict[str, Any] | None:
    init_db()
    with _LOCK:
        con = _conn()
        try:
            now = _now()
            con.execute(
                """
                UPDATE jobs
                SET status = 'queued', updated_utc = ?
                WHERE job_id = ? AND status = 'pending'
                """,
                (now, job_id),
            )
            con.commit()
        finally:
            con.close()
    return get_job(job_id)


def cancel_job(job_id: str) -> dict[str, Any] | None:
    init_db()
    with _LOCK:
        con = _conn()
        try:
            now = _now()
            con.execute(
                """
                UPDATE jobs
                SET status = 'cancelled', updated_utc = ?, ended_utc = ?
                WHERE job_id = ? AND status IN ('pending', 'queued')
                """,
                (now, now, job_id),
            )
            con.commit()
        finally:
            con.close()
    return get_job(job_id)


def claim_next_queued_job() -> dict[str, Any] | None:
    init_db()
    with _LOCK:
        con = _conn()
        try:
            con.execute("BEGIN IMMEDIATE")
            row = con.execute(
                """
                SELECT * FROM jobs
                WHERE status = 'queued'
                ORDER BY created_utc ASC
                LIMIT 1
                """
            ).fetchone()
            if row is None:
                con.rollback()
                return None

            job_id = str(row["job_id"])
            now = _now()
            con.execute(
                """
                UPDATE jobs
                SET status = 'running', started_utc = ?, updated_utc = ?
                WHERE job_id = ?
                """,
                (now, now, job_id),
            )
            con.commit()
        finally:
            con.close()
    return get_job(job_id)


def complete_job(
    *,
    job_id: str,
    status: str,
    stdout_path: str,
    stderr_path: str,
    returncode: int | None,
    error: str = "",
) -> dict[str, Any] | None:
    init_db()
    with _LOCK:
        con = _conn()
        try:
            now = _now()
            con.execute(
                """
                UPDATE jobs
                SET status = ?, stdout_path = ?, stderr_path = ?, returncode = ?, error = ?, ended_utc = ?, updated_utc = ?
                WHERE job_id = ?
                """,
                (status, stdout_path, stderr_path, returncode, error, now, now, job_id),
            )
            con.commit()
        finally:
            con.close()
    return get_job(job_id)


_PLAYBOOK_STAGE_STATUSES = {"pending", "approved", "queued", "running", "completed", "failed", "rejected"}


def _normalize_stage_status(value: str) -> str:
    status = str(value or "pending").strip().lower()
    if status in _PLAYBOOK_STAGE_STATUSES:
        return status
    return "pending"


def _normalize_stage_commands(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []

    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue

        raw_cmd = item.get("cmd", [])
        cmd: list[str] = []
        if isinstance(raw_cmd, list):
            cmd = [str(x).strip() for x in raw_cmd if str(x).strip()]
        elif isinstance(raw_cmd, str):
            cmd = [x for x in raw_cmd.strip().split(" ") if x]
        if not cmd:
            continue

        timeout_sec = int(item.get("timeout_sec", 120))
        timeout_sec = max(1, min(timeout_sec, 3600))
        out.append(
            {
                "title": str(item.get("title", "Command")).strip(),
                "cmd": cmd,
                "timeout_sec": timeout_sec,
                "purpose": str(item.get("purpose", "")).strip().lower(),
                "target": str(item.get("target", "")).strip(),
                "profile": str(item.get("profile", "")).strip().lower(),
                "risk": str(item.get("risk", "medium")).strip().lower(),
                "rationale": str(item.get("rationale", "")).strip(),
            }
        )
    return out


def _normalize_stage_expectations(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(x).strip() for x in raw if str(x).strip()]


def create_playbook(
    *,
    project: str,
    target: str,
    category: str = "web",
    objective: str = "",
    profile: str = "balanced",
    session_id: str | None = None,
    stages: list[dict[str, Any]] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    init_db()
    playbook_id = uuid.uuid4().hex
    now = _now()

    stage_rows: list[dict[str, Any]] = []
    for idx, raw in enumerate(stages or []):
        if not isinstance(raw, dict):
            continue
        stage_rows.append(
            {
                "stage_id": uuid.uuid4().hex,
                "stage_order": idx + 1,
                "stage_key": (
                    str(raw.get("stage_key") or raw.get("key") or f"stage-{idx + 1}").strip()
                    or f"stage-{idx + 1}"
                ),
                "title": str(raw.get("title") or f"Stage {idx + 1}").strip(),
                "status": _normalize_stage_status(str(raw.get("status", "pending"))),
                "rationale": str(raw.get("rationale", "")).strip(),
                "commands_json": _normalize_stage_commands(raw.get("commands", [])),
                "output_expectations_json": _normalize_stage_expectations(
                    raw.get("output_expectations", [])
                ),
                "linked_job_ids_json": [],
            }
        )

    with _LOCK:
        con = _conn()
        try:
            con.execute(
                """
                INSERT INTO playbooks(
                  playbook_id, project, session_id, category, target, objective, profile, status,
                  metadata_json, created_utc, updated_utc
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    playbook_id,
                    project,
                    session_id,
                    category.strip().lower() or "web",
                    target.strip(),
                    objective.strip(),
                    profile.strip().lower() or "balanced",
                    "draft",
                    json.dumps(metadata or {}, ensure_ascii=True),
                    now,
                    now,
                ),
            )
            for row in stage_rows:
                con.execute(
                    """
                    INSERT INTO playbook_stages(
                      stage_id, playbook_id, project, stage_order, stage_key, title, status, rationale,
                      commands_json, output_expectations_json, linked_job_ids_json,
                      reviewer, reviewed_utc, created_utc, updated_utc
                    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, ?, ?)
                    """,
                    (
                        row["stage_id"],
                        playbook_id,
                        project,
                        row["stage_order"],
                        row["stage_key"],
                        row["title"],
                        row["status"],
                        row["rationale"],
                        json.dumps(row["commands_json"], ensure_ascii=True),
                        json.dumps(row["output_expectations_json"], ensure_ascii=True),
                        json.dumps(row["linked_job_ids_json"], ensure_ascii=True),
                        now,
                        now,
                    ),
                )
            con.commit()
        finally:
            con.close()
    return get_playbook(playbook_id) or {}


def get_playbook_stage(playbook_id: str, stage_id: str) -> dict[str, Any] | None:
    init_db()
    con = _conn()
    try:
        row = con.execute(
            "SELECT * FROM playbook_stages WHERE playbook_id = ? AND stage_id = ?",
            (playbook_id, stage_id),
        ).fetchone()
        return _row_to_dict(row)
    finally:
        con.close()


def list_playbook_stages(playbook_id: str) -> list[dict[str, Any]]:
    init_db()
    con = _conn()
    try:
        rows = con.execute(
            "SELECT * FROM playbook_stages WHERE playbook_id = ? ORDER BY stage_order ASC, created_utc ASC",
            (playbook_id,),
        ).fetchall()
        return _rows_to_dicts(rows)
    finally:
        con.close()


def _playbook_status_rollup(stages: list[dict[str, Any]], default: str) -> str:
    if not stages:
        return default
    statuses = [str(x.get("status", "pending")).strip().lower() for x in stages]
    if any(s in {"rejected", "failed"} for s in statuses):
        return "needs_review"
    if all(s == "completed" for s in statuses):
        return "completed"
    if any(s in {"approved", "queued", "running", "completed"} for s in statuses):
        return "in_progress"
    return "draft"


def get_playbook(playbook_id: str) -> dict[str, Any] | None:
    init_db()
    con = _conn()
    try:
        row = con.execute("SELECT * FROM playbooks WHERE playbook_id = ?", (playbook_id,)).fetchone()
        item = _row_to_dict(row)
        if item is None:
            return None
    finally:
        con.close()

    stages = list_playbook_stages(playbook_id)
    for stage in stages:
        linked_job_ids = stage.get("linked_job_ids_json", [])
        if not isinstance(linked_job_ids, list) or not linked_job_ids:
            continue
        jobs = [get_job(str(job_id)) for job_id in linked_job_ids]
        jobs = [j for j in jobs if isinstance(j, dict)]
        statuses = [str(j.get("status", "")).strip().lower() for j in jobs]
        stage["jobs"] = jobs
        stage["job_statuses"] = statuses
        if statuses and all(s == "completed" for s in statuses):
            stage["status"] = "completed"
        elif any(s in {"failed", "cancelled"} for s in statuses):
            stage["status"] = "failed"
        elif any(s == "running" for s in statuses):
            stage["status"] = "running"
        elif statuses and all(s in {"queued", "pending"} for s in statuses):
            stage["status"] = "queued"

    counts: dict[str, int] = {}
    for stage in stages:
        status = str(stage.get("status", "pending")).strip().lower()
        counts[status] = counts.get(status, 0) + 1

    item["stages"] = stages
    item["stage_stats"] = {"total": len(stages), "by_status": counts}
    item["status"] = _playbook_status_rollup(stages, default=str(item.get("status", "draft")))
    return item


def list_playbooks(project: str, status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    init_db()
    con = _conn()
    try:
        clauses = ["project = ?"]
        values: list[Any] = [project]
        if status:
            clauses.append("status = ?")
            values.append(status.strip().lower())
        values.append(max(1, min(limit, 1000)))
        rows = con.execute(
            f"SELECT * FROM playbooks WHERE {' AND '.join(clauses)} ORDER BY created_utc DESC LIMIT ?",
            tuple(values),
        ).fetchall()
    finally:
        con.close()
    return [x for x in (get_playbook(str(row["playbook_id"])) for row in rows) if x is not None]


def _update_playbook_status(playbook_id: str, status: str) -> None:
    with _LOCK:
        con = _conn()
        try:
            con.execute(
                "UPDATE playbooks SET status = ?, updated_utc = ? WHERE playbook_id = ?",
                (status, _now(), playbook_id),
            )
            con.commit()
        finally:
            con.close()


def approve_playbook_stage(
    *,
    playbook_id: str,
    stage_id: str,
    reviewer: str = "operator",
    auto_confirm: bool = True,
) -> dict[str, Any] | None:
    stage = get_playbook_stage(playbook_id, stage_id)
    playbook = get_playbook(playbook_id)
    if stage is None or playbook is None:
        return None

    commands = _normalize_stage_commands(stage.get("commands_json", []))
    linked_job_ids: list[str] = []
    job_rows: list[dict[str, Any]] = []

    for cmd in commands:
        timeout_sec = int(cmd.get("timeout_sec", 120))
        item = create_job(
            project=str(playbook.get("project", "default")),
            session_id=playbook.get("session_id"),
            purpose=str(cmd.get("purpose") or f"playbook:{stage.get('stage_key', 'stage')}"),
            profile=str(cmd.get("profile") or playbook.get("profile", "balanced")),
            target=str(cmd.get("target") or playbook.get("target", "")),
            plan_id=playbook_id,
            cmd=cmd.get("cmd", []),
            timeout_sec=timeout_sec,
        )
        if not isinstance(item, dict):
            continue
        job_id = str(item.get("job_id", "")).strip()
        if not job_id:
            continue
        linked_job_ids.append(job_id)
        if auto_confirm:
            item = confirm_job(job_id) or item
        job_rows.append(item)

    stage_status = "completed"
    if commands and auto_confirm:
        stage_status = "queued"
    elif commands:
        stage_status = "approved"

    with _LOCK:
        con = _conn()
        try:
            reviewed_utc = _now()
            con.execute(
                """
                UPDATE playbook_stages
                SET status = ?, reviewer = ?, reviewed_utc = ?, linked_job_ids_json = ?, updated_utc = ?
                WHERE playbook_id = ? AND stage_id = ?
                """,
                (
                    stage_status,
                    reviewer,
                    reviewed_utc,
                    json.dumps(linked_job_ids, ensure_ascii=True),
                    reviewed_utc,
                    playbook_id,
                    stage_id,
                ),
            )
            con.commit()
        finally:
            con.close()

    _update_playbook_status(playbook_id, "in_progress")
    updated = get_playbook_stage(playbook_id, stage_id)
    if updated is None:
        return None
    updated["jobs"] = job_rows
    return updated


def reject_playbook_stage(
    *,
    playbook_id: str,
    stage_id: str,
    reviewer: str = "operator",
    reason: str = "",
) -> dict[str, Any] | None:
    init_db()
    with _LOCK:
        con = _conn()
        try:
            row = con.execute(
                "SELECT * FROM playbook_stages WHERE playbook_id = ? AND stage_id = ?",
                (playbook_id, stage_id),
            ).fetchone()
            if row is None:
                return None
            item = _row_to_dict(row) or {}
            rationale = str(item.get("rationale", "")).strip()
            if reason.strip():
                if rationale:
                    rationale = f"{rationale}\nreview: {reason.strip()}"
                else:
                    rationale = f"review: {reason.strip()}"
            reviewed_utc = _now()
            con.execute(
                """
                UPDATE playbook_stages
                SET status = 'rejected', reviewer = ?, reviewed_utc = ?, rationale = ?, updated_utc = ?
                WHERE playbook_id = ? AND stage_id = ?
                """,
                (reviewer, reviewed_utc, rationale, reviewed_utc, playbook_id, stage_id),
            )
            con.commit()
        finally:
            con.close()

    _update_playbook_status(playbook_id, "needs_review")
    return get_playbook_stage(playbook_id, stage_id)


def record_engagement_metric(
    *,
    project: str,
    metric_name: str,
    metric_value: float,
    playbook_id: str | None = None,
    session_id: str | None = None,
    metric_date: str = "",
    unit: str = "",
    notes: str = "",
    tags: list[str] | None = None,
) -> dict[str, Any]:
    init_db()
    metric_id = uuid.uuid4().hex
    now = _now()
    date_value = metric_date.strip() or now[:10]
    with _LOCK:
        con = _conn()
        try:
            con.execute(
                """
                INSERT INTO engagement_metrics(
                  metric_id, project, playbook_id, session_id, metric_date, metric_name,
                  metric_value, unit, notes, tags_json, created_utc
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    metric_id,
                    project,
                    playbook_id,
                    session_id,
                    date_value,
                    metric_name.strip().lower(),
                    float(metric_value),
                    unit.strip(),
                    notes.strip(),
                    json.dumps(tags or [], ensure_ascii=True),
                    now,
                ),
            )
            con.commit()
        finally:
            con.close()
    con = _conn()
    try:
        row = con.execute("SELECT * FROM engagement_metrics WHERE metric_id = ?", (metric_id,)).fetchone()
        return _row_to_dict(row) or {}
    finally:
        con.close()


def list_engagement_metrics(
    project: str,
    *,
    playbook_id: str | None = None,
    metric_name: str | None = None,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    init_db()
    con = _conn()
    try:
        clauses = ["project = ?"]
        values: list[Any] = [project]
        if playbook_id:
            clauses.append("playbook_id = ?")
            values.append(playbook_id)
        if metric_name:
            clauses.append("metric_name = ?")
            values.append(metric_name.strip().lower())
        values.append(max(1, min(limit, 5000)))
        rows = con.execute(
            f"SELECT * FROM engagement_metrics WHERE {' AND '.join(clauses)}"
            " ORDER BY metric_date DESC, created_utc DESC LIMIT ?",
            tuple(values),
        ).fetchall()
        return _rows_to_dicts(rows)
    finally:
        con.close()


def profitability_summary(project: str) -> dict[str, Any]:
    rows = list_engagement_metrics(project, limit=5000)
    totals: dict[str, float] = {}
    for row in rows:
        name = str(row.get("metric_name", "")).strip().lower()
        value = float(row.get("metric_value", 0.0))
        totals[name] = totals.get(name, 0.0) + value

    revenue = sum(
        totals.get(k, 0.0)
        for k in ("revenue_usd", "revenue", "billed_usd", "cash_in_usd", "pilot_fee_usd")
    )
    cost = sum(totals.get(k, 0.0) for k in ("cost_usd", "cost", "expense_usd", "labor_cost_usd"))
    hours_saved = sum(
        totals.get(k, 0.0) for k in ("hours_saved", "hours_saved_est", "automation_hours_saved")
    )
    hourly_rate = totals.get("hourly_rate_usd", 0.0)
    manual_hours = sum(totals.get(k, 0.0) for k in ("manual_hours", "hours_manual"))
    automated_hours = sum(totals.get(k, 0.0) for k in ("automated_hours", "hours_automated"))
    leads = totals.get("leads", 0.0)
    won = totals.get("won_leads", 0.0)

    gross_profit = revenue - cost
    roi_pct: float | None = None
    if cost > 0:
        roi_pct = round((gross_profit / cost) * 100.0, 2)

    automation_ratio: float | None = None
    if manual_hours + automated_hours > 0:
        automation_ratio = round(automated_hours / (manual_hours + automated_hours), 4)

    conversion_rate: float | None = None
    if leads > 0:
        conversion_rate = round(won / leads, 4)

    estimated_saved_value = round(hours_saved * hourly_rate, 2) if hourly_rate > 0 else None

    return {
        "project": project,
        "metrics_count": len(rows),
        "window": {
            "from": rows[-1].get("metric_date", "") if rows else "",
            "to": rows[0].get("metric_date", "") if rows else "",
        },
        "totals": {k: round(v, 4) for k, v in sorted(totals.items())},
        "kpis": {
            "revenue_usd": round(revenue, 2),
            "cost_usd": round(cost, 2),
            "gross_profit_usd": round(gross_profit, 2),
            "roi_pct": roi_pct,
            "hours_saved": round(hours_saved, 2),
            "estimated_saved_value_usd": estimated_saved_value,
            "automation_ratio": automation_ratio,
            "lead_conversion_rate": conversion_rate,
        },
    }


def _normalize_fact(item: dict[str, Any]) -> dict[str, Any]:
    kind = str(item.get("fact_kind", "")).strip().lower()
    if kind not in {"entity", "relation"}:
        if item.get("relation") or item.get("object_type") or item.get("object_value"):
            kind = "relation"
        else:
            kind = "entity"

    status = str(item.get("status", "pending")).strip().lower()
    if status not in {"pending", "approved", "rejected"}:
        status = "pending"

    source = str(item.get("source", "job")).strip() or "job"
    key_name = str(item.get("key_name", "")).strip()
    value = str(item.get("value", "")).strip()

    entity_type = str(item.get("entity_type", "")).strip().lower()
    subject_type = str(item.get("subject_type", "")).strip().lower()
    subject_value = str(item.get("subject_value", "")).strip()
    relation = str(item.get("relation", "")).strip().lower()
    object_type = str(item.get("object_type", "")).strip().lower()
    object_value = str(item.get("object_value", "")).strip()

    if kind == "entity":
        if not subject_type:
            subject_type = entity_type or key_name or "fact"
        if not subject_value:
            subject_value = value
    else:
        if not key_name and relation:
            key_name = relation

    details = item.get("details", {})
    if not isinstance(details, dict):
        details = {"raw": str(details)}

    return {
        "project": item.get("project", "default"),
        "session_id": item.get("session_id"),
        "job_id": item.get("job_id"),
        "source": source,
        "key_name": key_name,
        "value": value,
        "confidence": float(item.get("confidence", 0.5)),
        "status": status,
        "fact_kind": kind,
        "entity_type": entity_type,
        "subject_type": subject_type,
        "subject_value": subject_value,
        "relation": relation,
        "object_type": object_type,
        "object_value": object_value,
        "details": details,
    }


def add_facts(rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    init_db()
    sync_rows: list[dict[str, Any]] = []
    with _LOCK:
        con = _conn()
        try:
            now = _now()
            for raw in rows:
                item = _normalize_fact(raw)
                fact_id = uuid.uuid4().hex
                con.execute(
                    """
                    INSERT INTO facts(
                      fact_id, project, session_id, job_id, source, key_name, value, confidence, created_utc,
                      status, reviewer, reviewed_utc, fact_kind, entity_type, subject_type, subject_value,
                      relation, object_type, object_value, details_json
                    )
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        fact_id,
                        item["project"],
                        item["session_id"],
                        item["job_id"],
                        item["source"],
                        item["key_name"],
                        item["value"],
                        item["confidence"],
                        now,
                        item["status"],
                        item["fact_kind"],
                        item["entity_type"],
                        item["subject_type"],
                        item["subject_value"],
                        item["relation"],
                        item["object_type"],
                        item["object_value"],
                        json.dumps(item["details"], ensure_ascii=True),
                    ),
                )
                sync_rows.append(
                    {
                        "fact_id": fact_id,
                        "created_utc": now,
                        **item,
                    }
                )
            con.commit()
        finally:
            con.close()

    try:
        from libs.graph_backend import sync_facts_to_graph

        sync_result = sync_facts_to_graph(sync_rows)
        logger.info(
            "facts synchronized to graph backend",
            extra={
                "event": "facts_graph_sync",
                "details": {
                    "requested": len(sync_rows),
                    "synced": int(sync_result.get("synced", 0)),
                    "backend": sync_result.get("backend", "sqlite"),
                },
            },
        )
    except Exception as exc:
        logger.warning(
            "graph backend sync skipped",
            extra={
                "event": "facts_graph_sync_skipped",
                "details": {"error": str(exc), "facts": len(sync_rows)},
            },
        )
    return len(rows)


def get_fact(fact_id: str) -> dict[str, Any] | None:
    init_db()
    con = _conn()
    try:
        row = con.execute("SELECT * FROM facts WHERE fact_id = ?", (fact_id,)).fetchone()
        return _row_to_dict(row)
    finally:
        con.close()


def list_facts(
    project: str,
    limit: int = 200,
    status: str | None = None,
    session_id: str | None = None,
) -> list[dict[str, Any]]:
    init_db()
    con = _conn()
    try:
        clauses = ["project = ?"]
        values: list[Any] = [project]
        if status:
            clauses.append("status = ?")
            values.append(status)
        if session_id:
            clauses.append("session_id = ?")
            values.append(session_id)

        values.append(max(1, min(limit, 2000)))
        sql = f"SELECT * FROM facts WHERE {' AND '.join(clauses)} ORDER BY created_utc DESC LIMIT ?"
        rows = con.execute(sql, tuple(values)).fetchall()
        return _rows_to_dicts(rows)
    finally:
        con.close()


def review_fact_status(fact_id: str, status: str, reviewer: str = "operator") -> dict[str, Any] | None:
    if status not in {"approved", "rejected", "pending"}:
        raise ValueError("invalid fact status")
    init_db()
    with _LOCK:
        con = _conn()
        try:
            reviewed_utc = _now() if status in {"approved", "rejected"} else None
            con.execute(
                """
                UPDATE facts
                SET status = ?, reviewer = ?, reviewed_utc = ?
                WHERE fact_id = ?
                """,
                (status, reviewer, reviewed_utc, fact_id),
            )
            con.commit()
        finally:
            con.close()
    return get_fact(fact_id)


def patch_fact(
    fact_id: str,
    *,
    confidence: float | None = None,
    key_name: str | None = None,
    value: str | None = None,
    subject_type: str | None = None,
    subject_value: str | None = None,
    relation: str | None = None,
    object_type: str | None = None,
    object_value: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    init_db()
    with _LOCK:
        con = _conn()
        try:
            row = con.execute("SELECT * FROM facts WHERE fact_id = ?", (fact_id,)).fetchone()
            if row is None:
                return None
            existing = _row_to_dict(row) or {}
            next_details = details if details is not None else existing.get("details_json", {})
            if not isinstance(next_details, dict):
                next_details = {"raw": str(next_details)}

            con.execute(
                """
                UPDATE facts
                SET confidence = ?, key_name = ?, value = ?, subject_type = ?, subject_value = ?, relation = ?,
                    object_type = ?, object_value = ?, details_json = ?
                WHERE fact_id = ?
                """,
                (
                    float(confidence if confidence is not None else existing.get("confidence", 0.5)),
                    key_name if key_name is not None else existing.get("key_name", ""),
                    value if value is not None else existing.get("value", ""),
                    subject_type if subject_type is not None else existing.get("subject_type", ""),
                    subject_value if subject_value is not None else existing.get("subject_value", ""),
                    relation if relation is not None else existing.get("relation", ""),
                    object_type if object_type is not None else existing.get("object_type", ""),
                    object_value if object_value is not None else existing.get("object_value", ""),
                    json.dumps(next_details, ensure_ascii=True),
                    fact_id,
                ),
            )
            con.commit()
        finally:
            con.close()
    return get_fact(fact_id)


def build_graph(
    project: str,
    *,
    session_id: str | None = None,
    include_pending: bool = False,
    limit: int = 5000,
) -> dict[str, Any]:
    statuses = None if include_pending else "approved"
    facts = list_facts(project=project, limit=limit, status=statuses, session_id=session_id)

    node_map: dict[str, dict[str, Any]] = {}
    edge_map: dict[str, dict[str, Any]] = {}

    def _add_node(kind: str, value: str, meta: dict[str, Any] | None = None) -> str:
        k = kind.strip().lower() or "unknown"
        v = value.strip()
        if not v:
            return ""
        node_id = f"{k}:{v}"
        if node_id not in node_map:
            node_map[node_id] = {
                "id": node_id,
                "label": v,
                "kind": k,
                "meta": meta or {},
            }
        return node_id

    for f in facts:
        kind = str(f.get("fact_kind", "entity")).lower()
        conf = float(f.get("confidence", 0.5))
        meta = {
            "fact_id": f.get("fact_id"),
            "status": f.get("status"),
            "source": f.get("source"),
            "confidence": conf,
            "session_id": f.get("session_id"),
            "job_id": f.get("job_id"),
            "details": f.get("details_json", {}),
            "key_name": f.get("key_name", ""),
            "value": f.get("value", ""),
        }

        if kind == "relation":
            src = _add_node(str(f.get("subject_type", "")), str(f.get("subject_value", "")), meta)
            dst = _add_node(str(f.get("object_type", "")), str(f.get("object_value", "")), meta)
            rel = str(f.get("relation", "related_to")).strip().lower() or "related_to"
            if src and dst:
                edge_id = str(f.get("fact_id") or uuid.uuid4().hex)
                edge_map[edge_id] = {
                    "id": edge_id,
                    "source": src,
                    "target": dst,
                    "label": rel,
                    "meta": meta,
                }
            continue

        ent_type = str(f.get("entity_type", "")).strip().lower() or str(f.get("subject_type", "")).strip().lower() or "fact"
        ent_value = str(f.get("subject_value", "")).strip() or str(f.get("value", "")).strip()
        _add_node(ent_type, ent_value, meta)

    return {
        "project": project,
        "session_id": session_id,
        "include_pending": include_pending,
        "nodes": list(node_map.values()),
        "edges": list(edge_map.values()),
        "stats": {
            "nodes": len(node_map),
            "edges": len(edge_map),
            "facts": len(facts),
        },
    }


def create_finding(
    *,
    project: str,
    session_id: str | None,
    title: str,
    severity: str,
    status: str,
    description: str,
    facts: list[str] | None = None,
    evidence: list[str] | None = None,
) -> dict[str, Any]:
    init_db()
    finding_id = uuid.uuid4().hex
    now = _now()
    with _LOCK:
        con = _conn()
        try:
            con.execute(
                """
                INSERT INTO findings(
                  finding_id, project, session_id, title, severity, status, description,
                  facts_json, evidence_json, created_utc, updated_utc
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    finding_id,
                    project,
                    session_id,
                    title,
                    severity,
                    status,
                    description,
                    json.dumps(facts or [], ensure_ascii=True),
                    json.dumps(evidence or [], ensure_ascii=True),
                    now,
                    now,
                ),
            )
            con.commit()
        finally:
            con.close()
    return get_finding(finding_id) or {}


def get_finding(finding_id: str) -> dict[str, Any] | None:
    init_db()
    con = _conn()
    try:
        row = con.execute("SELECT * FROM findings WHERE finding_id = ?", (finding_id,)).fetchone()
        return _row_to_dict(row)
    finally:
        con.close()


def list_findings(
    project: str,
    limit: int = 300,
    session_id: str | None = None,
) -> list[dict[str, Any]]:
    init_db()
    con = _conn()
    try:
        clauses = ["project = ?"]
        values: list[Any] = [project]
        if session_id:
            clauses.append("session_id = ?")
            values.append(session_id)
        values.append(max(1, min(limit, 2000)))

        sql = f"SELECT * FROM findings WHERE {' AND '.join(clauses)} ORDER BY created_utc DESC LIMIT ?"
        rows = con.execute(sql, tuple(values)).fetchall()
        return _rows_to_dicts(rows)
    finally:
        con.close()


def update_finding(
    finding_id: str,
    *,
    status: str | None = None,
    severity: str | None = None,
    description: str | None = None,
    evidence: list[str] | None = None,
) -> dict[str, Any] | None:
    init_db()
    with _LOCK:
        con = _conn()
        try:
            row = con.execute("SELECT * FROM findings WHERE finding_id = ?", (finding_id,)).fetchone()
            if row is None:
                return None
            existing = dict(row)
            next_status = status if status is not None else existing["status"]
            next_severity = severity if severity is not None else existing["severity"]
            next_description = description if description is not None else existing["description"]
            next_evidence = evidence
            if next_evidence is None:
                try:
                    next_evidence = json.loads(existing.get("evidence_json", "[]"))
                except Exception:
                    next_evidence = []
            con.execute(
                """
                UPDATE findings
                SET status = ?, severity = ?, description = ?, evidence_json = ?, updated_utc = ?
                WHERE finding_id = ?
                """,
                (
                    next_status,
                    next_severity,
                    next_description,
                    json.dumps(next_evidence or [], ensure_ascii=True),
                    _now(),
                    finding_id,
                ),
            )
            con.commit()
        finally:
            con.close()
    return get_finding(finding_id)


def add_evidence(
    *,
    project: str,
    session_id: str | None,
    finding_id: str | None,
    report_section: str,
    file_path: str,
    file_name: str,
    mime_type: str,
    sha256: str,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    init_db()
    evidence_id = uuid.uuid4().hex
    now = _now()
    with _LOCK:
        con = _conn()
        try:
            con.execute(
                """
                INSERT INTO evidence(
                  evidence_id, project, session_id, finding_id, report_section,
                  file_path, file_name, mime_type, sha256, tags_json, created_utc, linked_utc
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    evidence_id,
                    project,
                    session_id,
                    finding_id,
                    report_section,
                    file_path,
                    file_name,
                    mime_type,
                    sha256,
                    json.dumps(tags or [], ensure_ascii=True),
                    now,
                    now if finding_id or report_section else None,
                ),
            )
            con.commit()
        finally:
            con.close()
    return get_evidence(evidence_id) or {}


def get_evidence(evidence_id: str) -> dict[str, Any] | None:
    init_db()
    con = _conn()
    try:
        row = con.execute("SELECT * FROM evidence WHERE evidence_id = ?", (evidence_id,)).fetchone()
        return _row_to_dict(row)
    finally:
        con.close()


def list_evidence(
    project: str,
    limit: int = 300,
    session_id: str | None = None,
) -> list[dict[str, Any]]:
    init_db()
    con = _conn()
    try:
        clauses = ["project = ?"]
        values: list[Any] = [project]
        if session_id:
            clauses.append("session_id = ?")
            values.append(session_id)
        values.append(max(1, min(limit, 2000)))
        sql = f"SELECT * FROM evidence WHERE {' AND '.join(clauses)} ORDER BY created_utc DESC LIMIT ?"
        rows = con.execute(sql, tuple(values)).fetchall()
        return _rows_to_dicts(rows)
    finally:
        con.close()


def link_evidence(
    evidence_id: str,
    *,
    finding_id: str | None,
    report_section: str | None,
) -> dict[str, Any] | None:
    init_db()
    with _LOCK:
        con = _conn()
        try:
            row = con.execute("SELECT * FROM evidence WHERE evidence_id = ?", (evidence_id,)).fetchone()
            if row is None:
                return None
            existing = dict(row)
            next_finding = finding_id if finding_id is not None else existing.get("finding_id")
            next_section = report_section if report_section is not None else existing.get("report_section", "")
            linked_utc = _now() if next_finding or next_section else None
            con.execute(
                """
                UPDATE evidence
                SET finding_id = ?, report_section = ?, linked_utc = ?
                WHERE evidence_id = ?
                """,
                (next_finding, next_section, linked_utc, evidence_id),
            )
            con.commit()
        finally:
            con.close()
    return get_evidence(evidence_id)


def project_sessions(
    project: str,
    limit: int = 100,
    *,
    status: str | None = None,
    operator: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    init_db()
    con = _conn()
    try:
        clauses = ["project = ?"]
        values: list[Any] = [project]
        if status:
            clauses.append("status = ?")
            values.append(status)
        if operator:
            clauses.append("operator = ?")
            values.append(operator)
        if q:
            clauses.append("(session_id LIKE ? OR summary LIKE ?)")
            values.extend([f"%{q}%", f"%{q}%"])
        values.append(max(1, min(limit, 1000)))
        sql = f"SELECT * FROM sessions WHERE {' AND '.join(clauses)} ORDER BY started_utc DESC LIMIT ?"
        rows = con.execute(sql, tuple(values)).fetchall()
        return _rows_to_dicts(rows)
    finally:
        con.close()


def get_session(session_id: str) -> dict[str, Any] | None:
    init_db()
    con = _conn()
    try:
        row = con.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
        return _row_to_dict(row)
    finally:
        con.close()


def session_timeline(session_id: str) -> list[dict[str, Any]]:
    init_db()
    con = _conn()
    try:
        events: list[dict[str, Any]] = []

        session_row = con.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
        if session_row:
            s = _row_to_dict(session_row) or {}
            events.append(
                {
                    "type": "session",
                    "timestamp": s.get("started_utc", ""),
                    "title": f"Session started ({s.get('project', 'default')})",
                    "data": s,
                }
            )
            if s.get("ended_utc"):
                events.append(
                    {
                        "type": "session",
                        "timestamp": s.get("ended_utc", ""),
                        "title": "Session ended",
                        "data": s,
                    }
                )

        for table, kind, title_key in (
            ("jobs", "job", "status"),
            ("findings", "finding", "title"),
            ("evidence", "evidence", "file_name"),
            ("facts", "fact", "key_name"),
            ("playbooks", "playbook", "target"),
            ("engagement_metrics", "metric", "metric_name"),
        ):
            rows = con.execute(
                f"SELECT * FROM {table} WHERE session_id = ? ORDER BY created_utc ASC", (session_id,)
            ).fetchall()
            for row in rows:
                payload = _row_to_dict(row) or {}
                t = str(payload.get(title_key, kind)).strip() or kind
                events.append(
                    {
                        "type": kind,
                        "timestamp": payload.get("created_utc", ""),
                        "title": f"{kind.title()}: {t}",
                        "data": payload,
                    }
                )

        events.sort(key=lambda item: str(item.get("timestamp", "")))
        return events
    finally:
        con.close()
