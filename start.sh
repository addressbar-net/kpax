#!/usr/bin/env bash
# ==============================================================================
# K-PAX Engine & Server Runner
# ==============================================================================
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Starting K-PAX Room Sync Server (Port 8080)..."
if [ -f "$DIR/server/server.js" ]; then
    (cd "$DIR/server" && node server.js) &
    SERVER_PID=$!
    echo "[+] Room Server running on PID $SERVER_PID"
fi

echo "=============================================================================="
echo " K-PAX 3D Game Client Ready!"
echo " Serve this directory with any web server (e.g. Nginx, Apache, or Python):"
echo "   python3 -m http.server 8000"
echo " Then navigate to: http://localhost:8000"
echo " Press Ctrl+C to stop the room server."
echo "=============================================================================="

wait $SERVER_PID
