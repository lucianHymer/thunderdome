#!/bin/bash
set -e

SERVER="deploy@enterthedome.xyz"
REMOTE_DIR="/home/deploy/thunderdome"

echo "⚡ Deploying Thunderdome"

echo "🔨 Building..."
npm run build

# Copy static assets into standalone (required by Next.js)
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

echo "📤 Uploading..."
tar czf - -C .next/standalone . | ssh $SERVER "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR && cd $REMOTE_DIR && tar xzf -"

# Env file
scp .env.production $SERVER:$REMOTE_DIR/.env 2>/dev/null || echo "No .env.production"

echo "🔄 Starting..."
ssh $SERVER "cd $REMOTE_DIR && pm2 delete thunderdome 2>/dev/null; pm2 start server.js --name thunderdome && pm2 save"

echo "✅ https://enterthedome.xyz"
