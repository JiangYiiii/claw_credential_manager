#!/usr/bin/env bash
# Cookie Keeper Native Messaging Host installer.
# Usage: install.sh --ext-id <chrome-extension-id>

set -euo pipefail

EXT_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ext-id) EXT_ID="$2"; shift 2;;
    -h|--help)
      cat <<EOF
Usage: install.sh --ext-id <id>
  --ext-id   Chrome extension ID (find at chrome://extensions)
EOF
      exit 0;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

if [[ -z "$EXT_ID" ]]; then
  cat >&2 <<'EOF'
error: --ext-id is required.

This host script is HALF of the system. Before running it you MUST already
have the Cookie Keeper Chrome extension installed — the host can only
receive cookie events from a Chrome extension that owns this 32-char ID.

If you do NOT have the extension yet:
  1. Get the Cookie Keeper extension zip from the docs / release page.
  2. Unzip it; open chrome://extensions; turn on "Developer mode";
     click "Load unpacked" and pick the unzipped directory.
  3. Once it's installed Chrome shows a 32-char lowercase ID below the
     extension entry. Copy that ID.
  4. Re-run this script:
       bash install.sh --ext-id <THAT_ID>

If you already have the extension installed:
  - Easiest: click the Cookie Keeper toolbar icon → 配置 → switch sync
    mode to 自动 → copy the 扩展 ID with the 复制 button next to it.
  - Or: chrome://extensions → find Cookie Keeper → copy the ID.
EOF
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found in PATH" >&2
  exit 1
fi
NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "error: node >= 18 required (current: $(node --version))" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST_DIR="$HOME/.agents/cookie-keeper/host"
mkdir -p "$HOST_DIR"
cp -R "$HOST_ROOT/host-payload/." "$HOST_DIR/"

# Chrome spawns native hosts in a clean environment with no nvm / PATH
# tweaks, so we lock the absolute node path into host.sh at install time.
# Replace the entire NODE_BIN line, anchored by a sentinel comment so we
# don't accidentally substitute a literal string elsewhere in the file.
NODE_BIN_ABS="$(command -v node)"
if [[ -z "$NODE_BIN_ABS" ]]; then
  echo "error: node not found in PATH; cannot bake an absolute node path into host.sh" >&2
  exit 1
fi
awk -v node="$NODE_BIN_ABS" '
  /COOKIE_KEEPER_NODE_BIN_ANCHOR/ { print "NODE_BIN=\"" node "\"  # COOKIE_KEEPER_NODE_BIN_ANCHOR"; next }
  { print }
' "$HOST_DIR/host.sh" > "$HOST_DIR/host.sh.tmp"
mv "$HOST_DIR/host.sh.tmp" "$HOST_DIR/host.sh"
chmod +x "$HOST_DIR/host.sh"

case "$(uname -s)" in
  Darwin) MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts";;
  Linux)  MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts";;
  *)      echo "error: unsupported OS $(uname -s); use install.ps1 on Windows" >&2; exit 1;;
esac
mkdir -p "$MANIFEST_DIR"

MANIFEST="$MANIFEST_DIR/com.fintopia.cookie_keeper.json"
cat > "$MANIFEST" <<EOF
{
  "name": "com.fintopia.cookie_keeper",
  "description": "Cookie Keeper Native Host",
  "path": "$HOST_DIR/host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

echo "installed:"
echo "  host: $HOST_DIR"
echo "  manifest: $MANIFEST"

if [[ -x "$SCRIPT_DIR/doctor.sh" ]]; then
  "$SCRIPT_DIR/doctor.sh" || true
fi

echo
echo "final step: open the Cookie Keeper options page and click the 刷新 button next to host status."
