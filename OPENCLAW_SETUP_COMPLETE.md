# OpenClaw 容器化凭证系统配置完成

## 完成时间

2026-04-24 14:50

## 修改内容

### 1. 容器服务

#### credential-manager (端口 8002)
- ✅ 添加了 MCP HTTP 端点 `/mcp` 和 `/mcp/`
- ✅ 支持 JSON-RPC 2.0 协议
- ✅ 提供 2 个工具：
  - `list_credentials` - 列出所有凭证（不含敏感字段）
  - `get_credential` - 获取指定凭证（含敏感字段）
- ✅ 使用 Bearer token 认证

#### plugin-manager (端口 8090)
- ✅ 通过 HTTP 调用 credential-manager 的 MCP 端点
- ✅ 聚合多个 MCP 服务（TAPD, LogService, QEP, etc.）
- ✅ 对外暴露统一的 MCP HTTP 端点

### 2. OpenClaw 配置

文件：`~/.openclaw/openclaw.json`

**移除的配置：**
```json
"claw-credentials": {
  "command": "/Users/jiangyi/Documents/codedev/claw_credential_manager/claw-vault-server",
  "args": ["-mcp"],
  "env": {"CLAW_VAULT_PASSWORD": "test-password-123"}
}
```
❌ 这个配置使用过期的本地数据和旧密码

**保留的配置：**
```json
"claw-plugin-manager": {
  "command": "node",
  "args": [
    "/Users/jiangyi/Documents/codedev/claw_plugin_manager/src/index.js",
    "--config",
    "/Users/jiangyi/openclaw-data/claw-plugin-manager/config.yaml"
  ]
}
```
✅ 通过 stdio 协议与 OpenClaw 通信
✅ 通过 HTTP 访问容器内的最新凭证

### 3. plugin-manager 配置

文件：`~/openclaw-data/claw-plugin-manager/config.yaml`

```yaml
mcps:
  claw-credentials:
    type: http
    enabled: true
    priority: 110
    baseUrl: http://claw-credential-manager:8002/mcp  # 注意 /mcp 路径
    timeout: 10000
    headers:
      Authorization: "Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124"
    healthCheck:
      type: http
      interval: 60
```

### 4. 代码修改

#### claw_credential_manager/internal/api/handlers.go

**添加的路由：**
```go
func (s *Server) setupRoutes() {
	s.mux.HandleFunc("/health", s.handleHealth)
	s.mux.HandleFunc("/entries", s.handleEntries)
	s.mux.HandleFunc("/entries/", s.handleEntry)
	s.mux.HandleFunc("/mcp", s.handleMCP)   // 新增
	s.mux.HandleFunc("/mcp/", s.handleMCP)  // 新增（兼容尾部斜杠）
}
```

**添加的 MCP 处理器：**
- 支持 `initialize`、`tools/list`、`tools/call` 方法
- 返回 JSON-RPC 2.0 格式响应
- 与现有的 stdio MCP 实现逻辑一致

## 数据流向

```
Chrome 插件导出
    ↓
容器 credential-manager:8002
  - KeePass: /vault/credentials.kdbx
  - 密码: d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124
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

## 验证结果

运行验证脚本：
```bash
./verify-openclaw-setup.sh
```

**所有检查通过：**
- ✅ 容器运行正常
- ✅ credential-manager MCP 端点工作
- ✅ plugin-manager 暴露凭证工具
- ✅ 成功获取 rhino-cookies
- ✅ Token 是最新的（A1A22D06...）
- ✅ OpenClaw 配置正确
- ✅ 无本地 vault-server 进程

## 下一步：OpenClaw 测试

### 1. 重启 OpenClaw（如需要）

OpenClaw MCP 服务是通过配置文件动态启动的，修改配置后：
- 如果 OpenClaw 已经运行，可能需要重启 OpenClaw 进程
- 或者使用 OpenClaw 的配置重载功能（如果支持）

当前 OpenClaw gateway PID: `5396`

### 2. 测试凭证获取

在 OpenClaw 中发送：
```
请获取 rhino-cookies 的凭证
```

**预期结果：**
- 应该返回包含 `YQG_UNITE_TOKEN_PROD` 的 cookie 数组
- Token 应该以 `A1A22D06A0BCD70EA5923717DCAD2A1C` 开头
- 不应该返回旧 token `C63548CAA90FB2BBFDB8DF71D1EE796D`

### 3. 测试 Rhino API 调用

如果凭证正确，测试实际 API 调用：
```
请调用 rhino API 处理工单 1234322，状态改为 RESOLVED，备注：【测试】验证群通知功能
```

**预期结果：**
- API 调用成功（`code: 0`）
- 群里收到通知消息

### 4. 如果遇到问题

#### 问题 A：OpenClaw 报找不到工具

**可能原因：**
- plugin-manager stdio 服务未启动
- OpenClaw 配置未重载

**解决方法：**
```bash
# 检查 plugin-manager 进程
ps aux | grep "claw_plugin_manager"

