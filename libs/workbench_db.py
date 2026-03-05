from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.orchestrator.config import data_root

_LOCK = threading.Lock()


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
    with _LOCK:
        con = _conn()
        try:
            now = _now()
            for raw in rows:
                item = _normalize_fact(raw)
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
                        uuid.uuid4().hex,
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
            con.commit()
            return len(rows)
        finally:
            con.close()


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
