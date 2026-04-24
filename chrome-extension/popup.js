// 保存配置到 localStorage
function saveConfig() {
  const apiBase = document.getElementById('apiBase').value;
  const apiKey = document.getElementById('apiKey').value;
  localStorage.setItem('apiBase', apiBase);
  localStorage.setItem('apiKey', apiKey);
}

// 加载配置
function loadConfig() {
  const apiBase = localStorage.getItem('apiBase') || 'http://127.0.0.1:8002';
  const apiKey = localStorage.getItem('apiKey') || 'd59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124';
  document.getElementById('apiBase').value = apiBase;
  document.getElementById('apiKey').value = apiKey;
}

// 显示状态消息
function showStatus(message, type = 'info') {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = 'block';
}

// 导出当前域名的 cookies
async function exportCurrentDomain() {
  saveConfig();
  const apiBase = document.getElementById('apiBase').value;
  const apiKey = document.getElementById('apiKey').value;

  const exportBtn = document.getElementById('exportBtn');
  exportBtn.disabled = true;
  exportBtn.textContent = '⏳ 导出中...';

  try {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    const domain = url.hostname;

    showStatus(`正在导出 ${domain} 的 cookies...`, 'info');

    // 获取该域名的所有 cookies
    const cookies = await chrome.cookies.getAll({ domain: domain });

    if (cookies.length === 0) {
      showStatus('当前域名没有 cookies', 'error');
      return;
    }

    // 转换为 Netscape 格式
    const cookieData = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expirationDate ? new Date(c.expirationDate * 1000).toISOString() : null,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite
    }));

    // 保存到 API
    const entryId = domain.replace(/\./g, '-') + '-cookies';
    const response = await fetch(`${apiBase}/entries`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: entryId,
        name: `${domain} Cookies`,
        type: 'mixed',
        password: JSON.stringify(cookieData),
        custom_fields: {
          domain: domain,
          source: 'chrome-extension',
          user_agent: navigator.userAgent
        },
        metadata: {
          exported_at: new Date().toISOString(),
          cookie_count: cookies.length
        }
      })
    });

    if (response.status === 400 || response.status === 500) {
      const error = await response.json();
      if (error.error && error.error.includes('already exists')) {
        // 尝试更新
        const updateResponse = await fetch(`${apiBase}/entries/${entryId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: `${domain} Cookies`,
            type: 'mixed',
            password: JSON.stringify(cookieData),
            custom_fields: {
              domain: domain,
              source: 'chrome-extension',
              user_agent: navigator.userAgent
            },
            metadata: {
              exported_at: new Date().toISOString(),
              cookie_count: cookies.length
            }
          })
        });

        if (updateResponse.ok) {
          showStatus(`✅ 成功更新 ${cookies.length} 个 cookies`, 'success');
        } else {
          throw new Error('更新失败');
        }
        return;
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    showStatus(`✅ 成功导出 ${cookies.length} 个 cookies`, 'success');

  } catch (error) {
    showStatus(`❌ 导出失败: ${error.message}`, 'error');
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = '导出当前域名的 Cookies';
  }
}

// 导出所有域名的 cookies
async function exportAllDomains() {
  saveConfig();
  const apiBase = document.getElementById('apiBase').value;
  const apiKey = document.getElementById('apiKey').value;

  const exportAllBtn = document.getElementById('exportAllBtn');
  exportAllBtn.disabled = true;
  exportAllBtn.textContent = '⏳ 导出中...';

  try {
    showStatus('正在获取所有 cookies...', 'info');

    // 获取所有 cookies
    const allCookies = await chrome.cookies.getAll({});

    // 按域名分组
    const cookiesByDomain = {};
    allCookies.forEach(cookie => {
      const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      if (!cookiesByDomain[domain]) {
        cookiesByDomain[domain] = [];
      }
      cookiesByDomain[domain].push({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toISOString() : null,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite
      });
    });

    const domains = Object.keys(cookiesByDomain);
    showStatus(`找到 ${domains.length} 个域名，正在导出...`, 'info');

    let successCount = 0;
    let failCount = 0;

    for (const domain of domains) {
      const cookies = cookiesByDomain[domain];
      const entryId = domain.replace(/\./g, '-') + '-cookies';

      try {
        const response = await fetch(`${apiBase}/entries`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: entryId,
            name: `${domain} Cookies`,
            type: 'mixed',
            password: JSON.stringify(cookies),
            custom_fields: {
              domain: domain,
              source: 'chrome-extension',
              user_agent: navigator.userAgent
            },
            metadata: {
              exported_at: new Date().toISOString(),
              cookie_count: cookies.length
            }
          })
        });

        if (response.status === 400 || response.status === 500) {
          const error = await response.json();
          if (error.error && error.error.includes('already exists')) {
            // 尝试更新
            const updateResponse = await fetch(`${apiBase}/entries/${entryId}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: `${domain} Cookies`,
                type: 'mixed',
                password: JSON.stringify(cookies),
                custom_fields: {
                  domain: domain,
                  source: 'chrome-extension',
                  user_agent: navigator.userAgent
                },
                metadata: {
                  exported_at: new Date().toISOString(),
                  cookie_count: cookies.length
                }
              })
            });

            if (updateResponse.ok) {
              successCount++;
            } else {
              failCount++;
            }
            continue;
          }
        }

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        failCount++;
      }
    }

    showStatus(`✅ 导出完成: ${successCount} 成功, ${failCount} 失败`, 'success');

  } catch (error) {
    showStatus(`❌ 导出失败: ${error.message}`, 'error');
  } finally {
    exportAllBtn.disabled = false;
    exportAllBtn.textContent = '导出所有域名的 Cookies';
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  document.getElementById('exportBtn').addEventListener('click', exportCurrentDomain);
  document.getElementById('exportAllBtn').addEventListener('click', exportAllDomains);
  document.getElementById('apiBase').addEventListener('change', saveConfig);
  document.getElementById('apiKey').addEventListener('change', saveConfig);
});
