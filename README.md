# Claw Credential Manager

本机凭证与 Token 管理服务，为 OpenClaw 等本地 AI Agent 提供安全的账号密码、API Key 和登录 Token 集中存储。

## 特性

- ✅ **纯本机服务**：仅监听 `127.0.0.1`，不对外暴露
- ✅ **KeePass 兼容**：使用 `.kdbx` 格式，可与 KeePassXC 互操作
- ✅ **多种访问方式**：支持 HTTP API、MCP (stdio) 和 **Web UI**
- ✅ **Web 管理界面**：现代化的浏览器界面，轻松管理凭证
- ✅ **Chrome Cookie 导出**：从浏览器导出登录态，避免单点登录冲突
- ✅ **最小权限**：Entry allowlist 白名单机制
- ✅ **自动刷新**：可配置脚本自动刷新过期 Token
- ✅ **安全加固**：速率限制、失败锁定、审计日志

## 快速开始

### 1. 构建

```bash
go build -o claw-vault-server ./cmd/server
```

### 2. 初始化

```bash
./claw-vault-server -init
```

这会：
- 创建配置目录 `~/.config/claw-vault/`
- 创建数据目录 `~/.local/share/claw-vault/`
- 创建状态目录 `~/.local/state/claw-vault/`
- 生成配置文件 `config.yaml`
- 创建空的 KeePass 数据库
- 生成 API Key
- 保存主密码到密钥文件（`0400` 权限）

### 3. 启动服务

**HTTP + Web UI 模式**（推荐，包含管理界面）：
```bash
./start-with-ui.sh
```

访问：
- Web UI: http://127.0.0.1:8080
- HTTP API: http://127.0.0.1:8765

**仅 HTTP 模式**（无 UI）：
```bash
./claw-vault-server
```

**MCP 模式**（用于支持 MCP 的 Agent）：
```bash
./claw-vault-server -mcp
```

## 配置

配置文件位于 `~/.config/claw-vault/config.yaml`：

```yaml
server:
  bind: "127.0.0.1:8765"  # 必须是 localhost/127.0.0.1

vault:
  backend: "kdbx"
  path: "~/.local/share/claw-vault/credentials.kdbx"
  unlock:
    key_file: "~/.local/state/claw-vault/.vault-key"  # chmod 0400
    env_var: "CLAW_VAULT_PASSWORD"  # 或使用环境变量

auth:
  api_key: "${CLAW_API_KEY}"  # 从环境变量加载

policy:
  entry_allowlist:  # 白名单模式
    - "github-*"      # 通配符匹配
    - "openai-api"    # 精确匹配
    - "slack-*"

security:
  rate_limit:
    requests_per_minute: 60
    auth_failures_max: 5
    lockout_duration: "5m"
```

### 解锁方式

支持两种解锁方式（二选一）：

1. **密钥文件**（推荐）：
   ```bash
   echo "your-master-password" > ~/.local/state/claw-vault/.vault-key
   chmod 0400 ~/.local/state/claw-vault/.vault-key
   ```

2. **环境变量**：
   ```bash
   export CLAW_VAULT_PASSWORD="your-master-password"
   ./claw-vault-server
   ```

⚠️ **安全建议**：
- 密钥文件必须设置 `0400` 权限
- 不要将密钥文件放入备份或云同步目录
- 使用环境变量时注意 `/proc/<pid>/environ` 对同用户可读

## Web UI 管理界面

### 快速访问

启动服务后，在浏览器中打开：**http://127.0.0.1:8080**

### 功能

- 📋 **查看凭证列表**：查看所有可访问的凭证（遵循 allowlist）
- ➕ **创建凭证**：通过表单添加新的账号密码或 Token
- ✏️ **编辑凭证**：更新现有凭证的信息
- 🗑️ **删除凭证**：删除不需要的凭证
- 👁️ **密码切换**：可选显示/隐藏密码

详细使用指南：[WEB_UI_GUIDE.md](WEB_UI_GUIDE.md)

---

## HTTP API

### 认证

所有请求需要携带 API Key：

```bash
curl -H "Authorization: Bearer <api-key>" http://127.0.0.1:8765/entries
```

### 端点

#### 1. 健康检查

```bash
GET /health
```

#### 2. 列出所有凭证（无敏感字段）

```bash
GET /entries
```

