# OpenClaw 调用 Rhino API 不发送群消息问题修复

## 问题症状

OpenClaw 调用 `/alert-admin/v2/ticket/process` 时：
- ✅ API 返回成功 (`code: 0`)
- ❌ 群里没有收到通知消息

## 根本原因

**使用了错误的凭证**：

```
OpenClaw 使用的 token: C63548CAA90FB2BBFDB8DF71D1EE796DFCA9BFC9C7F8E1DB2994B56970B2F2BD1A3052C667731C95-00518-01
正确的 token (from 容器):  A1A22D06A0BCD70EA5923717DCAD2A1C0F402F98058D9953CF6881DF2CB1FB93C1847889195F9C6C-00518-01
```

这个旧 token：
- 可以通过 API 认证（不返回 401）
- 但**权限不足或用户不对**，无法触发群通知

## 完整的正确调用方式

### 1. 从凭证库获取最新 cookies

```bash
# 方式 A: 从容器 credential-manager 获取
curl -s -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  http://localhost:8002/entries/rhino-cookies | \
  jq -r '.password' > /tmp/rhino-cookies.json

YQG_TOKEN=$(jq -r '.[] | select(.name == "YQG_UNITE_TOKEN_PROD") | .value' /tmp/rhino-cookies.json)
YQG_EMAIL=$(jq -r '.[] | select(.name == "YQG_EMAIL_PROD") | .value' /tmp/rhino-cookies.json)
```

### 2. 调用 API（必须包含所有必需的 headers 和 cookies）

```bash
curl -X POST 'https://rhino.fintopia.tech/alert-admin/v2/ticket/process' \
  -H 'Content-Type: application/json' \
  -H 'fintopia-rhino-env: prod' \
  -H 'fintopia-rhino-region: cn' \
  -H "Cookie: YQG_UNITE_TOKEN_PROD=$YQG_TOKEN; YQG_EMAIL_PROD=$YQG_EMAIL" \
  -d '{
    "ticketId": "1234322",
    "status": "RESOLVED",
    "remark": "【根因】问题描述\n【修复】修复方案\n【影响】影响范围",
    "enableNotify": true
  }'
```

### 3. 必需的元素

#### Headers（必需）
| Header | 值 | 说明 |
|--------|-----|------|
| `Content-Type` | `application/json` | 标准 HTTP header |
| `fintopia-rhino-env` | `prod` | **必需** - Rhino 环境 |
| `fintopia-rhino-region` | `cn` | **必需** - Rhino 区域 |

#### Cookies（必需）
| Cookie | 说明 | 示例 |
|--------|------|------|
| `YQG_UNITE_TOKEN_PROD` | **必需** - 统一认证 token | `A1A22D06A0BCD70EA5923717DCAD2A1C...` |
| `YQG_EMAIL_PROD` | **必需** - 用户邮箱 | `yijiang@fintopia.tech` |

#### 请求 Body
```json
{
  "ticketId": "工单ID",
  "status": "RESOLVED",          // 状态：RESOLVED, ONGOING, etc.
  "remark": "处理备注",           // 会显示在群消息中
  "enableNotify": true           // 必须设为 true 才会发送群消息
}
```

## OpenClaw 需要修改的地方

### 问题 1: 使用了错误的凭证源

**当前**：OpenClaw 使用本地 stdio vault-server，密码 `test-password-123`，数据过期

**应该**：使用容器 HTTP vault-server，密码 `d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124`

#### 修复方式 A：让 OpenClaw 使用 plugin-manager

修改 OpenClaw 配置，不直接调用 `claw-vault-server -mcp`，改为：

```json
// Claude Desktop config
{
  "mcpServers": {
    "openclaw-mcp": {
      "url": "http://localhost:8090"  // plugin-manager 的 HTTP MCP 端点
    }
  }
}
```

这样所有凭证都从 plugin-manager 获取，plugin-manager 会自动从容器 credential-manager 读取最新数据。

#### 修复方式 B：同步本地 vault-server 的数据

如果必须使用本地 stdio vault-server：

1. 找到本地 vault-server 使用的 KeePass 文件路径
2. 确保 Chrome 插件导出时写入这个文件
3. 或者手动同步容器中的 `/vault/credentials.kdbx` 到本地

### 问题 2: 缺少必需的 cookies

**当前**：只发送 `YQG_UNITE_TOKEN_PROD`

**应该**：同时发送 `YQG_UNITE_TOKEN_PROD` 和 `YQG_EMAIL_PROD`

#### 修复代码示例（Python）

