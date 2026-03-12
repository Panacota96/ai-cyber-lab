FROM node:25-bookworm AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

FROM node:25-bookworm AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV HELMS_DATA_DIR=/tmp/helms-build-data

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:25-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install runtime recon/enumeration dependencies only.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    dirb \
    dnsrecon \
    dnsutils \
    ffuf \
    git \
    gobuster \
    hashcat \
    iputils-ping \
    john \
    ldap-utils \
    netcat-openbsd \
    nmap \
    python3 \
    smbclient \
    sqlite3 \
    sqlmap \
    sslscan \
    traceroute \
    wget \
    whatweb \
    whois \
    && rm -rf /var/lib/apt/lists/*

# SearchSploit is not consistently packaged on Debian bookworm.
# Vendor the official Exploit-DB mirror and expose searchsploit on PATH.
RUN git clone --depth=1 https://gitlab.com/exploit-database/exploitdb.git /opt/exploitdb \
    && ln -sf /opt/exploitdb/searchsploit /usr/local/bin/searchsploit \
    && mkdir -p /usr/share/wordlists /app/data \
    && ln -sfn /usr/share/dirb/wordlists /usr/share/wordlists/dirb

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
