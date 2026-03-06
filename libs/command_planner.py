from __future__ import annotations

import ipaddress
import re
import uuid
from typing import Any

TARGET_RE = re.compile(r"\b(?:(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b")
OPEN_PORT_RE = re.compile(r"(?P<port>\d{1,5})/(?:tcp|udp)\s+open\s+(?P<service>[a-z0-9._-]+)", re.IGNORECASE)
WEB_HINT_RE = re.compile(r"\b(http|https|apache|nginx|wordpress|tomcat|iis|php)\b", re.IGNORECASE)
WEB_PATH_RE = re.compile(r"/[a-zA-Z0-9._/-]{2,}")

WEB_PORTS = {80, 81, 443, 8000, 8080, 8081, 8443, 8888}
PURPOSE_DEFAULTS = {
    "recon": ["host-discovery-full", "service-default", "web-probe", "web-fingerprint", "web-content-light"],
    "scanning": ["host-discovery-fast", "service-default", "web-probe"],
    "enum": ["service-default", "web-fingerprint", "web-content-deep", "web-vuln-validate"],
}


def _normalize_profile(value: str) -> str:
    text = value.strip().lower()
    if text in {"stealth", "balanced", "aggressive"}:
        return text
    return "balanced"


def _normalize_purpose(value: str) -> str:
    text = value.strip().lower()
    if text in {"recon", "scanning", "enum", "cracking", "password", "hash"}:
        return text
    return "recon"


def _target_mode(target: str) -> str:
    try:
        ipaddress.ip_address(target)
        return "ip"
    except Exception:
        return "fqdn"


def _extract_target(value: str) -> str:
    text = value.strip()
    match = TARGET_RE.search(text)
    if match:
        return match.group(0)
    return text


def _nmap_flags(profile: str) -> list[str]:
    if profile == "stealth":
        return ["-sT", "-T2", "--max-retries", "2"]
    if profile == "aggressive":
        return ["-sS", "-T4", "--min-rate", "5000"]
    return ["-sS", "-T3", "--min-rate", "2000"]


def _fingerprint(cmd: list[str]) -> str:
    return " ".join(str(x).strip().lower() for x in cmd if str(x).strip())


def _normalize_executed(executed_commands: list[list[str]] | None) -> set[str]:
    out: set[str] = set()
    for cmd in executed_commands or []:
        if not isinstance(cmd, list):
            continue
        fp = _fingerprint(cmd)
        if fp:
            out.add(fp)
    return out


def _extract_signals(discoveries: list[str]) -> dict[str, Any]:
    ports: set[int] = set()
    services: set[str] = set()
    web_paths = 0
    web_hints = 0

    for item in discoveries:
        text = str(item or "").strip()
        if not text:
            continue
        for match in OPEN_PORT_RE.finditer(text):
            port = int(match.group("port"))
            ports.add(port)
            services.add(match.group("service").lower())
        if WEB_HINT_RE.search(text):
            web_hints += 1
        if WEB_PATH_RE.search(text):
            web_paths += 1

    web_detected = bool((ports & WEB_PORTS) or {"http", "https"} & services or web_hints > 0)
    return {
        "open_ports": sorted(ports),
        "services": sorted(services),
        "web_detected": web_detected,
        "web_paths_detected": web_paths > 0,
    }


def _workflow_stage(signals: dict[str, Any]) -> str:
    ports = signals.get("open_ports", [])
    web = bool(signals.get("web_detected"))
    web_paths = bool(signals.get("web_paths_detected"))
    if not ports:
        return "host-discovery"
    if web and not web_paths:
        return "web-enum"
    if web and web_paths:
        return "vuln-validate"
    return "service-enum"


def _service_ports_arg(signals: dict[str, Any]) -> list[str]:
    ports = signals.get("open_ports", [])
    if not isinstance(ports, list) or not ports:
        return []
    clipped = [str(int(x)) for x in ports[:25]]
    return ["-p", ",".join(clipped)]


