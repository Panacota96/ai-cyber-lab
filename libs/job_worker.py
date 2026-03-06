from __future__ import annotations

import re
import threading
import time
from pathlib import Path
from typing import Any

import httpx

from apps.orchestrator.config import data_root, tool_exec_timeout_s, tool_exec_url
from libs.logs import get_logger
from libs.tools.parsers.httpx_parser import parse_httpx_output
from libs.tools.parsers.nuclei_parser import parse_nuclei_findings
from libs.workbench_db import add_facts, claim_next_queued_job, complete_job

logger = get_logger(__name__)

_URL_RE = re.compile(r"https?://[^\s'\"<>]+", re.IGNORECASE)
_DOMAIN_RE = re.compile(r"\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b")
_USER_RE = re.compile(r"(?im)\b(?:user(?:name)?|login)\s*[:=]\s*([\w.@-]{2,64})")
_PASSWORD_RE = re.compile(r"(?im)\b(?:pass(?:word)?|pwd)\s*[:=]\s*(\S{2,128})")
_HASH_RE = re.compile(r"\b(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})\b")


def _facts_from_output(
    project: str,
    session_id: str | None,
    job_id: str,
    cmd: list[str],
    stdout: str,
    target: str,
) -> list[dict[str, Any]]:
    facts: list[dict[str, Any]] = []
    seen: set[tuple[str, ...]] = set()

    host = target.strip() or "unknown-target"

    def add_entity(entity_type: str, value: str, confidence: float, source: str, details: dict[str, Any]) -> None:
        val = value.strip()
        if not val:
            return
        key = ("entity", entity_type.lower(), val.lower())
        if key in seen:
            return
        seen.add(key)
        facts.append(
            {
                "project": project,
                "session_id": session_id,
                "job_id": job_id,
                "source": source,
                "key_name": entity_type,
                "value": val,
                "confidence": confidence,
                "status": "pending",
                "fact_kind": "entity",
                "entity_type": entity_type.lower(),
                "subject_type": entity_type.lower(),
                "subject_value": val,
                "details": details,
            }
        )

    def add_relation(
        subject_type: str,
        subject_value: str,
        relation: str,
        object_type: str,
        object_value: str,
        confidence: float,
        source: str,
        details: dict[str, Any],
    ) -> None:
        sv = subject_value.strip()
        ov = object_value.strip()
        if not sv or not ov:
            return
        key = (
            "relation",
            subject_type.lower(),
            sv.lower(),
            relation.lower(),
            object_type.lower(),
            ov.lower(),
        )
        if key in seen:
            return
        seen.add(key)
        facts.append(
            {
                "project": project,
                "session_id": session_id,
                "job_id": job_id,
                "source": source,
                "key_name": relation.lower(),
                "value": f"{sv} -> {relation.lower()} -> {ov}",
                "confidence": confidence,
                "status": "pending",
                "fact_kind": "relation",
                "subject_type": subject_type.lower(),
                "subject_value": sv,
                "relation": relation.lower(),
                "object_type": object_type.lower(),
                "object_value": ov,
                "details": details,
            }
        )

    add_entity("host", host, 1.0, "job", {"origin": "job_target"})

    joined = " ".join(cmd).lower()
    if "nmap" in joined:
        for line in stdout.splitlines():
            m = re.match(r"^(\d+)\/tcp\s+open\s+(\S+)\s*(.*)$", line.strip())
            if not m:
                continue
            port = m.group(1)
            service = m.group(2)
            extra = m.group(3).strip()
            port_node = f"{port}/tcp"

            add_entity("port", port_node, 0.98, "nmap", {"line": line.strip()})
            add_relation("host", host, "exposes", "port", port_node, 0.98, "nmap", {"line": line.strip()})

            add_entity("service", service, 0.9, "nmap", {"line": line.strip()})
            add_relation("port", port_node, "runs", "service", service, 0.9, "nmap", {"line": line.strip()})

            if extra:
                add_entity("version", extra, 0.72, "nmap", {"line": line.strip()})
                add_relation("service", service, "version_of", "version", extra, 0.72, "nmap", {"line": line.strip()})

    if "curl" in joined:
        for line in stdout.splitlines():
            if line.lower().startswith("server:"):
                server = line.split(":", 1)[-1].strip()
                add_entity("service", server, 0.82, "curl", {"header": "server"})
                add_relation("host", host, "serves", "service", server, 0.82, "curl", {"header": "server"})

    if "httpx" in joined:
        for row in parse_httpx_output(stdout):
            url = str(row.get("url", "")).strip()
            if not url:
                continue
            status = int(row.get("status", 0))
            title = str(row.get("title", "")).strip()
            tags = row.get("tags", []) if isinstance(row.get("tags"), list) else []

            add_entity("url", url, 0.88, "httpx", {"status": status, "title": title, "tags": tags})
            add_relation("host", host, "responds_at", "url", url, 0.88, "httpx", {"status": status})
            if status > 0:
                add_entity("http_status", str(status), 0.84, "httpx", {"url": url})
                add_relation("url", url, "returns_status", "http_status", str(status), 0.84, "httpx", {})
            if title:
                add_entity("web_title", title, 0.72, "httpx", {"url": url})
                add_relation("url", url, "has_title", "web_title", title, 0.72, "httpx", {})
            for tag in tags[:8]:
                add_entity("technology", str(tag), 0.7, "httpx", {"url": url})
                add_relation("url", url, "uses_technology", "technology", str(tag), 0.7, "httpx", {})

    if "nuclei" in joined:
        for finding in parse_nuclei_findings(stdout):
            target_url = str(finding.get("target", "")).strip()
            template_id = str(finding.get("template_id", "")).strip()
            severity = str(finding.get("severity", "info")).strip().lower()
            if not target_url or not template_id:
                continue
            finding_node = f"{template_id}@{target_url}"
            add_entity(
                "vulnerability",
                finding_node,
                0.86,
                "nuclei",
                {
                    "template_id": template_id,
                    "severity": severity,
                    "protocol": finding.get("protocol", ""),
                },
            )
            add_relation("url", target_url, "has_finding", "vulnerability", finding_node, 0.86, "nuclei", {})
            add_relation("vulnerability", finding_node, "severity", "level", severity, 0.8, "nuclei", {})
            add_relation("host", host, "mentions", "url", target_url, 0.65, "nuclei", {})

    for url in _URL_RE.findall(stdout):
        add_entity("url", url, 0.74, "regex", {"pattern": "url"})
        add_relation("host", host, "references", "url", url, 0.74, "regex", {"pattern": "url"})

    for domain in _DOMAIN_RE.findall(stdout):
        if domain.lower() == host.lower():
            continue
        add_entity("domain", domain, 0.7, "regex", {"pattern": "domain"})
        add_relation("host", host, "resolves_to", "domain", domain, 0.7, "regex", {"pattern": "domain"})

    users = [x.group(1) for x in _USER_RE.finditer(stdout)]
    passwords = [x.group(1) for x in _PASSWORD_RE.finditer(stdout)]

    for user in users:
        add_entity("user", user, 0.64, "regex", {"pattern": "user"})
        add_relation("host", host, "mentions", "user", user, 0.64, "regex", {"pattern": "user"})

    for password in passwords:
        add_entity("password", password, 0.55, "regex", {"pattern": "password"})

    if users and passwords:
        # Pair first seen candidates for human review.
        for user, password in zip(users[:3], passwords[:3]):
            add_relation("user", user, "has_secret", "password", password, 0.5, "regex", {"pattern": "credential_pair"})

    for h in _HASH_RE.findall(stdout):
        add_entity("hash", h, 0.62, "regex", {"pattern": "hash"})
        add_relation("host", host, "mentions", "hash", h, 0.62, "regex", {"pattern": "hash"})

    return facts


