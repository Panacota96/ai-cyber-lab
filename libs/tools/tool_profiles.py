from __future__ import annotations

import os

BASELINE_TOOLS = [
    "nmap",
    "ffuf",
    "gobuster",
    "whatweb",
    "sqlmap",
    "nuclei",
    "john",
    "hashcat",
    "hydra",
    "python2",
    "python3",
    "pip",
    "pip2",
    "pytest",
    "uv",
]

TOOL_PROFILES: dict[str, list[str]] = {
    "baseline": BASELINE_TOOLS,
    # Inspired by multi-domain offensive stacks (web + service recon focus).
    "web": [
        "nmap",
        "whatweb",
        "ffuf",
        "gobuster",
        "sqlmap",
        "nuclei",
        "nikto",
        "wfuzz",
        "curl",
    ],
    # Inspired by common AD/internal-assessment toolchains.
    "ad": [
        "nmap",
        "crackmapexec",
        "rpcclient",
        "smbclient",
        "impacket-secretsdump",
        "impacket-lookupsid",
        "ldapsearch",
        "kerbrute",
        "bloodhound-python",
        "netexec",
    ],
    # Broad profile that can be selectively tightened in production.
    "expanded": [
        "nmap",
        "rustscan",
        "masscan",
        "whatweb",
        "ffuf",
        "gobuster",
        "feroxbuster",
        "sqlmap",
        "nuclei",
        "nikto",
        "amass",
        "subfinder",
        "httpx",
        "hydra",
        "john",
        "hashcat",
        "wfuzz",
        "python2",
        "python3",
        "pip",
        "pip2",
        "pytest",
        "uv",
        "curl",
    ],
}


def _parse_csv(raw: str) -> set[str]:
    return {item.strip() for item in (raw or "").split(",") if item.strip()}


def _profile_name() -> str:
    return os.getenv("AICL_TOOL_PROFILE", "baseline").strip().lower()


def allowed_tools() -> set[str]:
    raw = os.getenv("AICL_ALLOWED_TOOLS", ",".join(BASELINE_TOOLS))
    resolved = _parse_csv(raw)

    profile = _profile_name()
    if profile in TOOL_PROFILES:
        resolved.update(TOOL_PROFILES[profile])

    extra = os.getenv("AICL_ALLOWED_TOOLS_EXTRA", "")
    resolved.update(_parse_csv(extra))
    return resolved


def selected_profile() -> str:
    profile = _profile_name()
    if profile in TOOL_PROFILES:
        return profile
    return "custom"


def available_profiles() -> dict[str, list[str]]:
    return {name: sorted(set(tools)) for name, tools in TOOL_PROFILES.items()}
