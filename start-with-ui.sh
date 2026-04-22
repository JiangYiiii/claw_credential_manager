#!/bin/bash
# Start Claw Credential Manager with Web UI

set -e

echo "=========================================="
echo "Claw Credential Manager Startup"
echo "=========================================="

# Check if services are already running
if pgrep -f "claw-vault-server" > /dev/null; then
    echo "⚠️  HTTP API Server is already running"
else
    echo "[1/2] Starting HTTP API Server..."
    ./claw-vault-server > /tmp/vault-server.log 2>&1 &
    sleep 2

    if pgrep -f "claw-vault-server" > /dev/null; then
        echo "✅ HTTP API Server started (http://127.0.0.1:8765)"
    else
        echo "❌ Failed to start HTTP API Server"
        exit 1
    fi
fi

if pgrep -f "node.*standalone-server" > /dev/null; then
    echo "⚠️  Web UI Server is already running"
else
    echo "[2/2] Starting Web UI Server..."
    cd web && npm start > /tmp/web-ui.log 2>&1 &
    cd ..
    sleep 2

    if pgrep -f "node.*standalone-server" > /dev/null; then
        echo "✅ Web UI Server started (http://127.0.0.1:8080)"
    else
        echo "❌ Failed to start Web UI Server"
        exit 1
    fi
fi

echo ""
echo "=========================================="
echo "✅ All services started successfully"
echo "=========================================="
echo ""
echo "Access:"
echo "  Web UI:  http://127.0.0.1:8080"
echo "  API:     http://127.0.0.1:8765"
echo ""
echo "Logs:"
echo "  API:     tail -f /tmp/vault-server.log"
echo "  Web UI:  tail -f /tmp/web-ui.log"
echo ""
echo "Stop:"
echo "  ./stop-services.sh"
echo ""
