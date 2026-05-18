import {
  AIGoal,
  Cell,
  EntityType,
  Faction,
  Feature,
  FloorLevel,
  MonsterKind,
  Occupation,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { hashSeed, seededRandom } from '../../core/rand';
import { freshNeeds } from '../../data/catalog';
import type { DesignFloorRouteDef } from '../../data/design_floors';
import { MONSTERS, applyMonsterVariant } from '../../entities/monster';
import { monsterSpr, Spr } from '../../render/sprite_index';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';

interface FloorStyle {
  wallTex: Tex;
  floorTex: Tex;
  faction: ZoneFaction;
  danger: number;
}

interface Point {
  x: number;
  y: number;
}

const FLOOR69_NAMES_F = [
  'Алина Сцена', 'Вера Красная', 'Дина Бархат', 'Лада Лента', 'Мира Пайетка',
  'Ника Кулиса', 'Рита Свет', 'Соня Тихая', 'Тая Занавес', 'Эля Ночной Чай',
];
const FLOOR69_NAMES_M = [
  'Гена Сторож', 'Денис Гость', 'Жора Бармен', 'Клим Курьер', 'Левон Световой',
  'Марк Счетчик', 'Паша Дверной', 'Рома Патруль', 'Савва Чистый', 'Федя Номерной',
];

const DESIGN_FLOOR_POP_CAP = 220;

export function expandDesignFloorGeneration<T extends FloorGeneration>(
  generation: T,
  route: DesignFloorRouteDef,
): T {
  const rng = seededRandom(hashSeed(`design-full:${route.id}:${route.z}`, route.z));
  switch (route.id) {
    case 'roof':
      expandRoof(generation.world, rng);
      break;
    case 'floor_69':
      expandFloor69(generation, rng);
      break;
    case 'manhattan_crossroads':
      expandCrossroads(generation.world, rng, style(route));
      break;
    case 'communal_ring':
      expandCommunalRing(generation.world, rng, style(route));
      break;
    case 'dark_metro':
      expandDarkMetro(generation.world, rng, style(route));
      break;
    case 'production_belt':
      expandProductionBelt(generation.world, rng, style(route));
      break;
    case 'service_floor':
      expandServiceFloor(generation.world, rng, style(route));
      break;
    case 'underhell':
      expandUnderhell(generation.world, generation.entities, rng, route.baseFloor);
      break;
    case 'darkness':
      expandDarkness(generation.world, generation.entities, rng, route.baseFloor);
      break;
    case 'chthonic_attic':
      expandChthonicAttic(generation.world, generation.entities, rng);
      break;
    case 'antenna_court':
      expandAntennaCourt(generation.world, rng, style(route));
      break;
    case 'upper_bureau':
    case 'raionsovet_archive':
    case 'registry_morgue':
    case 'black_market_88':
      expandBlockDistrict(generation.world, rng, style(route), route.id);
      break;
  }
  finalizeExpandedFloor(generation, route, rng);
  return generation;
}

function style(route: DesignFloorRouteDef): FloorStyle {
  switch (route.baseFloor) {
    case FloorLevel.MINISTRY:
      return { wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET, faction: ZoneFaction.CITIZEN, danger: 2 };
    case FloorLevel.KVARTIRY:
      return { wallTex: Tex.BRICK, floorTex: Tex.F_LINO, faction: ZoneFaction.CITIZEN, danger: 3 };
    case FloorLevel.MAINTENANCE:
      return { wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE, faction: ZoneFaction.LIQUIDATOR, danger: 4 };
    case FloorLevel.HELL:
      return { wallTex: Tex.MEAT, floorTex: Tex.F_MEAT, faction: ZoneFaction.CULTIST, danger: 5 };
    case FloorLevel.VOID:
      return { wallTex: Tex.VOID_WALL, floorTex: Tex.F_VOID, faction: ZoneFaction.SAMOSBOR, danger: 5 };
    case FloorLevel.LIVING:
    default:
      return { wallTex: Tex.PANEL, floorTex: Tex.F_CARPET, faction: ZoneFaction.CITIZEN, danger: 3 };
  }
}

function finalizeExpandedFloor<T extends FloorGeneration>(
  generation: T,
  route: DesignFloorRouteDef,
  rng: () => number,
): void {
  generateZones(generation.world);
  tuneZones(generation.world, style(route), route.id);
  scatterAmbientLights(generation.world, rng, route.id === 'darkness' ? 90 : 260);
  ensureConnectivity(generation.world, generation.spawnX, generation.spawnY);
  sanitizeDoors(generation.world);
  generation.world.rebuildContainerMap();
  generation.world.bakeLights();
}

function tuneZones(world: World, s: FloorStyle, routeId: string): void {
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, W / 2, W / 2);
    zone.level = Math.max(1, Math.min(5, Math.round(s.danger + d / 420)));
    zone.faction = s.faction;
    if (routeId === 'floor_69' && zone.id % 9 === 0) zone.faction = ZoneFaction.LIQUIDATOR;
    if (routeId === 'black_market_88' && zone.id % 7 === 0) zone.faction = ZoneFaction.WILD;
    if (routeId === 'underhell') zone.faction = zone.id % 5 === 0 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CULTIST;
    if (routeId === 'dark_metro') zone.faction = zone.id % 3 === 0 ? ZoneFaction.WILD : ZoneFaction.LIQUIDATOR;
    zone.fogged = false;
  }

  for (let i = 0; i < W * W; i++) {
    const zone = world.zones[world.zoneMap[i]];
    world.factionControl[i] = zone?.faction ?? s.faction;
  }
}

