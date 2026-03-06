from libs.command_planner import build_command_plan


def _cmds(plan):
    rows = plan.get("commands", [])
    return [row.get("cmd", []) for row in rows if isinstance(row, dict)]


def test_planner_changes_by_purpose_and_profile():
    recon = build_command_plan(
        project="demo",
        target_input="10.10.10.10",
        purpose="recon",
        profile="balanced",
        discoveries=[],
    )
    scanning = build_command_plan(
        project="demo",
        target_input="10.10.10.10",
        purpose="scanning",
        profile="stealth",
        discoveries=[],
    )

    recon_cmds = _cmds(recon)
    scanning_cmds = _cmds(scanning)
    assert recon_cmds != scanning_cmds
    assert any("--top-ports" in cmd for cmd in scanning_cmds)
    assert any("-p-" in cmd for cmd in recon_cmds)


def test_planner_conditional_web_suggestions():
    no_web = build_command_plan(
        project="demo",
        target_input="10.10.10.10",
        purpose="enum",
        profile="balanced",
        discoveries=[],
    )
    with_web = build_command_plan(
        project="demo",
        target_input="10.10.10.10",
        purpose="enum",
        profile="balanced",
        discoveries=["80/tcp open http apache", "/admin [Status: 200]"],
    )

    no_web_option_ids = {row.get("option_id") for row in no_web.get("commands", []) if isinstance(row, dict)}
    web_option_ids = {row.get("option_id") for row in with_web.get("commands", []) if isinstance(row, dict)}
    assert "web-content-deep" not in no_web_option_ids
    assert "web-content-deep" in web_option_ids
    assert any(
        row.get("reason") == "conditional_no_web_signal"
        for row in no_web.get("suppressed_commands", [])
        if isinstance(row, dict)
    )


def test_planner_session_dedupe_suppresses_executed_commands():
    first = build_command_plan(
        project="demo",
        target_input="10.10.10.10",
        purpose="scanning",
        profile="balanced",
        discoveries=[],
    )
    first_cmds = _cmds(first)
    assert first_cmds

    second = build_command_plan(
        project="demo",
        target_input="10.10.10.10",
        purpose="scanning",
        profile="balanced",
        discoveries=[],
        executed_commands=[first_cmds[0]],
        allow_repeat=False,
    )
    second_cmds = _cmds(second)
    assert first_cmds[0] not in second_cmds
    assert int(second.get("memory_hits", 0)) >= 1
    assert any(
        row.get("reason") == "already_executed_in_session"
        for row in second.get("suppressed_commands", [])
        if isinstance(row, dict)
    )


def test_selected_options_control_output():
    plan = build_command_plan(
        project="demo",
        target_input="10.10.10.10",
        purpose="recon",
        profile="aggressive",
        discoveries=["80/tcp open http"],
        selected_options=["web-content-dirs", "web-vuln-validate"],
        max_commands=10,
    )
    option_ids = [row.get("option_id") for row in plan.get("commands", []) if isinstance(row, dict)]
    assert option_ids == ["web-content-dirs", "web-vuln-validate"]

