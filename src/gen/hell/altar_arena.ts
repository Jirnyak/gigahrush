/* ── Hell altar arena: capped combat POI ─────────────────────── */

import {
  W, Cell, DoorState, EntityType, AIGoal, Faction, Feature, FloorLevel,
  MonsterKind, Occupation, RoomType, Tex,
  type Entity, type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds, randomName } from '../../data/catalog';
import { MONSTERS, applyMonsterVariant } from '../../entities/monster';
import { getMaxHp, gaussianLevel, randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { Spr } from '../../render/sprite_index';
import { findClearArea, protectRoom, stampRoom } from '../shared';

const ROOM_W = 23;
const ROOM_H = 19;
const ROUTE_MAX = 80;
const SCREEN_VARIANT_VOID_PROTOCOL = 7;
const SCREEN_FRAMES = 4;

export const HELL_ALTAR_ARENA_MONSTER_CAP = 9;
export const HELL_ALTAR_ARENA_CULTIST_CAP = 4;
export const HELL_ALTAR_ARENA_TOTAL_HOSTILE_CAP = HELL_ALTAR_ARENA_MONSTER_CAP + HELL_ALTAR_ARENA_CULTIST_CAP;

interface Site {
  x: number;
  y: number;
}

interface Route {
  doorX: number;
  doorY: number;
  outX: number;
  outY: number;
  stepX: number;
  stepY: number;
  perpX: number;
  perpY: number;
}

const MONSTER_PLACEMENTS: readonly { kind: MonsterKind; dx: number; dy: number; name?: string; bonus: number }[] = [
  { kind: MonsterKind.NIGHTMARE, dx: 11, dy: 5, name: 'Кошмарище алтаря', bonus: 4 },
  { kind: MonsterKind.EYE, dx: 5, dy: 5, bonus: 3 },
  { kind: MonsterKind.EYE, dx: 17, dy: 5, bonus: 3 },
  { kind: MonsterKind.SHADOW, dx: 4, dy: 10, bonus: 2 },
  { kind: MonsterKind.SHADOW, dx: 18, dy: 10, bonus: 2 },
  { kind: MonsterKind.POLZUN, dx: 7, dy: 14, bonus: 2 },
  { kind: MonsterKind.REBAR, dx: 15, dy: 14, bonus: 2 },
  { kind: MonsterKind.TVAR, dx: 8, dy: 8, bonus: 1 },
  { kind: MonsterKind.TVAR, dx: 14, dy: 8, bonus: 1 },
];

const CULTIST_PLACEMENTS: readonly [number, number][] = [
  [3, 3], [19, 3], [3, 15], [19, 15],
];

export function spawnHellAltarArena(world: World, entities: Entity[], nextId: { v: number }): void {
  const site = findArenaSite(world);
  if (!site) return;

  const room = stampRoom(world, world.rooms.length, RoomType.COMMON, site.x, site.y, ROOM_W, ROOM_H, -1);
  room.name = 'Пепельный алтарь готовности';
  room.wallTex = Tex.GUT;
  room.floorTex = Tex.F_MEAT;
  protectRoom(world, room.x, room.y, room.w, room.h, Tex.GUT, Tex.F_MEAT);

  const route = bestRoute(world, room);
  carveArenaDoorRoute(world, room, route);
  decorateArena(world, room, route);
  spawnArenaMonsters(world, room, entities, nextId);
  spawnArenaCultists(world, room, entities, nextId);
  dropArenaReward(world, room, entities, nextId);
}

function findArenaSite(world: World): Site | null {
  const cx = W >> 1;
  const cy = W >> 1;
  const direct = findClearArea(world, cx, cy, ROOM_W, ROOM_H, 145, 320);
  if (direct && canStampArena(world, direct.x, direct.y)) return direct;

  for (let attempt = 0; attempt < 1600; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 130 + Math.random() * 280;
    const x = world.wrap(cx + Math.round(Math.cos(angle) * dist) - (ROOM_W >> 1));
    const y = world.wrap(cy + Math.round(Math.sin(angle) * dist) - (ROOM_H >> 1));
    if (canStampArena(world, x, y)) return { x, y };
  }

  for (let attempt = 0; attempt < 1200; attempt++) {
    const x = Math.floor(Math.random() * W);
    const y = Math.floor(Math.random() * W);
    if (canStampArena(world, x, y)) return { x, y };
  }
  return null;
}

function canStampArena(world: World, x: number, y: number): boolean {
  for (let dy = -3; dy <= ROOM_H + 3; dy++) {
    for (let dx = -3; dx <= ROOM_W + 3; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.aptMask[ci] || world.cells[ci] === Cell.LIFT || world.roomMap[ci] >= 0) return false;
    }
  }
  return true;
}

