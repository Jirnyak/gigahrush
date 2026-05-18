/* ── Bounded sparse cell hazards ──────────────────────────────── */

import {
  W, EntityType,
  type Entity, type GameState, type WorldEventSeverity,
} from '../core/types';
import { World } from '../core/world';
import { publishEvent } from './events';

export type CellHazardCleanReason = 'fire' | 'solvent' | 'tool' | 'debug';

export interface CellHazardSiteDraft {
  id: string;
  kind: string;
  displayName: string;
  cells: readonly number[];
  tags?: readonly string[];
  slowMult?: number;
  trappedMult?: number;
  stickAfter?: number;
  escapeSeconds?: number;
  npcEscapeSeconds?: number;
  roomId?: number;
  zoneId?: number;
  centerX?: number;
  centerY?: number;
  warning?: string;
}

interface CellHazardSite {
  id: string;
  kind: string;
  displayName: string;
  tags: string[];
  cells: number[];
  activeCells: Set<number>;
  slowMult: number;
  trappedMult: number;
  stickAfter: number;
  escapeSeconds: number;
  npcEscapeSeconds: number;
  roomId?: number;
  zoneId?: number;
  centerX: number;
  centerY: number;
  warning: string;
}

interface HazardSubjectState {
  hazardId: string;
  timeIn: number;
  trapped: boolean;
  escapeProgress: number;
  escapedUntil: number;
}

interface CellHazardRuntime {
  sites: CellHazardSite[];
  byCell: Map<number, CellHazardSite[]>;
  subjects: Map<number, HazardSubjectState>;
  npcScanAccum: number;
}

export interface CellHazardWarning {
  title: string;
  detail: string;
  color: string;
  trapped: boolean;
}

const runtimes = new WeakMap<World, CellHazardRuntime>();
const NPC_HAZARD_SCAN_INTERVAL = 0.25;

function ensureRuntime(world: World): CellHazardRuntime {
  let runtime = runtimes.get(world);
  if (!runtime) {
    runtime = { sites: [], byCell: new Map(), subjects: new Map(), npcScanAccum: 0 };
    runtimes.set(world, runtime);
  }
  return runtime;
}

function clampMult(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0.05, Math.min(1, value ?? fallback));
}

function normalizeCells(cells: readonly number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of cells) {
    const cell = Math.floor(raw);
    if (!Number.isFinite(cell) || cell < 0 || cell >= W * W || seen.has(cell)) continue;
    seen.add(cell);
    out.push(cell);
  }
  return out;
}

function siteCenter(cells: readonly number[]): { x: number; y: number } {
  if (cells.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const cell of cells) {
    sx += cell % W;
    sy += (cell / W) | 0;
  }
  return { x: sx / cells.length + 0.5, y: sy / cells.length + 0.5 };
}

function normalizeSite(draft: CellHazardSiteDraft): CellHazardSite | null {
  const cells = normalizeCells(draft.cells);
  if (cells.length === 0) return null;
  const center = siteCenter(cells);
  return {
    id: draft.id,
    kind: draft.kind,
    displayName: draft.displayName,
    tags: [...(draft.tags ?? [])],
    cells,
    activeCells: new Set(cells),
    slowMult: clampMult(draft.slowMult, 0.45),
    trappedMult: clampMult(draft.trappedMult, 0.12),
    stickAfter: Math.max(0.1, draft.stickAfter ?? 0.7),
    escapeSeconds: Math.max(0.5, draft.escapeSeconds ?? 2.4),
    npcEscapeSeconds: Math.max(0.5, draft.npcEscapeSeconds ?? 4.5),
    roomId: draft.roomId,
    zoneId: draft.zoneId,
    centerX: draft.centerX ?? center.x,
    centerY: draft.centerY ?? center.y,
    warning: draft.warning ?? 'Красная слизь держит ноги. Обойдите, выжгите или чистите растворителем.',
  };
}

function cloneSite(site: CellHazardSite): CellHazardSite {
  return {
    ...site,
    tags: [...site.tags],
    cells: [...site.cells],
    activeCells: new Set(site.activeCells),
  };
}

function rebuildCellIndex(runtime: CellHazardRuntime): void {
  runtime.byCell.clear();
  for (const site of runtime.sites) {
    for (const cell of site.activeCells) {
      const list = runtime.byCell.get(cell);
      if (list) list.push(site);
      else runtime.byCell.set(cell, [site]);
    }
  }
}

