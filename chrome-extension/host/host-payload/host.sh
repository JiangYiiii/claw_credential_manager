#!/usr/bin/env bash
# Cookie Keeper host launcher. Chrome spawns this in a clean environment
# (no .zshrc / nvm), so we cannot rely on `node` being in PATH. install.sh
# captures the absolute node path at install time and rewrites the
# NODE_BIN= line below. The fallback (PATH lookup) is for the case where
# this file is run directly from the bare checkout, e.g. by doctor.sh.
NODE_BIN="$(command -v node 2>/dev/null || echo node)"  # COOKIE_KEEPER_NODE_BIN_ANCHOR
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/.agents/cookie-keeper" 2>/dev/null
exec "$NODE_BIN" "$HERE/host.js" "$@" 2>>"$HOME/.agents/cookie-keeper/host.log"
