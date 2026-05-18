/* ── VOID afterprotocol runtime — bounded local rules ─────────── */

import {
  W, DoorState, EntityType, Feature, MonsterKind, AIGoal,
  type Entity, type GameState, type WorldEvent, type WorldContainer, type WorldEventType,
  msg,
} from '../core/types';
import { World } from '../core/world';
import {
  VOID_PROTOCOLS,
  getVoidProtocolDef,
  type VoidProtocolDef,
} from '../data/void_protocols';
import { MONSTERS } from '../entities/monster';
import { monsterSpr, Spr } from '../render/sprite_index';
import { addItem } from './inventory';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from './rpg';
import { publishEvent, registerWorldEventObserver as observeWorldEvents } from './events';

type ProtocolPhase = 'obtained' | 'started' | 'ended' | 'backlash' | 'rejected';

interface VoidProtocolMark {
  id: number;
  protocolId: string;
  x: number;
  y: number;
  roomId: number;
  zoneId: number;
  targetKey: string;
  startedAt: number;
  expiresAt: number;
  ended: boolean;
  originalRoomName?: string;
}

interface VoidProtocolTrace {
  id: number;
  protocolId: string;
  phase: ProtocolPhase;
  text: string;
  time: number;
  targetKey: string;
}

const TRACE_CAP = 64;
const MARK_CAP = 32;
const ownedProtocols = new Set<string>();
const cooldownUntil = new Map<string, number>();
const activeMarks: VoidProtocolMark[] = [];
const traces: VoidProtocolTrace[] = [];
let nextTraceId = 1;
let nextMarkId = 1;
let debugProtocolCursor = 0;

const BORROWED_LIGHT_PROTOCOL_ID = 'borrowed_light';
const LOCAL_RULE_CONTEXT_CAP = 8;
const VOID_RULE_TAG = 'void_rule';
const BORROWED_LIGHT_TAG = 'borrowed_light';
const ACCEPT_TAG = 'accept';
const REJECT_TAG = 'reject';
const ACCEPTED_TAG = 'accepted';
const REJECTED_TAG = 'rejected';

interface VoidRuleChamberContext {
  world: World;
  entities: Entity[];
  roomId: number;
  acceptContainerId: number;
  rejectContainerId: number;
}

const localRuleChambers: VoidRuleChamberContext[] = [];

export function registerVoidBorrowedLightChamber(
  world: World,
  entities: Entity[],
  roomId: number,
  acceptContainerId: number,
  rejectContainerId: number,
): void {
  const existing = localRuleChambers.find(ctx => ctx.world === world && ctx.roomId === roomId);
  if (existing) {
    existing.entities = entities;
    existing.acceptContainerId = acceptContainerId;
    existing.rejectContainerId = rejectContainerId;
    return;
  }
  localRuleChambers.push({ world, entities, roomId, acceptContainerId, rejectContainerId });
  if (localRuleChambers.length > LOCAL_RULE_CONTEXT_CAP) {
    localRuleChambers.splice(0, localRuleChambers.length - LOCAL_RULE_CONTEXT_CAP);
  }
}

function protocolEventType(phase: ProtocolPhase): WorldEventType {
  return `void_protocol_${phase}` as WorldEventType;
}

function pushTrace(state: GameState, protocolId: string, phase: ProtocolPhase, text: string, targetKey: string): void {
  traces.push({ id: nextTraceId++, protocolId, phase, text, time: state.time, targetKey });
  if (traces.length > TRACE_CAP) traces.splice(0, traces.length - TRACE_CAP);
}

function publishProtocolEvent(
  state: GameState,
  def: VoidProtocolDef,
  phase: ProtocolPhase,
  line: string,
  mark: VoidProtocolMark | null,
  severity: 2 | 3 | 4 = 3,
): void {
  const targetKey = mark?.targetKey ?? `${state.currentFloor}:protocol:${def.id}`;
  pushTrace(state, def.id, phase, line, targetKey);
  publishEvent(state, {
    type: protocolEventType(phase),
    severity,
    privacy: phase === 'rejected' ? 'private' : 'local',
    zoneId: mark && mark.zoneId >= 0 ? mark.zoneId : undefined,
    roomId: mark && mark.roomId >= 0 ? mark.roomId : undefined,
    x: mark?.x,
    y: mark?.y,
    actorId: 0,
    actorName: 'Вы',
    tags: ['void_protocol', phase, def.id].slice(0, 8),
    data: {
      protocolId: def.id,
      protocolName: def.name,
      targetKey,
      expiresAt: mark?.expiresAt,
    },
  });
}