function activeHazardAt(runtime: CellHazardRuntime, cell: number): CellHazardSite | null {
  const sites = runtime.byCell.get(cell);
  if (!sites) return null;
  let best: CellHazardSite | null = null;
  let bestMult = 1;
  for (const site of sites) {
    if (!site.activeCells.has(cell)) continue;
    if (site.slowMult < bestMult) {
      best = site;
      bestMult = site.slowMult;
    }
  }
  return best;
}

function hazardAtEntity(world: World, e: Entity): { site: CellHazardSite; cell: number } | null {
  const runtime = runtimes.get(world);
  if (!runtime) return null;
  const cell = world.idx(Math.floor(e.x), Math.floor(e.y));
  const site = activeHazardAt(runtime, cell);
  return site ? { site, cell } : null;
}

function subjectName(e: Entity): string {
  if (e.name) return e.name;
  if (e.type === EntityType.PLAYER) return 'Вы';
  return e.type === EntityType.NPC ? 'Жилец' : 'Существо';
}

function hazardTags(site: CellHazardSite): string[] {
  const tags = ['hazard', site.kind];
  for (const tag of site.tags) if (!tags.includes(tag)) tags.push(tag);
  return tags;
}

function publishHazardEvent(
  state: GameState,
  type: 'hazard_trapped' | 'hazard_escaped' | 'hazard_cleaned',
  site: CellHazardSite,
  severity: WorldEventSeverity,
  actor?: Entity,
  data?: Record<string, unknown>,
): void {
  publishEvent(state, {
    type,
    zoneId: site.zoneId,
    roomId: site.roomId,
    x: site.centerX,
    y: site.centerY,
    actorId: actor?.id,
    actorName: actor ? subjectName(actor) : undefined,
    actorFaction: actor?.faction,
    severity,
    privacy: actor?.type === EntityType.PLAYER ? 'private' : 'local',
    tags: hazardTags(site),
    data: {
      hazardId: site.id,
      hazardKind: site.kind,
      hazardName: site.displayName,
      ...data,
    },
  });
}

export function registerCellHazardSite(world: World, draft: CellHazardSiteDraft): void {
  const site = normalizeSite(draft);
  if (!site) return;
  const runtime = ensureRuntime(world);
  runtime.sites = runtime.sites.filter(existing => existing.id !== site.id);
  runtime.sites.push(site);
  rebuildCellIndex(runtime);
}

export function replaceCellHazards(target: World, source: World): void {
  const sourceRuntime = runtimes.get(source);
  if (!sourceRuntime || sourceRuntime.sites.length === 0) {
    runtimes.delete(target);
    return;
  }
  const targetRuntime: CellHazardRuntime = {
    sites: sourceRuntime.sites.map(cloneSite),
    byCell: new Map(),
    subjects: new Map(),
    npcScanAccum: 0,
  };
  rebuildCellIndex(targetRuntime);
  runtimes.set(target, targetRuntime);
}

export function clearCellHazards(world: World): void {
  runtimes.delete(world);
}

export function getCellHazardMoveMultiplier(world: World, e: Entity): number {
  if (e.type !== EntityType.PLAYER && e.type !== EntityType.NPC) return 1;
  const runtime = runtimes.get(world);
  if (!runtime) return 1;
  const cell = world.idx(Math.floor(e.x), Math.floor(e.y));
  const site = activeHazardAt(runtime, cell);
  if (!site) return 1;
  const subject = runtime.subjects.get(e.id);
  return subject?.hazardId === site.id && subject.trapped ? site.trappedMult : site.slowMult;
}

export function getPlayerHazardWarning(world: World, player: Entity): CellHazardWarning | null {
  const hit = hazardAtEntity(world, player);
  if (!hit) return null;
  const runtime = runtimes.get(world);
  const subject = runtime?.subjects.get(player.id);
  const trapped = subject?.hazardId === hit.site.id && subject.trapped === true;
  return {
    title: trapped ? 'ВЛИПЛИ' : hit.site.displayName,
    detail: trapped ? 'Двигайтесь, чтобы вырваться. R с чистящим комплектом или огонь снимут липучку.' : hit.site.warning,
    color: trapped ? '#ff3838' : '#c22',
    trapped,
  };
}