def _option_definitions(target: str, profile: str, signals: dict[str, Any]) -> dict[str, dict[str, Any]]:
    flags = _nmap_flags(profile)
    timeout_full = 420 if profile == "stealth" else 300
    timeout_top = 260 if profile == "stealth" else 180
    service_ports = _service_ports_arg(signals)

    service_cmd = ["nmap", "-sC", "-sV", "-Pn", *service_ports, target]
    service_timeout = 180 if service_ports else 240

    return {
        "host-discovery-fast": {
            "label": "Host Discovery (Top Ports)",
            "description": "Fast initial port discovery with bounded top-ports scan.",
            "stage": "host-discovery",
            "risk": "low",
            "requires_web": False,
            "requires_ports": [],
            "cmd": ["nmap", *flags, "-Pn", "--top-ports", "1000", target],
            "timeout_sec": timeout_top,
        },
        "host-discovery-full": {
            "label": "Host Discovery (Full TCP)",
            "description": "Full TCP sweep for comprehensive service discovery.",
            "stage": "host-discovery",
            "risk": profile,
            "requires_web": False,
            "requires_ports": [],
            "cmd": ["nmap", *flags, "-Pn", "-p-", target],
            "timeout_sec": timeout_full,
        },
        "service-default": {
            "label": "Service Enumeration",
            "description": "Nmap default scripts and service versions.",
            "stage": "service-enum",
            "risk": "low",
            "requires_web": False,
            "requires_ports": [],
            "cmd": service_cmd,
            "timeout_sec": service_timeout,
        },
        "web-probe": {
            "label": "Web Probe",
            "description": "HTTP probe with status/title and tech hints.",
            "stage": "web-fingerprint",
            "risk": "low",
            "requires_web": False,
            "requires_ports": [],
            "cmd": ["httpx", "-u", f"http://{target}", "-status-code", "-title", "-tech-detect"],
            "timeout_sec": 90,
        },
        "web-fingerprint": {
            "label": "Web Fingerprint",
            "description": "Technology fingerprint baseline for web service.",
            "stage": "web-fingerprint",
            "risk": "low",
            "requires_web": False,
            "requires_ports": [],
            "cmd": ["whatweb", f"http://{target}"],
            "timeout_sec": 90,
        },
        "web-content-light": {
            "label": "Web Content Enum (Light)",
            "description": "Low-noise content enumeration for discovered web services.",
            "stage": "web-content-enum",
            "risk": "low" if profile == "stealth" else "medium",
            "requires_web": True,
            "requires_ports": [],
            "cmd": [
                "ffuf",
                "-u",
                f"http://{target}/FUZZ",
                "-w",
                "/usr/share/seclists/Discovery/Web-Content/common.txt",
                "-mc",
                "200,204,301,302,307,401,403",
            ],
            "timeout_sec": 150,
        },
        "web-content-deep": {
            "label": "Web Content Enum (Deep)",
            "description": "Broader path discovery with larger list.",
            "stage": "web-content-enum",
            "risk": "medium",
            "requires_web": True,
            "requires_ports": [],
            "cmd": [
                "ffuf",
                "-u",
                f"http://{target}/FUZZ",
                "-w",
                "/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt",
                "-mc",
                "200,204,301,302,307,401,403",
            ],
            "timeout_sec": 240,
        },
        "web-content-dirs": {
            "label": "Dirb Enumeration",
            "description": "Directory brute-force using dirb for web services.",
            "stage": "web-content-enum",
            "risk": "medium",
            "requires_web": True,
            "requires_ports": [],
            "cmd": ["dirb", f"http://{target}", "/usr/share/wordlists/dirb/common.txt"],
            "timeout_sec": 220,
        },
        "web-vuln-validate": {
            "label": "Web Validation Scan",
            "description": "Validate likely web findings with nuclei templates.",
            "stage": "vuln-validate",
            "risk": "medium",
            "requires_web": True,
            "requires_ports": [],
            "cmd": [
                "nuclei",
                "-u",
                f"http://{target}",
                "-severity",
                "low,medium,high,critical",
                "-rate-limit",
                "150",
            ],
            "timeout_sec": 240,
        },
        "smb-enum": {
            "label": "SMB Enumeration",
            "description": "Enumerate SMB exposures when SMB ports are visible.",
            "stage": "service-enum",
            "risk": "medium",
            "requires_web": False,
            "requires_ports": [139, 445],
            "cmd": ["enum4linux", "-a", target],
            "timeout_sec": 180,
        },
        "ssh-enum": {
            "label": "SSH Enumeration",
            "description": "Collect SSH algorithm and host-key metadata.",
            "stage": "service-enum",
            "risk": "low",
            "requires_web": False,
            "requires_ports": [22],
            "cmd": ["nmap", "-Pn", "-p", "22", "--script", "ssh2-enum-algos,ssh-hostkey", target],
            "timeout_sec": 120,
        },
    }


def _command_card(
    *,
    option_id: str,
    option_meta: dict[str, Any],
    cmd: list[str],
    rationale: str,
    expected_signal: str,
    fallback: str,
) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex,
        "option_id": option_id,
        "stage": str(option_meta.get("stage", "recon")),
        "title": str(option_meta.get("label", "Command")),
        "cmd": cmd,
        "rationale": rationale,
        "risk": str(option_meta.get("risk", "medium")),
        "expected_signal": expected_signal,
        "fallback": fallback,
        "timeout_sec": int(option_meta.get("timeout_sec", 120)),
        "why": "matched selected options and current discovery signals",
    }


