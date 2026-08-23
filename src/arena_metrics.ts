/* ── AI-стенд: измерительный прибор ───────────────────────────────
 *
 * Dev-only. Считает поведение НАСТОЯЩЕГО updateAI снаружи, наблюдая за
 * состоянием сущностей между тиками: ни одного хука в systems/ не добавлено.
 * Один и тот же наблюдатель питает и панель в arena.html, и безголовый
 * прогон scripts/arena-bench.ts, поэтому числа из браузера и из консоли
 * сравнимы напрямую.
 *
 * Всё, что здесь считается, выводится из четырёх наблюдаемых величин:
 * позиция актора, его ai.path/ai.pi/ai.tx/ai.ty, ai.combatTargetId и
 * время, потраченное на updateAI. Никакой Math.random, никакого Date.now
 * в логике — замер обязан воспроизводиться тик в тик.
 */

import { EntityType, type Entity } from './core/types';
import type { World } from './core/world';

/* Радиус «соседства» для плотности. Клетка — метр, тело актора ≈ 0.36 м;
 * полтора метра — это дистанция, на которой толпа уже мешает друг другу
 * ходить, но ещё не обязана пересекаться телами. */
const NEIGHBOR_R = 1.5;
const NEIGHBOR_R2 = NEIGHBOR_R * NEIGHBOR_R;
/* Радиус тела по умолчанию — как в стенде и в рендере. */
const DEFAULT_BODY_R = 0.18;
/* Кучкование меряем не каждый кадр: пространственная статистика на 60 Гц
 * это тот же перебор пар, только в шестьдесят раз дороже, а сигнал у неё
 * медленный. Четыре замера в секунду достаточно. */
const CLUSTER_SAMPLE_SEC = 0.25;
/* Окно оценки застревания. Медленный NPC (1.2 м/с) за секунду обязан
 * пройти заметно больше порога, даже уклоняясь и обходя. */
const STUCK_WINDOW_SEC = 1.0;
const STUCK_PROGRESS = 0.25;
/* Сколько окон подряд без продвижения считаем «залип насмерть». */
const STUCK_LONG_WINDOWS = 5;
/* Дальность, на которой отсутствие боевой цели при живом враге — дефект. */
const ENGAGE_R = 12;
const ENGAGE_R2 = ENGAGE_R * ENGAGE_R;
/* Шаг, ниже которого движение считаем шумом коллизий, а не ходьбой. */
const MOVE_EPS = 0.004;
/* Цель считается «той же», если сдвинулась меньше чем на полклетки. */
const SAME_TARGET_EPS2 = 0.25;
/* Актор «дошёл», если он ближе этого к назначенной цели. */
const ARRIVE_R = 1.0;
/* Потолок хранимых выборок времени кадра — перцентили считаются по ним. */
const MS_SAMPLE_CAP = 4096;

export const RHUMB_LABELS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'] as const;

interface Track {
  x: number;
  y: number;
  pathRef: readonly number[] | null;
  tx: number;
  ty: number;
  combatTargetId: number | undefined;
  winX: number;
  winY: number;
  winT: number;
  stuckStreak: number;
  assigns: number;
  blindT: number;
  aliveT: number;
  monster: boolean;
}

interface SideCounters {
  tryingWindows: number;
  stuckWindows: number;
  longStuckWindows: number;
  actorTicks: number;
  strandedTicks: number;
  assigns: number;
  sameTargetAssigns: number;
  failAssigns: number;
  targetLosses: number;
  targetSwitches: number;
  staleTargetTicks: number;
  blindSeconds: number;
  engagedSeconds: number;
  /* Рекорд худшего актора переживает его смерть: трек убитого удаляется,
   * и без этого доказательство ежекадровой пересборки исчезало вместе с ним. */
  worstHz: number;
  worstId: number;
}

function freshSide(): SideCounters {
  return {
    tryingWindows: 0,
    stuckWindows: 0,
    longStuckWindows: 0,
    actorTicks: 0,
    strandedTicks: 0,
    assigns: 0,
    sameTargetAssigns: 0,
    failAssigns: 0,
    targetLosses: 0,
    targetSwitches: 0,
    staleTargetTicks: 0,
    blindSeconds: 0,
    engagedSeconds: 0,
    worstHz: 0,
    worstId: -1,
  };
}

