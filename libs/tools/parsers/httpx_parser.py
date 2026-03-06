from __future__ import annotations

import json
import re
from typing import Any

_BRACKET_RE = re.compile(r"\[([^\]]+)\]")


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _parse_json_line(line: str) -> dict[str, Any] | None:
    try:
        payload = json.loads(line)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None

    url = str(payload.get("url") or payload.get("input") or "").strip()
    if not url:
        return None

    tech = payload.get("tech", [])
    if not isinstance(tech, list):
        tech = []

    tags = [str(x).strip() for x in tech if str(x).strip()]
    webserver = str(payload.get("webserver", "")).strip()
    if webserver:
        tags.append(f"webserver:{webserver}")

    return {
        "url": url,
        "status": _to_int(payload.get("status_code", 0)),
        "title": str(payload.get("title", "")).strip(),
        "tags": sorted(set(tags)),
    }


def _parse_text_line(line: str) -> dict[str, Any] | None:
    text = line.strip()
    if not text:
        return None
    url = text.split(" ", 1)[0].strip()
    if not url:
        return None

    blocks = [x.strip() for x in _BRACKET_RE.findall(text) if x.strip()]
    if not blocks:
        return {"url": url, "status": 0, "title": "", "tags": []}

    status = 0
    title = ""
    tags: list[str] = []
    for block in blocks:
        if block.isdigit() and len(block) == 3:
            status = _to_int(block, 0)
            continue
        if block.lower().startswith("title:"):
            title = block.split(":", 1)[-1].strip()
            continue
        tags.append(block)
        if not title and " " in block:
            title = block

    return {"url": url, "status": status, "title": title, "tags": tags}


def parse_httpx_output(httpx_text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for raw_line in httpx_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parsed = _parse_json_line(line)
        if parsed is None:
            parsed = _parse_text_line(line)
        if parsed is not None:
            rows.append(parsed)
    return rows

