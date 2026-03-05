import importlib

from fastapi.testclient import TestClient


def _build_client(monkeypatch, tmp_path):
    monkeypatch.setenv("AICL_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("AICL_LOG_DIR", str(tmp_path / "logs"))
    monkeypatch.setenv("AICL_ENABLE_LANGFUSE", "false")
    monkeypatch.setenv("AICL_USE_LLM_ROUTER", "false")

    import apps.orchestrator.main as main_mod

    importlib.reload(main_mod)
    return TestClient(main_mod.app)


def test_health_and_ready_contract(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    ready = client.get("/ready")
    assert ready.status_code == 200
    body = ready.json()
    assert "status" in body
    assert "dependencies" in body
    assert {"qdrant", "ollama", "langfuse"}.issubset(set(body["dependencies"].keys()))


def test_route_contract_includes_trace_id(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)

    resp = client.post("/route", json={"user_input": "Summarize CCNA OSPF", "project": "demo"})
    assert resp.status_code == 200
    body = resp.json()
    assert {"project", "route", "result", "trace_id"}.issubset(set(body.keys()))
    assert len(body["trace_id"]) >= 12


def test_session_lifecycle_contract(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)

    started = client.post("/sessions/start", json={"project": "demo", "operator": "tester"})
    assert started.status_code == 200
    s = started.json()
    assert s["status"] == "active"

    current = client.get("/sessions/current", params={"project": "demo"})
    assert current.status_code == 200
    assert current.json().get("session_id") == s["session_id"]

    ended = client.post(
        "/sessions/end",
        json={"project": "demo", "session_id": s["session_id"], "summary": "done"},
    )
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"


def test_logs_and_diagnostics_contract(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)

    logs = client.get("/logs", params={"lines": 50})
    assert logs.status_code == 200
    assert "stats" in logs.json()

    diag = client.get("/diagnostics", params={"project": "demo"})
    assert diag.status_code == 200
    body = diag.json()
    assert "readiness" in body
    assert "trace" in body
    assert "knowledge" in body
    assert "log_stats" in body
    assert "recent_critical_logs" in body
