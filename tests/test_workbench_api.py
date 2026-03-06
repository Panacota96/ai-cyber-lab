import importlib
from pathlib import Path

from fastapi.testclient import TestClient
from libs.workbench_db import add_facts


def _build_client(monkeypatch, tmp_path):
    monkeypatch.setenv("AICL_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("AICL_LOG_DIR", str(tmp_path / "logs"))
    monkeypatch.setenv("AICL_ENABLE_LANGFUSE", "false")
    monkeypatch.setenv("AICL_USE_LLM_ROUTER", "false")
    monkeypatch.setenv("AICL_JOB_WORKER_ENABLED", "false")

    import apps.orchestrator.main as mod

    importlib.reload(mod)
    return TestClient(mod.app)


def test_planner_and_jobs_contract(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)

    plan = client.post(
        "/planner/commands",
        json={
            "project": "demo",
            "target": "10.10.10.10",
            "purpose": "recon",
            "profile": "balanced",
        },
    )
    assert plan.status_code == 200
    plan_body = plan.json()
    assert plan_body["project"] == "demo"
    assert len(plan_body["commands"]) >= 1
    cmd = plan_body["commands"][0]["cmd"]

    created = client.post(
        "/jobs",
        json={
            "project": "demo",
            "cmd": cmd,
            "purpose": "recon",
            "profile": "balanced",
            "target": "10.10.10.10",
            "plan_id": plan_body["plan_id"],
            "timeout_sec": 60,
        },
    )
    assert created.status_code == 200
    job = created.json()
    assert job["status"] == "pending"
    job_id = job["job_id"]

    confirmed = client.post(f"/jobs/{job_id}/confirm")
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "queued"

    listed = client.get("/jobs", params={"project": "demo"})
    assert listed.status_code == 200
    assert listed.json()["count"] >= 1

    fetched = client.get(f"/jobs/{job_id}")
    assert fetched.status_code == 200
    assert fetched.json()["job_id"] == job_id

    cancelled = client.post(f"/jobs/{job_id}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] in {"queued", "cancelled", "running", "completed", "failed"}


def test_findings_evidence_and_timeline(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)

    started = client.post("/sessions/start", json={"project": "demo", "operator": "tester"})
    assert started.status_code == 200
    session_id = started.json()["session_id"]

    finding = client.post(
        "/findings",
        json={
            "project": "demo",
            "session_id": session_id,
            "title": "Test finding",
            "severity": "medium",
            "status": "open",
            "description": "desc",
            "facts": [],
            "evidence": [],
        },
    )
    assert finding.status_code == 200
    finding_id = finding.json()["finding_id"]

    files = {"screenshot": ("proof.png", b"png-bytes", "image/png")}
    data = {
        "project": "demo",
        "session_id": session_id,
        "finding_id": finding_id,
        "report_section": "recon",
        "tags": "proof,web",
    }
    uploaded = client.post("/evidence/upload", data=data, files=files)
    assert uploaded.status_code == 200
    evidence_id = uploaded.json()["evidence_id"]

    linked = client.post(
        f"/evidence/{evidence_id}/link", json={"finding_id": finding_id, "report_section": "impact"}
    )
    assert linked.status_code == 200
    assert linked.json()["report_section"] == "impact"

    findings = client.get("/findings", params={"project": "demo"})
    assert findings.status_code == 200
    assert findings.json()["count"] >= 1

    evidence = client.get("/evidence", params={"project": "demo"})
    assert evidence.status_code == 200
    assert evidence.json()["count"] >= 1

    timeline = client.get(f"/sessions/{session_id}/timeline")
    assert timeline.status_code == 200
    assert timeline.json()["count"] >= 1


def test_fact_review_graph_and_export_contract(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)

    started = client.post("/sessions/start", json={"project": "demo", "operator": "tester"})
    assert started.status_code == 200
    session_id = started.json()["session_id"]

    added = add_facts(
        [
            {
                "project": "demo",
                "session_id": session_id,
                "source": "test",
                "key_name": "host",
                "value": "10.10.10.10",
                "fact_kind": "entity",
                "entity_type": "host",
                "subject_type": "host",
                "subject_value": "10.10.10.10",
                "confidence": 0.9,
                "status": "pending",
                "details": {"origin": "test"},
            },
            {
                "project": "demo",
                "session_id": session_id,
                "source": "test",
                "key_name": "exposes",
                "value": "10.10.10.10 -> exposes -> 80/tcp",
                "fact_kind": "relation",
                "subject_type": "host",
                "subject_value": "10.10.10.10",
                "relation": "exposes",
                "object_type": "port",
                "object_value": "80/tcp",
                "confidence": 0.85,
                "status": "pending",
                "details": {"origin": "test"},
            },
        ]
    )
    assert added == 2

    pending = client.get("/facts/review", params={"project": "demo", "status": "pending"})
    assert pending.status_code == 200
    assert pending.json()["count"] >= 2
    fact_id = pending.json()["facts"][0]["fact_id"]

    approved = client.post(f"/facts/review/{fact_id}/approve", json={"reviewer": "qa"})
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["reviewer"] == "qa"

    patched = client.patch(
        f"/facts/review/{fact_id}",
        json={"confidence": 0.99, "details": {"origin": "patched"}},
    )
    assert patched.status_code == 200
    assert patched.json()["confidence"] == 0.99

    project_graph = client.get("/projects/demo/graph", params={"include_pending": "true"})
    assert project_graph.status_code == 200
    assert project_graph.json()["stats"]["nodes"] >= 2
    assert project_graph.json().get("backend") in {"sqlite", "neo4j"}

    session_graph = client.get(f"/sessions/{session_id}/graph", params={"include_pending": "true"})
    assert session_graph.status_code == 200
    assert session_graph.json()["stats"]["nodes"] >= 2

    query_graph = client.get(
        "/graph/query",
        params={"project": "demo", "q": "10.10.10.10", "include_pending": "true"},
    )
    assert query_graph.status_code == 200
    assert query_graph.json()["stats"]["matches"] >= 1

    subgraph = client.get(
        "/graph/subgraph",
        params={"project": "demo", "root": "10.10.10.10", "depth": 2, "include_pending": "true"},
    )
    assert subgraph.status_code == 200
    assert subgraph.json()["stats"]["nodes"] >= 1

    timeline_graph = client.get(
        "/graph/timeline",
        params={"project": "demo", "session_id": session_id, "include_pending": "true"},
    )
    assert timeline_graph.status_code == 200
    assert timeline_graph.json()["count"] >= 1

    exported_session = client.post(
        "/exports/session",
        json={"project": "demo", "session_id": session_id, "include_pending_facts": True},
    )
    assert exported_session.status_code == 200
    session_body = exported_session.json()
    assert Path(session_body["dataset_json"]).exists()
    assert Path(session_body["report_md"]).exists()
    assert Path(session_body["report_html"]).exists()

    exported_project = client.post("/exports/project", json={"project": "demo", "include_pending_facts": True})
    assert exported_project.status_code == 200
    project_body = exported_project.json()
    assert Path(project_body["dataset_json"]).exists()
    assert Path(project_body["report_md"]).exists()
    assert Path(project_body["report_html"]).exists()


def test_command_proposals_contract(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)

    resp = client.post(
        "/proposals/commands",
        json={
            "project": "demo",
            "target": "10.10.10.10",
            "purpose": "recon",
            "profile": "balanced",
            "providers": [],
            "discoveries": ["80/tcp open http"],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["project"] == "demo"
    assert "proposal_id" in body
    assert "providers" in body
    assert "ensemble" in body
    assert "quality_summary" in body
    assert "quality_threshold" in body
    assert isinstance(body["manual_review_required"], bool)
    assert isinstance(body["quality_summary"], dict)
    if body["ensemble"]:
        first = body["ensemble"][0]
        assert "quality" in first
        assert {"score", "grade", "recommended"}.issubset(set(first["quality"].keys()))


def test_command_proposals_local_only_mode_uses_ollama(monkeypatch, tmp_path):
    monkeypatch.setenv("AICL_LOCAL_ONLY_MODE", "true")
    monkeypatch.setenv("AICL_PROPOSAL_PROVIDERS", "codex,claude,gemini")
    client = _build_client(monkeypatch, tmp_path)

    resp = client.post(
        "/proposals/commands",
        json={
            "project": "demo",
            "target": "10.10.10.10",
            "purpose": "recon",
            "profile": "balanced",
            "providers": [],
            "discoveries": [],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["operating_mode"] == "local_only"
    assert len(body["providers"]) >= 1
    assert body["providers"][0]["provider"] == "ollama"