function protectedMask(world: World): Uint8Array {
  const mask = new Uint8Array(W * W);
  for (const room of world.rooms) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        mask[world.idx(x, y)] = 1;
      }
    }
  }
  for (const idx of world.doors.keys()) mask[idx] = 1;
  for (const container of world.containers) mask[world.idx(container.x, container.y)] = 1;
  return mask;
}

function addRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room: Room = {
    id: world.rooms.length,
    type,
    x: world.wrap(x),
    y: world.wrap(y),
    w,
    h,
    doors: [],
    sealed: false,
    name,
    apartmentId: -1,
    wallTex,
    floorTex,
  };
  world.rooms.push(room);
  carveRect(world, room.x, room.y, w, h, room.id, floorTex);
  wallRing(world, room.x, room.y, w, h, wallTex);
  return room;
}

function carveRect(world: World, x: number, y: number, w: number, h: number, roomId: number, floorTex: Tex): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = roomId;
      world.floorTex[ci] = floorTex;
    }
  }
}

function wallRing(world: World, x: number, y: number, w: number, h: number, wallTex: Tex): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) continue;
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] === Cell.WALL || world.cells[ci] === Cell.ABYSS) {
        world.cells[ci] = Cell.WALL;
        world.wallTex[ci] = wallTex;
      }
    }
  }
}

function carveLine(world: World, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex): void {
  let x = ax;
  let y = ay;
  const sx = bx === ax ? 0 : bx > ax ? 1 : -1;
  const sy = by === ay ? 0 : by > ay ? 1 : -1;
  while (x !== bx) {
    carveDisc(world, x, y, width, floorTex);
    x += sx;
  }
  while (y !== by) {
    carveDisc(world, x, y, width, floorTex);
    y += sy;
  }
  carveDisc(world, x, y, width, floorTex);
}

function carveDisc(world: World, cx: number, cy: number, r: number, floorTex: Tex, roomId = -1): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const ci = world.idx(cx + dx, cy + dy);
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = roomId;
      world.floorTex[ci] = floorTex;
    }
  }
}

function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) world.features[ci] = feature;
}

function scatterAmbientLights(world: World, rng: () => number, count: number): void {
  for (let attempt = 0, placed = 0; attempt < count * 20 && placed < count; attempt++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * W);
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.FLOOR || world.features[ci] !== Feature.NONE) continue;
    if (rng() < 0.7) world.features[ci] = Feature.LAMP;
    else world.features[ci] = Feature.CANDLE;
    placed++;
  }
}

function randomFloorCell(world: World, rng: () => number): Point | null {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * W);
    if (world.cells[world.idx(x, y)] === Cell.FLOOR) return { x, y };
  }
  return null;
}

