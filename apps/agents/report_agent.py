from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from apps.orchestrator.config import data_root
from libs.docs.md_writer import load_text, write_markdown_file, write_project_note
from libs.logs import get_logger

logger = get_logger(__name__)


def _read_latest_log_lines(max_lines: int = 400) -> list[str]:
    log_dir = data_root() / "projects" / "_logs"
    if not log_dir.exists():
        return []
    files = sorted(log_dir.glob("terminal_*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        return []
    content = load_text(files[0])
    lines = [ln for ln in content.splitlines() if ln.strip()]
    return lines[-max_lines:]


def _categorize_commands(lines: list[str]) -> dict[str, list[str]]:
    buckets: dict[str, list[str]] = defaultdict(list)

    for line in lines:
        cmd = line.split("cmd=", 1)[1] if "cmd=" in line else line
        cmd = cmd.strip()

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


def _build_report(project: str, lines: list[str]) -> str:
    sections = _categorize_commands(lines)
    utc_now = datetime.now(timezone.utc).isoformat()

    report_lines = [
        f"# {project} - Auto Session Report",
        "",
        "## Scope and Authorization",
        "- This report is intended for authorized labs/CTFs only.",
        f"- Generated UTC: {utc_now}",
        "",
        "## Executive Summary",
        "- Session converted from command log.",
        "- Validate all findings manually before publication.",
        "",
        "## Timeline (Raw Commands)",
    ]

    for line in lines[-60:]:
        report_lines.append(f"- `{line}`")

    report_lines.extend(["", "## Technical Sections"])

    for name in ("Recon", "Web Enumeration", "Validation / Exploitation", "Privilege Escalation", "Other"):
        entries = sections.get(name, [])
        report_lines.append(f"### {name}")
        if entries:
            for cmd in entries[:30]:
                report_lines.append(f"- `{cmd}`")
        else:
            report_lines.append("- No entries captured.")
        report_lines.append("")

    report_lines.extend(
        [
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
    lines = _read_latest_log_lines()
    report = _build_report(project, lines)

    report_path = write_markdown_file(project, "report/auto_report.md", report)
    payload = {
        "title": "Report Generation",
        "query": user_input,
        "log_lines_used": len(lines),
        "output": report_path,
    }
    note_paths = write_project_note(project, "report", payload)
    logger.info(
        "report agent completed",
        extra={
            "event": "report_done",
            "details": {"project": project, "lines_processed": len(lines)},
        },
    )
    return (
        f"Report generated: {report_path} | metadata note: {note_paths['md']} "
        f"| lines_processed={len(lines)}"
    )
