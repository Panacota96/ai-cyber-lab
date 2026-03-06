FROM node:20-bookworm

# Enable contrib repository for tools like nikto (using the new deb822 format)
RUN sed -i 's/Components: main/Components: main contrib/' /etc/apt/sources.list.d/debian.sources

# Install an expanded suite of recon and enumeration tools
RUN apt-get update && apt-get install -y \
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
    nikto \
    whatweb \
    ldap-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code
COPY . .

# For development, run Next.js dev server
EXPOSE 3000
CMD ["npm", "run", "dev"]
