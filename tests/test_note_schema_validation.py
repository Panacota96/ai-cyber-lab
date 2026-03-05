from pathlib import Path

import pytest

from libs.docs.md_writer import write_project_note


def test_write_project_note_validates_study_schema(monkeypatch, tmp_path):
    monkeypatch.setenv("AICL_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("AICL_LOG_DIR", str(tmp_path / "logs"))
    monkeypatch.setenv("AICL_VALIDATE_NOTES", "true")

    payload = {
        "title": "Study Session - CCNA",
        "timestamp_utc": "2026-03-05T12:00:00+00:00",
        "track": "ccna",
        "query": "Summarize OSPF",
        "atomic_notes": ["Area types recap"],
        "flashcards": ["Q: OSPF? | A: Link-state IGP"],
        "next_actions": ["Review LSA types"],
    }

    out = write_project_note("schema-demo", "study", payload)
    assert Path(out["json"]).exists()
    assert Path(out["md"]).exists()


def test_write_project_note_rejects_invalid_study_payload(monkeypatch, tmp_path):
    monkeypatch.setenv("AICL_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("AICL_LOG_DIR", str(tmp_path / "logs"))
    monkeypatch.setenv("AICL_VALIDATE_NOTES", "true")

    bad_payload = {
        "title": "Study Session - CCNA",
        "timestamp_utc": "2026-03-05T12:00:00+00:00",
        "track": "ccna",
        "atomic_notes": ["Area types recap"],
        "flashcards": ["Q: OSPF? | A: Link-state IGP"],
        "next_actions": ["Review LSA types"],
    }

    with pytest.raises(ValueError, match="Invalid payload for section 'study'"):
        write_project_note("schema-demo", "study", bad_payload)
