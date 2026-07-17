/* ── Future design z: Хтонический чердак — geometry ─────────────────── */

import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  W, Cell, Tex, Feature, DoorState, LiftDirection,
  RoomType, ZoneFaction, type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { type ChthonicAtticLayout, type ChthonicAtticRouteCheck, type ChthonicAtticRootChoice } from './meta';
export const ATTIC_BASE_X = (W >> 1) - 104;
export const ATTIC_BASE_Y = (W >> 1) - 64;
export const MAIN_Y = ATTIC_BASE_Y + 58;

export const DIRS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface AtticPoint {
  x: number;
  y: number;
}

export interface AtticChamberPlan {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  anchor: AtticPoint;
  type: RoomType;
  name: string;
  wallTex: Tex;
  floorTex: Tex;
  feature: Feature;
}

export const ATTIC_SPINE: readonly AtticPoint[] = [
  { x: ATTIC_BASE_X + 18, y: MAIN_Y },
  { x: ATTIC_BASE_X + 78, y: MAIN_Y - 22 },
  { x: ATTIC_BASE_X + 144, y: MAIN_Y + 6 },
  { x: ATTIC_BASE_X + 212, y: MAIN_Y - 10 },
  { x: 700, y: 536 },
  { x: 780, y: 516 },
  { x: 866, y: 466 },
  { x: 948, y: 492 },
  { x: 34, y: 490 },
  { x: 112, y: 530 },
  { x: 194, y: 508 },
  { x: 286, y: 548 },
  { x: ATTIC_BASE_X + 18, y: MAIN_Y },
];

export const ATTIC_CHAMBERS: readonly AtticChamberPlan[] = [
  {
    cx: 314, cy: 548, rx: 20, ry: 10,
    anchor: { x: 286, y: 548 },
    type: RoomType.CORRIDOR,
    name: 'Корневое горло западной плиты',
    wallTex: Tex.GUT,
    floorTex: Tex.F_GUT,
    feature: Feature.CANDLE,
  },
  {
    cx: 848, cy: 466, rx: 24, ry: 9,
    anchor: { x: 866, y: 466 },
    type: RoomType.CORRIDOR,
    name: 'Корневое горло восточного обхода',
    wallTex: Tex.GUT,
    floorTex: Tex.F_GUT,
    feature: Feature.CANDLE,
  },
  {
    cx: 704, cy: 574, rx: 25, ry: 17,
    anchor: { x: 700, y: 536 },
    type: RoomType.COMMON,
    name: 'Бетонное гнездо с пустым центром',
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.LAMP,
  },
  {
    cx: 190, cy: 590, rx: 22, ry: 15,
    anchor: { x: 194, y: 508 },
    type: RoomType.COMMON,
    name: 'Бетонное гнездо несущей жилы',
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_GUT,
    feature: Feature.CANDLE,
  },
  {
    cx: 540, cy: 356, rx: 18, ry: 8,
    anchor: { x: ATTIC_BASE_X + 144, y: MAIN_Y + 6 },
    type: RoomType.CORRIDOR,
    name: 'Низкий сервисный лаз над актом',
    wallTex: Tex.PANEL,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.APPARATUS,
  },
  {
    cx: 984, cy: 492, rx: 18, ry: 7,
    anchor: { x: 948, y: 492 },
    type: RoomType.CORRIDOR,
    name: 'Сервисный лаз через край чердака',
    wallTex: Tex.PANEL,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.APPARATUS,
  },
  {
    cx: 766, cy: 394, rx: 18, ry: 14,
    anchor: { x: 780, y: 516 },
    type: RoomType.STORAGE,
    name: 'Ритуальная кладовая сухих корешков',
    wallTex: Tex.DARK,
    floorTex: Tex.F_GUT,
    feature: Feature.SHELF,
  },
  {
    cx: 72, cy: 430, rx: 16, ry: 12,
    anchor: { x: 34, y: 490 },
    type: RoomType.STORAGE,
    name: 'Ритуальная кладовая черной ладони',
    wallTex: Tex.DARK,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.SHELF,
  },
  {
    cx: 514, cy: 82, rx: 23, ry: 16,
    anchor: { x: 540, y: 356 },
    type: RoomType.CORRIDOR,
    name: 'Сломанный лестничный оголовок вверх',
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.LAMP,
  },
  {
    cx: 902, cy: 650, rx: 20, ry: 12,
    anchor: { x: 866, y: 466 },
    type: RoomType.PRODUCTION,
    name: 'Ложная сервисная комната',
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.MACHINE,
  },
  {
    cx: 458, cy: 402, rx: 16, ry: 18,
    anchor: { x: ATTIC_BASE_X + 78, y: MAIN_Y - 22 },
    type: RoomType.PRODUCTION,
    name: 'Шахта кабельного давления',
    wallTex: Tex.PIPE,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.APPARATUS,
  },
  {
    cx: 604, cy: 474, rx: 21, ry: 10,
    anchor: { x: 590, y: 476 },
    type: RoomType.PRODUCTION,
    name: 'Кабельная развилка гудящего корня',
    wallTex: Tex.PIPE,
    floorTex: Tex.F_GUT,
    feature: Feature.MACHINE,
  },
  {
    cx: 620, cy: 642, rx: 18, ry: 13,
    anchor: { x: 700, y: 536 },
    type: RoomType.STORAGE,
    name: 'Запечатанный карман фильтров',
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.SHELF,
  },
  {
    cx: 438, cy: 842, rx: 20, ry: 12,
    anchor: { x: 410, y: 918 },
    type: RoomType.STORAGE,
    name: 'Склад шахтных уплотнителей',
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.SHELF,
  },
  {
    cx: 820, cy: 736, rx: 18, ry: 16,
    anchor: { x: 902, y: 650 },
    type: RoomType.PRODUCTION,
    name: 'Пульт старых вытяжных лопаток',
    wallTex: Tex.PIPE,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.APPARATUS,
  },
  {
    cx: 252, cy: 398, rx: 20, ry: 9,
    anchor: { x: 194, y: 508 },
    type: RoomType.CORRIDOR,
    name: 'Низкая полка под корнем связи',
    wallTex: Tex.GUT,
    floorTex: Tex.F_GUT,
    feature: Feature.CANDLE,
  },
  {
    cx: 662, cy: 424, rx: 14, ry: 7,
    anchor: { x: 638, y: 482 },
    type: RoomType.CORRIDOR,
    name: 'Сдавленная развилка ползучего графа',
    wallTex: Tex.PANEL,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.APPARATUS,
  },
  {
    cx: 722, cy: 426, rx: 13, ry: 8,
    anchor: { x: 662, y: 424 },
    type: RoomType.STORAGE,
    name: 'Ниша сухих кабельных реликвий',
    wallTex: Tex.DARK,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.SHELF,
  },
  {
    cx: 578, cy: 522, rx: 13, ry: 8,
    anchor: { x: 590, y: 476 },
    type: RoomType.STORAGE,
    name: 'Карман корневого подкорма',
    wallTex: Tex.GUT,
    floorTex: Tex.F_GUT,
    feature: Feature.CANDLE,
  },
  {
    cx: 126, cy: 606, rx: 12, ry: 7,
    anchor: { x: 112, y: 530 },
    type: RoomType.COMMON,
    name: 'Поклонная ниша за черной ладонью',
    wallTex: Tex.GUT,
    floorTex: Tex.F_GUT,
    feature: Feature.CANDLE,
  },
  {
    cx: 970, cy: 548, rx: 13, ry: 8,
    anchor: { x: 948, y: 492 },
    type: RoomType.STORAGE,
    name: 'Тайник под сервисным переломом',
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.SHELF,
  },
];