function pushHud(state: GameState, line: string, color = '#8ff'): void {
  state.msgs.push(msg(line, state.time, color));
}

function currentTarget(world: World, player: Entity, state: GameState, def: VoidProtocolDef): VoidProtocolMark {
  const x = Math.floor(player.x);
  const y = Math.floor(player.y);
  const ci = world.idx(x, y);
  const room = world.roomAt(player.x, player.y);
  const roomId = room?.id ?? -1;
  const zoneId = world.zoneMap[ci] ?? -1;
  const targetKey = `${state.currentFloor}:${def.scope}:${roomId}:${x}:${y}`;
  return {
    id: nextMarkId++,
    protocolId: def.id,
    x,
    y,
    roomId,
    zoneId,
    targetKey,
    startedAt: state.time,
    expiresAt: state.time + def.durationSec,
    ended: false,
    originalRoomName: room?.name,
  };
}

function forLocalCells(world: World, mark: VoidProtocolMark, fn: (x: number, y: number, ci: number) => void): void {
  const room = mark.roomId >= 0 ? world.rooms[mark.roomId] : undefined;
  if (room) {
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        const x = world.wrap(room.x + dx);
        const y = world.wrap(room.y + dy);
        fn(x, y, world.idx(x, y));
      }
    }
    return;
  }

  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dy * dy > 16) continue;
      const x = world.wrap(mark.x + dx);
      const y = world.wrap(mark.y + dy);
      fn(x, y, world.idx(x, y));
    }
  }
}

function eventHasTags(event: WorldEvent, ...tags: string[]): boolean {
  return tags.every(tag => event.tags.includes(tag));
}

function findLocalRuleChamber(event: WorldEvent): VoidRuleChamberContext | undefined {
  const containerId = event.containerId;
  if (containerId === undefined) return undefined;
  for (let i = localRuleChambers.length - 1; i >= 0; i--) {
    const ctx = localRuleChambers[i];
    if (ctx.acceptContainerId === containerId || ctx.rejectContainerId === containerId) return ctx;
  }
  return undefined;
}

function eventContainer(ctx: VoidRuleChamberContext, event: WorldEvent): WorldContainer | undefined {
  return event.containerId === undefined ? undefined : ctx.world.containerById.get(event.containerId);
}

function addContainerTag(container: WorldContainer, tag: string): void {
  if (!container.tags.includes(tag)) container.tags.push(tag);
}

function containerChoiceMade(container: WorldContainer): boolean {
  return container.tags.includes(ACCEPTED_TAG) || container.tags.includes(REJECTED_TAG);
}

function chamberChoiceMade(ctx: VoidRuleChamberContext): boolean {
  const accept = ctx.world.containerById.get(ctx.acceptContainerId);
  const reject = ctx.world.containerById.get(ctx.rejectContainerId);
  return !!(accept && containerChoiceMade(accept)) || !!(reject && containerChoiceMade(reject));
}

function markChamberChoice(ctx: VoidRuleChamberContext, tag: string): void {
  const accept = ctx.world.containerById.get(ctx.acceptContainerId);
  const reject = ctx.world.containerById.get(ctx.rejectContainerId);
  if (accept) addContainerTag(accept, tag);
  if (reject) addContainerTag(reject, tag);
}

function playerInContext(ctx: VoidRuleChamberContext): Entity | undefined {
  return ctx.entities.find(e => e.type === EntityType.PLAYER && e.alive);
}

