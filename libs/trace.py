from __future__ import annotations

import contextvars
import os
import uuid
from typing import Any

from libs.circuit import CircuitBreaker

_trace_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("aicl_trace_id", default=None)
_langfuse_client: Any = None
_langfuse_checked = False
_langfuse_breaker = CircuitBreaker(name="langfuse", failure_threshold=3, reset_timeout_s=45.0)


def new_trace_id() -> str:
    return uuid.uuid4().hex


def current_trace_id() -> str | None:
    return _trace_id.get()


def set_trace_id(trace_id: str):
    return _trace_id.set(trace_id)


def reset_trace_id(token) -> None:
    _trace_id.reset(token)


def _langfuse_enabled() -> bool:
    return os.getenv("AICL_ENABLE_LANGFUSE", "false").lower() == "true"


def _get_langfuse_client() -> Any:
    global _langfuse_client, _langfuse_checked
    if _langfuse_checked:
        return _langfuse_client

    _langfuse_checked = True
    if not _langfuse_enabled():
        return None

    host = os.getenv("AICL_LANGFUSE_HOST", "").strip()
    public_key = os.getenv("AICL_LANGFUSE_PUBLIC_KEY", "").strip()
    secret_key = os.getenv("AICL_LANGFUSE_SECRET_KEY", "").strip()
    if not host or not public_key or not secret_key:
        return None

    try:
        from langfuse import Langfuse

        _langfuse_client = Langfuse(host=host, public_key=public_key, secret_key=secret_key)
        return _langfuse_client
    except Exception:
        return None


def trace_event(name: str, input_text: str = "", output_text: str = "", metadata: dict[str, Any] | None = None) -> None:
    if not _langfuse_breaker.allow():
        return

    client = _get_langfuse_client()
    if client is None:
        return

    trace_id = current_trace_id() or new_trace_id()
    try:
        client.trace(
            id=trace_id,
            name=name,
            input=input_text[:2000],
            output=output_text[:2000],
            metadata=metadata or {},
        )
        _langfuse_breaker.record_success()
    except Exception:
        _langfuse_breaker.record_failure()
        return


def trace_diagnostics() -> dict[str, Any]:
    return {
        "enabled": _langfuse_enabled(),
        "has_client": _get_langfuse_client() is not None,
        "circuit": _langfuse_breaker.snapshot(),
    }
