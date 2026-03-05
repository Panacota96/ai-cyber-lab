#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from apps.orchestrator.graph import run_orchestrator

CASES_PATH = Path("automation/evals/prompt_regression.json")
OUT_DIR = Path("data/projects/_evals")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run prompt routing regression")
    parser.add_argument("--min-pass-rate", type=float, default=90.0)
    args = parser.parse_args()

    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    results = []

    for case in cases:
        output = run_orchestrator(case["input"], project="_evals")
        got = output.get("route", "")
        expected = case["expected_route"]
        results.append(
            {
                "input": case["input"],
                "expected": expected,
                "got": got,
                "pass": got == expected,
            }
        )

    passed = sum(1 for r in results if r["pass"])
    total = len(results)
    rate = (passed / total * 100.0) if total else 0.0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    json_path = OUT_DIR / f"prompt_regression_{ts}.json"
    md_path = OUT_DIR / f"prompt_regression_{ts}.md"

    payload = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "total": total,
        "passed": passed,
        "pass_rate": rate,
        "results": results,
    }
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    lines = [
        "# Prompt Regression Report",
        "",
        f"- Generated UTC: {payload['generated_utc']}",
        f"- Total: {total}",
        f"- Passed: {passed}",
        f"- Pass rate: {rate:.2f}%",
        "",
        "## Cases",
    ]
    for row in results:
        mark = "PASS" if row["pass"] else "FAIL"
        lines.append(f"- [{mark}] expected={row['expected']} got={row['got']} :: {row['input']}")

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"json": str(json_path), "md": str(md_path), "pass_rate": rate}, indent=2))
    return 0 if rate >= args.min_pass_rate else 1


if __name__ == "__main__":
    raise SystemExit(main())
