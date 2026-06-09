#!/bin/bash
# Cookie Keeper - 扩展打包（.crx 或 zip）

set -euo pipefail

EXTENSION_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$EXTENSION_DIR")"
CRX_FILE="$PARENT_DIR/cookie-keeper.crx"
PEM_FILE="$PARENT_DIR/cookie-keeper.pem"

echo "=========================================="
echo "Cookie Keeper - 扩展打包"
echo "=========================================="
echo ""

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ ! -f "$CHROME" ]]; then
  echo "❌ Chrome 未安装在默认位置"
  echo "可改用 zip 打包: bash build-pack.sh"
  exit 1
fi

if [[ ! -f "$EXTENSION_DIR/manifest.json" ]]; then
  echo "❌ manifest.json 不存在"
  exit 1
fi

VERSION=$(grep -o '"version":[^,]*' "$EXTENSION_DIR/manifest.json" | cut -d'"' -f4)
echo "📦 扩展版本: $VERSION"
echo ""

echo "正在打包 .crx ..."
if [[ -f "$PEM_FILE" ]]; then
  echo "使用已有密钥: $PEM_FILE"
  "$CHROME" --pack-extension="$EXTENSION_DIR" --pack-extension-key="$PEM_FILE" 2>/dev/null
else
  echo "首次打包，生成新密钥"
  "$CHROME" --pack-extension="$EXTENSION_DIR" 2>/dev/null
fi

echo ""
if [[ -f "$CRX_FILE" ]]; then
  SIZE=$(ls -lh "$CRX_FILE" | awk '{print $5}')
  echo "✅ CRX 打包成功: $CRX_FILE ($SIZE)"
  [[ -f "$PEM_FILE" ]] && echo "🔑 私钥: $PEM_FILE"
else
  echo "⚠️  CRX 打包失败，尝试 zip 打包..."
fi

echo ""
echo "正在打包 zip ..."
bash "$EXTENSION_DIR/build-pack.sh"
echo ""
echo "📋 安装: chrome://extensions/ → 开发者模式 → 加载已解压的扩展程序"
echo "    选择目录: $EXTENSION_DIR"
