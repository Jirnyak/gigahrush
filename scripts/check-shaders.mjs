/* Компиляция ВСЕХ шейдерных программ src/render/ в настоящем WebGL2.
 *
 * Зачем отдельный прибор. Ошибка GLSL в этом проекте невидима для обычных
 * гейтов: `tsc` видит шейдер как строку и молчит, а `smoke` остаётся зелёным,
 * потому что три прохода поднимаются через `createOptional*Pass`, и те ГЛОТАЮТ
 * исключение в `console.warn` — а `smoke` считает провалом только `console.error`.
 * Сломанный меш-шейдер поэтому доезжал до игрока живым: игра просто рисовала
 * мир без мебели. Здесь шейдеры компилирует настоящий драйвер (ANGLE/SwiftShader
 * в headless Chrome), а инструментовка снимает лог ДО того, как его проглотят.
 *
 * Игровое состояние не нужно: `initWebGL` принимает процедурные текстуры,
 * процедурные спрайты и пустой `new World()`, поэтому весь прогон стоит секунды
 * и не требует ни сборки, ни `dist/`.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

/* Прибор обязан укладываться в секунды: замер холодного прогона — 1.7 с на
 * генерацию текстур/спрайтов и все девять программ. Бюджет взят с запасом на
 * старт Chrome и всё равно остаётся на два порядка дешевле `npm run check`. */
const HARNESS_BUDGET_MS = 90000;

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/* Программы ядра линкуются внутри `initWebGL` в фиксированном порядке
 * исходника `webgl.ts`; их константы не экспортированы, поэтому имя берётся из
 * порядка линковки. Последние три — те самые «глотатели», они проверяются ещё и
 * ОТДЕЛЬНО по имени (DIRECT_PASSES): здесь важно, что они поднимаются в живой
 * сборке рендера, а не только сами по себе. Программа сверх списка не
 * пропускается молча — она компилируется наравне со всеми и печатается как
 * безымянная, с требованием вписать её сюда. */
const CORE_PROGRAMS_IN_LINK_ORDER = [
  'raycaster (webgl.ts VERT_SRC/FRAG_SRC)',
  'blit (webgl.ts BLIT_*)',
  'bloom prefilter (webgl.ts BLOOM_PREFILTER_FRAG_SRC)',
  'bloom blur (webgl.ts BLOOM_BLUR_FRAG_SRC)',
  'sprites (webgl.ts SPRITE_*)',
  'particles (webgl.ts PARTICLE_*)',
  'mesh pass в сборке initWebGL (createOptionalMeshPass)',
  'critter pass в сборке initWebGL (createOptionalCritterPass)',
  'viewmodel pass в сборке initWebGL (createOptionalViewmodelPass)',
];

/* Те, чей провал `webgl.ts` гасит в console.warn. Ради них всё и написано. */
const DIRECT_PASSES = [
  ['mesh program', 'createMeshProgram', 'src/render/mesh/shaders.ts'],
  ['mesh pass', 'createMeshPass', 'src/render/mesh/pass.ts'],
  ['critter pass', 'createCritterPass', 'src/render/critters_pass.ts'],
  ['viewmodel pass', 'createViewmodelPass', 'src/render/viewmodel/pass.ts'],
];

/* `--prove[=имя прохода]` — сквозная проверка самого прибора: портит ОДИН
 * настоящий шейдер в памяти (файлы репозитория не трогаются) и прогоняет всё
 * тем же путём — инструментовка, разбор лога, поиск файла, код возврата. Нужен,
 * потому что встроенный самоконтроль работает на синтетическом шейдере и не
 * доказывает, что покраснеет ОТЧЁТ. Ждём ненулевой код: зелень здесь означает,
 * что прибор врёт. */
const proveArg = process.argv.find(a => a === '--prove' || a.startsWith('--prove='));
const proveTarget = proveArg ? (proveArg.split('=')[1] || 'critter pass') : null;

function resolveChrome() {
  const fromEnv = process.env.CHROME_BIN;
  if (fromEnv) {
    if (existsSync(fromEnv)) return fromEnv;
    throw new Error(
      `CHROME_BIN=${fromEnv} указывает на несуществующий файл.\n`
      + 'Поправьте переменную или снимите её, чтобы искать системный Chrome.',
    );
  }
  const found = CHROME_CANDIDATES.find(candidate => existsSync(candidate));
  if (found) return found;
  throw new Error(
    'Chrome/Chromium не найден, а без настоящего драйвера проверять шейдеры нечем.\n'
    + 'Искали:\n' + CHROME_CANDIDATES.map(c => '  ' + c).join('\n') + '\n'
    + 'Поставьте Chrome или укажите путь: CHROME_BIN=/path/to/chrome npm run check:shaders',
  );
}

