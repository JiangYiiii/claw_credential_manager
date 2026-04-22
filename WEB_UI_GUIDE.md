# Web UI 使用指南

Claw Credential Manager 现在提供了一个现代化的 Web 管理界面，让你可以通过浏览器轻松管理凭证。

## 快速启动

### 方式 1：一键启动（推荐）

```bash
cd /Users/jiangyi/Documents/codedev/claw_credential_manager
./start-with-ui.sh
```

这会启动：
- HTTP API Server (http://127.0.0.1:8765)
- Web UI Server (http://127.0.0.1:8080)

### 方式 2：手动启动

**启动 HTTP API Server**:
```bash
./claw-vault-server
```

**启动 Web UI** (新终端):
```bash
cd web
npm start
```

### 停止服务

```bash
./stop-services.sh
```

---

## 访问 Web UI

打开浏览器，访问：**http://127.0.0.1:8080**

---

## 功能介绍

### 1. 查看凭证列表

Web UI 首页会显示所有可访问的凭证（基于 allowlist 配置）。

**显示信息**：
- ✅ 凭证名称
- ✅ ID
- ✅ 类型（password / token / mixed）
- ✅ 用户名
- ✅ 标签

**隐藏信息**：
- ❌ 密码/Token 值（出于安全考虑）

### 2. 创建新凭证

点击右上角的 **"+ 新建凭证"** 按钮。

**必填字段**：
- **ID**: 唯一标识符（例如：`github-token`）
- **名称**: 显示名称（例如：`GitHub API Token`）
- **类型**: 选择 password / token / mixed
- **密码/Token**: 实际的凭证值

**可选字段**：
- **用户名**: 账号用户名
- **标签**: 逗号分隔的标签（例如：`github, api`）
- **备注**: 额外的说明信息

### 3. 编辑凭证

点击凭证卡片上的 **"编辑"** 按钮。

**注意**：
- ID 字段在编辑模式下不可修改
- 所有其他字段可以更新
- 点击 "保存" 提交更改

### 4. 删除凭证

点击凭证卡片上的 **"删除"** 按钮。

**警告**：
- 删除操作不可恢复
- 系统会要求确认

### 5. 查看密码

在编辑模式下，点击密码字段右侧的 👁️ 图标可以切换显示/隐藏密码。

---

## 安全说明

### ✅ 安全特性

1. **本地访问**：Web UI 仅监听 `127.0.0.1`，不对外暴露
2. **API 代理**：Web UI 通过后端 API 访问数据，遵循 allowlist 规则
3. **密码隐藏**：列表页面不显示敏感字段
4. **HTTPS 支持**：可选配置（生产环境推荐）

### ⚠️ 注意事项

1. **浏览器历史**：
   - 密码字段的值可能被浏览器记录
   - 建议使用隐私浏览模式

2. **网络流量**：
   - Web UI ↔ API 通信默认为 HTTP
   - 如需加密，配置 TLS

3. **API Key**：
   - Web UI 使用硬编码的 API Key
   - 生产环境建议通过环境变量配置

---

## 配置

### 环境变量

Web UI 支持以下环境变量：

```bash
# Web UI 端口（默认：8080）
export WEB_PORT=8080

# API 服务器地址（默认：http://127.0.0.1:8765）
export API_BASE=http://127.0.0.1:8765

# API Key（默认从 config.yaml 读取）
export CLAW_API_KEY=claw_1776839434829992000
```

启动示例：
```bash
WEB_PORT=9090 API_BASE=http://127.0.0.1:8765 npm start
```

### 修改 API Key

如果你更改了 API Key，需要更新：

**方法 1：环境变量**
```bash
export CLAW_API_KEY=your_new_api_key
npm start
```

**方法 2：修改代码**
编辑 `web/standalone-server.js`，修改第 10 行：
```javascript
const API_KEY = process.env.CLAW_API_KEY || 'your_new_api_key';
```

---

## 与 OpenClaw 集成

Web UI 和 MCP 可以同时运行：

1. **MCP 模式**（供 OpenClaw 使用）
   ```bash
   # Plugin Manager 已经包含了 claw-credentials MCP
   cd /Users/jiangyi/Documents/codedev/claw_plugin_manager
   npm start
   ```

2. **HTTP + Web UI 模式**（人工管理）
   ```bash
   # 启动 HTTP API 和 Web UI
   cd /Users/jiangyi/Documents/codedev/claw_credential_manager
   ./start-with-ui.sh
   ```

两种模式使用相同的 `.kdbx` 数据库文件，互不冲突。

---

## 故障排查

### 问题 1: Web UI 无法访问

**症状**：浏览器显示 "无法访问此网站"

**解决**：
```bash
# 检查 Web UI 是否运行
ps aux | grep "node.*standalone-server"

# 检查端口占用
lsof -i :8080

# 重启服务
./stop-services.sh
./start-with-ui.sh
```

### 问题 2: "Backend API is not available"

**症状**：Web UI 显示后端不可用错误

**解决**：
```bash
# 检查 HTTP API 服务器
ps aux | grep "claw-vault-server"

# 检查日志
tail -f /tmp/vault-server.log

# 确保 HTTP API 在运行
./claw-vault-server
```

### 问题 3: 凭证列表为空

**症状**：Web UI 显示"还没有凭证"，但实际有数据

**原因**：Allowlist 配置限制了可访问的条目

**解决**：
编辑 `~/.config/claw-vault/config.yaml`：
```yaml
policy:
  entry_allowlist:
    - "*"  # 允许所有（开发环境）
    # 或添加具体的 ID
```

重启服务：
```bash
./stop-services.sh
./start-with-ui.sh
```

### 问题 4: 无法创建/更新凭证

**症状**：保存时提示 "entry not in allowlist"

**原因**：新凭证的 ID 不在 allowlist 中

**解决**：
1. 检查你输入的 ID
2. 更新 allowlist 配置以包含该 ID
3. 或使用通配符（如 `github-*`）

---

## 技术架构

```
┌─────────────┐
│   Browser   │
│ (127.0.0.1: │
│    8080)    │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────────┐
│   Web UI        │
│ (Node.js/       │
│  Express)       │
└──────┬──────────┘
       │ HTTP + API Key
       ▼
┌─────────────────┐
│  HTTP API       │
│  Server (Go)    │
│ (127.0.0.1:     │
│    8765)        │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  KeePass DB     │
│  (.kdbx)        │
└─────────────────┘
```

**优势**：
- 前后端分离
- Web UI 无需访问数据库
- 统一的访问控制（API Key + Allowlist）
- 易于扩展和维护

---

## 开发

### 安装依赖

```bash
cd web
npm install
```

### 开发模式

```bash
npm run dev  # 使用 nodemon 自动重启
```

### 修改前端

编辑 `web/views/index.ejs` 修改 UI 样式和逻辑。

### 添加新功能

1. 在 `standalone-server.js` 中添加新的 API 路由
2. 在 `index.ejs` 中添加对应的前端调用
3. 重启服务测试

---

## 未来计划

- [ ] 支持批量操作
- [ ] Token 刷新脚本管理界面
- [ ] 凭证导入/导出
- [ ] 搜索和过滤功能
- [ ] 深色模式
- [ ] 多语言支持
- [ ] 凭证使用统计

---

## 反馈

有问题或建议？请提交 Issue 或联系开发者。

---

**Last Updated**: 2026-04-22  
**Version**: 1.0.0