响应：
```json
{
  "entries": [
    {
      "id": "github-token",
      "name": "GitHub API Token",
      "type": "token",
      "username": "youruser",
      "tags": ["github", "api"],
      "metadata": {
        "token_expires_at": "2026-05-01T00:00:00Z"
      }
    }
  ],
  "count": 1
}
```

#### 3. 获取单个凭证（含敏感字段）

```bash
GET /entries/{id}
```

响应：
```json
{
  "id": "github-token",
  "name": "GitHub API Token",
  "type": "token",
  "username": "youruser",
  "password": "ghp_xxxxx",
  "custom_fields": {
    "api_url": "https://api.github.com"
  },
  "metadata": {
    "token_expires_at": "2026-05-01T00:00:00Z",
    "refresh_script_path": "/path/to/refresh.sh"
  }
}
```

#### 4. 创建凭证

```bash
POST /entries
Content-Type: application/json

{
  "id": "openai-api",
  "name": "OpenAI API Key",
  "type": "token",
  "password": "sk-xxxxx",
  "custom_fields": {
    "api_base": "https://api.openai.com"
  }
}
```

#### 5. 更新凭证

```bash
PUT /entries/{id}
Content-Type: application/json

{
  "name": "OpenAI API Key (Updated)",
  "password": "sk-yyyyy"
}
```

#### 6. 删除凭证

```bash
DELETE /entries/{id}
```

## Chrome Cookie 导出

从浏览器导出 cookies 到凭证管理器，让 AI Agent 复用你的登录状态（避免单点登录互踢）。

详细文档：[scripts/README.md](scripts/README.md)

### 快速开始

1. **安装依赖**
   ```bash
   cd scripts
   npm install
   ```

2. **创建启动器**
   ```bash
   ./create-app.sh
   ```

3. **启动 Chrome Debug**
   - 在 Alfred/Spotlight 搜索 `Chrome Debug`
   - 或双击 `~/Applications/Chrome Debug.app`

4. **登录网站** 后运行导出
   ```bash
   ./export-all-cookies.sh
   ```

5. **在 OpenClaw 中使用**
   ```javascript
   const credential = await mcpClient.callTool('get_credential', {
     id: 'github-cookies'
   });
   const cookies = JSON.parse(credential.password);
   await context.addCookies(cookies);
   ```

## MCP 集成

在 OpenClaw 或其他 MCP 客户端配置：

```json
{
  "mcpServers": {
    "claw-credentials": {
      "command": "/path/to/claw-vault-server",
      "args": ["-mcp"],
      "env": {
        "CLAW_VAULT_PASSWORD": "your-password"
      }
    }
  }
}
```

### MCP 工具

1. **list_credentials**：列出所有凭证
2. **get_credential**：获取指定凭证
3. **update_credential**：更新凭证

## Token 自动刷新

### 配置刷新脚本

1. 创建刷新脚本（必须在 `~/.config/claw-vault/scripts/` 目录下）：

```bash
#!/bin/bash
# ~/.config/claw-vault/scripts/refresh-github-token.sh

# 环境变量可用: ENTRY_ID, ENTRY_NAME, ENTRY_USERNAME, ENTRY_PASSWORD

# 执行刷新逻辑（示例）
NEW_TOKEN=$(curl -s -X POST https://api.github.com/refresh \
  -H "Authorization: Bearer $ENTRY_PASSWORD" | jq -r '.access_token')

# 输出 JSON 格式
cat <<EOF
{
  "token": "$NEW_TOKEN",
  "expires_at": "2026-06-01T00:00:00Z"
}
EOF
```

2. 设置权限：
```bash
chmod +x ~/.config/claw-vault/scripts/refresh-github-token.sh
```

3. 在凭证中配置脚本：
```json
{
  "id": "github-token",
  "metadata": {
    "refresh_script_path": "~/.config/claw-vault/scripts/refresh-github-token.sh",
    "refresh_interval_sec": 3600
  }
}
```

### 脚本输出格式

脚本必须输出 JSON 或纯文本 token：

**JSON 格式**（推荐）：
```json
{
  "token": "new-token-value",
  "expires_at": "2026-06-01T00:00:00Z"
}
```

**纯文本格式**：
```
new-token-value
```

### 安全约束

- ✅ 脚本必须在 `~/.config/claw-vault/scripts/` 目录下
- ✅ 自动防止路径穿越攻击
- ✅ 脚本执行超时 2 分钟
- ⚠️ 脚本执行失败会记录到 `metadata.last_refresh_error`

## OpenClaw 集成示例