export interface SideReport {
  actors: number;
  /** доля окон без продвижения среди окон, где актор ВЁЛСЯ по маршруту */
  stuckFrac: number;
  /** доля окон, где актор стоит уже STUCK_LONG_WINDOWS окон подряд */
  longStuckFrac: number;
  /** доля тиков, где у актора есть цель дальше ARRIVE_R, а маршрута нет */
  strandedFrac: number;
  /** назначений маршрута на актора в секунду */
  repathHz: number;
  /** из них — на ТУ ЖЕ цель (подозрение на пересборку каждый кадр) */
  repathSameTargetHz: number;
  /** маршрут обнулён при живой далёкой цели — прокси «поиск вернул not_found» */
  failHz: number;
  /** худший актор сценария, назначений в секунду */
  worstRepathHz: number;
  /** id худшего актора — его и надо трассировать */
  worstRepathId: number;
  /** потерь боевой цели (была → нет) на актора в минуту */
  targetLossPerMin: number;
  /** смен боевой цели (была → другая) на актора в минуту */
  targetSwitchPerMin: number;
  /** доля тиков, где боевая цель указывает на мёртвого/исчезнувшего */
  staleTargetFrac: number;
  /** доля времени без боевой цели при живом враге в пределах ENGAGE_R */
  blindFrac: number;
}

export interface ClusterReport {
  /** среднее число соседей в NEIGHBOR_R */
  meanNeighbors: number;
  /** 95-й процентиль числа соседей */
  p95Neighbors: number;
  /** meanNeighbors / ожидание при равномерном разбросе по проходимой площади */
  clumpIndex: number;
  /** доля акторов, чьи тела пересекаются с чужим */
  overlapFrac: number;
  /** максимум акторов в одной клетке за прогон */
  maxPerCell: number;
  /** средний максимум акторов в клетке по выборкам */
  meanMaxPerCell: number;
}

export interface AnisoReport {
  /** доли шагов по восьми румбам, сумма 1 */
  hist: number[];
  /** (доля шагов по осям) / (доля шагов по диагоналям); 1.0 = изотропно */
  axisBias: number;
  /** χ² отклонения гистограммы от плоской, нормированный на число шагов */
  chi2PerStep: number;
  steps: number;
}

export interface ArenaReport {
  scenario: string;
  seed: number;
  ticks: number;
  simSeconds: number;
  liveActors: number;
  npc: SideReport;
  monster: SideReport;
  cluster: ClusterReport;
  aniso: AnisoReport;
  aiMs: { mean: number; p50: number; p95: number; max: number };
  driverOverridesPerMin: number;
  notes: string[];
}

export class ArenaMetrics {
  private tracks = new Map<number, Track>();
  private npc = freshSide();
  private mon = freshSide();
  private hist = new Array<number>(8).fill(0);
  private steps = 0;
  private msSamples: number[] = [];
  private msMax = 0;
  private msSum = 0;
  private msCount = 0;
  private clusterAcc = { samples: 0, neighborSum: 0, neighborCount: 0, overlap: 0, actors: 0, maxCellSum: 0 };
  private neighborHist: number[] = [];
  private maxPerCell = 0;
  private walkableCells = 0;
  private simSeconds = 0;
  private ticks = 0;
  private clusterTimer = 0;
  private liveActors = 0;
  private driverOverrides = 0;
  readonly notes: string[] = [];

  constructor(private scenario: string, private seed: number) {}

  /** Проходимая площадь нужна как знаменатель индекса кучкования. */
  measureWalkable(world: World, isWalkable: (cell: number) => boolean): void {
    let n = 0;
    for (let i = 0; i < world.cells.length; i++) if (isWalkable(world.cells[i])) n++;
    this.walkableCells = Math.max(1, n);
  }

  noteDriverOverride(): void {
    this.driverOverrides++;
  }

  note(line: string): void {
    if (this.notes.length < 32) this.notes.push(line);
  }

  observe(world: World, entities: readonly Entity[], dt: number, aiMs: number): void {
    this.ticks++;
    this.simSeconds += dt;
    this.recordAiMs(aiMs);

    const actors: Entity[] = [];
    for (const e of entities) {
      if (!e.alive || !e.ai) continue;
      if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
      actors.push(e);
    }
    this.liveActors = actors.length;

    for (const e of actors) this.observeActor(world, actors, e, dt);
    this.pruneDead(actors);

    this.clusterTimer += dt;
    if (this.clusterTimer >= CLUSTER_SAMPLE_SEC) {
      this.clusterTimer = 0;
      this.sampleCluster(world, actors);
    }
  }

  private recordAiMs(ms: number): void {
    if (!(ms >= 0)) return;
    this.msSum += ms;
    this.msCount++;
    if (ms > this.msMax) this.msMax = ms;
    if (this.msSamples.length < MS_SAMPLE_CAP) this.msSamples.push(ms);
  }

  private side(e: Entity): SideCounters {
    return e.type === EntityType.MONSTER ? this.mon : this.npc;
  }

