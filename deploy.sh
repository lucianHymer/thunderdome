#!/bin/bash
set -e

# Allow rsync partial transfer warnings (exit 23)
rsync_safe() {
  rsync "$@" || [ $? -eq 23 ]
}

# Thunderdome Deploy Script
# Builds locally (fast Mac), syncs to x86 server

SERVER="deploy@enterthedome.xyz"
REMOTE_DIR="/home/deploy/thunderdome"

echo "⚡ Deploying Thunderdome"
echo ""

# Build standalone
echo "🔨 Building..."
npm run build

# Sync standalone build
echo "📤 Syncing build artifacts..."
rsync_safe -avz --delete .next/standalone/ $SERVER:$REMOTE_DIR/
rsync_safe -avz --delete .next/static $SERVER:$REMOTE_DIR/.next/
rsync_safe -avz --delete public/ $SERVER:$REMOTE_DIR/public/

# Sync package files for native module install
rsync_safe -avz package.json package-lock.json $SERVER:$REMOTE_DIR/

# Sync drizzle for migrations
rsync_safe -avz drizzle/ $SERVER:$REMOTE_DIR/drizzle/ 2>/dev/null || true
rsync_safe -avz drizzle.config.ts $SERVER:$REMOTE_DIR/ 2>/dev/null || true

# Copy env
rsync_safe -avz .env.production $SERVER:$REMOTE_DIR/.env 2>/dev/null || true

# Install native deps & restart on server
echo "🔄 Finalizing on server..."
ssh $SERVER << 'EOF'
  cd /home/deploy/thunderdome

  # Install only production deps (for native modules)
  npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev

  # Migrations
  npx drizzle-kit migrate 2>/dev/null || true

  # Restart
  pm2 restart thunderdome 2>/dev/null || pm2 start server.js --name thunderdome -i max
  pm2 save
EOF

echo ""
echo "✅ Live at https://enterthedome.xyz"
