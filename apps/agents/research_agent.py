from __future__ import annotations

from datetime import datetime, timezone

from libs.docs.md_writer import write_project_note
from libs.logs import get_logger

logger = get_logger(__name__)


def handle_research(user_input: str, project: str) -> str:
    logger.info(
        "research agent started",
        extra={"event": "research_start", "details": {"project": project}},
    )
    payload = {
        "title": "Research Task",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "query": user_input,
        "approach": [
            "Define exact objective and boundary conditions.",
            "Collect primary references and capture date/version metadata.",
            "Build a reproducible mini test case.",
            "Document assumptions and confidence levels.",
        ],
        "deliverables": [
            "One-page summary",
            "Command/test appendix",
            "Open questions",
        ],
    }

    paths = write_project_note(project, "research", payload)
    logger.info(
        "research agent completed",
        extra={"event": "research_done", "details": {"project": project}},
    )
    return f"Research plan note saved: {paths['md']}"
