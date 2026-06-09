// host-port.js
// Single-instance NMH port with reconnect + request/response pairing.

import {
  recordAutoExportResult,
  notifyAutoExportFailure,
  getSettings,
  updateBadgeFromState
} from './util.js';

const HOST_NAME = 'com.fintopia.cookie_keeper';
const ACK_TIMEOUT_MS = 5_000;
const RECONNECT_BACKOFF_MS = [200, 1_000, 5_000, 30_000];
const MAX_FAILS_BEFORE_NOTIFY = 3;

let port = null;
let helloReceived = false;
let lastDisconnectReason = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let failedConnectStreak = 0;
const inflight = new Map(); // id → { resolve, reject, timer }
const helloWaiters = []; // { resolve, reject, timer } awaiting hello on the current port

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function rejectAllInflight(error) {
  for (const [id, entry] of inflight) {
    clearTimeout(entry.timer);
    entry.reject(new Error(error));
    inflight.delete(id);
  }
}

function resolveHelloWaiters() {
  while (helloWaiters.length) {
    const w = helloWaiters.shift();
    clearTimeout(w.timer);
    w.resolve();
  }
}

function rejectHelloWaiters(error) {
  while (helloWaiters.length) {
    const w = helloWaiters.shift();
    clearTimeout(w.timer);
    w.reject(new Error(error));
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = RECONNECT_BACKOFF_MS[Math.min(reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)];
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    try {
      ensureHostPort();
    } catch (err) {
      console.warn('[cookie-keeper] reconnect attempt failed', err);
      scheduleReconnect();
    }
  }, delay);
}

export function ensureHostPort() {
  if (port) return port;
  try {
    port = chrome.runtime.connectNative(HOST_NAME);
  } catch (err) {
    failedConnectStreak += 1;
    scheduleReconnect();
    throw new Error(`connectNative failed: ${err.message}`);
  }

  port.onMessage.addListener((msg) => {
    if (msg?.type === 'hello') {
      helloReceived = true;
      lastDisconnectReason = null;
      reconnectAttempt = 0;
      failedConnectStreak = 0;
      resolveHelloWaiters();
      return;
    }
    if (msg?.id && inflight.has(msg.id)) {
      const entry = inflight.get(msg.id);
      clearTimeout(entry.timer);
      inflight.delete(msg.id);
      if (msg.type === 'ack') entry.resolve(msg);
      else entry.reject(new Error(msg.error || 'host returned error'));
    } else {
      console.warn('[cookie-keeper] unmatched host message', msg);
    }
  });

  port.onDisconnect.addListener(async () => {
    if (!port) return; // already handled this disconnect
    const reason = chrome.runtime.lastError?.message || 'disconnected';
    console.info('[cookie-keeper] host port disconnected', reason);
    port = null;
    helloReceived = false;
    lastDisconnectReason = reason;
    rejectAllInflight(reason);
    rejectHelloWaiters(reason);
    failedConnectStreak += 1;
    if (failedConnectStreak >= MAX_FAILS_BEFORE_NOTIFY) {
      const next = await recordAutoExportResult('error', { error: `host-unavailable: ${reason}` });
      const settings = await getSettings();
      await updateBadgeFromState(settings, next);
      await notifyAutoExportFailure(`本地 host 未连接：${reason}`);
    }
    scheduleReconnect();
  });

  return port;
}

function waitForHello(timeoutMs) {
  if (helloReceived) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = helloWaiters.indexOf(entry);
      if (idx >= 0) helloWaiters.splice(idx, 1);
      reject(new Error('hello-timeout'));
    }, timeoutMs);
    const entry = { resolve, reject, timer };
    helloWaiters.push(entry);
  });
}

export async function sendSnapshot(payload) {
  const p = ensureHostPort();
  const id = genId();
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      inflight.delete(id);
      reject(new Error('host-ack-timeout'));
    }, ACK_TIMEOUT_MS);
    inflight.set(id, { resolve, reject, timer });
    try {
      p.postMessage({ id, type: 'snapshot', payload });
    } catch (err) {
      clearTimeout(timer);
      inflight.delete(id);
      reject(err);
    }
  });
}

export function getHostStatus() {
  if (port && helloReceived) return 'connected';
  if (port || reconnectTimer) return 'connecting';
  return 'disconnected';
}

export function getLastDisconnectReason() {
  return lastDisconnectReason;
}

export async function probeHost({ force = false } = {}) {
  failedConnectStreak = 0;
  reconnectAttempt = 0;
  // When force=true, drop any existing port so we re-issue connectNative
  // and let Chrome re-resolve the manifest. This is what an options-page
  // "refresh status" button needs: a previously-running port survives
  // even after the user uninstalls the host (the manifest deletion only
  // affects FUTURE connections, not ones already established).
  if (force && port) {
    try { port.disconnect(); } catch {}
    port = null;
    helloReceived = false;
    rejectAllInflight('probe-force-reconnect');
    rejectHelloWaiters('probe-force-reconnect');
  }
  if (port && helloReceived) return 'connected';
  try {
    ensureHostPort();
  } catch {
    return 'disconnected';
  }
  // Wait for the host to actually emit `hello` (or fail). connectNative()
  // returns a Port even when the manifest is missing — disconnect comes
  // asynchronously, so we cannot trust the Port's existence alone.
  try {
    await waitForHello(2_000);
    return 'connected';
  } catch {
    return port ? 'connecting' : 'disconnected';
  }
}
