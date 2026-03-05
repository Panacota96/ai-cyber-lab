import importlib

from fastapi.testclient import TestClient


def _build_client(monkeypatch):
    monkeypatch.setenv("AICL_ORCHESTRATOR_URL", "http://127.0.0.1:65534")
    monkeypatch.setenv("AICL_UI_ENABLED", "true")
    monkeypatch.setenv("AICL_UI_PORT", "8091")

    import apps.ui.main as mod

    importlib.reload(mod)
    return TestClient(mod.app)


def test_ui_pages_render_without_backend(monkeypatch):
    client = _build_client(monkeypatch)

    for path in ("/", "/ui/recon", "/ui/cracking", "/ui/docs", "/ui/sessions", "/ui/reports", "/ui/graph"):
        resp = client.get(path, params={"project": "demo"})
        assert resp.status_code == 200
        assert "AI Cyber Lab Workbench" in resp.text