function markFromEvent(ctx: VoidRuleChamberContext, state: GameState, event: WorldEvent, def: VoidProtocolDef): VoidProtocolMark {
  const room = ctx.world.rooms[event.roomId ?? ctx.roomId] ?? ctx.world.rooms[ctx.roomId];
  const x = ctx.world.wrap(Math.floor(event.x ?? (room ? room.x + (room.w >> 1) : 0)));
  const y = ctx.world.wrap(Math.floor(event.y ?? (room ? room.y + (room.h >> 1) : 0)));
  const roomId = room?.id ?? event.roomId ?? ctx.roomId;
  const zoneId = event.zoneId ?? ctx.world.zoneMap[ctx.world.idx(x, y)] ?? -1;
  const targetKey = `${state.currentFloor}:void_rule:${def.id}:${roomId}:${event.containerId ?? 0}`;
  return {
    id: nextMarkId++,
    protocolId: def.id,
    x,
    y,
    roomId,
    zoneId,
    targetKey,
    startedAt: state.time,
    expiresAt: state.time + def.durationSec,
    ended: false,
    originalRoomName: room?.name,
  };
}

function spawnProtocolMonster(
  entities: Entity[],
  nextEntityId: { v: number },
  kind: MonsterKind,
  name: string,
  x: number,
  y: number,
  level: number,
): void {
  const def = MONSTERS[kind];
  const hp = Math.round(scaleMonsterHp(def.hp, level));
  entities.push({
    id: nextEntityId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, level),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
    phasing: kind === MonsterKind.SPIRIT,
  });
}

function nearestLevel(world: World, mark: VoidProtocolMark): number {
  const zone = mark.zoneId >= 0 ? world.zones[mark.zoneId] : undefined;
  return Math.max(1, zone?.level ?? 12);
}

function applySilence(world: World, mark: VoidProtocolMark): boolean {
  let changed = 0;
  forLocalCells(world, mark, (_x, _y, ci) => {
    if (world.features[ci] === Feature.LAMP || world.features[ci] === Feature.CANDLE) {
      world.features[ci] = Feature.NONE;
      changed++;
    }
  });
  if (changed > 0) world.bakeLights();
  return true;
}

function applyInvertedAccess(world: World, mark: VoidProtocolMark, durationSec: number): boolean {
  const room = mark.roomId >= 0 ? world.rooms[mark.roomId] : undefined;
  const candidates = room ? room.doors.slice(0, 6) : [];
  if (candidates.length === 0) {
    for (const [idx] of world.doors) {
      const x = idx % W;
      const y = (idx / W) | 0;
      if (world.dist2(mark.x, mark.y, x, y) <= 36) candidates.push(idx);
      if (candidates.length >= 6) break;
    }
  }
  if (candidates.length === 0) return false;

  for (const idx of candidates) {
    const door = world.doors.get(idx);
    if (!door) continue;
    if (door.state === DoorState.CLOSED) door.state = DoorState.OPEN;
    else if (door.state === DoorState.HERMETIC_CLOSED) door.state = DoorState.HERMETIC_OPEN;
    else if (door.state === DoorState.OPEN) door.state = DoorState.CLOSED;
    else if (door.state === DoorState.HERMETIC_OPEN) door.state = DoorState.HERMETIC_CLOSED;
    else if (door.state === DoorState.LOCKED) door.state = DoorState.OPEN;
    door.timer = durationSec;
  }
  return true;
}

function applyFalseSave(
  entities: Entity[],
  nextEntityId: { v: number },
  mark: VoidProtocolMark,
): boolean {
  const lines = [
    'П-46: сохранено локально. Не предъявлять лифту.',
    'П-46: запись принята до первого вопроса.',
  ];
  for (let i = 0; i < lines.length; i++) {
    entities.push({
      id: nextEntityId.v++,
      type: EntityType.ITEM_DROP,
      x: mark.x + 0.5 + (i === 0 ? -0.7 : 0.7),
      y: mark.y + 0.5,
      angle: 0,
      pitch: 0,
      alive: true,
      speed: 0,
      sprite: Spr.ITEM_DROP,
      inventory: [{ defId: 'note', count: 1, data: { text: lines[i] } }],
    });
  }
  return true;
}

function applyMemoryEcho(
  world: World,
  entities: Entity[],
  nextEntityId: { v: number },
  mark: VoidProtocolMark,
): boolean {
  spawnProtocolMonster(entities, nextEntityId, MonsterKind.SPIRIT, 'Эхо памяти', mark.x + 1, mark.y, nearestLevel(world, mark));
  return true;
}

