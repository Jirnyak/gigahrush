/* ── VOID afterprotocol runtime — bounded local rules ─────────── */

import { stampSurfaceSplat } from './surface_marks';
import {
  W, Cell, DoorState, EntityType, Feature, MonsterKind, AIGoal,
  type Entity, type GameState, type WorldEvent, type WorldContainer, type WorldEventType,
  msg,
} from '../core/types';
import { World } from '../core/world';
import { createWorldContextStore } from '../world/world_contexts';
import {
  VOID_PROTOCOLS,
  getVoidProtocolDef,
  type VoidProtocolDef,
} from '../data/void_protocols';
import { MONSTERS } from '../entities/monster';
import { monsterSpr, Spr } from '../entities/sprite_index';
import { recordPlayerDamage } from './damage';
import { setDoorState } from './door_state';
import { addItem } from './inventory';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from './rpg';
import { publishEvent, registerWorldEventObserver as observeWorldEvents } from './events';
import { canSpawnEntityType, entitySpawnSlots } from './entity_limits';
import { isPlayerEntity } from './player_actor';
import { mathRng, rng } from '../core/rand';
import { registerDebugCommand } from './debug_registry';

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
const VOID_PROTOCOL_RUMOR_ID = 'void_protocol_names';
const ownedProtocols = new Set<string>();
const cooldownUntil = new Map<string, number>();
const activeMarks: VoidProtocolMark[] = [];
const traces: VoidProtocolTrace[] = [];
let nextTraceId = 1;
let nextMarkId = 1;
let debugProtocolCursor = 0;

const BORROWED_LIGHT_PROTOCOL_ID = 'borrowed_light';
const VOID_RULE_TAG = 'void_rule';
const BORROWED_LIGHT_TAG = 'borrowed_light';
const CONSUME_TAG = 'consume';
const KEEP_TAG = 'keep';
const CONSUMED_TAG = 'consumed';
const KEPT_TAG = 'kept';

interface VoidRuleChamberContext {
  world: World;
  entities: Entity[];
  roomId: number;
  consumeContainerId: number;
  keepContainerId: number;
}


const localRuleChambers = createWorldContextStore<VoidRuleChamberContext>();

export function registerVoidBorrowedLightChamber(
  world: World,
  entities: Entity[],
  roomId: number,
  consumeContainerId: number,
  keepContainerId: number,
): void {
  localRuleChambers.register(
    world, roomId,
    { world, entities, roomId, consumeContainerId, keepContainerId },
    (existing, incoming) => {
      existing.entities = incoming.entities;
      existing.consumeContainerId = incoming.consumeContainerId;
      existing.keepContainerId = incoming.keepContainerId;
    },
  );
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
  extraTags: string[] = [],
  extraData: Record<string, unknown> = {},
): void {
  const targetKey = mark?.targetKey ?? `${state.currentZ}:protocol:${def.id}`;
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
    tags: ['void_protocol', phase, def.id, ...extraTags].slice(0, 8),
    data: {
      protocolId: def.id,
      protocolName: def.name,
      action: phase,
      publicText: line,
      ruleText: def.ruleLine,
      costText: def.costLine,
      backlashCause: def.backlashCauseLine,
      targetKey,
      expiresAt: mark?.expiresAt,
      rumorIds: phase === 'backlash' ? [VOID_PROTOCOL_RUMOR_ID] : undefined,
      ...extraData,
    },
  });
}

function pushHud(state: GameState, line: string, color = '#8ff'): void {
  state.msgs.push(msg(line, state.time, color));
}

function applyProtocolPlayerDamage(
  state: GameState,
  player: Entity,
  amount: number,
  detail: string,
  flash: number,
): number {
  if (player.hp === undefined || amount <= 0) return 0;
  const before = player.hp;
  player.hp = Math.max(1, player.hp - amount);
  const applied = Math.max(0, before - player.hp);
  if (applied > 0) {
    state.dmgFlash = Math.max(state.dmgFlash, flash);
    recordPlayerDamage(state, undefined, applied, detail, 'hazard');
  }
  return applied;
}

function obtainedProtocolLine(def: VoidProtocolDef): string {
  return `Получен протокол: ${def.name}. ${def.ruleLine} ${def.costLine}`;
}

function acceptedProtocolLine(def: VoidProtocolDef, action: string): string {
  return `Принято: ${def.name}. ${action} ${def.costLine} Отдача: ${def.backlashCauseLine}`;
}

function rejectedProtocolLine(def: VoidProtocolDef, reason: string): string {
  return `Отклонено: ${def.name}. Причина: ${reason}. ${def.ruleLine}`;
}