export const ATTIC_ECOLOGY_ANCHORS: readonly AtticPoint[] = [
  ...ATTIC_SPINE,
  { x: 638, y: 482 },
  { x: 52, y: 538 },
  { x: 524, y: 930 },
  { x: 458, y: 402 },
  { x: 604, y: 474 },
  { x: 620, y: 642 },
  { x: 438, y: 842 },
  { x: 820, y: 736 },
  { x: 252, y: 398 },
  { x: 662, y: 424 },
  { x: 722, y: 426 },
  { x: 578, y: 522 },
  { x: 126, y: 606 },
  { x: 970, y: 548 },
];

export interface AtticCrawlNichePlan {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  floorTex: Tex;
  wallTex: Tex;
  feature: Feature;
}

export interface AtticCapillarySeed {
  x: number;
  y: number;
  dx: number;
  dy: number;
  root: boolean;
}

export type RoomSide = 'north' | 'south' | 'west' | 'east';

export const ATTIC_STEALTH_CRAWL_GRAPH: readonly [AtticPoint, AtticPoint][] = [
  [{ x: ATTIC_BASE_X + 52, y: MAIN_Y - 50 }, { x: ATTIC_BASE_X + 116, y: MAIN_Y - 72 }],
  [{ x: ATTIC_BASE_X + 116, y: MAIN_Y - 72 }, { x: ATTIC_BASE_X + 172, y: MAIN_Y - 54 }],
  [{ x: ATTIC_BASE_X + 172, y: MAIN_Y - 54 }, { x: ATTIC_BASE_X + 214, y: MAIN_Y - 10 }],
  [{ x: ATTIC_BASE_X + 116, y: MAIN_Y - 72 }, { x: 458, y: 402 }],
  [{ x: 458, y: 402 }, { x: 545, y: 458 }],
  [{ x: 545, y: 458 }, { x: 604, y: 474 }],
  [{ x: 604, y: 474 }, { x: 662, y: 424 }],
  [{ x: 662, y: 424 }, { x: 722, y: 426 }],
  [{ x: 662, y: 424 }, { x: 746, y: 500 }],
  [{ x: 112, y: 530 }, { x: 126, y: 606 }],
  [{ x: 126, y: 606 }, { x: 194, y: 590 }],
  [{ x: 948, y: 492 }, { x: 970, y: 548 }],
  [{ x: 970, y: 548 }, { x: 42, y: 548 }],
];

export const ATTIC_CRAWL_NICHES: readonly AtticCrawlNichePlan[] = [
  { cx: ATTIC_BASE_X + 116, cy: MAIN_Y - 72, rx: 4, ry: 2, floorTex: Tex.F_CONCRETE, wallTex: Tex.PANEL, feature: Feature.APPARATUS },
  { cx: 545, cy: 458, rx: 5, ry: 2, floorTex: Tex.F_CONCRETE, wallTex: Tex.PIPE, feature: Feature.SHELF },
  { cx: 662, cy: 424, rx: 4, ry: 2, floorTex: Tex.F_CONCRETE, wallTex: Tex.PANEL, feature: Feature.APPARATUS },
  { cx: 722, cy: 426, rx: 4, ry: 2, floorTex: Tex.F_CONCRETE, wallTex: Tex.DARK, feature: Feature.SHELF },
  { cx: 126, cy: 606, rx: 4, ry: 2, floorTex: Tex.F_GUT, wallTex: Tex.GUT, feature: Feature.CANDLE },
  { cx: 970, cy: 548, rx: 5, ry: 2, floorTex: Tex.F_CONCRETE, wallTex: Tex.METAL, feature: Feature.SHELF },
];

export const ATTIC_CAPILLARY_SEEDS: readonly AtticCapillarySeed[] = [
  { x: 314, y: 548, dx: 1, dy: -1, root: true },
  { x: 704, y: 574, dx: -1, dy: -1, root: true },
  { x: 848, y: 466, dx: -1, dy: 1, root: true },
  { x: 126, y: 606, dx: 1, dy: 0, root: true },
  { x: 604, y: 474, dx: 1, dy: 0, root: false },
  { x: 458, y: 402, dx: 1, dy: 1, root: false },
  { x: 820, y: 736, dx: -1, dy: -1, root: false },
  { x: 970, y: 548, dx: 1, dy: 0, root: false },
];

export function traceChthonicAtticExitPaths(
  world: World,
  spawnX: number,
  spawnY: number,
  layout: ChthonicAtticLayout,
  choice: ChthonicAtticRootChoice,
): ChthonicAtticRouteCheck[] {
  const start = world.idx(Math.floor(spawnX), Math.floor(spawnY));
  return layout.exitCells.map(exit => {
    const distance = shortestPathDistance(world, start, exit.idx);
    return {
      choice,
      exitId: exit.id,
      reachable: distance >= 0,
      distance,
    };
  });
}

export function buildAtticProtectedMask(world: World): Uint8Array {
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
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.LIFT) mask[i] = 1;
  }
  return mask;
}

export function carveAtticPathChain(
  world: World,
  points: readonly AtticPoint[],
  radius: number,
  floorTex: Tex,
  protectedMask: Uint8Array,
): void {
  for (let i = 1; i < points.length; i++) {
    carveAtticRootPath(world, points[i - 1], points[i], radius, floorTex, protectedMask);
  }
}

export function carveAtticRootPath(
  world: World,
  from: AtticPoint,
  to: AtticPoint,
  radius: number,
  floorTex: Tex,
  protectedMask: Uint8Array,
): void {
  const dx = world.delta(from.x, to.x);
  const dy = world.delta(from.y, to.y);
  const steps = Math.max(1, Math.abs(dx), Math.abs(dy));
  for (let step = 0; step <= steps; step++) {
    const x = from.x + Math.round((dx * step) / steps);
    const y = from.y + Math.round((dy * step) / steps);
    carveAtticDisc(world, x, y, radius, floorTex, protectedMask);
    if (step % 11 === 0) {
      stampSurfaceSplat(world, x, y, 0.5, 0.5, radius + 0.85, 0.18, x * 73856093 ^ y * 19349663, 58, 35, 28, true);
    }
  }
}

