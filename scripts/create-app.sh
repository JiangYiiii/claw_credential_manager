#!/bin/bash
# 创建独立的 Chrome Debug.app
# 所有逻辑都在 App 内部，不依赖外部脚本

APP_NAME="Chrome Debug"
APP_PATH="$HOME/Applications/$APP_NAME.app"

echo "=========================================="
echo "创建 Chrome Debug 应用"
echo "=========================================="
echo ""

# 创建 app 结构
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# 创建完整的启动脚本（所有逻辑都在这里）
cat > "$APP_PATH/Contents/MacOS/launch" << 'LAUNCHER_EOF'
#!/bin/bash
# Chrome Debug 启动器
# 所有逻辑内置，无需外部依赖

DEBUG_DIR="$HOME/Library/Application Support/Google/Chrome-Debug"
MAIN_DIR="$HOME/Library/Application Support/Google/Chrome"
LOG_FILE="/tmp/chrome-debug.log"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# 检查是否已经在运行
if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    log "✅ Debug Chrome 已在运行"
    osascript -e 'tell application "Google Chrome" to activate' 2>/dev/null
    exit 0
fi

# 警告：主 Chrome 在运行
if pgrep -f "Google Chrome.*user-data-dir.*Chrome\"$" > /dev/null 2>&1; then
    log "⚠️  检测到主 Chrome 正在运行，可能导致数据冲突"
    log "   建议先关闭主 Chrome，继续启动 Debug Chrome..."
    sleep 2
fi

# 首次运行：同步登录状态
if [ ! -d "$DEBUG_DIR/Default" ]; then
    log "📦 首次运行，正在同步登录状态..."
    mkdir -p "$DEBUG_DIR"

    if [ -d "$MAIN_DIR/Default" ]; then
        rsync -a --delete "$MAIN_DIR/Default/" "$DEBUG_DIR/Default/" \
            --exclude "Service Worker" \
            --exclude "Cache" \
            --exclude "Code Cache" \
            --exclude "GPUCache" \
            2>/dev/null
        log "✅ 登录状态已同步"
    else
        log "⚠️  找不到主 Chrome 配置，将使用空白配置"
    fi
fi

# 启动 Chrome
log "🚀 启动 Debug Chrome..."
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$DEBUG_DIR" \
  >> "$LOG_FILE" 2>&1 &

CHROME_PID=$!
log "Chrome 进程 PID: $CHROME_PID"

# 等待启动完成
for i in {1..20}; do
    if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
        log "✅ Debug Chrome 启动成功！"
        log ""
        log "调试端口: http://localhost:9222"
        log "导出脚本: $(dirname $(dirname "$0"))/scripts/export-all-cookies.sh"

        # 显示通知（可选）
        osascript -e 'display notification "Chrome Debug 已启动，可以导出 cookies" with title "Chrome Debug"' 2>/dev/null

        exit 0
    fi
    sleep 0.5
done

log "❌ 启动超时，请检查日志: $LOG_FILE"
exit 1
LAUNCHER_EOF

chmod +x "$APP_PATH/Contents/MacOS/launch"

# 创建 Info.plist
cat > "$APP_PATH/Contents/Info.plist" << 'PLIST_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launch</string>
    <key>CFBundleIdentifier</key>
    <string>com.claw.chrome-debug</string>
    <key>CFBundleName</key>
    <string>Chrome Debug</string>
    <key>CFBundleDisplayName</key>
    <string>Chrome Debug</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSUIElement</key>
    <false/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST_EOF

echo "✅ 应用创建成功: $APP_PATH"
echo ""
echo "📋 使用方式："
echo "  1. Alfred/Spotlight: 搜索 'Chrome Debug'"
echo "  2. 双击应用图标"
echo "  3. 终端: open '$APP_PATH'"
echo ""
echo "📝 日志文件: /tmp/chrome-debug.log"
echo "📁 配置目录: ~/Library/Application Support/Google/Chrome-Debug/"
echo ""
echo "=========================================="
echo "下一步："
echo "1. 启动 Chrome Debug 应用"
echo "2. 登录你需要的网站"
echo "3. 运行: cd $(dirname "$0") && ./export-all-cookies.sh"
echo "=========================================="
