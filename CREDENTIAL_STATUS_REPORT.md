# 凭证管理系统状态报告

**生成时间**: 2026-04-24 18:06

## 📋 凭证清单

### 1. Rhino 系统凭证 ✅

**凭证 ID**: `rhino-cookies`
**状态**: ✅ 正常

| 字段 | 值 |
|-----|-----|
| 生产 Token | `A1A22D06A0BCD70EA5923717DCAD2A1C...C1847889195F9C6C-00518-01` |
| Email | `yijiang@fintopia.tech` |
| 过期时间 | 2026-05-23 03:04:00 |
| 来源 | Chrome 插件导出 (main-chrome) |
| 最后更新 | 容器内 credentials.kdbx: 2026-04-24 17:51:44 |

**存储位置**:
- ✅ 凭证管理容器 (http://localhost:8002)
- ✅ MCP 工具可访问 (`get_credential("rhino-cookies")`)
- ✅ OpenClaw 可用

### 2. Funding Admin 生产环境 ✅

**凭证 ID**: `funding-admin-prod`
**状态**: ✅ 已手动导入

| 字段 | 值 |
|-----|-----|
| Token | `c3d20409-73dd-4465-aa24-8bf24481b92a-00518-01` |
| 域名 | funding-admin.fintopia.tech |
| 环境 | production |
| 来源 | 手动导入 (从浏览器 cookie 提取) |
| 导入时间 | 2026-04-24 10:04:15 (UTC) |

**存储位置**:
- ✅ 凭证管理容器 (http://localhost:8002)
- ✅ MCP 工具可访问 (`get_credential("funding-admin-prod")`)
- ✅ macOS Keychain (`security find-generic-password -s "funding-admin-prod"`)
- ✅ OpenClaw 可用

**Keychain 不一致问题** ⚠️:
- 旧 token: `fc034c31-fbf7-4908-9a7e-2adbc8d82a3d-00518-01`
- 新 token: `c3d20409-73dd-4465-aa24-8bf24481b92a-00518-01`
- ✅ 已更新为新 token

### 3. Funding Admin 测试环境 ✅

**凭证 ID**: `funding-admin-test`
**状态**: ✅ 已手动导入

| 字段 | 值 |
|-----|-----|
| Token | `95DEE528A28FBDAB57AB3E08473502EE7CCE060C987A63D94F2ED5B8EF4906F6DF547035DDA41648-01018-01` |
| 域名 | funding-admin.fintopia.tech |
| 环境 | test |
| 来源 | 手动导入 (从浏览器 cookie 提取) |
| 导入时间 | 2026-04-24 10:04:15 (UTC) |

**存储位置**:
- ✅ 凭证管理容器 (http://localhost:8002)
- ✅ MCP 工具可访问 (`get_credential("funding-admin-test")`)
- ❌ macOS Keychain (未配置)
- ✅ OpenClaw 可用

**使用说明**:
- 请求时需要添加 header: `test-env: true`
- Cookie: `YQG_UNITE_TOKEN_TEST=<token>`

## 🔍 问题诊断

### Chrome 插件导出失败 ❌

**现象**:
- 点击插件的"导出当前域名的 Cookies"
- 插件可能显示成功，但容器中没有数据
- 容器日志中没有收到 POST /entries 请求

**根本原因**:
1. **CORS 限制**: 容器只允许 `http://127.0.0.1:*`，但 Chrome 扩展可能使用 `http://localhost:*` 或 `chrome-extension://` 协议
2. **网络隔离**: Chrome MV3 扩展的网络请求可能受到沙箱限制

**临时解决方案** ✅:
- 使用脚本 `scripts/import-funding-admin-tokens.sh` 手动导入
- 从浏览器开发者工具中提取最新 cookie 值

**永久解决方案** (待实施):
- 修改容器 CORS 配置，允许 Chrome 扩展访问
- 或使用 Native Messaging 替代 HTTP API

详见: [CHROME_EXTENSION_DEBUG.md](./CHROME_EXTENSION_DEBUG.md)

## 📊 存储架构对比

### 方案 A: macOS Keychain ⚠️

**优点**:
- 系统原生，安全性高
- 适合脚本直接使用

**缺点**:
- ❌ 只能本地访问
- ❌ 不同机器需要手动同步
- ❌ 容易出现新旧 token 不一致
- ❌ OpenClaw 无法直接访问

**状态**: 已淘汰，仅作为备份

### 方案 B: 凭证管理容器 (当前方案) ✅

**优点**:
- ✅ 集中管理，所有工具统一数据源
- ✅ 支持 HTTP API 和 MCP 协议
- ✅ 容器化部署，易于版本控制
- ✅ OpenClaw 可通过 MCP 工具访问
- ✅ 数据持久化到 KeePass 数据库

**缺点**:
- ⚠️ Chrome 插件导出存在 CORS 问题
- ⚠️ 需要容器运行

**架构**:
```
Chrome 插件导出
    ↓
容器 credential-manager:8002
  - KeePass: /vault/credentials.kdbx
  - HTTP API: /entries
  - HTTP MCP: /mcp
    ↓
容器 plugin-manager:8090
  - HTTP MCP 聚合
    ↓
本地 plugin-manager stdio
  - 通过 OpenClaw 配置启动
    ↓
OpenClaw / Claude Desktop
  - 获取最新凭证
```

## 🔐 安全性

### 访问控制

| 端点 | 认证方式 | 访问范围 |
|-----|---------|---------|
| HTTP API `/entries` | Bearer Token | 完全访问 (CRUD) |
| HTTP MCP `/mcp` | Bearer Token | 只读 (list, get) |
| Stdio MCP | 本地进程 | 只读 (list, get) |

**Bearer Token**: `d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124`

### 数据加密

- ✅ KeePass 数据库使用 AES-256 加密
- ✅ 容器内数据权限: `root:root 600`
- ✅ HTTPS 传输 (Rhino/Funding Admin API)

## 🛠️ 使用指南

### 1. 查看所有凭证

```bash
curl -s http://localhost:8002/mcp -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_credentials","arguments":{}}}' \
  | jq .
```

### 2. 获取特定凭证

```bash
# Rhino
curl -s http://localhost:8002/mcp -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_credential","arguments":{"id":"rhino-cookies"}}}' \
  | jq -r '.result.content[0].text'

# Funding Admin 生产
curl -s http://localhost:8002/mcp -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_credential","arguments":{"id":"funding-admin-prod"}}}' \
  | jq -r '.result.content[0].text'

# Funding Admin 测试
curl -s http://localhost:8002/mcp -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_credential","arguments":{"id":"funding-admin-test"}}}' \
  | jq -r '.result.content[0].text'
```

### 3. 在 OpenClaw 中使用

在 OpenClaw 会话中直接请求：
```
请获取 funding-admin-prod 的凭证
```

OpenClaw 会自动调用 `get_credential` 工具并返回 token。

### 4. 更新凭证

#### 方法 A: 使用 Chrome 插件 (如果修复了 CORS)

1. 访问目标网站 (如 funding-admin.fintopia.tech)
2. 点击 Chrome 插件图标
3. 点击"导出当前域名的 Cookies"

#### 方法 B: 手动导入 (当前推荐)

```bash
cd /Users/jiangyi/Documents/codedev/claw_credential_manager
./scripts/import-funding-admin-tokens.sh
```

**注意**: 需要先从浏览器中提取最新 token，更新脚本中的值。

### 5. 测试 API 调用

#### Funding Admin 生产环境

```bash
curl 'https://funding-admin.fintopia.tech/api/v1/sql' \
  -H 'content-type: application/json' \
  -H 'Cookie: YQG_UNITE_TOKEN_PROD=c3d20409-73dd-4465-aa24-8bf24481b92a-00518-01' \
  --data-raw '{"dbName":"LOAN","sql":"SELECT COUNT(*) FROM cash_loan_order LIMIT 1"}'
```

#### Funding Admin 测试环境

```bash
curl 'https://funding-admin.fintopia.tech/api/v1/sql' \
  -H 'content-type: application/json' \
  -H 'test-env: true' \
  -H 'Cookie: YQG_UNITE_TOKEN_TEST=95DEE528A28FBDAB57AB3E08473502EE7CCE060C987A63D94F2ED5B8EF4906F6DF547035DDA41648-01018-01' \
  --data-raw '{"dbName":"LOAN","sql":"SELECT COUNT(*) FROM cash_loan_order LIMIT 1"}'
```

## 🔄 维护计划

### 定期任务

#### 1. 刷新 Rhino token (每 6 小时)

已配置 cron job:
```bash
0 */6 * * * cd /Users/jiangyi/Documents/codedev/claw_credential_manager && ./scripts/auto-refresh-cookies.sh
```

#### 2. 刷新 Funding Admin token (手动)

当前需要手动操作：
1. 浏览器访问 funding-admin.fintopia.tech
2. 开发者工具 → Application → Cookies
3. 复制 `YQG_UNITE_TOKEN_PROD` 和 `YQG_UNITE_TOKEN_TEST`
4. 更新 `scripts/import-funding-admin-tokens.sh` 中的 token
5. 运行脚本

### 容器管理

```bash
cd ~/Documents/codedev/claw_manager

# 查看状态
COMPOSE_FILE=docker-compose.yml podman-compose ps

# 重启服务
COMPOSE_FILE=docker-compose.yml podman-compose restart claw-credential-manager

# 查看日志
podman logs -f claw-credential-manager

# 更新代码 (强制刷新 git clone)
COMPOSE_FILE=docker-compose.yml podman-compose down claw-credential-manager
COMPOSE_FILE=docker-compose.yml podman-compose build --build-arg CACHEBUST=$(date +%s) claw-credential-manager
COMPOSE_FILE=docker-compose.yml podman-compose up -d claw-credential-manager
```

## 📝 待办事项

### 高优先级
- [ ] 修复 Chrome 插件的 CORS 问题
- [ ] 为 Funding Admin 添加自动刷新机制

### 中优先级
- [ ] 将 Funding Admin 测试环境 token 同步到 macOS Keychain
- [ ] 添加 token 过期提醒
- [ ] 优化容器日志级别

### 低优先级
- [ ] 考虑使用 Native Messaging 替代 HTTP API
- [ ] 添加 Web UI 管理界面
- [ ] 支持更多认证方式 (OAuth, API Key, etc.)

## 📚 相关文档

- [统一凭证管理方案](./UNIFIED_CREDENTIAL_SOLUTION.md)
- [OpenClaw 配置完成](./OPENCLAW_SETUP_COMPLETE.md)
- [Chrome 插件调试指南](./CHROME_EXTENSION_DEBUG.md)
- [Rhino API 调用指南](./RHINO_API_GUIDE.md)
- [故障排查手册](./TROUBLESHOOTING.md)

---

**总结**: 所有核心凭证已正确配置，OpenClaw 可以正常使用。Chrome 插件导出功能存在 CORS 问题，当前使用手动导入脚本作为临时方案。
