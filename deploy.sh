#!/bin/bash
set -e

# Thunderdome Deploy Script - Fast edition
# Builds locally, tars and streams to server

SERVER="deploy@enterthedome.xyz"
REMOTE_DIR="/home/deploy/thunderdome"

echo "⚡ Deploying Thunderdome"

# Build
echo "🔨 Building..."
npm run build

# Tar and stream in one shot (way faster than rsync)
echo "📤 Streaming to server..."
tar czf - \
  .next/standalone \
  .next/static \
  public \
  drizzle \
  drizzle.config.ts \
  package.json \
  2>/dev/null | \
  ssh $SERVER "cd /home/deploy && rm -rf thunderdome.old && mv thunderdome thunderdome.old 2>/dev/null; mkdir -p thunderdome && cd thunderdome && tar xzf - && mv .next/standalone/* . && rm -rf .next/standalone"

# Copy env separately (not in tar for security)
scp .env.production $SERVER:$REMOTE_DIR/.env 2>/dev/null || true

# Restart
echo "🔄 Restarting..."
ssh $SERVER "cd $REMOTE_DIR && pm2 restart thunderdome 2>/dev/null || pm2 start server.js --name thunderdome && pm2 save"

echo "✅ Live at https://enterthedome.xyz"
