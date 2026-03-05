from apps.agents.report_agent import _parse_log_line, _pick_session


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
