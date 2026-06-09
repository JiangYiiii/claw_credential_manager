export const HANDLE_DB_NAME = 'cookie-keeper-fs';
export const HANDLE_STORE_NAME = 'handles';
export const HANDLE_KEY = 'exportFileHandle';

export const DEFAULT_SETTINGS = {
  domains: [],
  saveMode: 'file-handle',
  fileHandleMeta: null,
  autoPromptOnChange: true,
  syncMode: 'manual'
};

let _defaultDomainsCache = null;

async function loadDefaultDomains() {
  if (_defaultDomainsCache) return _defaultDomainsCache;

  // Chrome extension runtime: load via fetch on the bundled resource.
  if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
    try {
      const url = chrome.runtime.getURL('default-domains.json');
      const response = await fetch(url);
      const data = await response.json();
      _defaultDomainsCache = Array.isArray(data) ? data : [];
      return _defaultDomainsCache;
    } catch (error) {
      console.warn('[cookie-keeper] failed to load default-domains.json via fetch', error);
      _defaultDomainsCache = [];
      return _defaultDomainsCache;
    }
  }

  // Node test context: read the JSON file sitting next to util.js.
  try {
    const [{ readFile }, { fileURLToPath }, pathMod] = await Promise.all([
      import('node:fs/promises'),
      import('node:url'),
      import('node:path')
    ]);
    const here = pathMod.dirname(fileURLToPath(import.meta.url));
    const jsonPath = pathMod.join(here, 'default-domains.json');
    const raw = await readFile(jsonPath, 'utf8');
    const data = JSON.parse(raw);
    _defaultDomainsCache = Array.isArray(data) ? data : [];
    return _defaultDomainsCache;
  } catch (error) {
    console.warn('[cookie-keeper] failed to load default-domains.json from disk', error);
    _defaultDomainsCache = [];
    return _defaultDomainsCache;
  }
}

export async function getDefaultSettings() {
  const domains = await loadDefaultDomains();
  return normalizeSettings({ ...DEFAULT_SETTINGS, domains });
}

export const AUTO_EXPORT_DEBOUNCE_MS = 1_500;
export const AUTO_EXPORT_FAILURE_NOTIFY_COOLDOWN_MS = 60_000;

export function isAuthErrorMessage(message) {
  if (!message) return false;
  const s = String(message);
  return s.includes('权限待确认')
    || s.includes('没有文件写入权限')
    || s.includes('权限被拒绝');
}

export async function getSettings() {
  const { exportSettings } = await chrome.storage.local.get(['exportSettings']);
  if (exportSettings === undefined) {
    return await getDefaultSettings();
  }
  return normalizeSettings(exportSettings);
}

export async function saveSettings(settings) {
  const current = await getSettings();
  const normalized = normalizeSettings({ ...current, ...settings });
  await chrome.storage.local.set({ exportSettings: normalized });
  return normalized;
}

export function normalizeSettings(settings = {}) {
  const rawSyncMode = settings.syncMode;
  const syncMode = rawSyncMode === 'auto-host' ? 'auto-host' : 'manual';
  return {
    domains: normalizeDomains(settings.domains || []),
    saveMode: 'file-handle',
    fileHandleMeta: normalizeFileHandleMeta(settings.fileHandleMeta),
    autoPromptOnChange: settings.autoPromptOnChange === undefined ? true : !!settings.autoPromptOnChange,
    syncMode
  };
}

function normalizeFileHandleMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const name = String(meta.name || '').trim();
  const kind = String(meta.kind || '').trim() || 'file';
  const pickedAt = meta.pickedAt || null;
  return name ? { name, kind, pickedAt } : null;
}

export function normalizeDomains(domains = []) {
  return [...new Set(
    domains
      .map((item) => normalizeDomain(item || ''))
      .filter(Boolean)
  )];
}

export function normalizeDomain(domain) {
  let value = String(domain || '').trim().toLowerCase();
  if (!value) return '';

  const hadLeadingDot = value.startsWith('.');

  try {
    if (/^[a-z]+:\/\//.test(value)) {
      const url = new URL(value);
      value = url.hostname.toLowerCase();
    }
  } catch {
    // keep raw input if URL parsing fails
  }

  value = value.replace(/^\*\./, '.');
  value = value.replace(/^\.+/, '');
  value = value.replace(/\/+$/, '');
  value = value.replace(/\.+$/, '');

  if (!value) return '';
  return hadLeadingDot ? `.${value}` : value;
}

