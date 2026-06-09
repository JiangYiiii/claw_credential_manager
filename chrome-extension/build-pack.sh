#!/usr/bin/env bash
#
# Pack a clean .zip of the extension for Chrome Web Store / distribution.
# Only files referenced by manifest.json are included, plus the manifest itself.
#
# Usage: ./scripts/pack.sh
# Output: dist/cookie-keeper-<version>.zip
#
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$PWD"

if [[ ! -f manifest.json ]]; then
  echo "error: manifest.json not found (are you in the project root?)" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (brew install jq)" >&2
  exit 1
fi

VERSION=$(jq -r '.version' manifest.json)
if [[ -z "$VERSION" || "$VERSION" == "null" ]]; then
  echo "error: could not read version from manifest.json" >&2
  exit 1
fi

OUT_DIR="$ROOT/dist"
STAGE_DIR="$OUT_DIR/stage-$VERSION"
OUT_ZIP="$OUT_DIR/cookie-keeper-$VERSION.zip"

rm -rf "$STAGE_DIR" "$OUT_ZIP"
mkdir -p "$STAGE_DIR"

# Explicit allowlist — mirrors what manifest.json references.
# Update this when adding new files that the extension actually loads.
FILES=(
  manifest.json
  default-domains.json
  background.js
  util.js
  host-port.js
  ext-id.js
  popup.html
  popup.js
  options.html
  options.js
  prompt.html
  prompt.js
)

for f in "${FILES[@]}"; do
  if [[ ! -e "$f" ]]; then
    echo "error: required file missing: $f" >&2
    exit 1
  fi
  mkdir -p "$STAGE_DIR/$(dirname "$f")"
  cp "$f" "$STAGE_DIR/$f"
done

# Icons: copy only the sizes declared in manifest.
ICON_PATHS=$(jq -r '[.icons // {}, .action.default_icon // {}] | .[] | .[]' manifest.json | sort -u)
for icon in $ICON_PATHS; do
  if [[ ! -f "$icon" ]]; then
    echo "error: icon referenced in manifest but missing: $icon" >&2
    exit 1
  fi
  mkdir -p "$STAGE_DIR/$(dirname "$icon")"
  cp "$icon" "$STAGE_DIR/$icon"
done

( cd "$STAGE_DIR" && zip -qr "$OUT_ZIP" . )

# Cleanup stage; keep only the zip.
rm -rf "$STAGE_DIR"

echo "Built: $OUT_ZIP"
echo "Size:  $(du -h "$OUT_ZIP" | cut -f1)"
echo
echo "Contents:"
# Strip unzip's header (3 lines) and footer (2 lines) to show just the file list.
unzip -l "$OUT_ZIP" | awk 'NR>3 && !/^-----/ && !/files$/'
