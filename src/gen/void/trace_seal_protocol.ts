/* ── Void trace seal — local protocol backlash room ───────────── */

import {
  Cell, ContainerKind, DoorState, EntityType, AIGoal, Faction, Feature, FloorLevel,
  MonsterKind, Occupation, RoomType, Tex, msg,
  type Entity, type GameState, type Item, type WorldContainer, type WorldEvent, type WorldEventType,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { publishEvent, registerWorldEventObserver as observeWorldEvents } from '../../systems/events';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { carveCorridor, findClearArea, placeDoorAt, stampRoom } from '../shared';

const CLERK_ID = 'floor20_void_protocol_clerk';
const NEIGHBOR_ID = 'floor20_void_borrowed_neighbor';
const PROTOCOL_ID = 'trace_seal';
const PROTOCOL_NAME = 'Запечатать след';
const TAG_RULE = 'void_rule';
const TAG_PROTOCOL = 'trace_seal';
const TAG_SEAL = 'seal';
const TAG_ERASE = 'erase';
const TAG_DONE = 'resolved';
const CONTEXT_CAP = 8;

const CLERK_DEF: PlotNpcDef = {
  name: 'Клерк пустотного протокола',
  isFemale: false,
  faction: Faction.SCIENTIST,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 180,
  maxHp: 180,
  money: 0,
  speed: 0.8,
  inventory: [{ defId: 'note', count: 1 }],
  talkLines: [
    'Форма короткая: запечатать след или стереть его. Третьего окна нет.',
    'Цель уже выбрана. Не ищите её по дому: это плохо масштабируется.',
    'Запечатаете след — дверь выдержит. Дом возьмёт соседний проход.',
  ],
  talkLinesPost: [
    'Если протокол понятен длиннее одной строки, протокол вреден.',
    'Черный ящик пишет только то, что можно потом предъявить стене.',
  ],
};

const NEIGHBOR_DEF: PlotNpcDef = {
  name: 'Соседка, взятая взаймы',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.HOUSEWIFE,
  sprite: Occupation.HOUSEWIFE,
  hp: 120,
  maxHp: 120,
  money: 4,
  speed: 0.9,
  inventory: [{ defId: 'bread', count: 1 }],
  talkLines: [
    'Я только открыла дверь на площадке. Теперь я здесь и дверь помнит не меня.',
    'Не стирай след просто чтобы было тише. Тишина потом приходит с квитанцией.',
    'Если запечатаешь, я хотя бы буду знать, какая дверь меня украла.',
  ],
  talkLinesPost: [
    'Соседний проход уже обиделся. Слышишь, как он молчит?',
    'Меня вернут не туда. Но хоть след останется с адресом.',
  ],
};

registerSideQuest(CLERK_ID, CLERK_DEF, []);
registerSideQuest(NEIGHBOR_ID, NEIGHBOR_DEF, []);

interface TraceSealContext {
  world: World;
  entities: Entity[];
  roomId: number;
  sealContainerId: number;
  eraseContainerId: number;
  targetDoorIdx: number;
  backlashDoorIdx: number;
}

const traceSealContexts: TraceSealContext[] = [];

function registerTraceSealContext(ctx: TraceSealContext): void {
  const existing = traceSealContexts.find(item => item.world === ctx.world && item.roomId === ctx.roomId);
  if (existing) {
    existing.entities = ctx.entities;
    existing.sealContainerId = ctx.sealContainerId;
    existing.eraseContainerId = ctx.eraseContainerId;
    existing.targetDoorIdx = ctx.targetDoorIdx;
    existing.backlashDoorIdx = ctx.backlashDoorIdx;
    return;
  }
  traceSealContexts.push(ctx);
  if (traceSealContexts.length > CONTEXT_CAP) traceSealContexts.splice(0, traceSealContexts.length - CONTEXT_CAP);
}

function eventHasTags(event: WorldEvent, ...tags: string[]): boolean {
  return tags.every(tag => event.tags.includes(tag));
}

function findTraceSealContext(event: WorldEvent): TraceSealContext | undefined {
  if (event.containerId === undefined) return undefined;
  for (let i = traceSealContexts.length - 1; i >= 0; i--) {
    const ctx = traceSealContexts[i];
    if (ctx.sealContainerId === event.containerId || ctx.eraseContainerId === event.containerId) return ctx;
  }
  return undefined;
}

function addContainerTag(container: WorldContainer | undefined, tag: string): void {
  if (container && !container.tags.includes(tag)) container.tags.push(tag);
}

function choiceAlreadyMade(ctx: TraceSealContext): boolean {
  const seal = ctx.world.containerById.get(ctx.sealContainerId);
  const erase = ctx.world.containerById.get(ctx.eraseContainerId);
  return !!(seal?.tags.includes(TAG_DONE) || erase?.tags.includes(TAG_DONE));
}

function markChoice(ctx: TraceSealContext, branch: string): void {
  const seal = ctx.world.containerById.get(ctx.sealContainerId);
  const erase = ctx.world.containerById.get(ctx.eraseContainerId);
  addContainerTag(seal, TAG_DONE);
  addContainerTag(erase, TAG_DONE);
  addContainerTag(seal, branch);
  addContainerTag(erase, branch);
}

function targetKey(ctx: TraceSealContext): string {
  return `void:door:${ctx.roomId}:${ctx.targetDoorIdx}`;
}

function pushHud(state: GameState, line: string, color: string): void {
  state.msgs.push(msg(line, state.time, color));
}

function publishProtocol(
  state: GameState,
  ctx: TraceSealContext,
  event: WorldEvent,
  phase: 'obtained' | 'started' | 'backlash' | 'rejected',
  line: string,
  severity: 2 | 3 | 4,
): void {
  publishEvent(state, {
    type: `void_protocol_${phase}` as WorldEventType,
    severity,
    privacy: phase === 'rejected' ? 'private' : 'local',
    zoneId: event.zoneId,
    roomId: ctx.roomId,
    x: event.x,
    y: event.y,
    actorId: 0,
    actorName: 'Вы',
    tags: ['void_protocol', phase, PROTOCOL_ID, 'black_box'].slice(0, 8),
    data: {
      protocolId: PROTOCOL_ID,
      protocolName: PROTOCOL_NAME,
      targetKey: targetKey(ctx),
      sourceContainerId: event.containerId,
    },
  });
  pushHud(state, line, phase === 'backlash' ? '#f8c' : '#8ff');
}

function playerInContext(ctx: TraceSealContext): Entity | undefined {
  return ctx.entities.find(e => e.type === EntityType.PLAYER && e.alive);
}

function nextEntityId(entities: Entity[]): number {
  let id = 1;
  for (const e of entities) id = Math.max(id, e.id + 1);
  return id;
}

function spawnBacklashParagraph(ctx: TraceSealContext): void {
  const world = ctx.world;
  const room = world.rooms[ctx.roomId];
  if (!room) return;
  const kind = MonsterKind.PARAGRAPH;
  const def = MONSTERS[kind];
  if (!def) return;
  const x = world.wrap(room.x + room.w - 3);
  const y = world.wrap(room.y + room.h - 3);
  if (world.cells[world.idx(x, y)] !== Cell.FLOOR) return;
  const zoneId = world.zoneMap[world.idx(x, y)];
  const level = Math.max(14, world.zones[zoneId]?.level ?? 14);
  const hp = Math.round(scaleMonsterHp(def.hp, level));
  ctx.entities.push({
    id: nextEntityId(ctx.entities),
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, level),
    sprite: monsterSpr(kind),
    name: 'Параграф черного ящика',
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
  });
}

