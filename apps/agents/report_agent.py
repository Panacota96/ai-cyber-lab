from __future__ import annotations

import gzip
import re
import shlex
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from apps.orchestrator.config import data_root
from libs.docs.md_writer import load_text, write_markdown_file, write_project_note
from libs.logs import get_logger

logger = get_logger(__name__)

SESSION_RE = re.compile(r"session\s*[:=]\s*([A-Za-z0-9._-]+)", re.IGNORECASE)


def _parse_log_line(line: str) -> dict[str, str]:
    parsed: dict[str, str] = {"raw": line}
    if line.startswith("[") and "]" in line:
        parsed["timestamp"] = line[1 : line.index("]")]
        rest = line[line.index("]") + 1 :].strip()
    else:
        parsed["timestamp"] = ""
        rest = line

    try:
        tokens = shlex.split(rest)
    except ValueError:
        tokens = rest.split()

    for token in tokens:
        if "=" not in token:
            continue
        key, value = token.split("=", 1)
        parsed[key.strip()] = value.strip()

    return parsed


def _extract_session_id(user_input: str) -> str | None:
    match = SESSION_RE.search(user_input)
    if not match:
        return None
    return match.group(1)


def _read_project_logs(project: str, max_lines: int = 4000) -> list[dict[str, str]]:
    log_dir = data_root() / "projects" / "_logs"
    if not log_dir.exists():
        return []

    files = sorted(
        [*log_dir.glob("terminal_*.log"), *log_dir.glob("terminal_*.log.gz")],
        key=lambda p: p.stat().st_mtime,
    )
    parsed_rows: list[dict[str, str]] = []
    for path in files:
        content = _read_log_file(path)
        for raw in content.splitlines():
            line = raw.strip()
            if not line:
                continue
            item = _parse_log_line(line)
            line_project = item.get("project", "")
            if line_project and line_project != project:
                continue
            parsed_rows.append(item)

    return parsed_rows[-max_lines:]


def _read_log_file(path: Path) -> str:
    if path.name.endswith(".log.gz"):
        with gzip.open(path, "rt", encoding="utf-8", errors="ignore") as handle:
            return handle.read()
    return load_text(path)


def _pick_session(rows: list[dict[str, str]], requested_session: str | None) -> str | None:
    if requested_session:
        return requested_session

    starts = [r.get("session", "") for r in rows if r.get("event") == "session_start" and r.get("session")]
    if starts:
        return starts[-1]

    sessions = [r.get("session", "") for r in rows if r.get("session") and r.get("session") != "none"]
    return sessions[-1] if sessions else None


def _filter_rows_for_session(rows: list[dict[str, str]], session_id: str | None, max_lines: int = 800) -> list[dict[str, str]]:
    if not rows:
        return []
    if not session_id:
        return rows[-max_lines:]
    out = [r for r in rows if r.get("session") == session_id]
    return out[-max_lines:]


def _categorize_commands(rows: list[dict[str, str]]) -> dict[str, list[str]]:
    buckets: dict[str, list[str]] = defaultdict(list)

    for row in rows:
        if row.get("event") not in {"command", "command_output"}:
            continue

        cmd = row.get("cmd", "").strip()
        if not cmd:
            cmd = row.get("raw", "").strip()

        if any(t in cmd for t in ("nmap", "rustscan", "masscan", "ping")):
            buckets["Recon"].append(cmd)
        elif any(t in cmd for t in ("ffuf", "gobuster", "feroxbuster", "whatweb", "nikto")):
            buckets["Web Enumeration"].append(cmd)
        elif any(t in cmd for t in ("sqlmap", "hydra", "wfuzz")):
            buckets["Validation / Exploitation"].append(cmd)
        elif any(t in cmd for t in ("linpeas", "winpeas", "sudo -l", "id")):
            buckets["Privilege Escalation"].append(cmd)
        else:
            buckets["Other"].append(cmd)

    return buckets


