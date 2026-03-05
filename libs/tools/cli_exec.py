from __future__ import annotations

import os
import shlex
import subprocess
import time
from dataclasses import dataclass
from typing import Sequence

from libs.logs import get_logger

logger = get_logger(__name__)


@dataclass
class CmdResult:
    cmd: list[str]
    stdout: str
    stderr: str
    returncode: int


def _allowed_tools() -> set[str]:
    raw = os.getenv("AICL_ALLOWED_TOOLS", "nmap,ffuf,gobuster,nikto,whatweb")
    return {x.strip() for x in raw.split(",") if x.strip()}


def run_cmd(cmd: Sequence[str], timeout: int = 120) -> CmdResult:
    if not cmd:
        raise ValueError("Command cannot be empty")

    base = cmd[0]
    if base not in _allowed_tools():
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

    start = time.monotonic()
    proc = subprocess.run(
        list(cmd),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
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
