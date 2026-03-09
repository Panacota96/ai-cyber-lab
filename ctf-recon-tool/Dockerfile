FROM node:20-bookworm

# Install an expanded suite of recon and enumeration tools
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    sqlite3 \
    nmap \
    dirb \
    dnsutils \
    iputils-ping \
    netcat-openbsd \
    curl \
    wget \
    smbclient \
    whois \
    gobuster \
    ffuf \
    whatweb \
    ldap-utils \
    sqlmap \
    sslscan \
    dnsrecon \
    traceroute \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build production artifacts
RUN npm run build

# Run Next.js production server
EXPOSE 3000
CMD ["npm", "run", "start"]
