#!/bin/bash
set -e

SERVER="deploy@enterthedome.xyz"
REMOTE_DIR="/home/deploy/thunderdome"

echo "⚡ Deploying Thunderdome"

echo "🔨 Building..."
npm run build

# Find where server.js actually is (Next.js mirrors project structure)
STANDALONE_ROOT=$(dirname $(find .next/standalone -name "server.js" -type f | head -1))
echo "📍 Found standalone at: $STANDALONE_ROOT"

# Copy static assets into standalone
cp -r .next/static "$STANDALONE_ROOT/.next/"
[ -d public ] && cp -r public "$STANDALONE_ROOT/"

echo "📤 Uploading..."
rsync -avz --delete "$STANDALONE_ROOT/" $SERVER:$REMOTE_DIR/

# Env
scp .env.production $SERVER:$REMOTE_DIR/.env 2>/dev/null || echo "No .env.production"

echo "🔧 Installing native modules for Linux..."
ssh $SERVER "cd $REMOTE_DIR && npm install better-sqlite3 --build-from-source"

echo "🔄 Starting..."
ssh $SERVER "cd $REMOTE_DIR && pm2 delete thunderdome 2>/dev/null || true; pm2 start server.js --name thunderdome && pm2 save"

echo "✅ https://enterthedome.xyz"
