from __future__ import annotations

import argparse
import json

import uvicorn
from fastapi import FastAPI, Query
from pydantic import BaseModel, Field

from apps.orchestrator.config import api_host, api_port
from apps.orchestrator.graph import run_orchestrator
from libs.logs import get_logger, log_stats, read_recent_logs, setup_logging

setup_logging()
logger = get_logger(__name__)

app = FastAPI(title="AI Cyber Lab Orchestrator", version="0.1.0")


class RouteRequest(BaseModel):
    user_input: str = Field(..., min_length=1)
    project: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    logger.info("health check", extra={"event": "health_check"})
    return {"status": "ok"}


@app.post("/route")
def route(req: RouteRequest) -> dict[str, str]:
    logger.info(
        "route requested",
        extra={
            "event": "route_requested",
            "details": {
                "project": req.project or "default",
                "input_preview": req.user_input[:200],
            },
        },
    )
    out = run_orchestrator(req.user_input, req.project)
    logger.info(
        "route completed",
        extra={
            "event": "route_completed",
            "details": {"project": out.get("project"), "route": out.get("route")},
        },
    )
    return out


@app.get("/logs")
def logs(lines: int = Query(default=200, ge=1, le=2000)) -> dict[str, object]:
    return {"stats": log_stats(), "lines": read_recent_logs(lines=lines)}


def _run_cli() -> None:
    parser = argparse.ArgumentParser(description="Run the AI Cyber Lab orchestrator")
    parser.add_argument("input", nargs="?", help="User input routed to one agent")
    parser.add_argument("--project", default=None, help="Project slug")
    parser.add_argument("--serve", action="store_true", help="Run FastAPI server")
    args = parser.parse_args()

    if args.serve:
        logger.info(
            "starting api server",
            extra={
                "event": "api_start",
                "details": {"host": api_host(), "port": api_port()},
            },
        )
        uvicorn.run(
            "apps.orchestrator.main:app",
            host=api_host(),
            port=api_port(),
            reload=False,
            loop="asyncio",
        )
        return

    if not args.input:
        parser.error("input is required unless --serve is set")

    output = run_orchestrator(args.input, args.project)
    logger.info(
        "cli route completed",
        extra={
            "event": "cli_route_completed",
            "details": {"project": output.get("project"), "route": output.get("route")},
        },
    )
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    _run_cli()