export function carveAtticDisc(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  floorTex: Tex,
  protectedMask: Uint8Array,
): void {
  const floorR2 = radius * radius;
  const shoulder = radius + 2;
  const shoulderR2 = shoulder * shoulder;
  for (let dy = -shoulder; dy <= shoulder; dy++) {
    for (let dx = -shoulder; dx <= shoulder; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > shoulderR2) continue;
      const idx = world.idx(cx + dx, cy + dy);
      if (protectedMask[idx] || world.cells[idx] === Cell.DOOR || world.cells[idx] === Cell.LIFT) continue;
      if (d2 <= floorR2) {
        world.cells[idx] = Cell.FLOOR;
        world.roomMap[idx] = -1;
        world.floorTex[idx] = floorTex;
        world.features[idx] = Feature.NONE;
      } else if (world.cells[idx] === Cell.WALL || world.cells[idx] === Cell.ABYSS) {
        world.cells[idx] = Cell.WALL;
        world.roomMap[idx] = -1;
        world.wallTex[idx] = (dx + dy + cx + cy) % 5 === 0 ? Tex.GUT : Tex.CONCRETE;
      }
    }
  }
}

export function stampAtticVoidKnot(world: World, cx: number, cy: number, radius: number, protectedMask: Uint8Array): void {
  const loop: readonly AtticPoint[] = [
    { x: cx - radius - 7, y: cy },
    { x: cx - 4, y: cy - radius - 6 },
    { x: cx + radius + 7, y: cy - 2 },
    { x: cx + 3, y: cy + radius + 6 },
    { x: cx - radius - 7, y: cy },
  ];
  carveAtticPathChain(world, loop, 1, Tex.F_GUT, protectedMask);

  const r2 = radius * radius;
  const rim2 = (radius + 2) * (radius + 2);
  for (let dy = -radius - 2; dy <= radius + 2; dy++) {
    for (let dx = -radius - 2; dx <= radius + 2; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > rim2) continue;
      const idx = world.idx(cx + dx, cy + dy);
      if (protectedMask[idx] || world.cells[idx] === Cell.DOOR || world.cells[idx] === Cell.LIFT) continue;
      if (d2 <= r2) {
        world.cells[idx] = Cell.ABYSS;
        world.roomMap[idx] = -1;
        world.floorTex[idx] = Tex.F_ABYSS;
        world.features[idx] = Feature.NONE;
      } else {
        world.cells[idx] = Cell.WALL;
        world.roomMap[idx] = -1;
        world.wallTex[idx] = Tex.GUT;
      }
    }
  }
}

export function stampAtticBulbRoom(world: World, plan: AtticChamberPlan): Room {
  const room: Room = {
    id: world.rooms.length,
    type: plan.type,
    x: world.wrap(plan.cx - plan.rx),
    y: world.wrap(plan.cy - plan.ry),
    w: plan.rx * 2 + 1,
    h: plan.ry * 2 + 1,
    doors: [],
    sealed: false,
    name: plan.name,
    apartmentId: -1,
    wallTex: plan.wallTex,
    floorTex: plan.floorTex,
  };
  world.rooms.push(room);

  const outerRx = plan.rx + 2;
  const outerRy = plan.ry + 2;
  for (let dy = -outerRy; dy <= outerRy; dy++) {
    for (let dx = -outerRx; dx <= outerRx; dx++) {
      const nx = dx / Math.max(1, plan.rx);
      const ny = dy / Math.max(1, plan.ry);
      const outerNx = dx / Math.max(1, outerRx);
      const outerNy = dy / Math.max(1, outerRy);
      const idx = world.idx(plan.cx + dx, plan.cy + dy);
      if (nx * nx + ny * ny <= 1) {
        world.cells[idx] = Cell.FLOOR;
        world.roomMap[idx] = room.id;
        world.floorTex[idx] = plan.floorTex;
        world.features[idx] = Feature.NONE;
      } else if (outerNx * outerNx + outerNy * outerNy <= 1.05) {
        world.cells[idx] = Cell.WALL;
        world.roomMap[idx] = -1;
        world.wallTex[idx] = plan.wallTex;
      }
    }
  }

  return room;
}

export function dressAtticBulbRoom(world: World, room: Room, plan: AtticChamberPlan, rng: () => number): void {
  const featureCount = Math.max(2, Math.floor((room.w * room.h) / 110));
  for (let i = 0; i < featureCount; i++) {
    const x = room.x + 2 + Math.floor(rng() * Math.max(1, room.w - 4));
    const y = room.y + 2 + Math.floor(rng() * Math.max(1, room.h - 4));
    const idx = world.idx(x, y);
    if (world.cells[idx] !== Cell.FLOOR || world.roomMap[idx] !== room.id) continue;
    world.features[idx] = i % 3 === 0 ? plan.feature : plan.type === RoomType.STORAGE ? Feature.SHELF : Feature.CANDLE;
  }
  if (plan.type === RoomType.PRODUCTION) {
    setAtticFeature(world, plan.cx, plan.cy, Feature.MACHINE);
    setAtticFeature(world, plan.cx + 2, plan.cy - 1, Feature.APPARATUS);
  }
  if (plan.type === RoomType.CORRIDOR) {
    stampSurfaceSplat(world, plan.cx, plan.cy, 0.5, 0.5, 2.6, 0.22, room.id * 911, 64, 42, 34, true);
  }
}

export function fogAtticServiceCavities(world: World, rooms: readonly Room[]): void {
  for (const room of rooms) {
    if (room.type !== RoomType.PRODUCTION && room.type !== RoomType.STORAGE && room.type !== RoomType.CORRIDOR) continue;
    const strong = room.type === RoomType.PRODUCTION || room.name.includes('Шахта') || room.name.includes('корн');
    for (let dy = 1; dy < room.h - 1; dy++) {
      for (let dx = 1; dx < room.w - 1; dx++) {
        const idx = world.idx(room.x + dx, room.y + dy);
        if (world.cells[idx] !== Cell.FLOOR || world.roomMap[idx] !== room.id) continue;
        if (((dx * 17 + dy * 31 + room.id) & 3) === 0) continue;
        const fog = strong ? 58 + ((idx + room.id * 11) & 31) : 34 + ((idx + room.id * 7) & 23);
        if (world.fog[idx] < fog) world.fog[idx] = fog;
      }
    }
  }
}

export function atticDoorPoint(room: Room, side: RoomSide): { x: number; y: number; outsideX: number; outsideY: number } {
  const midX = room.x + (room.w >> 1);
  const midY = room.y + (room.h >> 1);
  switch (side) {
    case 'north': return { x: midX, y: room.y - 1, outsideX: midX, outsideY: room.y - 2 };
    case 'south': return { x: midX, y: room.y + room.h, outsideX: midX, outsideY: room.y + room.h + 1 };
    case 'west': return { x: room.x - 1, y: midY, outsideX: room.x - 2, outsideY: midY };
    case 'east': return { x: room.x + room.w, y: midY, outsideX: room.x + room.w + 1, outsideY: midY };
  }
}