  private observeActor(world: World, actors: readonly Entity[], e: Entity, dt: number): void {
    const ai = e.ai!;
    const side = this.side(e);
    let t = this.tracks.get(e.id);
    if (!t) {
      t = {
        x: e.x, y: e.y, pathRef: ai.path, tx: ai.tx, ty: ai.ty,
        combatTargetId: ai.combatTargetId,
        winX: e.x, winY: e.y, winT: 0, stuckStreak: 0,
        assigns: 0, blindT: 0, aliveT: 0,
        monster: e.type === EntityType.MONSTER,
      };
      this.tracks.set(e.id, t);
      return;
    }

    side.actorTicks++;
    t.aliveT += dt;

    this.observeStep(world, e, t);
    this.observePathing(world, e, ai, t, side);
    this.observeCombat(world, actors, e, t, side, dt);
    this.observeStuck(world, ai, e, t, side, dt);

    t.x = e.x;
    t.y = e.y;
  }

  /** Румб фактического шага — гистограмма должна быть плоской в открытом мире. */
  private observeStep(world: World, e: Entity, t: Track): void {
    const dx = world.delta(t.x, e.x);
    const dy = world.delta(t.y, e.y);
    if (dx * dx + dy * dy <= MOVE_EPS * MOVE_EPS) return;
    const a = Math.atan2(dy, dx);
    let bin = Math.round((a / (Math.PI * 2)) * 8);
    bin = ((bin % 8) + 8) % 8;
    this.hist[bin]++;
    this.steps++;
  }

  /* Назначение маршрута видно как СМЕНА самого массива ai.path: и удачное
   * (`ai.path = path`), и провальное (`ai.path = []`) присваивают НОВЫЙ
   * массив. Провал отличаем по тому, что цель осталась далеко: у дошедшего
   * маршрут тоже обнуляется, но он уже стоит на цели. */
  private observePathing(world: World, e: Entity, ai: Entity['ai'] & object, t: Track, side: SideCounters): void {
    const sameTarget = world.dist2(t.tx, t.ty, ai.tx, ai.ty) <= SAME_TARGET_EPS2;
    if (ai.path !== t.pathRef) {
      if (ai.path.length > 0) {
        side.assigns++;
        t.assigns++;
        if (sameTarget) side.sameTargetAssigns++;
      } else if (world.dist2(e.x, e.y, ai.tx, ai.ty) > ARRIVE_R * ARRIVE_R) {
        side.failAssigns++;
      }
    }
    t.pathRef = ai.path;
    t.tx = ai.tx;
    t.ty = ai.ty;
  }

  private observeCombat(
    world: World, actors: readonly Entity[], e: Entity, t: Track, side: SideCounters, dt: number,
  ): void {
    const ai = e.ai!;
    const prev = t.combatTargetId;
    const now = ai.combatTargetId;
    if (prev !== undefined && now === undefined) side.targetLosses++;
    else if (prev !== undefined && now !== undefined && prev !== now) side.targetSwitches++;
    t.combatTargetId = now;

    let hostileNear = false;
    let targetAlive = now === undefined;
    for (const other of actors) {
      if (other === e || !other.alive) continue;
      if (other.id === now) targetAlive = true;
      // NPC ↔ MONSTER — единственная вражда, гарантированная в синтетической сцене
      if (other.type !== e.type && world.dist2(e.x, e.y, other.x, other.y) <= ENGAGE_R2) hostileNear = true;
    }
    if (!targetAlive) side.staleTargetTicks++;
    if (!hostileNear) return;
    side.engagedSeconds += dt;
    if (now === undefined) side.blindSeconds += dt;
  }

  /** Застревание: окно времени без продвижения при живом маршруте. */
  private observeStuck(
    world: World, ai: Entity['ai'] & object, e: Entity, t: Track, side: SideCounters, dt: number,
  ): void {
    const routed = ai.path.length > 0 && ai.pi < ai.path.length;
    const arrived = world.dist2(e.x, e.y, ai.tx, ai.ty) <= ARRIVE_R * ARRIVE_R;
    if (!routed && !arrived) side.strandedTicks++;

    t.winT += dt;
    if (t.winT < STUCK_WINDOW_SEC) return;
    const moved = Math.sqrt(world.dist2(t.winX, t.winY, e.x, e.y));
    if (routed && !arrived) {
      side.tryingWindows++;
      if (moved < STUCK_PROGRESS) {
        side.stuckWindows++;
        t.stuckStreak++;
        if (t.stuckStreak >= STUCK_LONG_WINDOWS) side.longStuckWindows++;
      } else {
        t.stuckStreak = 0;
      }
    } else {
      t.stuckStreak = 0;
    }
    t.winT = 0;
    t.winX = e.x;
    t.winY = e.y;
  }

