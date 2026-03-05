from __future__ import annotations

import re
from typing import Any

_BRACKET_RE = re.compile(r"\[([^\]]+)\]")
_PLUGIN_RE = re.compile(r"([A-Za-z0-9._-]+)\[([^\]]+)\]")


def parse_whatweb_output(whatweb_text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for raw_line in whatweb_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("ERROR"):
            continue

        url = line.split(" ", 1)[0]
        brackets = _BRACKET_RE.findall(line)
        tags: list[str] = [f"{name}[{value}]" for name, value in _PLUGIN_RE.findall(line)]
        status = ""
        for token in brackets:
            clean = token.strip()
            if clean.endswith("OK") or clean.isdigit() or " " in clean and clean.split(" ")[0].isdigit():
                status = status or clean
            elif not any(clean in t for t in tags):
                tags.append(clean)

        rows.append({"url": url, "status": status, "tags": tags})
    return rows