export function atticHash01(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2d) ^ Math.imul(c ^ 0x165667b1, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  return (x >>> 0) / 0x100000000;
}

export function nearestAtticAnchorPressure(world: World, x: number, y: number, radius: number): number {
  let pressure = 0;
  const r2 = radius * radius;
  for (const anchor of ATTIC_ECOLOGY_ANCHORS) {
    const d2 = world.dist2(x, y, anchor.x, anchor.y);
    if (d2 >= r2) continue;
    pressure = Math.max(pressure, 1 - Math.sqrt(d2) / radius);
  }
  return pressure;
}

export function carveAtticCrawlBypasses(world: World, protectedMask: Uint8Array): void {
  carveAtticPathChain(world, [
    { x: ATTIC_BASE_X + 112, y: MAIN_Y - 18 },
    { x: 545, y: 458 },
    { x: 590, y: 476 },
    { x: ATTIC_BASE_X + 212, y: MAIN_Y - 10 },
  ], 0, Tex.F_CONCRETE, protectedMask);
  carveAtticPathChain(world, [
    { x: 746, y: 500 },
    { x: 784, y: 452 },
    { x: 832, y: 454 },
    { x: 866, y: 466 },
  ], 0, Tex.F_CONCRETE, protectedMask);
  carveAtticPathChain(world, [
    { x: 920, y: 522 },
    { x: 984, y: 555 },
    { x: 42, y: 548 },
    { x: 112, y: 530 },
  ], 0, Tex.F_CONCRETE, protectedMask);
  setAtticFeature(world, 545, 458, Feature.APPARATUS);
  setAtticFeature(world, 784, 452, Feature.SHELF);
  setAtticFeature(world, 42, 548, Feature.CANDLE);
}

export function carveAtticStealthCrawlGraph(world: World, protectedMask: Uint8Array): void {
  for (const [from, to] of ATTIC_STEALTH_CRAWL_GRAPH) {
    carveAtticRootPath(world, from, to, 0, Tex.F_CONCRETE, protectedMask);
  }
  for (const niche of ATTIC_CRAWL_NICHES) {
    stampAtticCrawlNiche(world, niche, protectedMask);
  }
}

export function stampAtticCrawlNiche(world: World, plan: AtticCrawlNichePlan, protectedMask: Uint8Array): void {
  const outerRx = plan.rx + 1;
  const outerRy = plan.ry + 1;
  for (let dy = -outerRy; dy <= outerRy; dy++) {
    for (let dx = -outerRx; dx <= outerRx; dx++) {
      const inner = (dx * dx) / Math.max(1, plan.rx * plan.rx) + (dy * dy) / Math.max(1, plan.ry * plan.ry);
      const outer = (dx * dx) / Math.max(1, outerRx * outerRx) + (dy * dy) / Math.max(1, outerRy * outerRy);
      if (outer > 1.04) continue;
      const idx = world.idx(plan.cx + dx, plan.cy + dy);
      if (protectedMask[idx] || world.cells[idx] === Cell.DOOR || world.cells[idx] === Cell.LIFT) continue;
      if (inner <= 1) {
        world.cells[idx] = Cell.FLOOR;
        world.roomMap[idx] = -1;
        world.floorTex[idx] = plan.floorTex;
        if (dx === 0 && dy === 0) world.features[idx] = plan.feature;
      } else if (world.cells[idx] === Cell.WALL || world.cells[idx] === Cell.ABYSS) {
        world.cells[idx] = Cell.WALL;
        world.roomMap[idx] = -1;
        world.wallTex[idx] = plan.wallTex;
      }
    }
  }
  stampSurfaceSplat(world, plan.cx, plan.cy, 0.5, 0.5, Math.max(plan.rx, plan.ry) * 0.42, 0.2, plan.cx * 29 ^ plan.cy * 31, 52, 43, 36, true);
}

export function stampAtticRootStubs(world: World, protectedMask: Uint8Array): void {
  const stubs: readonly [AtticPoint, AtticPoint][] = [
    [{ x: 700, y: 536 }, { x: 742, y: 600 }],
    [{ x: 780, y: 516 }, { x: 816, y: 574 }],
    [{ x: 112, y: 530 }, { x: 82, y: 604 }],
    [{ x: ATTIC_BASE_X + 78, y: MAIN_Y - 22 }, { x: 452, y: 388 }],
    [{ x: 410, y: 918 }, { x: 354, y: 884 }],
  ];
  for (const [from, to] of stubs) {
    carveAtticRootPath(world, from, to, 1, Tex.F_GUT, protectedMask);
    placeAtticRootPillar(world, to.x, to.y, 3, protectedMask);
  }
}

export function stampAtticChokepoints(world: World, protectedMask: Uint8Array): void {
  placeAtticRootPillar(world, ATTIC_BASE_X + 142, MAIN_Y - 5, 3, protectedMask);
  placeAtticRootPillar(world, ATTIC_BASE_X + 148, MAIN_Y + 8, 3, protectedMask);
  placeAtticRootPillar(world, 780, 510, 3, protectedMask);
  placeAtticRootPillar(world, 786, 524, 3, protectedMask);
  placeAtticRootPillar(world, 948, 486, 3, protectedMask);
  placeAtticRootPillar(world, 34, 496, 3, protectedMask);
  setAtticFeature(world, ATTIC_BASE_X + 150, MAIN_Y + 1, Feature.CANDLE);
  setAtticFeature(world, 783, 517, Feature.LAMP);
  setAtticFeature(world, 1004, 494, Feature.APPARATUS);
}

export function placeAtticRootPillar(world: World, cx: number, cy: number, radius: number, protectedMask: Uint8Array): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const idx = world.idx(cx + dx, cy + dy);
      if (protectedMask[idx] || world.cells[idx] === Cell.DOOR || world.cells[idx] === Cell.LIFT) continue;
      world.cells[idx] = Cell.WALL;
      world.roomMap[idx] = -1;
      world.wallTex[idx] = (dx + dy) & 1 ? Tex.GUT : Tex.MEAT;
      world.features[idx] = Feature.NONE;
    }
  }
}

export function stampAtticLowCeilingShells(world: World): void {
  for (const room of world.rooms) {
    if (!room || !atticRoomReadsLow(room)) continue;
    for (let dy = 1; dy < room.h - 1; dy++) {
      for (let dx = 1; dx < room.w - 1; dx++) {
        const x = room.x + dx;
        const y = room.y + dy;
        const idx = world.idx(x, y);
        if (world.cells[idx] !== Cell.FLOOR) continue;
        const dist = nearestAtticSolidDistance(world, x, y, 4);
        if (dist > 3.2) continue;
        const pressure = Math.max(0, 4 - dist);
        const fog = Math.min(72, 12 + Math.round(pressure * 12));
        if (world.fog[idx] < fog) world.fog[idx] = fog;
        if (dist <= 1.45 && world.floorTex[idx] === Tex.F_CONCRETE && ((x * 13 + y * 17 + room.id) & 3) === 0) {
          world.floorTex[idx] = room.floorTex === Tex.F_GUT ? Tex.F_GUT : Tex.F_CONCRETE;
        }
        if (world.features[idx] === Feature.NONE && dist <= 1.7 && ((x * 19 + y * 23 + room.id) & 31) === 0) {
          world.features[idx] = room.floorTex === Tex.F_GUT ? Feature.CANDLE : Feature.APPARATUS;
        }
        if (((x * 37 + y * 41 + room.id) & 63) === 0) {
          stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.45, 0.14, room.id * 1009 + x * 7 + y, 58, 51, 45, true);
        }
      }
    }
  }

  for (const point of ATTIC_SPINE) {
    stampSurfaceSplat(world, point.x, point.y, 0.5, 0.5, 1.2, 0.11, point.x * 43 ^ point.y * 47, 44, 39, 35, true);
  }
}