function expandRoof(world: World, rng: () => number): void {
  const mask = protectedMask(world);
  for (let i = 0; i < W * W; i++) {
    if (mask[i]) continue;
    world.cells[i] = Cell.ABYSS;
    world.roomMap[i] = -1;
    world.wallTex[i] = Tex.DARK;
    world.floorTex[i] = Tex.F_ABYSS;
    world.features[i] = Feature.NONE;
  }

  const slabs: Room[] = [];
  for (let y = 58; y < W - 80; y += 132) {
    for (let x = 48; x < W - 80; x += 146) {
      const w = 70 + Math.floor(rng() * 58);
      const h = 54 + Math.floor(rng() * 48);
      slabs.push(addRoom(world, RoomType.COMMON, x + Math.floor(rng() * 22), y + Math.floor(rng() * 18), w, h, 'Кровельная плита', Tex.CONCRETE, Tex.F_CONCRETE));
    }
  }

  let prev: Room | null = null;
  for (const slab of slabs) {
    const cx = slab.x + (slab.w >> 1);
    const cy = slab.y + (slab.h >> 1);
    if (prev) carveLine(world, prev.x + (prev.w >> 1), prev.y + (prev.h >> 1), cx, cy, 2, Tex.F_CONCRETE);
    prev = slab;
    for (let i = 0; i < 3 + Math.floor(rng() * 4); i++) {
      const px = slab.x + 4 + Math.floor(rng() * Math.max(1, slab.w - 8));
      const py = slab.y + 4 + Math.floor(rng() * Math.max(1, slab.h - 8));
      setFeature(world, px, py, rng() < 0.45 ? Feature.APPARATUS : rng() < 0.65 ? Feature.MACHINE : Feature.LAMP);
      if (rng() < 0.3) world.stamp(px, py, 0.5, 0.5, 2 + rng() * 4, 0.16, Math.floor(rng() * 100000), 60, 64, 68, false);
    }
  }

  for (let i = 0; i < 34; i++) {
    const slab = slabs[Math.floor(rng() * slabs.length)];
    addRoom(world, RoomType.STORAGE, slab.x + 3 + Math.floor(rng() * Math.max(1, slab.w - 18)), slab.y + 3 + Math.floor(rng() * Math.max(1, slab.h - 14)), 11, 8, 'Вентбудка крыши', Tex.METAL, Tex.F_CONCRETE);
  }
}

function expandFloor69(generation: FloorGeneration, rng: () => number): void {
  const world = generation.world;
  for (let by = 64; by < W - 64; by += 96) {
    const corridorY = by + 40 + Math.floor(rng() * 20);
    carveLine(world, 48, corridorY, W - 52, corridorY, 2, Tex.F_CARPET);
    for (let bx = 72; bx < W - 100; bx += 70 + Math.floor(rng() * 16)) {
      const top = rng() < 0.5;
      const w = 22 + Math.floor(rng() * 18);
      const h = 12 + Math.floor(rng() * 11);
      const y = top ? corridorY - h - 3 : corridorY + 4;
      const room = addRoom(world, pickRoom(rng, [RoomType.LIVING, RoomType.COMMON, RoomType.SMOKING, RoomType.STORAGE, RoomType.OFFICE]), bx, y, w, h, 'Красная секция 69', Tex.CURTAIN, rng() < 0.6 ? Tex.F_CARPET : Tex.F_LINO);
      carveLine(world, bx + (w >> 1), top ? y + h : y - 1, bx + (w >> 1), corridorY, 1, Tex.F_CARPET);
      dressFloor69Room(world, room, rng);
    }
  }
  carveLine(world, 512, 48, 512, W - 48, 3, Tex.F_CARPET);
  carveLine(world, 96, 512, W - 96, 512, 3, Tex.F_CARPET);
  spawnFloor69Population(generation, rng);
}

function dressFloor69Room(world: World, room: Room, rng: () => number): void {
  for (let i = 0; i < Math.max(2, Math.floor(room.w * room.h / 70)); i++) {
    setFeature(world, room.x + 2 + Math.floor(rng() * Math.max(1, room.w - 4)), room.y + 2 + Math.floor(rng() * Math.max(1, room.h - 4)), rng() < 0.45 ? Feature.BED : rng() < 0.7 ? Feature.TABLE : Feature.LAMP);
  }
  if (rng() < 0.45) world.wallTex[world.idx(room.x + Math.floor(room.w / 2), room.y - 1)] = Tex.POSTER_BASE + Math.floor(rng() * 64);
  if (rng() < 0.2) world.stamp(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), 0.5, 0.5, 3.2, 0.18, room.id * 991, 210, 40, 95, true);
}

function spawnFloor69Population(generation: FloorGeneration, rng: () => number): void {
  const nextId = generation.entities.reduce((mx, e) => Math.max(mx, e.id), 0) + 1;
  const idRef = { v: nextId };
  const target = Math.min(DESIGN_FLOOR_POP_CAP, 180);
  for (let i = 0; i < target; i++) {
    const p = randomFloorCell(generation.world, rng);
    if (!p) break;
    const female = i < Math.ceil(target * 0.56);
    generation.entities.push(makeFloor69Npc(idRef.v++, p.x + 0.5, p.y + 0.5, female, i, rng));
  }
}

