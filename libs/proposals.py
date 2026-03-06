from __future__ import annotations

import json
import re
import shutil
import subprocess
import uuid
from typing import Any

import httpx

from apps.orchestrator.config import (
    local_only_mode,
    ollama_model,
    ollama_url,
    proposal_max_commands,
    proposal_providers,
    proposal_quality_threshold,
    proposal_timeout_sec,
)
from libs.command_planner import build_command_plan
from libs.logs import get_logger

logger = get_logger(__name__)

RISK_WEIGHT = {"low": 1, "medium": 2, "high": 3, "critical": 4}
TOKEN_RE = re.compile(r"[a-z0-9._/-]+")
DANGEROUS_TOKENS = {
    "rm",
    "mkfs",
    "dd",
    "shutdown",
    "reboot",
    "killall",
    "iptables",
    "route",
}


def _safe_profile(aggressiveness: str) -> str:
    text = (aggressiveness or "balanced").strip().lower()
    if text in {"stealth", "balanced", "aggressive"}:
        return text
    return "balanced"


def _safe_stage(stage: str) -> str:
    text = (stage or "").strip().lower()
    if text in {"discover", "fingerprint", "content-enum", "vuln-validate", "report-draft"}:
        return text
    return ""


def _provider_list() -> list[str]:
    if local_only_mode():
        return ["ollama"]

    allowed = {"codex", "claude", "gemini", "ollama"}
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
    stage: str,
    discoveries: list[str],
    provider: str,
) -> str:
    discoveries_block = "\n".join(f"- {d}" for d in discoveries[:20]) or "- none"
    stage_line = stage or "general"
    return (
        "You are assisting authorized CTF/lab pentesting only.\n"
        "Return STRICT JSON only with this exact shape:\n"
        '{"commands":[{"title":"...","cmd":["tool","arg"],"rationale":"...","risk":"low|medium|high|critical","expected_artifacts":["..."]}],"notes":["..."]}\n'
        "Rules: max 8 commands, no destructive actions, no data deletion, no DoS guidance, no illegal scope.\n"
        f"Provider: {provider}\n"
        f"Project: {project}\n"
        f"Target: {target}\n"
        f"Purpose: {purpose}\n"
        f"Stage: {stage_line}\n"
        f"Aggressiveness: {aggressiveness}\n"
        f"Current discoveries:\n{discoveries_block}\n"
        "Focus on stage-appropriate recon/enumeration/validation commands with clear rationale and expected artifacts."
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


def _run_ollama_provider(*, prompt: str, timeout_sec: int) -> tuple[str, str]:
    response = httpx.post(
        f"{ollama_url().rstrip('/')}/api/generate",
        json={"model": ollama_model(), "prompt": prompt, "stream": False},
        timeout=max(5, timeout_sec),
    )
    response.raise_for_status()
    payload = response.json()
    return str(payload.get("response", "")), ""


def _provider_command(provider: str, prompt: str) -> list[str]:
    if provider == "ollama":
        return []
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
    stage: str,
    discoveries: list[str],
    timeout_sec: int,
    max_cmds: int,
) -> dict[str, Any]:
    prompt = _prompt_template(
        project=project,
        target=target,
        purpose=purpose,
        aggressiveness=aggressiveness,
        stage=stage,
        discoveries=discoveries,
        provider=provider,
    )

    if provider == "ollama":
        try:
            raw_text, stderr = _run_ollama_provider(prompt=prompt, timeout_sec=timeout_sec)
            rc = 0
        except httpx.TimeoutException:
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
        raw_text = (raw_text or "").strip()
    else:
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
            rc, raw_text, stderr = _run_subprocess(cmd, timeout=timeout_sec)
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
        raw_text = (raw_text or "").strip()

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


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def _tokenize(text: str) -> set[str]:
    return {tok for tok in TOKEN_RE.findall((text or "").lower()) if len(tok) >= 2}


def _primary_tool(cmd: list[str]) -> str:
    if not cmd:
        return ""
    return str(cmd[0]).strip().lower()


