/* ── Online protocol v2: host-authoritative peer state ──────────────────────
 *
 * Ownership contract:
 *   - The HOST owns the peer actor entirely: inventory, hp, magazine, money,
 *     needs, rpg. The peer owns only its position/angle (validated host-side)
 *     and local prediction for instant UI feedback.
 *   - The peer sends numbered INTENTS (fire/reload/tool/use_item/drop/
 *     container/interact). It applies them optimistically through the same
 *     local code paths that already exist, then reconciles against the host's
 *     `actor_echo`: host-exclusive fields (hp, stagger, money) apply always;
 *     predicted fields (inventory, mag, needs, rpg) apply only once the echo's
 *     lastSeq has caught up with everything the peer sent — this replaces the
 *     old actorGen delta-merge machinery, which deadlocked during combat.
 *   - Host→peer traffic is ONE `host_state` packet per sync tick (entities +
 *     actor echo + doors + fx + container updates + cell patches): each WS
 *     message is a billed Durable Object request, so batching matters.
 */

import { W, Cell, DoorState, type Entity, type Item } from '../core/types';
import { World } from '../core/world';
import { countAmmo, removeItem, equippedCombatItemId, getWeaponStats } from './inventory';
import { calculateReloadTime } from './combat';

// ── Intents (peer → host) ────────────────────────────────────

export type PeerIntent =
  | { kind: 'fire'; weaponId: string; targetId?: number }
  | { kind: 'reload' }
  | { kind: 'tool'; edge: boolean }
  | { kind: 'use_item'; slot: number; defId: string }
  | { kind: 'drop'; slot: number; defId: string; count: number; data?: unknown }
  | { kind: 'container'; op: 'take' | 'put' | 'close'; cx: number; cy: number; slot?: number }
  | { kind: 'interact' }
  | { kind: 'npc_talk'; npcId: number }
  | { kind: 'npc_close'; npcId: number }
  /** Relaxed-trust deal: the peer ran the full local trade UI/pricing; the
   *  host applies the material result (clamped to what actually exists). */
  | { kind: 'trade_deal'; npcId: number; give: NetItem[]; take: NetItem[]; netCash: number };

export interface PeerIntentMsg {
  type: 'peer_intent';
  seq: number;
  intent: PeerIntent;
}

let _nextIntentSeq = 1;

/** Peer: wrap an intent with the next sequence number. Caller sends it. */
export function nextIntentMsg(intent: PeerIntent): PeerIntentMsg {
  return { type: 'peer_intent', seq: _nextIntentSeq++, intent };
}

export function peerLastSentSeq(): number { return _nextIntentSeq - 1; }

export function resetPeerIntentSeq(): void { _nextIntentSeq = 1; }

/** Sanitize an incoming intent on the host. Returns null when malformed. */
export function sanitizeIntent(raw: unknown): PeerIntent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case 'fire':
      return {
        kind: 'fire',
        weaponId: typeof r.weaponId === 'string' ? r.weaponId.slice(0, 40) : '',
        targetId: typeof r.targetId === 'number' && Number.isFinite(r.targetId) ? Math.floor(r.targetId) : undefined,
      };
    case 'reload': return { kind: 'reload' };
    case 'tool': return { kind: 'tool', edge: r.edge === true };
    case 'use_item':
      if (typeof r.defId !== 'string') return null;
      return { kind: 'use_item', slot: clampInt(r.slot, 0, 255), defId: r.defId.slice(0, 40) };
    case 'drop':
      if (typeof r.defId !== 'string') return null;
      return {
        kind: 'drop',
        slot: clampInt(r.slot, 0, 255),
        defId: r.defId.slice(0, 40),
        count: clampInt(r.count, 1, 9999),
        data: r.data,
      };
    case 'container': {
      const op = r.op === 'take' || r.op === 'put' || r.op === 'close' ? r.op : null;
      if (!op) return null;
      return {
        kind: 'container', op,
        cx: clampInt(r.cx, 0, W - 1), cy: clampInt(r.cy, 0, W - 1),
        slot: r.slot === undefined ? undefined : clampInt(r.slot, 0, 255),
      };
    }
    case 'interact': return { kind: 'interact' };
    case 'npc_talk':
      return { kind: 'npc_talk', npcId: clampInt(r.npcId, 0, 1e9) };
    case 'npc_close':
      return { kind: 'npc_close', npcId: clampInt(r.npcId, 0, 1e9) };
    case 'trade_deal':
      return {
        kind: 'trade_deal',
        npcId: clampInt(r.npcId, 0, 1e9),
        give: unpackItems(r.give, 16),
        take: unpackItems(r.take, 16),
        netCash: typeof r.netCash === 'number' && Number.isFinite(r.netCash)
          ? Math.max(-1_000_000, Math.min(1_000_000, Math.floor(r.netCash)))
          : 0,
      };
    default: return null;
  }
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : lo;
  return Math.max(lo, Math.min(hi, n));
}