function sealTraceTarget(ctx: TraceSealContext): void {
  const room = ctx.world.rooms[ctx.roomId];
  if (room) room.sealed = true;
  const target = ctx.world.doors.get(ctx.targetDoorIdx);
  if (target) {
    target.state = DoorState.HERMETIC_CLOSED;
    target.timer = Math.max(target.timer, 90);
  }
  const backlash = ctx.world.doors.get(ctx.backlashDoorIdx);
  if (backlash) {
    backlash.state = DoorState.HERMETIC_CLOSED;
    backlash.timer = Math.max(backlash.timer, 18);
  }
}

function eraseTraceTarget(ctx: TraceSealContext): void {
  const room = ctx.world.rooms[ctx.roomId];
  if (!room) return;
  room.sealed = false;
  const target = ctx.world.doors.get(ctx.targetDoorIdx);
  if (target) {
    target.state = DoorState.OPEN;
    target.timer = 0;
  }
  for (let dy = 1; dy < room.h - 1; dy++) {
    for (let dx = 1; dx < room.w - 1; dx++) {
      const ci = ctx.world.idx(room.x + dx, room.y + dy);
      if (ctx.world.features[ci] === Feature.SCREEN || ctx.world.features[ci] === Feature.APPARATUS) {
        ctx.world.features[ci] = Feature.NONE;
      }
    }
  }
}

