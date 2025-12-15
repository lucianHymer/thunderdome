#!/bin/bash
set -e

SERVER="deploy@enterthedome.xyz"
REMOTE_DIR="/home/deploy/thunderdome"

echo "⚡ Deploying Thunderdome"

echo "🔨 Building..."
npm run build

# Copy static assets into standalone
cp -r .next/static .next/standalone/.next/
[ -d public ] && cp -r public .next/standalone/

echo "📤 Uploading..."
rsync -avz --delete .next/standalone/ $SERVER:$REMOTE_DIR/

# Env
scp .env.production $SERVER:$REMOTE_DIR/.env 2>/dev/null || echo "No .env.production"

echo "🔄 Starting..."
ssh $SERVER "cd $REMOTE_DIR && pm2 delete thunderdome 2>/dev/null || true; pm2 start server.js --name thunderdome && pm2 save"

echo "✅ https://enterthedome.xyz"
