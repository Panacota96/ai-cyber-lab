from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any

from apps.orchestrator.config import log_level, log_max_bytes, log_path

_LOGGER_READY = False
_LOCK = threading.Lock()

try:
    import fcntl  # type: ignore

    HAS_FCNTL = True
except Exception:
    fcntl = None
    HAS_FCNTL = False


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "module": record.module,
            "line": record.lineno,
            "message": record.getMessage(),
        }

        event = getattr(record, "event", None)
        if event:
            payload["event"] = event

        details = getattr(record, "details", None)
        if isinstance(details, dict):
            payload["details"] = details

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=True)


class SizeCappedFileHandler(logging.FileHandler):
    def __init__(self, filename: str, max_bytes: int, encoding: str = "utf-8"):
        super().__init__(filename=filename, mode="a", encoding=encoding)
        self.max_bytes = max_bytes

    def emit(self, record: logging.LogRecord) -> None:
        with _LOCK:
            lock_file = self.stream
            if HAS_FCNTL and lock_file is not None:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                super().emit(record)
                self.flush()
                self._enforce_cap()
            finally:
                if HAS_FCNTL and lock_file is not None:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def _enforce_cap(self) -> None:
        path = Path(self.baseFilename)
        if not path.exists():
            return

        _enforce_log_cap_file(path, self.max_bytes)


def _enforce_log_cap_file(path: Path, max_bytes: int) -> None:
    if not path.exists():
        return

    size = path.stat().st_size
    if size <= max_bytes:
        return

    with path.open("rb+") as f:
        f.seek(0, 2)
        size = f.tell()
        if size <= max_bytes:
            return

        f.seek(max(0, size - max_bytes))
        chunk = f.read()

        first_newline = chunk.find(b"\n")
        if first_newline != -1 and first_newline + 1 < len(chunk):
            chunk = chunk[first_newline + 1 :]

        if len(chunk) > max_bytes:
            chunk = chunk[-max_bytes:]

        f.seek(0)
        f.write(chunk)
        f.truncate()


def enforce_log_cap() -> None:
    _enforce_log_cap_file(log_path(), log_max_bytes())


def setup_logging() -> None:
    global _LOGGER_READY
    if _LOGGER_READY:
        return

    path = log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    enforce_log_cap()

    handler = SizeCappedFileHandler(str(path), max_bytes=log_max_bytes())
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(getattr(logging, log_level().upper(), logging.INFO))
    root.addHandler(handler)

    # Make uvicorn logs flow to root file handler.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True

    logging.getLogger(__name__).info(
        "logging initialized",
        extra={
            "event": "logging_initialized",
            "details": {
                "log_file": str(path),
                "max_bytes": log_max_bytes(),
                "level": log_level().upper(),
            },
        },
    )
    _LOGGER_READY = True


def get_logger(name: str) -> logging.Logger:
    setup_logging()
    return logging.getLogger(name)


def read_recent_logs(lines: int = 200) -> list[str]:
    enforce_log_cap()
    path = log_path()
    if not path.exists():
        return []

    content = path.read_text(encoding="utf-8", errors="ignore")
    rows = [line for line in content.splitlines() if line.strip()]
    return rows[-max(1, min(lines, 2000)) :]


def log_stats() -> dict[str, Any]:
    enforce_log_cap()
    path = log_path()
    size = path.stat().st_size if path.exists() else 0
    return {
        "log_file": str(path),
        "size_bytes": size,
        "max_bytes": log_max_bytes(),
        "within_limit": size <= log_max_bytes(),
    }
