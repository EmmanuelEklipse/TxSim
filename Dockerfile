# Dockerfile

FROM node:20-slim

WORKDIR /app

# Install Foundry (for Anvil - EVM simulation) and system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Foundry
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="/root/.foundry/bin:${PATH}"
RUN foundryup

# Install dependencies
COPY package*.json ./
RUN npm ci

# Install Chopsticks globally (for WASM simulation)
RUN npm install -g @acala-network/chopsticks

# Copy source code and configuration
COPY src ./src
COPY tsconfig.json ./
COPY chopsticks-config.yml ./

# Environment variables
ENV PORT=3000
ENV NODE_ENV=production
ENV CHOPSTICKS_PORT=8546

# Expose API port (Anvil and Chopsticks run internally)
EXPOSE 3000

# Health check - increased start period for both services
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application (Anvil and Chopsticks start automatically in the code)
CMD ["npm", "start"]