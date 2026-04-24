# Rhino API 调用指南

## 问题回顾

在集成 OpenClaw 调用 rhino API 时遇到 10001 错误，经过排查发现问题不在凭证过期，而是缺少必需的 HTTP Headers。

## 根本原因

**Rhino API 需要额外的自定义 Headers**：
- `fintopia-rhino-env: prod`（或 `test`、`dev`）
- `fintopia-rhino-region: cn`（或其他区域）

缺少这些 Headers 时，API 返回：
```json
{
  "status": {
    "code": 10001,
    "detail": "服务异常，请稍后再试"
  }
}
```

## 正确的调用方式

### 完整示例

```bash
curl 'https://rhino.fintopia.tech/alert-admin/v2/alert/query' \
  -H 'Content-Type: application/json' \
  -H 'fintopia-rhino-env: prod' \
  -H 'fintopia-rhino-region: cn' \
  -H 'Cookie: YQG_UNITE_TOKEN_PROD=<token>; YQG_EMAIL_PROD=<email>' \
  --data-raw '{
    "viewType": "group",
    "userIds": [],
    "groupIds": ["142"],
    "alertLevel": "ERROR",
    "pageNo": 1,
    "pageSize": 10,
    "startTime": 1776614400000,
    "endTime": 1777007331320
  }'
```

### 必需的 Headers

| Header | 说明 | 可选值 |
|--------|------|--------|
| `Content-Type` | 标准 HTTP header | `application/json` |
| `fintopia-rhino-env` | **必需** - Rhino 环境 | `prod`, `test`, `dev` |
| `fintopia-rhino-region` | **必需** - Rhino 区域 | `cn`, 其他区域代码 |

### 必需的 Cookies

| Cookie | 说明 | 示例 |
|--------|------|------|
| `YQG_UNITE_TOKEN_PROD` | 统一认证 token | `A1A22D06A0BCD70EA5923717DCAD2A1C...` |
| `YQG_EMAIL_PROD` | 用户邮箱 | `yijiang@fintopia.tech` |

## 如何在 MCP 中实现

如果您在编写 rhino MCP 工具，需要在 HTTP 请求中添加这些 headers：

### Python 示例

```python
import requests

def call_rhino_api(endpoint, payload, cookies):
    headers = {
        'Content-Type': 'application/json',
        'fintopia-rhino-env': 'prod',
        'fintopia-rhino-region': 'cn'
    }
    
    cookie_str = '; '.join([f'{k}={v}' for k, v in cookies.items()])
    headers['Cookie'] = cookie_str
    
    response = requests.post(
        f'https://rhino.fintopia.tech{endpoint}',
        headers=headers,
        json=payload
    )
    
    return response.json()

# 使用示例
cookies = {
    'YQG_UNITE_TOKEN_PROD': 'A1A22D06A0BCD70EA5923717DCAD2A1C...',
    'YQG_EMAIL_PROD': 'yijiang@fintopia.tech'
}

result = call_rhino_api(
    '/alert-admin/v2/alert/query',
    {
        'viewType': 'group',
        'groupIds': ['142'],
        'alertLevel': 'ERROR',
        'pageNo': 1,
        'pageSize': 10
    },
    cookies
)
```

### Go 示例

```go
import (
    "bytes"
    "encoding/json"
    "net/http"
)

func CallRhinoAPI(endpoint string, payload interface{}, cookies map[string]string) (*http.Response, error) {
    jsonData, _ := json.Marshal(payload)
    
    req, _ := http.NewRequest("POST", 
        "https://rhino.fintopia.tech"+endpoint, 
        bytes.NewBuffer(jsonData))
    
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("fintopia-rhino-env", "prod")
    req.Header.Set("fintopia-rhino-region", "cn")
    
    for name, value := range cookies {
        req.AddCookie(&http.Cookie{Name: name, Value: value})
    }
    
    client := &http.Client{}
    return client.Do(req)
}
```

### Node.js 示例

```javascript
async function callRhinoAPI(endpoint, payload, cookies) {
  const response = await fetch(`https://rhino.fintopia.tech${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'fintopia-rhino-env': 'prod',
      'fintopia-rhino-region': 'cn',
      'Cookie': Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
    },
    body: JSON.stringify(payload)
  });
  
  return response.json();
}

// 使用示例
const cookies = {
  'YQG_UNITE_TOKEN_PROD': 'A1A22D06A0BCD70EA5923717DCAD2A1C...',
  'YQG_EMAIL_PROD': 'yijiang@fintopia.tech'
};

const result = await callRhinoAPI(
  '/alert-admin/v2/alert/query',
  {
    viewType: 'group',
    groupIds: ['142'],
    alertLevel: 'ERROR',
    pageNo: 1,
    pageSize: 10
  },
  cookies
);
```

## 从凭证库获取 Cookies

```bash
# 1. 从 credential-manager 获取凭证
curl -s -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  http://localhost:8002/entries/rhino-cookies | jq -r '.password' > /tmp/rhino-cookies.json

# 2. 提取需要的 cookies
YQG_TOKEN=$(jq -r '.[] | select(.name == "YQG_UNITE_TOKEN_PROD") | .value' /tmp/rhino-cookies.json)
YQG_EMAIL=$(jq -r '.[] | select(.name == "YQG_EMAIL_PROD") | .value' /tmp/rhino-cookies.json)

# 3. 调用 API
curl 'https://rhino.fintopia.tech/alert-admin/v2/alert/query' \
  -H 'Content-Type: application/json' \
  -H 'fintopia-rhino-env: prod' \
  -H 'fintopia-rhino-region: cn' \
  -H "Cookie: YQG_UNITE_TOKEN_PROD=$YQG_TOKEN; YQG_EMAIL_PROD=$YQG_EMAIL" \
  --data-raw '{"queryType":"ALL","ticketId":"1234322"}'
```

## 常见错误

### 错误 1: 10001 服务异常

**原因**：缺少 `fintopia-rhino-env` 或 `fintopia-rhino-region` header

**解决**：添加这两个 headers

### 错误 2: 401 未授权

**原因**：Cookie 过期或无效

**解决**：
1. 检查凭证过期时间
2. 重新导出 cookies
3. 确保使用了 `YQG_UNITE_TOKEN_PROD` 和 `YQG_EMAIL_PROD`

### 错误 3: 404 Not Found

**原因**：API 端点路径错误

**解决**：检查 endpoint 是否正确，注意 `/alert-admin/` 前缀

## 测试检查清单

在调试 rhino API 调用问题时，按以下顺序检查：

- [ ] 凭证是否过期？
  ```bash
  curl -s -H "Authorization: Bearer <api_key>" http://localhost:8002/entries/rhino-cookies | jq '.metadata.token_expires_at'
  ```

- [ ] 是否包含 `fintopia-rhino-env` header？

- [ ] 是否包含 `fintopia-rhino-region` header？

- [ ] Cookie 中是否同时包含 `YQG_UNITE_TOKEN_PROD` 和 `YQG_EMAIL_PROD`？

- [ ] API endpoint 是否正确？

- [ ] 是否能访问简单的 health endpoint？
  ```bash
  curl -s -H "Cookie: YQG_UNITE_TOKEN_PROD=<token>" https://rhino.fintopia.tech/api/v1/health
  ```

## 相关文档

- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - 通用故障排查指南
- [凭证管理系统架构](./README.md)

---

**最后更新**: 2026-04-24
