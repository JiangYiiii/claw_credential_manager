# Cookie Keeper

> 本目录为 `claw_credential_manager` 项目内的 Chrome 扩展。  
> 安装步骤见 [INSTALL.md](./INSTALL.md)。

把多个配置域名下的 Cookie 同步成一份固定 JSON 文件，再通过 `scripts/sync-cookie-keeper-to-vault.sh` 导入 KeePass 凭证库。

## 特点

- **两种同步模式**（配置页可切）：
  - **手动**：File System Access API 写用户选的固定文件
  - **自动**：Native Messaging Host 后台写入 `~/.agents/cookie-keeper/all-cookies.json`
- **统一一个文件**：所有配置域名合在同一份 JSON
- **智能过滤**：第三方埋点 cookie 会被忽略
- **与 credential-manager 集成**：同步脚本将快照写入 KeePass `*-cookies` entry

## 安装

见 [INSTALL.md](./INSTALL.md)。

## 使用流程

1. 安装扩展 → 配置自动模式 → 安装 Host（`host/scripts/install.sh`）
2. 在目标网站登录
3. 运行 `../scripts/sync-cookie-keeper-to-vault.sh` 同步到 KeePass
4. 通过 MCP `get_credential` 读取

## Host 脚本

| 脚本 | 用途 |
|------|------|
| `host/scripts/install.sh` | 安装 Native Messaging Host |
| `host/scripts/uninstall.sh` | 卸载 Host |
| `host/scripts/doctor.sh` | 健康检查 |

## 打包

```bash
bash build-pack.sh   # dist/cookie-keeper-<version>.zip
```
