/* ── НЕТ-ТЕРМИНАЛ ГЕН: unlock state, flesh target and terminals ─ */

import {
  Cell,
  EntityType,
  Feature,
  W,
  msg,
  type Entity,
  type GameState,
  type Item,
} from '../core/types';
import { World } from '../core/world';
import { summarizeMapEditor } from './map_editor';
import { rng, hashSeed, seededRandom } from '../core/rand';
import {
  FLOOR_RUN_MAX_Z,
  FLOOR_RUN_MIN_Z,
  isProceduralFloorZ,
  proceduralFloorKey,
} from '../data/procedural_floors';
import { designFloorAtZ } from '../data/design_floors';
import {
  NET_TERMINAL_GEN_DEBUG_MAX_TERMINALS,
  NET_TERMINAL_GEN_DENIED_TEXT,
  NET_TERMINAL_GEN_ITEM_ID,
  NET_TERMINAL_GEN_ITEM_NAME,
  NET_TERMINAL_GEN_FLOOR_PROFILES,
  NET_TERMINAL_GEN_NORMAL_MIN_TERMINALS,
  NET_TERMINAL_GEN_NORMAL_MAX_TERMINALS,
  NET_TERMINAL_GEN_OPEN_TEXT,
  NET_TERMINAL_GEN_PALETTE,
  NET_TERMINAL_GEN_PICKUP_MESSAGE,
  NET_TERMINAL_GEN_TERMINAL_COUNT_WEIGHTS,
  NET_TERMINAL_GEN_TERMINALS,
  type NetTerminalGenTerminalDef,
  type NetTerminalGenFloorProfile,
} from '../data/net_terminal_gen';
import { Spr } from '../entities/sprite_index';
import { CORPORATIONS, CORPORATION_BY_ID, type CorporationId } from '../data/corporations';
import {
  accountToCash,
  bankingSummary,
  cashToAccount,
  closeDeposit,
  ensureBankingState,
  openDeposit,
  repayLoan,
  takeLoan,
} from './banking';
import {
  buyShares,
  ensureStockMarketState,
  estimateStockTrade,
  portfolioValue,
  sellShares,
  stockSharesOwned,
} from './stock_market';
import { publishEvent } from './events';
import {
  currentFloorRunEntry,
  ensureFloorRunState,
  floorRunEntryForDesignFloor,
  floorRunEntryFloorKey,
  type FloorRunEntry,
} from './procedural_floors';
import { floorInstanceLabel, floorInstanceWorldKey, getActiveFloorInstance } from './floor_instances';
import { spawnSafeguardHackBacklash } from './safeguard';
import { canSpawnEntityType } from './entity_limits';
import { floorKeyForDesign, floorKeyForProcedural  } from './floor_keys';
import { registerDebugCommand } from './debug_registry';
import { killEntity } from './entity_death';

export interface NetTerminalGenState {
  runSeed: number;
  targetZ: number;
  targetKey: string;
  rawX: number;
  rawY: number;
  resolvedX?: number;
  resolvedY?: number;
  found: boolean;
  pickupClaimed: boolean;
  firstTerminalDenied: boolean;
  hackCooldowns: Record<string, number>;
}

export interface NetTerminalGenTarget {
  runSeed: number;
  targetZ: number;
  targetKey: string;
  rawX: number;
  rawY: number;
}

export interface NetTerminalGenRouteTarget {
  z: number;
  key: string;
  kind: 'design' | 'procedural';
  label: string;
}

export interface NetTerminalGenResolvedTarget {
  targetKey: string;
  z: number;
  x: number;
  y: number;
  idx: number;
  newlyResolved: boolean;
}

export interface NetTerminalGenFleshData {
  netTerminalGen: true;
  targetKey: string;
  runSeed: number;
}

export interface NetTerminalGenTerminal {
  idx: number;
  x: number;
  y: number;
  defId: string;
  label: string;
  feature: Feature.SCREEN | Feature.APPARATUS;
  source: 'generated' | 'debug' | 'manual';
}

export interface NetTerminalGenPlacementOptions {
  max?: number;
  seed?: number;
  debug?: boolean;
  clearExisting?: boolean;
  source?: NetTerminalGenTerminal['source'];
}

export type NetTerminalGenOverlayMode = 'closed' | 'denied' | 'editor' | 'bank';
export type NetTerminalBankAction =
  | 'deposit'
  | 'withdraw'
  | 'open_deposit'
  | 'close_deposit'
  | 'take_loan'
  | 'repay_loan'
  | 'buy_shares'
  | 'sell_shares';

export interface NetTerminalGenRuntimeSnapshot {
  mode: NetTerminalGenOverlayMode;
  open: boolean;
  terminalIdx: number;
  terminalLabel: string;
  text: string;
  bankRowIndex: number;
  bankAction: NetTerminalBankAction;
  bankPresetIndex: number;
  bankMessage: string;
}

export interface NetTerminalBankRowSnapshot {
  label: string;
  value: string;
  selected: boolean;
}

export interface NetTerminalBankSnapshot {
  terminalIdx: number;
  terminalLabel: string;
  action: NetTerminalBankAction;
  actionLabel: string;
  rowIndex: number;
  rows: NetTerminalBankRowSnapshot[];
  presetIndex: number;
  presetLabel: string;
  amountRubles: number;
  shareCount: number;
  cashRubles: number;
  accountRubles: number;
  depositRubles: number;
  debtRubles: number;
  creditAvailable: number;
  portfolioRubles: number;
  canSubmit: boolean;
  message: string;
}

export interface NetTerminalGenUseResult {
  handled: boolean;
  access: boolean;
  mode: NetTerminalGenOverlayMode;
  terminal?: NetTerminalGenTerminal;
  text?: string;
}

export interface NetTerminalGenHackContext {
  entities: Entity[];
  nextId: { v: number };
}

type NetTerminalGenHost = GameState & { netTerminalGen?: Partial<NetTerminalGenState> };

const terminalRegistry = new Map<number, NetTerminalGenTerminal>();
const DIRS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const runtime = {
  mode: 'closed' as NetTerminalGenOverlayMode,
  open: false,
  terminalIdx: -1,
  terminalLabel: '',
  text: '',
  bankRowIndex: 0,
  bankPresetIndex: 0,
  bankMessage: '',
};

