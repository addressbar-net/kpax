#!/usr/bin/env bash
# ==============================================================================
# K-PAX Engine & Room Server Installer (github.com/addressbar-net/kpax)
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> Installing K-PAX Engine Suite in $DIR"

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "[-] Node.js is required. Please install Node.js (v18+) to run the K-PAX room server."
    exit 1
fi
echo "[+] Node.js detected: $(node -v)"

# 2. Install Server Dependencies
if [ -d "$DIR/server" ]; then
    echo "==> Setting up K-PAX Room Sync Server (WebSocket + SQLite)..."
    cd "$DIR/server"
    if [ -f "package.json" ]; then
        npm install --production --silent || npm install --silent
    fi
    chmod +x start 2>/dev/null || true
    cd "$DIR"
fi

# 3. Build Starter Parcel Room Geometry
if [ -f "$DIR/tools/build_starter_parcel.js" ]; then
    echo "==> Generating 8x8 Stackable Foundation Block Parcel & Pix Frame..."
    node "$DIR/tools/build_starter_parcel.js"
fi

# 4. Make scripts executable
chmod +x "$DIR/start.sh" 2>/dev/null || true
chmod +x "$DIR/install.sh" 2>/dev/null || true

echo "=============================================================================="
echo " [OK] K-PAX Engine & Server Installation Complete!"
echo " Run ./start.sh to launch the room server and WebGL game client."
echo "=============================================================================="
