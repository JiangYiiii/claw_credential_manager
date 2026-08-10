#!/usr/bin/env node
/**
 * Sync Cookie Keeper snapshot (~/.agents/cookie-keeper/all-cookies.json)
 * into KeePass vault via credential-manager HTTP API.
 *
 * Entry ID format matches legacy Claw Cookie Exporter:
 *   rhino.fintopia.tech -> rhino-fintopia-tech-cookies
 *   .fintopia.tech      -> fintopia-tech-cookies
 */

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SNAPSHOT = path.join(os.homedir(), '.agents', 'cookie-keeper', 'all-cookies.json');
const DEFAULT_API_BASE = 'http://127.0.0.1:8002';
const DEFAULT_API_KEY = 'd59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124';
const DEFAULT_ALIASES = path.join(__dirname, 'cookie-entry-aliases.json');
const DEFAULT_TOKEN_ENTRIES = path.join(__dirname, 'cookie-token-entries.json');

function loadAliases(aliasesPath) {
  if (!fs.existsSync(aliasesPath)) return {};
  const raw = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
  const out = {};
  for (const [aliasId, domain] of Object.entries(raw)) {
    if (aliasId.startsWith('_')) continue;
    out[aliasId] = domain;
  }
  return out;
}

function loadTokenEntries(tokenEntriesPath) {
  if (!fs.existsSync(tokenEntriesPath)) return {};
  const raw = JSON.parse(fs.readFileSync(tokenEntriesPath, 'utf8'));
  const out = {};
  for (const [domain, entries] of Object.entries(raw)) {
    if (domain.startsWith('_')) continue;
    out[domain] = entries;
  }
  return out;
}

function cookieValue(cookies, cookieName) {
  const hit = cookies.find((c) => c.name === cookieName);
  return hit?.value || null;
}

function cookieExpiryIso(cookies, cookieName) {
  const hit = cookies.find((c) => c.name === cookieName);
  if (!hit?.expirationDate || hit.expirationDate <= 0) return null;
  return new Date(hit.expirationDate * 1000).toISOString();
}

function buildTokenPayload(domain, token, spec, snapshotUpdatedAt) {
  const displayDomain = domain.replace(/^\./, '');
  return {
    id: spec.entryId,
    name: spec.name,
    type: 'mixed',
    password: token,
    custom_fields: {
      domain: displayDomain,
      environment: spec.environment,
      source: 'cookie-keeper',
      configured_domain: domain,
      cookie_name: spec.cookieName,
    },
    metadata: {
      exported_at: snapshotUpdatedAt || new Date().toISOString(),
      token_expires_at: null,
      synced_from_cookie: spec.cookieName,
    },
  };
}

function syncKeychain(service, account, token) {
  if (process.platform !== 'darwin') return 'skipped';
  // 清理同 service 的旧条目（历史 account 可能是 YQG_UNITE_TOKEN 或 00518）
  for (let i = 0; i < 5; i += 1) {
    try {
      execFileSync('security', ['delete-generic-password', '-s', service], { stdio: 'ignore' });
    } catch {
      break;
    }
  }
  execFileSync('security', [
    'add-generic-password',
    '-s', service,
    '-a', account,
    '-w', token,
    '-U',
  ], { stdio: 'ignore' });
  return 'updated';
}

function domainToEntryId(domain) {
  const normalized = String(domain || '').replace(/^\./, '');
  return `${normalized.replace(/\./g, '-')}-cookies`;
}

function toVaultCookie(cookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expirationDate
      ? new Date(cookie.expirationDate * 1000).toISOString()
      : null,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  };
}

function earliestExpiryIso(cookies) {
  let min = null;
  for (const c of cookies) {
    if (c.expirationDate && c.expirationDate > 0) {
      const ts = c.expirationDate * 1000;
      if (min === null || ts < min) min = ts;
    }
  }
  return min ? new Date(min).toISOString() : null;
}

