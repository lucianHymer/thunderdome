# Agent Server Container Image
#
# Provides an HTTP API for running Claude agents in isolation.
# Each container can host multiple concurrent sessions.

FROM node:20-alpine

# Install required system packages
RUN apk add --no-cache \
    git \
    bash \
    curl \
    openssh-client

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --production

# Copy built application
COPY dist/ ./dist/

# Create workspace directory for trial files
RUN mkdir -p /workspace

# Set working directory for agents
ENV CLAUDE_CLI_PATH=/usr/local/bin/claude
ENV NODE_ENV=production
ENV PORT=3000

# Expose HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Run server
CMD ["node", "dist/server.js"]
