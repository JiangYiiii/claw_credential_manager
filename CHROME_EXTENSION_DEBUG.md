# Chrome 插件导出失败排查指南

## 问题现象

- 点击 Chrome 插件的"导出当前域名的 Cookies"按钮
- 插件显示成功，但凭证管理器中没有数据
- 容器日志也没有收到 POST /entries 请求

## 根本原因分析

### 1. Chrome 插件与容器的连接问题

Chrome 插件默认配置：
```javascript
const apiBase = localStorage.getItem('apiBase') || 'http://localhost:8002';
```

**可能的问题：**
- ❌ Chrome 扩展的网络请求受到 CORS 策略限制
- ❌ localhost:8002 可能无法从扩展程序访问（沙箱限制）
- ❌ 插件的 manifest.json 可能缺少必要的权限

### 2. 当前容器的 CORS 配置

查看容器日志发现 CORS 设置：
```
Access-Control-Allow-Origin: http://127.0.0.1:*
```

**问题：**
- ✅ 只允许 `127.0.0.1`
- ❌ 但 Chrome 插件可能使用 `localhost` 或 `chrome-extension://` 协议

### 3. Chrome 插件的 popup.js 错误处理

```javascript
catch (error) {
  showStatus(`❌ 导出失败: ${error.message}`, 'error');
}
```

错误只显示在插件的 popup 界面，用户可能没有注意到。

## 验证步骤

### 步骤 1: 检查 Chrome 插件的实际配置

1. 打开 Chrome 插件 popup
2. 右键点击插件图标 → "检查"（Inspect）
3. 在 Console 中运行：
   ```javascript
   localStorage.getItem('apiBase')
   localStorage.getItem('apiKey')
   ```

### 步骤 2: 测试网络连接

在 Chrome DevTools Console 中：
```javascript
fetch('http://localhost:8002/health')
  .then(r => r.json())
  .then(d => console.log('Success:', d))
  .catch(e => console.error('Failed:', e))
```

### 步骤 3: 检查 CORS 错误

1. 打开 funding-admin.fintopia.tech
2. 点击 Chrome 插件导出
3. 查看 Chrome DevTools → Console
4. 查找红色的 CORS 错误：
   ```
   Access to fetch at 'http://localhost:8002/entries' from origin 'chrome-extension://...' 
   has been blocked by CORS policy
   ```

### 步骤 4: 检查容器日志

```bash
podman logs -f claw-credential-manager | grep "POST /entries"
```

如果没有看到日志，说明请求根本没到达容器。

## 解决方案

### 方案 A: 修改容器的 CORS 配置（推荐）

修改 `internal/api/handlers.go`，允许 Chrome 插件访问：

```go
func (s *Server) setCORSHeaders(w http.ResponseWriter, r *http.Request) {
    // 允许 localhost 和 127.0.0.1，以及 chrome-extension
    origin := r.Header.Get("Origin")
    
    if origin != "" {
        // 允许本地开发和 Chrome 扩展
        if strings.HasPrefix(origin, "http://localhost") ||
           strings.HasPrefix(origin, "http://127.0.0.1") ||
           strings.HasPrefix(origin, "chrome-extension://") {
            w.Header().Set("Access-Control-Allow-Origin", origin)
        }
    } else {
        // 如果没有 Origin，允许所有本地地址
        w.Header().Set("Access-Control-Allow-Origin", "http://127.0.0.1:*")
    }
    
    w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
}
```

### 方案 B: 使用 127.0.0.1 替代 localhost

在 Chrome 插件 popup.js 中修改默认配置：
```javascript
const apiBase = localStorage.getItem('apiBase') || 'http://127.0.0.1:8002';
```

### 方案 C: 使用 manifest.json v3 的 host_permissions（已配置）

检查 `chrome-extension/manifest.json`:
```json
{
  "host_permissions": [
    "<all_urls>"
  ]
}
```

✅ 已经配置，应该可以访问所有 URL

