from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from typing import Any

from apps.orchestrator.config import proposal_max_commands, proposal_providers, proposal_timeout_sec
from libs.command_planner import build_command_plan
from libs.logs import get_logger

logger = get_logger(__name__)

RISK_WEIGHT = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def _safe_profile(aggressiveness: str) -> str:
    text = (aggressiveness or "balanced").strip().lower()
    if text in {"stealth", "balanced", "aggressive"}:
        return text
    return "balanced"


def _provider_list() -> list[str]:
    allowed = {"codex", "claude", "gemini"}
    out = [p for p in proposal_providers() if p in allowed]
    return out or ["codex", "claude", "gemini"]


def _extract_json_blob(text: str) -> dict[str, Any] | None:
    data = (text or "").strip()
    if not data:
        return None

    try:
        parsed = json.loads(data)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    start = data.find("{")
    end = data.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    maybe = data[start : end + 1]
    try:
        parsed = json.loads(maybe)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return None
    return None


def _normalize_risk(value: str) -> str:
    text = (value or "medium").strip().lower()
    if text in {"low", "medium", "high", "critical"}:
        return text
    return "medium"


def _normalize_cmds(payload: dict[str, Any], max_cmds: int) -> list[dict[str, Any]]:
    raw = payload.get("commands", [])
    if not isinstance(raw, list):
        return []

    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        cmd = item.get("cmd")
        if isinstance(cmd, str):
            cmd_list = [x for x in cmd.strip().split(" ") if x]
        elif isinstance(cmd, list):
            cmd_list = [str(x).strip() for x in cmd if str(x).strip()]
        else:
            cmd_list = []

        if not cmd_list:
            continue

        out.append(
            {
                "id": uuid.uuid4().hex,
                "title": str(item.get("title") or "Command").strip(),
                "cmd": cmd_list,
                "rationale": str(item.get("rationale") or "").strip(),
                "risk": _normalize_risk(str(item.get("risk") or "medium")),
                "expected_artifacts": [
                    str(x).strip() for x in (item.get("expected_artifacts") or []) if str(x).strip()
                ],
            }
        )
        if len(out) >= max_cmds:
            break
    return out


def _prompt_template(
    *,
    project: str,
    target: str,
    purpose: str,
    aggressiveness: str,
    discoveries: list[str],
    provider: str,
) -> str:
    discoveries_block = "\n".join(f"- {d}" for d in discoveries[:20]) or "- none"
    return (
        "You are assisting authorized CTF/lab pentesting only.\n"
        "Return STRICT JSON only with this exact shape:\n"
        '{"commands":[{"title":"...","cmd":["tool","arg"],"rationale":"...","risk":"low|medium|high|critical","expected_artifacts":["..."]}],"notes":["..."]}\n'
        "Rules: max 8 commands, no destructive actions, no data deletion, no DoS guidance, no illegal scope.\n"
        f"Provider: {provider}\n"
        f"Project: {project}\n"
        f"Target: {target}\n"
        f"Purpose: {purpose}\n"
        f"Aggressiveness: {aggressiveness}\n"
        f"Current discoveries:\n{discoveries_block}\n"
        "Focus on recon/enumeration/validation commands with clear rationale and expected artifacts."
    )


def _run_subprocess(cmd: list[str], timeout: int) -> tuple[int, str, str]:
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def _provider_command(provider: str, prompt: str) -> list[str]:
    if provider == "codex":
        return [
            "codex",
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--color",
            "never",
            prompt,
        ]
    if provider == "claude":
        return [
            "claude",
            "-p",
            prompt,
            "--output-format",
            "text",
            "--permission-mode",
            "plan",
        ]
    if provider == "gemini":
        return [
            "gemini",
            "-p",
            prompt,
            "--output-format",
            "text",
            "--approval-mode",
            "plan",
        ]
    return []


