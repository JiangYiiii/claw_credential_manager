#!/usr/bin/env node
const puppeteer = require('puppeteer-core');
const http = require('http');

async function getAllDomains() {
  const req = http.get('http://localhost:9222/json/version', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      try {
        const json = JSON.parse(data);
        const browser = await puppeteer.connect({
          browserWSEndpoint: json.webSocketDebuggerUrl,
          defaultViewport: null
        });

        const pages = await browser.pages();

        // 获取所有标签页的 cookies
        let allCookies = [];
        for (const page of pages) {
          const pageCookies = await page.cookies();
          allCookies = allCookies.concat(pageCookies);
        }

        // 去重
        const uniqueCookies = Array.from(
          new Map(allCookies.map(c => [`${c.name}:${c.domain}`, c])).values()
        );

        const domains = [...new Set(uniqueCookies.map(c => c.domain.replace(/^\./, '')))];
        domains.sort();

        console.log('\n所有包含 cookies 的域名：\n');
        domains.forEach((d, i) => console.log(`${i+1}. ${d}`));
        console.log(`\n共 ${domains.length} 个域名`);

        await browser.disconnect();
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
  });

  req.on('error', (e) => {
    console.error('连接失败:', e.message);
  });
}

getAllDomains();