function applyTraceSeal(ctx: TraceSealContext, state: GameState, event: WorldEvent): void {
  markChoice(ctx, 'sealed');
  sealTraceTarget(ctx);
  publishProtocol(state, ctx, event, 'obtained', `Получен протокол: ${PROTOCOL_NAME}.`, 3);
  publishProtocol(state, ctx, event, 'started', 'След запечатан. Цель держит адрес.', 4);
  spawnBacklashParagraph(ctx);
  const player = playerInContext(ctx);
  if (player?.hp !== undefined) {
    player.hp = Math.max(1, player.hp - 1);
    state.dmgFlash = Math.max(state.dmgFlash, 0.12);
  }
  publishProtocol(state, ctx, event, 'backlash', 'Отдача: соседний проход молчит.', 4);
}

function applyTraceErase(ctx: TraceSealContext, state: GameState, event: WorldEvent): void {
  markChoice(ctx, 'erased');
  eraseTraceTarget(ctx);
  publishProtocol(state, ctx, event, 'obtained', `Получен протокол: ${PROTOCOL_NAME}.`, 3);
  publishProtocol(state, ctx, event, 'started', 'След стерт. Цель больше не спорит.', 3);
  const player = playerInContext(ctx);
  if (player) player.psiMadness = Math.max(player.psiMadness ?? 0, 4);
  publishProtocol(state, ctx, event, 'backlash', 'Отдача: память ищет нового жильца.', 3);
}

function handleTraceSealEvent(state: GameState, event: WorldEvent): void {
  if (event.type !== 'container_opened' && event.type !== 'item_stolen') return;
  if (!eventHasTags(event, TAG_RULE, TAG_PROTOCOL)) return;
  const ctx = findTraceSealContext(event);
  if (!ctx) return;
  if (choiceAlreadyMade(ctx)) {
    publishProtocol(state, ctx, event, 'rejected', 'Протокол уже выбран.', 2);
    return;
  }
  if (eventHasTags(event, TAG_SEAL)) applyTraceSeal(ctx, state, event);
  else if (eventHasTags(event, TAG_ERASE)) applyTraceErase(ctx, state, event);
}

observeWorldEvents(handleTraceSealEvent);

function setVoidRoomTextures(world: World, rx: number, ry: number, rw: number, rh: number): void {
  for (let dy = -1; dy <= rh; dy++) {
    for (let dx = -1; dx <= rw; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      if (dx >= 0 && dx < rw && dy >= 0 && dy < rh) {
        world.floorTex[ci] = Tex.F_VOID;
      } else {
        world.wallTex[ci] = Tex.VOID_WALL;
      }
    }
  }
}

function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(c => c.id === id)) id++;
  return id;
}

function addTraceContainer(
  world: World,
  roomId: number,
  x: number,
  y: number,
  name: string,
  inventory: Item[],
  tags: string[],
): number {
  const id = nextContainerId(world);
  const container: WorldContainer = {
    id,
    x: world.wrap(x),
    y: world.wrap(y),
    floor: FloorLevel.VOID,
    roomId,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind: ContainerKind.SECRET_STASH,
    name,
    inventory,
    capacitySlots: 3,
    access: 'public',
    discovered: true,
    tags,
  };
  world.addContainer(container);
  return id;
}

function spawnProtocolNpc(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,
  def: PlotNpcDef,
  x: number,
  y: number,
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: world.wrap(x) + 0.5,
    y: world.wrap(y) + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    name: def.name,
    isFemale: def.isFemale,
    needs: freshNeeds(),
    hp: def.hp,
    maxHp: def.maxHp,
    money: def.money,
    ai: { goal: AIGoal.IDLE, tx: world.wrap(x) + 0.5, ty: world.wrap(y) + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: def.inventory.map(item => ({ ...item })),
    faction: def.faction,
    occupation: def.occupation,
    plotNpcId,
    canGiveQuest: false,
    questId: -1,
  });
}

