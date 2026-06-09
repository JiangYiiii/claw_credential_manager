# Cookie Keeper 安装指南

> 飞书文档：https://fintopia.feishu.cn/wiki/EYOxwym9xi07ovk1TFTcmLtznXe  
> 源码仓库：`git@gitlab.yangqianguan.com:ruiliangwu/cookie-keeper.git`（v0.4.5）

本目录为 **Cookie Keeper** Chrome 扩展，替代旧的 Claw Cookie Exporter。

## 1. 安装 Chrome 扩展

1. 打开 `chrome://extensions/`
2. **移除** 旧的「Claw Cookie Exporter」（若仍存在）
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择本目录
6. 确认扩展列表中出现 **Cookie Keeper**（v0.4.5）

## 2. 配置同步模式与域名

1. 点击工具栏 Cookie Keeper 图标 → **配置**
2. 选择同步模式：
   - **手动**：绑定一个固定 JSON 文件，需要点击「立即导出」
   - **自动（推荐）**：安装 Native Messaging Host，cookie 变更后自动写入 `~/.agents/cookie-keeper/all-cookies.json`
3. 检查 **域名列表**（已预置 fintopia / yangqianguan 等常用域名）
4. 点击 **保存配置**

## 3. 安装本地 Host（仅自动模式）

1. 在配置页选择 **自动** 模式
2. 复制面板中的 **扩展 ID**
3. 在本机执行：

```bash
cd /Users/jiangyi/Documents/codedev/claw_credential_manager/chrome-extension
bash host/scripts/install.sh --ext-id <EXT_ID>
```

4. 回到配置页，点击 host 状态旁的 **刷新**，看到 **已连接**
5. 在目标网站登录后，cookie 自动写入 `~/.agents/cookie-keeper/all-cookies.json`

## 4. 同步到 KeePass 凭证库

扩展只负责写入本地 JSON。要将 cookie 导入 credential-manager（KeePass），运行项目根目录的同步脚本：

```bash
cd /Users/jiangyi/Documents/codedev/claw_credential_manager
./scripts/sync-cookie-keeper-to-vault.sh
```

同步后可通过 MCP `get_credential("rhino-fintopia-tech-cookies")` 获取。

## 5. 验证

```bash
# 检查 host
test -f ~/.agents/cookie-keeper/host/host.sh && echo "host ok"

# 检查快照
ls -la ~/.agents/cookie-keeper/all-cookies.json

# 同步并验证 vault entry
./scripts/sync-cookie-keeper-to-vault.sh
curl -s http://127.0.0.1:8002/entries/rhino-fintopia-tech-cookies \
  -H "Authorization: Bearer $CLAW_API_KEY" | jq '.id, .metadata.cookie_count'
```

## 6. 打包分发

```bash
bash build-pack.sh   # 生成 dist/cookie-keeper-<version>.zip
bash build.sh        # 额外尝试生成 .crx
```

## 故障排查

- **host 未连接**：确认 Node.js >= 18，重新运行 `host/scripts/install.sh --ext-id <ID>`
- **导出失败：没有文件写入权限**：Chrome 版本建议 146+
- **vault 中无 cookie**：确认已运行 `sync-cookie-keeper-to-vault.sh`

Host 诊断：`bash host/scripts/doctor.sh`
