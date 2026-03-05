from __future__ import annotations

import re
from typing import Any

_FFUF_RE = re.compile(
    r"^(?P<path>\S+)\s+\[Status:\s*(?P<status>\d+),\s*Size:\s*(?P<size>\d+),"
    r"\s*Words:\s*(?P<words>\d+),\s*Lines:\s*(?P<lines>\d+)(?:,\s*Duration:\s*(?P<duration>[^\]]+))?\]$"
)


def parse_ffuf_hits(ffuf_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for raw_line in ffuf_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = _FFUF_RE.match(line)
        if not match:
            continue
        hits.append(
            {
                "path": match.group("path"),
                "status": int(match.group("status")),
                "size": int(match.group("size")),
                "words": int(match.group("words")),
                "lines": int(match.group("lines")),
                "duration": (match.group("duration") or "").strip(),
            }
        )
    return hits
