from __future__ import annotations

import os
import shlex
import subprocess
import time
from dataclasses import dataclass
from typing import Sequence

import httpx

from apps.orchestrator.config import exec_backend, tool_exec_timeout_s, tool_exec_url
from libs.logs import get_logger

logger = get_logger(__name__)


@dataclass
class CmdResult:
    cmd: list[str]
    stdout: str
    stderr: str
    returncode: int


def _allowed_tools() -> set[str]:
    raw = os.getenv(
        "AICL_ALLOWED_TOOLS",
        "nmap,ffuf,gobuster,nikto,whatweb,sqlmap,nuclei,python2,python3,pip,pip2,pytest,uv",
    )
    return {x.strip() for x in raw.split(",") if x.strip()}


def _require_allowed(cmd: Sequence[str]) -> None:
    base = str(cmd[0])
    if base in _allowed_tools():
        return
    logger.warning(
        "blocked command execution",
        extra={
            "event": "command_blocked",
            "details": {"cmd": shlex.join(cmd), "tool": base},
        },
    )
    raise PermissionError(
        f"Tool '{base}' is not allowed by AICL_ALLOWED_TOOLS. "
        f"Requested: {shlex.join(cmd)}"
    )


def _run_host_cmd(cmd: Sequence[str], timeout: int) -> CmdResult:
    start = time.monotonic()
    try:
        proc = subprocess.run(
            list(cmd),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.warning(
            "command timed out",
            extra={
                "event": "command_timeout",
                "details": {"cmd": shlex.join(cmd), "duration_ms": elapsed_ms, "timeout_s": timeout},
            },
        )
        raise
    except FileNotFoundError:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.warning(
            "command not found",
            extra={
                "event": "command_not_found",
                "details": {"cmd": shlex.join(cmd), "duration_ms": elapsed_ms},
            },
        )
        raise
    elapsed_ms = int((time.monotonic() - start) * 1000)
    logger.info(
        "command executed",
        extra={
            "event": "command_executed",
            "details": {
                "cmd": shlex.join(cmd),
                "returncode": proc.returncode,
                "duration_ms": elapsed_ms,
                "stdout_chars": len(proc.stdout or ""),
                "stderr_chars": len(proc.stderr or ""),
            },
        },
    )
    return CmdResult(
        cmd=list(cmd),
        stdout=proc.stdout,
        stderr=proc.stderr,
        returncode=proc.returncode,
    )


def _run_service_cmd(cmd: Sequence[str], timeout: int) -> CmdResult:
    started = time.monotonic()
    payload = {"cmd": list(cmd), "timeout": timeout}
    request_timeout = max(tool_exec_timeout_s(), float(timeout) + 8.0)
    url = f"{tool_exec_url().rstrip('/')}/run"

    try:
        with httpx.Client(timeout=request_timeout) as client:
            resp = client.post(url, json=payload)
    except Exception as exc:
        raise RuntimeError(f"tool exec service request failed ({url}): {exc}") from exc

    elapsed_ms = int((time.monotonic() - started) * 1000)
    if resp.status_code != 200:
        detail = resp.text
        try:
            body = resp.json()
            detail = str(body.get("message", body))
        except Exception:
            pass
        if resp.status_code == 403:
            raise PermissionError(detail)
        if resp.status_code == 408:
            raise subprocess.TimeoutExpired(cmd=list(cmd), timeout=timeout, output=detail)
        raise RuntimeError(f"tool exec service returned {resp.status_code}: {detail}")

    data = resp.json()
    logger.info(
        "command executed via service",
        extra={
            "event": "command_executed_service",
            "details": {
                "cmd": shlex.join(cmd),
                "returncode": data.get("returncode", 0),
                "duration_ms": data.get("duration_ms", elapsed_ms),
                "service_url": url,
                "executor": data.get("executor", "service"),
                "target": data.get("target", ""),
            },
        },
    )
    return CmdResult(
        cmd=list(cmd),
        stdout=str(data.get("stdout", "")),
        stderr=str(data.get("stderr", "")),
        returncode=int(data.get("returncode", 1)),
    )


def run_cmd(cmd: Sequence[str], timeout: int = 120) -> CmdResult:
    if not cmd:
        raise ValueError("Command cannot be empty")
    _require_allowed(cmd)

    backend = exec_backend()
    if backend == "service":
        return _run_service_cmd(cmd, timeout)
    return _run_host_cmd(cmd, timeout)
