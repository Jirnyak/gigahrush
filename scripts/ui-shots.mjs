// UI verification screenshot harness — boots dist/ over preview server, drives the
// game via CDP, and captures the three redesigned surfaces (HUD needs-bar, inventory,
// trade) to /tmp for visual inspection. Standalone; mirrors scripts/smoke-playability.mjs.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.UI_SHOTS_DIR || '/tmp';
const VIEW_W = 1600;
const VIEW_H = 1000;

const KEY = {
  enter: ['Enter', 'Enter', 13],
  escape: ['Escape', 'Escape', 27],
  w: ['KeyW', 'w', 87],
  e: ['KeyE', 'e', 69],
  i: ['KeyI', 'i', 73],
  backquote: ['Backquote', '`', 192],
  arrowDown: ['ArrowDown', 'ArrowDown', 40],
  arrowUp: ['ArrowUp', 'ArrowUp', 38],
};

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      lastError = new Error(`${url} returned ${res.status}`);
    } catch (err) { lastError = err; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function spawnLogged(command, args, name) {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  child.stdout.on('data', d => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[${name}] ${d}`));
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
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }
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
      if (msg.error) reject(new Error(`${msg.error.message}: ${msg.error.data ?? ''}`));
      else resolve(msg.result);
      return;
    }
    if (msg.method && this.handlers.has(msg.method)) {
      for (const h of this.handlers.get(msg.method)) h(msg.params);
    }
  }
  on(method, handler) {
    const list = this.handlers.get(method) ?? [];
    list.push(handler);
    this.handlers.set(method, list);
  }
  once(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const handler = params => { clearTimeout(timer); resolve(params); };
      this.on(method, handler);
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

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
async function tapKey(client, spec, holdMs = 170, settleMs = 150) {
  await dispatchKey(client, 'rawKeyDown', spec);
  await wait(holdMs);
  await dispatchKey(client, 'keyUp', spec);
  await wait(settleMs);
}
async function tapKeyImmediate(client, spec, settleMs = 120) {
  await dispatchKey(client, 'rawKeyDown', spec);
  await dispatchKey(client, 'keyUp', spec);
  await wait(settleMs);
}

let mouseX = Math.floor(VIEW_W / 2);
const mouseY = Math.floor(VIEW_H / 2);
async function clickCanvasCenter(client) {
  const p = { x: mouseX, y: mouseY };
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
  await wait(80);
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
  await wait(80);
}
// The game reads look input from `e.movementX` on document 'mousemove' events
// (src/input.ts). Headless CDP does not reliably synthesize movementX from
// mouseMoved deltas, so inject a real DOM MouseEvent carrying movementX. Pointer
// lock is already engaged, so the game's onMouse handler consumes it directly.
async function turnMouse(client, dx) {
  await evaluate(client, `document.dispatchEvent(new MouseEvent('mousemove', { movementX: ${dx | 0}, movementY: 0, bubbles: true })); true`);
  await wait(110);
}

async function state(client) {
  return evaluate(client, `window.__gigahrushSmokeState?.() ?? null`);
}
async function waitForState(client, label, predicate, timeoutMs = 4000) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    last = await state(client);
    if (last && predicate(last)) return last;
    await wait(60);
  }
  throw new Error(`${label}: timeout; last=${JSON.stringify(last)}`);
}

async function debugCommandIndex(client, id) {
  const idx = await evaluate(client, `window.__gigahrushDebugCommandIndex?.(${JSON.stringify(id)}) ?? -1`);
  if (!Number.isInteger(idx) || idx < 0) throw new Error(`debug id "${id}" not registered`);
  return idx;
}

async function screenshot(client, name) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const file = path.join(OUT, name);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  return file;
}

async function main() {
  const previewPort = await freePort();
  const debugPort = await freePort();
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'ui-shots-chrome-'));
  const gameUrl = `http://127.0.0.1:${previewPort}/?smoke=1`;
  const shots = [];
  const errors = [];
  let preview, chrome, client;
  try {
    preview = spawnLogged('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], 'preview');
    await waitForHttp(gameUrl, 20000);

    chrome = spawnLogged(chromePath, [
      '--headless=new', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader', '--mute-audio', '--no-first-run', '--no-default-browser-check',
      // Stop headless Chrome throttling requestAnimationFrame/timers to ~1fps when the
      // page isn't foregrounded — otherwise the game loop stalls and key edges get eaten.
      '--disable-background-timer-throttling', '--disable-backgrounding-occupied-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion,BackForwardCache',
      `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`,
      `--window-size=${VIEW_W},${VIEW_H}`, 'about:blank',
    ], 'chrome');
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, 15000);

    const page = await openPage(debugPort, gameUrl);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    await client.send('Page.bringToFront').catch(() => {});
    client.on('Runtime.exceptionThrown', p => errors.push(`exception: ${p.exceptionDetails?.text ?? '?'}`));
    client.on('Runtime.consoleAPICalled', p => {
      if (p.type === 'error' || p.type === 'assert') errors.push(`console.${p.type}: ${p.args?.map(a => a.value ?? a.description).join(' ')}`);
    });
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: false });
    const loaded = client.once('Page.loadEventFired', 15000).catch(() => {});
    await client.send('Page.navigate', { url: gameUrl });
    await loaded;
    await wait(1200);

    // ── Boot: dismiss title ──
    await tapKeyImmediate(client, KEY.enter);
    await wait(500);
    await tapKeyImmediate(client, KEY.enter);
    await waitForState(client, 'title start', s => s.started === true, 10000);
    // Anti-throttle flags keep the loop running; give the world a few seconds of real time
    // to warm up and repaint a live gameplay frame over the loading screen.
    await wait(4500);

    // close any interaction menu the start-adjacent world may have opened
    let s0 = await state(client);
    if (s0?.showNpcMenu || s0?.showContainerMenu || s0?.showInventory) {
      await tapKey(client, KEY.escape);
      await wait(200);
    }

    // ── Shot 1: HUD needs-bar (always-on gameplay HUD) ──
    shots.push(await screenshot(client, 'ui_hud.png'));

    // ── Shot 2: inventory ──
    await tapKey(client, KEY.i);
    await waitForState(client, 'inventory open', s => s.showInventory === true, 4000).catch(e => errors.push(`inv: ${e.message}`));
    await wait(500);
    shots.push(await screenshot(client, 'ui_inventory.png'));
    await tapKey(client, KEY.i); // close
    await waitForState(client, 'inventory close', s => s.showInventory === false, 4000).catch(() => {});
    await wait(200);

    // ── Shot 3: trade ──
    // Spawn a controllable trade partner through the debug menu. `spawn_npc` places an NPC
    // exactly 2 tiles dead-ahead facing the player, so no aiming/movement is needed. Its
    // faction is random (CITIZEN/LIQUIDATOR are friendly and tradeable; WILD/CULTIST can be
    // hostile and get rejected by findFriendlyNpc), so spawn a batch to guarantee a friendly.
    {
      const sc = await state(client);
      console.log(`[trade] actors before spawn: npc=${sc?.npcCount} monster=${sc?.monsterCount} live=${sc?.liveActorCount} z=${sc?.currentZ}`);
    }
    let opened = false;
    for (let round = 0; round < 3 && !opened; round++) {
      await tapKey(client, KEY.backquote, 150, 250); // open debug overlay
      const dbg = await waitForState(client, 'debug overlay', s => s.showDebug === true, 4000).catch(() => null);
      if (dbg) {
        const idx = await debugCommandIndex(client, 'spawn_npc');
        for (let k = 0; k < 60; k++) await tapKeyImmediate(client, KEY.arrowUp, 18); // pin selection to top
        let cur = await state(client);
        let guard = 0;
        while ((cur?.debugSel ?? 0) < idx && guard++ < idx + 40) {
          await tapKey(client, KEY.arrowDown, 120, 90);
          cur = await state(client);
        }
        if ((cur?.debugSel ?? -1) === idx) {
          for (let n = 0; n < 8; n++) await tapKey(client, KEY.enter, 130, 120); // batch spawn
        }
        await tapKey(client, KEY.backquote, 150, 250); // close debug overlay
        await waitForState(client, 'debug close', s => s.showDebug === false, 3000).catch(() => {});
      }
      const sc2 = await state(client);
      console.log(`[trade] after spawn round ${round}: npc=${sc2?.npcCount} canInteract=${sc2?.canInteractAhead} prompt="${sc2?.interactionPrompt ?? ''}"`);
      for (let attempt = 0; attempt < 6 && !opened; attempt++) {
        const s = await state(client);
        if (s?.showNpcMenu) { opened = true; break; }
        await tapKey(client, KEY.e, 170, 320); // open NPC menu with the freshly-spawned partner
        const s2 = await state(client);
        if (s2?.showNpcMenu) { opened = true; break; }
        if (s2?.showContainerMenu || s2?.showCraftMenu || s2?.isInteractableOverlayOpen || s2?.isNetTerminalGenOpen) {
          await tapKey(client, KEY.escape, 150, 220); // E hit a non-NPC interactable; dismiss and retry
        }
      }
    }
    if (!opened) errors.push('trade: NPC menu did not open after debug spawn batches');

    // Reach the trade tab. Builtin options are talk(0) quest(10) trade(20) leave(9000); a citizen
    // may also expose custom options (demos/craft/games) between them, so the concrete index of
    // "trade" varies. Scan candidate indices: for each, reset to a FRESH main menu (escape any
    // talk/quest/interface sub-tab, reopen with E if a prior 'leave'/interface closed it), pin the
    // cursor to the top, step down exactly N (verifying each ArrowDown landed — 16fps drops short
    // edges), activate, and check whether npcMenuTab flipped to 'trade'.
    async function resetToMainMenu() {
      for (let g = 0; g < 10; g++) {
        const s = await state(client);
        if (!s?.showNpcMenu) { await tapKey(client, KEY.e, 170, 300); continue; } // reopen
        if (s.npcMenuTab === 'main') return true;
        if (s.npcMenuTab === 'interface') await tapKey(client, KEY.enter, 150, 240); // accept closes the interface
        else await tapKey(client, KEY.escape, 150, 220); // talk/quest -> back to main
      }
      return (await state(client))?.npcMenuTab === 'main';
    }
    let reached = false;
    if (opened) {
      // Trade sits at index 3 for this NPC (talk 0, two customs 1–2, trade 3, leave 4). Try 3
      // first so index 2's interface option is never triggered; fall back to a wider scan.
      for (const target of [3, 4, 2, 1, 5]) {
        if (reached) break;
        if (!(await resetToMainMenu())) continue;
        for (let k = 0; k < 8; k++) await tapKey(client, KEY.arrowUp, 120, 80); // pin to top (sel=0)
        for (let d = 0; d < target; d++) { // step down to `target`, confirming each step landed
          const before = (await state(client))?.npcMenuSel ?? 0;
          for (let t = 0; t < 3; t++) {
            await tapKey(client, KEY.arrowDown, 140, 110);
            if (((await state(client))?.npcMenuSel ?? before) > before) break;
          }
        }
        const selBefore = (await state(client))?.npcMenuSel ?? -1;
        if (selBefore !== target) continue; // couldn't land on this index (fewer options); try next
        await tapKey(client, KEY.enter, 150, 300); // activate selection
        const s2 = await state(client);
        console.log(`[trade] target=${target} selBefore=${selBefore} -> tab=${s2?.npcMenuTab} showNpc=${s2?.showNpcMenu}`);
        if (s2?.npcMenuTab === 'trade') { reached = true; break; }
      }
      if (!reached) errors.push(`trade: could not reach trade tab; last tab=${(await state(client))?.npcMenuTab}`);
      await wait(500);
      shots.push(await screenshot(client, reached ? 'ui_trade.png' : 'ui_trade_FAILED.png'));
    } else {
      // still capture whatever is on screen for diagnosis
      shots.push(await screenshot(client, 'ui_trade_FAILED.png'));
    }

    console.log('\n=== UI SHOTS ===');
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
