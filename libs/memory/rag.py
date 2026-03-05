from __future__ import annotations

from pathlib import Path

from libs.logs import get_logger
from libs.memory.qdrant_client import MemoryClient

logger = get_logger(__name__)


def _chunk_text(text: str, chunk_size: int = 1200) -> list[str]:
    clean = text.strip()
    if not clean:
        return []

    paragraphs = [p.strip() for p in clean.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 2 <= chunk_size:
            current = f"{current}\n\n{para}".strip()
        else:
            if current:
                chunks.append(current)
            current = para
    if current:
        chunks.append(current)
    return chunks


def index_markdown_folder(folder: str, source: str, tags: list[str] | None = None) -> int:
    root = Path(folder)
    if not root.exists():
        logger.warning(
            "index folder not found",
            extra={"event": "rag_index_missing_folder", "details": {"folder": folder}},
        )
        return 0

    client = MemoryClient()
    inserted = 0

    for path in root.rglob("*.md"):
        content = path.read_text(encoding="utf-8", errors="ignore")
        for idx, chunk in enumerate(_chunk_text(content)):
            client.upsert_text(
                chunk,
                metadata={
                    "source": source,
                    "project": source,
                    "path": str(path),
                    "chunk": idx,
                    "tags": tags or [],
                    "confidence": "verified-lab",
                    "source_type": "markdown",
                },
            )
            inserted += 1

    logger.info(
        "rag indexing completed",
        extra={"event": "rag_index_done", "details": {"folder": folder, "chunks": inserted}},
    )
    return inserted


def retrieve_context(query: str, limit: int = 5) -> list[dict[str, str]]:
    client = MemoryClient()
    hits = client.search_text(query, limit=limit)
    results = []
    for hit in hits:
        payload = hit.payload
        results.append(
            {
                "score": f"{hit.score:.4f}",
                "source": str(payload.get("source", "unknown")),
                "path": str(payload.get("path", "")),
                "text": str(payload.get("text", ""))[:500],
            }
        )
    logger.info(
        "rag retrieval completed",
        extra={"event": "rag_retrieve_done", "details": {"limit": limit, "hits": len(results)}},
    )
    return results
