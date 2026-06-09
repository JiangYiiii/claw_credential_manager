#!/usr/bin/env bash
set -euo pipefail

HOST_DIR="$HOME/.agents/cookie-keeper/host"
case "$(uname -s)" in
  Darwin) MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.fintopia.cookie_keeper.json";;
  Linux)  MANIFEST="$HOME/.config/google-chrome/NativeMessagingHosts/com.fintopia.cookie_keeper.json";;
  *) echo "use uninstall.ps1 on Windows" >&2; exit 1;;
esac

# Kill any host.js processes Chrome may have spawned earlier so the
# extension stops seeing a "connected" port. Without this step,
# existing connections survive even after the manifest is removed —
# the deletion only affects the NEXT connectNative call.
if pgrep -f "cookie-keeper/host/host.js" >/dev/null 2>&1; then
  pkill -f "cookie-keeper/host/host.js" 2>/dev/null && echo "killed running host processes"
fi

[[ -d "$HOST_DIR" ]] && rm -rf "$HOST_DIR" && echo "removed: $HOST_DIR"
[[ -f "$MANIFEST" ]] && rm "$MANIFEST" && echo "removed: $MANIFEST"

echo "kept (your data):"
echo "  $HOME/.agents/cookie-keeper/all-cookies.json"
echo "  $HOME/.agents/cookie-keeper/host.log"
echo
echo "now: go to chrome://extensions and remove the Cookie Keeper extension."
