#!/usr/bin/env node
/**
 * Export cookies from your MAIN Chrome browser
 * Works with chrome://inspect/#remote-debugging
 */

const puppeteer = require('puppeteer-core');

async function findChromeWSEndpoint() {
  const http = require('http');

  // 尝试常见的调试端口
  const ports = [9222, 9223, 9224, 9229];

  for (const port of ports) {
    try {
      const wsUrl = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/json/version`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve({ port, wsUrl: json.webSocketDebuggerUrl });
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(1000);
      });

      console.error(`✅ Found Chrome debug on port ${port}`);
      return wsUrl;
    } catch (e) {
      // Try next port
    }
  }

  throw new Error('Chrome debug port not found. Make sure Chrome is running with remote debugging enabled.');
}

async function exportCookies(domain) {
  let browser;

  try {
    // 查找 Chrome 调试端点
    console.error('Searching for Chrome debug endpoint...');
    const { wsUrl } = await findChromeWSEndpoint();

    // 连接到主浏览器
    console.error('Connecting to main Chrome browser...');
    browser = await puppeteer.connect({
      browserWSEndpoint: wsUrl,
      defaultViewport: null
    });

    // 获取所有标签页
    const pages = await browser.pages();

    if (pages.length === 0) {
      throw new Error('No pages found in browser. Open at least one tab.');
    }

    console.error(`Found ${pages.length} open tabs`);

    // 获取所有 cookies（从浏览器上下文，不是单个页面）
    // 这样可以获取所有标签页的 cookies
    let allCookies = [];
    for (const page of pages) {
      const pageCookies = await page.cookies();
      allCookies = allCookies.concat(pageCookies);
    }

    // 去重（相同的 cookie 可能在多个标签页）
    const uniqueCookies = Array.from(
      new Map(allCookies.map(c => [`${c.name}:${c.domain}`, c])).values()
    );

    console.error(`Total cookies: ${uniqueCookies.length}`);

    // 过滤指定域名
    const domainCookies = uniqueCookies.filter(cookie => {
      const cookieDomain = cookie.domain.startsWith('.')
        ? cookie.domain.substring(1)
        : cookie.domain;

      // 支持子域名匹配
      return domain === cookieDomain ||
             cookieDomain.endsWith(`.${domain}`) ||
             domain.endsWith(cookieDomain);
    });

    if (domainCookies.length === 0) {
      console.error(`\n❌ No cookies found for domain: ${domain}`);
      console.error(`\nAvailable domains:`);

      const domains = [...new Set(uniqueCookies.map(c => c.domain))];
      domains.slice(0, 30).forEach(d => console.error(`  - ${d}`));

      if (domains.length > 30) {
        console.error(`  ... and ${domains.length - 30} more`);
      }

      console.error(`\nTip: Make sure you have logged in to ${domain} in one of your open tabs`);
      process.exit(1);
    }

    console.error(`✅ Found ${domainCookies.length} cookies for ${domain}`);

    // 计算过期时间
    const expiryTime = getExpiryTime(domainCookies);

    // 输出 JSON 格式
    const output = {
      token: JSON.stringify(domainCookies),
      expires_at: expiryTime
    };

    // 输出到 stdout（只输出 JSON，其他信息都到 stderr）
    console.log(JSON.stringify(output));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure Chrome is running');
    console.error('2. Open chrome://inspect in your browser');
    console.error('3. Enable "Discover network targets"');
    console.error('4. Check if port 9222 is accessible');
    process.exit(1);
  } finally {
    if (browser) {
      await browser.disconnect();
    }
  }
}

function getExpiryTime(cookies) {
  let minExpiry = Infinity;

  for (const cookie of cookies) {
    if (cookie.expires && cookie.expires > 0) {
      minExpiry = Math.min(minExpiry, cookie.expires);
    }
  }

  if (minExpiry === Infinity) {
    // 默认 24 小时后过期
    minExpiry = Date.now() / 1000 + 86400;
  }

  return new Date(minExpiry * 1000).toISOString();
}

// 主函数
const domain = process.argv[2];
if (!domain) {
  console.error('Usage: node export-from-main-chrome.js <domain>');
  console.error('Example: node export-from-main-chrome.js github.com');
  console.error('\nThis script exports cookies from your MAIN Chrome browser');
  console.error('(the one you are currently using)');
  process.exit(1);
}

exportCookies(domain);
