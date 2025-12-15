#!/bin/bash
set -e

SERVER="deploy@enterthedome.xyz"
REMOTE_DIR="/home/deploy/thunderdome"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR"

echo "⚡ Deploying Thunderdome"

echo "🔨 Building..."
npm run build

# Copy static assets into standalone
cp -r .next/static .next/standalone/.next/
[ -d public ] && cp -r public .next/standalone/

echo "📦 Packaging..."
cd .next/standalone
tar czf /tmp/thunderdome.tar.gz .
cd "$SCRIPT_DIR"

# Verify tar contents
echo "🔍 Checking package..."
tar tzf /tmp/thunderdome.tar.gz | grep server.js || { echo "ERROR: server.js not in tarball!"; exit 1; }

echo "📤 Uploading..."
scp /tmp/thunderdome.tar.gz $SERVER:/tmp/

echo "📂 Deploying..."
ssh $SERVER "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR && cd $REMOTE_DIR && tar xzf /tmp/thunderdome.tar.gz && rm /tmp/thunderdome.tar.gz"

# Env
scp .env.production $SERVER:$REMOTE_DIR/.env 2>/dev/null || echo "No .env.production"

echo "🔄 Starting..."
ssh $SERVER "cd $REMOTE_DIR && pm2 delete thunderdome 2>/dev/null || true; pm2 start server.js --name thunderdome && pm2 save"

rm -f /tmp/thunderdome.tar.gz
echo "✅ https://enterthedome.xyz"
