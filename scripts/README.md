# Chrome Cookie Export Scripts

用于从 Chrome 浏览器导出 cookies 并保存到 Claw 凭证管理器的工具集。

## 快速开始

### 1. 安装依赖

```bash
cd scripts
npm install puppeteer-core
```

### 2. 创建 Chrome Debug 应用（一键完成）

运行以下命令创建一个独立的启动器应用：

```bash
./create-app.sh
```

这会在 `~/Applications/` 创建 `Chrome Debug.app`，**所有启动逻辑都内置在 App 中，无需额外脚本**。

之后你可以：
- 在 Alfred/Spotlight 中搜索 `Chrome Debug` 启动
- 双击应用图标启动
- 在 Dock 中固定快捷启动

### 3. 登录网站

在启动的 Chrome Debug 中访问并登录你需要导出 cookies 的网站。

### 4. 导出 cookies

**方式 A：导出所有已登录网站（推荐）**
```bash
./export-all-cookies.sh
```

**方式 B：导出单个网站**
```bash
./save-cookies-main.sh github.com
```

## 脚本说明

### 核心脚本

- **`create-app.sh`** - 创建独立的 macOS 应用
  - 生成 `~/Applications/Chrome Debug.app`
  - **所有启动逻辑内置，无需外部脚本**
  - 自动同步登录状态（首次运行）
  - 开启远程调试端口 9222
  - 可在 Spotlight/Alfred/Dock 中使用

### 导出脚本

- **`export-all-cookies.sh`** - 批量导出所有域名的 cookies
  - 自动发现所有已登录网站
  - 批量保存到凭证管理器
  - 显示导出统计信息

- **`save-cookies-main.sh <domain>`** - 导出单个域名
  - 导出指定域名的 cookies
  - 保存到凭证管理器
  - 支持更新已存在的条目

- **`export-from-main-chrome.js <domain>`** - 底层导出工具
  - 连接到 Chrome 调试端口
  - 提取指定域名的 cookies
  - 输出 JSON 格式

- **`list-all-domains.js`** - 列出所有包含 cookies 的域名
  - 用于查看当前有哪些网站已登录

## 工作原理

1. **Chrome Debug** 使用独立的配置目录：
   ```
   ~/Library/Application Support/Google/Chrome-Debug/
   ```

2. **远程调试** 通过 Chrome DevTools Protocol (CDP) 连接：
   ```
   http://localhost:9222
   ```

3. **Cookie 存储** 保存在凭证管理器中：
   - Entry ID: `{domain}-cookies`
   - Type: `mixed`
   - Password: JSON 格式的 cookies 数组
   - Custom Fields: 包含 domain, user_agent, source

4. **OpenClaw 使用** 通过 MCP 获取凭证：
   ```javascript
   const credential = await mcpClient.callTool('get_credential', {
     id: 'github-cookies'
   });
   const cookies = JSON.parse(credential.password);
   ```

## 环境变量

- `CLAW_API_KEY` - 凭证管理器 API Key（默认：`claw_1776839434829992000`）

## 常见问题

### Q: 为什么要用独立的 Chrome Debug？
A: 使用主 Chrome 无法开启远程调试（macOS 限制）。独立的 Chrome Debug：
- 可以开启调试端口
- 不影响日常使用的 Chrome
- 登录状态独立保存

### Q: 每次都要重新登录吗？
A: 不需要。Chrome Debug 会保存你的登录状态，下次启动直接可用。

### Q: 如何更新 cookies？
A: 再次运行导出命令即可自动更新。

### Q: OpenClaw 使用时会踢掉我的登录吗？
A: 如果使用相同的 User-Agent，一般不会。脚本会自动保存 User-Agent 到凭证中。

## 文件结构

```
scripts/
├── README.md                    # 本文件
├── create-app.sh                # 创建独立的 Chrome Debug 应用（推荐）
├── export-all-cookies.sh        # 批量导出所有网站 cookies
├── save-cookies-main.sh         # 导出单个网站 cookies
├── export-from-main-chrome.js   # Cookie 导出核心逻辑
├── list-all-domains.js          # 列出所有已登录域名
└── package.json                 # Node.js 依赖配置
```

## 分享给其他用户

如果要分享给其他用户，他们需要：

1. 克隆仓库或复制 `scripts/` 目录
2. 安装依赖：`npm install puppeteer-core`
3. 运行 `./create-app.sh` 创建启动器
4. 启动 Chrome Debug 并登录网站
5. 运行 `./export-all-cookies.sh` 导出

## License

MIT