function bestRoute(world: World, room: Room): Route {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  const routes: readonly Route[] = [
    { doorX: cx, doorY: room.y - 1, outX: cx, outY: room.y - 2, stepX: 0, stepY: -1, perpX: 1, perpY: 0 },
    { doorX: cx, doorY: room.y + room.h, outX: cx, outY: room.y + room.h + 1, stepX: 0, stepY: 1, perpX: 1, perpY: 0 },
    { doorX: room.x - 1, doorY: cy, outX: room.x - 2, outY: cy, stepX: -1, stepY: 0, perpX: 0, perpY: 1 },
    { doorX: room.x + room.w, doorY: cy, outX: room.x + room.w + 1, outY: cy, stepX: 1, stepY: 0, perpX: 0, perpY: 1 },
  ];
  let best = routes[0];
  let bestScore = Infinity;
  for (const route of routes) {
    const score = routeScore(world, route);
    if (score < bestScore) {
      best = route;
      bestScore = score;
    }
  }
  return best;
}

function routeScore(world: World, route: Route): number {
  for (let step = 1; step <= ROUTE_MAX; step++) {
    for (let side = -1; side <= 1; side++) {
      const x = route.outX + route.stepX * step + route.perpX * side;
      const y = route.outY + route.stepY * step + route.perpY * side;
      const ci = world.idx(x, y);
      if (world.aptMask[ci] || world.cells[ci] === Cell.LIFT || world.roomMap[ci] >= 0) return ROUTE_MAX + 20;
      if (world.cells[ci] === Cell.FLOOR) return step;
    }
  }
  return ROUTE_MAX + 10;
}

function carveArenaDoorRoute(world: World, room: Room, route: Route): void {
  const doorI = world.idx(route.doorX, route.doorY);
  world.cells[doorI] = Cell.DOOR;
  world.wallTex[doorI] = Tex.DOOR_METAL;
  world.aptMask[doorI] = 0;
  world.doors.set(doorI, {
    idx: doorI,
    state: DoorState.CLOSED,
    roomA: room.id,
    roomB: -1,
    keyId: '',
    timer: 0,
  });
  room.doors.push(doorI);

  for (let step = 0; step <= ROUTE_MAX; step++) {
    let touchesOpenFloor = false;
    for (let side = -1; side <= 1; side++) {
      const x = route.outX + route.stepX * step + route.perpX * side;
      const y = route.outY + route.stepY * step + route.perpY * side;
      const ci = world.idx(x, y);
      if (world.aptMask[ci] || world.cells[ci] === Cell.LIFT || world.roomMap[ci] >= 0) continue;
      if (step > 2 && world.cells[ci] === Cell.FLOOR) touchesOpenFloor = true;
      world.cells[ci] = Cell.FLOOR;
      world.floorTex[ci] = Tex.F_MEAT;
      world.aptMask[ci] = 0;
    }
    if (touchesOpenFloor) return;
  }
}

function decorateArena(world: World, room: Room, route: Route): void {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  setFeature(world, cx, cy, Feature.APPARATUS, 5);
  for (const [dx, dy] of [[0, -5], [4, -3], [5, 0], [4, 3], [0, 5], [-4, 3], [-5, 0], [-4, -3]] as const) {
    setFeature(world, cx + dx, cy + dy, Feature.CANDLE, 5);
  }
  setFeature(world, route.outX, route.outY, Feature.LAMP, 7);
  setFeature(world, route.outX + route.perpX * 2, route.outY + route.perpY * 2, Feature.CANDLE, 5);
  setFeature(world, route.outX - route.perpX * 2, route.outY - route.perpY * 2, Feature.CANDLE, 5);

  const screen = screenWallCell(world, room, route);
  if (screen >= 0) {
    world.features[screen] = Feature.SCREEN;
    world.wallTex[screen] = (Tex.SCREEN_BASE + SCREEN_VARIANT_VOID_PROTOCOL * SCREEN_FRAMES) as Tex;
  }

  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16;
    const x = Math.floor(cx + Math.cos(a) * 6);
    const y = Math.floor(cy + Math.sin(a) * 5);
    world.stamp(x, y, 0.5, 0.5, 0.34, 125, 5300 + i, 120, 22, 36);
  }
}

