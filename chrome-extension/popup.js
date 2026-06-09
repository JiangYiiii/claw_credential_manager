import {
  getSettings,
  getLastExport,
  exportAllConfiguredCookies,
  getAutoExportState,
  updateBadgeFromState,
  resetAutoExportBadge
} from './util.js';

const listEl = document.getElementById('list');
const openOptionsBtn = document.getElementById('openOptions');
const exportAllBtn = document.getElementById('exportAllBtn');
let domainsExpanded = false;

openOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
exportAllBtn.addEventListener('click', exportNow);

async function render() {
  const settings = await getSettings();
  const lastExport = await getLastExport();
  const autoState = await getAutoExportState();
  await updateBadgeFromState(settings, autoState);

  if (settings.syncMode === 'auto-host') {
    return renderAutoHost(settings, autoState, lastExport);
  }

  return renderManual(settings, autoState, lastExport);
}

async function renderAutoHost(settings, autoState, lastExport) {
  exportAllBtn.style.display = 'none';
  const isError = autoState.lastStatus === 'error';
  const statusLine = autoState.lastStatus === 'ok'
    ? `✅ 上次同步：${formatDateTime(autoState.lastAt)} · ${autoState.lastCookieCount ?? '?'} 个 cookie`
    : isError
      ? `✗ 出错：${escapeHtml(autoState.lastError || 'unknown')}`
      : '尚未同步';
  listEl.innerHTML = `
    <div class="card">
      <div class="headline">
        <div class="name">自动模式</div>
        <div class="pill">${settings.domains.length} 个域名</div>
      </div>
      <div class="path-row">
        <div class="path">~/.agents/cookie-keeper/all-cookies.json</div>
      </div>
      ${renderDomainsPanel(settings)}
      <div class="status${isError ? ' error' : ''}">${statusLine}</div>
      ${isError ? `<div class="status error" style="margin-top:6px;">在配置页查看安装命令 / 切回手动模式</div>` : ''}
    </div>
  `;
  wireDomainsPanel();
}

function renderDomainsPanel(settings) {
  if (!settings.domains.length) return '';
  const previewCount = domainsExpanded ? settings.domains.length : 3;
  const visibleDomains = settings.domains.slice(0, previewCount);
  const hiddenCount = Math.max(settings.domains.length - previewCount, 0);
  return `
    <div class="domains-panel">
      <div class="domains-header">
        <div class="domains-title">已配置域名</div>
        <div class="domains-count">共 ${settings.domains.length} 个</div>
      </div>
      <div class="domains ${domainsExpanded ? 'expanded' : ''}">${visibleDomains.map((domain) => `<span class="chip">${escapeHtml(domain)}</span>`).join('')}${!domainsExpanded && hiddenCount > 0 ? `<button class="chip chip-action" title="展开其余域名" data-action="expand">展开 +${hiddenCount}</button>` : ''}${domainsExpanded && settings.domains.length > 3 ? `<button class="chip chip-action" title="收起域名列表" data-action="collapse">收起</button>` : ''}</div>
    </div>
  `;
}

function wireDomainsPanel() {
  const expandBtn = listEl.querySelector('button[data-action="expand"]');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      domainsExpanded = true;
      render().catch((error) => renderFatal(error?.message || '未知错误'));
    });
  }
  const collapseBtn = listEl.querySelector('button[data-action="collapse"]');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      domainsExpanded = false;
      render().catch((error) => renderFatal(error?.message || '未知错误'));
    });
  }
}

