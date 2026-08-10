# Cookie 同步脚本

将 Cookie Keeper 扩展写入的快照文件同步到 KeePass 凭证库，供 OpenClaw / MCP `get_credential` 使用。

## 架构

```
Cookie Keeper 扩展 + Native Messaging Host
    → ~/.agents/cookie-keeper/all-cookies.json
    → scripts/sync-cookie-keeper-to-vault.js
    → credential-manager API (localhost:8002)
    → KeePass vault (*-cookies entries)
    → MCP get_credential
```

## 前置条件

1. 已安装 Cookie Keeper Chrome 扩展（见 `../chrome-extension/INSTALL.md`）
2. 自动模式下已安装 Native Messaging Host（`bash host/scripts/install.sh --ext-id <ID>`）
3. credential-manager 容器/API 正常运行

## 同步命令

```bash
# 一次性同步
./scripts/sync-cookie-keeper-to-vault.sh

# 或通过 npm script
cd scripts && npm run sync-cookies
```

## 凭证 ID 规则

与旧版 Claw Cookie Exporter 一致：`{domain-with-dashes}-cookies`

| 配置域名 | 凭证 ID |
|---------|---------|
| `rhino.fintopia.tech` | `rhino-fintopia-tech-cookies` |
| `funding-admin.fintopia.tech` | `funding-admin-fintopia-tech-cookies` |
| `.fintopia.tech` | `fintopia-tech-cookies` |

## 别名映射（兼容旧 ID）

旧版 CDP 导出使用短 ID（如 `rhino-cookies`），OpenClaw 可能仍在使用这些 ID。同步脚本会额外写入 alias entry，映射关系见 `cookie-entry-aliases.json`：

| 别名（旧 ID） | 来源域名 |
|--------------|---------|
| `rhino-cookies` | `rhino.fintopia.tech` |
| `loan-admin-cookies` | `loan-admin.fintopia.tech` |
| `fintopia-cookies` | `.fintopia.tech` |

新增别名：编辑 `scripts/cookie-entry-aliases.json`，格式为 `"别名ID": "配置域名"`。

## Token entry（Funding Admin / Keychain）

Funding Admin CLI 和 repay-troubleshoot 使用独立 token entry（`funding-admin-prod` / `funding-admin-test`），不是 `*-cookies` entry。同步脚本会从 cookie 中提取 `YQG_UNITE_TOKEN_*` 并更新 vault + macOS Keychain，配置见 `cookie-token-entries.json`。

## 定时同步

### OpenClaw 定时任务（推荐）

在 OpenClaw 中注册每 10 分钟自动同步：

```bash
./scripts/install-openclaw-cookie-sync-cron.sh
```

验证：

```bash
openclaw cron list | grep cookie-keeper-sync
openclaw cron run cookie-keeper-sync   # 立即试跑一次
```

自定义间隔（如 5 分钟）：

```bash
OPENCLAW_CRON_INTERVAL=5m ./scripts/install-openclaw-cookie-sync-cron.sh
```

### 系统 crontab（备选）

```bash
crontab -e
# 每 10 分钟同步一次
*/10 * * * * cd /path/to/claw_credential_manager && ./scripts/auto-refresh-cookies.sh >> /tmp/openclaw-cookie-refresh.log 2>&1
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `COOKIE_KEEPER_PATH` | `~/.agents/cookie-keeper/all-cookies.json` | 快照路径 |
| `CLAW_API_BASE` | `http://127.0.0.1:8002` | credential-manager API |
| `CLAW_API_KEY` | 见 `.env.openclaw` | API 认证密钥 |

## 在 OpenClaw 中使用

同步完成后，通过 MCP 获取 cookie entry：

```javascript
const credential = await mcpClient.callTool('get_credential', {
  id: 'rhino-fintopia-tech-cookies'
});
const cookies = JSON.parse(credential.password);
```

## 已废弃

以下旧脚本不再使用（Chrome CDP 导出链路）：

- ~~`create-app.sh`~~ — 创建 Chrome Debug 启动器
- ~~`export-from-main-chrome.js`~~ — CDP 导出
- ~~`export-all-cookies.sh`~~ — 批量 CDP 导出
- ~~`save-cookies-main.sh`~~ — 单域名 CDP 导出
- ~~`list-all-domains.js`~~ — 列出 CDP 域名