// Third-party analytics / tracking cookies that are unrelated to login
// state. Many of these SDKs (e.g. Sensors Data) rewrite the same value on
// every page init, which would otherwise flood the auto-export prompt with
// noise. Their values are irrelevant to local scripts consuming the
// exported JSON, so we just skip their change events entirely.
//
// Patterns are anchored at the start of the cookie name.
const ANALYTICS_COOKIE_PATTERNS = [
  /^sensorsdata/,     // Sensors Data (神策) — sensorsdata2015jssdkcross, sensorsdata_domain_test
  /^_ga/,             // Google Analytics — _ga, _gat, _gat_*, _ga_*
  /^_gid$/,           // Google Analytics
  /^Hm_(lvt|lpvt)_/,  // Baidu Tongji
  /^__utm/,           // Urchin / legacy GA
  /^_fb[pc]$/         // Facebook Pixel
];

export function isAnalyticsCookieName(name) {
  if (!name) return false;
  return ANALYTICS_COOKIE_PATTERNS.some((pattern) => pattern.test(name));
}

export function matchesCookieDomain(configDomain, cookieDomain) {
  const rawCfg = normalizeDomain(configDomain);
  const cfgIsDotted = rawCfg.startsWith('.');
  const a = rawCfg.replace(/^\./, '');
  const b = normalizeDomain(cookieDomain).replace(/^\./, '');
  if (!a || !b) return false;
  // Dotted prefix (".example.com") matches only cookies whose own domain
  // is exactly "example.com" — i.e. cross-subdomain shared cookies. This
  // keeps SSO tokens on the parent domain while avoiding noise from
  // host-only cookies that subdomains set for themselves.
  if (cfgIsDotted) return b === a;
  // Bare host ("example.com") keeps the legacy suffix-match semantics so
  // users can still pull every cookie visible under a host tree.
  return b === a || b.endsWith(`.${a}`);
}

function toSerializableCookie(cookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    session: cookie.session,
    storeId: cookie.storeId,
    hostOnly: cookie.hostOnly,
    expirationDate: cookie.expirationDate
  };
}

function buildCookiesByDomain(configuredDomains, cookies) {
  const grouped = {};
  for (const configuredDomain of configuredDomains) {
    grouped[configuredDomain] = cookies.filter((cookie) => matchesCookieDomain(configuredDomain, cookie.domain));
  }
  return grouped;
}

function withTimeout(promise, ms, message) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开本地句柄数据库'));
  });
}

async function withHandleStore(mode, runner) {
  const db = await openHandleDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, mode);
    const store = tx.objectStore(HANDLE_STORE_NAME);
    Promise.resolve(runner(store, tx)).then(resolve, reject);
    tx.onerror = () => reject(tx.error || new Error('本地句柄数据库操作失败'));
    tx.oncomplete = () => db.close();
    tx.onabort = () => reject(tx.error || new Error('本地句柄数据库操作中止'));
  }).finally(() => {
    try { db.close(); } catch {}
  });
}

export async function setExportFileHandle(handle) {
  if (!handle) throw new Error('缺少文件句柄');
  await withHandleStore('readwrite', (store) => {
    store.put(handle, HANDLE_KEY);
  });

  const current = await getSettings();
  return await saveSettings({
    ...current,
    fileHandleMeta: {
      name: handle.name || 'all-cookies.json',
      kind: handle.kind || 'file',
      pickedAt: new Date().toISOString()
    }
  });
}

export async function getExportFileHandle() {
  return await withHandleStore('readonly', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('读取文件句柄失败'));
    });
  });
}

export async function clearExportFileHandle() {
  await withHandleStore('readwrite', (store) => {
    store.delete(HANDLE_KEY);
  });
  const current = await getSettings();
  return await saveSettings({
    ...current,
    fileHandleMeta: null
  });
}

export async function ensureExportFilePermission({ mode = 'readwrite', request = false } = {}) {
  const handle = await getExportFileHandle();
  if (!handle) return { ok: false, reason: 'missing-handle' };

  const options = { mode };
  let permission = 'prompt';
  if (typeof handle.queryPermission === 'function') {
    permission = await handle.queryPermission(options);
  }
  if (permission !== 'granted' && request && typeof handle.requestPermission === 'function') {
    try {
      permission = await handle.requestPermission(options);
    } catch {
      // Without user activation (e.g. in a service worker) this throws.
      // Keep the previous permission value so the caller can surface a clear hint.
    }
  }
  return { ok: permission === 'granted', reason: permission, handle };
}

export async function isFileSystemAccessAvailable() {
  const scope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null);
  return !!scope && typeof scope.showSaveFilePicker === 'function';
}

export async function pickExportFileHandle(suggestedName = 'all-cookies.json') {
  if (!(await isFileSystemAccessAvailable())) {
    throw new Error('当前浏览器不支持文件句柄写入');
  }
  return await window.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'JSON 文件',
        accept: { 'application/json': ['.json'] }
      }
    ],
    excludeAcceptAllOption: false
  });
}