/* Порт спрашиваем у системы, как это делает smoke: рядом может идти другой
 * гейт, и угаданный номер столкнулся бы с его отладочным портом. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a local TCP port')));
        return;
      }
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
    } catch (err) {
      lastError = err;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(wsUrl) {
    if (typeof WebSocket === 'undefined') throw new Error('Node WebSocket global is unavailable');
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', event => reject(new Error(`CDP websocket error: ${event.message ?? 'unknown'}`)), { once: true });
      this.ws.addEventListener('message', event => {
        const msg = JSON.parse(String(event.data));
        if (!msg.id || !this.pending.has(msg.id)) return;
        const { resolve: res, reject: rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(`${msg.error.message}: ${msg.error.data ?? ''}`));
        else res(msg.result);
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.ws.close(); } catch { /* уже закрыт */ }
  }
}

async function openPage(debugPort, url) {
  const encoded = encodeURIComponent(url);
  const res = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encoded}`, { method: 'PUT' });
  if (res.ok) return res.json();
  const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const page = list.find(p => p.type === 'page');
  if (!page) throw new Error('Chrome did not expose a debuggable page target');
  return page;
}

/* ── Страница-полигон ──────────────────────────────────────────
 * Никаких обратных кавычек и подстановок внутри тела: строка собирается
 * шаблоном, и лишняя кавычка в комментарии порвала бы её молча. */
function buildBrowserEntry() {
  const src = JSON.stringify(root + '/src');
  /* Список проходов — один на весь прибор: из него и импорты, и вызовы, и
   * имена в отчёте. Добавить проход = дописать строку в DIRECT_PASSES. */
  const passImports = DIRECT_PASSES
    .map(([, factory, file]) => `import { ${factory} } from ${JSON.stringify(root + '/' + file.replace(/\.ts$/, ''))};`)
    .join('\n');
  const passChecks = DIRECT_PASSES
    .map(([label, factory]) => `    checkDirect(${JSON.stringify(label)}, ${factory});`)
    .join('\n');
  return `
${passImports}
import { initWebGL } from ${JSON.stringify(root + '/src/render/webgl')};
import { generateTextures } from ${JSON.stringify(root + '/src/render/textures')};
import { generateSprites } from ${JSON.stringify(root + '/src/render/sprites')};
import { World } from ${JSON.stringify(root + '/src/core/world')};

void ${src};

const PROVE = ${JSON.stringify(proveTarget)};
const report = { renderer: '', selfTest: null, direct: [], core: [], skipped: [], fatal: null, prove: PROVE };

function newContext() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  return canvas.getContext('webgl2', { alpha: false, antialias: false });
}

/* Инструментовка: снимаем исходник и лог ДО того, как их проглотит
 * createOptional*Pass. Восстановления не делаем — страница одноразовая. */
const proto = WebGL2RenderingContext.prototype;
const origShaderSource = proto.shaderSource;
const origCompile = proto.compileShader;
const origAttach = proto.attachShader;
const origLink = proto.linkProgram;
const sourceOf = new WeakMap();
const shadersOf = new WeakMap();
let recorder = null;
let proveArmed = false;

/* Ломаем ровно первый шейдер взведённого прохода и ровно в памяти.
 * Ставим порчу в конец main(), а не в шапку: так ошибка приходит из глубины
 * настоящего кода, и виден весь путь разбора, включая поиск файла по соседней
 * строке. Порча в шапке проверяла бы только код возврата. */
function corrupt(source) {
  const lines = String(source).split('\\n');
  let at = lines.length - 1;
  while (at > 0 && lines[at].indexOf('}') < 0) at -= 1;
  if (at <= 0) at = lines.length;
  lines.splice(at, 0, '  float broken = ;');
  return lines.join('\\n');
}

proto.shaderSource = function (shader, source) {
  let text = source;
  if (proveArmed) {
    text = corrupt(text);
    proveArmed = false;
  }
  sourceOf.set(shader, text);
  return origShaderSource.call(this, shader, text);
};
proto.attachShader = function (program, shader) {
  const list = shadersOf.get(program) || [];
  list.push(shader);
  shadersOf.set(program, list);
  return origAttach.call(this, program, shader);
};
proto.compileShader = function (shader) {
  origCompile.call(this, shader);
  if (!recorder) return undefined;
  recorder.compiled += 1;
  if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) {
    recorder.failures.push({
      stage: 'compile',
      log: this.getShaderInfoLog(shader) || 'unknown error',
      source: sourceOf.get(shader) || '',
    });
  }
  return undefined;
};
proto.linkProgram = function (program) {
  origLink.call(this, program);
  if (!recorder) return undefined;
  const index = recorder.linked;
  recorder.linked += 1;
  if (!this.getProgramParameter(program, this.LINK_STATUS)) {
    const attached = shadersOf.get(program) || [];
    recorder.failures.push({
      stage: 'link',
      index: index,
      log: this.getProgramInfoLog(program) || 'unknown error',
      source: attached.map(s => sourceOf.get(s) || '').join('\\n'),
    });
  }
  return undefined;
};