// ── Actor echo (host → peer, authoritative peer-actor state) ──

export interface NetItem { defId: string; count: number; data?: unknown }

export interface ActorEcho {
  lastSeq: number;
  ackMoveGen?: number;
  hp: number; maxHp: number; alive: boolean;
  staggerTimer?: number;
  money?: number;
  weapon: string; tool: string; armorDefId?: string;
  currentMag?: number; reloading?: boolean; reloadTimer?: number; attackCd?: number;
  inventory: NetItem[];
  needs?: { food: number; water: number; sleep: number; pee: number; poo: number };
  rpg?: { level: number; xp: number; attrPoints: number; str: number; agi: number; int: number; psi: number; maxPsi: number };
}

export function packItems(inventory: readonly Item[] | undefined, cap = 255): NetItem[] {
  const out: NetItem[] = [];
  if (!inventory) return out;
  for (const it of inventory) {
    if (!it || typeof it.defId !== 'string') continue;
    out.push(it.data !== undefined ? { defId: it.defId, count: it.count, data: it.data } : { defId: it.defId, count: it.count });
    if (out.length >= cap) break;
  }
  return out;
}

export function unpackItems(input: unknown, cap = 255): Item[] {
  const out: Item[] = [];
  for (const raw of Array.isArray(input) ? input : []) {
    if (!raw || typeof (raw as Item).defId !== 'string') continue;
    const count = Math.max(0, Math.floor((raw as Item).count ?? 0));
    if (count <= 0) continue;
    const data = (raw as Item).data;
    out.push(data !== undefined ? { defId: (raw as Item).defId, count, data } : { defId: (raw as Item).defId, count });
    if (out.length >= cap) break;
  }
  return out;
}

/** Host: build the authoritative echo of a peer actor. */
export function packActorEcho(actor: Entity, lastSeq: number, ackMoveGen?: number): ActorEcho {
  return {
    lastSeq,
    ackMoveGen,
    hp: actor.hp ?? 0, maxHp: actor.maxHp ?? 100, alive: actor.alive,
    staggerTimer: actor.staggerTimer,
    money: actor.money,
    weapon: actor.weapon ?? '', tool: actor.tool ?? '', armorDefId: actor.armorDefId,
    currentMag: actor.currentMag, reloading: actor.reloading,
    reloadTimer: actor.reloadTimer, attackCd: actor.attackCd,
    inventory: packItems(actor.inventory),
    needs: actor.needs ? { food: actor.needs.food, water: actor.needs.water, sleep: actor.needs.sleep, pee: actor.needs.pee, poo: actor.needs.poo } : undefined,
    rpg: actor.rpg ? { level: actor.rpg.level, xp: actor.rpg.xp, attrPoints: actor.rpg.attrPoints, str: actor.rpg.str, agi: actor.rpg.agi, int: actor.rpg.int, psi: actor.rpg.psi, maxPsi: actor.rpg.maxPsi } : undefined,
  };
}

/** Peer: fold the host echo into the local player.
 *  Host-exclusive fields apply unconditionally; predicted fields only when the
 *  host has processed every intent the peer has sent (no pending prediction). */
export function applyActorEcho(player: Entity, echo: ActorEcho, fullyAcked: boolean): void {
  player.hp = echo.hp;
  player.maxHp = echo.maxHp;
  player.staggerTimer = echo.staggerTimer;
  if (echo.money !== undefined) player.money = echo.money;
  if (!echo.alive) player.alive = false;
  if (!fullyAcked) return;
  player.weapon = echo.weapon;
  player.tool = echo.tool;
  player.armorDefId = echo.armorDefId;
  player.currentMag = echo.currentMag;
  player.reloading = echo.reloading;
  player.reloadTimer = echo.reloadTimer;
  player.attackCd = echo.attackCd;
  player.inventory = unpackItems(echo.inventory);
  if (echo.needs && player.needs) Object.assign(player.needs, echo.needs);
  if (echo.rpg && player.rpg) Object.assign(player.rpg, echo.rpg);
}

// ── FX events (host → peers, cosmetic-only) ──────────────────