### 方案 D: 手动导入（临时方案）✅

已创建脚本：`scripts/import-funding-admin-tokens.sh`

直接从你的 curl 命令中提取 token 并导入到凭证管理器。

## Chrome 插件调试技巧

### 1. 查看插件的 Console 日志

```bash
# 方法 1: Popup Console
右键点击插件图标 → "检查" → Console 标签

# 方法 2: 扩展管理页面
chrome://extensions/ → 启用"开发者模式" → "检查视图: service worker"
```

### 2. 添加详细日志

修改 `chrome-extension/popup.js`，在 exportCurrentDomain 函数开始处添加：

```javascript
console.log('Config:', { apiBase, apiKey: apiKey.substring(0, 10) + '...' });
console.log('Domain:', domain);
console.log('Cookies:', cookies);
```

在 fetch 调用后添加：
```javascript
console.log('Request URL:', `${apiBase}/entries`);
console.log('Response status:', response.status);
console.log('Response body:', await response.clone().text());
```

### 3. 测试插件的网络权限

在插件 popup 的 Console 中：
```javascript
// 测试 1: 访问公共 API
fetch('https://api.github.com/users/github').then(r => r.json()).then(console.log)

// 测试 2: 访问本地容器
fetch('http://localhost:8002/health').then(r => r.json()).then(console.log)

// 测试 3: 访问 127.0.0.1
fetch('http://127.0.0.1:8002/health').then(r => r.json()).then(console.log)
```

## 当前状态 ✅

### 已完成
- ✅ 手动导入 funding-admin-prod token: `c3d20409-73dd-4465-aa24-8bf24481b92a-00518-01`
- ✅ 手动导入 funding-admin-test token: `95DEE528...DDA41648-01018-01`
- ✅ 同步到 macOS Keychain
- ✅ 通过 MCP 工具验证可以读取

### 待解决
- ⏳ Chrome 插件自动导出功能的网络连接问题

## 验证修复效果

运行以下命令验证凭证已正确导入：

```bash
# 1. 通过 MCP 工具查看
curl -s http://localhost:8002/mcp -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_credential","arguments":{"id":"funding-admin-prod"}}}' \
  | jq -r '.result.content[0].text'

# 2. 通过 macOS Keychain 查看
security find-generic-password -s "funding-admin-prod" -g 2>&1 | grep "password:"

# 3. 测试 Funding Admin API（生产环境）
curl 'https://funding-admin.fintopia.tech/api/v1/sql' \
  -H 'content-type: application/json' \
  -H 'Cookie: YQG_UNITE_TOKEN_PROD=c3d20409-73dd-4465-aa24-8bf24481b92a-00518-01' \
  --data-raw '{"dbName":"LOAN","sql":"SELECT COUNT(*) FROM cash_loan_order LIMIT 1"}'

# 4. 测试 Funding Admin API（测试环境）
curl 'https://funding-admin.fintopia.tech/api/v1/sql' \
  -H 'content-type: application/json' \
  -H 'test-env: true' \
  -H 'Cookie: YQG_UNITE_TOKEN_TEST=95DEE528A28FBDAB57AB3E08473502EE7CCE060C987A63D94F2ED5B8EF4906F6DF547035DDA41648-01018-01' \
  --data-raw '{"dbName":"LOAN","sql":"SELECT COUNT(*) FROM cash_loan_order LIMIT 1"}'
```

## 下一步

1. **短期**：使用手动导入脚本定期更新 token
2. **中期**：修复 Chrome 插件的 CORS 问题
3. **长期**：考虑使用 Native Messaging 替代 HTTP API

## 参考资料

- [Chrome Extension Network Requests](https://developer.chrome.com/docs/extensions/mv3/xhr/)
- [CORS in Chrome Extensions](https://developer.chrome.com/docs/extensions/mv3/manifest/cross-origin-isolation/)
- [Manifest V3 Migration](https://developer.chrome.com/docs/extensions/mv3/intro/)