function makeFloor69Npc(id: number, x: number, y: number, female: boolean, i: number, rng: () => number): Entity {
  const faction = rng() < 0.12 ? Faction.LIQUIDATOR : Faction.CITIZEN;
  return {
    id,
    type: EntityType.NPC,
    x,
    y,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: 0.72 + rng() * 0.36,
    sprite: female ? Spr.F69_FEMALE_NPC_BASE + (i % 8) : pickOccupationSprite(rng),
    name: female ? FLOOR69_NAMES_F[i % FLOOR69_NAMES_F.length] : FLOOR69_NAMES_M[i % FLOOR69_NAMES_M.length],
    isFemale: female,
    needs: freshNeeds(),
    hp: 70 + Math.floor(rng() * 60),
    maxHp: 100,
    money: Math.floor(8 + rng() * 110),
    inventory: rng() < 0.5 ? [{ defId: 'cigs', count: 1 }] : [{ defId: 'tea', count: 1 }],
    faction,
    occupation: female ? Occupation.TRAVELER : rng() < 0.4 ? Occupation.HUNTER : Occupation.TRAVELER,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    canGiveQuest: false,
    questId: -1,
    weapon: faction === Faction.LIQUIDATOR ? 'makarov' : '',
  };
}

function pickOccupationSprite(rng: () => number): number {
  const pool = [Occupation.TRAVELER, Occupation.HUNTER, Occupation.STOREKEEPER, Occupation.SECRETARY, Occupation.DOCTOR];
  return pool[Math.floor(rng() * pool.length)];
}

function expandBlockDistrict(world: World, rng: () => number, s: FloorStyle, routeId: string): void {
  const step = routeId === 'registry_morgue' ? 86 : routeId === 'black_market_88' ? 118 : 104;
  const centers: Point[] = [];
  for (let y = 54; y < W - 90; y += step) {
    for (let x = 48; x < W - 100; x += step) {
      const w = 26 + Math.floor(rng() * 36);
      const h = 18 + Math.floor(rng() * 30);
      const type = routeId === 'registry_morgue' ? RoomType.MEDICAL : routeId === 'black_market_88' ? RoomType.STORAGE : pickRoom(rng, [RoomType.OFFICE, RoomType.STORAGE, RoomType.COMMON, RoomType.HQ]);
      const room = addRoom(world, type, x + Math.floor(rng() * 18), y + Math.floor(rng() * 18), w, h, nameFor(routeId), s.wallTex, s.floorTex);
      centers.push({ x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) });
      decorateGenericRoom(world, room, rng, routeId);
    }
  }
  connectCenterChain(world, centers, 2, s.floorTex);
}

function expandCrossroads(world: World, rng: () => number, s: FloorStyle): void {
  for (let x = 80; x < W; x += 128) carveLine(world, x, 0, x, W - 1, 5, Tex.F_CONCRETE);
  for (let y = 96; y < W; y += 128) carveLine(world, 0, y, W - 1, y, 5, Tex.F_CONCRETE);
  for (let y = 42; y < W - 90; y += 128) {
    for (let x = 36; x < W - 120; x += 128) {
      const room = addRoom(world, RoomType.COMMON, x + Math.floor(rng() * 20), y + Math.floor(rng() * 20), 44, 24, 'Квартал перекрестка', Tex.BRICK, s.floorTex);
      decorateGenericRoom(world, room, rng, 'manhattan_crossroads');
    }
  }
}

function expandCommunalRing(world: World, rng: () => number, s: FloorStyle): void {
  for (let r = 90; r < 500; r += 76) {
    carveRect(world, 512 - r, 512 - r, r * 2, 4, -1, s.floorTex);
    carveRect(world, 512 - r, 512 + r, r * 2, 4, -1, s.floorTex);
    carveRect(world, 512 - r, 512 - r, 4, r * 2, -1, s.floorTex);
    carveRect(world, 512 + r, 512 - r, 4, r * 2, -1, s.floorTex);
  }
  for (let i = 0; i < 220; i++) {
    const side = Math.floor(rng() * 4);
    const r = 100 + Math.floor(rng() * 390);
    const t = 80 + Math.floor(rng() * 864);
    const x = side < 2 ? t : 512 + (side === 2 ? -r : r);
    const y = side < 2 ? 512 + (side === 0 ? -r : r) : t;
    const room = addRoom(world, pickRoom(rng, [RoomType.LIVING, RoomType.KITCHEN, RoomType.BATHROOM, RoomType.STORAGE]), x, y, 18 + Math.floor(rng() * 18), 12 + Math.floor(rng() * 14), 'Коммунальный отсек', s.wallTex, s.floorTex);
    decorateGenericRoom(world, room, rng, 'communal_ring');
  }
}

