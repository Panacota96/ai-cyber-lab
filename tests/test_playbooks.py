from libs.playbooks import build_web_playbook


def test_build_web_playbook_default_stages():
    playbook = build_web_playbook(
        project="demo",
        target="10.10.10.10",
        profile="balanced",
        objective="web validation",
        discoveries=["80/tcp open http"],
    )
    stage_keys = [row.get("stage_key") for row in playbook.get("stages", [])]
    assert stage_keys == [
        "discover",
        "fingerprint",
        "content-enum",
        "vuln-validate",
        "report-draft",
    ]
    assert playbook["target"] == "10.10.10.10"
    assert len(playbook["stages"][0].get("commands", [])) >= 1
    assert len(playbook["stages"][3].get("commands", [])) >= 1

