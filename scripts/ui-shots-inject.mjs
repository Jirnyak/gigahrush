// UI screenshot harness (injection-based). Boots dist/ over preview server, drives
// the game via CDP, then captures overlays by flipping the live `state.show*` flags
// through window.__gigahrushState() instead of simulating key edges. Key simulation
// is unreliable at the 4fps cold-start (heavy AI), so we set overlay flags directly:
// the HUD draws every overlay from these booleans each frame. Standalone; mirrors
// scripts/ui-shots.mjs plumbing.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.UI_SHOTS_DIR || '/tmp';
const VIEW_W = Number(process.env.UI_SHOTS_W || 1600);
const VIEW_H = Number(process.env.UI_SHOTS_H || 1000);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try { const res = await fetch(url); if (res.ok) return res; lastError = new Error(`${url} -> ${res.status}`); }
    catch (err) { lastError = err; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}
function spawnLogged(command, args, name) {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  child.stdout.on('data', d => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on('data', d => { const s = String(d); if (/error|Error|FATAL/.test(s)) process.stderr.write(`[${name}] ${s}`); });
  return child;
}
function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 1500).unref();
    setTimeout(resolve, 2500).unref();
  });
}
class CdpClient {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.nextId = 1; this.pending = new Map(); this.handlers = new Map(); }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', e => reject(new Error(`CDP ws error: ${e.message ?? '?'}`)), { once: true });
      this.ws.addEventListener('message', e => this.#onMessage(e));
    });
  }
  #onMessage(event) {
    const msg = JSON.parse(String(event.data));
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}: ${msg.error.data ?? ''}`)); else resolve(msg.result);
      return;
    }
    if (msg.method && this.handlers.has(msg.method)) for (const h of this.handlers.get(msg.method)) h(msg.params);
  }
  on(method, handler) { const list = this.handlers.get(method) ?? []; list.push(handler); this.handlers.set(method, list); }
  once(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      this.on(method, params => { clearTimeout(timer); resolve(params); });
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  close() { this.ws.close(); }
}
async function fetchJson(url, init) { const res = await fetch(url, init); if (!res.ok) throw new Error(`${url} -> ${res.status}`); return res.json(); }
async function openPage(debugPort, url) {
  const encoded = encodeURIComponent(url);
  try { return await fetchJson(`http://127.0.0.1:${debugPort}/json/new?${encoded}`, { method: 'PUT' }); }
  catch {
    const pages = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = pages.find(p => p.type === 'page');
    if (!page) throw new Error('No debuggable page target');
    return page;
  }
}
async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'eval error');
  return result.result.value;
}
function wait(ms) { return new Promise(r => setTimeout(r, Math.max(0, ms))); }
async function dispatchKey(client, type, spec) {
  const [code, key, vk] = spec;
  await client.send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}
async function tapKey(client, spec, holdMs = 150, settleMs = 150) {
  await dispatchKey(client, 'rawKeyDown', spec); await wait(holdMs);
  await dispatchKey(client, 'keyUp', spec); await wait(settleMs);
}
async function clickCanvasCenter(client) {
  const x = Math.floor(VIEW_W / 2), y = Math.floor(VIEW_H / 2);
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await wait(60);
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await wait(60);
}
async function screenshot(client, name) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const file = path.join(OUT, name);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  return file;
}
// Set a set of state.show* flags (clearing all overlay flags first), then paint & shoot.
const OVERLAY_FLAGS = ['showInventory','showQuests','showLog','showFactions','showDemos','showMenu','showHelp','showControls','showUiSettings','showMapLegend','showNpcMenu','showContainerMenu','showCraftMenu','showDebug'];
async function showOnly(client, setFlags = {}, extra = '') {
  const clears = OVERLAY_FLAGS.map(f => `s.${f}=false;`).join('');
  const sets = Object.entries(setFlags).map(([k, v]) => `s.${k}=${JSON.stringify(v)};`).join('');
  await evaluate(client, `(()=>{const s=window.__gigahrushState&&window.__gigahrushState();if(!s)return 'no-state';${clears}${sets}${extra}return 'ok';})()`);
  await wait(360); // let a couple frames paint
}

async function main() {
  const previewPort = await freePort();
  const debugPort = await freePort();
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'ui-shots-inject-'));
  const gameUrl = `http://127.0.0.1:${previewPort}/?smoke=1`;
  const shots = []; const errors = [];
  let preview, chrome, client;
  try {
    preview = spawnLogged('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], 'preview');
    await waitForHttp(gameUrl, 20000);
    chrome = spawnLogged(chromePath, [
      '--headless=new', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
      '--mute-audio', '--no-first-run', '--no-default-browser-check',
      '--disable-background-timer-throttling', '--disable-backgrounding-occupied-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion,BackForwardCache',
      `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, `--window-size=${VIEW_W},${VIEW_H}`, 'about:blank',
    ], 'chrome');
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, 15000);
    const page = await openPage(debugPort, gameUrl);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    await client.send('Page.bringToFront').catch(() => {});
    client.on('Runtime.exceptionThrown', p => errors.push(`exception: ${p.exceptionDetails?.text ?? '?'}`));
    await client.send('Page.enable'); await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: false });
    const loaded = client.once('Page.loadEventFired', 15000).catch(() => {});
    await client.send('Page.navigate', { url: gameUrl });
    await loaded;
    await wait(1200);

    const KEY = { enter: ['Enter', 'Enter', 13] };
    await dispatchKey(client, 'rawKeyDown', KEY.enter); await dispatchKey(client, 'keyUp', KEY.enter); await wait(500);
    await dispatchKey(client, 'rawKeyDown', KEY.enter); await dispatchKey(client, 'keyUp', KEY.enter); await wait(500);
    // wait for started
    for (let i = 0; i < 60; i++) { const s = await evaluate(client, `window.__gigahrushSmokeState?.()?.started ?? false`); if (s) break; await wait(250); }
    await wait(3500); // warm up a live frame
    // clear pointer-capture gate so overlays render clean (gate draws its own screen)
    await clickCanvasCenter(client);
    await wait(400);

    const targets = (process.env.UI_SHOTS_ONLY ? process.env.UI_SHOTS_ONLY.split(',') : ['hud','inventory','quests','factions','help','controls','maplegend']);
    const prefix = process.env.UI_SHOTS_PREFIX || '';
    for (const t of targets) {
      try {
        if (t === 'hud') await showOnly(client, {});
        else if (t === 'inventory') await showOnly(client, { showInventory: true }, 's.invSel=0;');
        else if (t === 'quests') await showOnly(client, { showQuests: true });
        else if (t === 'factions') await showOnly(client, { showFactions: true });
        else if (t === 'help') await showOnly(client, { showHelp: true });
        else if (t === 'controls') await showOnly(client, { showControls: true });
        else if (t === 'maplegend') await showOnly(client, { showMapLegend: true }, 's.mapMode=2;');
        else if (t === 'fullmap') await showOnly(client, {}, 's.mapMode=2;');
        else if (t === 'demos') await showOnly(client, { showDemos: true });
        else if (t === 'log') await showOnly(client, { showLog: true });
        shots.push(await screenshot(client, `${prefix}ui_${t}.png`));
      } catch (e) { errors.push(`${t}: ${e.message}`); }
    }
    console.log('\n=== UI SHOTS (inject) ===');
    for (const s of shots) console.log('shot:', s);
    console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  } finally {
    if (client) client.close();
    await stopProcess(chrome);
    await stopProcess(preview);
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}
main().catch(err => { console.error('FATAL', err); process.exit(1); });
