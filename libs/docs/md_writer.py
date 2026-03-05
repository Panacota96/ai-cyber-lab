from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.orchestrator.config import data_root
from libs.logs import get_logger
from libs.docs.schema_validator import validate_note_payload

logger = get_logger(__name__)


def _slug(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-").lower()
    return text or "note"


def _project_root(project: str) -> Path:
    root = data_root() / "projects" / _slug(project)
    root.mkdir(parents=True, exist_ok=True)
    return root


def write_project_note(project: str, section: str, payload: dict[str, Any]) -> dict[str, str]:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    section_slug = _slug(section)
    validate_note_payload(section_slug, payload)
    folder = _project_root(project) / section_slug
    folder.mkdir(parents=True, exist_ok=True)

    json_path = folder / f"{ts}.json"
    md_path = folder / f"{ts}.md"

    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    title = payload.get("title", f"{section_slug} note")
    lines = [
        "---",
        f"title: {title}",
        f"project: {project}",
        f"section: {section_slug}",
        f"created_utc: {datetime.now(timezone.utc).isoformat()}",
        "---",
        "",
        f"# {title}",
        "",
    ]

    for key, value in payload.items():
        if key == "title":
            continue
        lines.append(f"## {key}")
        if isinstance(value, list):
            for item in value:
                lines.append(f"- {item}")
        elif isinstance(value, dict):
            lines.append("```json")
            lines.append(json.dumps(value, indent=2))
            lines.append("```")
        else:
            lines.append(str(value))
        lines.append("")

    md_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    logger.info(
        "project note written",
        extra={
            "event": "project_note_written",
            "details": {
                "project": project,
                "section": section_slug,
                "json_path": str(json_path),
                "md_path": str(md_path),
            },
        },
    )

    return {"json": str(json_path), "md": str(md_path)}


def write_markdown_file(project: str, relative_path: str, content: str) -> str:
    project_root = _project_root(project)
    out_path = project_root / relative_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content, encoding="utf-8")
    logger.info(
        "markdown file written",
        extra={
            "event": "markdown_file_written",
            "details": {"project": project, "path": str(out_path), "chars": len(content)},
        },
    )
    return str(out_path)


def load_text(path: Path) -> str:
    if not path.exists() or not path.is_file():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")
