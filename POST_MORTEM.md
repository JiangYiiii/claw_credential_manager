# 问题复盘：OpenClaw 调用 Rhino API 失败

**日期**: 2026-04-24  
**问题**: OpenClaw 调用 rhino API 返回 10001 错误

---

## 问题时间线

### 初始报错
- **现象**: OpenClaw 调用 `rhino.fintopia.tech/alert-admin/v2/alert/query` 返回 10001 "服务异常"
- **初步判断**: 认为是凭证过期导致

### 排查过程

#### 阶段 1: 凭证过期假设（误判）

**检查**：
```bash
curl -s -H "Authorization: Bearer <api_key>" \
  http://localhost:8002/entries/rhino-cookies | \
  jq '.metadata.token_expires_at'
# 结果：2026-05-23（未过期）
```

**发现**: 凭证库中的 token 未过期，但仍然报错

#### 阶段 2: 多数据源问题（部分正确）

**发现**: 存在两套凭证系统：
1. **容器 vault-server** (HTTP, 端口 8002)
   - 密码: `d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124`
   - 数据最新

2. **本地 vault-server** (stdio MCP)
   - 密码: `test-password-123`
   - OpenClaw 使用这个
   - 数据可能过期

**但**: 即使用容器中最新的 token 测试，API 仍返回 10001

#### 阶段 3: 根本原因（正确）

**测试**:
```bash
# 缺少 headers - 失败
curl -H "Cookie: YQG_UNITE_TOKEN_PROD=<token>" \
  https://rhino.fintopia.tech/alert-admin/v2/alert/query
# 返回: {"status": {"code": 10001}}

# 添加 headers - 成功
curl -H "Cookie: YQG_UNITE_TOKEN_PROD=<token>" \
  -H "fintopia-rhino-env: prod" \
  -H "fintopia-rhino-region: cn" \
  https://rhino.fintopia.tech/alert-admin/v2/alert/query
# 返回: {"status": {"code": 0}}  ← 成功！
```

**根本原因**: API 需要自定义 headers，与凭证无关

---

## 根本原因分析

### 直接原因
**缺少必需的 HTTP Headers**：
- `fintopia-rhino-env: prod`
- `fintopia-rhino-region: cn`

### 为什么会发生？

#### 1. 架构复杂性
```
本地开发环境包含多个服务：
- Chrome 浏览器（数据源）
- Chrome 插件/脚本（导出工具）
- 容器 credential-manager（HTTP API）
- 容器 plugin-manager（MCP 聚合）
- 本地 vault-server（stdio MCP，OpenClaw 使用）
- OpenClaw（最终消费者）
```

**问题**: 数据链路长，每一层都可能出问题

#### 2. 配置分散
- 容器配置: `~/openclaw-data/claw-credential-manager/config.yaml`
- Plugin-manager 配置: `~/openclaw-data/claw-plugin-manager/config.yaml`
- 本地 vault-server 配置: 未知位置
- 环境变量: 分散在多处

**问题**: 配置不一致时难以排查

#### 3. 缺少文档和验证
- Rhino API 需要特殊 headers 没有文档记录
- 没有配置验证脚本
- 没有端到端测试

**问题**: 集成时才发现问题

#### 4. 错误信息不明确
- API 返回 "10001 服务异常" 而不是 "缺少 required header"
- 没有详细的错误日志

**问题**: 排查方向错误，浪费时间

---

## 影响范围

### 受影响的服务
- OpenClaw 无法调用 rhino alert-admin API
- 其他依赖 rhino API 的服务可能也受影响

### 时间成本
- 排查时间：约 2 小时
- 涉及范围：凭证系统、网络、API 实现

---

## 解决方案

### 立即修复
在调用 rhino API 的地方添加 headers：

```javascript
// MCP 工具中
fetch('https://rhino.fintopia.tech/alert-admin/v2/alert/query', {
  headers: {
    'Content-Type': 'application/json',
    'fintopia-rhino-env': 'prod',      // 新增
    'fintopia-rhino-region': 'cn',     // 新增
    'Cookie': cookies
  }
})
```

### 长期改进

#### 1. 统一凭证源
**问题**: OpenClaw 使用本地 vault-server，数据可能不同步

**方案**: 让 OpenClaw 也使用容器的 HTTP API
- 移除本地 stdio vault-server
- 统一使用 plugin-manager 的 HTTP MCP
- 数据源唯一，便于管理

