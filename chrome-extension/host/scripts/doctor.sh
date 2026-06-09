#!/usr/bin/env bash
# Cookie Keeper installation health check.

set -u
HOST_DIR="$HOME/.agents/cookie-keeper/host"
DATA_FILE="$HOME/.agents/cookie-keeper/all-cookies.json"
RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RST=$'\e[0m'

ok()   { echo "${GREEN}[ok]${RST} $1"; }
warn() { echo "${YELLOW}[warn]${RST} $1"; }
bad()  { echo "${RED}[fail]${RST} $1"; FAIL=1; }
FAIL=0

# 1. node
if ! command -v node >/dev/null 2>&1; then
  bad "node not in PATH"
else
  V=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
  if [[ "$V" -lt 18 ]]; then bad "node $V < 18"; else ok "node $(node --version)"; fi
fi

# 2. host files
if [[ -x "$HOST_DIR/host.sh" ]]; then ok "host.sh executable"
else bad "host.sh missing or not executable: $HOST_DIR/host.sh"
fi

# 3. NMH manifest
case "$(uname -s)" in
  Darwin) MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.fintopia.cookie_keeper.json";;
  Linux)  MANIFEST="$HOME/.config/google-chrome/NativeMessagingHosts/com.fintopia.cookie_keeper.json";;
  *) MANIFEST="";;
esac
if [[ -n "$MANIFEST" && -f "$MANIFEST" ]]; then
  if grep -q 'chrome-extension://[a-z]\{32\}/' "$MANIFEST"; then ok "manifest with ext-id at $MANIFEST"
  else bad "manifest missing valid ext-id at $MANIFEST"
  fi
else bad "manifest not found at $MANIFEST"
fi

# 4. data file presence (mtime is informational only — long-stable login sessions
# legitimately leave cookies untouched for days; see SKILL.md "不主动检查新鲜度")
if [[ -f "$DATA_FILE" ]]; then
  ok "all-cookies.json exists"
else warn "all-cookies.json not yet written; trigger one cookie change to test"
fi

# 5. spin up host with one ping
# Pick a portable timeout binary; fall back to no-timeout (host exits on stdin EOF).
TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN="timeout 5"
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN="gtimeout 5"
fi

if [[ -x "$HOST_DIR/host.sh" ]]; then
  # printf sends 4 bytes of length-prefix (5 = strlen of "ping") followed by JSON.
  # head -c 200 short-circuits read once we've grabbed enough bytes for the hello.
  PROBE_OUT=$(printf '\x05\x00\x00\x00"ping"' | $TIMEOUT_BIN "$HOST_DIR/host.sh" 2>&1 | head -c 200 || true)
  if echo "$PROBE_OUT" | grep -q '"hello"'; then ok "host launches and emits hello"
  else bad "host did not emit hello on stdin probe"
  fi
fi

if [[ "$FAIL" -eq 0 ]]; then echo "${GREEN}all checks passed${RST}"; exit 0
else echo "${RED}some checks failed; see above${RST}"; exit 1
fi
