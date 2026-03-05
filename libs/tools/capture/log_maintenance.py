from __future__ import annotations

import gzip
import re
import shutil
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from libs.logs import get_logger

logger = get_logger(__name__)

_LOG_NAME_RE = re.compile(r"^terminal_(\d{4}-\d{2}-\d{2})\.log(?:\.gz)?$")


def _extract_log_date(path: Path) -> date | None:
    match = _LOG_NAME_RE.match(path.name)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y-%m-%d").date()
    except ValueError:
        return None


def _age_days(path: Path, today: date) -> int:
    dated = _extract_log_date(path)
    if dated is not None:
        return max(0, (today - dated).days)

    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).date()
    return max(0, (today - mtime).days)


def _iter_session_logs(log_dir: Path) -> list[Path]:
    if not log_dir.exists():
        return []
    return sorted([path for path in log_dir.iterdir() if path.is_file() and _LOG_NAME_RE.match(path.name)])


def _compress_log(path: Path) -> Path:
    target = path.with_suffix(path.suffix + ".gz")
    if target.exists():
        path.unlink(missing_ok=True)
        return target

    with path.open("rb") as src, gzip.open(target, "wb", compresslevel=6) as dst:
        shutil.copyfileobj(src, dst)
    path.unlink(missing_ok=True)
    return target


def maintain_logs(
    log_dir: Path | str,
    compress_after_days: int = 1,
    retention_days: int = 30,
    now_date: date | None = None,
) -> dict[str, Any]:
    folder = Path(log_dir).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    today = now_date or datetime.now(timezone.utc).date()

    summary: dict[str, Any] = {
        "log_dir": str(folder),
        "scanned": 0,
        "compressed": 0,
        "deleted": 0,
        "compressed_files": [],
        "deleted_files": [],
        "errors": [],
        "compress_after_days": compress_after_days,
        "retention_days": retention_days,
    }

    for path in _iter_session_logs(folder):
        summary["scanned"] += 1
        try:
            age = _age_days(path, today)
            is_plain_log = path.name.endswith(".log") and not path.name.endswith(".log.gz")

            if retention_days >= 0 and age > retention_days:
                path.unlink(missing_ok=True)
                summary["deleted"] += 1
                summary["deleted_files"].append(path.name)
                continue

            if compress_after_days >= 0 and is_plain_log and age > 0 and age >= compress_after_days:
                target = _compress_log(path)
                summary["compressed"] += 1
                summary["compressed_files"].append(target.name)
        except Exception as exc:
            summary["errors"].append({"file": path.name, "error": str(exc)})

    logger.info(
        "session log maintenance completed",
        extra={
            "event": "session_log_maintenance",
            "component": "capture",
            "operation": "maintain_logs",
            "details": {
                "log_dir": summary["log_dir"],
                "scanned": summary["scanned"],
                "compressed": summary["compressed"],
                "deleted": summary["deleted"],
                "errors": len(summary["errors"]),
            },
        },
    )
    return summary