function startRecorder() {
  recorder = { compiled: 0, linked: 0, failures: [] };
  return recorder;
}

/* ── САМОКОНТРОЛЬ ──────────────────────────────────────────────
 * Обе стороны обязательны. Отрицательный контроль ловит вечнозелёный прибор
 * (сломанный Chrome, потерянные флаги ANGLE, контекст-пустышка), положительный
 * ловит прибор, который валит вообще всё и потому тоже ничего не проверяет. */
function selfTest() {
  const gl = newContext();
  if (!gl) return { ok: false, reason: 'WebGL2 контекст не создался — проверять нечем' };
  const compile = function (source) {
    const shader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(shader, source);
    origCompile.call(gl, shader);
    const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    const log = gl.getShaderInfoLog(shader) || '';
    gl.deleteShader(shader);
    return { ok: ok, log: log };
  };
  const good = compile('#version 300 es\\nprecision highp float;\\nout vec4 c;\\nvoid main() { c = vec4(1.0); }\\n');
  const bad = compile('#version 300 es\\nprecision highp float;\\nout vec4 c;\\nvoid main() { float broken = ; c = vec4(1.0); }\\n');
  if (!good.ok) return { ok: false, reason: 'положительный контроль не скомпилировался: ' + good.log };
  if (bad.ok) return { ok: false, reason: 'отрицательный контроль СКОМПИЛИРОВАЛСЯ — драйвер не проверяет GLSL, прибор неисправен' };
  return { ok: true, negativeLog: bad.log.trim() };
}

function checkDirect(label, factory) {
  const gl = newContext();
  if (!gl) {
    report.skipped.push({ name: label, reason: 'WebGL2 контекст не создался' });
    return;
  }
  const rec = startRecorder();
  if (PROVE === label) proveArmed = true;
  try {
    factory(gl);
    report.direct.push({ name: label, ok: rec.failures.length === 0, failures: rec.failures, compiled: rec.compiled });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    report.direct.push({ name: label, ok: false, thrown: message, failures: rec.failures, compiled: rec.compiled });
  } finally {
    recorder = null;
    proveArmed = false;
  }
}

try {
  const probe = newContext();
  report.renderer = probe ? String(probe.getParameter(probe.RENDERER)) : 'нет контекста';

  report.selfTest = selfTest();
  if (report.selfTest.ok) {
${passChecks}

    const gl = newContext();
    if (!gl) {
      report.skipped.push({ name: 'ядро рендера (initWebGL)', reason: 'WebGL2 контекст не создался' });
    } else {
      const rec = startRecorder();
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 200;
        initWebGL(canvas, generateTextures(), generateSprites(), new World());
        report.core = { linked: rec.linked, compiled: rec.compiled, failures: rec.failures, reachedEnd: true };
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        report.core = { linked: rec.linked, compiled: rec.compiled, failures: rec.failures, reachedEnd: false, thrown: message };
      } finally {
        recorder = null;
      }
    }
  }
} catch (error) {
  report.fatal = error && error.stack ? error.stack : String(error);
}

