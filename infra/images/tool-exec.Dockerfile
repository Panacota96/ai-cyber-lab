FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      docker.io \
      nmap \
      gobuster \
      nikto \
      sqlmap \
      whatweb && \
    (apt-get install -y --no-install-recommends ffuf || true) && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md LICENSE ./
COPY apps ./apps
COPY libs ./libs
COPY scripts ./scripts
COPY automation ./automation

RUN python -m pip install --upgrade pip && \
    python -m pip install -e .

EXPOSE 8082

CMD ["python", "-m", "apps.tool_exec.main", "--serve", "--host", "0.0.0.0", "--port", "8082"]