function applyPsiBacklash(world: World, player: Entity, entities: Entity[], state: GameState, mark: VoidProtocolMark): boolean {
  let hits = 0;
  for (const e of entities) {
    if (!e.alive || e.id === player.id) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
    if (world.dist2(mark.x, mark.y, e.x, e.y) > 81) continue;
    e.psiMadness = Math.max(e.psiMadness ?? 0, 12);
    if (e.ai) e.ai.combatTargetId = undefined;
    hits++;
  }
  if (player.hp !== undefined) {
    player.hp = Math.max(1, player.hp - 3);
    state.dmgFlash = Math.max(state.dmgFlash, 0.25);
  }
  return hits > 0 || player.hp !== undefined;
}

function applyFloorNameCorruption(world: World, mark: VoidProtocolMark): boolean {
  const room = mark.roomId >= 0 ? world.rooms[mark.roomId] : undefined;
  if (!room) return false;
  room.name = `Комната ${mark.id}: этаж не отвечает`;
  return true;
}

function applyBorrowedLight(world: World, mark: VoidProtocolMark): boolean {
  let changedFog = 0;
  let changedDoors = 0;
  forLocalCells(world, mark, (_x, _y, ci) => {
    if (world.fog[ci] < 22) {
      world.fog[ci] = 22;
      changedFog++;
    }
  });
  if (changedFog > 0) world.markFogDirty();

  const room = mark.roomId >= 0 ? world.rooms[mark.roomId] : undefined;
  if (room) {
    for (const doorIdx of room.doors.slice(0, 4)) {
      const door = world.doors.get(doorIdx);
      if (!door) continue;
      if (door.state === DoorState.OPEN) door.state = DoorState.CLOSED;
      else if (door.state === DoorState.HERMETIC_OPEN) door.state = DoorState.HERMETIC_CLOSED;
      door.timer = Math.max(door.timer, 12);
      changedDoors++;
    }
  }

  return changedFog > 0 || changedDoors > 0;
}

function applyBorrowedLightBacklash(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  mark: VoidProtocolMark,
): void {
  if (player.hp !== undefined) {
    player.hp = Math.max(1, player.hp - 2);
    state.dmgFlash = Math.max(state.dmgFlash, 0.2);
  }
  for (const e of entities) {
    if (!e.alive || e.id === player.id) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
    if (world.dist2(mark.x, mark.y, e.x, e.y) > 64) continue;
    e.psiMadness = Math.max(e.psiMadness ?? 0, 6);
  }
}

function applySpiritToll(
  world: World,
  player: Entity,
  entities: Entity[],
  nextEntityId: { v: number },
  mark: VoidProtocolMark,
): boolean {
  if (player.money !== undefined && player.money > 0) player.money = Math.max(0, player.money - 5);
  spawnProtocolMonster(entities, nextEntityId, MonsterKind.SPIRIT, 'Счетчик пошлины', mark.x - 1, mark.y, nearestLevel(world, mark));
  return true;
}

function resolveBacklash(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  nextEntityId: { v: number },
  def: VoidProtocolDef,
  mark: VoidProtocolMark,
): void {
  switch (def.effect) {
    case 'false_save':
      spawnProtocolMonster(entities, nextEntityId, MonsterKind.PARAGRAPH, 'Ложная строка', mark.x, mark.y + 1, nearestLevel(world, mark));
      break;
    case 'memory_echo':
      spawnProtocolMonster(entities, nextEntityId, MonsterKind.NELYUD, 'Чужая память', mark.x - 1, mark.y, nearestLevel(world, mark));
      break;
    case 'spirit_toll':
      spawnProtocolMonster(entities, nextEntityId, MonsterKind.SPIRIT, 'Сдача пошлины', mark.x + 1, mark.y + 1, nearestLevel(world, mark));
      break;
    case 'silence':
      forLocalCells(world, mark, (_x, _y, ci) => {
        if (world.fog[ci] < 20 && Math.random() < 0.04) world.fog[ci] = 20;
      });
      world.markFogDirty();
      break;
    case 'inverted_access':
      if (player.hp !== undefined) {
        player.hp = Math.max(1, player.hp - 1);
        state.dmgFlash = Math.max(state.dmgFlash, 0.15);
      }
      break;
    case 'borrowed_light':
      applyBorrowedLightBacklash(world, player, entities, state, mark);
      break;
    case 'psi_backlash':
      if (player.hp !== undefined) {
        player.hp = Math.max(1, player.hp - 4);
        state.dmgFlash = Math.max(state.dmgFlash, 0.35);
      }
      break;
    case 'floor_name_corruption': {
      const room = mark.roomId >= 0 ? world.rooms[mark.roomId] : undefined;
      if (room) room.sealed = !room.sealed;
      break;
    }
  }

  publishProtocolEvent(state, def, 'backlash', def.backlashLine, mark, 4);
  pushHud(state, def.backlashLine, '#f8c');
}

