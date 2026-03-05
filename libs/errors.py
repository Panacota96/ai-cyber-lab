from __future__ import annotations

from typing import Any


def api_error(
    *,
    error_code: str,
    component: str,
    operation: str,
    message: str,
    trace_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "error_code": error_code,
        "component": component,
        "operation": operation,
        "message": message,
        "trace_id": trace_id,
    }
    if details:
        payload["details"] = details
    return payload
