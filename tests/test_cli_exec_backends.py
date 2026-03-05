import importlib


def _reload_cli_exec(monkeypatch):
    import libs.tools.cli_exec as cli_exec

    importlib.reload(cli_exec)
    return cli_exec


def test_cli_exec_uses_service_backend(monkeypatch):
    monkeypatch.setenv("AICL_EXEC_BACKEND", "service")
    monkeypatch.setenv("AICL_ALLOWED_TOOLS", "nmap")
    cli_exec = _reload_cli_exec(monkeypatch)

    called = {"service": False}

    def fake_service(cmd, timeout):
        called["service"] = True
        return cli_exec.CmdResult(cmd=list(cmd), stdout="svc", stderr="", returncode=0)

    monkeypatch.setattr(cli_exec, "_run_service_cmd", fake_service)
    out = cli_exec.run_cmd(["nmap", "--version"], timeout=5)
    assert called["service"] is True
    assert out.stdout == "svc"


def test_cli_exec_uses_host_backend(monkeypatch):
    monkeypatch.setenv("AICL_EXEC_BACKEND", "host")
    monkeypatch.setenv("AICL_ALLOWED_TOOLS", "nmap")
    cli_exec = _reload_cli_exec(monkeypatch)

    called = {"host": False}

    def fake_host(cmd, timeout):
        called["host"] = True
        return cli_exec.CmdResult(cmd=list(cmd), stdout="host", stderr="", returncode=0)

    monkeypatch.setattr(cli_exec, "_run_host_cmd", fake_host)
    out = cli_exec.run_cmd(["nmap", "--version"], timeout=5)
    assert called["host"] is True
    assert out.stdout == "host"


def test_cli_exec_blocks_tool_before_backend(monkeypatch):
    monkeypatch.setenv("AICL_EXEC_BACKEND", "service")
    monkeypatch.setenv("AICL_ALLOWED_TOOLS", "nmap")
    cli_exec = _reload_cli_exec(monkeypatch)

    try:
        cli_exec.run_cmd(["nc", "-h"], timeout=5)
        assert False, "Expected PermissionError"
    except PermissionError:
        assert True