#### 2. 配置集中管理
**创建**: `.env.openclaw` 统一配置文件

```bash
# 所有服务使用同一份配置
CLAW_API_KEY=d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124
CLAW_API_BASE=http://localhost:8002
CLAW_VAULT_PASSWORD=d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124
```

#### 3. 自动化验证
**创建**: 配置检查脚本 `scripts/check-config.sh`

```bash
# 启动前自动检查
./check-and-start.sh
├── 检查容器状态
├── 检查 API 连通性
├── 检查凭证过期状态
└── 检查配置一致性
```

#### 4. 自动刷新凭证
**创建**: 定时任务 `scripts/auto-refresh-cookies.sh`

```bash
# crontab: 每 6 小时检查并刷新
0 */6 * * * cd /path/to/project && ./scripts/auto-refresh-cookies.sh
```

#### 5. 完善文档
**创建**:
- `RHINO_API_GUIDE.md` - Rhino API 调用指南
- `TROUBLESHOOTING.md` - 故障排查手册
- `POST_MORTEM.md` - 本次问题复盘

---

## 预防措施

### 开发阶段

#### 1. API 文档
- 所有 API 必须有完整文档
- 特殊 headers 要明确说明
- 提供 curl 示例

#### 2. 错误信息
- 返回明确的错误码和说明
- 缺少 header 时应提示具体缺少哪个
- 示例: `{"error": "Missing required header: fintopia-rhino-env"}`

#### 3. 集成测试
- 编写端到端测试
- 覆盖常见错误场景
- 自动化运行

### 部署阶段

#### 1. 配置验证
- 部署前运行配置检查
- 确保所有依赖服务可访问
- 验证凭证有效性

#### 2. 监控告警
- 监控 API 调用失败率
- 凭证过期前告警（提前 24 小时）
- 配置变更时通知

#### 3. 文档同步
- 配置变更时更新文档
- README 中说明启动步骤
- 提供故障排查指南

### 日常维护

#### 1. 定期检查
```bash
# 每天启动时
./check-and-start.sh

# 每周检查凭证状态
./scripts/check-config.sh
```

#### 2. 自动化刷新
```bash
# cron job
0 */6 * * * ./scripts/auto-refresh-cookies.sh
```

#### 3. 日志审查
- 定期查看错误日志
- 关注重复出现的问题
- 及时修复潜在隐患

---

## 经验教训

### 做得好的地方
✅ 系统化排查，逐步缩小范围  
✅ 创建了自动化脚本和文档  
✅ 完整复盘并记录

### 需要改进的地方
❌ 初期判断失误，浪费时间在凭证排查上  
❌ 缺少 API 调用的端到端测试  
❌ 错误信息不够明确

### 关键经验
1. **先验证假设再深入排查**
   - 用最简单的方式复现问题
   - 不要基于假设进行复杂操作

2. **错误信息很重要**
   - 10001 "服务异常" 太模糊
   - 应该返回具体缺少什么

3. **配置要集中管理**
   - 多份配置容易不一致
   - 统一配置文件 + 验证脚本

4. **文档是投资不是成本**
   - API 文档能避免集成问题
   - 故障排查手册能快速定位

5. **自动化能减少人为失误**
   - 定时刷新凭证
   - 启动前配置检查

---

## Action Items

### 立即执行
- [x] 修复 rhino API 调用，添加必需 headers
- [x] 创建配置验证脚本
- [x] 创建自动刷新脚本
- [x] 编写 API 调用指南文档

### 本周内
- [ ] 统一 OpenClaw 使用容器 HTTP API
- [ ] 设置 cron job 自动刷新
- [ ] 完善 rhino MCP 的错误处理

### 长期优化
- [ ] 改进 rhino API 错误信息
- [ ] 添加凭证过期监控告警
- [ ] 编写端到端集成测试
- [ ] 在团队内分享经验

---

## 参考文档

- [Rhino API 调用指南](./RHINO_API_GUIDE.md)
- [故障排查手册](./TROUBLESHOOTING.md)
- [配置验证脚本](./scripts/check-config.sh)
- [自动刷新脚本](./scripts/auto-refresh-cookies.sh)

---

**复盘人**: Claude  
**审核人**: -  
**日期**: 2026-04-24
