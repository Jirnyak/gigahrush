/* ── Hell PSI meat cache: finite cult trade/theft/fight POI ───── */

import {
  W, Cell, ContainerKind, Feature, FloorLevel, RoomType, Tex,
  type Entity, EntityType, AIGoal, Faction, Occupation, MonsterKind, QuestType,
  type Room, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { Spr } from '../../render/sprite_index';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { connectProtectedRoom, findClearArea, protectRoom, rng, stampRoom } from '../shared';

const ROOM_W = 15;
const ROOM_H = 11;
const KEEPER_ID = 'ag54_psi_cache_keeper';

const KEEPER_DEF: PlotNpcDef = {
  name: 'Федот Мясопев',
  isFemale: false,
  faction: Faction.CULTIST,
  occupation: Occupation.STOREKEEPER,
  sprite: Occupation.STOREKEEPER,
  hp: 360, maxHp: 360, money: 140, speed: 0.75,
  inventory: [
    { defId: 'psi_meat_hook', count: 1 },
    { defId: 'psi_dust', count: 1 },
    { defId: 'rawmeat', count: 2 },
  ],
  talkLines: [
    'Не трогай подвешенное мясо. Оно считает сдачу лучше меня.',
    'ПСИ тут не растёт. Его выжимают, закрывают и тратят один раз.',
    'Хочешь честно — принеси сырое мясо для хора. Хочешь быстро — ящик рядом.',
    'Кражу услышит пол. Я услышу после пола.',
  ],
  talkLinesPost: [
    'Склад похудел. Значит, кто-то выбрал вылазку вместо запасов.',
    'Голос в банке не открывай здесь. Здесь ему есть кому ответить.',
    'ПСИ кончилось — возвращайся с мясом, не с просьбой.',
  ],
};

registerSideQuest(KEEPER_ID, KEEPER_DEF, [
  {
    id: 'ag54_keeper_raw_meat_tithe',
    giverNpcId: KEEPER_ID,
    type: QuestType.FETCH,
    desc: 'Федот Мясопев: «Принеси четыре куска сырого мяса. За честный вклад дам стабилизатор, но не запас на новую жизнь.»',
    targetItem: 'rawmeat', targetCount: 4,
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    extraRewards: [{ defId: 'psi_dust', count: 1 }],
    relationDelta: 8, xpReward: 65, moneyReward: 25,
  },
]);

export function generatePsiMeatCache(
  world: World,
  entities: Entity[],
  nextId: { v: number },
): void {
  const origin = findCacheOrigin(world);
  const room = stampCacheRoom(world, origin.x, origin.y);
  decorateCacheRoom(world, room);

  const keeperId = spawnKeeper(world, entities, nextId, room);
  spawnGuard(world, entities, nextId, room, 3, ROOM_H - 3, 'Сторож Жил', 'rebar');
  spawnGuard(world, entities, nextId, room, ROOM_W - 4, ROOM_H - 3, 'Сторож Сухожил', 'psi_strike');

  addCacheContainer(world, room, keeperId);
  dropCacheFloorItems(world, entities, nextId, room);
  spawnMonsterPressure(world, entities, nextId, room);
}

function findCacheOrigin(world: World): { x: number; y: number } {
  const cx = W >> 1;
  const cy = W >> 1;
  const clear = findClearArea(world, cx, cy, ROOM_W, ROOM_H, 120, 260);
  if (clear) return clear;

  for (let attempt = 0; attempt < 2400; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = rng(90, 260);
    const x = world.wrap(cx + Math.round(Math.cos(angle) * dist));
    const y = world.wrap(cy + Math.round(Math.sin(angle) * dist));
    if (canReserve(world, x, y)) return { x, y };
  }

  return { x: world.wrap(cx + 170), y: world.wrap(cy - 130) };
}

function canReserve(world: World, x: number, y: number): boolean {
  for (let dy = -1; dy <= ROOM_H; dy++) {
    for (let dx = -1; dx <= ROOM_W; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.aptMask[ci] || world.cells[ci] === Cell.LIFT) return false;
    }
  }
  return true;
}

function stampCacheRoom(world: World, x: number, y: number): Room {
  const room = stampRoom(world, world.rooms.length, RoomType.STORAGE, x, y, ROOM_W, ROOM_H, -1);
  room.name = 'Мясной ПСИ-склад';
  room.wallTex = Tex.GUT;
  room.floorTex = Tex.F_MEAT;
  protectRoom(world, room.x, room.y, room.w, room.h, Tex.GUT, Tex.F_MEAT);
  connectProtectedRoom(world, room.x, room.y, room.w, room.h);
  forceCacheConnection(world, room);
  return room;
}

