/* ── Future design z: Хтонический чердак — islands ─────────────────── */

import {
  W, Cell, Tex, Feature, DoorState, RoomType, ZoneFaction,
  type Room, type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { ATTIC_BASE_X, MAIN_Y, atticDoorPoint, carveLine, placeDoor, AtticPoint, carveAtticPathChain, carveAtticRootPath, carveAtticDisc, RoomSide, setAtticFeature } from './geometry';
import { seedAtticIslandCache } from './npcs';
import { atticOwnerWorkName } from './territory';
export interface AtticServiceIslandPlan {
  owner: TerritoryOwner;
  prefix: string;
  cx: number;
  cy: number;
  connect: AtticPoint;
  wallTex: Tex;
  floorTex: Tex;
  coreFeature: Feature;
}

export interface AtticMicroBlockPlan {
  cx: number;
  cy: number;
  connect: AtticPoint;
  owner: TerritoryOwner;
  wallTex: Tex;
  floorTex: Tex;
  name: string;
}

export const ATTIC_SERVICE_ISLANDS: readonly AtticServiceIslandPlan[] = [
  {
    owner: ZoneFaction.CITIZEN,
    prefix: 'Гражданский чердачный приют',
    cx: 178,
    cy: 760,
    connect: { x: 190, y: 590 },
    wallTex: Tex.PANEL,
    floorTex: Tex.F_LINO,
    coreFeature: Feature.TABLE,
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    prefix: 'Ликвидаторский пост люка',
    cx: 832,
    cy: 276,
    connect: { x: 766, y: 394 },
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    coreFeature: Feature.DESK,
  },
  {
    owner: ZoneFaction.CULTIST,
    prefix: 'Культовая сухая ниша',
    cx: 336,
    cy: 330,
    connect: { x: 252, y: 398 },
    wallTex: Tex.GUT,
    floorTex: Tex.F_GUT,
    coreFeature: Feature.CANDLE,
  },
  {
    owner: ZoneFaction.SCIENTIST,
    prefix: 'НИИ измерительная капсула',
    cx: 596,
    cy: 792,
    connect: { x: 438, y: 842 },
    wallTex: Tex.TILE_W,
    floorTex: Tex.F_TILE,
    coreFeature: Feature.SCREEN,
  },
  {
    owner: ZoneFaction.WILD,
    prefix: 'Дикий чердачный стан',
    cx: 890,
    cy: 836,
    connect: { x: 820, y: 736 },
    wallTex: Tex.DARK,
    floorTex: Tex.F_CONCRETE,
    coreFeature: Feature.SHELF,
  },
];

export const ATTIC_WILD_OUTPOSTS: readonly AtticPoint[] = [
  { x: 260, y: 890 },
  { x: 744, y: 626 },
];

export const ATTIC_MICRO_BLOCKS: readonly AtticMicroBlockPlan[] = [
  { cx: 96, cy: 220, connect: { x: 252, y: 398 }, owner: ZoneFaction.WILD, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, name: 'северо-западный глухой короб' },
  { cx: 202, cy: 286, connect: { x: 252, y: 398 }, owner: ZoneFaction.CULTIST, wallTex: Tex.GUT, floorTex: Tex.F_GUT, name: 'сухой исповедальный короб' },
  { cx: 458, cy: 208, connect: { x: 514, y: 82 }, owner: ZoneFaction.SCIENTIST, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, name: 'узел старых датчиков' },
  { cx: 640, cy: 188, connect: { x: 514, y: 82 }, owner: ZoneFaction.LIQUIDATOR, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, name: 'пост верхней балки' },
  { cx: 944, cy: 230, connect: { x: 832, y: 276 }, owner: ZoneFaction.WILD, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, name: 'краевой разлом сменщиков' },
  { cx: 118, cy: 374, connect: { x: 72, y: 430 }, owner: ZoneFaction.CULTIST, wallTex: Tex.GUT, floorTex: Tex.F_GUT, name: 'черная кладовая ладони' },
  { cx: 430, cy: 326, connect: { x: 458, y: 402 }, owner: ZoneFaction.SCIENTIST, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE, name: 'шумомерный карман' },
  { cx: 590, cy: 330, connect: { x: 662, y: 424 }, owner: ZoneFaction.LIQUIDATOR, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, name: 'короткий пост растяжек' },
  { cx: 914, cy: 386, connect: { x: 866, y: 466 }, owner: ZoneFaction.WILD, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, name: 'обход рваной вентиляции' },
  { cx: 182, cy: 486, connect: { x: 194, y: 508 }, owner: ZoneFaction.CITIZEN, wallTex: Tex.PANEL, floorTex: Tex.F_LINO, name: 'жилой карман сторожей' },
  { cx: 382, cy: 514, connect: { x: ATTIC_BASE_X + 18, y: MAIN_Y }, owner: ZoneFaction.CITIZEN, wallTex: Tex.PANEL, floorTex: Tex.F_CONCRETE, name: 'низкая бытовая связка' },
  { cx: 520, cy: 552, connect: { x: 604, y: 474 }, owner: ZoneFaction.CULTIST, wallTex: Tex.GUT, floorTex: Tex.F_GUT, name: 'узел корневого подкорма' },
  { cx: 742, cy: 548, connect: { x: 704, y: 574 }, owner: ZoneFaction.WILD, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, name: 'разобранный вентдвор' },
  { cx: 88, cy: 652, connect: { x: 126, y: 606 }, owner: ZoneFaction.WILD, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, name: 'обваленный бытовой карман' },
  { cx: 326, cy: 678, connect: { x: 190, y: 590 }, owner: ZoneFaction.CITIZEN, wallTex: Tex.PANEL, floorTex: Tex.F_LINO, name: 'очередь за кипятком' },
  { cx: 502, cy: 696, connect: { x: 620, y: 642 }, owner: ZoneFaction.SCIENTIST, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, name: 'лабораторный короб пыли' },
  { cx: 692, cy: 704, connect: { x: 704, y: 574 }, owner: ZoneFaction.WILD, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, name: 'низкая стая шахты' },
  { cx: 966, cy: 700, connect: { x: 902, y: 650 }, owner: ZoneFaction.WILD, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, name: 'краевой стан мародеров' },
  { cx: 102, cy: 842, connect: { x: 178, y: 760 }, owner: ZoneFaction.CITIZEN, wallTex: Tex.PANEL, floorTex: Tex.F_LINO, name: 'семейный тайник на балках' },
  { cx: 356, cy: 822, connect: { x: 438, y: 842 }, owner: ZoneFaction.LIQUIDATOR, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, name: 'нижний пост прожига' },
  { cx: 706, cy: 888, connect: { x: 596, y: 792 }, owner: ZoneFaction.SCIENTIST, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, name: 'капсула мокрых журналов' },
  { cx: 956, cy: 918, connect: { x: 890, y: 836 }, owner: ZoneFaction.WILD, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, name: 'ночлежка краевого люка' },
];

export function stampAtticServiceIslands(world: World, protectedMask: Uint8Array, rng: () => number): void {
  const openMask = new Uint8Array(W * W);
  carveAtticPathChain(world, [
    { x: 52, y: 538 },
    { x: 178, y: 760 },
    { x: 260, y: 890 },
    { x: 524, y: 930 },
    { x: 596, y: 792 },
    { x: 744, y: 626 },
    { x: 704, y: 574 },
  ], 2, Tex.F_CONCRETE, protectedMask);
  carveAtticPathChain(world, [
    { x: 252, y: 398 },
    { x: 336, y: 330 },
    { x: 514, y: 82 },
    { x: 640, y: 188 },
    { x: 832, y: 276 },
    { x: 766, y: 394 },
  ], 2, Tex.F_CONCRETE, protectedMask);
  carveAtticPathChain(world, [
    { x: 820, y: 736 },
    { x: 890, y: 836 },
    { x: 956, y: 918 },
    { x: 970, y: 548 },
  ], 2, Tex.F_CONCRETE, protectedMask);
  carveAtticPathChain(world, [
    { x: 336, y: 330 },
    { x: 382, y: 514 },
    { x: 326, y: 678 },
    { x: 260, y: 890 },
  ], 1, Tex.F_CONCRETE, protectedMask);
  carveAtticPathChain(world, [
    { x: 832, y: 276 },
    { x: 742, y: 548 },
    { x: 890, y: 836 },
  ], 1, Tex.F_CONCRETE, protectedMask);

  for (const island of ATTIC_SERVICE_ISLANDS) stampAtticFactionIsland(world, island, rng, openMask);
  for (let i = 0; i < ATTIC_WILD_OUTPOSTS.length; i++) {
    stampAtticWildOutpost(world, ATTIC_WILD_OUTPOSTS[i], i, rng, openMask);
  }
  for (let i = 0; i < ATTIC_MICRO_BLOCKS.length; i++) {
    stampAtticMicroBlock(world, ATTIC_MICRO_BLOCKS[i], i, rng, openMask);
  }
}

export function stampAtticFactionIsland(world: World, plan: AtticServiceIslandPlan, rng: () => number, openMask: Uint8Array): void {
  carveAtticRootPath(world, plan.connect, { x: plan.cx, y: plan.cy }, 2, plan.floorTex, openMask);
  carveAtticDisc(world, plan.cx, plan.cy, 6, plan.floorTex, openMask);

  const core = stampAtticServiceRoom(world, RoomType.HQ, plan.cx - 10, plan.cy - 25, 20, 15, `${plan.prefix}: гермоядро`, Tex.HERMO_WALL, plan.floorTex, true);
  const common = stampAtticServiceRoom(world, plan.owner === ZoneFaction.CITIZEN ? RoomType.KITCHEN : RoomType.COMMON, plan.cx - 35, plan.cy - 5, 20, 14, `${plan.prefix}: общая`, plan.wallTex, plan.floorTex, false);
  const store = stampAtticServiceRoom(world, RoomType.STORAGE, plan.cx + 15, plan.cy - 5, 22, 14, `${plan.prefix}: склад`, plan.wallTex, plan.floorTex, false);
  const wet = stampAtticServiceRoom(world, RoomType.BATHROOM, plan.cx - 13, plan.cy + 13, 11, 10, `${plan.prefix}: санузел`, Tex.TILE_W, Tex.F_TILE, false);
  const workType = plan.owner === ZoneFaction.SCIENTIST ? RoomType.MEDICAL : plan.owner === ZoneFaction.LIQUIDATOR ? RoomType.OFFICE : RoomType.PRODUCTION;
  const work = stampAtticServiceRoom(world, workType, plan.cx + 5, plan.cy + 13, 20, 11, `${plan.prefix}: ${atticOwnerWorkName(plan.owner)}`, plan.wallTex, plan.owner === ZoneFaction.SCIENTIST ? Tex.F_TILE : plan.floorTex, false);

  connectAtticRoomToHub(world, core, 'south', plan.cx, plan.cy, DoorState.HERMETIC_OPEN);
  connectAtticRoomToHub(world, common, 'east', plan.cx, plan.cy, DoorState.CLOSED);
  connectAtticRoomToHub(world, store, 'west', plan.cx, plan.cy, DoorState.CLOSED);
  connectAtticRoomToHub(world, wet, 'north', plan.cx, plan.cy, DoorState.CLOSED);
  connectAtticRoomToHub(world, work, 'north', plan.cx, plan.cy, DoorState.CLOSED);

  decorateAtticFactionRoom(world, core, plan.owner, plan.coreFeature, rng);
  decorateAtticFactionRoom(world, common, plan.owner, Feature.TABLE, rng);
  decorateAtticFactionRoom(world, store, plan.owner, Feature.SHELF, rng);
  decorateAtticFactionRoom(world, wet, plan.owner, Feature.TOILET, rng);
  decorateAtticFactionRoom(world, work, plan.owner, plan.owner === ZoneFaction.SCIENTIST ? Feature.APPARATUS : Feature.MACHINE, rng);
  seedAtticIslandCache(world, store, plan.owner, rng);
}

export function stampAtticWildOutpost(world: World, point: AtticPoint, serial: number, rng: () => number, openMask: Uint8Array): void {
  carveAtticDisc(world, point.x, point.y, 5, Tex.F_CONCRETE, openMask);
  const barrack = stampAtticServiceRoom(world, RoomType.COMMON, point.x - 21, point.y - 8, 18, 14, `Дикий запасной стан ${serial + 1}: ночлежка`, Tex.DARK, Tex.F_CONCRETE, false);
  const stash = stampAtticServiceRoom(world, RoomType.STORAGE, point.x + 6, point.y - 7, 18, 12, `Дикий запасной стан ${serial + 1}: краденый шкаф`, Tex.DARK, Tex.F_CONCRETE, false);
  const lathe = stampAtticServiceRoom(world, RoomType.PRODUCTION, point.x - 8, point.y + 10, 20, 11, `Дикий запасной стан ${serial + 1}: рваная мастерская`, Tex.PIPE, Tex.F_CONCRETE, false);
  connectAtticRoomToHub(world, barrack, 'east', point.x, point.y, DoorState.CLOSED);
  connectAtticRoomToHub(world, stash, 'west', point.x, point.y, DoorState.CLOSED);
  connectAtticRoomToHub(world, lathe, 'north', point.x, point.y, DoorState.CLOSED);
  decorateAtticFactionRoom(world, barrack, ZoneFaction.WILD, Feature.TABLE, rng);
  decorateAtticFactionRoom(world, stash, ZoneFaction.WILD, Feature.SHELF, rng);
  decorateAtticFactionRoom(world, lathe, ZoneFaction.WILD, Feature.MACHINE, rng);
  seedAtticIslandCache(world, stash, ZoneFaction.WILD, rng);
}

export function stampAtticMicroBlock(world: World, plan: AtticMicroBlockPlan, serial: number, rng: () => number, openMask: Uint8Array): void {
  carveAtticRootPath(world, plan.connect, { x: plan.cx, y: plan.cy }, serial % 3 === 0 ? 2 : 1, plan.floorTex, openMask);
  carveAtticDisc(world, plan.cx, plan.cy, 4, plan.floorTex, openMask);

  const a = stampAtticServiceRoom(world, RoomType.STORAGE, plan.cx - 17, plan.cy - 15, 14, 10, `Чердак: ${plan.name}: кладовая`, plan.wallTex, plan.floorTex, false);
  const b = stampAtticServiceRoom(world, serial % 4 === 0 ? RoomType.BATHROOM : RoomType.PRODUCTION, plan.cx + 5, plan.cy - 14, 16, 10, `Чердак: ${plan.name}: ${serial % 4 === 0 ? 'туалет' : 'мастерская'}`, plan.wallTex, serial % 4 === 0 ? Tex.F_TILE : plan.floorTex, false);
  const c = stampAtticServiceRoom(world, serial % 3 === 0 ? RoomType.OFFICE : RoomType.COMMON, plan.cx - 7, plan.cy + 7, 18, 11, `Чердак: ${plan.name}: ${serial % 3 === 0 ? 'будка' : 'карман'}`, plan.wallTex, plan.floorTex, false);

  connectAtticRoomToHub(world, a, 'east', plan.cx, plan.cy, DoorState.CLOSED);
  connectAtticRoomToHub(world, b, 'west', plan.cx, plan.cy, DoorState.CLOSED);
  connectAtticRoomToHub(world, c, 'north', plan.cx, plan.cy, DoorState.CLOSED);
  decorateAtticFactionRoom(world, a, plan.owner, Feature.SHELF, rng);
  decorateAtticFactionRoom(world, b, plan.owner, b.type === RoomType.BATHROOM ? Feature.TOILET : Feature.APPARATUS, rng);
  decorateAtticFactionRoom(world, c, plan.owner, c.type === RoomType.OFFICE ? Feature.DESK : Feature.TABLE, rng);
  if (serial % 4 === 1) seedAtticIslandCache(world, a, plan.owner, rng);
}

export function stampAtticServiceRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  hermetic: boolean,
): Room {
  const room: Room = {
    id: world.rooms.length,
    type,
    x: world.wrap(x),
    y: world.wrap(y),
    w,
    h,
    doors: [],
    sealed: hermetic,
    name,
    apartmentId: -1,
    wallTex,
    floorTex,
  };
  world.rooms.push(room);

  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      world.cells[idx] = Cell.WALL;
      world.roomMap[idx] = -1;
      world.wallTex[idx] = hermetic ? Tex.HERMO_WALL : wallTex;
      if (hermetic) world.hermoWall[idx] = 1;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      world.cells[idx] = Cell.FLOOR;
      world.roomMap[idx] = room.id;
      world.floorTex[idx] = floorTex;
      world.features[idx] = Feature.NONE;
      world.hermoWall[idx] = 0;
    }
  }
  return room;
}

