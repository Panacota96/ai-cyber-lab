from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import subprocess
import time
from typing import Any

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from apps.orchestrator.config import (
    api_host,
    exegol_container,
    py2_container,
    py3_container,
    tools_core_container,
)
from libs.errors import api_error
from libs.logs import get_logger, setup_logging
from libs.tools.tool_profiles import allowed_tools, available_profiles, selected_profile

setup_logging()
logger = get_logger(__name__)

app = FastAPI(title="AI Cyber Lab Tool Executor", version="0.1.0")


class RunRequest(BaseModel):
    cmd: list[str] = Field(..., min_length=1)
    timeout: int = Field(default=120, ge=1, le=3600)
    project: str | None = None


class RunResponse(BaseModel):
    cmd: list[str]
    executor: str
    target: str
    stdout: str
    stderr: str
    returncode: int
    duration_ms: int


def _allowed_tools() -> set[str]:
    return allowed_tools()


def _tool_exec_mode() -> str:
    return os.getenv("AICL_TOOL_EXEC_MODE", "docker").strip().lower()


def _parse_container_map() -> dict[str, str]:
    default = {
        "python2": py2_container(),
        "pip2": py2_container(),
        "python3": py3_container(),
        "pip": py3_container(),
        "pytest": py3_container(),
        "uv": py3_container(),
    }
    raw = os.getenv("AICL_TOOL_CONTAINER_MAP", "").strip()
    if not raw:
        return default

    merged = dict(default)
    for item in raw.split(","):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        k = key.strip()
        v = value.strip()
        if k and v:
            merged[k] = v
    return merged


def _target_for_tool(tool: str) -> str:
    mapping = _parse_container_map()
    if tool in mapping:
        return mapping[tool]
    if _tool_exec_mode() == "exegol":
        return exegol_container()
    return tools_core_container()


def _run_local(cmd: list[str], timeout: int) -> RunResponse:
    started = time.monotonic()
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    elapsed = int((time.monotonic() - started) * 1000)
    return RunResponse(
        cmd=cmd,
        executor="local",
        target="host",
        stdout=proc.stdout or "",
        stderr=proc.stderr or "",
        returncode=proc.returncode,
        duration_ms=elapsed,
    )


def _load_docker_sdk():
    try:
        import docker as docker_sdk  # type: ignore

        return docker_sdk
    except Exception:
        return None


def _run_docker_sdk(target: str, cmd: list[str], timeout: int) -> RunResponse:
    docker_sdk = _load_docker_sdk()
    if docker_sdk is None:
        raise RuntimeError("docker sdk is unavailable and docker cli is not present")

    started = time.monotonic()
    client = docker_sdk.from_env(timeout=timeout)
    try:
        container = client.containers.get(target)
        out = container.exec_run(cmd, stdout=True, stderr=True, demux=True)
        stdout_b: bytes | None
        stderr_b: bytes | None
        if isinstance(out.output, tuple):
            stdout_b, stderr_b = out.output
        else:
            stdout_b, stderr_b = out.output, b""
        elapsed = int((time.monotonic() - started) * 1000)
        return RunResponse(
            cmd=cmd,
            executor="docker-sdk",
            target=target,
            stdout=(stdout_b or b"").decode("utf-8", errors="ignore"),
            stderr=(stderr_b or b"").decode("utf-8", errors="ignore"),
            returncode=int(out.exit_code or 0),
            duration_ms=elapsed,
        )
    finally:
        client.close()


def _run_docker(target: str, cmd: list[str], timeout: int) -> RunResponse:
    docker_bin = shutil.which("docker")
    if not docker_bin:
        logger.warning(
            "docker cli missing in tool-exec; using docker sdk fallback",
            extra={"event": "tool_exec_docker_cli_missing", "details": {"target": target}},
        )
        return _run_docker_sdk(target, cmd, timeout)

    docker_cmd = [docker_bin, "exec", "-i", target, *cmd]
    started = time.monotonic()
    proc = subprocess.run(docker_cmd, capture_output=True, text=True, timeout=timeout, check=False)
    elapsed = int((time.monotonic() - started) * 1000)
    return RunResponse(
        cmd=cmd,
        executor="docker-exec",
        target=target,
        stdout=proc.stdout or "",
        stderr=proc.stderr or "",
        returncode=proc.returncode,
        duration_ms=elapsed,
    )