def _feasibility_score(cmd: list[str]) -> float:
    if not cmd:
        return 0.0
    tool = _primary_tool(cmd)
    base = 0.9 if shutil.which(tool) else 0.45
    if tool in {"python", "python3", "bash", "sh"}:
        base = max(base, 0.8)
    if len(cmd) >= 16:
        base -= 0.1
    return _clamp(base)


def _safety_score(cmd: list[str], risk: str) -> float:
    norm_risk = _normalize_risk(risk)
    base = {"low": 0.95, "medium": 0.75, "high": 0.45, "critical": 0.2}.get(norm_risk, 0.75)
    cmd_tokens = _tokenize(" ".join(cmd))
    if cmd_tokens.intersection(DANGEROUS_TOKENS):
        base -= 0.5
    return _clamp(base)


def _evidence_fit_score(cmd: list[str], discoveries: list[str]) -> float:
    if not discoveries:
        return 0.65

    cmd_tokens = _tokenize(" ".join(cmd))
    if not cmd_tokens:
        return 0.0

    discovery_tokens = _tokenize(" ".join(discoveries[:30]))
    if not discovery_tokens:
        return 0.4

    overlap = cmd_tokens.intersection(discovery_tokens)
    ratio = len(overlap) / max(1, len(cmd_tokens))
    return _clamp(0.35 + (ratio * 0.9))


def _novelty_scores(items: list[dict[str, Any]]) -> dict[str, float]:
    counts: dict[str, int] = {}
    for item in items:
        tool = _primary_tool(item.get("cmd", []))
        if not tool:
            continue
        counts[tool] = counts.get(tool, 0) + 1

    out: dict[str, float] = {}
    for item in items:
        cmd = item.get("cmd", [])
        fp = _fingerprint(cmd if isinstance(cmd, list) else [])
        tool = _primary_tool(cmd if isinstance(cmd, list) else [])
        count = counts.get(tool, 1)
        score = 1.0 if count <= 1 else max(0.45, 1.0 - (0.2 * (count - 1)))
        out[fp] = score
    return out


def _grade(score: float) -> str:
    if score >= 85:
        return "A"
    if score >= 70:
        return "B"
    if score >= 55:
        return "C"
    return "D"


def _quality_weights(stage: str, purpose: str) -> dict[str, float]:
    safe_stage = _safe_stage(stage)
    safe_purpose = (purpose or "").strip().lower()

    if safe_stage == "discover":
        return {"feasibility": 0.4, "safety": 0.3, "evidence_fit": 0.2, "novelty": 0.1}
    if safe_stage == "fingerprint":
        return {"feasibility": 0.35, "safety": 0.35, "evidence_fit": 0.2, "novelty": 0.1}
    if safe_stage == "content-enum":
        return {"feasibility": 0.35, "safety": 0.3, "evidence_fit": 0.25, "novelty": 0.1}
    if safe_stage == "vuln-validate":
        return {"feasibility": 0.25, "safety": 0.45, "evidence_fit": 0.2, "novelty": 0.1}
    if safe_stage == "report-draft":
        return {"feasibility": 0.45, "safety": 0.35, "evidence_fit": 0.15, "novelty": 0.05}
    if safe_purpose in {"cracking", "password", "hash"}:
        return {"feasibility": 0.3, "safety": 0.45, "evidence_fit": 0.15, "novelty": 0.1}
    return {"feasibility": 0.35, "safety": 0.35, "evidence_fit": 0.2, "novelty": 0.1}