def build_command_plan(
    *,
    project: str,
    target_input: str,
    purpose: str,
    profile: str,
    discoveries: list[str] | None = None,
    selected_options: list[str] | None = None,
    executed_commands: list[list[str]] | None = None,
    allow_repeat: bool = False,
    max_commands: int = 12,
) -> dict[str, Any]:
    safe_profile = _normalize_profile(profile)
    safe_purpose = _normalize_purpose(purpose)
    target = _extract_target(target_input)
    target_kind = _target_mode(target)
    notes = [str(x).strip() for x in (discoveries or []) if str(x).strip()]
    signals = _extract_signals(notes)
    workflow_stage = _workflow_stage(signals)
    options = _option_definitions(target, safe_profile, signals)
    option_ids = set(options.keys())

    selected: list[str] = []
    for item in selected_options or []:
        key = str(item).strip()
        if key and key in option_ids and key not in selected:
            selected.append(key)

    default_selected = PURPOSE_DEFAULTS.get(safe_purpose, PURPOSE_DEFAULTS["recon"])
    candidate_ids = selected if selected else default_selected
    candidate_ids = [x for x in candidate_ids if x in option_ids]

    executed_fps = _normalize_executed(executed_commands)
    suppressed: list[dict[str, Any]] = []
    cards: list[dict[str, Any]] = []
    memory_hits = 0

    open_ports = signals.get("open_ports", [])
    if not isinstance(open_ports, list):
        open_ports = []

    for option_id in candidate_ids:
        meta = options[option_id]
        cmd = meta.get("cmd", [])
        if not isinstance(cmd, list) or not cmd:
            continue

        if bool(meta.get("requires_web")) and not bool(signals.get("web_detected")):
            suppressed.append(
                {
                    "option_id": option_id,
                    "title": str(meta.get("label", option_id)),
                    "reason": "conditional_no_web_signal",
                    "cmd": cmd,
                }
            )
            continue

        required_ports = meta.get("requires_ports", [])
        if isinstance(required_ports, list) and required_ports:
            if open_ports and not set(required_ports).intersection(open_ports):
                suppressed.append(
                    {
                        "option_id": option_id,
                        "title": str(meta.get("label", option_id)),
                        "reason": "required_port_missing",
                        "cmd": cmd,
                    }
                )
                continue
            if not open_ports:
                suppressed.append(
                    {
                        "option_id": option_id,
                        "title": str(meta.get("label", option_id)),
                        "reason": "awaiting_port_discovery",
                        "cmd": cmd,
                    }
                )
                continue

        fp = _fingerprint(cmd)
        if not allow_repeat and fp in executed_fps:
            suppressed.append(
                {
                    "option_id": option_id,
                    "title": str(meta.get("label", option_id)),
                    "reason": "already_executed_in_session",
                    "cmd": cmd,
                }
            )
            memory_hits += 1
            continue

        cards.append(
            _command_card(
                option_id=option_id,
                option_meta=meta,
                cmd=cmd,
                rationale=str(meta.get("description", "")),
                expected_signal=f"stage={meta.get('stage', 'recon')}",
                fallback="Adjust selected options or enable allow_repeat when needed.",
            )
        )

    if not cards:
        fallback_meta = options["host-discovery-fast"]
        cards.append(
            _command_card(
                option_id="host-discovery-fast",
                option_meta=fallback_meta,
                cmd=fallback_meta["cmd"],
                rationale="Fallback baseline to restore progress when all options were suppressed.",
                expected_signal="open ports list",
                fallback="Enable allow_repeat or adjust selected options.",
            )
        )

    cards = cards[: max(1, min(int(max_commands), 50))]
    available_options = [
        {
            "id": key,
            "label": str(meta.get("label", key)),
            "description": str(meta.get("description", "")),
            "stage": str(meta.get("stage", "recon")),
            "risk": str(meta.get("risk", "medium")),
            "requires_web": bool(meta.get("requires_web")),
            "requires_ports": list(meta.get("requires_ports", [])),
            "default_selected": key in default_selected,
            "selected": key in candidate_ids,
        }
        for key, meta in sorted(options.items(), key=lambda item: item[0])
    ]

    return {
        "plan_id": uuid.uuid4().hex,
        "project": project,
        "target": target,
        "target_kind": target_kind,
        "purpose": safe_purpose,
        "profile": safe_profile,
        "discoveries": notes,
        "signals": signals,
        "workflow_stage": workflow_stage,
        "selection_summary": {
            "selected_options": candidate_ids,
            "allow_repeat": bool(allow_repeat),
            "max_commands": max(1, min(int(max_commands), 50)),
        },
        "memory_hits": memory_hits,
        "suppressed_commands": suppressed,
        "available_options": available_options,
        "commands": cards,
    }