# 如果没有运行，OpenClaw 会自动启动
# 重启 OpenClaw 或等待配置重载
```

#### 问题 B：仍然获取到旧 token

**可能原因：**
- OpenClaw 仍在使用缓存的旧 vault-server 连接

**解决方法：**
```bash
# 1. 确认没有本地 vault-server 进程
ps aux | grep "claw-vault-server.*-mcp"

# 2. 如果有，杀掉进程
pkill -f "claw-vault-server.*-mcp"

# 3. 重启 OpenClaw
kill 5396  # 替换为实际 PID
```

#### 问题 C：群消息仍然不发送

**检查清单：**
- [ ] Token 是新的（A1A22D06...）
- [ ] 同时发送了 YQG_UNITE_TOKEN_PROD 和 YQG_EMAIL_PROD
- [ ] Headers 包含 fintopia-rhino-env 和 fintopia-rhino-region
- [ ] enableNotify 设为 true
- [ ] 工单 ID 有效

参考文档：`OPENCLAW_RHINO_FIX.md`

## 维护

### 自动刷新凭证

设置 cron job：
```bash
crontab -e

# 每 6 小时刷新一次
0 */6 * * * cd /Users/jiangyi/Documents/codedev/claw_credential_manager && ./scripts/auto-refresh-cookies.sh >> /tmp/openclaw-cookie-refresh.log 2>&1
```

### 容器管理

```bash
# 查看状态
cd ~/Documents/codedev/claw_manager
COMPOSE_FILE=docker-compose.yml podman-compose ps

# 重启服务
COMPOSE_FILE=docker-compose.yml podman-compose restart claw-credential-manager
COMPOSE_FILE=docker-compose.yml podman-compose restart claw-plugin-manager

# 查看日志
podman logs -f claw-credential-manager
podman logs -f claw-plugin-manager
```

### 更新代码

当 credential-manager 代码有更新时：

```bash
cd ~/Documents/codedev/claw_manager

# 停止服务
COMPOSE_FILE=docker-compose.yml podman-compose down claw-credential-manager

# 使用 CACHEBUST 强制刷新 git clone
COMPOSE_FILE=docker-compose.yml podman-compose build --build-arg CACHEBUST=$(date +%s) claw-credential-manager

# 启动服务
COMPOSE_FILE=docker-compose.yml podman-compose up -d claw-credential-manager

# 重启 plugin-manager 让它重新连接
COMPOSE_FILE=docker-compose.yml podman-compose restart claw-plugin-manager
```

## 架构优势

### 统一数据源
- ✅ Chrome 插件、OpenClaw、其他工具都从同一个容器获取凭证
- ✅ 数据一致性有保障
- ✅ 不会出现旧数据和新数据不一致的问题

### 容器化部署
- ✅ 服务隔离，不影响主机环境
- ✅ 易于版本管理和回滚
- ✅ 便于多机部署和扩展

### MCP 协议
- ✅ 标准化的工具调用接口
- ✅ 支持多种传输方式（stdio, HTTP）
- ✅ 易于集成到 Claude/OpenClaw

## 相关文档

- [统一凭证管理方案](./UNIFIED_CREDENTIAL_SOLUTION.md)
- [OpenClaw Rhino 修复指南](./OPENCLAW_RHINO_FIX.md)
- [Rhino API 调用指南](./RHINO_API_GUIDE.md)
- [故障排查手册](./TROUBLESHOOTING.md)
- [配置验证脚本](./verify-openclaw-setup.sh)

---

**配置完成！准备好在 OpenClaw 中测试了。**