def _run_provider(
    *,
    provider: str,
    project: str,
    target: str,
    purpose: str,
    aggressiveness: str,
    discoveries: list[str],
    timeout_sec: int,
    max_cmds: int,
) -> dict[str, Any]:
    binary = shutil.which(provider)
    if not binary:
        return {
            "provider": provider,
            "status": "unavailable",
            "error": f"{provider} CLI not found in PATH",
            "commands": [],
            "notes": [],
            "raw": "",
        }

    prompt = _prompt_template(
        project=project,
        target=target,
        purpose=purpose,
        aggressiveness=aggressiveness,
        discoveries=discoveries,
        provider=provider,
    )
    cmd = _provider_command(provider, prompt)
    if not cmd:
        return {
            "provider": provider,
            "status": "failed",
            "error": "unsupported provider",
            "commands": [],
            "notes": [],
            "raw": "",
        }

    try:
        rc, stdout, stderr = _run_subprocess(cmd, timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        return {
            "provider": provider,
            "status": "timeout",
            "error": f"timeout after {timeout_sec}s",
            "commands": [],
            "notes": [],
            "raw": "",
        }
    except Exception as exc:
        return {
            "provider": provider,
            "status": "failed",
            "error": str(exc),
            "commands": [],
            "notes": [],
            "raw": "",
        }

    raw_text = (stdout or "").strip()
    payload = _extract_json_blob(raw_text)
    if rc != 0:
        return {
            "provider": provider,
            "status": "failed",
            "error": (stderr or f"exit code {rc}")[:600],
            "commands": [],
            "notes": [],
            "raw": raw_text[:2000],
        }

    if payload is None:
        return {
            "provider": provider,
            "status": "invalid_json",
            "error": "provider output did not contain parseable JSON",
            "commands": [],
            "notes": [],
            "raw": raw_text[:2000],
        }

    commands = _normalize_cmds(payload, max_cmds=max_cmds)
    notes = [str(x).strip() for x in (payload.get("notes") or []) if str(x).strip()]

    return {
        "provider": provider,
        "status": "ok",
        "error": "",
        "commands": commands,
        "notes": notes[:20],
        "raw": raw_text[:2000],
    }


def _fingerprint(cmd: list[str]) -> str:
    return " ".join(str(x).strip().lower() for x in cmd if str(x).strip())


def _max_risk(risks: list[str]) -> str:
    if not risks:
        return "medium"
    best = max(risks, key=lambda x: RISK_WEIGHT.get(_normalize_risk(x), 2))
    return _normalize_risk(best)


def _ensemble(provider_results: list[dict[str, Any]], max_cmds: int) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}

    for provider in provider_results:
        name = str(provider.get("provider", "unknown"))
        for item in provider.get("commands", []):
            if not isinstance(item, dict):
                continue
            cmd = item.get("cmd", [])
            if not isinstance(cmd, list) or not cmd:
                continue
            fp = _fingerprint(cmd)
            if not fp:
                continue
            if fp not in merged:
                merged[fp] = {
                    "id": uuid.uuid4().hex,
                    "title": str(item.get("title", "Command")).strip(),
                    "cmd": cmd,
                    "rationale": [str(item.get("rationale", "")).strip()],
                    "risk": [str(item.get("risk", "medium")).strip()],
                    "expected_artifacts": set(item.get("expected_artifacts", [])),
                    "providers": {name},
                }
            else:
                merged[fp]["providers"].add(name)
                merged[fp]["risk"].append(str(item.get("risk", "medium")).strip())
                if item.get("rationale"):
                    merged[fp]["rationale"].append(str(item.get("rationale")))
                for art in item.get("expected_artifacts", []):
                    merged[fp]["expected_artifacts"].add(str(art).strip())

    ranked = []
    for item in merged.values():
        providers = sorted([x for x in item["providers"] if x])
        risk = _max_risk(item["risk"])
        rationale_text = " | ".join([x for x in item["rationale"] if x][:2])
        ranked.append(
            {
                "id": item["id"],
                "title": item["title"],
                "cmd": item["cmd"],
                "rationale": rationale_text,
                "risk": risk,
                "providers": providers,
                "provider_count": len(providers),
                "consensus": len(providers) >= 2,
                "expected_artifacts": sorted([x for x in item["expected_artifacts"] if x]),
            }
        )

    ranked.sort(key=lambda x: (x["provider_count"], -RISK_WEIGHT.get(x["risk"], 2), x["title"]), reverse=True)
    return ranked[:max_cmds]


def generate_command_proposals(
    *,
    project: str,
    target: str,
    purpose: str,
    aggressiveness: str,
    discoveries: list[str] | None = None,
    providers: list[str] | None = None,
) -> dict[str, Any]:
    selected = providers or _provider_list()
    safe_profile = _safe_profile(aggressiveness)
    notes = discoveries or []
    timeout_sec = max(5, proposal_timeout_sec())
    max_cmds = max(1, proposal_max_commands())

    provider_results = [
        _run_provider(
            provider=name,
            project=project,
            target=target,
            purpose=purpose,
            aggressiveness=safe_profile,
            discoveries=notes,
            timeout_sec=timeout_sec,
            max_cmds=max_cmds,
        )
        for name in selected
    ]

    ensemble = _ensemble(provider_results, max_cmds=max_cmds)

    fallback_used = False
    if not ensemble:
        base = build_command_plan(
            project=project,
            target_input=target,
            purpose=purpose,
            profile=safe_profile,
            discoveries=notes,
        )
        ensemble = [
            {
                "id": str(cmd.get("id") or uuid.uuid4().hex),
                "title": str(cmd.get("title", "Command")),
                "cmd": cmd.get("cmd", []),
                "rationale": str(cmd.get("rationale", "")),
                "risk": str(cmd.get("risk", "medium")),
                "providers": ["baseline"],
                "provider_count": 1,
                "consensus": False,
                "expected_artifacts": [str(cmd.get("expected_signal", "")).strip()],
            }
            for cmd in base.get("commands", [])
            if isinstance(cmd, dict)
        ][:max_cmds]
        fallback_used = True

    proposal_id = uuid.uuid4().hex
    out = {
        "proposal_id": proposal_id,
        "project": project,
        "target": target,
        "purpose": purpose,
        "profile": safe_profile,
        "providers": provider_results,
        "ensemble": ensemble,
        "manual_review_required": True,
        "fallback_used": fallback_used,
    }

    logger.info(
        "command proposals generated",
        extra={
            "event": "command_proposals_generated",
            "details": {
                "proposal_id": proposal_id,
                "project": project,
                "target": target,
                "purpose": purpose,
                "profile": safe_profile,
                "providers_requested": selected,
                "providers_ok": [x.get("provider") for x in provider_results if x.get("status") == "ok"],
                "ensemble_count": len(ensemble),
                "fallback_used": fallback_used,
            },
        },
    )
    return out
