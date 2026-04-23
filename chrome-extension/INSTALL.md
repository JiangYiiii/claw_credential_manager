# Claw Cookie Exporter 安装指南

## 方式1: 加载已解压的扩展程序 (开发模式)

**适合**: 开发测试、需要经常修改代码

### 安装步骤

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. **开启右上角"开发者模式"**
4. 点击 **"加载已解压的扩展程序"**
5. 选择 `chrome-extension` 目录

### 注意事项
- ⚠️ 每次启动 Chrome 会提示"请停用以开发者模式运行的扩展程序"
- ✅ 可以直接修改代码，刷新扩展即可生效

---

## 方式2: 打包扩展程序 (生产模式) 【推荐】

**适合**: 日常使用、团队分发

### 步骤1: 打包扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击 **"打包扩展程序"**
5. **扩展程序根目录**: 选择 `chrome-extension` 目录
6. **私有密钥文件**: 留空（首次打包）
7. 点击"打包扩展程序"

会生成两个文件：
- `chrome-extension.crx` - 扩展安装包
- `chrome-extension.pem` - 私钥文件（**务必保管好，用于更新**）

### 步骤2: 安装 .crx 文件

**方法A: 拖拽安装**
1. 打开 `chrome://extensions/`
2. 将 `chrome-extension.crx` 拖入页面
3. 点击"添加扩展程序"

**方法B: 开发者模式安装（Chrome 限制较多时）**
1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 将 `.crx` 文件拖入
4. 安装后可以关闭开发者模式

### 步骤3: 更新扩展（修改代码后）

1. 修改 `chrome-extension/` 中的代码
2. **修改版本号** `manifest.json` 中 `version` 字段，如 `1.0.0` → `1.0.1`
3. 打包时 **必须选择之前的 .pem 文件**
4. 生成新的 .crx 文件
5. 用户安装新的 .crx 会自动覆盖旧版本

---

## 方式3: 快速打包脚本

创建自动打包脚本 `build.sh`:

```bash
#!/bin/bash
# 自动打包Chrome扩展

# 检查Chrome是否安装
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME" ]; then
    echo "❌ Chrome 未安装"
    exit 1
fi

# 打包
"$CHROME" --pack-extension=chrome-extension --pack-extension-key=chrome-extension.pem 2>/dev/null

if [ -f chrome-extension.crx ]; then
    echo "✅ 打包成功: chrome-extension.crx"
    ls -lh chrome-extension.crx
else
    echo "❌ 打包失败"
    exit 1
fi
```

运行: `bash build.sh`

---

## 团队分发

### 1. 本地分发
将 `chrome-extension.crx` 发送给团队成员，直接拖拽安装

### 2. 内网服务器
```bash
# 上传到内网服务器
scp chrome-extension.crx user@server:/var/www/html/

# 团队访问
http://your-server/chrome-extension.crx
```

### 3. Chrome Web Store (公开发布)
如需公开发布，需要：
1. 注册 Chrome 开发者账号 ($5 一次性费用)
2. 上传 .zip 压缩包
3. 填写商店信息
4. 提交审核

---

## 配置说明

安装后首次打开扩展需要配置：

- **API 地址**: `http://localhost:8002` (默认)
- **API Key**: 从容器环境变量或配置文件获取

配置保存在浏览器 localStorage，无需每次输入。

---

## 故障排查

### 问题1: 无法拖拽安装 .crx
**原因**: Chrome 安全策略
**解决**: 使用开发者模式安装，或修改文件扩展名为 .zip 后解压安装

### 问题2: "程序包无效"
**原因**: manifest.json 格式错误
**解决**: 检查 JSON 语法，确保版本号格式正确

### 问题3: API 调用失败
**原因**: 容器未启动或端口不正确
**解决**: 
```bash
# 检查容器状态
podman ps | grep credential-manager

# 检查端口
curl http://localhost:8002/entries
```

### 问题4: CORS 错误
**原因**: API 未允许跨域
**解决**: API 已配置 CORS，如仍有问题检查 API 服务器日志
