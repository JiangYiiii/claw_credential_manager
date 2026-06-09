import {
  getSettings,
  saveSettings,
  pickExportFileHandle,
  setExportFileHandle,
  clearExportFileHandle,
  ensureExportFilePermission,
  isFileSystemAccessAvailable
} from './util.js';
import { EXT_ID } from './ext-id.js';

const domainsEl = document.getElementById('domains');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('topbar-status');
const pickFileBtn = document.getElementById('pickFileBtn');
const clearFileBtn = document.getElementById('clearFileBtn');
const fileHandleStatusEl = document.getElementById('fileHandleStatus');
const autoPromptToggleEl = document.getElementById('autoPromptToggle');
const syncModeRadios = document.querySelectorAll('input[name="syncMode"]');
const manualPanel = document.getElementById('manualPanel');
const autoHostPanel = document.getElementById('autoHostPanel');
const extIdField = document.getElementById('extIdField');
const hostStatusBadge = document.getElementById('hostStatusBadge');
const hostStatusReasonEl = document.getElementById('hostStatusReason');
const installCmdEl = document.getElementById('installCmd');

extIdField.textContent = EXT_ID;
installCmdEl.textContent = `bash host/scripts/install.sh --ext-id ${EXT_ID}`;

saveBtn.addEventListener('click', onSave);
pickFileBtn.addEventListener('click', onPickFile);
clearFileBtn.addEventListener('click', onClearFile);

for (const r of syncModeRadios) {
  r.addEventListener('change', onSyncModeChange);
}

document.querySelectorAll('.copy-btn[data-copy-target]').forEach((btn) => {
  btn.addEventListener('click', () => onCopyClick(btn));
});

const refreshHostBtn = document.getElementById('refreshHostBtn');
if (refreshHostBtn) {
  refreshHostBtn.addEventListener('click', () => refreshHostStatus());
}

async function onCopyClick(btn) {
  const targetId = btn.dataset.copyTarget;
  const target = document.getElementById(targetId);
  if (!target) return;
  const text = (target.textContent || '').trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flashCopied(btn);
  } catch {
    // Clipboard API blocked — fall back to legacy execCommand
    const range = document.createRange();
    range.selectNodeContents(target);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try { document.execCommand('copy'); flashCopied(btn); } catch {}
    sel.removeAllRanges();
  }
}

function flashCopied(btn) {
  const orig = btn.textContent;
  btn.textContent = '已复制';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = orig;
    btn.classList.remove('copied');
  }, 1200);
}

async function init() {
  const settings = await getSettings();
  domainsEl.value = settings.domains.join('\n');
  autoPromptToggleEl.checked = settings.autoPromptOnChange !== false;
  await renderFileHandleStatus(settings);
  applySyncModeUI(settings);
  if (settings.syncMode === 'auto-host') refreshHostStatus();
}

async function onSyncModeChange(e) {
  const mode = e.target.value;
  const saved = await saveSettings({ syncMode: mode });
  applySyncModeUI(saved);
  if (mode === 'auto-host') {
    refreshHostStatus();
  }
}

function applySyncModeUI(settings) {
  const isAuto = settings.syncMode === 'auto-host';
  for (const r of syncModeRadios) r.checked = (r.value === settings.syncMode);
  manualPanel.hidden = isAuto;
  autoHostPanel.hidden = !isAuto;
}

async function refreshHostStatus() {
  setHostStatus('pending', '检测中…');
  try {
    // force: true triggers a fresh connectNative round, so we detect
    // host removal even when an old port is still alive.
    const reply = await chrome.runtime.sendMessage({ type: 'probe-host', force: true });
    if (!reply?.ok) {
      setHostStatus('error', '未连接', reply?.error);
      return;
    }
    if (reply.status === 'connected') {
      setHostStatus('ok', '已连接');
      return;
    }
    if (reply.status === 'connecting') {
      setHostStatus('pending', '连接中');
      return;
    }
    setHostStatus('error', '未连接 · 尚未安装本地 host', reply.reason);
  } catch (err) {
    setHostStatus('error', '未连接', err.message);
  }
}

