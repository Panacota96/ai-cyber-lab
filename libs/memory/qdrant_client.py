from __future__ import annotations

import hashlib
import math
import os
import re
import uuid
from dataclasses import dataclass
from typing import Any

import httpx
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, PointStruct, VectorParams

from apps.orchestrator.config import (
    ollama_embed_model,
    ollama_url,
    qdrant_collection,
    qdrant_url,
    vector_size,
)
from libs.logs import get_logger

logger = get_logger(__name__)


def _hash_embedding(text: str, size: int) -> list[float]:
    vector = [0.0] * size
    tokens = re.findall(r"[a-z0-9_]+", text.lower())
    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "big") % size
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[idx] += sign

    norm = math.sqrt(sum(x * x for x in vector))
    if norm > 0:
        vector = [x / norm for x in vector]
    return vector


def _ollama_embedding(text: str) -> list[float] | None:
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"{ollama_url().rstrip('/')}/api/embeddings",
                json={"model": ollama_embed_model(), "prompt": text},
            )
            response.raise_for_status()
            data = response.json()
            emb = data.get("embedding")
            if isinstance(emb, list) and emb:
                return [float(x) for x in emb]
    except Exception:
        logger.warning("ollama embedding unavailable", extra={"event": "embedding_fallback"})
        return None
    return None


@dataclass
class SearchHit:
    score: float
    payload: dict[str, Any]


class MemoryClient:
    def __init__(
        self,
        url: str | None = None,
        collection: str | None = None,
        size: int | None = None,
    ):
        self.url = url or qdrant_url()
        self.collection = collection or qdrant_collection()
        self.size = size or vector_size()
        self.client = QdrantClient(url=self.url)
        logger.info(
            "memory client initialized",
            extra={
                "event": "memory_init",
                "details": {"url": self.url, "collection": self.collection, "vector_size": self.size},
            },
        )
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        try:
            self.client.get_collection(self.collection)
        except Exception:
            logger.info(
                "creating qdrant collection",
                extra={"event": "memory_create_collection", "details": {"collection": self.collection}},
            )
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=self.size, distance=Distance.COSINE),
            )

    def embed(self, text: str) -> list[float]:
        emb = _ollama_embedding(text)
        if emb and len(emb) == self.size:
            return emb

        # If Ollama embedding size differs from configured size, use hash embedding for consistency.
        if emb and len(emb) != self.size:
            return _hash_embedding(text, self.size)

        return _hash_embedding(text, self.size)

    def upsert_text(self, text: str, metadata: dict[str, Any] | None = None, point_id: str | None = None) -> str:
        payload = metadata.copy() if metadata else {}
        payload["text"] = text
        payload["source_type"] = payload.get("source_type", "note")

        record_id = point_id or str(uuid.uuid4())
        point = PointStruct(id=record_id, vector=self.embed(text), payload=payload)
        self.client.upsert(collection_name=self.collection, points=[point])
        logger.info(
            "memory upsert completed",
            extra={"event": "memory_upsert", "details": {"id": record_id, "collection": self.collection}},
        )
        return record_id

    def search_text(self, text: str, limit: int = 5) -> list[SearchHit]:
        vector = self.embed(text)
        hits = self.client.search(
            collection_name=self.collection,
            query_vector=vector,
            limit=limit,
            with_payload=True,
        )
        logger.info(
            "memory search completed",
            extra={"event": "memory_search", "details": {"collection": self.collection, "hits": len(hits)}},
        )
        return [SearchHit(score=float(hit.score), payload=dict(hit.payload or {})) for hit in hits]


def memory_enabled() -> bool:
    return os.getenv("AICL_QDRANT_URL", "").strip() != ""
