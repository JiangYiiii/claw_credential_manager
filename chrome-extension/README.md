# Claw Cookie Exporter - Chrome Extension

浏览器扩展，用于导出 Chrome Cookies 到 Claw Credential Manager。

## 安装方法

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `chrome-extension` 目录

## 使用方法

1. 点击浏览器工具栏的扩展图标
2. 配置 API 地址和 API Key (默认已填好)
3. 点击"导出当前域名的 Cookies" 或 "导出所有域名的 Cookies"
4. 导出完成后可在 http://localhost:8003 查看

## 功能

- ✅ 导出当前域名的所有 Cookies
- ✅ 导出浏览器所有域名的 Cookies
- ✅ 自动保存到容器 API
- ✅ 自动处理重复（更新已存在的条目）
- ✅ 包含 HttpOnly 和 Secure cookies
- ✅ 完全在浏览器中执行，无需宿主机依赖