function setHostStatus(kind, label, reason) {
  hostStatusBadge.classList.remove('is-ok', 'is-pending', 'is-error');
  if (kind === 'ok') hostStatusBadge.classList.add('is-ok');
  else if (kind === 'pending') hostStatusBadge.classList.add('is-pending');
  else if (kind === 'error') hostStatusBadge.classList.add('is-error');
  hostStatusBadge.innerHTML = '';
  const dot = document.createElement('span');
  dot.className = 'dot';
  hostStatusBadge.appendChild(dot);
  hostStatusBadge.appendChild(document.createTextNode(label));

  if (reason && kind === 'error') {
    hostStatusReasonEl.hidden = false;
    hostStatusReasonEl.textContent = String(reason).slice(0, 200);
  } else {
    hostStatusReasonEl.hidden = true;
    hostStatusReasonEl.textContent = '';
  }
}

async function renderFileHandleStatus(settings = null) {
  const current = settings || await getSettings();
  const supported = await isFileSystemAccessAvailable();

  if (!supported) {
    pickFileBtn.disabled = true;
    clearFileBtn.disabled = true;
    fileHandleStatusEl.innerHTML = '<div class="file-status-meta">当前浏览器不支持固定文件写入。</div>';
    return;
  }

  pickFileBtn.disabled = false;

  if (!current.fileHandleMeta) {
    clearFileBtn.disabled = true;
    fileHandleStatusEl.innerHTML = '<div class="file-status-meta">还没选择固定保存文件。</div>';
    return;
  }

  clearFileBtn.disabled = false;
  const perm = await ensureExportFilePermission({ mode: 'readwrite', request: false });
  let permText = '状态未知';
  if (perm.reason === 'granted') {
    permText = '已授权';
  } else if (perm.reason === 'prompt') {
    permText = '导出时可能需确认';
  } else if (perm.reason === 'denied') {
    permText = '需要重新授权';
  } else if (perm.reason === 'missing-handle') {
    permText = '还没绑定文件';
  }

  fileHandleStatusEl.innerHTML = `
    <div class="file-status-label">当前文件</div>
    <div class="file-status-name">${escapeHtml(current.fileHandleMeta.name)}</div>
    <div class="file-status-meta">${permText}</div>
  `;
}

async function onPickFile() {
  try {
    const handle = await pickExportFileHandle('all-cookies.json');
    const saved = await setExportFileHandle(handle);
    setStatus(`已绑定固定文件：${saved.fileHandleMeta?.name || handle.name}`);
    await renderFileHandleStatus(saved);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    setStatus(`选择文件失败：${error.message}`, true);
  }
}

async function onClearFile() {
  try {
    const saved = await clearExportFileHandle();
    setStatus('已清除固定文件绑定。');
    await renderFileHandleStatus(saved);
  } catch (error) {
    setStatus(`清除失败：${error.message}`, true);
  }
}

async function onSave() {
  const domains = domainsEl.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  try {
    const saved = await saveSettings({
      domains,
      saveMode: 'file-handle',
      autoPromptOnChange: autoPromptToggleEl.checked
    });

    domainsEl.value = saved.domains.join('\n');
    autoPromptToggleEl.checked = saved.autoPromptOnChange !== false;
    await renderFileHandleStatus(saved);
    let modeHint;
    if (saved.syncMode === 'auto-host') {
      modeHint = '，自动模式下 cookie 变更会写入固定文件';
    } else {
      modeHint = saved.autoPromptOnChange ? '，变化时会弹出同步提示' : '，仅通过图标角标提示';
    }
    setStatus(`已保存：${saved.domains.length} 个域名${modeHint}。`);
  } catch (error) {
    setStatus(`保存失败：${error.message}`, true);
  }
}

function setStatus(message = '', isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', !!isError);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

init();
