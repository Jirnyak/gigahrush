/* ── AI-стенд: текстовое зрение ───────────────────────────────────
 *
 * Dev-only. Агент не видит канвас, поэтому мир и решения акторов должны
 * читаться текстом: ASCII-окно карты, потиковая трассировка одного актора
 * и JSON-снимок состояния для программного сравнения двух прогонов.
 *
 * Модуль только ЧИТАЕТ мир и сущности — ничего не мутирует.
 */

import { Cell, AIGoal, NpcState, EntityType, W, type Entity } from './core/types';
import type { World } from './core/world';
import { getPathBlockerRow, PATH_BLOCKER_SUBDIV } from './core/path_blockers';

const CELL_GLYPH: Record<number, string> = {
  [Cell.FLOOR]: '.',
  [Cell.WALL]: '#',
  [Cell.DOOR]: '+',
  [Cell.ABYSS]: ':',
  [Cell.LIFT]: 'L',
  [Cell.WATER]: '~',
};

export interface DumpWindow {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** id актора, который рисуется как @ и вокруг которого центрируется окно */
  focusId?: number;
}

export const ASCII_LEGEND =
  '# стена  . пол  + дверь  L лифт  ~ вода  : пропасть  '
  + 'x подклеточный блокер  X клетка забита блокерами  '
  + 'N житель  M монстр  @ трассируемый  * его цель';

function blockerGlyph(world: World, ci: number): string | null {
  let bits = 0;
  for (let r = 0; r < PATH_BLOCKER_SUBDIV; r++) {
    const row = getPathBlockerRow(world, ci, r);
    for (let c = 0; c < PATH_BLOCKER_SUBDIV; c++) if ((row & (1 << c)) !== 0) bits++;
  }
  if (bits === 0) return null;
  return bits >= PATH_BLOCKER_SUBDIV * PATH_BLOCKER_SUBDIV ? 'X' : 'x';
}

/**
 * ASCII-окно карты со шкалой координат. Строка шкалы сверху — сотни/десятки/
 * единицы X, слева — абсолютный Y. Ссылаться на клетку можно прямо по ним.
 */
export function dumpAscii(world: World, entities: readonly Entity[], win: DumpWindow): string {
  let { cx, cy } = win;
  const focus = win.focusId !== undefined ? entities.find(e => e.id === win.focusId && e.alive) : undefined;
  if (focus) { cx = Math.floor(focus.x); cy = Math.floor(focus.y); }
  const w = Math.max(4, Math.min(200, Math.floor(win.w)));
  const h = Math.max(4, Math.min(120, Math.floor(win.h)));
  const x0 = Math.floor(cx - w / 2);
  const y0 = Math.floor(cy - h / 2);

  // Акторы и цели — по клеткам окна.
  const actorAt = new Map<number, string>();
  const targetAt = new Map<number, string>();
  for (const e of entities) {
    if (!e.alive) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
    const key = world.idx(world.wrap(Math.floor(e.x)), world.wrap(Math.floor(e.y)));
    const glyph = focus && e.id === focus.id ? '@' : (e.type === EntityType.MONSTER ? 'M' : 'N');
    const prev = actorAt.get(key);
    // Несколько тел в одной клетке — это и есть кучкование, показываем счётчиком.
    if (prev === undefined || glyph === '@') actorAt.set(key, glyph);
    else if (prev !== '@') actorAt.set(key, prev === 'N' || prev === 'M' ? '2' : String(Math.min(9, Number(prev) + 1)));
  }
  if (focus?.ai) {
    targetAt.set(world.idx(world.wrap(Math.floor(focus.ai.tx)), world.wrap(Math.floor(focus.ai.ty))), '*');
  }

  const lines: string[] = [];
  const gutter = 6;
  const pad = ' '.repeat(gutter);
  for (const scale of [100, 10, 1]) {
    let row = pad;
    for (let dx = 0; dx < w; dx++) {
      const x = world.wrap(x0 + dx);
      row += scale === 1 ? String(x % 10) : String(Math.floor(x / scale) % 10);
    }
    lines.push(row);
  }
  for (let dy = 0; dy < h; dy++) {
    const y = world.wrap(y0 + dy);
    let row = String(y).padStart(gutter - 1, ' ') + ' ';
    for (let dx = 0; dx < w; dx++) {
      const x = world.wrap(x0 + dx);
      const ci = world.idx(x, y);
      const actor = actorAt.get(ci);
      if (actor) { row += actor; continue; }
      const target = targetAt.get(ci);
      if (target) { row += target; continue; }
      const cell = world.cells[ci];
      if (cell === Cell.FLOOR) {
        const bg = blockerGlyph(world, ci);
        row += bg ?? '.';
      } else {
        row += CELL_GLYPH[cell] ?? '?';
      }
    }
    lines.push(row);
  }
  lines.push(`${pad}окно ${w}x${h} вокруг (${world.wrap(cx)}, ${world.wrap(cy)})`);
  return lines.join('\n');
}

/* ── Трассировка одного актора ──────────────────────────────────── */

export interface TraceRow {
  tick: number;
  t: number;
  x: number;
  y: number;
  goal: string;
  npcState: string;
  pathLen: number;
  pi: number;
  wpX: number;
  wpY: number;
  tx: number;
  ty: number;
  distToTarget: number;
  step: number;
  assigned: boolean;
  blockedBy: string;
  combatTargetId: number;
  stuck: number;
}

const subX = (sc: number) => (sc % (W * PATH_BLOCKER_SUBDIV)) / PATH_BLOCKER_SUBDIV;
const subY = (sc: number) => Math.floor(sc / (W * PATH_BLOCKER_SUBDIV)) / PATH_BLOCKER_SUBDIV;

