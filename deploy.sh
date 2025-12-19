#!/bin/bash
set -e

SERVER="deploy@enterthedome.xyz"
REMOTE_DIR="/home/deploy/thunderdome"
AGENT_SERVER_DIR="packages/agent-server"
AGENT_IMAGE="thunderdome/agent-server:latest"

echo "⚡ Deploying Thunderdome"

# Check if agent-server Docker image needs rebuilding
check_agent_server_image() {
    # Check if image exists
    if ! docker image inspect "$AGENT_IMAGE" >/dev/null 2>&1; then
        echo "📦 Image $AGENT_IMAGE not found, building..."
        return 0
    fi

    # Get image creation timestamp
    image_created=$(docker image inspect "$AGENT_IMAGE" --format '{{.Created}}')
    image_timestamp=$(date -d "$image_created" +%s 2>/dev/null || date -jf "%Y-%m-%dT%H:%M:%S" "${image_created%%.*}" +%s 2>/dev/null)

    # Check git for changes since image was built
    latest_commit=$(git log -1 --format=%ct -- "$AGENT_SERVER_DIR" 2>/dev/null || echo "0")
    if [ "$latest_commit" -gt "$image_timestamp" ] 2>/dev/null; then
        echo "📦 Changes detected in $AGENT_SERVER_DIR, rebuilding..."
        return 0
    fi

    echo "✅ $AGENT_IMAGE is up-to-date"
    return 1
}

build_agent_server() {
    echo "🔨 Building agent-server..."
    (cd "$AGENT_SERVER_DIR" && npm run build && docker build -t "$AGENT_IMAGE" .)
    echo "✅ agent-server image built"
}

push_agent_server_image() {
    echo "📤 Pushing agent-server image to prod..."
    docker save "$AGENT_IMAGE" | gzip | ssh $SERVER "gunzip | docker load"
    echo "✅ agent-server image deployed to prod"
}

echo "🐳 Checking Docker images..."
NEEDS_PUSH=false
if check_agent_server_image; then
    build_agent_server
    NEEDS_PUSH=true
fi

# Also check if prod has the image
if ! ssh $SERVER "docker image inspect $AGENT_IMAGE >/dev/null 2>&1"; then
    echo "📦 Image not found on prod server"
    NEEDS_PUSH=true
fi

if [ "$NEEDS_PUSH" = true ]; then
    push_agent_server_image
fi

echo "🔨 Building Next.js..."
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