function currentTarget(world: World, player: Entity, state: GameState, def: VoidProtocolDef): VoidProtocolMark {
  const x = Math.floor(player.x);
  const y = Math.floor(player.y);
  const ci = world.idx(x, y);
  const room = world.roomAt(player.x, player.y);
  const roomId = room?.id ?? -1;
  const zoneId = world.zoneMap[ci] ?? -1;
  const targetKey = `${state.currentZ}:${def.scope}:${roomId}:${x}:${y}`;
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
  return localRuleChambers.find(ctx =>
    ctx.consumeContainerId === containerId || ctx.keepContainerId === containerId);
}


function eventContainer(ctx: { world: World }, event: WorldEvent): WorldContainer | undefined {
  return event.containerId === undefined ? undefined : ctx.world.containerById.get(event.containerId);
}

function addContainerTag(container: WorldContainer | undefined, tag: string): void {
  if (container && !container.tags.includes(tag)) container.tags.push(tag);
}

function containerChoiceMade(container: WorldContainer): boolean {
  return container.tags.includes(CONSUMED_TAG) || container.tags.includes(KEPT_TAG);
}

function chamberChoiceMade(ctx: VoidRuleChamberContext): boolean {
  const consume = ctx.world.containerById.get(ctx.consumeContainerId);
  const keep = ctx.world.containerById.get(ctx.keepContainerId);
  return !!(consume && containerChoiceMade(consume)) || !!(keep && containerChoiceMade(keep));
}

function markChamberChoice(ctx: VoidRuleChamberContext, tag: string): void {
  const consume = ctx.world.containerById.get(ctx.consumeContainerId);
  const keep = ctx.world.containerById.get(ctx.keepContainerId);
  addContainerTag(consume, tag);
  addContainerTag(keep, tag);
}



function playerInContext(ctx: { entities: Entity[] }): Entity | undefined {
  return ctx.entities.find(e => isPlayerEntity(e) && e.alive);
}

function markFromEvent(ctx: { world: World; roomId: number }, state: GameState, event: WorldEvent, def: VoidProtocolDef): VoidProtocolMark {
  const room = ctx.world.rooms[event.roomId ?? ctx.roomId] ?? ctx.world.rooms[ctx.roomId];
  const x = ctx.world.wrap(Math.floor(event.x ?? (room ? room.x + (room.w >> 1) : 0)));
  const y = ctx.world.wrap(Math.floor(event.y ?? (room ? room.y + (room.h >> 1) : 0)));
  const roomId = room?.id ?? event.roomId ?? ctx.roomId;
  const zoneId = event.zoneId ?? ctx.world.zoneMap[ctx.world.idx(x, y)] ?? -1;
  const targetKey = `${state.currentZ}:void_rule:${def.id}:${roomId}:${event.containerId ?? 0}`;
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
  if (!canSpawnEntityType(entities, EntityType.MONSTER)) return;
  const def = MONSTERS[kind];
  const hp = Math.round(scaleMonsterHp(def.hp, level));
  entities.push({
    id: nextEntityId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: mathRng() * Math.PI * 2,
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
  forLocalCells(world, mark, (_x, _y, ci) => {
    if (world.features[ci] === Feature.LAMP || world.features[ci] === Feature.CANDLE) {
      // Default rebakeLights: each snuffed source relights its own ±R window.
      // The old trailing markFeaturesDirty(true) was a full W² bake inside the
      // frame the player pressed E (Iron Law, optimization.md).
      world.setFeatureAt(ci, Feature.NONE);
    }
  });
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
    if (door.state === DoorState.CLOSED) setDoorState(world, door, DoorState.OPEN);
    else if (door.state === DoorState.HERMETIC_CLOSED) setDoorState(world, door, DoorState.HERMETIC_OPEN);
    else if (door.state === DoorState.OPEN) setDoorState(world, door, DoorState.CLOSED);
    else if (door.state === DoorState.HERMETIC_OPEN) setDoorState(world, door, DoorState.HERMETIC_CLOSED);
    else if (door.state === DoorState.LOCKED) setDoorState(world, door, DoorState.OPEN);
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
  const slots = entitySpawnSlots(entities, EntityType.ITEM_DROP, lines.length);
  if (slots <= 0) return false;
  for (let i = 0; i < slots; i++) {
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
    applyProtocolPlayerDamage(state, player, 3, 'Протокол ПСИ-отдачи прошел через вас: -3', 0.25);
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
      if (door.state === DoorState.OPEN) setDoorState(world, door, DoorState.CLOSED);
      else if (door.state === DoorState.HERMETIC_OPEN) setDoorState(world, door, DoorState.HERMETIC_CLOSED);
      door.timer = Math.max(door.timer, 12);
      changedDoors++;
    }
  }

  return changedFog > 0 || changedDoors > 0;
}

function markBorrowedLightReceipt(world: World, mark: VoidProtocolMark, kept: boolean): void {
  const room = mark.roomId >= 0 ? world.rooms[mark.roomId] : undefined;
  const x = room ? world.wrap(room.x + (room.w >> 1)) : mark.x;
  const y = room ? world.wrap(room.y + (room.h >> 1)) : mark.y;
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR) {
    world.setFeatureAt(ci, kept ? Feature.LAMP : Feature.SCREEN);
    stampSurfaceSplat(world, x, y, 0.5, 0.5, kept ? 0.54 : 0.42, kept ? 0.78 : 0.68, mark.id * 31 + (kept ? 7 : 3), kept ? 210 : 40, 245, kept ? 180 : 255, true);
  }
  if (room && !room.name.includes(kept ? 'улика' : 'потреблен')) {
    room.name = `${room.name}; свет ${kept ? 'улика' : 'потреблен'}`;
  }
}

