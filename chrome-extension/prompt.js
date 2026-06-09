import {
  getSettings,
  exportAllConfiguredCookies,
  resetAutoExportBadge,
  updateBadgeFromState,
  getAutoExportState
} from './util.js';

const AUTO_CLOSE_MS = 5000;
const TRANSITION_MS = 150;

const shellEl = document.querySelector('.shell');
const exportBtn = document.getElementById('exportBtn');
const errEl = document.getElementById('err');

// When this prompt popup loads, immediately restore the default popup
// so the next time the user clicks the toolbar icon they see the full UI.
// We only swap to prompt.html transiently around a single openPopup() call.
try {
  chrome.action.setPopup({ popup: 'popup.html' });
} catch (err) {
  // Swallow; not fatal for this flow.
}

// Fade + slide in on load. requestAnimationFrame ensures the initial state
// is committed before we toggle to the visible state so the transition runs.
requestAnimationFrame(() => {
  requestAnimationFrame(() => shellEl.classList.add('in'));
});

// Gracefully close: play the fade-out first, then actually close the popup.
function gracefulClose(delayBeforeFade = 0) {
  setTimeout(() => {
    shellEl.classList.remove('in');
    shellEl.classList.add('out');
    setTimeout(() => window.close(), TRANSITION_MS);
  }, delayBeforeFade);
}

// Auto-close the prompt after 5 seconds of inactivity.
let autoCloseTimer = setTimeout(() => gracefulClose(), AUTO_CLOSE_MS);

function cancelAutoClose() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

async function onExportClick() {
  cancelAutoClose();
  exportBtn.disabled = true;
  errEl.style.display = 'none';
  errEl.textContent = '';
  try {
    const settings = await getSettings();
    if (!settings.domains.length) throw new Error('请先在配置页添加域名');
    if (!settings.fileHandleMeta) throw new Error('还没绑定固定文件');
    await exportAllConfiguredCookies(settings);
    await resetAutoExportBadge();
    await updateBadgeFromState(settings, await getAutoExportState());
    gracefulClose();
  } catch (error) {
    const message = error?.message || String(error);
    errEl.textContent = `导出失败：${message}`;
    errEl.style.display = 'block';
    // Show the failure for 1s so the user sees why, then fade out.
    gracefulClose(1000);
  }
}

exportBtn.addEventListener('click', onExportClick);
