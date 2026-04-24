# OpenClaw 凭证管理系统 - 故障排查指南

## 常见问题

### 1. OpenClaw 报错 "10001 服务异常"

**原因**：凭证过期或配置错误

**排查步骤**：

```bash
# 1. 运行统一检查脚本
./check-and-start.sh

# 2. 手动检查凭证过期状态
curl -s -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  http://localhost:8002/entries | \
  jq '.entries[] | select(.metadata.token_expires_at != null) | {id, expires: .metadata.token_expires_at}'

# 3. 刷新过期的凭证
./scripts/auto-refresh-cookies.sh
```

---

### 2. Plugin Manager 报 "401 Unauthorized"

**原因**：plugin-manager 缺少 credential-manager 的 API key

**解决方案**：

编辑 `~/openclaw-data/claw-plugin-manager/config.yaml`，在 `claw-credentials` 配置下添加：

```yaml
  claw-credentials:
    type: http
    enabled: true
    priority: 110
    baseUrl: http://claw-credential-manager:8002
    timeout: 10000
    headers:
      Authorization: "Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124"
    healthCheck:
      type: http
      interval: 60
```

然后重启 plugin-manager：
```bash
podman restart claw-plugin-manager
```

---

### 3. Cookie 导出失败

#### Chrome 插件无法导出

**检查**：
1. 插件配置的 API Base 是否正确（默认 `http://localhost:8002`）
2. API Key 是否正确

**解决**：
- 点击插件图标，检查配置页面
- API Base: `http://localhost:8002`
- API Key: `d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124`

#### 命令行脚本导出失败

**检查**：
```bash
# 1. 检查 Chrome Debug 是否运行
curl http://localhost:9222/json/version

# 2. 如果没运行，启动 Chrome Debug
open -a 'Google Chrome' --args --remote-debugging-port=9222
```

#### Web UI 导出按钮不可用

Web UI 的导出功能已禁用（容器内无法访问宿主机的 Chrome）。

**推荐使用**：
- Chrome 插件导出（推荐）
- 命令行脚本导出

---

### 4. 容器无法启动

**检查容器状态**：
```bash
podman ps -a | grep claw
```

**查看日志**：
```bash
podman logs claw-credential-manager
podman logs claw-plugin-manager
```

**重启容器**：
```bash
podman restart claw-credential-manager
podman restart claw-plugin-manager
```

---

## 自动化设置

### 设置定时自动刷新

```bash
# 编辑 crontab
crontab -e

# 添加（每 6 小时检查一次）
0 */6 * * * cd /Users/jiangyi/Documents/codedev/claw_credential_manager && ./scripts/auto-refresh-cookies.sh >> /tmp/openclaw-cookie-refresh.log 2>&1
```

### 查看自动刷新日志

```bash
tail -f /tmp/openclaw-cookie-refresh.log
```

---

## 架构说明

```
┌─────────────────────────────────────────────────┐
│  Chrome 浏览器（登录状态）                        │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌────────────────────────────────────────────────┐
│  导出方式：                                     │
│  1. Chrome 插件（推荐）→ localhost:8002        │
│  2. 命令行脚本 → localhost:8002                 │
│  3. Web UI（已禁用）                            │
└────────────────┬───────────────────────────────┘
                 │
                 ↓
┌────────────────────────────────────────────────┐
│  Credential Manager 容器                       │
│  - API: localhost:8002                         │
│  - Web: localhost:8003                         │
│  - 存储: /vault/credentials.kdbx               │
└────────────────┬───────────────────────────────┘
                 │
                 ↓
┌────────────────────────────────────────────────┐
│  Plugin Manager 容器                           │
│  - Web: localhost:9000                         │
│  - MCP: localhost:8090                         │
│  - 需要配置 API key 访问 Credential Manager    │
└────────────────┬───────────────────────────────┘
                 │
                 ↓
┌────────────────────────────────────────────────┐
│  OpenClaw / Claude Desktop                     │
│  - 通过 Plugin Manager 获取凭证                 │
└────────────────────────────────────────────────┘
```

---

## 关键配置文件

| 文件 | 说明 |
|------|------|
| `.env.openclaw` | 统一配置文件（所有 API key、端口等） |
| `~/openclaw-data/claw-plugin-manager/config.yaml` | Plugin Manager 配置（需要配置 API key） |
| `~/openclaw-data/claw-credential-manager/config.yaml` | Credential Manager 配置 |

---

## 维护建议

### 每天启动时

```bash
./check-and-start.sh
```

### 发现 API 调用失败时

```bash
# 1. 检查配置
./scripts/check-config.sh

# 2. 手动刷新 Cookie
./scripts/auto-refresh-cookies.sh
```

### 定期检查（每周）

```bash
# 查看过期状态
curl -s -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  http://localhost:8002/entries | \
  jq '.entries[] | select(.metadata.token_expires_at != null) | {id, expires: .metadata.token_expires_at}'
```

---

## 联系与支持

如果遇到其他问题，请检查：
1. 容器日志：`podman logs claw-credential-manager`
2. Plugin Manager 日志：`podman logs claw-plugin-manager`
3. 自动刷新日志：`/tmp/openclaw-cookie-refresh.log`
