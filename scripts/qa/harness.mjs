#!/usr/bin/env node
/**
 * ScriptForge QA harness — dependency-free Chrome DevTools Protocol driver.
 *
 * Boots headless Chrome against http://localhost:8000, evaluates an assertion
 * module inside the page, and reports the results plus every console error,
 * uncaught exception and failed request the page produced.
 *
 * Usage:
 *   node scripts/qa/harness.mjs scripts/qa/wave1.assertions.js
 *   QA_VIEWPORT=375,812 node scripts/qa/harness.mjs scripts/qa/wave3.assertions.js
 *
 * Exit code is 1 when any assertion fails, so this doubles as a CI gate.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.QA_BASE || 'http://localhost:8000';
const PORT = 9333 + (Number(process.env.QA_PORT_OFFSET) || 0);
const VIEWPORT = process.env.QA_VIEWPORT || '1400,1000';
const CHROME = process.env.QA_CHROME || '/usr/bin/google-chrome';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function flatten(result, prefix = '') {
  const rows = [];
  for (const [name, value] of Object.entries(result || {})) {
    if (value && typeof value === 'object' && typeof value.pass === 'boolean') {
      rows.push({ name: prefix + name, pass: value.pass, detail: value.detail });
    } else if (value && typeof value === 'object') {
      rows.push(...flatten(value, prefix + name + '.'));
    }
  }
  return rows;
}

async function main() {
  const assertionPath = process.argv[2];
  if (!assertionPath) {
    console.error('Usage: node scripts/qa/harness.mjs <assertions-file.js>');
    process.exit(2);
  }
  const assertionsSrc = readFileSync(assertionPath, 'utf8');

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--window-size=${VIEWPORT}`, '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      wsUrl = (await r.json()).webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch { /* chrome still booting */ }
    await sleep(250);
  }
  if (!wsUrl) {
    console.error('FAILED: chrome did not expose CDP');
    chrome.kill();
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  let msgId = 0;
  const pending = new Map();

  const onMessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve: res, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  ws.addEventListener('message', onMessage);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const id = ++msgId;
      pending.set(id, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable');
  await S('Network.enable');

  const consoleErrors = [];
  const exceptions = [];
  const failedRequests = [];
  const consoleAll = [];

  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ');
      consoleAll.push({ type: m.params.type, text });
      if (m.params.type === 'error') consoleErrors.push({ type: 'error', text });
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push(d.exception?.description || d.text);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      consoleErrors.push({ type: 'log', text: m.params.entry.text, url: m.params.entry.url });
    }
    if (m.method === 'Network.loadingFailed') {
      failedRequests.push(`${m.params.type}: ${m.params.errorText}`);
    }
  });

  const evaluate = async (expr) => {
    const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  };

  await S('Page.navigate', { url: BASE });

  // Wait for the studio to boot and complete its first render. Without this the
  // assertions can race the app's own boot and report false failures.
  const READY_EXPR = `(() => {
    const canvas = document.getElementById('notebookCanvas');
    const stats = document.getElementById('charStats');
    const ready = document.readyState === 'complete'
      && !!canvas
      && canvas.width > 0
      && !!stats && /\\d+\\s+glyphs/.test(stats.textContent || '');
    return ready;
  })()`;
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { ready = await evaluate(READY_EXPR); } catch { /* navigating */ }
    if (ready) break;
    await sleep(250);
  }
  if (!ready) console.error('WARNING: app did not signal readiness within 30s');
  await sleep(600);

  let out;
  try {
    out = await evaluate(`(async () => { ${assertionsSrc} })()`);
  } catch (e) {
    console.error('ASSERTION EVAL ERROR:', e.message);
    out = { error: e.message };
  }

  console.log(JSON.stringify(out, null, 2));

  const rows = flatten(out);
  const failed = rows.filter(r => !r.pass);
  console.log('\n===== SUMMARY =====');
  for (const r of rows) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (!r.pass) console.log(`      ${JSON.stringify(r.detail).slice(0, 600)}`);
  }
  console.log(`\n${rows.length - failed.length}/${rows.length} checks passed`);

  console.log('\n===== CDP DIAGNOSTICS =====');
  console.log('CONSOLE_ERRORS ' + JSON.stringify(consoleErrors, null, 2));
  console.log('EXCEPTIONS ' + JSON.stringify(exceptions, null, 2));
  console.log('FAILED_REQUESTS ' + JSON.stringify(failedRequests, null, 2));

  ws.close();
  chrome.kill();
  await sleep(300);

  const infraErrors = consoleErrors.length + exceptions.length + failedRequests.length;
  process.exit(failed.length || infraErrors ? 1 : 0);
}

main().catch(e => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(1);
});