```python
# 从凭证库获取完整的 cookies
credentials = get_credential("rhino-cookies")
cookies_array = json.loads(credentials["password"])

# 提取需要的 cookies
yqg_token = None
yqg_email = None

for cookie in cookies_array:
    if cookie["name"] == "YQG_UNITE_TOKEN_PROD":
        yqg_token = cookie["value"]
    elif cookie["name"] == "YQG_EMAIL_PROD":
        yqg_email = cookie["value"]

# 构建 Cookie header（必须同时包含两个）
cookie_header = f"YQG_UNITE_TOKEN_PROD={yqg_token}; YQG_EMAIL_PROD={yqg_email}"

# 发送请求
response = requests.post(
    "https://rhino.fintopia.tech/alert-admin/v2/ticket/process",
    headers={
        "Content-Type": "application/json",
        "fintopia-rhino-env": "prod",
        "fintopia-rhino-region": "cn",
        "Cookie": cookie_header
    },
    json={
        "ticketId": ticket_id,
        "status": "RESOLVED",
        "remark": remark,
        "enableNotify": True
    }
)
```

## 验证步骤

### 1. 验证凭证是最新的

```bash
# 查看过期时间
curl -s -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  http://localhost:8002/entries/rhino-cookies | \
  jq '.metadata.token_expires_at'

# 应该返回未来的时间（如 2026-05-23）
```

### 2. 验证 token 值

```bash
# 获取当前使用的 token
curl -s -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  http://localhost:8002/entries/rhino-cookies | \
  jq -r '.password' | \
  jq -r '.[] | select(.name == "YQG_UNITE_TOKEN_PROD") | .value'

# 应该返回: A1A22D06A0BCD70EA5923717DCAD2A1C0F402F98058D9953CF6881DF2CB1FB93C1847889195F9C6C-00518-01
# 而不是: C63548CAA90FB2BBFDB8DF71D1EE796DFCA9BFC9C7F8E1DB2994B56970B2F2BD1A3052C667731C95-00518-01
```

### 3. 手动测试 API 调用

```bash
TOKEN=$(curl -s -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  http://localhost:8002/entries/rhino-cookies | \
  jq -r '.password' | jq -r '.[] | select(.name == "YQG_UNITE_TOKEN_PROD") | .value')

EMAIL=$(curl -s -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  http://localhost:8002/entries/rhino-cookies | \
  jq -r '.password' | jq -r '.[] | select(.name == "YQG_EMAIL_PROD") | .value')

curl -X POST 'https://rhino.fintopia.tech/alert-admin/v2/ticket/process' \
  -H 'Content-Type: application/json' \
  -H 'fintopia-rhino-env: prod' \
  -H 'fintopia-rhino-region: cn' \
  -H "Cookie: YQG_UNITE_TOKEN_PROD=$TOKEN; YQG_EMAIL_PROD=$EMAIL" \
  -d '{
    "ticketId": "1234322",
    "status": "RESOLVED",
    "remark": "【测试】验证群通知功能",
    "enableNotify": true
  }'

# 检查群里是否收到消息
```

## 排查清单

如果修改后仍然不发送消息，按以下顺序检查：

- [ ] OpenClaw 是否使用了最新的凭证？（检查 token 值）
- [ ] Cookie 中是否同时包含 `YQG_UNITE_TOKEN_PROD` 和 `YQG_EMAIL_PROD`？
- [ ] Headers 中是否包含 `fintopia-rhino-env: prod` 和 `fintopia-rhino-region: cn`？
- [ ] 请求 body 中 `enableNotify` 是否为 `true`？
- [ ] `ticketId` 是否存在且有效？
- [ ] `remark` 是否为空？（空备注可能不发送）
- [ ] 用浏览器手动操作同一个工单，是否能正常发送？（排除工单本身的问题）

## 常见错误

### 错误 1: API 返回成功但不发送消息

**原因**：使用了旧 token 或权限不足的 token

**解决**：确保使用容器中最新的 token

### 错误 2: 10001 服务异常

**原因**：缺少 `fintopia-rhino-env` 或 `fintopia-rhino-region` header

**解决**：添加这两个必需的 headers

### 错误 3: 401 未授权

**原因**：Token 完全失效或无效

**解决**：重新导出 cookies

## 最佳实践

1. **使用统一的凭证源**
   - 让 OpenClaw 通过 plugin-manager 获取凭证
   - 避免多套凭证系统

2. **定期刷新凭证**
   - 设置 cron job 自动刷新
   - 参考 `scripts/auto-refresh-cookies.sh`

3. **完整的 API 调用**
   - 同时发送 `YQG_UNITE_TOKEN_PROD` 和 `YQG_EMAIL_PROD`
   - 不要省略任何必需的 headers

4. **错误处理**
   - 检查 API 返回的 `status.code`
   - `code: 0` 表示成功
   - `code: 10001` 表示配置错误

## 参考

- [Rhino API 调用指南](./RHINO_API_GUIDE.md)
- [故障排查手册](./TROUBLESHOOTING.md)
- [配置验证脚本](./scripts/check-config.sh)

---

**创建时间**: 2026-04-24  
**最后验证**: Token `A1A22D06A0BCD70EA5923717DCAD2A1C...` 可以成功发送群消息
