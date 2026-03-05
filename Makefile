.PHONY: up down dev route format logs eval start-session end-session test verify check-changelog

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

eval:
	. .venv/bin/activate && python scripts/run_prompt_regression.py

test:
	. .venv/bin/activate && python -m pytest -q tests

verify:
	bash scripts/verify_all.sh

check-changelog:
	python3 scripts/check_changelog.py
