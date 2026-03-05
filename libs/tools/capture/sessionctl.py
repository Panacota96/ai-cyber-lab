from __future__ import annotations

import argparse
import json

from libs.sessions import end_session, get_current_session, start_session


def main() -> None:
    parser = argparse.ArgumentParser(description="Session control for AICL")
    parser.add_argument("action", choices=["start", "end", "current"])
    parser.add_argument("--project", required=True)
    parser.add_argument("--operator", default="unknown")
    parser.add_argument("--session-id", default=None)
    parser.add_argument("--summary", default="")
    args = parser.parse_args()

    if args.action == "start":
        out = start_session(args.project, operator=args.operator)
    elif args.action == "end":
        out = end_session(args.project, session_id=args.session_id, summary=args.summary)
    else:
        out = get_current_session(args.project) or {}

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
