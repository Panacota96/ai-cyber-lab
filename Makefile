.PHONY: up down dev route format logs

up:
	cd infra && docker compose up -d qdrant ollama

down:
	cd infra && docker compose down

dev:
	bash scripts/run_dev.sh

route:
	. .venv/bin/activate && python -m apps.orchestrator.main "$(INPUT)"

format:
	. .venv/bin/activate && ruff format .

logs:
	tail -n 200 logs/aicl.log
