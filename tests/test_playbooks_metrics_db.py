import importlib


def _db(monkeypatch, tmp_path):
    monkeypatch.setenv("AICL_DATA_ROOT", str(tmp_path / "data"))
    import libs.workbench_db as db

    importlib.reload(db)
    db.init_db()
    return db


def test_playbook_stage_approve_and_reject(monkeypatch, tmp_path):
    db = _db(monkeypatch, tmp_path)
    playbook = db.create_playbook(
        project="demo",
        target="10.10.10.10",
        category="web",
        objective="test",
        profile="balanced",
        session_id="sess-1",
        stages=[
            {
                "stage_key": "discover",
                "title": "Discover",
                "commands": [{"title": "Scan", "cmd": ["nmap", "-sV", "10.10.10.10"], "timeout_sec": 60}],
            },
            {"stage_key": "report-draft", "title": "Report", "commands": []},
        ],
        metadata={"source": "test"},
    )
    assert playbook["playbook_id"]
    assert playbook["stage_stats"]["total"] == 2

    first_stage = playbook["stages"][0]
    approved = db.approve_playbook_stage(
        playbook_id=playbook["playbook_id"],
        stage_id=first_stage["stage_id"],
        reviewer="qa",
        auto_confirm=True,
    )
    assert approved is not None
    assert approved["status"] in {"queued", "running", "completed", "failed"}
    assert isinstance(approved.get("linked_job_ids_json"), list)
    assert len(approved["linked_job_ids_json"]) == 1

    second_stage = playbook["stages"][1]
    rejected = db.reject_playbook_stage(
        playbook_id=playbook["playbook_id"],
        stage_id=second_stage["stage_id"],
        reviewer="qa",
        reason="skip report stage in test",
    )
    assert rejected is not None
    assert rejected["status"] == "rejected"

    refreshed = db.get_playbook(playbook["playbook_id"])
    assert refreshed is not None
    assert refreshed["status"] in {"in_progress", "needs_review", "completed", "draft"}


def test_profitability_summary(monkeypatch, tmp_path):
    db = _db(monkeypatch, tmp_path)
    db.record_engagement_metric(project="demo", metric_name="revenue_usd", metric_value=1200)
    db.record_engagement_metric(project="demo", metric_name="cost_usd", metric_value=350)
    db.record_engagement_metric(project="demo", metric_name="hours_saved", metric_value=12)
    db.record_engagement_metric(project="demo", metric_name="hourly_rate_usd", metric_value=55)

    summary = db.profitability_summary("demo")
    assert summary["project"] == "demo"
    assert summary["metrics_count"] == 4
    assert summary["kpis"]["revenue_usd"] == 1200.0
    assert summary["kpis"]["cost_usd"] == 350.0
    assert summary["kpis"]["gross_profit_usd"] == 850.0
    assert summary["kpis"]["estimated_saved_value_usd"] == 660.0