export function atticRoomReadsLow(room: Room): boolean {
  const name = room.name.toLowerCase();
  return room.type === RoomType.CORRIDOR
    || room.type === RoomType.STORAGE
    || name.includes('низк')
    || name.includes('лаз')
    || name.includes('шахт')
    || name.includes('карман')
    || name.includes('корн')
    || name.includes('ниша');
}

export function nearestAtticSolidDistance(world: World, x: number, y: number, radius: number): number {
  let best = radius + 1;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 === 0 || d2 >= best * best) continue;
      const cell = world.cells[world.idx(x + dx, y + dy)];
      if (cell !== Cell.WALL && cell !== Cell.ABYSS) continue;
      best = Math.sqrt(d2);
    }
  }
  return best;
}

export function stampAtticCapillaryCracks(world: World, protectedMask: Uint8Array, rng: () => number): void {
  for (let i = 0; i < ATTIC_CAPILLARY_SEEDS.length; i++) {
    const seed = ATTIC_CAPILLARY_SEEDS[i];
    walkAtticCapillary(world, protectedMask, seed, 44 + i * 3, rng, i * 3);
    walkAtticCapillary(world, protectedMask, {
      x: seed.x,
      y: seed.y,
      dx: -seed.dy || seed.dx,
      dy: seed.dx || seed.dy,
      root: seed.root,
    }, 24 + i * 2, rng, i * 3 + 1);
    if (i % 2 === 0) {
      walkAtticCapillary(world, protectedMask, {
        x: seed.x,
        y: seed.y,
        dx: seed.dy || -seed.dx,
        dy: -seed.dx || seed.dy,
        root: seed.root,
      }, 22 + i, rng, i * 3 + 2);
    }
  }
}

export function walkAtticCapillary(
  world: World,
  protectedMask: Uint8Array,
  seed: AtticCapillarySeed,
  length: number,
  rng: () => number,
  serial: number,
): void {
  let x = seed.x;
  let y = seed.y;
  let dx = seed.dx;
  let dy = seed.dy;
  if (dx === 0 && dy === 0) dx = 1;

  for (let step = 0; step < length; step++) {
    const idx = world.idx(x, y);
    if (!protectedMask[idx] && world.cells[idx] !== Cell.DOOR && world.cells[idx] !== Cell.LIFT) {
      if (world.cells[idx] === Cell.WALL) {
        world.wallTex[idx] = seed.root
          ? ((step + serial) & 1 ? Tex.GUT : Tex.MEAT)
          : ((step + serial) & 1 ? Tex.PIPE : Tex.DARK);
      } else if (world.cells[idx] === Cell.FLOOR) {
        if (seed.root && ((step + serial) % 3 === 0)) world.floorTex[idx] = Tex.F_GUT;
        if (world.fog[idx] < (seed.root ? 44 : 28)) world.fog[idx] = seed.root ? 44 : 28;
        if (world.features[idx] === Feature.NONE && ((step + serial) % 19 === 0)) {
          world.features[idx] = seed.root ? Feature.CANDLE : Feature.APPARATUS;
        }
      }
      if ((step & 3) === 0) {
        stampSurfaceSplat(
          world,
          x,
          y,
          0.5,
          0.5,
          seed.root ? 0.62 : 0.42,
          seed.root ? 0.18 : 0.13,
          (seed.x * 73856093 ^ seed.y * 19349663 ^ serial * 83492791 ^ step * 2654435761) | 0,
          seed.root ? 62 : 46,
          seed.root ? 39 : 43,
          seed.root ? 28 : 47,
          true,
        );
      }
    }

    if (step > 0 && step % 7 === 0 && rng() < 0.64) {
      const turnLeft = rng() < 0.5;
      const oldDx = dx;
      dx = turnLeft ? -dy : dy;
      dy = turnLeft ? oldDx : -oldDx;
      if (dx === 0 && dy === 0) dx = 1;
    }
    x = world.wrap(x + dx);
    y = world.wrap(y + dy);
  }
}

export function stampAtticExitCues(world: World): void {
  stampSurfaceSplat(world, ATTIC_BASE_X + 7, ATTIC_BASE_Y + 57, 0.5, 0.5, 4.2, 0.2, 3602, 80, 78, 70, true);
  stampSurfaceSplat(world, ATTIC_BASE_X + 216, ATTIC_BASE_Y + 58, 0.5, 0.5, 4.6, 0.22, 3603, 38, 54, 64, true);
  setAtticFeature(world, ATTIC_BASE_X + 5, ATTIC_BASE_Y + 57, Feature.LAMP);
  setAtticFeature(world, ATTIC_BASE_X + 214, ATTIC_BASE_Y + 58, Feature.LAMP);
  setAtticFeature(world, ATTIC_BASE_X + 153, ATTIC_BASE_Y + 15, Feature.LIFT_BUTTON);
}

export function setAtticFeature(world: World, x: number, y: number, feature: Feature): void {
  const idx = world.idx(x, y);
  if (world.cells[idx] === Cell.FLOOR) world.features[idx] = feature;
}

export function randomAtticRootCell(world: World, rng: () => number): AtticPoint | null {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * W);
    const idx = world.idx(x, y);
    if (world.cells[idx] !== Cell.FLOOR) continue;
    if (world.dist2(x + 0.5, y + 0.5, ATTIC_BASE_X + 11.5, ATTIC_BASE_Y + 57.5) < 48 * 48) continue;
    return { x, y };
  }
  return null;
}

export function fillBaseTextures(world: World): void {
  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.CONCRETE;
    world.floorTex[i] = Tex.F_CONCRETE;
  }
}

export function stampRoom(
  world: World,
  id: number,
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
    id, type,
    x: world.wrap(x), y: world.wrap(y), w, h,
    doors: [],
    sealed: false,
    name,
    apartmentId: -1,
    wallTex,
    floorTex,
  };

  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      world.cells[idx] = Cell.WALL;
      world.roomMap[idx] = -1;
      world.wallTex[idx] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      world.cells[idx] = Cell.FLOOR;
      world.roomMap[idx] = id;
      world.floorTex[idx] = floorTex;
    }
  }
  world.rooms[id] = room;
  return room;
}

