FROM python:3.12-slim

WORKDIR /workspace

RUN python -m pip install --upgrade pip && \
    python -m pip install ipython pytest

CMD ["bash", "-lc", "tail -f /dev/null"]
