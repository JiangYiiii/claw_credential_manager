#!/usr/bin/env node
// Cookie Keeper Native Messaging Host
// Reads length-prefixed JSON from stdin, atomically writes payload to disk.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOST_VERSION = '0.4.0';
const LOG_PATH = path.join(os.homedir(), '.agents', 'cookie-keeper', 'host.log');

function log(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // ignore log failures
  }
}

function sendMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

log(`started, pid=${process.pid}`);
sendMessage({ type: 'hello', version: HOST_VERSION, pid: process.pid });

function handleSnapshot(msg) {
  try {
    const target = path.join(os.homedir(), '.agents', 'cookie-keeper', 'all-cookies.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp.${process.pid}`;
    const json = JSON.stringify(msg.payload, null, 2);
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, target);
    log(`snapshot ${msg.id} wrote ${json.length} bytes`);
    sendMessage({ id: msg.id, type: 'ack', wroteTo: target, bytes: json.length });
  } catch (err) {
    log(`snapshot ${msg.id} failed: ${err.message}`);
    sendMessage({ id: msg.id, type: 'error', error: err.message });
  }
}

const inputBuffer = [];
let pendingLength = null;

process.stdin.on('data', (chunk) => {
  inputBuffer.push(chunk);
  let buf = Buffer.concat(inputBuffer);
  inputBuffer.length = 0;
  while (true) {
    if (pendingLength === null) {
      if (buf.length < 4) { inputBuffer.push(buf); break; }
      pendingLength = buf.readUInt32LE(0);
      buf = buf.slice(4);
    }
    if (buf.length < pendingLength) { inputBuffer.push(buf); break; }
    const json = buf.slice(0, pendingLength).toString('utf8');
    buf = buf.slice(pendingLength);
    pendingLength = null;
    let parsed;
    try { parsed = JSON.parse(json); }
    catch (err) {
      log(`drop unparseable json: ${err.message}`);
      sendMessage({ type: 'error', error: `bad json: ${err.message}` });
      continue;
    }
    if (parsed.type === 'snapshot') handleSnapshot(parsed);
    else {
      log(`unknown type: ${parsed.type}`);
      sendMessage({ id: parsed.id, type: 'error', error: `unknown type: ${parsed.type}` });
    }
  }
});

process.stdin.on('end', () => { log('exit on stdin end'); process.exit(0); });
process.stdin.on('close', () => { log('exit on stdin close'); process.exit(0); });
process.on('SIGTERM', () => { log('SIGTERM'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT'); process.exit(0); });
process.on('uncaughtException', (err) => {
  log(`uncaughtException: ${err.stack || err.message}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log(`unhandledRejection: ${reason?.stack || reason}`);
  process.exit(1);
});
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') { log('stdout EPIPE; chrome closed first'); process.exit(0); }
  log(`stdout error: ${err.message}`);
  process.exit(1);
});

process.stdin.resume();