function endMark(world: World, state: GameState, mark: VoidProtocolMark): void {
  if (mark.ended) return;
  mark.ended = true;
  const def = getVoidProtocolDef(mark.protocolId);
  if (!def) return;
  if (def.effect === 'floor_name_corruption' && mark.originalRoomName) {
    const room = mark.roomId >= 0 ? world.rooms[mark.roomId] : undefined;
    if (room) room.name = mark.originalRoomName;
  }
  publishProtocolEvent(state, def, 'ended', def.endLine, mark);
  pushHud(state, def.endLine, '#8cf');
}

export function expireVoidProtocolMarks(world: World, state: GameState): void {
  for (const mark of activeMarks) {
    if (!mark.ended && state.time >= mark.expiresAt) endMark(world, state, mark);
  }
}

export function grantVoidProtocol(state: GameState, protocolId: string, source = 'debug'): boolean {
  const def = getVoidProtocolDef(protocolId);
  if (!def || ownedProtocols.has(protocolId)) return false;
  ownedProtocols.add(protocolId);
  publishProtocolEvent(state, def, 'obtained', `Получен протокол: ${def.name}`, null, 3);
  pushHud(state, `Получен протокол: ${def.name}`, '#8ff');
  pushTrace(state, def.id, 'obtained', source, `${state.currentFloor}:grant:${source}`);
  return true;
}

export function applyVoidProtocol(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  nextEntityId: { v: number },
  protocolId: string,
): boolean {
  const def = getVoidProtocolDef(protocolId);
  if (!def) return false;
  if (!ownedProtocols.has(protocolId)) grantVoidProtocol(state, protocolId, 'auto');
  const cooldown = cooldownUntil.get(protocolId) ?? 0;
  if (cooldown > state.time) {
    publishProtocolEvent(state, def, 'rejected', `Кулдаун ${Math.ceil(cooldown - state.time)}с`, null, 2);
    pushHud(state, `[VOID] ${def.name}: кулдаун ${Math.ceil(cooldown - state.time)}с`, '#888');
    return false;
  }

  const mark = currentTarget(world, player, state, def);
  let applied = false;
  switch (def.effect) {
    case 'silence':
      applied = applySilence(world, mark);
      break;
    case 'inverted_access':
      applied = applyInvertedAccess(world, mark, def.durationSec);
      break;
    case 'false_save':
      applied = applyFalseSave(entities, nextEntityId, mark);
      break;
    case 'memory_echo':
      applied = applyMemoryEcho(world, entities, nextEntityId, mark);
      break;
    case 'psi_backlash':
      applied = applyPsiBacklash(world, player, entities, state, mark);
      break;
    case 'floor_name_corruption':
      applied = applyFloorNameCorruption(world, mark);
      break;
    case 'borrowed_light':
      applied = applyBorrowedLight(world, mark);
      break;
    case 'spirit_toll':
      applied = applySpiritToll(world, player, entities, nextEntityId, mark);
      break;
  }

  if (!applied) {
    publishProtocolEvent(state, def, 'rejected', 'Нет локальной цели', mark, 2);
    pushHud(state, `[VOID] ${def.name}: нет локальной цели`, '#888');
    return false;
  }

  activeMarks.push(mark);
  if (activeMarks.length > MARK_CAP) activeMarks.splice(0, activeMarks.length - MARK_CAP);
  cooldownUntil.set(protocolId, state.time + def.cooldownSec);
  publishProtocolEvent(state, def, 'started', def.startLine, mark, 4);
  pushHud(state, def.startLine, '#8ff');
  resolveBacklash(world, player, entities, state, nextEntityId, def, mark);
  return true;
}