function forceCacheConnection(world: World, room: Room): void {
  if (hasExternalOpening(world, room)) return;

  const midX = room.x + Math.floor(room.w / 2);
  const midY = room.y + Math.floor(room.h / 2);
  const probes: [number, number, number, number][] = [
    [midX, room.y - 1, 0, -1],
    [midX, room.y + room.h, 0, 1],
    [room.x - 1, midY, -1, 0],
    [room.x + room.w, midY, 1, 0],
  ];
  let bestPath: number[] | null = null;

  for (const [sx, sy, dx, dy] of probes) {
    const path: number[] = [];
    let x = world.wrap(sx);
    let y = world.wrap(sy);
    for (let step = 0; step < 128; step++) {
      const ci = world.idx(x, y);
      if (world.cells[ci] === Cell.LIFT) break;
      if (step > 0 && world.aptMask[ci]) break;
      const walkable = world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.DOOR || world.cells[ci] === Cell.WATER;
      if (step > 0 && walkable && world.roomMap[ci] !== room.id) {
        if (!bestPath || path.length < bestPath.length) bestPath = [...path];
        break;
      }
      path.push(ci);
      x = world.wrap(x + dx);
      y = world.wrap(y + dy);
    }
  }

  if (!bestPath) return;
  for (const ci of bestPath) {
    if (world.cells[ci] === Cell.LIFT) continue;
    world.cells[ci] = Cell.FLOOR;
    world.floorTex[ci] = Tex.F_GUT;
    world.wallTex[ci] = 0;
    world.aptMask[ci] = 0;
    world.roomMap[ci] = -1;
    world.features[ci] = Feature.NONE;
  }
}

function hasExternalOpening(world: World, room: Room): boolean {
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const x = world.wrap(room.x + dx);
      const y = world.wrap(room.y + dy);
      const ci = world.idx(x, y);
      if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.DOOR) continue;
      if (world.aptMask[ci]) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (world.roomMap[world.idx(x + ox, y + oy)] === room.id) return true;
      }
    }
  }
  return false;
}

function decorateCacheRoom(world: World, room: Room): void {
  for (let dy = 1; dy < room.h - 1; dy++) {
    for (let dx = 1; dx < room.w - 1; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (((dx * 17 + dy * 11) & 3) === 0) world.floorTex[ci] = Tex.F_GUT;
    }
  }

  placeFeature(world, room.x + 2, room.y + 2, Feature.CANDLE);
  placeFeature(world, room.x + room.w - 3, room.y + 2, Feature.CANDLE);
  placeFeature(world, room.x + Math.floor(room.w / 2), room.y + 2, Feature.LAMP);
  placeFeature(world, room.x + 3, room.y + 5, Feature.SHELF);
  placeFeature(world, room.x + room.w - 4, room.y + 5, Feature.SHELF);
  placeFeature(world, room.x + Math.floor(room.w / 2), room.y + 5, Feature.APPARATUS);
  placeFeature(world, room.x + 5, room.y + room.h - 3, Feature.TABLE);
  placeFeature(world, room.x + room.w - 6, room.y + room.h - 3, Feature.TABLE);

  world.stamp(room.x + 7, room.y + 5, 0.5, 0.5, 5, 150, 54054, 120, 20, 105, false);
}

function placeFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) world.features[ci] = feature;
}

function spawnKeeper(world: World, entities: Entity[], nextId: { v: number }, room: Room): number {
  const x = world.wrap(room.x + Math.floor(room.w / 2));
  const y = world.wrap(room.y + room.h - 4);
  const id = nextId.v++;
  entities.push({
    id,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle: -Math.PI / 2,
    pitch: 0,
    alive: true,
    speed: KEEPER_DEF.speed,
    sprite: KEEPER_DEF.sprite,
    name: KEEPER_DEF.name,
    isFemale: KEEPER_DEF.isFemale,
    needs: freshNeeds(),
    hp: KEEPER_DEF.hp,
    maxHp: KEEPER_DEF.maxHp,
    money: KEEPER_DEF.money,
    ai: { goal: AIGoal.IDLE, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: KEEPER_DEF.inventory.map(i => ({ ...i })),
    weapon: 'psi_meat_hook',
    faction: KEEPER_DEF.faction,
    occupation: KEEPER_DEF.occupation,
    plotNpcId: KEEPER_ID,
    canGiveQuest: true,
    questId: -1,
    rpg: { level: 9, xp: 0, attrPoints: 0, str: 5, agi: 4, int: 9, psi: 40, maxPsi: 40 },
  });
  return id;
}

function spawnGuard(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  room: Room,
  dx: number,
  dy: number,
  name: string,
  weapon: string,
): void {
  const x = world.wrap(room.x + dx);
  const y = world.wrap(room.y + dy);
  const inventory = weapon === 'psi_strike'
    ? [{ defId: 'psi_strike', count: 1 }, { defId: 'knife', count: 1 }]
    : [{ defId: weapon, count: 1 }, { defId: 'meat_rune', count: 1 }];
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: 1.0,
    sprite: Occupation.PILGRIM,
    name,
    needs: freshNeeds(),
    hp: 210,
    maxHp: 210,
    money: 8,
    ai: { goal: AIGoal.IDLE, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory,
    weapon,
    faction: Faction.CULTIST,
    occupation: Occupation.PILGRIM,
    questId: -1,
    rpg: { level: 7, xp: 0, attrPoints: 0, str: 5, agi: 3, int: 6, psi: 22, maxPsi: 22 },
  });
}