const out = document.createElement('pre');
out.id = 'out';
out.textContent = JSON.stringify(report);
document.body.appendChild(out);
`;
}

async function bundleEntry(workDir) {
  const esbuild = await import('esbuild');
  const entry = path.join(workDir, 'entry.ts');
  const bundle = path.join(workDir, 'bundle.js');
  await writeFile(entry, buildBrowserEntry(), 'utf8');
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    outfile: bundle,
    platform: 'browser',
    target: 'es2020',
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.MODE': '"production"',
    },
  });
  const js = await readFile(bundle, 'utf8');
  const html = path.join(workDir, 'check.html');
  const closing = '</' + 'script>';
  await writeFile(html, '<!doctype html><meta charset="utf-8"><body><script>\n' + js + '\n' + closing + '</body>', 'utf8');
  return html;
}

/* Лог драйвера даёт только номер строки внутри склеенного исходника
 * (ERROR: 0:200: ...). Человеку нужен файл, поэтому ищем эту же строку в
 * src/render — она приедет и из шаблона этажа, и из COMMON_LIGHTING_SRC. */
async function collectRenderSources() {
  const files = [];
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
  };
  await walk(path.join(root, 'src', 'render'));
  const out = [];
  for (const file of files) out.push([file, (await readFile(file, 'utf8')).split('\n')]);
  return out;
}

function describeFailure(failure, sources) {
  const lines = [`      ${failure.log.trim().replace(/\n+/g, '\n      ')}`];
  const match = /\b\d+:(\d+):/.exec(failure.log);
  const glslLines = String(failure.source ?? '').split('\n');
  if (!match) return lines;
  const lineNo = Number(match[1]);
  const offending = glslLines[lineNo - 1];
  if (offending === undefined) return lines;
  lines.push(`      строка GLSL ${lineNo}: ${offending.trim()}`);
  /* Точное совпадение бывает не всегда: строка могла прийти из подстановки
   * (`${'${MAX_DRAW.toFixed(1)}'}`) и в файле выглядит иначе. Тогда поднимаемся вверх до
   * ближайшей опознаваемой строки — она всё равно приводит человека в нужный
   * файл и почти в нужное место. */
  for (let probe = lineNo; probe >= 1 && probe > lineNo - 40; probe--) {
    const needle = (glslLines[probe - 1] ?? '').trim();
    if (needle.length < 4) continue;
    /* Строку принимаем ТОЛЬКО если она единственная на весь src/render.
     * `precision highp float;` есть в каждом шейдере, и по ней прибор уверенно
     * показывал бы на чужой файл — неверный адрес хуже отсутствия адреса. */
    const hits = [];
    for (const [file, fileLines] of sources) {
      for (let i = 0; i < fileLines.length; i++) {
        if (fileLines[i].trim() === needle) hits.push(`${path.relative(root, file)}:${i + 1}`);
        if (hits.length > 1) break;
      }
      if (hits.length > 1) break;
    }
    if (hits.length !== 1) continue;
    lines.push(probe === lineNo
      ? `      источник: ${hits[0]}`
      : `      источник: ${hits[0]} (ближайшая однозначная строка выше по шейдеру)`);
    return lines;
  }
  return lines;
}

async function main() {
  const chromePath = resolveChrome();
  const started = Date.now();
  console.log(`[shaders] Chrome: ${chromePath}`);

  const workDir = await mkdtemp(path.join(os.tmpdir(), 'gigahrush-shaders-'));
  const profileDir = path.join(workDir, 'profile');
  let chrome;
  let client;
  let report;
  try {
    const html = await bundleEntry(workDir);
    const debugPort = await freePort();
    chrome = spawn(chromePath, [
      '--headless=new',
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    chrome.stderr.on('data', data => {
      const text = String(data);
      /* Штатный шум запуска headless на macOS. Ошибки GLSL сюда не попадают:
       * их приносит отчёт страницы, а не stderr браузера. */
      if (/GPU|Fontconfig|dbus|DevTools listening|Passthrough is not|allocator multiple times|mach_port_rendezvous|shared_memory_switch|rendezvous client/i.test(text)) return;
      process.stderr.write(`[chrome] ${text}`);
    });

    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, 20000);
    const page = await openPage(debugPort, `file://${html}`);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    await client.send('Runtime.enable');

    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const res = await client.send('Runtime.evaluate', {
        expression: "document.getElementById('out') ? document.getElementById('out').textContent : ''",
        returnByValue: true,
      });
      const value = res?.result?.value;
      if (value) { report = JSON.parse(value); break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    client?.close();
    chrome?.kill('SIGKILL');
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (!report) {
    console.error('[shaders] ПРОВАЛ ПРИБОРА: страница не отдала отчёт (Chrome не выполнил бандл).');
    return 2;
  }

  console.log(`[shaders] renderer: ${report.renderer}`);

  if (report.fatal) {
    console.error('[shaders] ПРОВАЛ ПРИБОРА: страница упала до проверки:');
    console.error(report.fatal);
    return 2;
  }

  const self = report.selfTest;
  if (!self?.ok) {
    console.error(`[shaders] ПРОВАЛ САМОКОНТРОЛЯ: ${self?.reason ?? 'самоконтроль не отработал'}`);
    console.error('[shaders] Прибор объявляет себя неисправным и НЕ подтверждает шейдеры.');
    return 2;
  }
  console.log('[shaders] самоконтроль: заведомо битый шейдер отвергнут драйвером, годный принят');
  console.log(`[shaders]   отрицательный контроль дал: ${self.negativeLog}`);

  const sources = await collectRenderSources();
  const failures = [];

  for (const entry of report.direct) {
    if (entry.ok) {
      console.log(`[shaders] ok      ${entry.name} (${entry.compiled} шейдеров)`);
      continue;
    }
    console.error(`[shaders] ПРОВАЛ  ${entry.name}`);
    if (entry.thrown) console.error(`      ${entry.thrown}`);
    for (const failure of entry.failures) for (const line of describeFailure(failure, sources)) console.error(line);
    failures.push(entry.name);
  }

  const core = report.core;
  if (!core || core.linked === undefined) {
    console.error('[shaders] ПРОПУЩЕНО ядро рендера — отчёт не собран');
    failures.push('ядро рендера');
  } else {
    for (let i = 0; i < core.linked; i++) {
      const name = CORE_PROGRAMS_IN_LINK_ORDER[i]
        ?? `безымянная программа #${i + 1} (появилась сверх списка — впишите её в CORE_PROGRAMS_IN_LINK_ORDER)`;
      const failed = core.failures.filter(f => f.stage === 'link' && f.index === i);
      if (failed.length === 0) console.log(`[shaders] ok      ${name}`);
      else {
        console.error(`[shaders] ПРОВАЛ  ${name}`);
        for (const failure of failed) for (const line of describeFailure(failure, sources)) console.error(line);
        failures.push(name);
      }
    }
    for (const failure of core.failures.filter(f => f.stage === 'compile')) {
      console.error('[shaders] ПРОВАЛ  компиляция шейдера внутри initWebGL');
      for (const line of describeFailure(failure, sources)) console.error(line);
      failures.push('initWebGL compile');
    }
    if (!core.reachedEnd) {
      const rest = CORE_PROGRAMS_IN_LINK_ORDER.slice(core.linked);
      console.error(`[shaders] initWebGL прервался: ${core.thrown}`);
      for (const name of rest) console.error(`[shaders] ПРОПУЩЕНО ${name} — до неё не дошли, initWebGL упал раньше`);
      if (core.failures.length === 0) failures.push('initWebGL прервался до конца');
    } else if (core.linked < CORE_PROGRAMS_IN_LINK_ORDER.length) {
      /* Проглоченный проход не доходит до линковки, поэтому недостача видна
       * с ХВОСТА списка, а сломан мог быть любой из них: имена после дыры
       * съезжают на одну позицию. Точное место всё равно назовёт разбор
       * провала компиляции выше — там есть файл и номер строки. */
      for (const name of CORE_PROGRAMS_IN_LINK_ORDER.slice(core.linked)) {
        console.error(`[shaders] ПРОПУЩЕНО ${name} — программа не создалась, хотя initWebGL дошёл до конца`);
      }
      console.error('[shaders] порядковые имена выше дыры могли сместиться — верьте разбору провала, а не позиции');
      failures.push('ядро рендера: программ меньше, чем в списке');
    }
  }

  for (const skip of report.skipped) console.error(`[shaders] ПРОПУЩЕНО ${skip.name} — ${skip.reason}`);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (proveTarget) {
    if (failures.length > 0) {
      console.log(`[shaders] --prove: порча «${proveTarget}» замечена, отчёт покраснел как должен — ${seconds}s`);
      console.log('[shaders] --prove: файлы репозитория НЕ менялись, порча была только в памяти');
      return 1;
    }
    console.error(`[shaders] --prove: ПРИБОР НЕИСПРАВЕН — шейдер «${proveTarget}» испорчен, а отчёт зелёный.`);
    console.error('[shaders] --prove: проверьте, что имя прохода совпадает с одним из списка выше.');
    return 2;
  }

  if (failures.length > 0) {
    console.error(`[shaders] ПРОВАЛ: ${failures.length} программ(ы) не собираются — ${seconds}s`);
    return 1;
  }
  console.log(`[shaders] все шейдерные программы src/render компилируются и линкуются — ${seconds}s`);
  return report.skipped.length > 0 ? 1 : 0;
}

const watchdog = setTimeout(() => {
  console.error(`[shaders] ПРОВАЛ ПРИБОРА: не уложились в ${HARNESS_BUDGET_MS} мс.`);
  process.exit(2);
}, HARNESS_BUDGET_MS);
watchdog.unref();

/* Код возврата ставим явно: в цепочке он достаётся последней команде, и
 * молчаливый ноль здесь стоил бы ровно того, ради чего прибор написан. */
try {
  const code = await main();
  clearTimeout(watchdog);
  process.exit(code);
} catch (error) {
  clearTimeout(watchdog);
  console.error(`[shaders] ПРОВАЛ ПРИБОРА: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