async function renderManual(settings, autoState, lastExport) {
  exportAllBtn.style.display = '';
  const targetLabel = settings.fileHandleMeta?.name || '还没选择固定文件';

  if (!settings.domains.length) {
    listEl.innerHTML = '<div class="empty">还没有可导出的域名。先去“配置”里检查默认域名列表，或补充你自己的域名。</div>';
    exportAllBtn.disabled = true;
    return;
  }

  if (!settings.fileHandleMeta) {
    listEl.innerHTML = '<div class="empty">还没绑定固定文件。先去“配置”里选择一个 JSON 文件。</div>';
    exportAllBtn.disabled = true;
    return;
  }

  exportAllBtn.disabled = false;

  listEl.innerHTML = `
    ${renderModePill(settings, autoState)}
    <div class="card">
      <div class="headline">
        <div class="name">固定导出文件</div>
        <div class="pill">${settings.domains.length} 个域名</div>
      </div>

      <div class="path-row">
        <div class="path" title="${escapeHtmlAttr(targetLabel)}">${escapeHtml(targetLabel)}</div>
      </div>

      ${renderDomainsPanel(settings)}

      <div class="status" id="status-main">${formatLastExportStatus(lastExport)}</div>
    </div>
  `;

  const errorPillEl = listEl.querySelector('.mode-pill.mode-error');
  if (errorPillEl) {
    errorPillEl.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  const pendingPillEl = listEl.querySelector('.mode-pill.mode-pending');
  if (pendingPillEl) {
    pendingPillEl.addEventListener('click', () => exportNow());
    // Visible hint to the user; Enter will trigger the export button.
    exportAllBtn.focus();
  }

  wireDomainsPanel();
}

async function exportNow() {
  const statusEl = document.getElementById('status-main');
  exportAllBtn.disabled = true;
  if (statusEl) {
    statusEl.classList.remove('error');
    statusEl.textContent = '导出中...';
  }

  try {
    const settings = await getSettings();
    const result = await exportAllConfiguredCookies(settings);
    // Manual (or auto-on-open) export proves the handle & permission are
    // healthy; clear any lingering auto-export error state so the amber/red
    // pill/badge resets.
    await resetAutoExportBadge();
    if (statusEl) {
      statusEl.textContent = `刚刚导出成功 · ${result.wroteTo}`;
    }
    await render();
  } catch (error) {
    if (statusEl) {
      statusEl.classList.add('error');
      statusEl.textContent = `导出失败：${error.message}`;
    }
  } finally {
    exportAllBtn.disabled = false;
  }
}

function renderModePill(_settings, autoState) {
  if (autoState.lastStatus === 'pending-auth') {
    return `<div class="mode-pill mode-pending" title="检测到 Cookie 更新，点「立即导出」同步文件"><span class="dot"></span>有 Cookie 更新 · 点「立即导出」同步</div>`;
  }
  if (autoState.lastStatus === 'error') {
    const hint = autoState.lastError
      ? `上次失败：${truncate(autoState.lastError, 40)}`
      : '上次失败';
    return `<div class="mode-pill mode-error" title="点击打开配置页重新检查文件绑定"><span class="dot"></span>${escapeHtml(hint)}</div>`;
  }
  return '';
}

function truncate(value, max) {
  const s = String(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function formatLastExportStatus(lastExport) {
  if (!lastExport) return '还没导出过';
  const base = `${formatDateTime(lastExport.at)} · ${lastExport.cookieCount} 个 cookie · ${lastExport.configuredDomainCount} 个域名`;
  const target = lastExport.wroteTo ? `<br>写入：${escapeHtml(lastExport.wroteTo)}` : '';
  const fallback = lastExport.fallbackReason ? `<br>错误：${escapeHtml(lastExport.fallbackReason)}` : '';
  return `${base}${target}${fallback}`;
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(value);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderFatal(message) {
  exportAllBtn.disabled = false;
  listEl.innerHTML = `<div class="empty" style="color:#bb3e3e">加载失败：${escapeHtml(message)}</div>`;
}

// Clear stale errors from previous architectures (offscreen / structured
// clone era) on popup open. These error strings can no longer occur in
// the current code path; surface them only as fresh errors if they
// reappear via a real export failure.
const STALE_ERROR_PATTERNS = [
  'createWritable is not a function',
  '离屏',
  'offscreen',
  'Receiving end does not exist',
  'autoFlushOnOpen',
  'share handle to offscreen',
  // Auth errors are transient by nature; if they still apply they'll
  // reappear next time the user clicks 立即导出. Clearing them on popup
  // open keeps the UI honest instead of showing a lingering red pill.
  '文件写入权限待确认',
  '没有文件写入权限',
  '文件写入权限被拒绝'
];

async function cleanStaleErrorState() {
  const state = await getAutoExportState();
  if (state.lastStatus !== 'error' || !state.lastError) return false;
  const stale = STALE_ERROR_PATTERNS.some((pattern) => state.lastError.includes(pattern));
  if (!stale) return false;
  await resetAutoExportBadge();
  const settings = await getSettings();
  await updateBadgeFromState(settings, await getAutoExportState());
  return true;
}

// When the popup opens in pending/error state, focus the "立即导出"
// button so Enter / a single click completes the sync. The File System
// Access API needs a fresh in-handler user activation, so we do NOT
// auto-invoke the export.
(async () => {
  const cleaned = await cleanStaleErrorState();
  if (cleaned) await render().catch(() => {});
})().catch(() => {});

render().catch((error) => {
  console.error('popup render failed', error);
  renderFatal(error?.message || '未知错误');
});