export function connectAtticRoomToHub(world: World, room: Room, side: RoomSide, hubX: number, hubY: number, state: DoorState): number {
  const door = atticDoorPoint(room, side);
  carveLine(world, door.outsideX, door.outsideY, hubX, hubY, 1, room.floorTex);
  const doorIdx = placeDoor(world, door.x, door.y, room.id, state);
  if (state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED) {
    world.wallTex[doorIdx] = Tex.DOOR_METAL;
    world.hermoWall[doorIdx] = state === DoorState.HERMETIC_CLOSED ? 1 : 0;
  }
  return doorIdx;
}

export function decorateAtticFactionRoom(world: World, room: Room, owner: TerritoryOwner, primary: Feature, rng: () => number): void {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  setAtticFeature(world, cx, cy, primary);
  if (room.type === RoomType.BATHROOM) {
    setAtticFeature(world, room.x + 2, room.y + 2, Feature.TOILET);
    setAtticFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
    return;
  }
  if (room.type === RoomType.KITCHEN) {
    setAtticFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
    setAtticFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
  }
  const accent = owner === ZoneFaction.CULTIST ? Feature.CANDLE
    : owner === ZoneFaction.SCIENTIST ? Feature.SCREEN
      : owner === ZoneFaction.LIQUIDATOR ? Feature.LAMP
        : owner === ZoneFaction.WILD ? Feature.SHELF
          : Feature.CHAIR;
  for (let i = 0; i < Math.max(2, Math.floor((room.w * room.h) / 90)); i++) {
    const x = room.x + 2 + Math.floor(rng() * Math.max(1, room.w - 4));
    const y = room.y + 2 + Math.floor(rng() * Math.max(1, room.h - 4));
    const idx = world.idx(x, y);
    if (world.cells[idx] === Cell.FLOOR && world.roomMap[idx] === room.id && world.features[idx] === Feature.NONE) {
      world.features[idx] = i === 0 ? accent : room.type === RoomType.STORAGE ? Feature.SHELF : Feature.CHAIR;
    }
  }
}