  private pruneDead(actors: readonly Entity[]): void {
    if (this.tracks.size <= actors.length) return;
    const live = new Set<number>();
    for (const e of actors) live.add(e.id);
    for (const [id, t] of [...this.tracks]) {
      if (live.has(id)) continue;
      this.foldWorst(t.monster ? this.mon : this.npc, id, t);
      this.tracks.delete(id);
    }
  }

  private foldWorst(side: SideCounters, id: number, t: Track): void {
    if (t.aliveT < 1) return;
    const hz = t.assigns / t.aliveT;
    if (hz > side.worstHz) { side.worstHz = hz; side.worstId = id; }
  }

  private sampleCluster(world: World, actors: readonly Entity[]): void {
    if (actors.length === 0) return;
    const acc = this.clusterAcc;
    acc.samples++;
    acc.actors += actors.length;
    const perCell = new Map<number, number>();
    let localMax = 0;
    for (let i = 0; i < actors.length; i++) {
      const e = actors[i];
      const ci = world.idx(Math.floor(e.x), Math.floor(e.y));
      const n = (perCell.get(ci) ?? 0) + 1;
      perCell.set(ci, n);
      if (n > localMax) localMax = n;

      let neighbors = 0;
      let overlapped = false;
      const rEi = e.radius ?? DEFAULT_BODY_R;
      for (let j = 0; j < actors.length; j++) {
        if (j === i) continue;
        const o = actors[j];
        const d2 = world.dist2(e.x, e.y, o.x, o.y);
        if (d2 <= NEIGHBOR_R2) neighbors++;
        const rr = rEi + (o.radius ?? DEFAULT_BODY_R);
        if (d2 < rr * rr) overlapped = true;
      }
      acc.neighborSum += neighbors;
      acc.neighborCount++;
      if (this.neighborHist.length < MS_SAMPLE_CAP * 8) this.neighborHist.push(neighbors);
      if (overlapped) acc.overlap++;
    }
    acc.maxCellSum += localMax;
    if (localMax > this.maxPerCell) this.maxPerCell = localMax;
  }

  private sideReport(side: SideCounters, actors: number, monster: boolean): SideReport {
    const actorSeconds = Math.max(1e-6, side.actorTicks * (this.simSeconds / Math.max(1, this.ticks)));
    for (const [id, t] of this.tracks) {
      if (t.monster !== monster) continue;
      this.foldWorst(side, id, t);
    }
    const worst = side.worstHz;
    const worstId = side.worstId;
    return {
      actors,
      stuckFrac: side.tryingWindows > 0 ? side.stuckWindows / side.tryingWindows : 0,
      longStuckFrac: side.tryingWindows > 0 ? side.longStuckWindows / side.tryingWindows : 0,
      strandedFrac: side.actorTicks > 0 ? side.strandedTicks / side.actorTicks : 0,
      repathHz: side.assigns / actorSeconds,
      repathSameTargetHz: side.sameTargetAssigns / actorSeconds,
      failHz: side.failAssigns / actorSeconds,
      worstRepathHz: worst,
      worstRepathId: worstId,
      targetLossPerMin: (side.targetLosses / actorSeconds) * 60,
      targetSwitchPerMin: (side.targetSwitches / actorSeconds) * 60,
      staleTargetFrac: side.actorTicks > 0 ? side.staleTargetTicks / side.actorTicks : 0,
      blindFrac: side.engagedSeconds > 0 ? side.blindSeconds / side.engagedSeconds : 0,
    };
  }

