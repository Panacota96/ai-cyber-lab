import importlib

from fastapi.testclient import TestClient


def _build_client(monkeypatch, tmp_path):
    monkeypatch.setenv("AICL_LOG_DIR", str(tmp_path / "logs"))
    monkeypatch.setenv("AICL_TOOL_EXEC_MODE", "local")
    monkeypatch.setenv("AICL_ALLOWED_TOOLS", "nmap,python3")

    import apps.tool_exec.main as mod

    importlib.reload(mod)
    return TestClient(mod.app), mod


def test_tool_exec_health_and_capabilities(monkeypatch, tmp_path):
    client, _ = _build_client(monkeypatch, tmp_path)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    caps = client.get("/capabilities")
    assert caps.status_code == 200
    body = caps.json()
    assert body["mode"] == "local"
    assert "nmap" in body["allowed_tools"]


def test_tool_exec_blocks_disallowed_tool(monkeypatch, tmp_path):
    client, _ = _build_client(monkeypatch, tmp_path)

    out = client.post("/run", json={"cmd": ["nc", "-h"], "timeout": 5})
    assert out.status_code == 403
    assert out.json()["error_code"] == "TOOL_BLOCKED"


def test_tool_exec_runs_allowed_tool(monkeypatch, tmp_path):
    client, mod = _build_client(monkeypatch, tmp_path)

    def fake_run_local(cmd, timeout):
        return mod.RunResponse(
            cmd=list(cmd),
            executor="local",
            target="host",
            stdout="ok",
            stderr="",
            returncode=0,
            duration_ms=12,
        )

    monkeypatch.setattr(mod, "_run_local", fake_run_local)
    out = client.post("/run", json={"cmd": ["nmap", "--version"], "timeout": 10})
    assert out.status_code == 200
    body = out.json()
    assert body["returncode"] == 0
    assert body["stdout"] == "ok"