/* ── НЕТ-БАНК: строки операций ──────────────────────────────────
 * Оверлей отдаёт ровно две оси — вверх/вниз и влево/вправо, — и обе уже
 * разведены по терминалам: ось строк выбирает ОПЕРАЦИЮ, ось пресетов —
 * ПАРАМЕТР. Поэтому счёт, вклад, кредит и биржа живут одним списком строк, а
 * не четырьмя экранами: третьей оси у терминала нет и заводить её негде.
 * Сторона биржевой сделки (купить/продать) поэтому сидит в пресете — у строки
 * бумаги параметр один, и он же решает направление. */
type NetTerminalBankRowKind = 'money' | 'shares';

interface NetTerminalBankRow {
  kind: NetTerminalBankRowKind;
  action: NetTerminalBankAction;
  label: string;
  corpId?: CorporationId;
}

interface NetTerminalBankSharePreset {
  side: 'buy' | 'sell';
  /** 0 — всё, что есть в портфеле; терминал не считает «максимум покупки». */
  lot: number;
}

const BANK_ROWS: readonly NetTerminalBankRow[] = [
  { kind: 'money', action: 'deposit', label: 'Внести нал' },
  { kind: 'money', action: 'withdraw', label: 'Снять со счета' },
  { kind: 'money', action: 'open_deposit', label: 'Вклад: пополнить' },
  { kind: 'money', action: 'close_deposit', label: 'Вклад: закрыть' },
  { kind: 'money', action: 'take_loan', label: 'Кредит: взять' },
  { kind: 'money', action: 'repay_loan', label: 'Кредит: погасить' },
  ...CORPORATIONS.map((corp): NetTerminalBankRow => ({
    kind: 'shares',
    action: 'buy_shares',
    label: `Биржа: ${corp.ticker}`,
    corpId: corp.id,
  })),
];

const BANK_MONEY_PRESETS: readonly number[] = [10, 50, 100, -1];
const BANK_CLOSE_PRESETS: readonly number[] = [-1];
const BANK_SHARE_PRESETS: readonly NetTerminalBankSharePreset[] = [
  { side: 'buy', lot: 1 },
  { side: 'buy', lot: 5 },
  { side: 'buy', lot: 10 },
  { side: 'buy', lot: 25 },
  { side: 'sell', lot: 1 },
  { side: 'sell', lot: 5 },
  { side: 'sell', lot: 10 },
  { side: 'sell', lot: 0 },
];

function cleanCoord(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return ((Math.trunc(value) % W) + W) % W;
}

function cleanHackCooldowns(input: unknown, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= now) continue;
    out[key.slice(0, 96)] = value;
  }
  return out;
}

function routeKeyForEntry(entry: FloorRunEntry): string {
  return floorRunEntryFloorKey(entry);
}

export function currentNetTerminalGenFloorKey(state: GameState): string {
  const active = getActiveFloorInstance(state);
  if (active) return floorInstanceWorldKey(active);
  return routeKeyForEntry(currentFloorRunEntry(state));
}

/* Колода целей нет-терминала: по одной записи на реально существующий этаж.
 *
 * Раньше первой строкой стояло `const story = designFloor ? designFloor.themeTags
 * : 100`, а следом `if (story !== undefined)` — истинное ВСЕГДА, потому что и
 * массив, и число определены. Из-за этого весь разбор ниже был мёртв: каждый
 * этаж попадал в колоду как `kind: "story"` с подписью-литералом `"100"`, а
 * ключ считался как `floorKeyForDesign(String(themeTags))`, что для массива
 * `['ministry']` даёт `design:ministry` — имя КОРЗИНЫ вместо этажа. Цель
 * терминала расходилась с собственным `targetZ`, и пятнадцать разных этажей
 * давали один и тот же ключ. */
function buildRouteDeck(state: GameState): NetTerminalGenRouteTarget[] {
  const run = ensureFloorRunState(state);
  const deck: NetTerminalGenRouteTarget[] = [];
  for (let z = FLOOR_RUN_MIN_Z; z <= FLOOR_RUN_MAX_Z; z++) {
    const design = designFloorAtZ(z);
    if (design) {
      const entry = floorRunEntryForDesignFloor(state, design.id);
      if (entry?.spec) {
        deck.push({ z, key: routeKeyForEntry(entry), kind: 'procedural', label: entry.spec.title });
        continue;
      }
      deck.push({
        z,
        key: entry ? routeKeyForEntry(entry) : floorKeyForDesign(design.id),
        kind: 'design',
        label: design.displayName,
      });
      continue;
    }

    if (!isProceduralFloorZ(z)) continue;
    const key = proceduralFloorKey(z);
    const spec = run.specs[key];
    deck.push({ z, key: floorKeyForProcedural(key), kind: 'procedural', label: spec?.title ?? key });
  }
  return deck;
}

export function deriveNetTerminalGenTarget(state: GameState): NetTerminalGenTarget {
  const run = ensureFloorRunState(state);
  const deck = buildRouteDeck(state);
  const fallback: NetTerminalGenRouteTarget = deck[0] ?? {
    z: 0,
    key: floorKeyForDesign('living'),
    kind: 'design',
    label: 'Жилая зона',
  };
  const deckFingerprint = deck.map(entry => entry.key).join('|');
  const routeSeed = hashSeed(deckFingerprint, run.runSeed);
  const picked = deck[routeSeed % Math.max(1, deck.length)] ?? fallback;
  return {
    runSeed: run.runSeed,
    targetZ: picked.z,
    targetKey: picked.key,
    rawX: hashSeed('net_terminal_gen:raw_x', routeSeed) % W,
    rawY: hashSeed('net_terminal_gen:raw_y', routeSeed) % W,
  };
}

export function normalizeNetTerminalGenState(
  input: Partial<NetTerminalGenState> | null | undefined,
  state: GameState,
): NetTerminalGenState {
  const derived = deriveNetTerminalGenTarget(state);
  const sameRun = input?.runSeed === derived.runSeed;
  const sameTarget = sameRun && input?.targetKey === derived.targetKey && input?.targetZ === derived.targetZ;
  return {
    ...derived,
    resolvedX: sameTarget ? cleanCoord(input?.resolvedX) : undefined,
    resolvedY: sameTarget ? cleanCoord(input?.resolvedY) : undefined,
    found: sameRun ? !!input?.found : false,
    pickupClaimed: sameRun ? !!input?.pickupClaimed : false,
    firstTerminalDenied: sameRun ? !!input?.firstTerminalDenied : false,
    hackCooldowns: sameRun ? cleanHackCooldowns(input?.hackCooldowns, state.time) : {},
  };
}