function keepBorrowedLightEvidence(world: World, mark: VoidProtocolMark): void {
  const room = mark.roomId >= 0 ? world.rooms[mark.roomId] : undefined;
  if (room) {
    for (const doorIdx of room.doors.slice(0, 4)) {
      const door = world.doors.get(doorIdx);
      if (!door) continue;
      if (door.state === DoorState.CLOSED) {
        setDoorState(world, door, DoorState.OPEN);
      } else if (door.state === DoorState.HERMETIC_CLOSED) {
        setDoorState(world, door, DoorState.HERMETIC_OPEN);
      }
      door.timer = 0;
    }
  }
  // markBorrowedLightReceipt already relit the receipt lamp's own window through
  // setFeatureAt; the full W² bakeLights that stood here ran inside the frame a
  // publishEvent observer fired (Iron Law, optimization.md).
  markBorrowedLightReceipt(world, mark, true);
}

function applyBorrowedLightBacklash(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  mark: VoidProtocolMark,
): void {
  if (player.hp !== undefined) {
    applyProtocolPlayerDamage(state, player, 2, 'Отдача заемного света: -2', 0.2);
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
  publishProtocolEvent(state, def, 'backlash', def.backlashLine, mark, 4, [], {
    cause: def.backlashCauseLine,
  });
  pushHud(state, `${def.backlashLine} ${def.backlashCauseLine}`, '#f8c');

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
        if (world.fog[ci] < 20 && rng() < 0.04) world.fog[ci] = 20;
      });
      world.markFogDirty();
      break;
    case 'inverted_access':
      if (player.hp !== undefined) {
        applyProtocolPlayerDamage(state, player, 1, 'Отдача обратного допуска дернула руку: -1', 0.15);
      }
      break;
    case 'borrowed_light':
      applyBorrowedLightBacklash(world, player, entities, state, mark);
      break;
    case 'psi_backlash':
      if (player.hp !== undefined) {
        applyProtocolPlayerDamage(state, player, 4, 'ОТДАЧА: ПСИ-импульс вернулся вторым ударом: -4', 0.35);
      }
      break;
    case 'floor_name_corruption': {
      const room = mark.roomId >= 0 ? world.rooms[mark.roomId] : undefined;
      if (room) room.sealed = !room.sealed;
      break;
    }
  }
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
  const line = obtainedProtocolLine(def);
  publishProtocolEvent(state, def, 'obtained', line, null, 3, [], { source });
  pushHud(state, line, '#8ff');
  pushTrace(state, def.id, 'obtained', source, `${state.currentZ}:grant:${source}`);
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
    const seconds = Math.ceil(cooldown - state.time);
    const line = rejectedProtocolLine(def, `кулдаун ${seconds}с`);
    publishProtocolEvent(state, def, 'rejected', line, null, 2, [], { rejectReason: 'cooldown', cooldownRemainingSec: seconds });
    pushHud(state, `[VOID] ${line}`, '#888');
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
    const line = rejectedProtocolLine(def, 'нет локальной цели');
    publishProtocolEvent(state, def, 'rejected', line, mark, 2, [], { rejectReason: 'invalid_target' });
    pushHud(state, `[VOID] ${line}`, '#888');
    return false;
  }

  activeMarks.push(mark);
  if (activeMarks.length > MARK_CAP) activeMarks.splice(0, activeMarks.length - MARK_CAP);
  cooldownUntil.set(protocolId, state.time + def.cooldownSec);
  const line = acceptedProtocolLine(def, def.startLine);
  publishProtocolEvent(state, def, 'started', line, mark, 4, [], { resultLine: def.startLine });
  pushHud(state, line, '#8ff');
  resolveBacklash(world, player, entities, state, nextEntityId, def, mark);
  return true;
}