export function cleanCellHazardsNear(
  world: World,
  x: number,
  y: number,
  radius: number,
  state: GameState,
  actor: Entity | undefined,
  reason: CellHazardCleanReason,
): number {
  const runtime = runtimes.get(world);
  if (!runtime || radius <= 0) return 0;
  const radius2 = radius * radius;
  let cleaned = 0;

  for (const site of runtime.sites) {
    if (site.activeCells.size === 0) continue;
    const removed: number[] = [];
    for (const cell of site.activeCells) {
      const cx = (cell % W) + 0.5;
      const cy = ((cell / W) | 0) + 0.5;
      if (world.dist2(x, y, cx, cy) <= radius2) removed.push(cell);
    }
    if (removed.length === 0) continue;
    for (const cell of removed) site.activeCells.delete(cell);
    cleaned += removed.length;
    publishHazardEvent(state, 'hazard_cleaned', site, site.activeCells.size === 0 ? 4 : 3, actor, {
      cleanedCells: removed.length,
      remainingCells: site.activeCells.size,
      reason,
    });
  }

  if (cleaned > 0) rebuildCellIndex(runtime);
  return cleaned;
}

function tickHazardSubject(
  world: World,
  runtime: CellHazardRuntime,
  state: GameState,
  e: Entity,
  dt: number,
  playerId: number,
  playerStruggling: boolean,
): void {
  if (!e.alive || (e.type !== EntityType.PLAYER && e.type !== EntityType.NPC)) return;
  const hit = hazardAtEntity(world, e);
  const prior = runtime.subjects.get(e.id);
  if (!hit) {
    if (prior?.trapped) {
      const site = runtime.sites.find(s => s.id === prior.hazardId);
      if (site) publishHazardEvent(state, 'hazard_escaped', site, 3, e, { reason: 'left_cell' });
    }
    runtime.subjects.delete(e.id);
    return;
  }

  let subject = prior?.hazardId === hit.site.id ? prior : {
    hazardId: hit.site.id,
    timeIn: 0,
    trapped: false,
    escapeProgress: 0,
    escapedUntil: 0,
  };
  if (subject.escapedUntil > state.time) {
    runtime.subjects.set(e.id, subject);
    return;
  }

  subject.timeIn += dt;
  if (!subject.trapped && subject.timeIn >= hit.site.stickAfter) {
    subject.trapped = true;
    subject.escapeProgress = 0;
    publishHazardEvent(state, 'hazard_trapped', hit.site, e.type === EntityType.PLAYER ? 4 : 3, e, { cell: hit.cell });
  }

  if (subject.trapped) {
    if (e.ai) {
      e.ai.path = [];
      e.ai.pi = 0;
      e.ai.timer = Math.max(e.ai.timer, 0.5);
    }
    const effort = e.id === playerId ? (playerStruggling ? 1 : 0.08) : 0.7;
    subject.escapeProgress += dt * effort;
    const need = e.id === playerId ? hit.site.escapeSeconds : hit.site.npcEscapeSeconds;
    if (subject.escapeProgress >= need) {
      publishHazardEvent(state, 'hazard_escaped', hit.site, 3, e, {
        reason: 'struggle',
        noisy: true,
        seconds: Math.round(subject.timeIn * 10) / 10,
      });
      subject = {
        hazardId: hit.site.id,
        timeIn: 0,
        trapped: false,
        escapeProgress: 0,
        escapedUntil: state.time + 2.5,
      };
    }
  }

  runtime.subjects.set(e.id, subject);
}

export function tickCellHazards(
  world: World,
  entities: Entity[],
  state: GameState,
  dt: number,
  player: Entity,
  playerStruggling: boolean,
): void {
  const runtime = runtimes.get(world);
  if (!runtime || runtime.sites.length === 0) return;

  tickHazardSubject(world, runtime, state, player, dt, player.id, playerStruggling);

  runtime.npcScanAccum += dt;
  if (runtime.npcScanAccum < NPC_HAZARD_SCAN_INTERVAL) return;
  const npcDt = runtime.npcScanAccum;
  runtime.npcScanAccum = 0;
  for (const e of entities) {
    if (e.type !== EntityType.NPC) continue;
    tickHazardSubject(world, runtime, state, e, npcDt, player.id, false);
  }
}
