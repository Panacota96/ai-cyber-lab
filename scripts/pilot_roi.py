#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass


@dataclass
class RoiResult:
    engagements_per_week: int
    monthly_engagements: float
    hours_per_report_now: float
    hours_per_report_with_aicl: float
    hours_saved_per_report: float
    monthly_hours_saved: float
    hourly_rate_usd: float
    monthly_value_saved_usd: float
    setup_fee_usd: float
    monthly_support_usd: float
    breakeven_reports: float
    monthly_roi_multiple: float


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Estimate ROI for AI Cyber Lab paid local install + support pilots."
    )
    parser.add_argument("--engagements-per-week", type=int, required=True)
    parser.add_argument("--hours-per-report-now", type=float, required=True)
    parser.add_argument("--hours-per-report-with-aicl", type=float, required=True)
    parser.add_argument("--hourly-rate-usd", type=float, required=True)
    parser.add_argument("--setup-fee-usd", type=float, default=0.0)
    parser.add_argument("--monthly-support-usd", type=float, default=0.0)
    parser.add_argument("--json", action="store_true", help="Print JSON only.")
    return parser.parse_args()


def _safe_div(num: float, den: float) -> float:
    if den <= 0:
        return 0.0
    return num / den


def _calculate(args: argparse.Namespace) -> RoiResult:
    monthly_engagements = float(args.engagements_per_week) * 4.33
    hours_saved_per_report = max(0.0, args.hours_per_report_now - args.hours_per_report_with_aicl)
    monthly_hours_saved = monthly_engagements * hours_saved_per_report
    monthly_value_saved_usd = monthly_hours_saved * args.hourly_rate_usd
    value_per_report = max(0.0, hours_saved_per_report * args.hourly_rate_usd)
    breakeven_reports = _safe_div(args.setup_fee_usd, value_per_report)
    monthly_roi_multiple = _safe_div(monthly_value_saved_usd, max(1.0, args.monthly_support_usd))

    return RoiResult(
        engagements_per_week=args.engagements_per_week,
        monthly_engagements=round(monthly_engagements, 2),
        hours_per_report_now=round(args.hours_per_report_now, 2),
        hours_per_report_with_aicl=round(args.hours_per_report_with_aicl, 2),
        hours_saved_per_report=round(hours_saved_per_report, 2),
        monthly_hours_saved=round(monthly_hours_saved, 2),
        hourly_rate_usd=round(args.hourly_rate_usd, 2),
        monthly_value_saved_usd=round(monthly_value_saved_usd, 2),
        setup_fee_usd=round(args.setup_fee_usd, 2),
        monthly_support_usd=round(args.monthly_support_usd, 2),
        breakeven_reports=round(breakeven_reports, 2),
        monthly_roi_multiple=round(monthly_roi_multiple, 2),
    )


def _print_human(result: RoiResult) -> None:
    print("AI Cyber Lab Pilot ROI")
    print(f"- monthly engagements: {result.monthly_engagements}")
    print(f"- hours saved/report: {result.hours_saved_per_report}")
    print(f"- monthly hours saved: {result.monthly_hours_saved}")
    print(f"- monthly value saved (USD): {result.monthly_value_saved_usd}")
    print(f"- setup fee (USD): {result.setup_fee_usd}")
    print(f"- monthly support (USD): {result.monthly_support_usd}")
    print(f"- breakeven reports: {result.breakeven_reports}")
    print(f"- monthly ROI multiple vs support: {result.monthly_roi_multiple}x")


def main() -> int:
    args = _parse_args()
    result = _calculate(args)
    if args.json:
        print(json.dumps(asdict(result), indent=2))
    else:
        _print_human(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
