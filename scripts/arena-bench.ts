#!/usr/bin/env tsx
/* ── Безголовый прогон AI-стенда ──────────────────────────────────
 *
 * Гоняет НАСТОЯЩИЙ updateAI на настоящем World без браузера и печатает
 * метрики машинно-читаемо. Детерминирован: фиксированный сид, фиксированный
 * dt, ни одного Math.random и ни одного Date.now в логике (performance.now
 * только измеряет длительность кадра и в решения не попадает).
 *
 * Запуск:
 *   npx tsx scripts/arena-bench.ts --scenario corridor --ticks 1800
 *   npx tsx scripts/arena-bench.ts --all --ticks 1200 --out before.json
 *   npx tsx scripts/arena-bench.ts --scenario furnished --print ascii --window 40x24
 *   npx tsx scripts/arena-bench.ts --scenario corridor --trace first --trace-every 15
 *   npx tsx scripts/arena-bench.ts --scenario floor:outer_district --ticks 600
 *   npx tsx scripts/arena-bench.ts --compare before.json after.json
 *
 * Ключи:
 *   --scenario <id>     corridor|furnished|unreachable|torus_seam|open_field|
 *                       empty_corner|maze|narrow|floor:<designFloorId>
 *   --all               прогнать весь синтетический набор
 *   --ticks N           число тиков (по умолчанию 1800 ≈ 30 c)
 *   --seed N            сид (по умолчанию 1337)
 *   --dt X              шаг симуляции в секундах (по умолчанию 1/60)
 *   --print a,b,c       metrics|ascii|trace|json (по умолчанию metrics)
 *   --window WxH        размер ASCII-окна (по умолчанию 64x28)
 *   --at x,y            центр ASCII-окна; по умолчанию центр сцены
 *   --ascii-at N        тик, на котором снять ASCII (можно повторять)
 *   --trace <id|first>  трассировать актора
 *   --trace-every N     печатать каждую N-ю строку трассы (по умолчанию 10)
 *   --json-at N         тик JSON-снимка (можно повторять)
 *   --out file.json     сохранить сводку метрик
 *   --fake-separation   включить расталкивание тел САМИМ стендом (по умолчанию
 *                       выключено: игра расталкивает акторов внутри followPath,
 *                       и второй расталкиватель прячет реальное кучкование)
 *   --compare a b       напечатать дельту двух сохранённых сводок
 */

