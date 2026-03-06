from __future__ import annotations

import json
import re
from typing import Any

_NUCLEI_TEXT_RE = re.compile(
    r"^\[(?P<severity>[^\]]+)\]\s+\[(?P<protocol>[^\]]+)\]\s+\[(?P<template>[^\]]+)\]\s+(?P<target>\S+)"
)
_SEVERITIES = {"info", "low", "medium", "high", "critical"}


def _parse_json_line(line: str) -> dict[str, Any] | None:
    try:
        payload = json.loads(line)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None

    info = payload.get("info", {})
    if not isinstance(info, dict):
        info = {}

    target = str(payload.get("matched-at") or payload.get("host") or "").strip()
    template_id = str(payload.get("template-id", "")).strip()
    if not target or not template_id:
        return None

    severity = str(info.get("severity", "")).strip().lower()
    if severity not in _SEVERITIES:
        severity = "info"

    matcher = str(payload.get("matcher-name", "")).strip()
    name = str(info.get("name", "")).strip()
    return {
        "target": target,
        "template_id": template_id,
        "severity": severity,
        "protocol": str(payload.get("type", "http")).strip().lower(),
        "name": name,
        "matcher": matcher,
    }


def _parse_text_line(line: str) -> dict[str, Any] | None:
    match = _NUCLEI_TEXT_RE.match(line.strip())
    if not match:
        return None
    severity = match.group("severity").strip().lower()
    if severity not in _SEVERITIES:
        severity = "info"
    return {
        "target": match.group("target").strip(),
        "template_id": match.group("template").strip(),
        "severity": severity,
        "protocol": match.group("protocol").strip().lower(),
        "name": "",
        "matcher": "",
    }


def parse_nuclei_findings(nuclei_text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for raw_line in nuclei_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parsed = _parse_json_line(line)
        if parsed is None:
            parsed = _parse_text_line(line)
        if parsed is not None:
            rows.append(parsed)
    return rows