def _apply_quality_scoring(
    items: list[dict[str, Any]],
    discoveries: list[str],
    threshold: int,
    purpose: str,
    stage: str,
) -> list[dict[str, Any]]:
    novelty_by_fp = _novelty_scores(items)
    scored: list[dict[str, Any]] = []
    weights = _quality_weights(stage=stage, purpose=purpose)
    min_safety = 0.6 if _safe_stage(stage) == "vuln-validate" else 0.5

    for item in items:
        cmd = item.get("cmd", [])
        if not isinstance(cmd, list):
            cmd = []
        risk = str(item.get("risk", "medium"))
        fp = _fingerprint(cmd)
        feasibility = _feasibility_score(cmd)
        safety = _safety_score(cmd, risk)
        evidence_fit = _evidence_fit_score(cmd, discoveries)
        novelty = novelty_by_fp.get(fp, 0.6)
        total = (
            (weights["feasibility"] * feasibility)
            + (weights["safety"] * safety)
            + (weights["evidence_fit"] * evidence_fit)
            + (weights["novelty"] * novelty)
        )
        score = round(total * 100, 1)
        recommended = bool(
            score >= threshold and _normalize_risk(risk) != "critical" and safety >= min_safety
        )

        next_item = dict(item)
        next_item["quality"] = {
            "score": score,
            "grade": _grade(score),
            "recommended": recommended,
            "feasibility": round(feasibility, 3),
            "safety": round(safety, 3),
            "evidence_fit": round(evidence_fit, 3),
            "novelty": round(novelty, 3),
            "explanation": (
                "weighted score by stage"
            ),
            "weights": weights,
            "stage": _safe_stage(stage) or "general",
        }
        scored.append(next_item)

    scored.sort(
        key=lambda x: (
            float(x.get("quality", {}).get("score", 0.0)),
            int(x.get("provider_count", 0)),
            -RISK_WEIGHT.get(_normalize_risk(str(x.get("risk", "medium"))), 2),
            str(x.get("title", "")),
        ),
        reverse=True,
    )
    return scored


def _quality_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    if not items:
        return {"count": 0, "recommended": 0, "avg_score": 0.0, "grade_mix": {}}
    scores = [float(i.get("quality", {}).get("score", 0.0)) for i in items]
    recommended = sum(1 for i in items if bool(i.get("quality", {}).get("recommended")))
    grade_mix: dict[str, int] = {}
    for item in items:
        grade = str(item.get("quality", {}).get("grade", "D"))
        grade_mix[grade] = grade_mix.get(grade, 0) + 1
    return {
        "count": len(items),
        "recommended": recommended,
        "avg_score": round(sum(scores) / len(scores), 2),
        "grade_mix": grade_mix,
    }


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
    stage: str = "",
) -> dict[str, Any]:
    if local_only_mode():
        selected = ["ollama"]
    else:
        selected = providers or _provider_list()
    safe_profile = _safe_profile(aggressiveness)
    safe_stage = _safe_stage(stage)
    notes = discoveries or []
    timeout_sec = max(5, proposal_timeout_sec())
    max_cmds = max(1, proposal_max_commands())
    quality_threshold = max(1, min(100, proposal_quality_threshold()))

    provider_results = [
        _run_provider(
            provider=name,
            project=project,
            target=target,
            purpose=purpose,
            aggressiveness=safe_profile,
            stage=safe_stage,
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

    ensemble = _apply_quality_scoring(
        ensemble,
        discoveries=notes,
        threshold=quality_threshold,
        purpose=purpose,
        stage=safe_stage,
    )[:max_cmds]
    quality_summary = _quality_summary(ensemble)

    proposal_id = uuid.uuid4().hex
    out = {
        "proposal_id": proposal_id,
        "project": project,
        "target": target,
        "purpose": purpose,
        "stage": safe_stage,
        "profile": safe_profile,
        "operating_mode": "local_only" if local_only_mode() else "mixed",
        "quality_threshold": quality_threshold,
        "quality_summary": quality_summary,
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
                "stage": safe_stage,
                "profile": safe_profile,
                "providers_requested": selected,
                "providers_ok": [x.get("provider") for x in provider_results if x.get("status") == "ok"],
                "ensemble_count": len(ensemble),
                "recommended_count": quality_summary.get("recommended", 0),
                "fallback_used": fallback_used,
            },
        },
    )
    return out