export function getNetTerminalGenState(state: GameState): NetTerminalGenState | undefined {
  const src = (state as NetTerminalGenHost).netTerminalGen;
  return src ? normalizeNetTerminalGenState(src, state) : undefined;
}

export function ensureNetTerminalGenState(state: GameState): NetTerminalGenState {
  const host = state as NetTerminalGenHost;
  host.netTerminalGen = normalizeNetTerminalGenState(host.netTerminalGen, state);
  return host.netTerminalGen as NetTerminalGenState;
}

export function setNetTerminalGenState(
  state: GameState,
  input: Partial<NetTerminalGenState> | null | undefined,
): NetTerminalGenState {
  const normalized = normalizeNetTerminalGenState(input, state);
  (state as NetTerminalGenHost).netTerminalGen = normalized;
  return normalized;
}

export function netTerminalGenStateForSave(state: GameState): NetTerminalGenState {
  return { ...ensureNetTerminalGenState(state) };
}

export function isCurrentNetTerminalGenTargetFloor(state: GameState): boolean {
  const ntg = ensureNetTerminalGenState(state);
  if (getActiveFloorInstance(state)) return false;
  const entry = currentFloorRunEntry(state);
  return entry.z === ntg.targetZ && routeKeyForEntry(entry) === ntg.targetKey;
}

function isFleshCell(world: World, idx: number): boolean {
  const cell = world.cells[idx];
  return cell === Cell.FLOOR || cell === Cell.WATER;
}

function resolveNearestFleshCell(world: World, rawX: number, rawY: number): { x: number; y: number; idx: number } | null {
  const x0 = world.wrap(rawX);
  const y0 = world.wrap(rawY);
  const i0 = world.idx(x0, y0);
  if (isFleshCell(world, i0)) return { x: x0, y: y0, idx: i0 };

  const maxRadius = W >> 1;
  for (let r = 1; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      const topX = world.wrap(x0 + dx);
      const topY = world.wrap(y0 - r);
      const topIdx = world.idx(topX, topY);
      if (isFleshCell(world, topIdx)) return { x: topX, y: topY, idx: topIdx };

      const bottomX = world.wrap(x0 + dx);
      const bottomY = world.wrap(y0 + r);
      const bottomIdx = world.idx(bottomX, bottomY);
      if (isFleshCell(world, bottomIdx)) return { x: bottomX, y: bottomY, idx: bottomIdx };
    }
    for (let dy = -r + 1; dy <= r - 1; dy++) {
      const leftX = world.wrap(x0 - r);
      const leftY = world.wrap(y0 + dy);
      const leftIdx = world.idx(leftX, leftY);
      if (isFleshCell(world, leftIdx)) return { x: leftX, y: leftY, idx: leftIdx };

      const rightX = world.wrap(x0 + r);
      const rightY = world.wrap(y0 + dy);
      const rightIdx = world.idx(rightX, rightY);
      if (isFleshCell(world, rightIdx)) return { x: rightX, y: rightY, idx: rightIdx };
    }
  }
  return null;
}

export function resolveNetTerminalGenTargetForCurrentFloor(
  world: World,
  state: GameState,
): NetTerminalGenResolvedTarget | null {
  const ntg = ensureNetTerminalGenState(state);
  if (!isCurrentNetTerminalGenTargetFloor(state)) return null;

  let x = cleanCoord(ntg.resolvedX);
  let y = cleanCoord(ntg.resolvedY);
  let newlyResolved = false;
  if (x === undefined || y === undefined || !isFleshCell(world, world.idx(x, y))) {
    const resolved = resolveNearestFleshCell(world, ntg.rawX, ntg.rawY);
    if (!resolved) return null;
    x = resolved.x;
    y = resolved.y;
    ntg.resolvedX = x;
    ntg.resolvedY = y;
    newlyResolved = true;
  }

  return {
    targetKey: ntg.targetKey,
    z: ntg.targetZ,
    x,
    y,
    idx: world.idx(x, y),
    newlyResolved,
  };
}

function fleshData(state: NetTerminalGenState): NetTerminalGenFleshData {
  return {
    netTerminalGen: true,
    targetKey: state.targetKey,
    runSeed: state.runSeed,
  };
}

export function isNetTerminalGenFleshItem(item: Item | undefined): boolean {
  if (!item || item.defId !== NET_TERMINAL_GEN_ITEM_ID) return false;
  const data = item.data;
  return !!data && typeof data === 'object' && (data as Partial<NetTerminalGenFleshData>).netTerminalGen === true;
}

export function isNetTerminalGenFleshDrop(drop: Entity): boolean {
  return drop.type === EntityType.ITEM_DROP && !!drop.inventory?.some(isNetTerminalGenFleshItem);
}

function existingFleshDrop(entities: readonly Entity[], target: NetTerminalGenResolvedTarget): Entity | null {
  for (const e of entities) {
    if (!e.alive || !isNetTerminalGenFleshDrop(e)) continue;
    if (Math.floor(e.x) === target.x && Math.floor(e.y) === target.y) return e;
  }
  return null;
}

export function ensureNetTerminalGenFleshDrop(
  world: World,
  entities: Entity[],
  nextEntityId: { v: number },
  state: GameState,
): Entity | null {
  const ntg = ensureNetTerminalGenState(state);
  if (ntg.found || ntg.pickupClaimed) return null;
  const target = resolveNetTerminalGenTargetForCurrentFloor(world, state);
  if (!target) return null;

  const existing = existingFleshDrop(entities, target);
  if (existing) return existing;
  if (!canSpawnEntityType(entities, EntityType.ITEM_DROP)) return null;

  const drop: Entity = {
    id: nextEntityId.v++,
    type: EntityType.ITEM_DROP,
    x: target.x + 0.5,
    y: target.y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId: NET_TERMINAL_GEN_ITEM_ID, count: 1, data: fleshData(ntg) }],
  };
  entities.push(drop);
  return drop;
}

