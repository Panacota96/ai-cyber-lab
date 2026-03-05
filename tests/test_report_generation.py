from pathlib import Path

from apps.agents.report_agent import handle_report


def test_report_generation_with_session_scoped_logs(monkeypatch, tmp_path):
    monkeypatch.setenv("AICL_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("AICL_LOG_DIR", str(tmp_path / "logs"))

    logs_dir = tmp_path / "data" / "projects" / "_logs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    fixture = Path("tests/fixtures/session_log_sample.log").read_text(encoding="utf-8")
    (logs_dir / "terminal_2026-03-05.log").write_text(fixture, encoding="utf-8")

    out = handle_report("writeup session:s-123", project="demo")
    assert "session=s-123" in out

    report_path = tmp_path / "data" / "projects" / "demo" / "report" / "auto_report.md"
    content = report_path.read_text(encoding="utf-8")
    assert "## Evidence Map" in content
    assert "nmap" in content
