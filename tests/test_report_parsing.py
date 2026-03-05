import gzip
from pathlib import Path

from apps.agents.report_agent import _parse_log_line, _pick_session
from apps.agents.report_agent import _read_project_logs


def test_parse_log_line_key_values():
    line = "[2026-03-05T10:00:00+00:00] event=command session=s1 project=demo exit=0 cmd=nmap"
    parsed = _parse_log_line(line)
    assert parsed["event"] == "command"
    assert parsed["session"] == "s1"
    assert parsed["project"] == "demo"


def test_pick_session_prefers_latest_start_event():
    rows = [
        {"event": "session_start", "session": "old"},
        {"event": "command", "session": "old"},
        {"event": "session_start", "session": "new"},
    ]
    assert _pick_session(rows, None) == "new"


def test_read_project_logs_supports_gzip(monkeypatch, tmp_path):
    monkeypatch.setenv("AICL_DATA_ROOT", str(tmp_path / "data"))
    logs_dir = tmp_path / "data" / "projects" / "_logs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    line = "[2026-03-05T10:00:00+00:00] event=command session=s1 project=demo exit=0 cmd=nmap"
    with gzip.open(logs_dir / "terminal_2026-03-05.log.gz", "wt", encoding="utf-8") as handle:
        handle.write(line + "\n")

    rows = _read_project_logs("demo")
    assert len(rows) == 1
    assert rows[0]["event"] == "command"
    assert rows[0]["session"] == "s1"
