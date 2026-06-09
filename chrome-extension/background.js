import {
  AUTO_EXPORT_DEBOUNCE_MS,
  buildExportPayload,
  getAutoExportState,
  getSettings,
  isAnalyticsCookieName,
  matchesCookieDomain,
  notifyAutoExportFailure,
  recordAutoExportResult,
  resetAutoExportBadge,
  updateBadgeFromState
} from './util.js';
import { sendSnapshot, probeHost, getLastDisconnectReason } from './host-port.js';

const ALARM_NAME = 'cookie-keeper-auto-export';
const PENDING_KEY = 'autoExportPendingAt';
const PROMPT_SHOWN_KEY = 'autoExportPromptShown';
const FALLBACK_DELAY_MINUTES = 0.5;

let inFlight = false;
let debounceTimer = null;

function clearInMemoryTimer() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

async function shouldIgnoreCookieChange(changeInfo, settings) {
  if (!settings.domains.length) return true;
  // Manual mode requires a bound file handle to write to. Auto-host mode
  // sends to the local NMH host and doesn't need one.
  if (settings.syncMode !== 'auto-host' && !settings.fileHandleMeta) return true;
  if (changeInfo.cause === 'expired' || changeInfo.cause === 'evicted' || changeInfo.cause === 'expired_overwrite') {
    return true;
  }
  const cookie = changeInfo.cookie;
  if (!cookie) return true;
  // Analytics SDKs (神策 / GA / ...) rewrite the same value on every page
  // init and would otherwise dominate the prompt cycle. Their values are
  // not used by any local-script consumer, so skip their change events.
  if (isAnalyticsCookieName(cookie.name)) return true;
  return !settings.domains.some((configured) => matchesCookieDomain(configured, cookie.domain));
}

async function schedulePendingExport() {
  const dueAt = Date.now() + AUTO_EXPORT_DEBOUNCE_MS;
  // Fresh pending cycle — allow the auto prompt to show once when this
  // cycle resolves.
  await chrome.storage.session.set({ [PENDING_KEY]: dueAt, [PROMPT_SHOWN_KEY]: false });

  clearInMemoryTimer();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runPendingExportIfDue('timer').catch((error) => console.warn('[cookie-keeper] debounce timer export failed', error));
  }, AUTO_EXPORT_DEBOUNCE_MS);

  try {
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: FALLBACK_DELAY_MINUTES });
  } catch (error) {
    console.warn('[cookie-keeper] alarm fallback failed to register', error);
  }
}

async function maybeShowAutoPrompt() {
  if (!chrome.action?.openPopup) return;
  const session = await chrome.storage.session.get([PROMPT_SHOWN_KEY]);
  if (session[PROMPT_SHOWN_KEY]) return;

  try {
    // Swap the action popup to the compact prompt, open it, then restore
    // the full popup so a user-initiated click still gets the normal UI.
    await chrome.action.setPopup({ popup: 'prompt.html' });
    await chrome.action.openPopup();
    await chrome.storage.session.set({ [PROMPT_SHOWN_KEY]: true });
  } catch (error) {
    // openPopup can fail when no focused window is available (e.g. user
    // switched to another app). Silently fall back to the badge nudge.
    console.info('[cookie-keeper] auto prompt suppressed', error?.message || error);
  } finally {
    // Always restore the normal popup so toolbar clicks behave as expected.
    try { await chrome.action.setPopup({ popup: 'popup.html' }); } catch {}
  }
}

async function runPendingExportIfDue(source) {
  if (inFlight) return;
  const { [PENDING_KEY]: dueAt } = await chrome.storage.session.get([PENDING_KEY]);
  if (!dueAt) return;
  if (Date.now() < Number(dueAt)) return;

  inFlight = true;
  try {
    await chrome.storage.session.remove(PENDING_KEY);

    const settings = await getSettings();
    if (!settings.domains.length) return;

    if (settings.syncMode === 'auto-host') {
      await runAutoHostSync(settings, source);
      return;
    }

    // manual mode (existing behavior)
    if (!settings.fileHandleMeta) return;
    const nextState = await recordAutoExportResult('pending-auth', {
      error: 'Cookie changed; waiting for popup click to flush write'
    });
    await updateBadgeFromState(settings, nextState);
    if (settings.autoPromptOnChange) {
      await maybeShowAutoPrompt();
    }
    console.info('[cookie-keeper] auto-export deferred to popup', { source });
  } catch (error) {
    const message = error?.message || String(error);
    const settings = await getSettings().catch(() => null);
    const nextState = await recordAutoExportResult('error', { error: message });
    await updateBadgeFromState(settings, nextState);
    await notifyAutoExportFailure(message);
    console.warn('[cookie-keeper] auto-export scheduling failed', { source, message });
  } finally {
    inFlight = false;
  }
}

async function runAutoHostSync(settings, source) {
  try {
    const { payload } = await buildExportPayload(settings);
    const ack = await sendSnapshot(payload);
    const nextState = await recordAutoExportResult('ok', {
      wroteTo: ack.wroteTo,
      cookieCount: payload.cookieCount
    });
    await updateBadgeFromState(settings, nextState);
    console.info('[cookie-keeper] auto-host sync ok', { source, bytes: ack.bytes });
  } catch (error) {
    const message = error?.message || String(error);
    const nextState = await recordAutoExportResult('error', { error: message });
    await updateBadgeFromState(settings, nextState);
    await notifyAutoExportFailure(message);
    console.warn('[cookie-keeper] auto-host sync failed', { source, message });
  }
}

chrome.cookies.onChanged.addListener((changeInfo) => {
  (async () => {
    const settings = await getSettings();
    if (await shouldIgnoreCookieChange(changeInfo, settings)) return;
    await schedulePendingExport();
  })().catch((error) => console.warn('[cookie-keeper] onChanged handler failed', error));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  runPendingExportIfDue('alarm').catch((error) => console.warn('[cookie-keeper] alarm export failed', error));
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.exportSettings) return;
  // Settings changed (domains, bound file, or auto-prompt toggle) — refresh
  // the badge. We don't restart any in-flight debounce timer: if there's a
  // pending cycle it'll still resolve on the old timer as expected.
  const settings = await getSettings();
  const state = await getAutoExportState();
  await updateBadgeFromState(settings, state);
});

async function refreshBadgeOnly() {
  const settings = await getSettings();
  const state = await getAutoExportState();
  await updateBadgeFromState(settings, state);
  // Ensure the toolbar click always goes to the full popup, even after a
  // crash that left action.popup pointing at prompt.html.
  try { await chrome.action.setPopup({ popup: 'popup.html' }); } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  refreshBadgeOnly().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  refreshBadgeOnly().catch(() => {});
});

// Init on SW wake-up
refreshBadgeOnly().catch(() => {});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'probe-host') return false;
  (async () => {
    try {
      const status = await probeHost({ force: !!msg?.force });
      // If the host is now reachable but storage still carries a stale
      // host-* error (typical right after the user finishes installing
      // the host), clear it so popup / badge stop showing the old error.
      if (status === 'connected') {
        const prev = await getAutoExportState();
        const stale = prev.lastStatus === 'error'
          && typeof prev.lastError === 'string'
          && /host-(unavailable|ack-timeout|down)|Native host/i.test(prev.lastError);
        if (stale) {
          await resetAutoExportBadge();
          const settings = await getSettings();
          const next = await getAutoExportState();
          await updateBadgeFromState(settings, next);
        }
      }
      sendResponse({ ok: true, status, reason: getLastDisconnectReason() });
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true; // keep sendResponse alive for async
});
