# 统一凭证管理方案 - 解决两套系统的问题

## 当前问题

您有**两套独立的 credential manager**，数据不同步：

```
本地 stdio vault-server (OpenClaw 使用)
├── 文件: ~/.local/share/claw-vault/credentials.kdbx
├── 密码: test-password-123
├── Token: C63548CAA90FB2BBFDB8DF71D1EE796DFCA9BFC9C7F8E1DB2994B56970B2F2BD1A3052C667731C95... (旧)
└── 问题: Chrome 插件导出不会更新这个文件 ❌

容器 credential-manager (端口 8002)
├── 文件: /vault/credentials.kdbx (容器内)
├── 密码: d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124
├── Token: A1A22D06A0BCD70EA5923717DCAD2A1C0F402F98058D9953CF6881DF2CB1FB93C1847889195F9C6C... (新)
└── 优势: Chrome 插件导出会自动更新 ✅
```

**结果**：OpenClaw 拿到旧 token，无法触发群通知。

---

## 统一方案（推荐）

### 方案 A：让 OpenClaw 使用容器的 HTTP API（最简单）

#### 架构调整

```
Chrome 插件导出
    ↓
容器 credential-manager (HTTP API, 端口 8002)
    ↓
容器 plugin-manager (HTTP MCP, 端口 8090)
    ↓
OpenClaw / Claude Desktop
```

#### 实施步骤

**步骤 1：找到 OpenClaw 的 MCP 配置**

可能的位置：
- `~/.config/Claude/claude_desktop_config.json`
- `~/Library/Application Support/Claude/claude_desktop_config.json`
- OpenClaw 自己的配置文件

**步骤 2：移除本地 stdio vault-server**

找到类似这样的配置：
```json
{
  "mcpServers": {
    "claw-credentials": {
      "command": "/path/to/claw-vault-server",
      "args": ["-mcp"],
      "env": {
        "CLAW_VAULT_PASSWORD": "test-password-123"
      }
    }
  }
}
```

**删除或注释掉这个配置**。

**步骤 3：改用 plugin-manager 的 HTTP MCP**

添加新配置：
```json
{
  "mcpServers": {
    "openclaw-plugin-manager": {
      "url": "http://localhost:8090"
    }
  }
}
```

或者直接使用 credential-manager 的 HTTP API（如果 OpenClaw 支持自定义 HTTP MCP）：
```json
{
  "mcpServers": {
    "claw-credentials": {
      "url": "http://localhost:8002",
      "headers": {
        "Authorization": "Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124"
      }
    }
  }
}
```

**步骤 4：重启 OpenClaw/Claude Desktop**

**步骤 5：验证**

```bash
# 测试 OpenClaw 现在拿到的 token
# 应该是新的: A1A22D06A0BCD70EA5923717DCAD2A1C...
```

#### 优点
✅ **单一数据源** - 只有容器的一份数据  
✅ **自动同步** - Chrome 插件导出后，OpenClaw 立即可用  
✅ **简化维护** - 不需要管理两套系统  
✅ **配置统一** - 所有服务用同一个 API key  

---

### 方案 B：同步本地文件到容器（不推荐）

如果必须保留本地 stdio vault-server，需要：

**步骤 1：修改 Chrome 插件配置**

让插件同时写入两个地方（需要修改插件代码）。

**步骤 2：定期同步文件**

```bash
# 创建同步脚本
cat > ~/sync-credentials.sh << 'EOF'
#!/bin/bash
# 从容器复制 KeePass 文件到本地
podman cp claw-credential-manager:/vault/credentials.kdbx ~/.local/share/claw-vault/credentials.kdbx

# 修改本地文件的密码为 test-password-123（需要 kpcli 工具）
# 或者统一使用容器的密码
EOF

chmod +x ~/sync-credentials.sh

# 设置 cron job
crontab -e
# 添加: */10 * * * * ~/sync-credentials.sh
```

**步骤 3：统一密码**

将本地 vault-server 的密码改为和容器一样：
```bash
export CLAW_VAULT_PASSWORD="d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124"
```

#### 缺点
❌ 复杂：需要定期同步  
❌ 延迟：同步间隔内数据仍然不一致  
❌ 容易出错：两份配置容易忘记更新  

---

### 方案 C：废弃容器，只用本地（不推荐）

**步骤 1：修改 Chrome 插件配置**

```javascript
// chrome-extension/popup.js
const apiBase = 'http://localhost:8765';  // 改为本地 vault-server 的端口
```

**步骤 2：启动本地 HTTP vault-server**

```bash
cd /Users/jiangyi/Documents/codedev/claw_credential_manager
./claw-vault-server -config config.yaml
```

配置文件需要指向本地 KeePass：
```yaml
vault:
  backend: "kdbx"
  path: "/Users/jiangyi/.local/share/claw-vault/credentials.kdbx"
  unlock:
    env_var: "CLAW_VAULT_PASSWORD"

auth:
  api_key: "d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124"
```

#### 缺点
❌ 失去容器化的优势  
❌ 需要手动管理进程  
❌ 多个项目时更复杂  

---

## 推荐实施：方案 A

### 完整步骤

#### 1. 备份现有配置