export function claimNetTerminalGenFleshDrop(
  state: GameState,
  drop: Entity,
  player?: Entity,
  world?: World,
): boolean {
  if (!isNetTerminalGenFleshDrop(drop)) return false;
  const ntg = ensureNetTerminalGenState(state);
  const firstClaim = !ntg.found;
  ntg.found = true;
  ntg.pickupClaimed = true;
  killEntity(drop);

  if (firstClaim) {
    state.msgs.push(msg(NET_TERMINAL_GEN_PICKUP_MESSAGE, state.time, NET_TERMINAL_GEN_PALETTE.flesh));
    publishEvent(state, {
      type: 'player_pick_item',
      actorId: player?.id,
      actorName: player?.name,
      itemId: NET_TERMINAL_GEN_ITEM_ID,
      itemName: NET_TERMINAL_GEN_ITEM_NAME,
      itemCount: 1,
      itemValue: 0,
      x: Math.floor(drop.x),
      y: Math.floor(drop.y),
      zoneId: world ? world.zoneMap[world.idx(Math.floor(drop.x), Math.floor(drop.y))] : undefined,
      severity: 4,
      privacy: 'secret',
      tags: ['net_terminal_gen', 'flesh_found'],
      data: { targetKey: ntg.targetKey, targetZ: ntg.targetZ },
    });
  }
  return true;
}

export function grantNetTerminalGenAccess(state: GameState): NetTerminalGenState {
  const ntg = ensureNetTerminalGenState(state);
  ntg.found = true;
  ntg.pickupClaimed = true;
  return ntg;
}

export function hasNetTerminalGen(state: GameState, player?: Entity): boolean {
  const ntg = ensureNetTerminalGenState(state);
  if (ntg.found) return true;
  return !!player?.inventory?.some(slot => slot.defId === NET_TERMINAL_GEN_ITEM_ID);
}

function chooseWeightedCount(rng: () => number): number {
  let total = 0;
  for (const def of NET_TERMINAL_GEN_TERMINAL_COUNT_WEIGHTS) total += Math.max(0, def.weight);
  if (total <= 0) return 0;
  let roll = rng() * total;
  for (const def of NET_TERMINAL_GEN_TERMINAL_COUNT_WEIGHTS) {
    roll -= Math.max(0, def.weight);
    if (roll <= 0) return Math.max(0, Math.floor(def.count));
  }
  return 0;
}

function chooseTerminalDef(rng: () => number): NetTerminalGenTerminalDef {
  let total = 0;
  for (const def of NET_TERMINAL_GEN_TERMINALS) total += Math.max(0, def.weight);
  let roll = rng() * Math.max(1, total);
  for (const def of NET_TERMINAL_GEN_TERMINALS) {
    roll -= Math.max(0, def.weight);
    if (roll <= 0) return def;
  }
  return NET_TERMINAL_GEN_TERMINALS[0];
}

function floorProfileForCurrentFloor(state: GameState): NetTerminalGenFloorProfile | undefined {
  const key = currentNetTerminalGenFloorKey(state);
  return NET_TERMINAL_GEN_FLOOR_PROFILES.find(profile => profile.floorKey === key);
}

function hasAdjacentPassable(world: World, x: number, y: number): boolean {
  for (const [dx, dy] of DIRS) {
    const nx = world.wrap(x + dx);
    const ny = world.wrap(y + dy);
    const ni = world.idx(nx, ny);
    if ((world.cells[ni] === Cell.FLOOR || world.cells[ni] === Cell.WATER) && !world.solid(nx, ny)) return true;
  }
  return false;
}

function canUseTerminalCell(world: World, idx: number): boolean {
  if (world.aptMask[idx] || world.hermoWall[idx]) return false;
  const cell = world.cells[idx];
  if (cell === Cell.DOOR || cell === Cell.LIFT || cell === Cell.ABYSS) return false;
  if (world.features[idx] !== Feature.NONE && world.features[idx] !== Feature.SCREEN && world.features[idx] !== Feature.APPARATUS) return false;
  return hasAdjacentPassable(world, idx % W, (idx / W) | 0);
}

export function clearNetTerminalGenTerminals(): void {
  terminalRegistry.clear();
}

export function getNetTerminalGenTerminals(): readonly NetTerminalGenTerminal[] {
  return [...terminalRegistry.values()];
}

export function getNetTerminalGenTerminalAt(world: World, x: number, y: number): NetTerminalGenTerminal | undefined {
  return terminalRegistry.get(world.idx(Math.floor(x), Math.floor(y)));
}

export function isNetTerminalGenTarget(world: World, _state: GameState, x: number, y: number): boolean {
  return !!getNetTerminalGenTerminalAt(world, x, y);
}

export function registerNetTerminalGenTerminal(
  world: World,
  x: number,
  y: number,
  def: NetTerminalGenTerminalDef = NET_TERMINAL_GEN_TERMINALS[0],
  source: NetTerminalGenTerminal['source'] = 'manual',
): NetTerminalGenTerminal | null {
  const idx = world.idx(x, y);
  if (!canUseTerminalCell(world, idx)) return null;
  const terminal: NetTerminalGenTerminal = {
    idx,
    x: idx % W,
    y: (idx / W) | 0,
    defId: def.id,
    label: def.label,
    feature: def.feature,
    source,
  };
  terminalRegistry.set(idx, terminal);
  return terminal;
}

export function placeNetTerminalGenTerminal(
  world: World,
  x: number,
  y: number,
  def: NetTerminalGenTerminalDef = NET_TERMINAL_GEN_TERMINALS[0],
  source: NetTerminalGenTerminal['source'] = 'manual',
): NetTerminalGenTerminal | null {
  const idx = world.idx(x, y);
  if (!canUseTerminalCell(world, idx)) return null;
  const feature = world.cells[idx] === Cell.WALL ? Feature.SCREEN : def.feature === Feature.SCREEN ? Feature.APPARATUS : def.feature;
  world.setFeatureAt(idx, feature);
  if (feature === Feature.SCREEN) {
    world.wallTex[idx] = def.wallTex;
    world.markWallTexDirty();
  }
  return registerNetTerminalGenTerminal(world, x, y, { ...def, feature }, source);
}