export function carveCombatLane(world: World, x0: number, x1: number, y: number): number[] {
  const cells: number[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let dy = -4; dy <= 4; dy++) {
      const idx = world.idx(x, y + dy);
      world.cells[idx] = Cell.FLOOR;
      world.roomMap[idx] = -1;
      world.floorTex[idx] = Math.abs(dy) <= 1 ? Tex.F_MARBLE_TILE : Tex.F_CONCRETE;
      cells.push(idx);
    }
  }
  return cells;
}

export function carveCrawlRoute(
  world: World,
  spawn: Room,
  crawlA: Room,
  crawlB: Room,
  crawlC: Room,
  masha: Room,
  exitRoom: Room,
): number[] {
  const cells: number[] = [];
  carveLine(world, spawn.x + 9, spawn.y - 2, spawn.x + 9, crawlA.y + 4, 0, Tex.F_CONCRETE, cells);
  carveLine(world, spawn.x + 9, crawlA.y + 4, crawlA.x - 2, crawlA.y + 4, 0, Tex.F_CONCRETE, cells);
  carveLine(world, crawlA.x + crawlA.w + 1, crawlA.y + 4, crawlB.x - 2, crawlA.y + 4, 0, Tex.F_CONCRETE, cells);
  carveLine(world, crawlB.x - 2, crawlA.y + 4, crawlB.x - 2, crawlB.y + 3, 0, Tex.F_CONCRETE, cells);
  carveLine(world, crawlB.x + crawlB.w + 1, crawlB.y + 3, crawlC.x - 2, crawlB.y + 3, 0, Tex.F_CONCRETE, cells);
  carveLine(world, crawlC.x - 2, crawlB.y + 3, crawlC.x - 2, crawlC.y + 4, 0, Tex.F_CONCRETE, cells);
  carveLine(world, crawlC.x + crawlC.w + 1, crawlC.y + 4, masha.x + 11, crawlC.y + 4, 0, Tex.F_CONCRETE, cells);
  carveLine(world, masha.x + 11, crawlC.y + 4, masha.x + 11, masha.y - 2, 0, Tex.F_CONCRETE, cells);
  carveLine(world, masha.x + 11, masha.y - 2, exitRoom.x + 5, masha.y - 2, 0, Tex.F_CONCRETE, cells);
  carveLine(world, exitRoom.x + 5, masha.y - 2, exitRoom.x + 5, exitRoom.y - 2, 0, Tex.F_CONCRETE, cells);
  carveLine(world, exitRoom.x + 5, exitRoom.y - 2, exitRoom.x + 5, exitRoom.y + 8, 0, Tex.F_CONCRETE, cells);
  return cells;
}

export function carveLine(
  world: World,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  halfWidth: number,
  floorTex: Tex,
  cells?: number[],
): void {
  let x = x0;
  let y = y0;
  const dx = x1 === x0 ? 0 : (x1 > x0 ? 1 : -1);
  const dy = y1 === y0 ? 0 : (y1 > y0 ? 1 : -1);
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let step = 0; step <= steps; step++) {
    for (let oy = -halfWidth; oy <= halfWidth; oy++) {
      for (let ox = -halfWidth; ox <= halfWidth; ox++) {
        const idx = world.idx(x + ox, y + oy);
        world.cells[idx] = Cell.FLOOR;
        world.roomMap[idx] = -1;
        world.floorTex[idx] = floorTex;
        cells?.push(idx);
      }
    }
    x += dx;
    y += dy;
  }
}

export function placeDoor(world: World, x: number, y: number, roomId: number, state: DoorState): number {
  const idx = world.idx(x, y);
  world.cells[idx] = Cell.DOOR;
  world.roomMap[idx] = -1;
  world.wallTex[idx] = Tex.DOOR_METAL;
  world.doors.set(idx, { idx, state, roomA: roomId, roomB: -1, keyId: '', timer: 0 });
  const room = world.rooms[roomId];
  if (room && !room.doors.includes(idx)) room.doors.push(idx);
  return idx;
}

export function connectRoomToLane(world: World, room: Room, doorX: number, side: 1 | -1): number {
  const doorY = side > 0 ? room.y + room.h : room.y - 1;
  const startY = side > 0 ? doorY + 1 : doorY - 1;
  const endY = side > 0 ? MAIN_Y - 5 : MAIN_Y + 5;
  carveLine(world, doorX, startY, doorX, endY, 1, Tex.F_CONCRETE);
  return placeDoor(world, doorX, doorY, room.id, DoorState.CLOSED);
}

export function placeExitLift(world: World, x: number, y: number, direction: LiftDirection): number {
  const idx = world.idx(x, y);
  world.cells[idx] = Cell.LIFT;
  world.wallTex[idx] = Tex.LIFT_DOOR;
  world.roomMap[idx] = -1;
  world.liftDir[idx] = direction;
  const buttonIdx = world.idx(x + 1, y);
  if (world.cells[buttonIdx] === Cell.FLOOR) {
    world.features[buttonIdx] = Feature.LIFT_BUTTON;
    world.liftDir[buttonIdx] = direction;
  }
  return idx;
}

export function decorateAttic(
  world: World,
  rooms: Record<string, Room>,
): void {
  for (const room of Object.values(rooms)) {
    for (let dy = 1; dy < room.h - 1; dy += 3) {
      const left = world.idx(room.x + 1, room.y + dy);
      const right = world.idx(room.x + room.w - 2, room.y + dy);
      if (room.type === RoomType.STORAGE) {
        world.features[left] = Feature.SHELF;
        world.features[right] = Feature.SHELF;
      } else if (room.type === RoomType.OFFICE || room.type === RoomType.HQ) {
        world.features[left] = Feature.DESK;
        world.features[right] = Feature.CHAIR;
      }
    }
  }

  for (const room of [rooms.deacon, rooms.shrine]) {
    const cx = room.x + Math.floor(room.w / 2);
    const cy = room.y + Math.floor(room.h / 2);
    world.features[world.idx(cx, cy)] = Feature.CANDLE;
    world.features[world.idx(cx - 2, cy)] = Feature.CANDLE;
    world.features[world.idx(cx + 2, cy)] = Feature.CANDLE;
  }

  for (const room of [rooms.spawn, rooms.exitRoom, rooms.masha]) {
    world.features[world.idx(room.x + Math.floor(room.w / 2), room.y + 2)] = Feature.LAMP;
  }

  stampBlackHand(world, rooms.evidence.x + 9, rooms.evidence.y + 6);
  stampVerticalServiceHoles(world, rooms.crawlB.x + 6, rooms.crawlB.y + 3);
}

