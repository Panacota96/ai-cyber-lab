FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace

COPY pyproject.toml README.md LICENSE ./
COPY apps ./apps
COPY libs ./libs
COPY scripts ./scripts
COPY automation ./automation

RUN python -m pip install --upgrade pip && \
    python -m pip install -e .

EXPOSE 8080

CMD ["python", "-m", "apps.orchestrator.main", "--serve"]
