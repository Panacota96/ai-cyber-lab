from __future__ import annotations

import re
from datetime import datetime, timezone

from libs.docs.md_writer import write_project_note
from libs.logs import get_logger
from libs.memory.qdrant_client import MemoryClient
from libs.memory.rag import index_markdown_folder

logger = get_logger(__name__)

STORE_RE = re.compile(r"^store\s*:\s*(.+)$", re.IGNORECASE | re.DOTALL)
INDEX_RE = re.compile(r"^index\s*:\s*(.+)$", re.IGNORECASE)


def handle_knowledge(user_input: str, project: str) -> str:
    logger.info(
        "knowledge agent started",
        extra={"event": "knowledge_start", "details": {"project": project}},
    )
    text = user_input.strip()
    try:
        client = MemoryClient()
    except Exception as exc:
        payload = {
            "title": "Knowledge Service Unavailable",
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "query": text,
            "error": str(exc),
            "next_steps": [
                "Start Qdrant: cd infra && docker compose up -d qdrant",
                "Confirm AICL_QDRANT_URL points to a reachable endpoint.",
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
        count = index_markdown_folder(folder, source=project, tags=["indexed", project])
        payload = {
            "title": "Knowledge Index",
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
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
        rec_id = client.upsert_text(note, metadata={"source": project, "tags": ["manual", project]})
        payload = {
            "title": "Knowledge Store",
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "record_id": rec_id,
            "stored_text": note,
        }
        paths = write_project_note(project, "knowledge", payload)
        logger.info(
            "knowledge store completed",
            extra={"event": "knowledge_store_done", "details": {"record_id": rec_id}},
        )
        return f"Stored knowledge record {rec_id}. Note: {paths['md']}"

    hits = client.search_text(text, limit=5)
    formatted = []
    for hit in hits:
        payload = hit.payload
        formatted.append(
            f"score={hit.score:.4f} source={payload.get('source', 'unknown')} "
            f"text={str(payload.get('text', ''))[:120]}"
        )

    payload = {
        "title": "Knowledge Retrieve",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "query": text,
        "results": formatted,
    }
    paths = write_project_note(project, "knowledge", payload)
    logger.info(
        "knowledge retrieval completed",
        extra={"event": "knowledge_retrieve_done", "details": {"hits": len(formatted)}},
    )
    return f"Top knowledge hits:\n- " + "\n- ".join(formatted or ["No matches found"]) + f"\nSaved: {paths['md']}"