def _require_allowed(cmd: list[str]) -> None:
    tool = cmd[0]
    if tool in _allowed_tools():
        return
    raise PermissionError(
        f"Tool '{tool}' is not allowed by AICL_ALLOWED_TOOLS. Requested: {shlex.join(cmd)}"
    )


def _run_with_mode(cmd: list[str], timeout: int) -> RunResponse:
    _require_allowed(cmd)
    mode = _tool_exec_mode()
    if mode == "local":
        return _run_local(cmd, timeout)
    target = _target_for_tool(cmd[0])
    return _run_docker(target, cmd, timeout)


def _container_names_via_sdk(timeout: int = 5) -> set[str]:
    docker_sdk = _load_docker_sdk()
    if docker_sdk is None:
        return set()

    client = docker_sdk.from_env(timeout=timeout)
    try:
        return {c.name for c in client.containers.list()}
    except Exception:
        return set()
    finally:
        client.close()


def _container_status() -> dict[str, bool]:
    targets = {
        "tools-core": tools_core_container(),
        "exegol": exegol_container(),
        "py2": py2_container(),
        "py3": py3_container(),
    }
    mode = _tool_exec_mode()
    if mode == "local":
        return {name: True for name in targets}

    docker_bin = shutil.which("docker")
    names: set[str] = set()
    if docker_bin:
        proc = subprocess.run(
            [docker_bin, "ps", "--format", "{{.Names}}"],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode == 0:
            names = {line.strip() for line in (proc.stdout or "").splitlines() if line.strip()}

    if not names:
        names = _container_names_via_sdk()

    return {name: container in names for name, container in targets.items()}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/capabilities")
def capabilities() -> dict[str, Any]:
    return {
        "mode": _tool_exec_mode(),
        "tool_profile": selected_profile(),
        "available_profiles": available_profiles(),
        "allowed_tools": sorted(_allowed_tools()),
        "tool_container_map": _parse_container_map(),
        "container_status": _container_status(),
    }


@app.post("/run")
def run(req: RunRequest) -> RunResponse:
    try:
        out = _run_with_mode(req.cmd, req.timeout)
        logger.info(
            "tool command executed",
            extra={
                "event": "tool_exec_run",
                "component": "tool-exec",
                "operation": "run",
                "details": {
                    "cmd": shlex.join(req.cmd),
                    "executor": out.executor,
                    "target": out.target,
                    "returncode": out.returncode,
                    "duration_ms": out.duration_ms,
                    "project": req.project or "default",
                },
            },
        )
        return out
    except PermissionError as exc:
        return JSONResponse(
            status_code=403,
            content=api_error(
                error_code="TOOL_BLOCKED",
                component="tool-exec",
                operation="run",
                message=str(exc),
            ),
        )
    except subprocess.TimeoutExpired as exc:
        return JSONResponse(
            status_code=408,
            content=api_error(
                error_code="TOOL_TIMEOUT",
                component="tool-exec",
                operation="run",
                message="tool execution timed out",
                details={"timeout": req.timeout, "cmd": shlex.join(req.cmd), "error": str(exc)},
            ),
        )
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content=api_error(
                error_code="TOOL_EXEC_FAILED",
                component="tool-exec",
                operation="run",
                message="tool execution failed",
                details={"cmd": shlex.join(req.cmd), "error": str(exc)},
            ),
        )


def _run_cli() -> None:
    parser = argparse.ArgumentParser(description="Run the tool execution microservice")
    parser.add_argument("--serve", action="store_true", help="Run FastAPI server")
    parser.add_argument("--host", default=api_host())
    parser.add_argument("--port", type=int, default=int(os.getenv("AICL_TOOL_EXEC_PORT", "8082")))
    parser.add_argument("cmd", nargs="*", help="Execute one command directly")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    if args.serve:
        uvicorn.run("apps.tool_exec.main:app", host=args.host, port=args.port, reload=False)
        return

    if not args.cmd:
        parser.error("command is required unless --serve is set")

    out = _run_with_mode(args.cmd, args.timeout)
    print(json.dumps(out.model_dump(), indent=2))


if __name__ == "__main__":
    _run_cli()