import fs from 'node:fs';
import '../src/content';
import { EntityType, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { updateAI, getAiStats } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { updatePerceptionFields } from '../src/systems/fields';
import { ensureAlifeState } from '../src/systems/alife';
import { ArenaMetrics, formatReport, type ArenaReport } from '../src/arena_metrics';
import {
  ARENA_SCENARIOS, buildScenario, stepDriver, isWalkableCell,
  createArenaGameState, type ArenaScene,
} from '../src/arena_scenarios';
import { ActorTracer, dumpAscii, snapshotActors, ASCII_LEGEND } from '../src/arena_dump';

/* ── Разбор аргументов ──────────────────────────────────────────── */

function parseArgs(argv: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let key = '';
  for (const raw of argv) {
    if (raw.startsWith('--')) {
      key = raw.slice(2);
      if (!out.has(key)) out.set(key, []);
      const eq = key.indexOf('=');
      if (eq > 0) {
        const k = key.slice(0, eq);
        out.delete(key);
        key = k;
        if (!out.has(k)) out.set(k, []);
        out.get(k)!.push(raw.slice(2 + eq + 1));
      }
      continue;
    }
    if (key) out.get(key)!.push(raw);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const has = (k: string) => args.has(k);
const one = (k: string, d: string) => args.get(k)?.[0] ?? d;
const num = (k: string, d: number) => { const v = Number(args.get(k)?.[0]); return Number.isFinite(v) ? v : d; };
const list = (k: string) => (args.get(k) ?? []).flatMap(v => v.split(',')).filter(Boolean);

/* ── Сравнение двух сводок ──────────────────────────────────────── */

function flatten(r: ArenaReport): Record<string, number> {
  return {
    'npc.stuck%': r.npc.stuckFrac * 100,
    'npc.longStuck%': r.npc.longStuckFrac * 100,
    'npc.stranded%': r.npc.strandedFrac * 100,
    'npc.repathHz': r.npc.repathHz,
    'npc.repathSameHz': r.npc.repathSameTargetHz,
    'npc.failHz': r.npc.failHz,
    'npc.worstRepathHz': r.npc.worstRepathHz,
    'npc.lossPerMin': r.npc.targetLossPerMin,
    'npc.switchPerMin': r.npc.targetSwitchPerMin,
    'npc.stale%': r.npc.staleTargetFrac * 100,
    'npc.blind%': r.npc.blindFrac * 100,
    'mon.stuck%': r.monster.stuckFrac * 100,
    'mon.longStuck%': r.monster.longStuckFrac * 100,
    'mon.stranded%': r.monster.strandedFrac * 100,
    'mon.repathHz': r.monster.repathHz,
    'mon.repathSameHz': r.monster.repathSameTargetHz,
    'mon.failHz': r.monster.failHz,
    'mon.lossPerMin': r.monster.targetLossPerMin,
    'mon.switchPerMin': r.monster.targetSwitchPerMin,
    'mon.stale%': r.monster.staleTargetFrac * 100,
    'mon.blind%': r.monster.blindFrac * 100,
    'clump.meanNeighbors': r.cluster.meanNeighbors,
    'clump.index': r.cluster.clumpIndex,
    'clump.overlap%': r.cluster.overlapFrac * 100,
    'clump.maxPerCell': r.cluster.maxPerCell,
    'aniso.axisBias': r.aniso.axisBias,
    'aniso.chi2PerStep': r.aniso.chi2PerStep,
    'ai.meanMs': r.aiMs.mean,
    'ai.p95Ms': r.aiMs.p95,
    'driverOverridesPerMin': r.driverOverridesPerMin,
  };
}

function compare(pathA: string, pathB: string): void {
  const load = (p: string): ArenaReport[] => {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(raw) ? raw : [raw];
  };
  const a = new Map(load(pathA).map(r => [r.scenario, r]));
  const b = new Map(load(pathB).map(r => [r.scenario, r]));
  console.log(`Сравнение: A=${pathA}  B=${pathB}\n`);
  for (const [name, ra] of a) {
    const rb = b.get(name);
    if (!rb) { console.log(`── ${name}: только в A`); continue; }
    console.log(`── ${name}`);
    const fa = flatten(ra);
    const fb = flatten(rb);
    for (const key of Object.keys(fa)) {
      const va = fa[key];
      const vb = fb[key];
      const d = vb - va;
      if (Math.abs(d) < 1e-9) continue;
      const pct = Math.abs(va) > 1e-9 ? ` (${d > 0 ? '+' : ''}${((d / Math.abs(va)) * 100).toFixed(1)}%)` : '';
      console.log(`  ${key.padEnd(24)} ${va.toFixed(3).padStart(10)} → ${vb.toFixed(3).padStart(10)}  ${(d > 0 ? '+' : '') + d.toFixed(3)}${pct}`);
    }
  }
  for (const name of b.keys()) if (!a.has(name)) console.log(`── ${name}: только в B`);
}

/* ── Прогон одной сцены ─────────────────────────────────────────── */

interface RunOpts {
  scenario: string;
  seed: number;
  ticks: number;
  dt: number;
  print: Set<string>;
  winW: number;
  winH: number;
  atX?: number;
  atY?: number;
  asciiAt: number[];
  jsonAt: number[];
  traceId: string;
  traceEvery: number;
  fakeSeparation: boolean;
}

/** Расталкивание, которое делал сам стенд. Игра делает его внутри followPath,
 *  поэтому по умолчанию выключено — иначе меряешь стенд, а не игру. */
function fakeSeparation(scene: ArenaScene): void {
  const es = scene.entities;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (!e.ai || !e.alive) continue;
    for (let j = i + 1; j < es.length; j++) {
      const o = es[j];
      if (!o.alive || !o.ai) continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const d2 = dx * dx + dy * dy;
      const r = (e.radius ?? 0.18) + (o.radius ?? 0.18);
      if (d2 <= 0 || d2 >= r * r) continue;
      const d = Math.sqrt(d2);
      const push = (r - d) * 0.5;
      e.x += (dx / d) * push; e.y += (dy / d) * push;
      o.x -= (dx / d) * push; o.y -= (dy / d) * push;
    }
  }
}

function run(opts: RunOpts): ArenaReport {
  seedGlobalRng(opts.seed);
  const scene = buildScenario(opts.scenario, opts.seed);
  const state: GameState = createArenaGameState();
  ensureAlifeState(state);
  seedGlobalRng(opts.seed);

  const metrics = new ArenaMetrics(opts.scenario, opts.seed);
  metrics.measureWalkable(scene.world, isWalkableCell);
  if (!opts.fakeSeparation) metrics.note('расталкивание стенда выключено — меряется собственная сепарация игры');

  let traceId = -1;
  if (opts.traceId) {
    if (opts.traceId === 'first') {
      const first = scene.entities.find(e => e.alive && e.ai && (e.type === EntityType.NPC || e.type === EntityType.MONSTER));
      traceId = first?.id ?? -1;
    } else traceId = Number(opts.traceId);
  }
  const tracer = traceId > 0 ? new ActorTracer(traceId) : null;

  const msgs: unknown[] = [];
  let simTime = 0;
  const camX = opts.atX ?? scene.camX;
  const camY = opts.atY ?? scene.camY;

  if (opts.print.has('ascii') && opts.asciiAt.length === 0) opts.asciiAt.push(0, opts.ticks);

  for (let tick = 0; tick <= opts.ticks; tick++) {
    if (opts.asciiAt.includes(tick)) {
      console.log(`\n[ASCII тик ${tick}, t=${simTime.toFixed(1)}c] ${scene.title}`);
      console.log(dumpAscii(scene.world, scene.entities, { cx: camX, cy: camY, w: opts.winW, h: opts.winH, focusId: traceId > 0 ? traceId : undefined }));
    }
    if (opts.jsonAt.includes(tick)) {
      console.log(`\n[JSON тик ${tick}]`);
      console.log(JSON.stringify(snapshotActors(scene.entities, tick, simTime, true)));
    }
    if (tick === opts.ticks) break;

    stepDriver(scene, opts.dt, metrics);
    rebuildEntityIndexForSimulation(scene.entities, tick);
    // Тот же порядок, что в main.ts. Без этого такта поля восприятия стоят
    // пустыми, и любой полевой драйв в замере МОЛЧА инертен: числа выглядят
    // честными, а половина поведения просто не работает.
    updatePerceptionFields(scene.world, opts.dt);
    const t0 = performance.now();
    updateAI(
      scene.world, scene.entities, opts.dt, simTime, msgs as never[], 0,
      state.clock, false, scene.nextId, 0, state,
    );
    const aiMs = performance.now() - t0;
    if (opts.fakeSeparation) fakeSeparation(scene);
    simTime += opts.dt;
    state.time = simTime;
    metrics.observe(scene.world, scene.entities, opts.dt, aiMs);
    tracer?.sample(scene.world, scene.entities, tick, simTime);
    if (scene.entities.some(e => !e.alive)) scene.entities = scene.entities.filter(e => e.alive);
  }

  const ai = getAiStats();
  metrics.note(`updateAI последний кадр: liveAi=${ai.liveAi} updated=${ai.updated} skipped=${ai.skipped}`);
  const report = metrics.report(scene.entities);
  if (opts.print.has('metrics')) console.log(formatReport(report));
  if (tracer && opts.print.has('trace')) {
    console.log(`\n[Трасса актора ${traceId}, каждая ${opts.traceEvery}-я строка]`);
    console.log(tracer.format(opts.traceEvery));
  }
  return report;
}

/* ── main ───────────────────────────────────────────────────────── */

if (has('compare')) {
  const [a, b] = args.get('compare')!;
  if (!a || !b) { console.error('--compare требует два файла'); process.exit(1); }
  compare(a, b);
} else {
  const winSpec = one('window', '64x28').split('x');
  const at = has('at') ? one('at', '').split(',').map(Number) : [];
  const print = new Set(list('print').length > 0 ? list('print') : ['metrics']);
  if (has('trace') && !print.has('trace')) print.add('trace');
  const base: Omit<RunOpts, 'scenario'> = {
    seed: num('seed', 1337),
    ticks: Math.max(1, Math.floor(num('ticks', 1800))),
    dt: num('dt', 1 / 60),
    print,
    winW: Math.max(4, Number(winSpec[0]) || 64),
    winH: Math.max(4, Number(winSpec[1]) || 28),
    atX: Number.isFinite(at[0]) ? at[0] : undefined,
    atY: Number.isFinite(at[1]) ? at[1] : undefined,
    asciiAt: list('ascii-at').map(Number).filter(Number.isFinite),
    jsonAt: list('json-at').map(Number).filter(Number.isFinite),
    traceId: one('trace', ''),
    traceEvery: Math.max(1, Math.floor(num('trace-every', 10))),
    fakeSeparation: has('fake-separation'),
  };

  const scenarios = has('all')
    ? ARENA_SCENARIOS.map(s => s.id)
    : [one('scenario', 'corridor')];

  if (print.has('ascii')) console.log(`Легенда: ${ASCII_LEGEND}`);
  const reports: ArenaReport[] = [];
  for (const id of scenarios) {
    reports.push(run({ ...base, scenario: id, asciiAt: [...base.asciiAt], jsonAt: [...base.jsonAt] }));
    if (scenarios.length > 1) console.log('');
  }
  if (has('out')) {
    const file = one('out', 'arena-report.json');
    fs.writeFileSync(file, JSON.stringify(reports, null, 2));
    console.log(`Сводка сохранена: ${file}`);
  }
  if (print.has('json') && !has('json-at')) console.log(JSON.stringify(reports));
}