function roomEdgeCandidate(world: World, rng: () => number): number {
  if (world.rooms.length === 0) return -1;
  const room = world.rooms[Math.floor(rng() * world.rooms.length)];
  if (!room) return -1;
  const side = Math.floor(rng() * 4);
  if (side === 0) return world.idx(room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2)), room.y - 1);
  if (side === 1) return world.idx(room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2)), room.y + room.h);
  if (side === 2) return world.idx(room.x - 1, room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2)));
  return world.idx(room.x + room.w, room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2)));
}

function findTerminalCandidate(world: World, rng: () => number): number {
  if (world.screenCells.length > 0) {
    const start = Math.floor(rng() * world.screenCells.length);
    const tries = Math.min(world.screenCells.length, 256);
    for (let n = 0; n < tries; n++) {
      const idx = world.screenCells[(start + n) % world.screenCells.length];
      if (idx !== undefined && !terminalRegistry.has(idx) && canUseTerminalCell(world, idx)) return idx;
    }
  }

  for (let attempt = 0; attempt < 720; attempt++) {
    const idx = roomEdgeCandidate(world, rng);
    if (idx >= 0 && !terminalRegistry.has(idx) && canUseTerminalCell(world, idx)) return idx;
  }

  for (let attempt = 0; attempt < 1024; attempt++) {
    const idx = world.idx(Math.floor(rng() * W), Math.floor(rng() * W));
    if (!terminalRegistry.has(idx) && canUseTerminalCell(world, idx)) return idx;
  }
  return -1;
}

export function placeNetTerminalGenTerminalsForCurrentFloor(
  world: World,
  state: GameState,
  options: NetTerminalGenPlacementOptions = {},
): number {
  if (options.clearExisting ?? true) clearNetTerminalGenTerminals();
  const seed = options.seed ?? hashSeed(`net_terminal_gen:terminals:${currentNetTerminalGenFloorKey(state)}`, ensureFloorRunState(state).runSeed);
  const rng = seededRandom(seed);
  const profile = options.debug ? undefined : floorProfileForCurrentFloor(state);
  const maxDefault = profile?.maxTerminals ?? (options.debug ? NET_TERMINAL_GEN_DEBUG_MAX_TERMINALS : NET_TERMINAL_GEN_NORMAL_MAX_TERMINALS);
  const max = Math.max(0, Math.floor(options.max ?? maxDefault));
  const desired = options.debug
    ? Math.max(1, max)
    : profile
      ? Math.max(0, Math.min(max, profile.minTerminals + Math.floor(rng() * Math.max(1, profile.maxTerminals - profile.minTerminals + 1))))
      : Math.max(
        Math.min(max, NET_TERMINAL_GEN_NORMAL_MIN_TERMINALS),
        Math.min(max, chooseWeightedCount(rng)),
      );
  let placed = 0;

  for (let attempt = 0; attempt < desired * 24 && placed < desired; attempt++) {
    const idx = findTerminalCandidate(world, rng);
    if (idx < 0 || terminalRegistry.has(idx)) continue;
    const def = profile?.terminalDef ?? chooseTerminalDef(rng);
    if (placeNetTerminalGenTerminal(world, idx % W, (idx / W) | 0, def, options.source ?? (options.debug ? 'debug' : 'generated'))) placed++;
  }
  return placed;
}

function setRuntime(mode: NetTerminalGenOverlayMode, terminal?: NetTerminalGenTerminal): void {
  runtime.mode = mode;
  runtime.open = mode !== 'closed';
  runtime.terminalIdx = terminal?.idx ?? -1;
  runtime.terminalLabel = terminal?.label ?? '';
  runtime.text = mode === 'denied'
    ? NET_TERMINAL_GEN_DENIED_TEXT
    : mode === 'editor'
      ? NET_TERMINAL_GEN_OPEN_TEXT
      : mode === 'bank'
        ? 'НЕТ-БАНК'
        : '';
  if (mode === 'closed') runtime.bankMessage = '';
}

export function markNetTerminalGenDenied(state: GameState): NetTerminalGenState {
  const ntg = ensureNetTerminalGenState(state);
  ntg.firstTerminalDenied = true;
  return ntg;
}

export function openNetTerminalGenDenied(state: GameState, terminal?: NetTerminalGenTerminal): void {
  markNetTerminalGenDenied(state);
  state.paused = true;
  setRuntime('denied', terminal);
}

export function openNetTerminalGenEditor(state: GameState, terminal?: NetTerminalGenTerminal): void {
  state.paused = true;
  setRuntime('editor', terminal);
}

export function openNetTerminalBank(state: GameState, terminal?: NetTerminalGenTerminal): void {
  ensureBankingState(state);
  state.paused = true;
  runtime.bankRowIndex = 0;
  runtime.bankPresetIndex = 0;
  runtime.bankMessage = '';
  setRuntime('bank', terminal);
}

export function closeNetTerminalGen(): void {
  setRuntime('closed');
}

export function isNetTerminalGenOpen(): boolean {
  return runtime.open;
}

export function isNetTerminalGenDeniedOpen(): boolean {
  return runtime.mode === 'denied';
}

export function isNetTerminalGenEditorOpen(): boolean {
  return runtime.mode === 'editor';
}

export function isNetTerminalBankOpen(): boolean {
  return runtime.mode === 'bank';
}

export function getNetTerminalGenRuntimeSnapshot(): NetTerminalGenRuntimeSnapshot {
  clampBankRuntime();
  return { ...runtime, bankAction: bankRowAction() };
}

function cleanCash(player: Entity): number {
  const cash = player.money ?? 0;
  return Number.isFinite(cash) ? Math.max(0, Math.floor(cash)) : 0;
}

function bankRow(): NetTerminalBankRow {
  return BANK_ROWS[runtime.bankRowIndex] ?? BANK_ROWS[0];
}

function bankMoneyPresets(row: NetTerminalBankRow): readonly number[] {
  return row.action === 'close_deposit' ? BANK_CLOSE_PRESETS : BANK_MONEY_PRESETS;
}

function bankPresetCount(row: NetTerminalBankRow): number {
  return row.kind === 'shares' ? BANK_SHARE_PRESETS.length : bankMoneyPresets(row).length;
}

function wrapIndex(value: number, count: number): number {
  if (count <= 0) return 0;
  return ((Math.trunc(value) % count) + count) % count;
}