function buildPayload(domain, cookies, snapshotUpdatedAt, options = {}) {
  const entryId = options.id || domainToEntryId(domain);
  const vaultCookies = cookies.map(toVaultCookie);
  const displayDomain = domain.replace(/^\./, '');

  const metadata = {
    exported_at: snapshotUpdatedAt || new Date().toISOString(),
    cookie_count: cookies.length,
    token_expires_at: earliestExpiryIso(cookies),
  };
  if (options.aliasOf) {
    metadata.alias_of = options.aliasOf;
  }

  return {
    id: entryId,
    name: options.name || `${displayDomain} Cookies`,
    type: 'mixed',
    password: JSON.stringify(vaultCookies),
    custom_fields: {
      domain: displayDomain,
      source: 'cookie-keeper',
      configured_domain: domain,
      ...(options.aliasOf ? { alias_of: options.aliasOf } : {}),
    },
    metadata,
  };
}

async function readResponseError(response) {
  const text = await response.text();
  if (!text) return `HTTP ${response.status}`;
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object') {
      return data.error || data.message || text;
    }
  } catch {
    // fall through
  }
  return text;
}

function request(urlValue, options) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    const transport = url.protocol === 'https:' ? https : http;
    const body = options.body || '';
    const headers = {
      ...options.headers,
      ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
    };
    const req = transport.request(url, {
      method: options.method,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode || 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: res.headers,
          text: async () => responseBody,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestWithRetry(urlValue, options, maxAttempts = 4) {
  let response;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    response = await request(urlValue, options);
    if (response.status !== 429 || attempt === maxAttempts) return response;

    const retryAfterSeconds = Number(response.headers['retry-after']);
    const delay = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : 500 * (2 ** (attempt - 1));
    await sleep(delay);
  }
  return response;
}

async function upsertEntry(apiBase, apiKey, payload) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const createRes = await requestWithRetry(`${apiBase}/entries`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (createRes.ok) return 'created';

  const createErr = await readResponseError(createRes);
  if (createRes.status === 409 || createErr.includes('already exists')) {
    const { id, ...updatePayload } = payload;
    const updateRes = await requestWithRetry(`${apiBase}/entries/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updatePayload),
    });
    if (updateRes.ok) return 'updated';
    throw new Error(await readResponseError(updateRes));
  }

  throw new Error(createErr);
}

async function main() {
  const snapshotPath = process.env.COOKIE_KEEPER_PATH || DEFAULT_SNAPSHOT;
  const apiBase = process.env.CLAW_API_BASE || DEFAULT_API_BASE;
  const apiKey = process.env.CLAW_API_KEY || DEFAULT_API_KEY;
  const aliasesPath = process.env.COOKIE_ENTRY_ALIASES || DEFAULT_ALIASES;
  const tokenEntriesPath = process.env.COOKIE_TOKEN_ENTRIES || DEFAULT_TOKEN_ENTRIES;
  const aliases = loadAliases(aliasesPath);
  const tokenEntries = loadTokenEntries(tokenEntriesPath);

  if (!fs.existsSync(snapshotPath)) {
    console.error(`error: snapshot not found: ${snapshotPath}`);
    console.error('Ensure Cookie Keeper extension is installed and sync mode is active.');
    process.exit(2);
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const byDomain = snapshot.cookiesByDomain || {};
  const domains = Object.keys(byDomain);

  if (domains.length === 0) {
    console.error('error: snapshot has no cookiesByDomain entries');
    process.exit(3);
  }

  console.log('==========================================');
  console.log('Cookie Keeper -> KeePass 同步');
  console.log('==========================================');
  console.log(`快照: ${snapshotPath}`);
  console.log(`更新时间: ${snapshot.updatedAt || 'unknown'}`);
  console.log(`域名数: ${domains.length}`);
  if (Object.keys(aliases).length > 0) {
    console.log(`别名数: ${Object.keys(aliases).length}`);
  }
  console.log('');

  let created = 0;
  let updated = 0;
  let failed = 0;
  let aliasCreated = 0;
  let aliasUpdated = 0;
  let aliasSkipped = 0;
  let tokenUpdated = 0;
  let tokenSkipped = 0;
  let keychainUpdated = 0;

  for (const domain of domains.sort()) {
    const cookies = byDomain[domain];
    if (!Array.isArray(cookies) || cookies.length === 0) {
      console.log(`⏭️  跳过 ${domain} (无 cookie)`);
      continue;
    }

    const payload = buildPayload(domain, cookies, snapshot.updatedAt);
    process.stdout.write(`${domain} -> ${payload.id} (${cookies.length} cookies)... `);

    try {
      const action = await upsertEntry(apiBase, apiKey, payload);
      if (action === 'created') {
        console.log('✅ 已创建');
        created += 1;
      } else {
        console.log('✅ 已更新');
        updated += 1;
      }
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed += 1;
    }
  }

  if (Object.keys(aliases).length > 0) {
    console.log('');
    console.log('--- 别名 entry ---');
    for (const [aliasId, domain] of Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))) {
      const cookies = byDomain[domain];
      if (!Array.isArray(cookies) || cookies.length === 0) {
        console.log(`⏭️  跳过别名 ${aliasId} (域名 ${domain} 无 cookie)`);
        aliasSkipped += 1;
        continue;
      }

      const canonicalId = domainToEntryId(domain);
      const aliasPayload = buildPayload(domain, cookies, snapshot.updatedAt, {
        id: aliasId,
        name: `${aliasId} (alias of ${canonicalId})`,
        aliasOf: canonicalId,
      });
      process.stdout.write(`${aliasId} <- ${domain} (${cookies.length} cookies)... `);

      try {
        const action = await upsertEntry(apiBase, apiKey, aliasPayload);
        if (action === 'created') {
          console.log('✅ 已创建');
          aliasCreated += 1;
        } else {
          console.log('✅ 已更新');
          aliasUpdated += 1;
        }
      } catch (err) {
        console.log(`❌ ${err.message}`);
        failed += 1;
      }
    }
  }

  if (Object.keys(tokenEntries).length > 0) {
    console.log('');
    console.log('--- token entry（Funding Admin / Keychain）---');
    for (const [domain, specs] of Object.entries(tokenEntries).sort(([a], [b]) => a.localeCompare(b))) {
      const cookies = byDomain[domain];
      if (!Array.isArray(cookies) || cookies.length === 0) {
        console.log(`⏭️  跳过 token 同步 ${domain} (无 cookie)`);
        tokenSkipped += specs.length;
        continue;
      }

      for (const spec of specs) {
        const token = cookieValue(cookies, spec.cookieName);
        if (!token) {
          console.log(`⏭️  跳过 ${spec.entryId} (无 ${spec.cookieName})`);
          tokenSkipped += 1;
          continue;
        }

        const payload = buildTokenPayload(domain, token, spec, snapshot.updatedAt);
        payload.metadata.token_expires_at = cookieExpiryIso(cookies, spec.cookieName);

        process.stdout.write(`${spec.entryId} <- ${spec.cookieName}... `);
        try {
          const action = await upsertEntry(apiBase, apiKey, payload);
          console.log(action === 'created' ? '✅ 已创建' : '✅ 已更新');
          tokenUpdated += 1;

          if (spec.keychainService && spec.keychainAccount) {
            try {
              const kc = syncKeychain(spec.keychainService, spec.keychainAccount, token);
              if (kc === 'updated') keychainUpdated += 1;
            } catch (err) {
              console.log(`   ⚠️  Keychain ${spec.keychainService} 更新失败: ${err.message}`);
            }
          }
        } catch (err) {
          console.log(`❌ ${err.message}`);
          failed += 1;
        }
      }
    }
  }

  console.log('');
  console.log('==========================================');
  console.log(`完成: 创建 ${created}, 更新 ${updated}, 失败 ${failed}`);
  if (Object.keys(aliases).length > 0) {
    console.log(`别名: 创建 ${aliasCreated}, 更新 ${aliasUpdated}, 跳过 ${aliasSkipped}`);
  }
  if (Object.keys(tokenEntries).length > 0) {
    console.log(`token: 更新 ${tokenUpdated}, 跳过 ${tokenSkipped}, Keychain ${keychainUpdated}`);
  }
  console.log('==========================================');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`fatal: ${err.message}`);
  process.exit(1);
});
