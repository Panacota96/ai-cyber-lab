from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from pathlib import Path

from apps.orchestrator.config import data_root
from libs.circuit import CircuitBreaker
from libs.docs.md_writer import write_project_note
from libs.logs import get_logger
from libs.memory.qdrant_client import MemoryClient
from libs.memory.rag import index_markdown_folder

logger = get_logger(__name__)

STORE_RE = re.compile(r"^store\s*:\s*(.+)$", re.IGNORECASE | re.DOTALL)
INDEX_RE = re.compile(r"^index\s*:\s*(.+)$", re.IGNORECASE)
_knowledge_breaker = CircuitBreaker(name="knowledge", failure_threshold=3, reset_timeout_s=30.0)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _with_retry(fn, attempts: int = 3, delay_s: float = 0.6):
    if not _knowledge_breaker.allow():
        logger.warning(
            "knowledge circuit open",
            extra={
                "event": "knowledge_circuit_open",
                "details": _knowledge_breaker.snapshot(),
                "component": "knowledge",
                "operation": "retry_gate",
            },
        )
        raise RuntimeError("knowledge circuit open; skipping downstream calls temporarily")

    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            result = fn()
            _knowledge_breaker.record_success()
            if attempt > 1:
                logger.info(
                    "knowledge retry recovered",
                    extra={
                        "event": "knowledge_retry_recovered",
                        "details": {"attempt": attempt},
                        "component": "knowledge",
                        "operation": "retry",
                    },
                )
            return result
        except Exception as exc:
            last_exc = exc
            _knowledge_breaker.record_failure()
            logger.warning(
                "knowledge retry attempt failed",
                extra={
                    "event": "knowledge_retry_failed",
                    "details": {"attempt": attempt, "error": str(exc), "circuit": _knowledge_breaker.snapshot()},
                    "component": "knowledge",
                    "operation": "retry",
                },
            )
            if attempt < attempts:
                sleep_for = delay_s * (2 ** (attempt - 1))
                time.sleep(sleep_for)
    raise last_exc


def _default_index_folder(project: str) -> str:
    return str((data_root() / "projects" / project).resolve())


def handle_knowledge(user_input: str, project: str) -> str:
    logger.info(
        "knowledge agent started",
        extra={"event": "knowledge_start", "details": {"project": project}},
    )
    text = user_input.strip()

    try:
        client = _with_retry(lambda: MemoryClient(), attempts=3)
    except Exception as exc:
        payload = {
            "title": "Knowledge Service Unavailable",
            "timestamp_utc": _now(),
            "query": text,
            "error": str(exc),
            "next_steps": [
                "Start Qdrant: cd infra && docker compose up -d qdrant",
                "Confirm AICL_QDRANT_URL points to a reachable endpoint.",
                "Retry after 3-attempt backoff window.",
            ],
        }
        paths = write_project_note(project, "knowledge", payload)
        logger.warning(
            "knowledge backend unavailable",
            extra={"event": "knowledge_unavailable", "details": {"error": str(exc)}},
        )
        return f"Knowledge backend unavailable. Note saved: {paths['md']}"

    index_match = INDEX_RE.match(text)
    if index_match:
        folder = index_match.group(1).strip()
        if folder.lower() in {"project", "current", "."}:
            folder = _default_index_folder(project)

        count = _with_retry(lambda: index_markdown_folder(folder, source=project, tags=["indexed", project]))
        payload = {
            "title": "Knowledge Index",
            "timestamp_utc": _now(),
            "folder": folder,
            "chunks_indexed": count,
        }
        paths = write_project_note(project, "knowledge", payload)
        logger.info(
            "knowledge index completed",
            extra={"event": "knowledge_index_done", "details": {"folder": folder, "chunks": count}},
        )
        return f"Indexed {count} chunks from {folder}. Note: {paths['md']}"

    store_match = STORE_RE.match(text)
    if store_match:
        note = store_match.group(1).strip()
        rec_id = _with_retry(
            lambda: client.upsert_text(
                note,
                metadata={
                    "source": project,
                    "project": project,
                    "tags": ["manual", project],
                    "confidence": "verified-lab",
                },
            )
        )
        payload = {
            "title": "Knowledge Store",
            "timestamp_utc": _now(),
            "record_id": rec_id,
            "stored_text": note,
        }
        paths = write_project_note(project, "knowledge", payload)
        logger.info(
            "knowledge store completed",
            extra={"event": "knowledge_store_done", "details": {"record_id": rec_id}},
        )
        return f"Stored knowledge record {rec_id}. Note: {paths['md']}"

    hits = _with_retry(lambda: client.search_text(text, limit=5))
    formatted = []
    for hit in hits:
        payload = hit.payload
        formatted.append(
            f"score={hit.score:.4f} source={payload.get('source', 'unknown')} "
            f"text={str(payload.get('text', ''))[:120]}"
        )

    payload = {
        "title": "Knowledge Retrieve",
        "timestamp_utc": _now(),
        "query": text,
        "results": formatted,
    }
    paths = write_project_note(project, "knowledge", payload)
    logger.info(
        "knowledge retrieval completed",
        extra={"event": "knowledge_retrieve_done", "details": {"hits": len(formatted)}},
    )
    return f"Top knowledge hits:\n- " + "\n- ".join(formatted or ["No matches found"]) + f"\nSaved: {paths['md']}"


def knowledge_diagnostics() -> dict[str, object]:
    return {"circuit": _knowledge_breaker.snapshot()}
