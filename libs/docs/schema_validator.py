from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

from apps.orchestrator.config import schema_root, validate_notes
from libs.logs import get_logger

logger = get_logger(__name__)

SECTION_SCHEMA_MAP = {
    "study": "study_note.schema.json",
    "pentest": "pentest_note.schema.json",
    "report": "report_note.schema.json",
    "knowledge": "knowledge_note.schema.json",
    "research": "research_note.schema.json",
}


@lru_cache(maxsize=16)
def _load_validator(schema_name: str) -> Draft202012Validator:
    schema_path = schema_root() / schema_name
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema not found: {schema_path}")

    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    return Draft202012Validator(schema, format_checker=FormatChecker())


def _format_error_path(parts: list[Any]) -> str:
    if not parts:
        return "$"
    return "$." + ".".join(str(part) for part in parts)


def validate_note_payload(section: str, payload: dict[str, Any]) -> None:
    if not validate_notes():
        return

    schema_name = SECTION_SCHEMA_MAP.get(section)
    if not schema_name:
        raise ValueError(f"No schema mapping configured for section '{section}'")

    validator = _load_validator(schema_name)
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))
    if not errors:
        return

    first = errors[0]
    path = _format_error_path(list(first.path))
    logger.error(
        "note schema validation failed",
        extra={
            "event": "note_schema_invalid",
            "component": "docs",
            "operation": "schema_validate",
            "details": {
                "section": section,
                "schema": schema_name,
                "error_count": len(errors),
                "first_error_path": path,
                "first_error_message": first.message,
            },
        },
    )
    raise ValueError(f"Invalid payload for section '{section}' at {path}: {first.message}")