export function stampRootObstacles(world: World, y: number): void {
  for (let x = ATTIC_BASE_X + 118; x <= ATTIC_BASE_X + 138; x++) {
    for (let dy = -4; dy <= 4; dy++) {
      if (Math.abs(dy) <= 1 || ((x + dy) & 3) === 0) continue;
      const idx = world.idx(x, y + dy);
      world.cells[idx] = Cell.WALL;
      world.wallTex[idx] = (dy & 1) === 0 ? Tex.GUT : Tex.MEAT;
      world.roomMap[idx] = -1;
    }
  }
  for (let x = ATTIC_BASE_X + 50; x <= ATTIC_BASE_X + 180; x += 13) {
    const idx = world.idx(x, ATTIC_BASE_Y + 17);
    world.wallTex[idx] = Tex.GUT;
    stampSurfaceSplat(world, x, ATTIC_BASE_Y + 17, 0.5, 0.5, 0.35, 0.55, x * 17, 60, 42, 30, true);
  }
}

export function stampBlackHand(world: World, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      stampSurfaceSplat(world, x + dx, y + dy, 0.5, 0.5, 0.18, 0.75, 7000 + dx * 31 + dy, 12, 8, 6, true);
    }
  }
}

export function stampVerticalServiceHoles(world: World, x: number, y: number): void {
  for (let dx = -1; dx <= 1; dx++) {
    const idx = world.idx(x + dx, y);
    if (world.cells[idx] !== Cell.FLOOR) continue;
    world.cells[idx] = Cell.ABYSS;
    world.floorTex[idx] = Tex.F_ABYSS;
  }
}

export function retuneAtticZones(world: World, rooms: Room[]): void {
  for (const zone of world.zones) {
    zone.level = 4;
    zone.faction = ZoneFaction.CULTIST;
  }
  for (const room of rooms) {
    const idx = world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2));
    const zone = world.zones[world.zoneMap[idx]];
    if (!zone) continue;
    zone.level = room.type === RoomType.HQ ? 5 : 4;
    zone.faction = room.type === RoomType.HQ ? ZoneFaction.LIQUIDATOR : ZoneFaction.CULTIST;
    zone.hqRoomId = room.type === RoomType.HQ ? room.id : zone.hqRoomId;
  }
}

export function setDoorState(world: World, idx: number, state: DoorState): void {
  const door = world.doors.get(idx);
  if (door) door.state = state;
}

export function scorchRoom(world: World, room: Room): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      world.floorTex[idx] = Tex.F_ABYSS;
      if (((dx + dy) & 3) === 0) world.fog[idx] = 35;
      if (dx === 0 || dy === 0 || dx === room.w - 1 || dy === room.h - 1) world.wallTex[idx] = Tex.DARK;
    }
  }
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFogDirty();
}

export function shortestPathDistance(world: World, start: number, target: number): number {
  if (start === target) return 0;
  const visited = new Uint8Array(W * W);
  const dist = new Int32Array(W * W).fill(-1);
  const queue = new Int32Array(W * W);
  let head = 0;
  let tail = 0;
  visited[start] = 1;
  dist[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % W;
    const y = (idx / W) | 0;
    for (const [dx, dy] of DIRS) {
      const next = world.idx(x + dx, y + dy);
      if (visited[next] || !isTracePassable(world, next)) continue;
      visited[next] = 1;
      dist[next] = dist[idx] + 1;
      if (next === target) return dist[next];
      queue[tail++] = next;
    }
  }
  return -1;
}

export function isTracePassable(world: World, idx: number): boolean {
  const cell = world.cells[idx];
  if (cell === Cell.FLOOR || cell === Cell.WATER || cell === Cell.LIFT) return true;
  if (cell !== Cell.DOOR) return false;
  const door = world.doors.get(idx);
  return !door || (door.state !== DoorState.LOCKED && door.state !== DoorState.HERMETIC_CLOSED);
}

export function connectChthonicRoomsOrganic(world: World, rooms: Room[], protectedMask: Uint8Array, rng: () => number): void {
  const n = rooms.length;
  if (n < 2) return;

  const inMST = new Uint8Array(n);
  const minDist = new Float64Array(n).fill(Infinity);
  const minFrom = new Int32Array(n).fill(-1);

  inMST[0] = 1;
  const cx0 = rooms[0].x + Math.floor(rooms[0].w / 2);
  const cy0 = rooms[0].y + Math.floor(rooms[0].h / 2);
  for (let j = 1; j < n; j++) {
    minDist[j] = world.dist(cx0, cy0, rooms[j].x + Math.floor(rooms[j].w / 2), rooms[j].y + Math.floor(rooms[j].h / 2));
    minFrom[j] = 0;
  }

  const mstEdges: [number, number][] = [];
  for (let iter = 0; iter < n - 1; iter++) {
    let best = Infinity;
    let bestIdx = -1;
    for (let j = 0; j < n; j++) {
      if (!inMST[j] && minDist[j] < best) {
        best = minDist[j];
        bestIdx = j;
      }
    }
    if (bestIdx < 0) break;

    inMST[bestIdx] = 1;
    mstEdges.push([minFrom[bestIdx], bestIdx]);

    const cxB = rooms[bestIdx].x + Math.floor(rooms[bestIdx].w / 2);
    const cyB = rooms[bestIdx].y + Math.floor(rooms[bestIdx].h / 2);
    for (let j = 0; j < n; j++) {
      if (inMST[j]) continue;
      const d = world.dist(cxB, cyB, rooms[j].x + Math.floor(rooms[j].w / 2), rooms[j].y + Math.floor(rooms[j].h / 2));
      if (d < minDist[j]) {
        minDist[j] = d;
        minFrom[j] = bestIdx;
      }
    }
  }

  const extra = Math.floor(n * 0.35);
  for (let k = 0; k < extra; k++) {
    const ai = Math.floor(rng() * n);
    const bi = Math.floor(rng() * n);
    if (ai !== bi) {
      mstEdges.push([ai, bi]);
    }
  }

  for (const [i, j] of mstEdges) {
    const a = rooms[i], b = rooms[j];
    let currX = a.x + Math.floor(a.w / 2);
    let currY = a.y + Math.floor(a.h / 2);
    const targetX = b.x + Math.floor(b.w / 2);
    const targetY = b.y + Math.floor(b.h / 2);

    const waypoints: { x: number; y: number }[] = [];
    const dist = Math.hypot(targetX - currX, targetY - currY);
    if (dist > 25) {
      const midX = Math.floor((currX + targetX) / 2);
      const midY = Math.floor((currY + targetY) / 2);
      const offset = Math.floor((rng() - 0.5) * dist * 0.6);
      let wx = midX + (targetY - currY > 0 ? offset : -offset);
      let wy = midY + (targetX - currX > 0 ? -offset : offset);
      wx = Math.max(20, Math.min(W - 20, wx));
      wy = Math.max(20, Math.min(W - 20, wy));
      waypoints.push({ x: wx, y: wy });
    }
    waypoints.push({ x: targetX, y: targetY });

    let stepCounter = 0;
    for (const wp of waypoints) {
      while (currX !== wp.x || currY !== wp.y) {
        if (currX !== wp.x && currY !== wp.y) {
          if (rng() < 0.5) currX += Math.sign(wp.x - currX);
          else currY += Math.sign(wp.y - currY);
        } else if (currX !== wp.x) {
          currX += Math.sign(wp.x - currX);
        } else {
          currY += Math.sign(wp.y - currY);
        }
        stepCounter++;

        const brush = rng() < 0.15 ? 1 : 0;
        for (let dy = -brush; dy <= brush; dy++) {
          for (let dx = -brush; dx <= brush; dx++) {
            const cIdx = world.idx(currX + dx, currY + dy);
            if (protectedMask[cIdx] !== 1 && world.cells[cIdx] === Cell.WALL) {
              world.cells[cIdx] = Cell.FLOOR;
              world.floorTex[cIdx] = Tex.F_CONCRETE;
              world.wallTex[cIdx] = Tex.CONCRETE;
              world.features[cIdx] = Feature.NONE;
              world.roomMap[cIdx] = a.id;
              protectedMask[cIdx] = 2;
            }
          }
        }

        if (stepCounter % 15 === 0 || (currX === wp.x && currY === wp.y && wp !== waypoints[waypoints.length - 1])) {
          if (rng() < 0.7) {
            const hr = 2 + Math.floor(rng() * 4);
            const fTex = rng() < 0.4 ? Tex.F_CONCRETE : rng() < 0.7 ? Tex.F_TILE : Tex.F_GUT;
            const wTex = fTex === Tex.F_TILE ? Tex.METAL : fTex === Tex.F_GUT ? Tex.GUT : Tex.CONCRETE;
            for (let hy = -hr; hy <= hr; hy++) {
              for (let hx = -hr; hx <= hr; hx++) {
                const tx = currX + hx, ty = currY + hy;
                const hIdx = world.idx(tx, ty);
                if (protectedMask[hIdx] !== 1 && world.cells[hIdx] === Cell.WALL) {
                  let touchesOther = false;
                  for (let ny = -1; ny <= 1; ny++) {
                    for (let nx = -1; nx <= 1; nx++) {
                      if (nx === 0 && ny === 0) continue;
                      const nIdx = world.idx(tx + nx, ty + ny);
                      if (world.cells[nIdx] !== Cell.WALL && world.roomMap[nIdx] !== -1 && world.roomMap[nIdx] !== a.id && world.roomMap[nIdx] !== b.id) {
                        touchesOther = true;
                        break;
                      }
                    }
                    if (touchesOther) break;
                  }
                  if (touchesOther) continue;

                  world.cells[hIdx] = Cell.FLOOR;
                  world.floorTex[hIdx] = fTex;
                  world.wallTex[hIdx] = wTex;
                  world.features[hIdx] = Feature.NONE;
                  world.roomMap[hIdx] = a.id;
                  protectedMask[hIdx] = 2;
                }
              }
            }
            const centerIdx = world.idx(currX, currY);
            if (protectedMask[centerIdx] !== 1 && world.cells[centerIdx] === Cell.FLOOR && world.features[centerIdx] === Feature.NONE) {
              world.features[centerIdx] = rng() < 0.3 ? Feature.LAMP : rng() < 0.6 ? Feature.MACHINE : Feature.APPARATUS;
            }
          }
        }
      }
    }
  }
}