def _build_evidence_map(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    evidence: list[dict[str, str]] = []
    for idx, row in enumerate(rows, start=1):
        if row.get("event") not in {"command", "command_output"}:
            continue
        evidence.append(
            {
                "id": f"E{idx:03d}",
                "timestamp": row.get("timestamp", ""),
                "event": row.get("event", ""),
                "cmd": row.get("cmd", ""),
                "exit": row.get("exit", ""),
                "digest": row.get("digest", ""),
                "artifact_path": row.get("artifact", ""),
                "source_log_line": row.get("raw", ""),
            }
        )
    return evidence


def _build_report(project: str, rows: list[dict[str, str]], session_id: str | None) -> str:
    sections = _categorize_commands(rows)
    utc_now = datetime.now(timezone.utc).isoformat()

    report_lines = [
        f"# {project} - Auto Session Report",
        "",
        "## Scope and Authorization",
        "- This report is intended for authorized labs/CTFs only.",
        f"- Generated UTC: {utc_now}",
        f"- Session: {session_id or 'latest-unscoped'}",
        "",
        "## Executive Summary",
        "- Session converted from command log.",
        "- Validate all findings manually before publication.",
        "",
        "## Timeline (Raw Commands)",
    ]

    for row in rows[-80:]:
        if row.get("event") not in {"command", "command_output"}:
            continue
        report_lines.append(f"- `{row.get('raw', '')}`")

    report_lines.extend(["", "## Technical Sections"])

    for name in ("Recon", "Web Enumeration", "Validation / Exploitation", "Privilege Escalation", "Other"):
        entries = sections.get(name, [])
        report_lines.append(f"### {name}")
        if entries:
            for cmd in entries[:40]:
                report_lines.append(f"- `{cmd}`")
        else:
            report_lines.append("- No entries captured.")
        report_lines.append("")

    evidence = _build_evidence_map(rows)
    report_lines.append("## Evidence Map")
    if evidence:
        for item in evidence[:120]:
            report_lines.append(
                f"- {item['id']} | ts={item['timestamp']} | exit={item['exit']} | "
                f"digest={item['digest']} | cmd=`{item['cmd']}`"
            )
    else:
        report_lines.append("- No evidence items captured.")

    report_lines.extend(
        [
            "",
            "## Findings Draft",
            "### Finding 1",
            "- Description:",
            "- Evidence:",
            "- Impact:",
            "- Remediation:",
            "",
            "## Lessons Learned",
            "-",
        ]
    )

    return "\n".join(report_lines).strip() + "\n"


def handle_report(user_input: str, project: str) -> str:
    logger.info(
        "report agent started",
        extra={"event": "report_start", "details": {"project": project}},
    )

    requested_session = _extract_session_id(user_input)
    all_rows = _read_project_logs(project)
    session_id = _pick_session(all_rows, requested_session)
    rows = _filter_rows_for_session(all_rows, session_id)
    logger.info(
        "report session selection",
        extra={
            "event": "report_session_selected",
            "details": {
                "project": project,
                "requested_session": requested_session or "",
                "selected_session": session_id or "",
                "all_rows": len(all_rows),
                "session_rows": len(rows),
            },
            "component": "report",
            "operation": "session_select",
        },
    )

    report = _build_report(project, rows, session_id)
    report_path = write_markdown_file(project, "report/auto_report.md", report)
    evidence = _build_evidence_map(rows)
    payload = {
        "title": "Report Generation",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "query": user_input,
        "session_id": session_id,
        "log_lines_used": len(rows),
        "evidence_items": len(evidence),
        "output": report_path,
    }
    note_paths = write_project_note(project, "report", payload)
    logger.info(
        "report agent completed",
        extra={
            "event": "report_done",
            "details": {
                "project": project,
                "session_id": session_id or "none",
                "lines_processed": len(rows),
                "evidence_items": len(evidence),
            },
        },
    )
    return (
        f"Report generated: {report_path} | metadata note: {note_paths['md']} "
        f"| session={session_id or 'none'} | lines_processed={len(rows)}"
    )
