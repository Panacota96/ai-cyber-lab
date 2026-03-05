.PHONY: up down dev route format logs maintain-logs eval start-session end-session test verify check-changelog

up:
	cd infra && docker compose up -d qdrant ollama

down:
	cd infra && docker compose down

dev:
	bash scripts/run_dev.sh

route:
	. .venv/bin/activate && python -m apps.orchestrator.main "$(INPUT)"

start-session:
	. .venv/bin/activate && python -m apps.orchestrator.main --start-session --project "$(PROJECT)" --operator "$(OPERATOR)"

end-session:
	. .venv/bin/activate && python -m apps.orchestrator.main --end-session --project "$(PROJECT)" --session-id "$(SESSION_ID)" --summary "$(SUMMARY)"

format:
	. .venv/bin/activate && ruff format .

logs:
	tail -n 200 logs/aicl.log

maintain-logs:
	. .venv/bin/activate && python -m libs.tools.capture.sessionctl maintain \
		--log-dir "$${AICL_SESSION_LOG_DIR:-data/projects/_logs}" \
		--compress-after-days "$${AICL_SESSION_LOG_COMPRESS_AFTER_DAYS:-1}" \
		--retention-days "$${AICL_SESSION_LOG_RETENTION_DAYS:-30}"

eval:
	. .venv/bin/activate && python scripts/run_prompt_regression.py

test:
	. .venv/bin/activate && python -m pytest -q tests

verify:
	bash scripts/verify_all.sh

check-changelog:
	python3 scripts/check_changelog.py
