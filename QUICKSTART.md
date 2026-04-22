# Claw Credential Manager - 快速入门

## 5 分钟上手指南

### 第一步：构建

```bash
git clone <repository>
cd claw_credential_manager
make build
```

### 第二步：初始化

```bash
./claw-vault-server -init
```

按提示输入主密码，系统会：
- 创建配置目录和文件
- 生成 KeePass 数据库
- 生成 API Key
- 保存主密码到密钥文件

**重要**：记录生成的 API Key！

### 第三步：启动服务

```bash
./claw-vault-server
```

服务会监听 `127.0.0.1:8765`

### 第四步：创建第一个凭证

```bash
# 使用你的 API Key 替换下面的值
API_KEY="claw_1234567890"

curl -X POST -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-first-credential",
    "name": "GitHub Token",
    "type": "token",
    "password": "ghp_your_token_here"
  }' http://127.0.0.1:8765/entries
```

### 第五步：获取凭证

```bash
curl -H "Authorization: Bearer $API_KEY" \
  http://127.0.0.1:8765/entries/my-first-credential
```

## 配置 OpenClaw

### HTTP 模式（推荐）

在 OpenClaw 配置中添加：

```yaml
credentials:
  provider: "http"
  endpoint: "http://127.0.0.1:8765"
  api_key: "${CLAW_API_KEY}"
```

### MCP 模式

在 MCP 客户端配置中添加：

```json
{
  "mcpServers": {
    "claw-credentials": {
      "command": "/path/to/claw-vault-server",
      "args": ["-mcp"],
      "env": {
        "CLAW_VAULT_PASSWORD": "your-master-password"
      }
    }
  }
}
```

## 常用命令

```bash
# 启动 HTTP 服务器
./claw-vault-server

# 启动 MCP 服务器
./claw-vault-server -mcp

# 使用自定义配置
./claw-vault-server -config /path/to/config.yaml

# 启用调试日志
DEBUG=true ./claw-vault-server
```

## 配置 Entry 白名单

编辑 `~/.config/claw-vault/config.yaml`：

```yaml
policy:
  entry_allowlist:
    - "github-*"      # 匹配所有以 github- 开头的条目
    - "openai-api"    # 精确匹配
    - "slack-*"       # 通配符匹配
```

⚠️ **安全建议**：不要使用 `"*"` 通配符，明确列出需要访问的条目。

## Token 自动刷新

### 1. 创建刷新脚本

```bash
cat > ~/.config/claw-vault/scripts/refresh-my-token.sh <<'EOF'
#!/bin/bash
# 你的刷新逻辑
NEW_TOKEN=$(curl -s https://api.example.com/refresh)
cat <<JSON
{
  "token": "$NEW_TOKEN",
  "expires_at": "2026-06-01T00:00:00Z"
}
JSON
EOF

chmod +x ~/.config/claw-vault/scripts/refresh-my-token.sh
```

### 2. 配置条目使用刷新脚本

```bash
curl -X PUT -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "refresh_script_path": "~/.config/claw-vault/scripts/refresh-my-token.sh",
      "refresh_interval_sec": 3600
    }
  }' http://127.0.0.1:8765/entries/my-credential
```

服务器会每小时自动执行脚本刷新 token。

## 故障排查

### 问题 1: "database not opened"

**原因**：主密码不正确或密钥文件缺失

**解决**：
```bash
# 检查密钥文件
cat ~/.local/state/claw-vault/.vault-key

# 或重新设置
echo "your-password" > ~/.local/state/claw-vault/.vault-key
chmod 0400 ~/.local/state/claw-vault/.vault-key
```

### 问题 2: "entry not in allowlist"

**原因**：Entry ID 不在白名单中

**解决**：编辑 `config.yaml` 添加 entry ID 到 `entry_allowlist`

### 问题 3: "rate limit exceeded"

**原因**：请求过于频繁或认证失败次数过多

**解决**：等待 5 分钟或重启服务

## 与 KeePassXC 互操作

你可以用 KeePassXC 直接编辑数据库文件：

```bash
# 用 KeePassXC 打开
keepassxc ~/.local/share/claw-vault/credentials.kdbx
```

**字段映射**：
- `Title` = Entry Name
- `UserName` = Username
- `Password` = Password
- `CustomID` = Custom Entry ID
- `CustomData` = 自定义字段（JSON）
- `Metadata` = Token 元数据（JSON）

## 备份

```bash
# 备份数据库
cp ~/.local/share/claw-vault/credentials.kdbx ~/backup/

# 备份配置
cp -r ~/.config/claw-vault ~/backup/

# ⚠️ 不要忘记密钥文件
cp ~/.local/state/claw-vault/.vault-key ~/backup/
```

## 下一步

- 阅读 [完整文档](README.md)
- 查看 [示例脚本](examples/)
- 阅读 [架构设计](docs/requirements-and-architecture.md)

## 获取帮助

- 查看日志：`~/.local/state/claw-vault/audit.log`（如果配置了）
- 开启调试：`DEBUG=true ./claw-vault-server`
- GitHub Issues: [报告问题](https://github.com/your-org/claw-credential-manager/issues)