function clampBankRuntime(): void {
  runtime.bankRowIndex = wrapIndex(runtime.bankRowIndex, BANK_ROWS.length);
  runtime.bankPresetIndex = wrapIndex(runtime.bankPresetIndex, bankPresetCount(bankRow()));
}

function bankSharePreset(): NetTerminalBankSharePreset {
  return BANK_SHARE_PRESETS[runtime.bankPresetIndex] ?? BANK_SHARE_PRESETS[0];
}

function bankRowAction(): NetTerminalBankAction {
  const row = bankRow();
  if (row.kind !== 'shares') return row.action;
  return bankSharePreset().side === 'buy' ? 'buy_shares' : 'sell_shares';
}

/** Сколько рублей эта операция вправе двинуть при нынешних балансах. */
function bankMoneyLimit(state: GameState, player: Entity, row: NetTerminalBankRow): number {
  const bank = bankingSummary(state);
  switch (row.action) {
    case 'deposit': return cleanCash(player);
    case 'withdraw': return Math.floor(bank.accountRubles);
    case 'open_deposit': return Math.floor(bank.accountRubles);
    case 'close_deposit': return Math.floor(bank.depositPrincipal);
    case 'take_loan': return Math.floor(bank.availableCredit);
    case 'repay_loan': return Math.floor(Math.min(bank.accountRubles, bank.debtRubles));
    default: return 0;
  }
}

function bankMoneyAmount(state: GameState, player: Entity, row: NetTerminalBankRow): number {
  const presets = bankMoneyPresets(row);
  const preset = presets[runtime.bankPresetIndex] ?? presets[0];
  return preset < 0 ? bankMoneyLimit(state, player, row) : preset;
}

function bankShareCount(state: GameState, row: NetTerminalBankRow): number {
  const preset = bankSharePreset();
  if (!row.corpId) return 0;
  if (preset.lot > 0) return preset.lot;
  return preset.side === 'sell' ? stockSharesOwned(state, row.corpId) : 0;
}

function bankActionLabel(row: NetTerminalBankRow): string {
  if (row.kind !== 'shares') return row.label;
  const corp = row.corpId ? CORPORATION_BY_ID[row.corpId] : undefined;
  return `${bankSharePreset().side === 'buy' ? 'Купить' : 'Продать'} ${corp?.ticker ?? '?'}`;
}

function bankPresetLabel(state: GameState, player: Entity, row: NetTerminalBankRow): string {
  if (row.kind === 'shares') {
    const preset = bankSharePreset();
    const shares = bankShareCount(state, row);
    if (preset.lot > 0) return `${preset.lot} шт.`;
    return `${shares} шт. (весь пакет)`;
  }
  const presets = bankMoneyPresets(row);
  const preset = presets[runtime.bankPresetIndex] ?? presets[0];
  if (preset >= 0) return `${preset} руб.`;
  const limit = bankMoneyLimit(state, player, row);
  switch (row.action) {
    case 'deposit': return `${limit} руб. (все наличные)`;
    case 'close_deposit': return `${limit} руб. (весь вклад)`;
    case 'take_loan': return `${limit} руб. (весь лимит)`;
    case 'repay_loan': return `${limit} руб. (весь долг)`;
    default: return `${limit} руб. (весь счет)`;
  }
}

function bankShortfallMessage(row: NetTerminalBankRow): string {
  switch (row.action) {
    case 'deposit': return 'Недостаточно наличных.';
    case 'close_deposit': return 'Вклад пуст.';
    case 'take_loan': return 'Кредитный лимит исчерпан.';
    case 'repay_loan': return 'Нечего гасить или пуст счет.';
    default: return 'Недостаточно на счете.';
  }
}

export function moveNetTerminalBankAction(delta: number): void {
  runtime.bankRowIndex = wrapIndex(runtime.bankRowIndex + delta, BANK_ROWS.length);
  clampBankRuntime();
  runtime.bankMessage = '';
}

export function moveNetTerminalBankPreset(delta: number): void {
  runtime.bankPresetIndex = wrapIndex(runtime.bankPresetIndex + delta, bankPresetCount(bankRow()));
  runtime.bankMessage = '';
}

function reportBank(state: GameState, text: string, ok: boolean): boolean {
  runtime.bankMessage = text;
  state.msgs.push(msg(text, state.time, ok ? '#6cf' : '#f84'));
  return ok;
}

function activateBankMoney(state: GameState, player: Entity, row: NetTerminalBankRow): boolean {
  const moved = bankMoneyAmount(state, player, row);
  const limit = bankMoneyLimit(state, player, row);
  if (moved <= 0 || moved > limit) return reportBank(state, bankShortfallMessage(row), false);

  switch (row.action) {
    case 'deposit':
      return cashToAccount(state, player, moved, 'net_terminal')
        ? reportBank(state, `Внесено ${moved} руб.`, true)
        : reportBank(state, 'Взнос не прошел.', false);
    case 'withdraw':
      return accountToCash(state, player, moved, 'net_terminal')
        ? reportBank(state, `Снято ${moved} руб.`, true)
        : reportBank(state, 'Снятие не прошло.', false);
    case 'open_deposit':
      return openDeposit(state, moved)
        ? reportBank(state, `На вклад ушло ${moved} руб.`, true)
        : reportBank(state, 'Вклад не принял взнос.', false);
    case 'close_deposit': {
      const returned = closeDeposit(state);
      return returned > 0
        ? reportBank(state, `Вклад закрыт: ${Math.floor(returned)} руб. на счет.`, true)
        : reportBank(state, 'Вклад пуст.', false);
    }
    case 'take_loan':
      return takeLoan(state, moved, 'net_terminal')
        ? reportBank(state, `Выдан кредит ${moved} руб.`, true)
        : reportBank(state, 'Кредитный лимит исчерпан.', false);
    case 'repay_loan':
      return repayLoan(state, moved, 'net_terminal')
        ? reportBank(state, `Погашено ${moved} руб.`, true)
        : reportBank(state, 'Погашение не прошло.', false);
    default:
      return reportBank(state, 'Операция недоступна.', false);
  }
}

