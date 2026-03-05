from __future__ import annotations

import re
from datetime import datetime, timezone

from libs.docs.md_writer import write_project_note
from libs.logs import get_logger

logger = get_logger(__name__)

TOPICS = {
    "ccna": ["ospf", "bgp", "stp", "vlan", "nat", "acl", "eigrp", "ipv6"],
    "portswigger": ["xss", "sqli", "csrf", "ssti", "idor", "jwt", "xxe", "ssrf"],
    "cpts": ["enum", "web", "active directory", "linux privesc", "windows privesc"],
}


def _detect_track(text: str) -> str:
    lower = text.lower()
    for track in TOPICS:
        if track in lower:
            return track
    return "general"


def _extract_terms(text: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9+_.-]{3,}", text)
    uniq: list[str] = []
    for w in words:
        lw = w.lower()
        if lw not in uniq:
            uniq.append(lw)
    return uniq[:8]


def _flashcards(terms: list[str]) -> list[str]:
    cards: list[str] = []
    for term in terms[:5]:
        cards.append(f"Q: Explain {term.upper()} in one sentence. | A: [your answer]")
        cards.append(f"Q: Common failure mode for {term.upper()}? | A: [your answer]")
    return cards[:8]


def handle_study(user_input: str, project: str) -> str:
    logger.info(
        "study agent started",
        extra={"event": "study_start", "details": {"project": project}},
    )
    track = _detect_track(user_input)
    term_candidates = _extract_terms(user_input)
    if track in TOPICS:
        for hint in TOPICS[track]:
            if hint not in term_candidates:
                term_candidates.append(hint)

    payload = {
        "title": f"Study Session - {track.upper()}",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "track": track,
        "query": user_input,
        "atomic_notes": [
            f"Define each concept in your own words: {', '.join(term_candidates[:5])}.",
            "Build one lab scenario and validate expected behavior with commands/screenshots.",
            "Record one misconception discovered during revision.",
        ],
        "flashcards": _flashcards(term_candidates),
        "next_actions": [
            "Run a 25-minute focused drill on weakest concept.",
            "Do a closed-book recap and compare against notes.",
            "Schedule spaced repetition in 1, 3, and 7 days.",
        ],
    }

    paths = write_project_note(project, "study", payload)
    logger.info(
        "study agent completed",
        extra={"event": "study_done", "details": {"project": project, "track": track}},
    )
    return f"Study note saved: {paths['md']} (json: {paths['json']})"