```bash
# 备份本地 KeePass 文件（以防万一）
cp ~/.local/share/claw-vault/credentials.kdbx ~/.local/share/claw-vault/credentials.kdbx.backup

# 备份 OpenClaw 配置
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json \
   ~/Library/Application\ Support/Claude/claude_desktop_config.json.backup
```

#### 2. 确认容器服务运行正常

```bash
# 运行配置检查
cd /Users/jiangyi/Documents/codedev/claw_credential_manager
./scripts/check-config.sh

# 应该显示所有服务正常
```

#### 3. 修改 OpenClaw 配置

找到 OpenClaw 的 MCP 配置文件，修改为：

```json
{
  "mcpServers": {
    "openclaw-plugin-manager": {
      "url": "http://localhost:8090"
    }
  }
}
```

#### 4. 重启 OpenClaw

#### 5. 验证新配置

在 OpenClaw 中测试获取凭证：

```
请获取 rhino-cookies 的凭证
```

检查返回的 token 是否为新的（`A1A22D06A0BCD70EA5923717DCAD2A1C...`）。

#### 6. 测试 Rhino API 调用

```
请调用 rhino API 处理工单 1234322
```

检查群里是否收到通知。

#### 7. 清理旧配置（可选）

如果新配置工作正常，可以删除本地的旧文件：

```bash
# 删除本地 KeePass 文件（已有备份）
rm ~/.local/share/claw-vault/credentials.kdbx

# 删除本地 vault-server 配置（如果有独立的配置文件）
```

---

## 配置检查清单

完成迁移后，运行以下检查：

- [ ] 容器 credential-manager 运行正常
  ```bash
  curl http://localhost:8002/health
  # 应返回: {"status":"ok"}
  ```

- [ ] 容器 plugin-manager 运行正常
  ```bash
  curl http://localhost:8090/health
  # 应返回: {"status":"ok"}
  ```

- [ ] Plugin-manager 能访问 credential-manager
  ```bash
  podman logs claw-plugin-manager --tail 20 | grep -i credential
  # 不应有 401 错误
  ```

- [ ] OpenClaw 能获取最新凭证
  ```
  在 OpenClaw 中: 请获取 rhino-cookies 的 YQG_UNITE_TOKEN_PROD
  # 应返回: A1A22D06A0BCD70EA5923717DCAD2A1C...
  ```

- [ ] Rhino API 调用能发送群通知
  ```
  在 OpenClaw 中: 调用 rhino API 测试群通知
  # 群里应收到消息
  ```

---

## 故障排查

### OpenClaw 找不到凭证

**检查**：plugin-manager 是否运行
```bash
curl http://localhost:8090/health
```

**检查**：OpenClaw 配置是否正确
```bash
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### OpenClaw 仍然拿到旧 token

**原因**：可能还在用本地 stdio vault-server

**解决**：
1. 检查 OpenClaw 配置，确保没有 stdio vault-server
2. 重启 OpenClaw
3. 清除缓存（如果有）

### 群消息仍然不发送

**检查**：token 是否为新的
```bash
# 在 OpenClaw 中获取的 token
# 应该是: A1A22D06A0BCD70EA5923717DCAD2A1C...
# 而不是: C63548CAA90FB2BBFDB8DF71D1EE796DFCA9BFC9C7F8E1DB2994B56970B2F2BD1A3052C667731C95...
```

**检查**：是否同时发送了 email cookie
```bash
# Cookie header 应该包含:
# YQG_UNITE_TOKEN_PROD=... 和 YQG_EMAIL_PROD=...
```

---

## 后续维护

### 自动刷新凭证

```bash
# 设置 cron job
crontab -e

# 添加：每 6 小时检查并刷新
0 */6 * * * cd /Users/jiangyi/Documents/codedev/claw_credential_manager && ./scripts/auto-refresh-cookies.sh >> /tmp/openclaw-cookie-refresh.log 2>&1
```

### 定期检查

```bash
# 每天启动时运行
cd /Users/jiangyi/Documents/codedev/claw_credential_manager
./check-and-start.sh
```

---

## 架构对比

### 迁移前（有问题）
```
Chrome → 容器 credential-manager → plugin-manager
                                        ↓
Chrome → 本地 vault-server → OpenClaw（旧数据）
```

### 迁移后（统一）
```
Chrome → 容器 credential-manager → plugin-manager → OpenClaw
```

---

## 总结

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| A. OpenClaw 用 HTTP MCP | 单一数据源<br>自动同步<br>配置简单 | 需要修改 OpenClaw 配置 | ⭐⭐⭐⭐⭐ |
| B. 同步本地文件 | 保留现有架构 | 复杂<br>易出错<br>有延迟 | ⭐⭐ |
| C. 废弃容器 | 简化为本地 | 失去容器优势<br>多项目困难 | ⭐ |

**强烈推荐：方案 A**

---

## 相关文档

- [OpenClaw Rhino 修复指南](./OPENCLAW_RHINO_FIX.md)
- [Rhino API 调用指南](./RHINO_API_GUIDE.md)
- [故障排查手册](./TROUBLESHOOTING.md)
- [配置验证脚本](./scripts/check-config.sh)

---

**创建时间**: 2026-04-24  
**建议实施时间**: 立即（30 分钟内完成）