function expandProductionBelt(world: World, rng: () => number, s: FloorStyle): void {
  for (let y = 72; y < W - 60; y += 82) {
    carveLine(world, 40, y, W - 50, y, 4, s.floorTex);
    for (let x = 70; x < W - 120; x += 96) {
      const room = addRoom(world, RoomType.PRODUCTION, x, y - 22, 58, 36, 'Производственный пролет', Tex.METAL, s.floorTex);
      decorateGenericRoom(world, room, rng, 'production_belt');
    }
  }
}

function expandServiceFloor(world: World, rng: () => number, s: FloorStyle): void {
  for (let x = 64; x < W - 64; x += 92) carveLine(world, x, 40, x, W - 50, 2, s.floorTex);
  for (let y = 64; y < W - 64; y += 92) carveLine(world, 40, y, W - 50, y, 2, s.floorTex);
  for (let i = 0; i < 120; i++) {
    const room = addRoom(world, pickRoom(rng, [RoomType.STORAGE, RoomType.PRODUCTION, RoomType.CORRIDOR]), 50 + Math.floor(rng() * 880), 50 + Math.floor(rng() * 880), 18 + Math.floor(rng() * 26), 12 + Math.floor(rng() * 20), 'Служебный машинный карман', Tex.METAL, s.floorTex);
    decorateGenericRoom(world, room, rng, 'service_floor');
  }
}

function expandDarkMetro(world: World, rng: () => number, s: FloorStyle): void {
  for (let line = 0; line < 6; line++) {
    const y = 110 + line * 150;
    carveLine(world, 30, y, W - 30, y + (line % 2 ? 40 : -30), 4, Tex.F_CONCRETE);
    for (let x = 90; x < W - 130; x += 180) {
      const room = addRoom(world, RoomType.COMMON, x, y - 18, 64, 32, 'Платформа темной пересадки', Tex.PIPE, s.floorTex);
      decorateGenericRoom(world, room, rng, 'dark_metro');
    }
  }
}

function expandAntennaCourt(world: World, rng: () => number, s: FloorStyle): void {
  for (let y = 70; y < W - 80; y += 130) {
    for (let x = 70; x < W - 80; x += 130) {
      const room = addRoom(world, RoomType.COMMON, x, y, 72, 60, 'Антенный двор', Tex.CONCRETE, s.floorTex);
      carveLine(world, x + 36, y + 30, 512, 512, 2, s.floorTex);
      for (let i = 0; i < 8; i++) setFeature(world, room.x + 8 + Math.floor(rng() * 56), room.y + 8 + Math.floor(rng() * 44), Feature.APPARATUS);
    }
  }
}

function expandChthonicAttic(world: World, entities: Entity[], rng: () => number): void {
  for (let i = 0; i < 140; i++) {
    const ax = Math.floor(rng() * W);
    const ay = Math.floor(rng() * W);
    const bx = Math.floor(rng() * W);
    const by = Math.floor(rng() * W);
    carveLine(world, ax, ay, bx, by, 2 + Math.floor(rng() * 3), Tex.F_GUT);
    if (i % 9 === 0) addRoom(world, RoomType.STORAGE, ax, ay, 18 + Math.floor(rng() * 25), 12 + Math.floor(rng() * 22), 'Корневой чердачный карман', Tex.GUT, Tex.F_GUT);
  }
  spawnAmbientMonsters(world, entities, rng, FloorLevel.MINISTRY, 28, [MonsterKind.SHADOW, MonsterKind.POLZUN, MonsterKind.SPIRIT]);
}