export function carveChthonicLabyrinth(world: World, protectedMask: Uint8Array, rng: () => number): void {
  const newRooms: Room[] = [];
  const numCaverns = 1200;
  
  for (let i = 0; i < numCaverns; i++) {
    let cx = 40 + Math.floor(rng() * (W - 80));
    let cy = 40 + Math.floor(rng() * (W - 80));
    
    if (protectedMask[world.idx(cx, cy)] === 1) continue;
    
    const type = rng() < 0.3 ? RoomType.STORAGE : rng() < 0.6 ? RoomType.PRODUCTION : RoomType.CORRIDOR;
    const room: Room = {
      id: world.rooms.length,
      type,
      x: cx, y: cy, w: 0, h: 0,
      doors: [], sealed: false,
      name: `Старая выработка #${i + 1}`,
      apartmentId: -1,
      wallTex: Tex.CONCRETE,
      floorTex: Tex.F_CONCRETE,
    };
    world.rooms.push(room);
    newRooms.push(room);
    
    const steps = 15 + Math.floor(rng() * 30);
    let minX = cx, maxX = cx, minY = cy, maxY = cy;
    
    for (let step = 0; step < steps; step++) {
      const radius = 3 + Math.floor(rng() * 5); 
      const r2 = radius * radius;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx*dx + dy*dy > r2) continue;
          const tx = cx + dx, ty = cy + dy;
          const idx = world.idx(tx, ty);
          if (protectedMask[idx] === 1 || world.cells[idx] === Cell.DOOR || world.cells[idx] === Cell.LIFT) continue;
          
          if (world.cells[idx] === Cell.WALL) {
            let touchesOther = false;
            for (let ny = -1; ny <= 1; ny++) {
              for (let nx = -1; nx <= 1; nx++) {
                if (nx === 0 && ny === 0) continue;
                const nIdx = world.idx(tx + nx, ty + ny);
                if (world.cells[nIdx] !== Cell.WALL && world.roomMap[nIdx] !== -1 && world.roomMap[nIdx] !== room.id) {
                  touchesOther = true;
                  break;
                }
              }
              if (touchesOther) break;
            }
            if (touchesOther) continue;

            world.cells[idx] = Cell.FLOOR;
            world.floorTex[idx] = room.floorTex;
            world.features[idx] = Feature.NONE;
          }
          if (world.roomMap[idx] === -1 || world.roomMap[idx] === room.id) {
             world.roomMap[idx] = room.id;
             minX = Math.min(minX, tx);
             maxX = Math.max(maxX, tx);
             minY = Math.min(minY, ty);
             maxY = Math.max(maxY, ty);
             protectedMask[idx] = 2;
          }
        }
      }
      
      cx += Math.floor(rng() * 11) - 5;
      cy += Math.floor(rng() * 11) - 5;
      cx = Math.max(20, Math.min(W - 20, cx));
      cy = Math.max(20, Math.min(W - 20, cy));
    }
    
    room.x = minX;
    room.y = minY;
    room.w = Math.max(1, maxX - minX + 1);
    room.h = Math.max(1, maxY - minY + 1); 
    
    const featureCount = Math.floor((room.w * room.h) / 80);
    for (let j = 0; j < featureCount; j++) {
       const fx = room.x + Math.floor(rng() * room.w);
       const fy = room.y + Math.floor(rng() * room.h);
       const ci = world.idx(fx, fy);
       if (world.roomMap[ci] === room.id && world.cells[ci] === Cell.FLOOR && world.features[ci] === Feature.NONE) {
          world.features[ci] = type === RoomType.STORAGE ? Feature.SHELF : (rng() < 0.5 ? Feature.MACHINE : Feature.APPARATUS);
       }
    }
  }
  
  const connectable = world.rooms.filter(r => !r.sealed && r.type !== RoomType.HQ);
  connectChthonicRoomsOrganic(world, connectable, protectedMask, rng);
}