export interface NetFx {
  k: 'shot' | 'hit' | 'death';
  x: number; y: number;
  /** weaponId for 'shot', monsterKind for 'death' (optional). */
  w?: string;
  m?: number;
  /** source peer slot — that peer already played the fx locally and skips it */
  s?: number;
}

const MAX_FX_PER_TICK = 24;
let _fxQueue: NetFx[] = [];

/** Host: queue a cosmetic fx for the next host_state packet. Bounded. */
export function pushNetFx(fx: NetFx): void {
  if (_fxQueue.length >= MAX_FX_PER_TICK) return;
  _fxQueue.push({ ...fx, x: +fx.x.toFixed(1), y: +fx.y.toFixed(1) });
}

export function drainNetFx(): NetFx[] {
  if (_fxQueue.length === 0) return _fxQueue;
  const out = _fxQueue;
  _fxQueue = [];
  return out;
}

// ── Cell patches (host → peers, runtime geometry mutations) ──
// Samosbor fronts, jackhammer digs, door/block kits mutate host geometry that
// the peer's snapshot no longer matches. The host drains touched cell indices
// per tick and ships current cell + texture values; the peer stamps them in.

export interface CellPatch { i: number; c: number; wt: number; ft: number }

const MAX_CELLS_PER_TICK = 384;
let _touchedCells = new Set<number>();

/** Host: mark a cell index as needing a net patch (bounded drain per tick). */
export function markNetCellTouched(idx: number): void {
  _touchedCells.add(idx);
}

export function markNetCellsTouched(idxs: Iterable<number>): void {
  for (const i of idxs) _touchedCells.add(i);
}

export function drainNetCellPatch(world: World): CellPatch[] {
  if (_touchedCells.size === 0) return [];
  const out: CellPatch[] = [];
  for (const i of _touchedCells) {
    out.push({ i, c: world.cells[i], wt: world.wallTex[i], ft: world.floorTex[i] });
    _touchedCells.delete(i);
    if (out.length >= MAX_CELLS_PER_TICK) break;
  }
  return out;
}

export function pendingNetCellCount(): number { return _touchedCells.size; }

/** Peer: stamp host cell patches into the local world copy. Keeps the door
 *  registry consistent: a cell turning into DOOR gets a placeholder record
 *  (its real state arrives with the next door sync), a cell leaving DOOR
 *  drops its record. */
export function applyNetCellPatch(world: World, patch: unknown): boolean {
  if (!Array.isArray(patch) || patch.length === 0) return false;
  let changed = false;
  for (const raw of patch) {
    const p = raw as CellPatch;
    if (typeof p?.i !== 'number' || p.i < 0 || p.i >= world.cells.length) continue;
    if (world.cells[p.i] !== p.c) {
      if (world.cells[p.i] === Cell.DOOR && p.c !== Cell.DOOR) world.removeDoorAt(p.i);
      world.cells[p.i] = p.c;
      changed = true;
    }
    if (p.c === Cell.DOOR && !world.doors.has(p.i)) {
      world.doors.set(p.i, { idx: p.i, state: DoorState.CLOSED, roomA: -1, roomB: -1, keyId: '', timer: 0 });
    }
    if (typeof p.wt === 'number' && world.wallTex[p.i] !== p.wt) { world.wallTex[p.i] = p.wt; world.markWallTexDirty(); }
    if (typeof p.ft === 'number' && world.floorTex[p.i] !== p.ft) { world.floorTex[p.i] = p.ft; world.markFloorTexDirty(); }
  }
  if (changed) world.markCellsDirty();
  return changed;
}

// ── Snapshot interpolation (peer side) ───────────────────────
// entity_sync arrives at ~8 Hz; rendering it raw looks like teleport steps.
// Keep the previous and latest network sample per entity and interpolate
// per-frame with one sync-interval of delay, so motion is continuous.

interface NetSample { x0: number; y0: number; a0: number; t0: number; x1: number; y1: number; a1: number; t1: number }

const _netSamples = new Map<number, NetSample>();
const NET_INTERP_DELAY_MS = 150;

/** Peer: record the latest network position for an entity. */
export function noteNetSample(id: number, x: number, y: number, angle: number, nowMs: number): void {
  const s = _netSamples.get(id);
  if (!s) {
    _netSamples.set(id, { x0: x, y0: y, a0: angle, t0: nowMs, x1: x, y1: y, a1: angle, t1: nowMs });
    return;
  }
  s.x0 = s.x1; s.y0 = s.y1; s.a0 = s.a1; s.t0 = s.t1;
  s.x1 = x; s.y1 = y; s.a1 = angle; s.t1 = nowMs;
}

export function dropNetSample(id: number): void { _netSamples.delete(id); }

