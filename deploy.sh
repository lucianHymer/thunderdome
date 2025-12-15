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

# Copy static assets into standalone (create .next dir if needed)
mkdir -p "$STANDALONE_ROOT/.next"
cp -r .next/static "$STANDALONE_ROOT/.next/"
[ -d public ] && cp -r public "$STANDALONE_ROOT/"

# Backup node_modules on server before rsync deletes it
echo "📦 Preserving native modules..."
ssh $SERVER "[ -d $REMOTE_DIR/node_modules/better-sqlite3 ] && mv $REMOTE_DIR/node_modules/better-sqlite3 /tmp/better-sqlite3-cache || true"

echo "📤 Uploading..."
rsync -avz --delete --exclude='thunderdome.db' "$STANDALONE_ROOT/" $SERVER:$REMOTE_DIR/

# Restore cached native modules
ssh $SERVER "[ -d /tmp/better-sqlite3-cache ] && rm -rf $REMOTE_DIR/node_modules/better-sqlite3 && mv /tmp/better-sqlite3-cache $REMOTE_DIR/node_modules/better-sqlite3 || true"

# Only install if not cached
echo "🔧 Checking native modules..."
ssh $SERVER "cd $REMOTE_DIR && node -e \"require('better-sqlite3')\" 2>/dev/null || npm install better-sqlite3 --build-from-source"

# Env
scp .env.production $SERVER:$REMOTE_DIR/.env 2>/dev/null || echo "No .env.production"

echo "🔄 Starting..."
ssh $SERVER "cd $REMOTE_DIR && pm2 delete thunderdome 2>/dev/null || true; pm2 start server.js --name thunderdome && pm2 save"

echo "✅ https://enterthedome.xyz"