  report(entities: readonly Entity[]): ArenaReport {
    let npcCount = 0;
    let monCount = 0;
    for (const e of entities) {
      if (!e.alive || !e.ai) continue;
      if (e.type === EntityType.NPC) npcCount++;
      else if (e.type === EntityType.MONSTER) monCount++;
    }
    const acc = this.clusterAcc;
    const meanActors = acc.samples > 0 ? acc.actors / acc.samples : 0;
    const meanNeighbors = acc.neighborCount > 0 ? acc.neighborSum / acc.neighborCount : 0;
    // Ожидание для равномерного разброса по проходимой площади: (n-1)·πr²/S.
    const expected = Math.max(1e-9, (meanActors - 1) * Math.PI * NEIGHBOR_R2 / this.walkableCells);
    const sortedN = [...this.neighborHist].sort((a, b) => a - b);
    const sortedMs = [...this.msSamples].sort((a, b) => a - b);
    const pick = (arr: number[], q: number) => (arr.length === 0 ? 0 : arr[Math.min(arr.length - 1, Math.floor(arr.length * q))]);

    const total = Math.max(1, this.steps);
    const hist = this.hist.map(v => v / total);
    const axes = hist[0] + hist[2] + hist[4] + hist[6];
    const diags = hist[1] + hist[3] + hist[5] + hist[7];
    let chi2 = 0;
    for (const v of this.hist) {
      const exp = total / 8;
      chi2 += ((v - exp) ** 2) / exp;
    }

    return {
      scenario: this.scenario,
      seed: this.seed,
      ticks: this.ticks,
      simSeconds: this.simSeconds,
      liveActors: this.liveActors,
      npc: this.sideReport(this.npc, npcCount, false),
      monster: this.sideReport(this.mon, monCount, true),
      cluster: {
        meanNeighbors,
        p95Neighbors: pick(sortedN, 0.95),
        clumpIndex: meanNeighbors / expected,
        overlapFrac: acc.neighborCount > 0 ? acc.overlap / acc.neighborCount : 0,
        maxPerCell: this.maxPerCell,
        meanMaxPerCell: acc.samples > 0 ? acc.maxCellSum / acc.samples : 0,
      },
      aniso: {
        hist,
        axisBias: diags > 0 ? axes / diags : 0,
        chi2PerStep: chi2 / total,
        steps: this.steps,
      },
      aiMs: {
        mean: this.msCount > 0 ? this.msSum / this.msCount : 0,
        p50: pick(sortedMs, 0.5),
        p95: pick(sortedMs, 0.95),
        max: this.msMax,
      },
      driverOverridesPerMin: this.simSeconds > 0 ? (this.driverOverrides / this.simSeconds) * 60 : 0,
      notes: [...this.notes],
    };
  }
}

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

function sideLine(label: string, s: SideReport): string {
  if (s.actors === 0) return `  ${label.padEnd(8)} —`;
  return `  ${label.padEnd(8)} n=${String(s.actors).padStart(3)}  застряло ${f(s.stuckFrac * 100, 1)}%`
    + ` (насмерть ${f(s.longStuckFrac * 100, 1)}%)  без маршрута ${f(s.strandedFrac * 100, 1)}%`
    + `  путь ${f(s.repathHz)}/с (та же цель ${f(s.repathSameTargetHz)}/с, худший ${f(s.worstRepathHz)}/с у #${s.worstRepathId})`
    + `  провалов ${f(s.failHz)}/с\n`
    + `  ${' '.repeat(8)} бой: потерь ${f(s.targetLossPerMin, 1)}/мин, смен ${f(s.targetSwitchPerMin, 1)}/мин,`
    + ` мёртвая цель ${f(s.staleTargetFrac * 100, 1)}%, слепота ${f(s.blindFrac * 100, 1)}%`;
}

/** Человеческая сводка — та же, что печатает безголовый прогон и панель стенда. */
export function formatReport(r: ArenaReport): string {
  const lines: string[] = [];
  lines.push(`── ${r.scenario} (seed ${r.seed}) ──`);
  lines.push(`  тиков ${r.ticks}, сим ${f(r.simSeconds, 1)} с, живых акторов ${r.liveActors}`);
  lines.push(sideLine('NPC', r.npc));
  lines.push(sideLine('монстры', r.monster));
  lines.push(`  кучкование: соседей ${f(r.cluster.meanNeighbors)} (p95 ${r.cluster.p95Neighbors}),`
    + ` индекс ${f(r.cluster.clumpIndex, 1)}×, пересечений тел ${f(r.cluster.overlapFrac * 100, 1)}%,`
    + ` макс в клетке ${r.cluster.maxPerCell} (среднее ${f(r.cluster.meanMaxPerCell)})`);
  lines.push(`  анизотропия: ось/диагональ ${f(r.aniso.axisBias)}, χ²/шаг ${f(r.aniso.chi2PerStep, 4)}, шагов ${r.aniso.steps}`);
  lines.push(`    ${RHUMB_LABELS.map((l, i) => `${l} ${f(r.aniso.hist[i] * 100, 1)}%`).join('  ')}`);
  lines.push(`  кадр updateAI: сред ${f(r.aiMs.mean, 3)} мс, p50 ${f(r.aiMs.p50, 3)}, p95 ${f(r.aiMs.p95, 3)}, макс ${f(r.aiMs.max, 3)}`);
  lines.push(`  перехватов цели у драйвера: ${f(r.driverOverridesPerMin, 1)}/мин`);
  for (const n of r.notes) lines.push(`  ! ${n}`);
  return lines.join('\n');
}