export function clearNetSamples(): void { _netSamples.clear(); }

/** Peer, per frame: place synced entities on their interpolated path.
 *  Renders NET_INTERP_DELAY_MS behind the newest sample; extrapolates by at
 *  most one interval when packets stall, then holds. Torus-aware via deltas. */
export function updateNetInterpolation(world: World, entities: Entity[], self: Entity, nowMs: number): void {
  const renderT = nowMs - NET_INTERP_DELAY_MS;
  for (const e of entities) {
    if (e === self) continue;
    const s = _netSamples.get(e.id);
    if (!s) continue;
    const span = s.t1 - s.t0;
    if (span <= 0 || renderT >= s.t1 + span) {
      // stalled or single-sample: snap to the newest known position
      e.x = s.x1; e.y = s.y1; e.angle = s.a1;
      continue;
    }
    const f = Math.max(0, Math.min(1.5, (renderT - s.t0) / span));
    const dx = world.delta(s.x0, s.x1);
    const dy = world.delta(s.y0, s.y1);
    e.x = world.wrap(s.x0 + dx * f);
    e.y = world.wrap(s.y0 + dy * f);
    let da = s.a1 - s.a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    e.angle = s.a0 + da * Math.max(0, Math.min(1, f));
  }
}

// ── Visit export (evacuation ritual) ─────────────────────────
// The peer takes loot home only by reaching a lift alive. The host builds this
// blob from the live actor; the peer folds it into its own save. Death sends
// visit_end without an export — the home save stays untouched.

export interface VisitExport {
  inventory: NetItem[];
  weapon: string; tool: string; armorDefId?: string;
  money: number;
  rpg?: { level: number; xp: number; attrPoints: number; str: number; agi: number; int: number; psi: number; maxPsi: number };
}

export function buildVisitExport(actor: Entity): VisitExport {
  return {
    inventory: packItems(actor.inventory),
    weapon: actor.weapon ?? '', tool: actor.tool ?? '', armorDefId: actor.armorDefId,
    money: Math.max(0, Math.floor(actor.money ?? 0)),
    rpg: actor.rpg ? { level: actor.rpg.level, xp: actor.rpg.xp, attrPoints: actor.rpg.attrPoints, str: actor.rpg.str, agi: actor.rpg.agi, int: actor.rpg.int, psi: actor.rpg.psi, maxPsi: actor.rpg.maxPsi } : undefined,
  };
}

/** Peer: sanitize a host-sent export before folding it into the home save. */
export function sanitizeVisitExport(raw: unknown): VisitExport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rpgRaw = r.rpg as Record<string, unknown> | undefined;
  const num = (v: unknown, lo: number, hi: number, dflt: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : dflt;
    return Math.max(lo, Math.min(hi, n));
  };
  return {
    inventory: unpackItems(r.inventory),
    weapon: typeof r.weapon === 'string' ? r.weapon.slice(0, 40) : '',
    tool: typeof r.tool === 'string' ? r.tool.slice(0, 40) : '',
    armorDefId: typeof r.armorDefId === 'string' ? r.armorDefId.slice(0, 40) : undefined,
    money: Math.floor(num(r.money, 0, 1e9, 0)),
    rpg: rpgRaw && typeof rpgRaw === 'object' ? {
      level: Math.floor(num(rpgRaw.level, 1, 999, 1)),
      xp: Math.floor(num(rpgRaw.xp, 0, 1e9, 0)),
      attrPoints: Math.floor(num(rpgRaw.attrPoints, 0, 999, 0)),
      str: Math.floor(num(rpgRaw.str, 0, 99, 0)),
      agi: Math.floor(num(rpgRaw.agi, 0, 99, 0)),
      int: Math.floor(num(rpgRaw.int, 0, 99, 0)),
      psi: num(rpgRaw.psi, 0, 9999, 0),
      maxPsi: num(rpgRaw.maxPsi, 0, 9999, 0),
    } : undefined,
  };
}

/** Peer: fold a sanitized export into the freshly-loaded home player. */
export function applyVisitExport(player: Entity, exp: VisitExport): void {
  player.inventory = unpackItems(exp.inventory);
  player.weapon = exp.weapon;
  player.tool = exp.tool;
  player.armorDefId = exp.armorDefId;
  player.money = exp.money;
  if (exp.rpg && player.rpg) Object.assign(player.rpg, exp.rpg);
}

// ── Host-side authoritative peer-actor resource tick ─────────
// The host owns the peer's magazine/reload/psi state, so it must tick the
// timers itself (the old protocol trusted the peer's streamed values). Runs
// every host frame per peer actor; mirrors the peer's local prediction rules
// so a fully-acked echo converges to the same values the peer predicted.