async function writePayloadToFileHandle(payload) {
  const perm = await ensureExportFilePermission({ mode: 'readwrite', request: true });
  if (!perm.ok || !perm.handle) {
    if (perm.reason === 'missing-handle') throw new Error('还没选择保存文件');
    if (perm.reason === 'prompt') throw new Error('文件写入权限待确认，请打开扩展弹窗点一下按钮授权');
    if (perm.reason === 'denied') throw new Error('文件写入权限被拒绝，请在配置页重新选择文件');
    throw new Error('没有文件写入权限');
  }
  return await writeHandleRaw(perm.handle, payload);
}

async function writeHandleRaw(handle, payload) {
  try {
    const writable = await withTimeout(
      handle.createWritable(),
      8000,
      '固定文件写入超时，可能是文件句柄已失效'
    );
    await withTimeout(writable.write(JSON.stringify(payload, null, 2)), 8000, '写入固定文件超时');
    await withTimeout(writable.close(), 8000, '关闭固定文件写入流超时');
    return handle;
  } catch (error) {
    const hint = error?.name === 'NotFoundError'
      ? '固定文件不存在，可能已被删除，请重新选择文件'
      : (error?.message || '固定文件写入失败');
    throw new Error(hint);
  }
}

export async function buildExportPayload(settingsInput) {
  const settings = normalizeSettings(settingsInput || await getSettings());
  if (!settings.domains.length) {
    throw new Error('请至少配置一个域名');
  }
  if (!chrome?.cookies?.getAll) {
    throw new Error('当前上下文无 chrome.cookies 权限，无法读取 Cookie');
  }

  const matchedCookies = [];
  const seen = new Set();
  const domainSummaries = [];

  for (const configuredDomain of settings.domains) {
    const queryDomain = configuredDomain.replace(/^\./, '');
    if (!queryDomain) continue;

    const cookies = await chrome.cookies.getAll({ domain: queryDomain });
    const filtered = cookies.filter((cookie) => matchesCookieDomain(configuredDomain, cookie.domain));

    domainSummaries.push({
      configuredDomain,
      queryDomain,
      matchedCookieCount: filtered.length
    });

    for (const cookie of filtered) {
      const key = [cookie.storeId, cookie.domain, cookie.path, cookie.name, cookie.value].join('\u0001');
      if (seen.has(key)) continue;
      seen.add(key);
      matchedCookies.push(toSerializableCookie(cookie));
    }
  }

  matchedCookies.sort((a, b) => {
    if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.storeId.localeCompare(b.storeId);
  });

  return {
    settings,
    payload: {
      updatedAt: new Date().toISOString(),
      configuredDomainCount: settings.domains.length,
      cookieCount: matchedCookies.length,
      domains: domainSummaries,
      cookiesByDomain: buildCookiesByDomain(settings.domains, matchedCookies),
      cookies: matchedCookies
    }
  };
}

export async function writeExportPayload(payload, settings) {
  if (!settings?.fileHandleMeta) {
    throw new Error('还没绑定固定文件');
  }
  const handle = await writePayloadToFileHandle(payload);
  const wroteTo = handle.name || settings.fileHandleMeta?.name || '已授权文件';

  await chrome.storage.local.set({
    lastExport: {
      at: payload.updatedAt,
      cookieCount: payload.cookieCount,
      configuredDomainCount: payload.configuredDomainCount,
      domains: settings.domains,
      saveModeUsed: 'file-handle',
      wroteTo,
      fallbackReason: null
    }
  });

  return { wroteTo };
}

export async function exportAllConfiguredCookies(settingsInput) {
  const { settings, payload } = await buildExportPayload(settingsInput);
  const { wroteTo } = await writeExportPayload(payload, settings);
  return { payload, saveModeUsed: 'file-handle', wroteTo };
}

export async function getLastExport() {
  const data = await chrome.storage.local.get(['lastExport']);
  return data.lastExport || null;
}

const AUTO_EXPORT_STATE_KEY = 'autoExportState';
const BADGE_COLOR_OK = '#315a3f';
const BADGE_COLOR_ERR = '#bb3e3e';
// Sky blue — cool complementary colour to the brown cookie icon, the
// same "unread / out-of-sync" hue used widely in Mail, GitHub, etc.
const BADGE_COLOR_PENDING = '#2080f0';

const DEFAULT_ICON_PATH = {
  16: 'icons/cookie-16.png',
  32: 'icons/cookie-32.png'
};

async function drawIconWithDot(size, color) {
  const response = await fetch(chrome.runtime.getURL(`icons/cookie-${size}.png`));
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, size, size);

  // Small dot in the bottom-right corner. ~28% of icon side.
  const r = Math.max(3, Math.round(size * 0.28));
  const cx = size - r - 1;
  const cy = size - r - 1;

  // White halo for contrast against darker icon backgrounds.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