function expandUnderhell(world: World, entities: Entity[], rng: () => number, floor: FloorLevel): void {
  for (let i = 0; i < 170; i++) {
    const ax = 512 + Math.floor((rng() - 0.5) * 860);
    const ay = 512 + Math.floor((rng() - 0.5) * 860);
    const bx = 512 + Math.floor((rng() - 0.5) * 860);
    const by = 512 + Math.floor((rng() - 0.5) * 860);
    carveLine(world, ax, ay, bx, by, 3 + Math.floor(rng() * 5), Tex.F_MEAT);
    if (i % 11 === 0) addRoom(world, RoomType.COMMON, ax, ay, 24 + Math.floor(rng() * 35), 18 + Math.floor(rng() * 26), 'Нижний мясной зал', Tex.MEAT, Tex.F_MEAT);
  }
  spawnAmbientMonsters(world, entities, rng, floor, 90, [MonsterKind.SHADOW, MonsterKind.IDOL, MonsterKind.SPIRIT, MonsterKind.REBAR]);
}

function expandDarkness(world: World, entities: Entity[], rng: () => number, floor: FloorLevel): void {
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.WALL) {
      world.wallTex[i] = Tex.VOID_WALL;
      world.floorTex[i] = Tex.F_VOID;
    }
  }
  const points: Point[] = [];
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * W);
    carveDisc(world, x, y, 9 + Math.floor(rng() * 18), Tex.F_VOID);
    points.push({ x, y });
    if (i % 5 === 0) addRoom(world, RoomType.COMMON, x - 8, y - 6, 16, 12, 'Остров ламповой тьмы', Tex.VOID_WALL, Tex.F_VOID);
  }
  connectCenterChain(world, points, 1, Tex.F_VOID);
  spawnAmbientMonsters(world, entities, rng, floor, 36, [MonsterKind.SHADOW, MonsterKind.SPIRIT, MonsterKind.NIGHTMARE]);
}

function connectCenterChain(world: World, points: Point[], width: number, floorTex: Tex): void {
  for (let i = 1; i < points.length; i++) {
    carveLine(world, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, width, floorTex);
  }
}

function decorateGenericRoom(world: World, room: Room, rng: () => number, routeId: string): void {
  const featureCount = Math.max(1, Math.floor((room.w * room.h) / 95));
  for (let i = 0; i < featureCount; i++) {
    const f = routeId === 'production_belt' || routeId === 'service_floor'
      ? pickFeature(rng, [Feature.MACHINE, Feature.APPARATUS, Feature.SHELF, Feature.LAMP])
      : routeId === 'registry_morgue'
        ? pickFeature(rng, [Feature.BED, Feature.SHELF, Feature.DESK, Feature.LAMP])
        : pickFeature(rng, [Feature.TABLE, Feature.CHAIR, Feature.SHELF, Feature.DESK, Feature.LAMP]);
    setFeature(world, room.x + 2 + Math.floor(rng() * Math.max(1, room.w - 4)), room.y + 2 + Math.floor(rng() * Math.max(1, room.h - 4)), f);
  }
}

function pickRoom(rng: () => number, rooms: RoomType[]): RoomType {
  return rooms[Math.floor(rng() * rooms.length)];
}

function pickFeature(rng: () => number, features: Feature[]): Feature {
  return features[Math.floor(rng() * features.length)];
}

function nameFor(routeId: string): string {
  switch (routeId) {
    case 'raionsovet_archive': return 'Архивный квартал';
    case 'registry_morgue': return 'Регистрационный холодный блок';
    case 'upper_bureau': return 'Верхнебюрократический кабинет';
    case 'black_market_88': return 'Рыночный карман 88';
    default: return 'Авторский этаж';
  }
}

function spawnAmbientMonsters(
  world: World,
  entities: Entity[],
  rng: () => number,
  floor: FloorLevel,
  count: number,
  kinds: MonsterKind[],
): void {
  let nextId = entities.reduce((mx, e) => Math.max(mx, e.id), 0) + 1;
  for (let i = 0; i < count; i++) {
    const p = randomFloorCell(world, rng);
    if (!p) break;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const def = MONSTERS[kind];
    const monster: Entity = {
      id: nextId++,
      type: EntityType.MONSTER,
      x: p.x + 0.5,
      y: p.y + 0.5,
      angle: rng() * Math.PI * 2,
      pitch: 0,
      alive: true,
      speed: def.speed,
      sprite: monsterSpr(kind),
      hp: def.hp,
      maxHp: def.hp,
      monsterKind: kind,
      attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: p.x, ty: p.y, path: [], pi: 0, stuck: 0, timer: 0 },
      phasing: kind === MonsterKind.SPIRIT,
    };
    applyMonsterVariant(monster, floor, rng() < 0.5);
    entities.push(monster);
  }
}
