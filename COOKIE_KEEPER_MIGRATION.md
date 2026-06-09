# Cookie Keeper 迁移说明

旧的 **Claw Cookie Exporter**（手动导出到 `localhost:8002`）和 **Chrome CDP 导出脚本**已废弃。

## 新架构

```
Cookie Keeper 扩展 + Host
    → ~/.agents/cookie-keeper/all-cookies.json
    → scripts/sync-cookie-keeper-to-vault.sh
    → KeePass vault (*-cookies entries)
    → MCP get_credential
```

## 快速迁移

1. 安装 Cookie Keeper 扩展：见 [chrome-extension/INSTALL.md](chrome-extension/INSTALL.md)
2. 同步到 KeePass：`./scripts/sync-cookie-keeper-to-vault.sh`
3. OpenClaw 侧无需改动，仍用 `get_credential("rhino-fintopia-tech-cookies")` 等

## 已移除

- `cookie-keeper` Agent Skill（全局及各 IDE 链接）
- `chrome-extension/skills/cookie-keeper/`
- `chrome-extension.deprecated/`（旧 Claw Cookie Exporter）
- Chrome CDP 导出脚本（`create-app.sh`、`export-from-main-chrome.js` 等）

## 飞书文档

https://fintopia.feishu.cn/wiki/EYOxwym9xi07ovk1TFTcmLtznXe
