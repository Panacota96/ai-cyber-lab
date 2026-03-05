from __future__ import annotations

import re
from typing import Any

_PORT_RE = re.compile(r"^(\d+)\/(tcp|udp)\s+open\s+(\S+)\s*(.*)$", re.IGNORECASE)


def parse_open_ports(nmap_text: str) -> list[dict[str, Any]]:
    ports: list[dict[str, Any]] = []
    for raw_line in nmap_text.splitlines():
        line = raw_line.strip()
        match = _PORT_RE.match(line)
        if not match:
            continue
        ports.append(
            {
                "port": int(match.group(1)),
                "proto": match.group(2).lower(),
                "service": match.group(3).lower(),
                "extra": match.group(4).strip(),
            }
        )
    return ports