async function applyPendingIcon() {
  try {
    const [img16, img32] = await Promise.all([
      drawIconWithDot(16, BADGE_COLOR_PENDING),
      drawIconWithDot(32, BADGE_COLOR_PENDING)
    ]);
    await chrome.action.setIcon({ imageData: { 16: img16, 32: img32 } });
  } catch (error) {
    console.warn('[cookie-keeper] failed to render dotted icon', error);
  }
}

async function restoreDefaultIcon() {
  try {
    await chrome.action.setIcon({ path: DEFAULT_ICON_PATH });
  } catch {
    // older Chrome may not accept path in some contexts; ignore.
  }
}

const STATUS_OK = 'ok';
const STATUS_ERROR = 'error';
const STATUS_PENDING_AUTH = 'pending-auth';

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeAutoExportState(raw) {
  const today = todayKey();
  const safe = raw && typeof raw === 'object' ? raw : {};
  const countSameDay = safe.dateKey === today ? Number(safe.todayCount) || 0 : 0;
  const validStatuses = [STATUS_OK, STATUS_ERROR, STATUS_PENDING_AUTH];
  return {
    todayCount: countSameDay,
    dateKey: today,
    lastStatus: validStatuses.includes(safe.lastStatus) ? safe.lastStatus : null,
    lastAt: safe.lastAt || null,
    lastError: safe.lastError || null,
    lastWroteTo: safe.lastWroteTo || null,
    lastCookieCount: typeof safe.lastCookieCount === 'number' ? safe.lastCookieCount : null,
    lastFailureNotifiedAt: safe.lastFailureNotifiedAt || null
  };
}

export async function getAutoExportState() {
  const { [AUTO_EXPORT_STATE_KEY]: raw } = await chrome.storage.local.get([AUTO_EXPORT_STATE_KEY]);
  return normalizeAutoExportState(raw);
}

async function writeAutoExportState(next) {
  await chrome.storage.local.set({ [AUTO_EXPORT_STATE_KEY]: next });
}

export async function recordAutoExportResult(outcome, detail = {}) {
  // Accept booleans for back-compat; new callers pass 'ok' | 'error' | 'pending-auth'.
  const status = outcome === true
    ? STATUS_OK
    : outcome === false
      ? STATUS_ERROR
      : outcome;
  const prev = await getAutoExportState();
  const nowIso = new Date().toISOString();
  const isOk = status === STATUS_OK;
  const next = {
    ...prev,
    dateKey: todayKey(),
    lastStatus: status,
    lastAt: nowIso,
    lastError: isOk ? null : (detail.error || 'unknown'),
    lastWroteTo: isOk ? (detail.wroteTo || prev.lastWroteTo) : prev.lastWroteTo,
    lastCookieCount: isOk && typeof detail.cookieCount === 'number' ? detail.cookieCount : prev.lastCookieCount,
    todayCount: isOk ? prev.todayCount + 1 : prev.todayCount
  };
  await writeAutoExportState(next);
  return next;
}

export async function resetAutoExportBadge() {
  await writeAutoExportState({
    ...(await getAutoExportState()),
    lastStatus: null,
    lastError: null,
    lastFailureNotifiedAt: null
  });
}

export async function updateBadgeFromState(_settings, state) {
  if (!chrome?.action) return;
  const st = state || await getAutoExportState();

  if (st.lastStatus === STATUS_PENDING_AUTH) {
    // Paint a small coral dot directly onto the toolbar icon. This avoids
    // Chrome's badge minimum width (~14px) and gives us pixel-perfect
    // control over dot size/position.
    await chrome.action.setBadgeText({ text: '' });
    await applyPendingIcon();
    return;
  }

  // Any non-pending state: restore the clean icon, then decide badge.
  await restoreDefaultIcon();

  if (st.lastStatus === STATUS_ERROR) {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_ERR });
    if (chrome.action.setBadgeTextColor) {
      try { await chrome.action.setBadgeTextColor({ color: '#ffffff' }); } catch {}
    }
    await chrome.action.setBadgeText({ text: '!' });
    return;
  }

  // Default: clear the badge. "Already in sync" doesn't need to show anything.
  await chrome.action.setBadgeText({ text: '' });
}

export async function notifyAutoExportFailure(message) {
  if (!chrome?.notifications) return;
  const prev = await getAutoExportState();
  const now = Date.now();
  const lastTs = prev.lastFailureNotifiedAt ? new Date(prev.lastFailureNotifiedAt).getTime() : 0;
  if (now - lastTs < AUTO_EXPORT_FAILURE_NOTIFY_COOLDOWN_MS) return;

  await writeAutoExportState({ ...prev, lastFailureNotifiedAt: new Date(now).toISOString() });

  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/cookie-128.png',
      title: 'Cookie Keeper · 自动导出失败',
      message: String(message || '未知错误').slice(0, 160),
      priority: 1
    });
  } catch {
    // notifications may be blocked at OS level; swallow
  }
}