在 OpenClaw 配置中添加：

```yaml
# OpenClaw config
credentials:
  provider: "http"
  endpoint: "http://127.0.0.1:8765"
  api_key: "${CLAW_API_KEY}"
```

或使用 MCP：

```json
{
  "mcpServers": {
    "credentials": {
      "command": "/path/to/claw-vault-server",
      "args": ["-mcp"],
      "env": {
        "CLAW_VAULT_PASSWORD": "${MASTER_PASSWORD}"
      }
    }
  }
}
```

## 威胁模型

### 信任边界

- **防护目标**：防止本机其他进程未授权读取凭证
- **假设**：攻击者可以尝试连接 `127.0.0.1:8765`
- **缓解措施**：
  - API Key 认证
  - Entry allowlist 白名单
  - 速率限制与失败锁定
  - 敏感字段不进入日志

### 不防护场景

- ❌ 物理机被攻陷后的内存 dump
- ❌ Root 权限恶意软件直接读取进程内存
- ❌ 主密码或 API Key 被泄漏

### 最佳实践

1. **最小权限原则**：
   - 仅在 `entry_allowlist` 中添加必需的条目
   - 避免使用 `"*"` 通配符

2. **密钥管理**：
   - 定期轮换 API Key
   - 主密码使用强密码（20+ 字符）
   - 密钥文件设置 `0400` 权限

3. **审计**：
   - 定期检查日志中的 `auth_failure` 事件
   - 监控异常的 `access_event`

4. **备份**：
   ```bash
   # 备份 .kdbx 文件
   cp ~/.local/share/claw-vault/credentials.kdbx /secure/backup/
   
   # 使用 KeePassXC 打开备份验证
   keepassxc /secure/backup/credentials.kdbx
   ```

## 故障排查

### 1. "database not opened"

检查主密码是否正确：
```bash
# 验证密钥文件
cat ~/.local/state/claw-vault/.vault-key

# 或验证环境变量
echo $CLAW_VAULT_PASSWORD
```

### 2. "entry not in allowlist"

检查 `config.yaml` 中的 `entry_allowlist`：
```yaml
policy:
  entry_allowlist:
    - "your-entry-id"  # 添加需要访问的 entry ID
```

### 3. "rate limit exceeded"

等待锁定期结束（默认 5 分钟）或重启服务。

### 4. 刷新脚本失败

查看日志：
```bash
# 查看错误信息
grep "token_refresh" ~/.local/state/claw-vault/audit.log

# 手动测试脚本
export ENTRY_PASSWORD="test"
~/.config/claw-vault/scripts/refresh-token.sh
```

## 开发

### 运行测试

```bash
go test ./...
```

### 构建

```bash
# 本地构建
go build -o claw-vault-server ./cmd/server

# 跨平台构建
GOOS=linux GOARCH=amd64 go build -o claw-vault-server-linux ./cmd/server
GOOS=darwin GOARCH=arm64 go build -o claw-vault-server-mac ./cmd/server
```

### 调试模式

```bash
DEBUG=true ./claw-vault-server
```

## Entry 数据模型

```json
{
  "id": "string (UUID or custom)",
  "name": "string",
  "type": "password | token | mixed",
  "username": "string (optional)",
  "password": "string (sensitive)",
  "custom_fields": {
    "key": "value"
  },
  "tags": ["tag1", "tag2"],
  "notes": "string",
  "metadata": {
    "token_expires_at": "ISO8601 timestamp",
    "refresh_script_path": "path to script",
    "last_refreshed_at": "ISO8601 timestamp",
    "last_refresh_error": "string",
    "refresh_interval_sec": 3600
  }
}
```

## KeePass 字段映射

| Entry 字段 | KDBX 映射 |
|-----------|----------|
| `id` | Entry UUID |
| `name` | Title |
| `username` | UserName |
| `password` | Password (protected) |
| `notes` | Notes |
| `type` | CustomData["Type"] |
| `custom_fields` | CustomData["CustomFields"] (JSON) |
| `tags` | CustomData["Tags"] (JSON) |
| `metadata` | CustomData["Metadata"] (JSON) |

可以使用 KeePassXC 直接编辑 `.kdbx` 文件，服务会自动读取更新。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关文档

- [设计文档](docs/requirements-and-architecture.md)
- [KeePass 格式规范](https://keepass.info/help/kb/kdbx_4.html)
- [MCP 协议](https://modelcontextprotocol.io/)
