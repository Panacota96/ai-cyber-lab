from __future__ import annotations

import re
from typing import Any

from libs.command_planner import build_command_plan

TARGET_RE = re.compile(r"\b(?:(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b")


def _normalize_profile(value: str) -> str:
    text = (value or "balanced").strip().lower()
    if text in {"stealth", "balanced", "aggressive"}:
        return text
    return "balanced"


def _extract_target(value: str) -> str:
    text = value.strip()
    if not text:
        return ""
    match = TARGET_RE.search(text)
    if match:
        return match.group(0)
    return text


def _cmd_card(
    *,
    title: str,
    cmd: list[str],
    purpose: str,
    risk: str,
    rationale: str,
    timeout_sec: int,
) -> dict[str, Any]:
    return {
        "title": title,
        "cmd": [str(x).strip() for x in cmd if str(x).strip()],
        "purpose": purpose,
        "risk": risk,
        "rationale": rationale,
        "timeout_sec": max(1, min(int(timeout_sec), 3600)),
    }


def _pick_commands(plan: dict[str, Any], tool: str, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in plan.get("commands", []):
        if not isinstance(item, dict):
            continue
        cmd = item.get("cmd", [])
        if not isinstance(cmd, list) or not cmd:
            continue
        if str(cmd[0]).strip().lower() != tool:
            continue
        rows.append(
            _cmd_card(
                title=str(item.get("title", "Command")).strip(),
                cmd=cmd,
                purpose="recon",
                risk=str(item.get("risk", "medium")).strip().lower(),
                rationale=str(item.get("rationale", "")).strip(),
                timeout_sec=int(item.get("timeout_sec", 120)),
            )
        )
        if len(rows) >= limit:
            break
    return rows


def build_web_playbook(
    *,
    project: str,
    target: str,
    profile: str,
    objective: str = "",
    discoveries: list[str] | None = None,
) -> dict[str, Any]:
    safe_target = _extract_target(target)
    safe_profile = _normalize_profile(profile)
    notes = [str(x).strip() for x in (discoveries or []) if str(x).strip()]

    recon_plan = build_command_plan(
        project=project,
        target_input=safe_target,
        purpose="recon",
        profile=safe_profile,
        discoveries=notes,
    )

    discover_commands = _pick_commands(recon_plan, "nmap", limit=2)
    discover_commands.append(
        _cmd_card(
            title="HTTP liveness sweep",
            cmd=["httpx", "-u", f"http://{safe_target}", "-status-code", "-title", "-tech-detect"],
            purpose="recon",
            risk="low",
            rationale="Quickly confirm if the target serves HTTP and capture initial stack hints.",
            timeout_sec=90,
        )
    )

    fingerprint_commands = _pick_commands(recon_plan, "whatweb", limit=1)
    fingerprint_commands.append(
        _cmd_card(
            title="Extended HTTP fingerprint",
            cmd=[
                "httpx",
                "-u",
                f"http://{safe_target}",
                "-status-code",
                "-title",
                "-web-server",
                "-tech-detect",
            ],
            purpose="recon",
            risk="low",
            rationale="Capture service banners and framework fingerprints for targeted validation.",
            timeout_sec=90,
        )
    )

    content_commands = _pick_commands(recon_plan, "ffuf", limit=1)
    content_commands.append(
        _cmd_card(
            title="Secondary content wordlist pass",
            cmd=[
                "ffuf",
                "-u",
                f"http://{safe_target}/FUZZ",
                "-w",
                "/usr/share/seclists/Discovery/Web-Content/common.txt",
                "-mc",
                "200,204,301,302,307,401,403",
            ],
            purpose="recon",
            risk="medium",
            rationale="Run a shorter second pass to catch low-hanging endpoints with less noise.",
            timeout_sec=150,
        )
    )

    vuln_validate_commands = [
        _cmd_card(
            title="Nuclei web validation scan",
            cmd=[
                "nuclei",
                "-u",
                f"http://{safe_target}",
                "-severity",
                "low,medium,high,critical",
                "-rate-limit",
                "150",
            ],
            purpose="validation",
            risk="medium",
            rationale="Validate likely exposures from previous stages with reusable community templates.",
            timeout_sec=240,
        )
    ]

    stages = [
        {
            "stage_key": "discover",
            "title": "Discover",
            "rationale": "Build an initial service map and ensure web reachability before deep checks.",
            "commands": discover_commands,
            "output_expectations": [
                "open ports with service hints",
                "initial reachable URL status codes",
            ],
        },
        {
            "stage_key": "fingerprint",
            "title": "Fingerprint",
            "rationale": "Identify technologies and versions to narrow testing hypotheses.",
            "commands": fingerprint_commands,
            "output_expectations": [
                "technology stack fingerprints",
                "headers/title evidence",
            ],
        },
        {
            "stage_key": "content-enum",
            "title": "Content Enumeration",
            "rationale": "Discover attack surface paths and prioritize endpoints for manual validation.",
            "commands": content_commands,
            "output_expectations": [
                "reachable directories/files",
                "auth or access-control clues",
            ],
        },
        {
            "stage_key": "vuln-validate",
            "title": "Vulnerability Validation",
            "rationale": "Run controlled validation templates against prioritized web attack surface.",
            "commands": vuln_validate_commands,
            "output_expectations": [
                "validated findings with severity",
                "template IDs linked to evidence",
            ],
        },
        {
            "stage_key": "report-draft",
            "title": "Report Draft",
            "rationale": "Convert approved findings and evidence into delivery-ready output.",
            "commands": [],
            "output_expectations": [
                "findings grouped by business impact",
                "retest recommendations and next actions",
            ],
        },
    ]

    return {
        "category": "web",
        "project": project,
        "target": safe_target,
        "objective": objective.strip(),
        "profile": safe_profile,
        "discoveries": notes,
        "stages": stages,
        "metadata": {
            "template": "web-profitability-sprint2",
            "generated_from": "build_command_plan",
            "automation_notes": [
                "Approve stages sequentially to keep operator oversight.",
                "Record engagement metrics after each approved stage for ROI tracking.",
            ],
        },
    }