/** Что мешает актору прямо сейчас: соседняя стена, блокер, чужое тело. */
function blockedBy(world: World, entities: readonly Entity[], e: Entity): string {
  const out: string[] = [];
  const cx = Math.floor(e.x);
  const cy = Math.floor(e.y);
  for (const [dx, dy, name] of [[1, 0, 'E'], [-1, 0, 'W'], [0, 1, 'S'], [0, -1, 'N']] as const) {
    const ci = world.idx(world.wrap(cx + dx), world.wrap(cy + dy));
    if (world.cells[ci] === Cell.WALL) out.push(`стена:${name}`);
    else if (blockerGlyph(world, ci)) out.push(`блокер:${name}`);
  }
  let touching = 0;
  for (const o of entities) {
    if (o === e || !o.alive || !o.ai) continue;
    const rr = (e.radius ?? 0.18) + (o.radius ?? 0.18);
    if (world.dist2(e.x, e.y, o.x, o.y) < rr * rr) touching++;
  }
  if (touching > 0) out.push(`тел:${touching}`);
  return out.length > 0 ? out.join(',') : '—';
}

export class ActorTracer {
  private prevX = NaN;
  private prevY = NaN;
  private prevPath: readonly number[] | null = null;
  readonly rows: TraceRow[] = [];

  constructor(private actorId: number, private cap = 4000) {}

  sample(world: World, entities: readonly Entity[], tick: number, t: number): void {
    if (this.rows.length >= this.cap) return;
    const e = entities.find(en => en.id === this.actorId && en.alive);
    if (!e || !e.ai) return;
    const ai = e.ai;
    const wp = ai.pi < ai.path.length ? ai.path[ai.pi] : -1;
    const step = Number.isNaN(this.prevX) ? 0 : Math.sqrt(world.dist2(this.prevX, this.prevY, e.x, e.y));
    this.rows.push({
      tick, t,
      x: e.x, y: e.y,
      goal: AIGoal[ai.goal] ?? String(ai.goal),
      npcState: ai.npcState !== undefined ? (NpcState[ai.npcState] ?? String(ai.npcState)) : '—',
      pathLen: ai.path.length,
      pi: ai.pi,
      wpX: wp >= 0 ? subX(wp) : -1,
      wpY: wp >= 0 ? subY(wp) : -1,
      tx: ai.tx, ty: ai.ty,
      distToTarget: Math.sqrt(world.dist2(e.x, e.y, ai.tx, ai.ty)),
      step,
      assigned: ai.path !== this.prevPath && ai.path.length > 0,
      blockedBy: blockedBy(world, entities, e),
      combatTargetId: ai.combatTargetId ?? -1,
      stuck: ai.stuck,
    });
    this.prevX = e.x;
    this.prevY = e.y;
    this.prevPath = ai.path;
  }

  format(every = 1): string {
    const n = (v: number, d = 2) => v.toFixed(d);
    const head = 'tick     t    поз                цель               d    путь  wp                шаг    goal/state             бой  мешает';
    const lines = [head];
    for (let i = 0; i < this.rows.length; i += Math.max(1, every)) {
      const r = this.rows[i];
      lines.push(
        `${String(r.tick).padStart(5)} ${n(r.t, 1).padStart(5)}`
        + `  (${n(r.x)},${n(r.y)})`.padEnd(18)
        + ` (${n(r.tx)},${n(r.ty)})`.padEnd(19)
        + ` ${n(r.distToTarget, 1).padStart(5)}`
        + `  ${String(r.pi)}/${String(r.pathLen)}`.padEnd(8)
        + (r.wpX >= 0 ? `(${n(r.wpX)},${n(r.wpY)})` : '—').padEnd(18)
        + ` ${n(r.step, 3).padStart(6)}`
        + `  ${r.goal}/${r.npcState}`.padEnd(24)
        + (r.assigned ? ' NEW' : '    ')
        + ` ${String(r.combatTargetId).padStart(4)}`
        + `  ${r.blockedBy}`);
    }
    return lines.join('\n');
  }
}

/* ── JSON-снимок ─────────────────────────────────────────────────── */

export interface ActorSnapshot {
  id: number;
  kind: 'npc' | 'monster';
  x: number;
  y: number;
  hp: number;
  goal: string;
  npcState: string;
  tx: number;
  ty: number;
  pathLen: number;
  pi: number;
  stuck: number;
  combatTargetId: number;
  path?: number[];
}

export interface WorldSnapshot {
  tick: number;
  t: number;
  actors: ActorSnapshot[];
}

export function snapshotActors(entities: readonly Entity[], tick: number, t: number, withPath = false): WorldSnapshot {
  const actors: ActorSnapshot[] = [];
  for (const e of entities) {
    if (!e.alive || !e.ai) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
    const ai = e.ai;
    actors.push({
      id: e.id,
      kind: e.type === EntityType.MONSTER ? 'monster' : 'npc',
      x: Number(e.x.toFixed(4)),
      y: Number(e.y.toFixed(4)),
      hp: e.hp ?? -1,
      goal: AIGoal[ai.goal] ?? String(ai.goal),
      npcState: ai.npcState !== undefined ? (NpcState[ai.npcState] ?? String(ai.npcState)) : '—',
      tx: Number(ai.tx.toFixed(4)),
      ty: Number(ai.ty.toFixed(4)),
      pathLen: ai.path.length,
      pi: ai.pi,
      stuck: ai.stuck,
      combatTargetId: ai.combatTargetId ?? -1,
      ...(withPath ? { path: [...ai.path] } : {}),
    });
  }
  actors.sort((a, b) => a.id - b.id);
  return { tick, t, actors };
}
