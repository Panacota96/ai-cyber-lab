FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /workspace

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      wget \
      git \
      bash \
      python3 \
      python3-pip \
      nmap \
      gobuster \
      sqlmap \
      whatweb && \
    (apt-get install -y --no-install-recommends ffuf || true) && \
    rm -rf /var/lib/apt/lists/*

CMD ["bash", "-lc", "tail -f /dev/null"]
