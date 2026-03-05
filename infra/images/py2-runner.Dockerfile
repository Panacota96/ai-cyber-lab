FROM python:2.7-slim

WORKDIR /workspace

RUN pip install --no-cache-dir virtualenv

CMD ["bash", "-lc", "tail -f /dev/null"]
