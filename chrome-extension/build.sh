#!/bin/bash
# 自动打包 Chrome 扩展

set -e

EXTENSION_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$EXTENSION_DIR")"
CRX_FILE="$PARENT_DIR/chrome-extension.crx"
PEM_FILE="$PARENT_DIR/chrome-extension.pem"

echo "=========================================="
echo "Claw Cookie Exporter - 扩展打包"
echo "=========================================="
echo ""

# 检查 Chrome 是否安装
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME" ]; then
    echo "❌ Chrome 未安装在默认位置"
    echo "请手动打包: chrome://extensions/ -> 打包扩展程序"
    exit 1
fi

# 检查 manifest.json
if [ ! -f "$EXTENSION_DIR/manifest.json" ]; then
    echo "❌ manifest.json 不存在"
    exit 1
fi

# 读取版本号
VERSION=$(grep -o '"version":[^,]*' "$EXTENSION_DIR/manifest.json" | cut -d'"' -f4)
echo "📦 扩展版本: $VERSION"
echo ""

# 打包
echo "正在打包..."
if [ -f "$PEM_FILE" ]; then
    echo "使用已有密钥: $PEM_FILE"
    "$CHROME" --pack-extension="$EXTENSION_DIR" --pack-extension-key="$PEM_FILE" 2>/dev/null
else
    echo "首次打包，生成新密钥"
    "$CHROME" --pack-extension="$EXTENSION_DIR" 2>/dev/null
fi

echo ""

# 检查结果
if [ -f "$CRX_FILE" ]; then
    SIZE=$(ls -lh "$CRX_FILE" | awk '{print $5}')
    echo "✅ 打包成功"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 扩展包: $CRX_FILE ($SIZE)"
    if [ -f "$PEM_FILE" ]; then
        echo "🔑 私钥:   $PEM_FILE"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📋 安装方法:"
    echo "1. 打开 chrome://extensions/"
    echo "2. 拖拽 chrome-extension.crx 到页面"
    echo "3. 点击'添加扩展程序'"
    echo ""
    echo "⚠️  请妥善保管 .pem 文件，用于后续更新！"
else
    echo "❌ 打包失败"
    echo ""
    echo "手动打包方法:"
    echo "1. 访问 chrome://extensions/"
    echo "2. 开启'开发者模式'"
    echo "3. 点击'打包扩展程序'"
    echo "4. 选择 $EXTENSION_DIR"
    exit 1
fi