function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(c => c.id === id)) id++;
  return id;
}

function addCacheContainer(world: World, room: Room, ownerNpcId: number): void {
  const x = world.wrap(room.x + Math.floor(room.w / 2));
  const y = world.wrap(room.y + 5);
  const inventory: WorldContainer['inventory'] = [
    { defId: 'bottled_voice', count: 1 },
    { defId: 'psi_dust', count: 1 },
    { defId: 'meat_rune', count: 1 },
    { defId: 'antidep', count: 1 },
    { defId: 'holy_water', count: 1 },
  ];
  world.addContainer({
    id: nextContainerId(world),
    x,
    y,
    floor: FloorLevel.HELL,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind: ContainerKind.SAFE,
    name: 'Влажный сейф мясного хора',
    inventory,
    capacitySlots: 8,
    ownerNpcId,
    ownerName: KEEPER_DEF.name,
    faction: Faction.CULTIST,
    access: 'owner',
    lockDifficulty: 4,
    discovered: true,
    tags: ['hell_psi_cache', 'psi', 'meat', 'voice', 'owner'],
  });
}

function dropCacheFloorItems(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  room: Room,
): void {
  dropItem(world, entities, nextId, room.x + 2, room.y + room.h - 3, 'rawmeat', 2);
  dropItem(world, entities, nextId, room.x + room.w - 3, room.y + room.h - 3, 'bandage', 1);
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: world.wrap(room.x + room.w - 4) + 0.5,
    y: world.wrap(room.y + 2) + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{
      defId: 'note',
      count: 1,
      data: 'Накладная: один голос, одна пыль, одна вода. Выдавать только за мясо или после кражи.',
    }],
  });
}

function dropItem(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  defId: string,
  count: number,
): void {
  const wx = world.wrap(x);
  const wy = world.wrap(y);
  if (world.cells[world.idx(wx, wy)] !== Cell.FLOOR) return;
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: wx + 0.5,
    y: wy + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count }],
  });
}

function spawnMonsterPressure(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  room: Room,
): void {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  const kinds = [MonsterKind.SHADOW, MonsterKind.POLZUN, MonsterKind.TVAR, MonsterKind.SPIRIT];
  for (let i = 0; i < kinds.length; i++) {
    const pos = findPressureCell(world, room, cx, cy, i, kinds.length);
    if (!pos) continue;
    const kind = kinds[i];
    const def = MONSTERS[kind];
    if (!def) continue;
    const ci = world.idx(pos.x, pos.y);
    const zid = world.zoneMap[ci];
    const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 10) : 10;
    const hp = scaleMonsterHp(def.hp, zoneLevel + 1);
    entities.push({
      id: nextId.v++,
      type: EntityType.MONSTER,
      x: pos.x + 0.5,
      y: pos.y + 0.5,
      angle: Math.atan2(cy - pos.y, cx - pos.x),
      pitch: 0,
      alive: true,
      speed: scaleMonsterSpeed(def.speed, zoneLevel),
      sprite: def.sprite,
      name: kind === MonsterKind.SHADOW ? 'Тень у сейфа' : undefined,
      hp,
      maxHp: hp,
      monsterKind: kind,
      attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: cx, ty: cy, path: [], pi: 0, stuck: 0, timer: 0 },
      rpg: randomRPG(zoneLevel + 1),
      phasing: kind === MonsterKind.SPIRIT,
    });
  }
}

function findPressureCell(
  world: World,
  room: Room,
  cx: number,
  cy: number,
  idx: number,
  total: number,
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 80; attempt++) {
    const angle = (Math.PI * 2 * (idx + attempt / 17)) / total;
    const dist = rng(5, 12);
    const x = world.wrap(cx + Math.round(Math.cos(angle) * dist));
    const y = world.wrap(cy + Math.round(Math.sin(angle) * dist));
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    if (world.roomMap[ci] === room.id) continue;
    return { x, y };
  }
  return null;
}