function grantBorrowedLightReward(player: Entity, state: GameState): void {
  const stabilizer = addItem(player, 'psi_stabilizer', 1);
  const energy = addItem(player, 'ammo_energy', 2);
  if (stabilizer || energy) pushHud(state, 'Протокол выдал стабилизатор и энергоячейки.', '#8ff');
  else pushHud(state, 'Протокол щелкнул: рюкзак не принял награду.', '#f84');
}

function acceptBorrowedLightRule(ctx: VoidRuleChamberContext, state: GameState, event: WorldEvent): void {
  if (!eventContainer(ctx, event) || chamberChoiceMade(ctx)) return;
  const player = playerInContext(ctx);
  const def = getVoidProtocolDef(BORROWED_LIGHT_PROTOCOL_ID);
  if (!player || !def) return;

  markChamberChoice(ctx, ACCEPTED_TAG);
  grantVoidProtocol(state, def.id, 'borrowed_light_chamber');
  grantBorrowedLightReward(player, state);

  const mark = markFromEvent(ctx, state, event, def);
  activeMarks.push(mark);
  if (activeMarks.length > MARK_CAP) activeMarks.splice(0, activeMarks.length - MARK_CAP);
  cooldownUntil.set(def.id, state.time + def.cooldownSec);

  applyBorrowedLight(ctx.world, mark);
  publishProtocolEvent(state, def, 'started', def.startLine, mark, 4);
  pushHud(state, def.startLine, '#8ff');

  applyBorrowedLightBacklash(ctx.world, player, ctx.entities, state, mark);
  publishProtocolEvent(state, def, 'backlash', def.backlashLine, mark, 4);
  pushHud(state, def.backlashLine, '#f8c');
}

function rejectBorrowedLightRule(ctx: VoidRuleChamberContext, state: GameState, event: WorldEvent): void {
  if (!eventContainer(ctx, event) || chamberChoiceMade(ctx)) return;
  const def = getVoidProtocolDef(BORROWED_LIGHT_PROTOCOL_ID);
  if (!def) return;
  markChamberChoice(ctx, REJECTED_TAG);
  const mark = markFromEvent(ctx, state, event, def);
  const line = 'Протокол отклонён. Свет остался своим.';
  publishProtocolEvent(state, def, 'rejected', line, mark, 2);
  pushHud(state, line, '#aaa');
}

function handleVoidLocalRuleEvent(state: GameState, event: WorldEvent): void {
  if (event.type !== 'container_opened' && event.type !== 'item_stolen') return;
  if (!eventHasTags(event, VOID_RULE_TAG, BORROWED_LIGHT_TAG)) return;
  const ctx = findLocalRuleChamber(event);
  if (!ctx) return;
  if (eventHasTags(event, ACCEPT_TAG)) {
    acceptBorrowedLightRule(ctx, state, event);
  } else if (eventHasTags(event, REJECT_TAG)) {
    rejectBorrowedLightRule(ctx, state, event);
  }
}

observeWorldEvents(handleVoidLocalRuleEvent);

export function debugForceVoidProtocol(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  nextEntityId: { v: number },
): string[] {
  expireVoidProtocolMarks(world, state);
  for (const def of VOID_PROTOCOLS) grantVoidProtocol(state, def.id, 'debug_all');
  const def = VOID_PROTOCOLS[debugProtocolCursor % VOID_PROTOCOLS.length];
  debugProtocolCursor++;
  applyVoidProtocol(world, player, entities, state, nextEntityId, def.id);
  return summarizeVoidProtocols(state);
}

export function summarizeVoidProtocols(state: GameState): string[] {
  const active = activeMarks.filter(mark => !mark.ended && mark.expiresAt > state.time);
  const owned = VOID_PROTOCOLS.filter(def => ownedProtocols.has(def.id)).map(def => def.id).join(', ') || 'none';
  const out = [
    `owned=${owned}`,
    `active=${active.length}/${MARK_CAP} traces=${traces.length}/${TRACE_CAP}`,
  ];
  for (const mark of active.slice(-4)) {
    out.push(`${mark.protocolId} ${Math.max(0, Math.ceil(mark.expiresAt - state.time))}с ${mark.targetKey}`);
  }
  const recent = traces.slice(-3);
  for (const tr of recent) out.push(`#${tr.id} ${tr.phase} ${tr.protocolId}: ${tr.text}`);
  return out;
}