function grantBorrowedLightReward(player: Entity, state: GameState): void {
  const stabilizer = addItem(player, 'psi_stabilizer', 1);
  const energy = addItem(player, 'ammo_energy', 2);
  if (stabilizer || energy) pushHud(state, 'Протокол выдал стабилизатор и энергоячейки.', '#8ff');
  else pushHud(state, 'Протокол щелкнул: рюкзак не принял награду.', '#f84');
}
















function consumeBorrowedLightRule(ctx: VoidRuleChamberContext, state: GameState, event: WorldEvent): void {
  if (!eventContainer(ctx, event) || chamberChoiceMade(ctx)) return;
  const player = playerInContext(ctx);
  const def = getVoidProtocolDef(BORROWED_LIGHT_PROTOCOL_ID);
  if (!player || !def) return;

  markChamberChoice(ctx, CONSUMED_TAG);
  grantVoidProtocol(state, def.id, 'borrowed_light_chamber');
  grantBorrowedLightReward(player, state);

  const mark = markFromEvent(ctx, state, event, def);
  activeMarks.push(mark);
  if (activeMarks.length > MARK_CAP) activeMarks.splice(0, activeMarks.length - MARK_CAP);
  cooldownUntil.set(def.id, state.time + def.cooldownSec);

  applyBorrowedLight(ctx.world, mark);
  markBorrowedLightReceipt(ctx.world, mark, false);
  const accepted = acceptedProtocolLine(def, def.startLine);
  publishProtocolEvent(state, def, 'started', accepted, mark, 4, [CONSUME_TAG], {
    branch: CONSUME_TAG,
    rewardItemIds: ['psi_stabilizer', 'ammo_energy'],
    cost: 'door_psi_debt',
    resultLine: def.startLine,
  });
  pushHud(state, accepted, '#8ff');

  publishProtocolEvent(state, def, 'backlash', def.backlashLine, mark, 4, [CONSUME_TAG], {
    branch: CONSUME_TAG,
    cause: def.backlashCauseLine,
    debt: 'local_door_closure',
  });
  pushHud(state, def.backlashLine, '#f8c');
  applyBorrowedLightBacklash(ctx.world, player, ctx.entities, state, mark);
}

function keepBorrowedLightRule(ctx: VoidRuleChamberContext, state: GameState, event: WorldEvent): void {
  if (!eventContainer(ctx, event) || chamberChoiceMade(ctx)) return;
  const def = getVoidProtocolDef(BORROWED_LIGHT_PROTOCOL_ID);
  if (!def) return;
  markChamberChoice(ctx, KEPT_TAG);
  const mark = markFromEvent(ctx, state, event, def);
  keepBorrowedLightEvidence(ctx.world, mark);
  const line = 'Заемный свет оставлен уликой. Награды нет, двери не берут проценты.';
  const accepted = acceptedProtocolLine(def, line);
  publishProtocolEvent(state, def, 'started', accepted, mark, 3, [KEEP_TAG, 'evidence'], {
    branch: KEEP_TAG,
    counterplay: 'evidence_lamp_open_doors',
    resultLine: line,
  });
  pushHud(state, accepted, '#8cf');
}

function handleVoidLocalRuleEvent(state: GameState, event: WorldEvent): void {
  if (event.type !== 'container_opened' && event.type !== 'item_stolen') return;
  if (!eventHasTags(event, VOID_RULE_TAG)) return;
  if (eventHasTags(event, BORROWED_LIGHT_TAG)) {
    const ctx = findLocalRuleChamber(event);
    if (!ctx) return;
    if (eventHasTags(event, CONSUME_TAG)) {
      consumeBorrowedLightRule(ctx, state, event);
    } else if (eventHasTags(event, KEEP_TAG)) {
      keepBorrowedLightRule(ctx, state, event);
    }
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

/* ── Отладка ──────────────────────────────────────────────────
 * Команда живёт рядом со своей системой: меню собирает реестр, а не список в
 * debug.ts. Чтобы добавить ещё одну, допишите ещё один registerDebugCommand. */

registerDebugCommand({
  /* VOID protocols: grant/apply/list bounded state */
  id: 'void_protocols',
  group: 'route',
  label: 'VOID: форс/список',
  run: ({ world, player, entities, state, nextEntityId }) => {
    for (const line of debugForceVoidProtocol(world, player, entities, state, nextEntityId)) {
      state.msgs.push(msg(`[VOID] ${line}`, state.time, '#8ff'));
    }
  },
});