class JobWorker:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run_loop, name="aicl-job-worker", daemon=True)
        self._thread.start()
        logger.info("job worker started", extra={"event": "job_worker_started"})

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        logger.info("job worker stopped", extra={"event": "job_worker_stopped"})

    def status(self) -> dict[str, Any]:
        return {
            "running": bool(self._thread and self._thread.is_alive()),
            "stop_requested": self._stop.is_set(),
        }

    def _run_loop(self) -> None:
        while not self._stop.is_set():
            job = claim_next_queued_job()
            if not job:
                time.sleep(0.4)
                continue
            try:
                self._execute(job)
            except Exception as exc:
                logger.exception(
                    "job execution loop failed",
                    extra={"event": "job_worker_error", "details": {"job_id": job.get("job_id"), "error": str(exc)}},
                )
                complete_job(
                    job_id=str(job.get("job_id")),
                    status="failed",
                    stdout_path="",
                    stderr_path="",
                    returncode=None,
                    error=str(exc),
                )

    def _execute(self, job: dict[str, Any]) -> None:
        job_id = str(job.get("job_id", ""))
        project = str(job.get("project", "default"))
        session_id = job.get("session_id")
        cmd = job.get("command_json")
        target = str(job.get("target", "")).strip()
        if not isinstance(cmd, list) or not cmd:
            complete_job(
                job_id=job_id,
                status="failed",
                stdout_path="",
                stderr_path="",
                returncode=None,
                error="Invalid command payload",
            )
            return

        timeout_sec = int(job.get("timeout_sec") or 120)
        payload = {"cmd": cmd, "timeout": timeout_sec, "project": project}
        exec_url = f"{tool_exec_url().rstrip('/')}/run"
        stdout = ""
        stderr = ""
        returncode: int | None = None
        status = "failed"
        err = ""

        try:
            with httpx.Client(timeout=max(timeout_sec + 2, tool_exec_timeout_s() + 2)) as client:
                response = client.post(exec_url, json=payload)
                if response.status_code == 200:
                    body = response.json()
                    stdout = str(body.get("stdout", ""))
                    stderr = str(body.get("stderr", ""))
                    returncode = int(body.get("returncode", 1))
                    status = "completed" if returncode == 0 else "failed"
                else:
                    err = f"tool-exec status={response.status_code} body={response.text[:300]}"
        except Exception as exc:
            err = str(exc)

        out_dir = data_root() / "projects" / project / "jobs"
        out_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = out_dir / f"{job_id}.stdout.log"
        stderr_path = out_dir / f"{job_id}.stderr.log"
        stdout_path.write_text(stdout, encoding="utf-8")
        stderr_path.write_text(stderr if stderr else err, encoding="utf-8")

        complete_job(
            job_id=job_id,
            status=status,
            stdout_path=str(stdout_path),
            stderr_path=str(stderr_path),
            returncode=returncode,
            error=err,
        )

        if status == "completed":
            facts = _facts_from_output(
                project=project,
                session_id=session_id,
                job_id=job_id,
                cmd=cmd,
                stdout=stdout,
                target=target,
            )
            added = add_facts(facts)
            logger.info(
                "job completed",
                extra={
                    "event": "job_completed",
                    "details": {"job_id": job_id, "project": project, "returncode": returncode, "facts_added": added},
                },
            )
        else:
            logger.warning(
                "job failed",
                extra={"event": "job_failed", "details": {"job_id": job_id, "project": project, "error": err[:500]}},
            )


WORKER = JobWorker()


def job_worker_status() -> dict[str, Any]:
    return WORKER.status()
