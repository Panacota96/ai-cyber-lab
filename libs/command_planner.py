from __future__ import annotations

import ipaddress
import re
import uuid
from typing import Any

TARGET_RE = re.compile(r"\b(?:(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b")


def _normalize_profile(value: str) -> str:
    text = value.strip().lower()
    if text in {"stealth", "balanced", "aggressive"}:
        return text
    return "balanced"


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


def _command_card(
    *,
    cmd: list[str],
    title: str,
    rationale: str,
    risk: str,
    expected_signal: str,
    fallback: str,
    timeout_sec: int,
) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex,
        "title": title,
        "cmd": cmd,
        "rationale": rationale,
        "risk": risk,
        "expected_signal": expected_signal,
        "fallback": fallback,
        "timeout_sec": timeout_sec,
    }


def build_command_plan(
    *,
    project: str,
    target_input: str,
    purpose: str,
    profile: str,
    discoveries: list[str] | None = None,
) -> dict[str, Any]:
    profile = _normalize_profile(profile)
    target = _extract_target(target_input)
    target_kind = _target_mode(target)
    purpose_text = purpose.strip().lower()
    notes = discoveries or []

    cards: list[dict[str, Any]] = []

    if purpose_text in {"recon", "scanning", "enum"}:
        flags = _nmap_flags(profile)
        cards.append(
            _command_card(
                cmd=["nmap", *flags, "-Pn", "-p-", target],
                title="Full TCP discovery",
                rationale="Find all reachable TCP services before deep service checks.",
                risk=profile,
                expected_signal="Open ports list with service hints.",
                fallback="If too slow, run --top-ports 2000 first.",
                timeout_sec=300 if profile != "stealth" else 420,
            )
        )
        cards.append(
            _command_card(
                cmd=["nmap", "-sC", "-sV", "-Pn", target],
                title="Default scripts + service versions",
                rationale="Get service metadata and low-risk NSE defaults.",
                risk="low",
                expected_signal="Version banners and default-script findings.",
                fallback="Limit to discovered ports with -p.",
                timeout_sec=240,
            )
        )
        http_target = target if target_kind == "fqdn" else f"{target}"
        cards.append(
            _command_card(
                cmd=["whatweb", f"http://{http_target}"],
                title="Web fingerprint baseline",
                rationale="Detect likely frameworks and tech stack quickly.",
                risk="low",
                expected_signal="Framework/CMS/web server hints.",
                fallback="Try https:// target if HTTP fails.",
                timeout_sec=60,
            )
        )
        cards.append(
            _command_card(
                cmd=[
                    "ffuf",
                    "-u",
                    f"http://{target}/FUZZ",
                    "-w",
                    "/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt",
                    "-mc",
                    "200,204,301,302,307,401,403",
                ],
                title="Web content discovery",
                rationale="Enumerate reachable paths to prioritize attack surface.",
                risk="medium" if profile != "stealth" else "low",
                expected_signal="Interesting paths and access control clues.",
                fallback="Use smaller/custom wordlist to reduce noise.",
                timeout_sec=180,
            )
        )

    elif purpose_text in {"cracking", "password", "hash"}:
        cards.append(
            _command_card(
                cmd=[
                    "john",
                    "--format=raw-md5",
                    "--wordlist=/usr/share/wordlists/rockyou.txt",
                    "hashes.txt",
                ],
                title="Dictionary cracking with John",
                rationale="Start with low-cost dictionary attempts on authorized lab hashes.",
                risk="medium",
                expected_signal="Recovered credentials or exhausted dictionary.",
                fallback="Switch format or tune wordlist/rules based on hash type.",
                timeout_sec=300,
            )
        )
        cards.append(
            _command_card(
                cmd=[
                    "hashcat",
                    "-a",
                    "0",
                    "-m",
                    "0",
                    "hashes.txt",
                    "/usr/share/wordlists/rockyou.txt",
                ],
                title="GPU-style cracking baseline",
                rationale="Use hashcat mode-driven approach for repeatable cracking runs.",
                risk="medium",
                expected_signal="Candidate recoveries and speed metrics.",
                fallback="Use --example-hashes to confirm correct hash mode.",
                timeout_sec=300,
            )
        )
    else:
        cards.append(
            _command_card(
                cmd=["nmap", "-sV", "-Pn", target],
                title="General baseline scan",
                rationale="Fallback baseline when purpose is generic.",
                risk="low",
                expected_signal="Initial service map.",
                fallback="Refine purpose to recon or cracking for richer plans.",
                timeout_sec=180,
            )
        )

    return {
        "plan_id": uuid.uuid4().hex,
        "project": project,
        "target": target,
        "purpose": purpose_text or "recon",
        "profile": profile,
        "discoveries": notes,
        "commands": cards,
    }