function activateBankShares(state: GameState, row: NetTerminalBankRow): boolean {
  const corpId = row.corpId;
  if (!corpId) return reportBank(state, 'Бумага не найдена.', false);
  const corp = CORPORATION_BY_ID[corpId];
  const side = bankSharePreset().side;
  const shares = bankShareCount(state, row);
  if (shares <= 0) {
    return reportBank(state, side === 'buy' ? 'Лот пуст.' : `Нет бумаг ${corp?.ticker ?? corpId}.`, false);
  }

  const result = side === 'buy' ? buyShares(state, corpId, shares) : sellShares(state, corpId, shares);
  if (!result.ok) {
    const text = result.reason === 'insufficient_funds'
      ? 'Недостаточно на счете.'
      : result.reason === 'insufficient_shares'
        ? `Нет ${shares} бумаг ${corp?.ticker ?? corpId}.`
        : 'Биржа отклонила заявку.';
    return reportBank(state, text, false);
  }
  const total = Math.floor(result.total ?? 0);
  return reportBank(
    state,
    side === 'buy'
      ? `Куплено ${shares} ${corp?.ticker ?? corpId} за ${total} руб.`
      : `Продано ${shares} ${corp?.ticker ?? corpId} за ${total} руб.`,
    true,
  );
}

export function activateNetTerminalBank(state: GameState, player: Entity): boolean {
  clampBankRuntime();
  const row = bankRow();
  return row.kind === 'shares' ? activateBankShares(state, row) : activateBankMoney(state, player, row);
}

function bankRowValue(state: GameState, player: Entity, row: NetTerminalBankRow): string {
  if (row.kind === 'shares' && row.corpId) {
    const market = ensureStockMarketState(state);
    const quote = market.quotes[row.corpId];
    const owned = stockSharesOwned(state, row.corpId);
    const arrow = quote.lastDelta > 0 ? '+' : quote.lastDelta < 0 ? '-' : '=';
    return `${Math.round(quote.price)}${arrow} x${owned}`;
  }
  return `${bankMoneyLimit(state, player, row)} руб.`;
}

export function getNetTerminalBankSnapshot(state: GameState, player: Entity): NetTerminalBankSnapshot {
  const bank = bankingSummary(state);
  clampBankRuntime();
  const row = bankRow();
  const shares = row.kind === 'shares' ? bankShareCount(state, row) : 0;
  const side = bankSharePreset().side;
  const estimate = row.kind === 'shares' && row.corpId
    ? estimateStockTrade(state, row.corpId, side, shares)
    : { unitPrice: 0, gross: 0, fee: 0, total: 0 };
  const moved = row.kind === 'shares' ? Math.floor(estimate.total) : bankMoneyAmount(state, player, row);
  const limit = row.kind === 'shares' ? 0 : bankMoneyLimit(state, player, row);
  const canSubmit = row.kind === 'shares'
    ? shares > 0 && (side === 'buy' ? estimate.total <= bank.accountRubles : shares <= stockSharesOwned(state, row.corpId ?? ''))
    : moved > 0 && moved <= limit;

  return {
    terminalIdx: runtime.terminalIdx,
    terminalLabel: runtime.terminalLabel,
    action: bankRowAction(),
    actionLabel: bankActionLabel(row),
    rowIndex: runtime.bankRowIndex,
    rows: BANK_ROWS.map((entry, index) => ({
      label: entry.label,
      value: bankRowValue(state, player, entry),
      selected: index === runtime.bankRowIndex,
    })),
    presetIndex: runtime.bankPresetIndex,
    presetLabel: bankPresetLabel(state, player, row),
    amountRubles: moved,
    shareCount: shares,
    cashRubles: cleanCash(player),
    accountRubles: bank.accountRubles,
    depositRubles: bank.depositPrincipal,
    debtRubles: bank.debtRubles,
    creditAvailable: bank.availableCredit,
    portfolioRubles: portfolioValue(state),
    canSubmit,
    message: runtime.bankMessage,
  };
}

function terminalDefById(defId: string): NetTerminalGenTerminalDef | undefined {
  for (const def of NET_TERMINAL_GEN_TERMINALS) if (def.id === defId) return def;
  for (const profile of NET_TERMINAL_GEN_FLOOR_PROFILES) if (profile.terminalDef.id === defId) return profile.terminalDef;
  return undefined;
}

function terminalHackKey(state: GameState, terminal: NetTerminalGenTerminal): string {
  return `${currentNetTerminalGenFloorKey(state)}:${terminal.idx}:${terminal.defId}`;
}

function routeTagFromKey(key: string): string | undefined {
  const prefix = 'design:';
  return key.startsWith(prefix) ? key.slice(prefix.length) : undefined;
}

function resolveTerminalHack(
  world: World,
  player: Entity,
  state: GameState,
  terminal: NetTerminalGenTerminal,
  entities: Entity[] | undefined,
  nextId: { v: number } | undefined,
): 'none' | 'success' | 'failed' | 'cooldown' {
  const def = terminalDefById(terminal.defId);
  if (!entities || !nextId) return 'none';
  if (!def || def.hackDifficulty === undefined) return 'none';
  const difficulty = def.hackDifficulty;

  const ntg = ensureNetTerminalGenState(state);
  const hackKey = terminalHackKey(state, terminal);
  const cooldownUntil = ntg.hackCooldowns[hackKey] ?? 0;
  if (cooldownUntil > state.time) {
    state.msgs.push(msg(`Терминал в карантине: ${Math.ceil(cooldownUntil - state.time)}с.`, state.time, '#f84'));
    return 'cooldown';
  }

  const floorKey = currentNetTerminalGenFloorKey(state);
  const routeTag = routeTagFromKey(floorKey);
  const successChance = Math.max(0.08, Math.min(0.55, 0.28 + (player.rpg?.int ?? 0) * 0.045 - difficulty * 0.045));
  if (rng() < successChance) {
    grantNetTerminalGenAccess(state);
    state.msgs.push(msg('НЕТ-колодец принял обход. Доступ открыт.', state.time, NET_TERMINAL_GEN_PALETTE.open));
    publishEvent(state, {
      type: 'net_terminal_hacked',
      x: terminal.x,
      y: terminal.y,
      zoneId: world.zoneMap[terminal.idx],
      actorId: player.id,
      actorName: player.name ?? 'Вы',
      actorFaction: player.faction,
      severity: 4,
      privacy: 'secret',
      tags: ['net', 'terminal', 'hack_success', terminal.defId, ...(routeTag ? [routeTag] : [])],
      data: { terminalIdx: terminal.idx, terminalDef: terminal.defId, floorKey, difficulty, successChance },
    });
    return 'success';
  }

  ntg.hackCooldowns[hackKey] = state.time + (def?.hackCooldownS ?? 90);
  state.msgs.push(msg('НЕТ-колодец отверг взлом. Протокол охраны поднимается рядом.', state.time, '#f84'));
  spawnSafeguardHackBacklash(world, entities, nextId, state, terminal.x + 0.5, terminal.y + 0.5, 'net_terminal_hack_failed', {
    terminalIdx: terminal.idx,
    floorKey,
  });
  return 'failed';
}

