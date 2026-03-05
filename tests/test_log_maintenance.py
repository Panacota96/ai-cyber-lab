from __future__ import annotations

import gzip
from datetime import date

from libs.tools.capture.log_maintenance import maintain_logs


def test_maintain_logs_compresses_and_prunes(tmp_path):
    log_dir = tmp_path / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    (log_dir / "terminal_2026-03-10.log").write_text("today\n", encoding="utf-8")
    (log_dir / "terminal_2026-03-08.log").write_text("older\n", encoding="utf-8")
    with gzip.open(log_dir / "terminal_2026-01-01.log.gz", "wt", encoding="utf-8") as handle:
        handle.write("very old\n")

    summary = maintain_logs(
        log_dir=log_dir,
        compress_after_days=1,
        retention_days=30,
        now_date=date(2026, 3, 10),
    )

    assert summary["compressed"] == 1
    assert summary["deleted"] == 1
    assert (log_dir / "terminal_2026-03-10.log").exists()
    assert not (log_dir / "terminal_2026-03-08.log").exists()
    assert (log_dir / "terminal_2026-03-08.log.gz").exists()
    assert not (log_dir / "terminal_2026-01-01.log.gz").exists()
