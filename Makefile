.PHONY: up up-ui up-exegol down dev ui tool-exec route format logs maintain-logs bundle-logs smoke-compose eval start-session end-session test verify check-changelog

up:
	cd infra && docker compose up -d qdrant ollama tools-core py2-runner py3-runner tool-exec orchestrator

up-ui:
	cd infra && docker compose --profile ui up -d ui-web

up-exegol:
	cd infra && docker compose --profile exegol up -d exegol

down:
	cd infra && docker compose down

dev:
	bash scripts/run_dev.sh

ui:
	.venv/bin/python -m apps.ui.main

tool-exec:
	.venv/bin/python -m apps.tool_exec.main --serve --host 0.0.0.0 --port 8082

route:
	.venv/bin/python -m apps.orchestrator.main "$(INPUT)"

start-session:
	.venv/bin/python -m apps.orchestrator.main --start-session --project "$(PROJECT)" --operator "$(OPERATOR)"

end-session:
	.venv/bin/python -m apps.orchestrator.main --end-session --project "$(PROJECT)" --session-id "$(SESSION_ID)" --summary "$(SUMMARY)"

format:
	. .venv/bin/activate && ruff format .

logs:
	tail -n 200 logs/aicl.log

maintain-logs:
	.venv/bin/python -m libs.tools.capture.sessionctl maintain \
		--log-dir "$${AICL_SESSION_LOG_DIR:-data/projects/_logs}" \
		--compress-after-days "$${AICL_SESSION_LOG_COMPRESS_AFTER_DAYS:-1}" \
		--retention-days "$${AICL_SESSION_LOG_RETENTION_DAYS:-30}"

bundle-logs:
	bash scripts/collect_troubleshoot_bundle.sh

smoke-compose:
	bash scripts/smoke_compose.sh

eval:
	.venv/bin/python scripts/run_prompt_regression.py

test:
	.venv/bin/python -m pytest -q tests

verify:
	bash scripts/verify_all.sh

check-changelog:
	.venv/bin/python scripts/check_changelog.py
