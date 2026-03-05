from __future__ import annotations

import time
from typing import Any

import httpx

from apps.orchestrator.config import (
    enable_langfuse,
    exec_backend,
    graph_backend,
    neo4j_http_url,
    ollama_url,
    qdrant_url,
    tool_exec_url,
)
from libs.logs import get_logger

logger = get_logger(__name__)


def _probe(url: str, path: str, timeout_s: float = 2.5) -> dict[str, Any]:
    start = time.monotonic()
    full_url = f"{url.rstrip('/')}{path}"
    try:
        with httpx.Client(timeout=timeout_s) as client:
            resp = client.get(full_url)
            latency = int((time.monotonic() - start) * 1000)
            return {
                "up": resp.status_code < 500,
                "status_code": resp.status_code,
                "latency_ms": latency,
                "url": full_url,
                "error": "",
            }
    except Exception as exc:
        latency = int((time.monotonic() - start) * 1000)
        return {
            "up": False,
            "status_code": 0,
            "latency_ms": latency,
            "url": full_url,
            "error": str(exc),
        }


def dependency_status() -> dict[str, Any]:
    qdrant = _probe(qdrant_url(), "/collections")
    ollama = _probe(ollama_url(), "/api/tags")
    if exec_backend() == "service":
        tool_exec = _probe(tool_exec_url(), "/health")
    else:
        tool_exec = {"up": True, "status_code": 0, "latency_ms": 0, "url": "", "error": "disabled"}

    langfuse_status: dict[str, Any]
    if enable_langfuse():
        host = ""
        try:
            import os

            host = os.getenv("AICL_LANGFUSE_HOST", "").strip()
        except Exception:
            host = ""

        if host:
            langfuse_status = _probe(host, "/")
        else:
            langfuse_status = {"up": False, "status_code": 0, "latency_ms": 0, "url": "", "error": "missing host"}
    else:
        langfuse_status = {"up": True, "status_code": 0, "latency_ms": 0, "url": "", "error": "disabled"}

    graph_mode = graph_backend()
    if graph_mode == "neo4j":
        neo4j = _probe(neo4j_http_url(), "/")
    else:
        neo4j = {"up": True, "status_code": 0, "latency_ms": 0, "url": "", "error": "disabled"}

    status = {
        "qdrant": qdrant,
        "ollama": ollama,
        "tool_exec": tool_exec,
        "langfuse": langfuse_status,
        "neo4j": neo4j,
    }
    logger.info(
        "dependency probe completed",
        extra={
            "event": "dependency_probe",
            "details": {
                "qdrant_up": qdrant.get("up", False),
                "ollama_up": ollama.get("up", False),
                "tool_exec_up": tool_exec.get("up", False),
                "langfuse_up": langfuse_status.get("up", False),
                "neo4j_up": neo4j.get("up", False),
            },
        },
    )
    return status


def readiness() -> dict[str, Any]:
    deps = dependency_status()
    degraded = any(not status.get("up", False) for status in deps.values())
    return {
        "status": "degraded" if degraded else "ready",
        "degraded": degraded,
        "dependencies": deps,
    }