export function generateTraceSealProtocol(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  spawnX: number,
  spawnY: number,
): void {
  const sx = Math.floor(spawnX);
  const sy = Math.floor(spawnY);
  const rw = 15;
  const rh = 9;
  const pos = findClearArea(world, sx, sy, rw, rh, 34, 62);
  const rx = pos ? pos.x : world.wrap(sx + 44);
  const ry = pos ? pos.y : world.wrap(sy + 18);
  const room = stampRoom(world, world.rooms.length, RoomType.OFFICE, rx, ry, rw, rh, -1);
  room.name = 'Черный ящик подъезда';
  room.wallTex = Tex.VOID_WALL;
  room.floorTex = Tex.F_VOID;
  setVoidRoomTextures(world, room.x, room.y, room.w, room.h);

  const doorY = world.wrap(room.y + (room.h >> 1));
  placeDoorAt(world, room.x - 1, doorY, room.id);
  carveCorridor(world, sx, sy, room.x - 2, doorY);
  const entrance = world.doors.get(world.idx(room.x - 1, doorY));
  if (entrance) {
    entrance.state = DoorState.OPEN;
    entrance.timer = 0;
  }

  const targetY = world.wrap(room.y + 2);
  const backlashY = world.wrap(room.y + room.h - 3);
  placeDoorAt(world, room.x + room.w, targetY, room.id);
  placeDoorAt(world, room.x + room.w, backlashY, room.id);
  const targetDoorIdx = world.idx(room.x + room.w, targetY);
  const backlashDoorIdx = world.idx(room.x + room.w, backlashY);
  const targetDoor = world.doors.get(targetDoorIdx);
  const backlashDoor = world.doors.get(backlashDoorIdx);
  if (targetDoor) targetDoor.state = DoorState.HERMETIC_OPEN;
  if (backlashDoor) backlashDoor.state = DoorState.OPEN;

  for (let dx = 2; dx < room.w - 2; dx += 3) {
    world.features[world.idx(room.x + dx, room.y + 2)] = Feature.DESK;
  }
  world.features[world.idx(room.x + 1, room.y + 1)] = Feature.SCREEN;
  world.features[world.idx(room.x + room.w - 2, room.y + 1)] = Feature.APPARATUS;
  world.features[world.idx(room.x + 2, room.y + room.h - 2)] = Feature.LAMP;
  world.features[world.idx(room.x + room.w - 3, room.y + room.h - 2)] = Feature.LAMP;

  spawnProtocolNpc(world, entities, nextId, CLERK_ID, CLERK_DEF, room.x + 3, room.y + room.h - 3);
  spawnProtocolNpc(world, entities, nextId, NEIGHBOR_ID, NEIGHBOR_DEF, room.x + room.w - 4, room.y + room.h - 3);

  const sealContainerId = addTraceContainer(
    world,
    room.id,
    room.x + 5,
    room.y + (room.h >> 1),
    'Бланк: запечатать след',
    [{
      defId: 'note',
      count: 1,
      data: { text: 'ПРОТОКОЛ: запечатать выбранный след. Польза локальна. Отдача уйдет в соседний проход.' },
    }],
    [TAG_RULE, TAG_PROTOCOL, TAG_SEAL],
  );
  const eraseContainerId = addTraceContainer(
    world,
    room.id,
    room.x + room.w - 6,
    room.y + (room.h >> 1),
    'Бланк: стереть след',
    [{
      defId: 'note',
      count: 1,
      data: { text: 'ПРОТОКОЛ: стереть выбранный след. Цель замолчит, но память начнет искать жильца.' },
    }],
    [TAG_RULE, TAG_PROTOCOL, TAG_ERASE],
  );
  addTraceContainer(
    world,
    room.id,
    room.x + (room.w >> 1),
    room.y + 2,
    'Черный ящик: последний след',
    [{
      defId: 'note',
      count: 1,
      data: { text: `TRACE ${targetKey({ world, entities, roomId: room.id, sealContainerId, eraseContainerId, targetDoorIdx, backlashDoorIdx })}: цель назначена без поиска по этажу.` },
    }],
    ['void_trace', 'black_box', 'floor20_void'],
  );

  registerTraceSealContext({
    world,
    entities,
    roomId: room.id,
    sealContainerId,
    eraseContainerId,
    targetDoorIdx,
    backlashDoorIdx,
  });
}
