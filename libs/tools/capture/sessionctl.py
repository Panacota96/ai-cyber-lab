from __future__ import annotations

import argparse
import json
from pathlib import Path

from apps.orchestrator.config import (
    session_log_compress_after_days,
    session_log_dir,
    session_log_retention_days,
)
from libs.sessions import end_session, get_current_session, start_session
from libs.tools.capture.log_maintenance import maintain_logs


def main() -> None:
    parser = argparse.ArgumentParser(description="Session control for AICL")
    parser.add_argument("action", choices=["start", "end", "current", "maintain"])
    parser.add_argument("--project", default="default")
    parser.add_argument("--operator", default="unknown")
    parser.add_argument("--session-id", default=None)
    parser.add_argument("--summary", default="")
    parser.add_argument("--log-dir", default=None)
    parser.add_argument("--compress-after-days", type=int, default=None)
    parser.add_argument("--retention-days", type=int, default=None)
    args = parser.parse_args()

    if args.action == "maintain":
        log_dir = Path(args.log_dir).resolve() if args.log_dir else session_log_dir()
        compress_after = (
            args.compress_after_days
            if args.compress_after_days is not None
            else session_log_compress_after_days()
        )
        retention = args.retention_days if args.retention_days is not None else session_log_retention_days()
        out = maintain_logs(log_dir, compress_after_days=compress_after, retention_days=retention)
    elif args.action == "start":
        out = start_session(args.project, operator=args.operator)
    elif args.action == "end":
        out = end_session(args.project, session_id=args.session_id, summary=args.summary)
    else:
        out = get_current_session(args.project) or {}

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