export function tryUseNetTerminalGen(
  world: World,
  player: Entity,
  state: GameState,
  lookX: number,
  lookY: number,
  entities?: Entity[],
  nextId?: { v: number },
): NetTerminalGenUseResult {
  const terminal = getNetTerminalGenTerminalAt(world, lookX, lookY);
  if (!terminal) return { handled: false, access: false, mode: 'closed' };
  if (hasNetTerminalGen(state, player)) {
    openNetTerminalGenEditor(state, terminal);
    return { handled: true, access: true, mode: 'editor', terminal, text: NET_TERMINAL_GEN_OPEN_TEXT };
  }
  const hackResult = resolveTerminalHack(world, player, state, terminal, entities, nextId);
  if (hackResult === 'success') {
    openNetTerminalGenEditor(state, terminal);
    return { handled: true, access: true, mode: 'editor', terminal, text: NET_TERMINAL_GEN_OPEN_TEXT };
  }
  if (hackResult === 'failed' || hackResult === 'cooldown') {
    if (terminalDefById(terminal.defId)?.hackDifficulty !== undefined) {
      return { handled: true, access: false, mode: 'closed', terminal, text: hackResult };
    }
    openNetTerminalBank(state, terminal);
    return { handled: true, access: false, mode: 'bank', terminal, text: 'НЕТ-БАНК' };
  }
  openNetTerminalBank(state, terminal);
  return { handled: true, access: false, mode: 'bank', terminal, text: 'НЕТ-БАНК' };
}

export function summarizeNetTerminalGen(state: GameState, player?: Entity): string[] {
  const ntg = ensureNetTerminalGenState(state);
  const entry = currentFloorRunEntry(state);
  const active = getActiveFloorInstance(state);
  const currentKey = currentNetTerminalGenFloorKey(state);
  const resolved = ntg.resolvedX !== undefined && ntg.resolvedY !== undefined ? `${ntg.resolvedX},${ntg.resolvedY}` : 'none';
  return [
    `seed=${ntg.runSeed} target=${ntg.targetKey} z=${ntg.targetZ} raw=${ntg.rawX},${ntg.rawY} resolved=${resolved}`,
    `current=${currentKey} z=${active ? 'instance' : entry.z} ${active ? floorInstanceLabel(active) : entry.label} targetFloorZ=${isCurrentNetTerminalGenTargetFloor(state) ? 'yes' : 'no'}`,
    `found=${ntg.found ? 'yes' : 'no'} claimed=${ntg.pickupClaimed ? 'yes' : 'no'} access=${hasNetTerminalGen(state, player) ? 'yes' : 'no'} denied=${ntg.firstTerminalDenied ? 'yes' : 'no'}`,
    `terminals=${terminalRegistry.size} overlay=${runtime.mode}${runtime.terminalIdx >= 0 ? ` idx=${runtime.terminalIdx}` : ''}`,
  ];
}

/* ── Отладка ──────────────────────────────────────────────────
 * Команда живёт рядом со своей системой: меню собирает реестр, а не список в
 * debug.ts. Чтобы добавить ещё одну, допишите ещё один registerDebugCommand. */

registerDebugCommand({
  /* Grant Net Terminal Gen access */
  id: 'grant_net_terminal_gen_access',
  group: 'cheat',
  label: 'НЕТ-ГЕН: выдать доступ',
  run: ({ state }) => {
    grantNetTerminalGenAccess(state);
    state.msgs.push(msg('[НЕТ-ГЕН] доступ выдан', state.time, '#63f6ff'));
  },
});

registerDebugCommand({
  /* Place generated terminals on current floor */
  id: 'place_net_terminal_gen_terminals',
  group: 'tools',
  label: 'НЕТ-ГЕН: расставить терминалы',
  run: ({ world, state }) => {
    const count = placeNetTerminalGenTerminalsForCurrentFloor(world, state, { debug: true, max: 4, clearExisting: true, source: 'debug' });
    state.msgs.push(msg(`[НЕТ-ГЕН] терминалов: ${count}`, state.time, count > 0 ? '#63f6ff' : '#f84'));
    return { type: 'refresh_world_data' };
  },
});

registerDebugCommand({
  /* Place terminal in front of player */
  id: 'place_net_terminal_gen_in_front',
  group: 'tools',
  label: 'НЕТ-ГЕН: терминал перед игроком',
  run: ({ world, player, state }) => {
    const x = Math.floor(player.x + Math.cos(player.angle) * 1.5);
    const y = Math.floor(player.y + Math.sin(player.angle) * 1.5);
    const terminal = placeNetTerminalGenTerminal(world, x, y, undefined, 'debug');
    state.msgs.push(msg(terminal ? `[НЕТ-ГЕН] терминал ${terminal.x},${terminal.y}` : '[НЕТ-ГЕН] нет подходящей клетки', state.time, terminal ? '#63f6ff' : '#f84'));
    return { type: 'refresh_world_data' };
  },
});

/* ── Отладка ──────────────────────────────────────────────────
 * Команда живёт рядом со своей системой: меню собирает реестр, а не список в
 * debug.ts. Чтобы добавить ещё одну, допишите ещё один registerDebugCommand. */

registerDebugCommand({
  /* Net Terminal Gen and map editor status */
  id: 'net_terminal_gen_status',
  group: 'tools',
  label: 'НЕТ-ГЕН/РЕДАКТОР: статус',
  run: ({ player, state }) => {
    for (const line of summarizeNetTerminalGen(state, player)) state.msgs.push(msg(`[НЕТ-ГЕН] ${line}`, state.time, '#63f6ff'));
    for (const line of summarizeMapEditor(state)) state.msgs.push(msg(`[MAPEDIT] ${line}`, state.time, '#9fdbc6'));
  } });