export function hostTickRemoteActor(actor: Entity, dt: number): void {
  if (!actor.alive) return;
  actor.attackCd = Math.max(0, (actor.attackCd ?? 0) - dt);
  if (!actor.reloading) return;
  actor.reloadTimer = Math.max(0, (actor.reloadTimer ?? 0) - dt);
  if (actor.reloadTimer > 0) return;
  const weaponId = equippedCombatItemId(actor);
  const ws = getWeaponStats(actor, weaponId);
  if (ws.magazineSize !== Infinity && ws.ammoType) {
    const needed = (ws.magazineSize ?? 1) - (actor.currentMag ?? 0);
    const actual = Math.min(Math.max(0, needed), countAmmo(actor, weaponId));
    if (actual > 0) {
      removeItem(actor, ws.ammoType, actual);
      actor.currentMag = (actor.currentMag ?? 0) + actual;
    }
  } else if (ws.magazineSize === Infinity) {
    actor.currentMag = Infinity;
  } else {
    actor.currentMag = ws.magazineSize ?? 1;
  }
  actor.reloading = false;
}

/** Host: begin a reload for a peer actor (mirrors the peer's local rules). */
export function hostStartRemoteReload(actor: Entity): void {
  const weaponId = equippedCombatItemId(actor);
  const ws = getWeaponStats(actor, weaponId);
  if (actor.reloading || (actor.currentMag ?? 0) >= (ws.magazineSize ?? 1)) return;
  if ((ws.magazineSize !== Infinity && countAmmo(actor, weaponId) > 0) || ws.magazineSize === 1) {
    actor.reloading = true;
    actor.reloadTimer = calculateReloadTime(ws.reloadTime ?? 1, actor.rpg?.agi ?? 0);
  }
}

// ── Host bookkeeping per peer slot ───────────────────────────

interface SlotState {
  lastProcessedSeq: number;
  openContainer: { cx: number; cy: number } | null;
  lastContainerPayload: string;
  openNpcId: number | null;
  lastNpcPayload: string;
}

const _slots = new Map<number, SlotState>();

function slotState(slot: number): SlotState {
  let s = _slots.get(slot);
  if (!s) {
    s = { lastProcessedSeq: 0, openContainer: null, lastContainerPayload: '', openNpcId: null, lastNpcPayload: '' };
    _slots.set(slot, s);
  }
  return s;
}

export function hostNoteProcessedSeq(slot: number, seq: number): void {
  const s = slotState(slot);
  if (seq > s.lastProcessedSeq) s.lastProcessedSeq = seq;
}

export function hostLastProcessedSeq(slot: number): number {
  return _slots.get(slot)?.lastProcessedSeq ?? 0;
}

/** Host: remember which container a peer is viewing (live-push watching). */
export function hostSetOpenContainer(slot: number, cell: { cx: number; cy: number } | null): void {
  const s = slotState(slot);
  s.openContainer = cell;
  s.lastContainerPayload = '';
}

export function hostOpenContainer(slot: number): { cx: number; cy: number } | null {
  return _slots.get(slot)?.openContainer ?? null;
}

/** Host, per sync tick: returns true when the serialized payload for the
 *  slot's open container changed since last push (host/NPC/other-peer took or
 *  put something) — the caller then ships a container update to that slot. */
export function hostContainerPayloadChanged(slot: number, payloadJson: string): boolean {
  const s = slotState(slot);
  if (s.lastContainerPayload === payloadJson) return false;
  s.lastContainerPayload = payloadJson;
  return true;
}

/** Host: remember which NPC menu a peer has open (trade/talk live-push). */
export function hostSetOpenNpc(slot: number, npcId: number | null): void {
  const s = slotState(slot);
  s.openNpcId = npcId;
  s.lastNpcPayload = '';
}

export function hostOpenNpc(slot: number): number | null {
  return _slots.get(slot)?.openNpcId ?? null;
}

/** Host, per sync tick: true when the open NPC's trade payload changed. */
export function hostNpcPayloadChanged(slot: number, payloadJson: string): boolean {
  const s = slotState(slot);
  if (s.lastNpcPayload === payloadJson) return false;
  s.lastNpcPayload = payloadJson;
  return true;
}

export function hostClearSlot(slot: number): void { _slots.delete(slot); }

export function resetOnlineProtocolState(): void {
  _slots.clear();
  _fxQueue = [];
  _touchedCells.clear();
  _netSamples.clear();
  _nextIntentSeq = 1;
}