function screenWallCell(world: World, room: Room, route: Route): number {
  const oppositeX = room.x + (room.w >> 1) - route.stepX * ((room.w >> 1) + 1);
  const oppositeY = room.y + (room.h >> 1) - route.stepY * ((room.h >> 1) + 1);
  const ci = world.idx(oppositeX, oppositeY);
  return world.cells[ci] === Cell.WALL ? ci : -1;
}

function setFeature(world: World, x: number, y: number, feature: Feature, lightRadius: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.features[ci] = feature;
  addLocalLight(world, x, y, lightRadius);
}

function addLocalLight(world: World, lx: number, ly: number, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const ci = world.idx(lx + dx, ly + dy);
      const brightness = 1 - Math.sqrt(d2) / radius;
      if (brightness > world.light[ci]) world.light[ci] = brightness;
    }
  }
}

function spawnArenaMonsters(world: World, room: Room, entities: Entity[], nextId: { v: number }): void {
  for (const placement of MONSTER_PLACEMENTS) {
    entities.push(createArenaMonster(world, room, nextId, placement.kind, placement.dx, placement.dy, placement.bonus, placement.name));
  }
}

function createArenaMonster(
  world: World,
  room: Room,
  nextId: { v: number },
  kind: MonsterKind,
  dx: number,
  dy: number,
  bonus: number,
  name?: string,
): Entity {
  const x = room.x + dx + 0.5;
  const y = room.y + dy + 0.5;
  const def = MONSTERS[kind];
  const ci = world.idx(Math.floor(x), Math.floor(y));
  const zoneLevel = world.zones[world.zoneMap[ci]]?.level ?? 10;
  const level = zoneLevel + bonus;
  const rpg = randomRPG(level);
  const hp = Math.max(1, Math.round(scaleMonsterHp(def.hp, level) * (1 + rpg.str * 0.1)));
  const entity: Entity = {
    id: nextId.v++,
    type: EntityType.MONSTER,
    x,
    y,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, level),
    sprite: def.sprite,
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: def.attackRate,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 2 + Math.random() * 2 },
    rpg,
  };
  applyMonsterVariant(entity, FloorLevel.HELL);
  return entity;
}

function spawnArenaCultists(world: World, room: Room, entities: Entity[], nextId: { v: number }): void {
  for (const [dx, dy] of CULTIST_PLACEMENTS) {
    entities.push(createArenaCultist(world, room, nextId, dx, dy));
  }
}

function createArenaCultist(world: World, room: Room, nextId: { v: number }, dx: number, dy: number): Entity {
  const x = room.x + dx + 0.5;
  const y = room.y + dy + 0.5;
  const ci = world.idx(Math.floor(x), Math.floor(y));
  const zoneLevel = world.zones[world.zoneMap[ci]]?.level ?? 10;
  const rpg = randomRPG(gaussianLevel(zoneLevel + 2, 1.5));
  const maxHp = Math.max(1, Math.round(getMaxHp(rpg) * 1.35));
  const nm = randomName(Faction.CULTIST);
  const weapon = Math.random() < 0.65 ? 'psi_meat_hook' : 'rebar';
  return {
    id: nextId.v++,
    type: EntityType.NPC,
    x,
    y,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: 1.25 + Math.random() * 0.25,
    sprite: Occupation.PILGRIM,
    name: nm.name,
    isFemale: nm.female,
    needs: freshNeeds(),
    hp: maxHp,
    maxHp,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: [{ defId: weapon, count: 1 }],
    weapon,
    familyId: -1,
    faction: Faction.CULTIST,
    occupation: Occupation.PILGRIM,
    questId: -1,
    canGiveQuest: false,
    rpg,
  };
}

function dropArenaReward(world: World, room: Room, entities: Entity[], nextId: { v: number }): void {
  const x = room.x + (room.w >> 1);
  const y = room.y + (room.h >> 1) + 1;
  if (world.cells[world.idx(x, y)] !== Cell.FLOOR) return;
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [
      { defId: 'psi_meat_hook', count: 1 },
      { defId: 'meat_rune', count: 1 },
      { defId: 'ammo_energy', count: 2 },
    ],
  });
}
