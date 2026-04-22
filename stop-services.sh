#!/bin/bash
# Stop all Claw Credential Manager services

echo "Stopping services..."

# Stop Web UI
if pgrep -f "node.*standalone-server" > /dev/null; then
    pkill -f "node.*standalone-server"
    echo "✅ Web UI stopped"
else
    echo "⚠️  Web UI was not running"
fi

# Stop HTTP API Server
if pgrep -f "claw-vault-server" > /dev/null 2>&1; then
    pkill -f "claw-vault-server"
    echo "✅ HTTP API Server stopped"
else
    echo "⚠️  HTTP API Server was not running"
fi

# Stop Plugin Manager (if running)
if pgrep -f "claw_plugin_manager.*node" > /dev/null 2>&1; then
    pkill -f "claw_plugin_manager.*node"
    echo "✅ Plugin Manager stopped"
fi

echo ""
echo "All services stopped"
