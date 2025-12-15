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

echo "📦 Packaging..."
tar czf /tmp/thunderdome.tar.gz -C .next/standalone .

echo "📤 Uploading..."
scp /tmp/thunderdome.tar.gz $SERVER:/tmp/

echo "📂 Preparing remote..."
ssh $SERVER "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR"

echo "📂 Extracting..."
ssh $SERVER "cd $REMOTE_DIR && tar xzf /tmp/thunderdome.tar.gz"

echo "🔍 Verifying..."
ssh $SERVER "ls $REMOTE_DIR/server.js"

# Env
scp .env.production $SERVER:$REMOTE_DIR/.env 2>/dev/null || echo "No .env.production"

echo "🔄 Starting..."
ssh $SERVER "cd $REMOTE_DIR && pm2 delete thunderdome 2>/dev/null || true; pm2 start server.js --name thunderdome && pm2 save"

ssh $SERVER "rm -f /tmp/thunderdome.tar.gz"
rm -f /tmp/thunderdome.tar.gz
echo "✅ https://enterthedome.xyz"
