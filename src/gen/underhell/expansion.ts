/* ── Underhell route-scale expansion: rib lattice, HQ compounds, stations,
   micro rows and the sunken abyss shell around the authored threshold core.
   Ported from the retired design_floors/full_floor.ts expansion block. ── */

import {
  Cell, DoorState, Feature, RoomType,
  Tex, W, ZoneFaction,
  type Room, type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { addRoom } from '../shared';
import { setFeature } from './geometry';

type UnderhellDoorSide = 'north' | 'south' | 'west' | 'east';

interface Point {
  x: number;
  y: number;
}

interface UnderhellLineSpec {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  width: number;
  floorTex: Tex;
  owner: TerritoryOwner;
}

interface UnderhellStationSpec {
  x: number;
  y: number;
  owner: TerritoryOwner;
  type: RoomType;
  name: string;
  radius: number;
}

interface UnderhellHqCompoundSpec {
  owner: TerritoryOwner;
  corridor: readonly [number, number, number, number];
  route: readonly [number, number, number, number];
  core: readonly [number, number, number, number, string];
  supportPrefix: string;
}

interface UnderhellMicroRowSpec {
  label: string;
  owner: TerritoryOwner;
  horizontal: boolean;
  corridor: number;
  start: number;
  end: number;
  side: -1 | 1;
  step: number;
}

const UNDERHELL_RIB_LINES: readonly UnderhellLineSpec[] = [
  { ax: 76, ay: 168, bx: 944, by: 168, width: 3, floorTex: Tex.F_CONCRETE, owner: ZoneFaction.LIQUIDATOR },
  { ax: 92, ay: 304, bx: 928, by: 304, width: 2, floorTex: Tex.F_GUT, owner: ZoneFaction.CULTIST },
  { ax: 64, ay: 448, bx: 960, by: 448, width: 3, floorTex: Tex.F_MEAT, owner: ZoneFaction.WILD },
  { ax: 96, ay: 608, bx: 928, by: 608, width: 3, floorTex: Tex.F_GUT, owner: ZoneFaction.CULTIST },
  { ax: 80, ay: 760, bx: 944, by: 760, width: 3, floorTex: Tex.F_CONCRETE, owner: ZoneFaction.WILD },
  { ax: 104, ay: 904, bx: 920, by: 904, width: 2, floorTex: Tex.F_VOID, owner: ZoneFaction.SAMOSBOR },
  { ax: 112, ay: 112, bx: 112, by: 916, width: 2, floorTex: Tex.F_CONCRETE, owner: ZoneFaction.CITIZEN },
  { ax: 256, ay: 96, bx: 256, by: 928, width: 2, floorTex: Tex.F_GUT, owner: ZoneFaction.CULTIST },
  { ax: 416, ay: 112, bx: 416, by: 916, width: 2, floorTex: Tex.F_MEAT, owner: ZoneFaction.WILD },
  { ax: 576, ay: 96, bx: 576, by: 928, width: 2, floorTex: Tex.F_GUT, owner: ZoneFaction.CULTIST },
  { ax: 736, ay: 112, bx: 736, by: 916, width: 2, floorTex: Tex.F_CONCRETE, owner: ZoneFaction.LIQUIDATOR },
  { ax: 896, ay: 96, bx: 896, by: 928, width: 2, floorTex: Tex.F_MEAT, owner: ZoneFaction.WILD },
];

const UNDERHELL_HQ_COMPOUNDS: readonly UnderhellHqCompoundSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    corridor: [96, 224, 240, 224],
    route: [240, 224, 256, 304],
    core: [144, 196, 30, 14, 'Гражданский гермокор нижнего пайка'],
    supportPrefix: 'Гражданский нижний паек',
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    corridor: [704, 224, 900, 224],
    route: [736, 224, 736, 168],
    core: [784, 194, 34, 15, 'Гермопост ликвидаторов у мясного ребра'],
    supportPrefix: 'Пост ликвидаторов мясного ребра',
  },
  {
    owner: ZoneFaction.SCIENTIST,
    corridor: [72, 560, 238, 560],
    route: [238, 560, 256, 608],
    core: [128, 532, 30, 14, 'Скрытая НИИ-камера пропускника'],
    supportPrefix: 'НИИ-камера пропускника',
  },
  {
    owner: ZoneFaction.WILD,
    corridor: [732, 812, 932, 812],
    route: [896, 812, 896, 760],
    core: [816, 784, 34, 15, 'Разбитый гермокор диких снизу'],
    supportPrefix: 'Дикий нижний разворот',
  },
  {
    owner: ZoneFaction.CULTIST,
    corridor: [234, 812, 430, 812],
    route: [256, 812, 256, 760],
    core: [306, 784, 36, 16, 'Культовый гермокор списка крови'],
    supportPrefix: 'Культовый список крови',
  },
  {
    owner: ZoneFaction.CULTIST,
    corridor: [592, 656, 760, 656],
    route: [576, 656, 576, 608],
    core: [646, 626, 34, 15, 'Второй культовый пост нижней пошлины'],
    supportPrefix: 'Вторая нижняя пошлина',
  },
];

const UNDERHELL_STATIONS: readonly UnderhellStationSpec[] = [
  { x: 112, y: 168, owner: ZoneFaction.CITIZEN, type: RoomType.COMMON, name: 'Корневая станция пайка', radius: 34 },
  { x: 256, y: 168, owner: ZoneFaction.CULTIST, type: RoomType.STORAGE, name: 'Кладовая свечных ребер', radius: 32 },
  { x: 416, y: 168, owner: ZoneFaction.LIQUIDATOR, type: RoomType.OFFICE, name: 'Пост счета проходящих', radius: 34 },
  { x: 576, y: 168, owner: ZoneFaction.CULTIST, type: RoomType.COMMON, name: 'Передняя мокрого журнала', radius: 36 },
  { x: 736, y: 168, owner: ZoneFaction.LIQUIDATOR, type: RoomType.STORAGE, name: 'Оружейный зуб верхнего ребра', radius: 34 },
  { x: 896, y: 168, owner: ZoneFaction.WILD, type: RoomType.SMOKING, name: 'Дымный зуб верхней скобы', radius: 30 },
  { x: 112, y: 304, owner: ZoneFaction.SCIENTIST, type: RoomType.OFFICE, name: 'НИИ-пульт нижнего давления', radius: 32 },
  { x: 256, y: 304, owner: ZoneFaction.CULTIST, type: RoomType.PRODUCTION, name: 'Станция мокрой печати', radius: 38 },
  { x: 416, y: 304, owner: ZoneFaction.WILD, type: RoomType.STORAGE, name: 'Свалочная кладовая ребра', radius: 34 },
  { x: 736, y: 304, owner: ZoneFaction.CULTIST, type: RoomType.COMMON, name: 'Культовый обходной зуб', radius: 40 },
  { x: 896, y: 304, owner: ZoneFaction.WILD, type: RoomType.COMMON, name: 'Дикий боковой судок', radius: 36 },
  { x: 112, y: 448, owner: ZoneFaction.WILD, type: RoomType.STORAGE, name: 'Слепой склад мясной кромки', radius: 36 },
  { x: 256, y: 448, owner: ZoneFaction.CULTIST, type: RoomType.SMOKING, name: 'Курилка свидетелей снизу', radius: 34 },
  { x: 416, y: 448, owner: ZoneFaction.CULTIST, type: RoomType.PRODUCTION, name: 'Печь мелкой пошлины', radius: 38 },
  { x: 576, y: 448, owner: ZoneFaction.CULTIST, type: RoomType.COMMON, name: 'Передняя трех оплат сбоку', radius: 40 },
  { x: 736, y: 448, owner: ZoneFaction.LIQUIDATOR, type: RoomType.OFFICE, name: 'Караульная боковой скобы', radius: 34 },
  { x: 896, y: 448, owner: ZoneFaction.WILD, type: RoomType.STORAGE, name: 'Пошлинная боковая скоба', radius: 36 },
  { x: 112, y: 608, owner: ZoneFaction.SCIENTIST, type: RoomType.MEDICAL, name: 'Медкомната кислого мяса', radius: 32 },
  { x: 256, y: 608, owner: ZoneFaction.WILD, type: RoomType.COMMON, name: 'Лагерь у нижнего ребра', radius: 38 },
  { x: 416, y: 608, owner: ZoneFaction.CULTIST, type: RoomType.STORAGE, name: 'Архив липкой платы', radius: 36 },
  { x: 576, y: 608, owner: ZoneFaction.CULTIST, type: RoomType.PRODUCTION, name: 'Станция крови и корешков', radius: 42 },
  { x: 736, y: 608, owner: ZoneFaction.WILD, type: RoomType.STORAGE, name: 'Разорванная кладовая снизу', radius: 36 },
  { x: 896, y: 608, owner: ZoneFaction.WILD, type: RoomType.COMMON, name: 'Дикий общий костер', radius: 38 },
  { x: 112, y: 760, owner: ZoneFaction.WILD, type: RoomType.SMOKING, name: 'Обратный карниз стоянки', radius: 36 },
  { x: 256, y: 760, owner: ZoneFaction.CULTIST, type: RoomType.PRODUCTION, name: 'Нижняя свечная мойка', radius: 40 },
  { x: 416, y: 760, owner: ZoneFaction.WILD, type: RoomType.STORAGE, name: 'Кладовая костяной проволоки', radius: 36 },
  { x: 576, y: 760, owner: ZoneFaction.CULTIST, type: RoomType.COMMON, name: 'Середина нижнего списка', radius: 42 },
  { x: 736, y: 760, owner: ZoneFaction.WILD, type: RoomType.PRODUCTION, name: 'Разборочный низовой станок', radius: 38 },
  { x: 896, y: 760, owner: ZoneFaction.WILD, type: RoomType.COMMON, name: 'Нижний костяной разворот', radius: 40 },
  { x: 256, y: 904, owner: ZoneFaction.SAMOSBOR, type: RoomType.STORAGE, name: 'Самосборная слепая кладовая', radius: 34 },
  { x: 576, y: 904, owner: ZoneFaction.SAMOSBOR, type: RoomType.PRODUCTION, name: 'Мясной рубец самосбора', radius: 42 },
  { x: 896, y: 904, owner: ZoneFaction.SAMOSBOR, type: RoomType.COMMON, name: 'Ложный выход к Пустоте', radius: 40 },
];

const UNDERHELL_MICRO_ROWS: readonly UnderhellMicroRowSpec[] = [
  { label: 'верхний шкаф ликвидаторов', owner: ZoneFaction.LIQUIDATOR, horizontal: true, corridor: 168, start: 132, end: 884, side: -1, step: 34 },
  { label: 'верхняя культовая ячейка', owner: ZoneFaction.CULTIST, horizontal: true, corridor: 168, start: 160, end: 856, side: 1, step: 38 },
  { label: 'ребро малой платы', owner: ZoneFaction.CULTIST, horizontal: true, corridor: 304, start: 116, end: 892, side: -1, step: 36 },
  { label: 'дикая полка свидетелей', owner: ZoneFaction.WILD, horizontal: true, corridor: 448, start: 112, end: 900, side: 1, step: 34 },
  { label: 'нижняя культовая ниша', owner: ZoneFaction.CULTIST, horizontal: true, corridor: 608, start: 140, end: 876, side: -1, step: 36 },
  { label: 'нижний дикий шкаф', owner: ZoneFaction.WILD, horizontal: true, corridor: 760, start: 120, end: 904, side: 1, step: 34 },
  { label: 'самосборный карман', owner: ZoneFaction.SAMOSBOR, horizontal: true, corridor: 904, start: 156, end: 880, side: -1, step: 42 },
  { label: 'западный пайковый чулан', owner: ZoneFaction.CITIZEN, horizontal: false, corridor: 112, start: 190, end: 732, side: -1, step: 42 },
  { label: 'западная культовая камера', owner: ZoneFaction.CULTIST, horizontal: false, corridor: 256, start: 190, end: 884, side: 1, step: 38 },
  { label: 'средняя дикая кладовая', owner: ZoneFaction.WILD, horizontal: false, corridor: 416, start: 190, end: 884, side: -1, step: 38 },
  { label: 'средняя культовая будка', owner: ZoneFaction.CULTIST, horizontal: false, corridor: 576, start: 190, end: 884, side: 1, step: 38 },
  { label: 'восточный караул', owner: ZoneFaction.LIQUIDATOR, horizontal: false, corridor: 736, start: 190, end: 732, side: -1, step: 42 },
  { label: 'восточная дикая ниша', owner: ZoneFaction.WILD, horizontal: false, corridor: 896, start: 190, end: 884, side: 1, step: 38 },
];

export function expandUnderhellRouteGeometry(world: World, rng: () => number): void {
  const specs = [
    { x: 146, y: 146, w: 38, h: 24, r: 34, name: 'Остров бездонной кости' },
    { x: 360, y: 104, w: 34, h: 22, r: 30, name: 'Корневой верхний уступ' },
    { x: 620, y: 118, w: 42, h: 24, r: 36, name: 'Пустая плита моста' },
    { x: 842, y: 204, w: 36, h: 26, r: 32, name: 'Сторожевой бетонный зуб' },
    { x: 884, y: 452, w: 34, h: 28, r: 31, name: 'Пошлинная боковая скоба' },
    { x: 820, y: 722, w: 44, h: 24, r: 37, name: 'Нижний костяной разворот' },
    { x: 604, y: 864, w: 42, h: 26, r: 38, name: 'Ложный выход к Пустоте' },
    { x: 368, y: 852, w: 34, h: 24, r: 30, name: 'Плита отступления' },
    { x: 142, y: 742, w: 40, h: 25, r: 35, name: 'Обратный карниз' },
    { x: 104, y: 496, w: 36, h: 24, r: 32, name: 'Слепой боковой мост' },
    { x: 210, y: 308, w: 34, h: 23, r: 31, name: 'Остров старого ребра' },
    { x: 724, y: 340, w: 36, h: 24, r: 32, name: 'Культовый обходной зуб' },
  ];
  const points: Point[] = [];
  for (const spec of specs) {
    const x = spec.x + Math.floor((rng() - 0.5) * 12);
    const y = spec.y + Math.floor((rng() - 0.5) * 12);
    const cx = x + (spec.w >> 1);
    const cy = y + (spec.h >> 1);
    carveExpansionDisc(world, cx, cy, spec.r, Tex.F_MEAT);
    const room = addRoom(world, RoomType.COMMON, x, y, spec.w, spec.h, spec.name, Tex.MEAT, Tex.F_MEAT);
    points.push({ x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) });
    for (let i = 0; i < 3; i++) {
      setFeature(world, room.x + 4 + Math.floor(rng() * Math.max(1, room.w - 8)), room.y + 3 + Math.floor(rng() * Math.max(1, room.h - 6)), rng() < 0.5 ? Feature.CANDLE : Feature.APPARATUS);
    }
  }

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    carveExpansionLine(world, a.x, a.y, b.x, b.y, i % 3 === 0 ? 2 : 1, i % 2 === 0 ? Tex.F_CONCRETE : Tex.F_GUT);
  }
  carveExpansionLine(world, 512, 500, points[10].x, points[10].y, 2, Tex.F_CONCRETE);
  carveExpansionLine(world, 512, 500, points[11].x, points[11].y, 2, Tex.F_GUT);
  carveExpansionLine(world, 512, 784, points[6].x, points[6].y, 2, Tex.F_CONCRETE);
  carveExpansionLine(world, 452, 716, points[8].x, points[8].y, 1, Tex.F_CONCRETE);
  addUnderhellRibLattice(world);
  addUnderhellHqCompounds(world);
  addUnderhellStations(world, rng);
  addUnderhellMicroRows(world, rng);
  sinkExpandedUnderhellAbyss(world);
  expandUnderhellOrganicShell(world, rng);

  world.markCellsDirty();
  world.markFloorTexDirty();
  world.markWallTexDirty();
  world.markFeaturesDirty(true);
  world.markFogDirty();
}

/* ── Organic meat shell: worm routes and pockets to the map edges. Ported from
   route_shell.ensureRouteWideFootprint's hell branch — it ran after the lattice
   and abyss sink and pushed the walkable footprint across the whole torus. ── */

const SHELL_EDGE = W - 1;
const SHELL_FLOOR_TEX = Tex.F_GUT;
const SHELL_WALL_TEX = Tex.GUT;
const SHELL_FOG = 28;
const SHELL_ROOM_PREFIX = 'Мясной карман';

function expandUnderhellOrganicShell(world: World, rng: () => number): void {
  const mask = underhellProtectedMask(world);
  const c: Point = { x: W >> 1, y: W >> 1 };
  const pockets = [
    { x: 34, y: 84 }, { x: 278, y: 42 }, { x: 718, y: 74 }, { x: 990, y: 180 },
    { x: 934, y: 514 }, { x: 992, y: 872 }, { x: 690, y: 960 }, { x: 308, y: 914 },
    { x: 38, y: 786 }, { x: 94, y: 428 }, { x: 512, y: 0 }, { x: 512, y: SHELL_EDGE },
    { x: 0, y: 512 }, { x: SHELL_EDGE, y: 512 },
  ];
  let from = c;
  for (let i = 0; i < pockets.length; i++) {
    const p = clampShellPoint({ x: pockets[i].x + shellJitter(rng, 24), y: pockets[i].y + shellJitter(rng, 24) });
    carveShellWormRoute(world, mask, from, p, rng, i % 3 === 0 ? 3 : 2);
    stampShellOrganicPocket(world, mask, p, i);
    from = p;
  }
  carveShellWormRoute(world, mask, from, c, rng, 2);
}

function carveShellWormRoute(world: World, mask: Uint8Array, a: Point, b: Point, rng: () => number, radius: number): void {
  const bends: Point[] = [clampShellPoint(a)];
  const bendCount = 3 + Math.floor(rng() * 3);
  for (let i = 1; i <= bendCount; i++) {
    const t = i / (bendCount + 1);
    bends.push(clampShellPoint({
      x: a.x + (b.x - a.x) * t + shellJitter(rng, 94),
      y: a.y + (b.y - a.y) * t + shellJitter(rng, 94),
    }));
  }
  bends.push(clampShellPoint(b));
  for (let i = 1; i < bends.length; i++) carveShellSegment(world, mask, bends[i - 1], bends[i], radius, 1.6);
}

function carveShellSegment(world: World, mask: Uint8Array, a: Point, b: Point, radius: number, wobble: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(1, Math.abs(dx), Math.abs(dy));
  const nx = dy === 0 ? 0 : -Math.sign(dy);
  const ny = dx === 0 ? 0 : Math.sign(dx);
  const phase = (a.x * 13 + a.y * 17 + b.x * 19 + b.y * 23) * 0.013;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const wave = Math.sin(t * Math.PI * 2 + phase) * wobble;
    const x = Math.round(a.x + dx * t + nx * wave);
    const y = Math.round(a.y + dy * t + ny * wave);
    carveShellDisc(world, mask, x, y, radius);
    if (step % 37 === 0) setShellFeature(world, x, y, step % 74 === 0 ? Feature.APPARATUS : Feature.CANDLE);
  }
}

function carveShellDisc(world: World, mask: Uint8Array, cx: number, cy: number, radius: number): void {
  const floorR2 = radius * radius;
  const shoulder = radius + 2;
  const shoulderR2 = shoulder * shoulder;
  for (let dy = -shoulder; dy <= shoulder; dy++) {
    for (let dx = -shoulder; dx <= shoulder; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > shoulderR2) continue;
      const ci = world.idx(cx + dx, cy + dy);
      if (mask[ci] || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) continue;
      if (d2 <= floorR2) {
        world.cells[ci] = Cell.FLOOR;
        world.roomMap[ci] = -1;
        world.floorTex[ci] = SHELL_FLOOR_TEX;
        world.wallTex[ci] = 0;
        world.hermoWall[ci] = 0;
        world.fog[ci] = Math.max(world.fog[ci], SHELL_FOG);
      } else if (world.cells[ci] === Cell.WALL || world.cells[ci] === Cell.ABYSS) {
        world.cells[ci] = Cell.WALL;
        world.roomMap[ci] = -1;
        world.wallTex[ci] = SHELL_WALL_TEX;
        world.features[ci] = Feature.NONE;
        world.hermoWall[ci] = 0;
      }
    }
  }
}

function stampShellOrganicPocket(world: World, mask: Uint8Array, p: Point, serial: number): void {
  carveShellDisc(world, mask, p.x, p.y, 8 + (serial % 5));
  setShellFeature(world, p.x, p.y, serial % 2 === 0 ? Feature.APPARATUS : Feature.CANDLE);
  if (serial % 3 !== 0) return;
  const room = tryStampShellRoom(world, mask, RoomType.STORAGE, p.x - 7, p.y - 5, 14, 10, `${SHELL_ROOM_PREFIX} ${serial + 1}`);
  if (room) {
    for (let x = room.x + 2; x < room.x + room.w - 2; x += 3) {
      setShellFeature(world, x, room.y + 2, Feature.SHELF);
      setShellFeature(world, x, room.y + room.h - 3, Feature.CANDLE);
    }
  }
}

function tryStampShellRoom(world: World, mask: Uint8Array, type: RoomType, x: number, y: number, w: number, h: number, name: string): Room | null {
  const rx = Math.max(2, Math.min(W - w - 3, Math.round(x)));
  const ry = Math.max(2, Math.min(W - h - 3, Math.round(y)));
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      if (mask[ci] || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) return null;
    }
  }
  const room = addRoom(world, type, rx, ry, w, h, name, SHELL_WALL_TEX, SHELL_FLOOR_TEX);
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const border = dx < 0 || dx >= w || dy < 0 || dy >= h;
      const ci = world.idx(rx + dx, ry + dy);
      mask[ci] = 1;
      if (border && world.cells[ci] !== Cell.FLOOR) {
        world.cells[ci] = Cell.WALL;
        world.wallTex[ci] = SHELL_WALL_TEX;
        world.hermoWall[ci] = 0;
      }
    }
  }
  return room;
}

function setShellFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR && world.features[ci] === Feature.NONE) world.features[ci] = feature;
}

function shellJitter(rng: () => number, amount: number): number {
  return Math.round((rng() * 2 - 1) * amount);
}

function clampShellPoint(p: Point): Point {
  return {
    x: Math.max(0, Math.min(SHELL_EDGE, Math.round(p.x))),
    y: Math.max(0, Math.min(SHELL_EDGE, Math.round(p.y))),
  };
}

function addUnderhellRibLattice(world: World): void {
  for (const line of UNDERHELL_RIB_LINES) {
    carveExpansionLine(world, line.ax, line.ay, line.bx, line.by, line.width, line.floorTex);
    paintUnderhellLineTerritory(world, line, line.owner);
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(line.bx - line.ax), Math.abs(line.by - line.ay)) / 72));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.round(line.ax + (line.bx - line.ax) * t);
      const y = Math.round(line.ay + (line.by - line.ay) * t);
      setFeature(world, x, y, i % 3 === 0 ? Feature.LAMP : Feature.CANDLE);
    }
  }
  for (let i = 0; i < UNDERHELL_RIB_LINES.length; i += 2) {
    const a = UNDERHELL_RIB_LINES[i];
    const b = UNDERHELL_RIB_LINES[(i + 5) % UNDERHELL_RIB_LINES.length];
    carveExpansionLine(world, a.ax, a.ay, b.bx, b.by, 1, i % 4 === 0 ? Tex.F_VOID : Tex.F_GUT);
  }
}

function addUnderhellHqCompounds(world: World): void {
  for (const compound of UNDERHELL_HQ_COMPOUNDS) {
    const [cx1, cy1, cx2, cy2] = compound.corridor;
    const [rx1, ry1, rx2, ry2] = compound.route;
    carveExpansionLine(world, cx1, cy1, cx2, cy2, 2, Tex.F_CONCRETE);
    carveExpansionLine(world, rx1, ry1, rx2, ry2, 2, Tex.F_CONCRETE);
    paintUnderhellRectTerritory(world, Math.min(cx1, cx2) - 4, Math.min(cy1, cy2) - 4, Math.abs(cx2 - cx1) + 9, Math.abs(cy2 - cy1) + 9, compound.owner);
    const [x, y, w, h, name] = compound.core;
    const core = addUnderhellConnectedRoom(world, RoomType.HQ, x, y, w, h, name, compound.owner, Tex.HERMO_WALL, Tex.F_CONCRETE, cx1 + ((cx2 - cx1) >> 1), cy1 + ((cy2 - cy1) >> 1), DoorState.HERMETIC_CLOSED);
    if (core) hardenUnderhellHqCore(world, core, compound.owner);
    const support = underhellSupportRooms(compound, core);
    for (const spec of support) {
      const room = addUnderhellConnectedRoom(world, spec.type, spec.x, spec.y, spec.w, spec.h, spec.name, compound.owner, underhellWallTex(spec.type), underhellFloorTex(spec.type), spec.targetX, spec.targetY, DoorState.CLOSED);
      if (room) decorateUnderhellRoom(world, room);
    }
  }
}

function underhellSupportRooms(compound: UnderhellHqCompoundSpec, core: Room | null): {
  type: RoomType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  targetX: number;
  targetY: number;
}[] {
  const [cx1, cy1, cx2, cy2] = compound.corridor;
  const yOffset = core && core.y < cy1 ? 8 : -20;
  const roomY = cy1 + yOffset;
  const prefix = compound.supportPrefix;
  return [
    { type: RoomType.KITCHEN, name: `${prefix}: кухня`, x: cx1 + 8, y: roomY, w: 24, h: 11, targetX: cx1 + 18, targetY: cy1 },
    { type: RoomType.STORAGE, name: `${prefix}: склад`, x: cx2 - 34, y: roomY, w: 24, h: 11, targetX: cx2 - 18, targetY: cy2 },
    { type: RoomType.MEDICAL, name: `${prefix}: медниша`, x: (core?.x ?? cx1 + 46) - 30, y: core?.y ?? roomY, w: 22, h: 10, targetX: cx1 + ((cx2 - cx1) >> 1), targetY: cy1 },
    { type: RoomType.OFFICE, name: `${prefix}: журнал`, x: (core?.x ?? cx1 + 46) + (core?.w ?? 30) + 8, y: core?.y ?? roomY, w: 22, h: 10, targetX: cx1 + ((cx2 - cx1) >> 1), targetY: cy1 },
    { type: RoomType.COMMON, name: `${prefix}: общая`, x: cx1 + Math.max(18, Math.floor((cx2 - cx1) / 2) - 12), y: roomY + (yOffset > 0 ? 16 : -14), w: 28, h: 11, targetX: cx1 + ((cx2 - cx1) >> 1), targetY: cy1 },
  ];
}

function addUnderhellStations(world: World, rng: () => number): void {
  for (const spec of UNDERHELL_STATIONS) {
    carveExpansionDisc(world, spec.x, spec.y, spec.radius, underhellFloorTex(spec.type));
    paintUnderhellTerritoryPatch(world, spec.x, spec.y, spec.radius + 4, spec.owner);
    const w = 24 + Math.floor(rng() * 10);
    const h = 12 + Math.floor(rng() * 6);
    const room = addUnderhellConnectedRoom(
      world,
      spec.type,
      spec.x - (w >> 1),
      spec.y - (h >> 1),
      w,
      h,
      spec.name,
      spec.owner,
      underhellWallTex(spec.type),
      underhellFloorTex(spec.type),
      nearestUnderhellRibCoord(spec.x),
      nearestUnderhellRibCoord(spec.y),
      DoorState.CLOSED,
    );
    if (room) {
      decorateUnderhellRoom(world, room);
      addUnderhellStationSideRooms(world, rng, room, spec.owner);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng() * 0.32;
      const px = spec.x + Math.round(Math.cos(a) * (spec.radius - 6));
      const py = spec.y + Math.round(Math.sin(a) * (spec.radius - 6));
      setFeature(world, px, py, rng() < 0.6 ? Feature.CANDLE : Feature.SHELF);
    }
  }
}

function addUnderhellStationSideRooms(world: World, rng: () => number, room: Room, owner: TerritoryOwner): void {
  const centerX = room.x + (room.w >> 1);
  const centerY = room.y + (room.h >> 1);
  const specs = [
    { type: RoomType.STORAGE, x: room.x - 18, y: centerY - 5, w: 12, h: 9, tx: room.x - 2, ty: centerY },
    { type: RoomType.BATHROOM, x: room.x + room.w + 6, y: centerY - 5, w: 11, h: 9, tx: room.x + room.w + 1, ty: centerY },
    { type: RoomType.OFFICE, x: centerX - 7, y: room.y - 16, w: 14, h: 9, tx: centerX, ty: room.y - 2 },
    { type: RoomType.COMMON, x: centerX - 8, y: room.y + room.h + 7, w: 16, h: 10, tx: centerX, ty: room.y + room.h + 1 },
  ];
  for (let i = 0; i < specs.length; i++) {
    if (rng() < 0.18) continue;
    const spec = specs[i];
    const side = addUnderhellConnectedRoom(world, spec.type, spec.x, spec.y, spec.w, spec.h, underhellMicroName(spec.type, `боковая ${i + 1}`), owner, underhellWallTex(spec.type), underhellFloorTex(spec.type), spec.tx, spec.ty, DoorState.CLOSED);
    if (side) decorateUnderhellRoom(world, side);
  }
}

function addUnderhellMicroRows(world: World, rng: () => number): void {
  for (const row of UNDERHELL_MICRO_ROWS) {
    let serial = 0;
    for (let p = row.start; p <= row.end; p += row.step) {
      if (rng() < 0.14) continue;
      const type = underhellMicroType(row.owner, serial++);
      const horizontal = row.horizontal;
      const along = 8 + Math.floor(rng() * 5);
      const across = 6 + Math.floor(rng() * 4);
      const w = horizontal ? along : across;
      const h = horizontal ? across : along;
      const gap = 5 + Math.floor(rng() * 4);
      const x = horizontal ? p - (w >> 1) : row.corridor + row.side * gap + (row.side < 0 ? -w : 0);
      const y = horizontal ? row.corridor + row.side * gap + (row.side < 0 ? -h : 0) : p - (h >> 1);
      const targetX = horizontal ? p : row.corridor;
      const targetY = horizontal ? row.corridor : p;
      const room = addUnderhellConnectedRoom(world, type, x, y, w, h, `${row.label}: ${underhellMicroName(type, `${serial}`)}`, row.owner, underhellWallTex(type), underhellFloorTex(type), targetX, targetY, DoorState.CLOSED);
      if (room) decorateUnderhellRoom(world, room);
    }
  }
}

/* Post-territory reinforcement: keeps authored + expansion HQ cores owned,
   hermetic and typed after initializeCellTerritory reshuffles cell ownership.
   Invoked through the generation's onAfterTerritory hook. */
export function reinforceUnderhellAuthoredHqTerritory(world: World): void {
  for (const room of world.rooms) {
    const owner = underhellAuthoredHqOwner(room.name);
    if (owner === undefined) continue;
    room.type = RoomType.HQ;
    recarveUnderhellHqInterior(world, room, owner);
    paintUnderhellRoomTerritory(world, room, owner);
    hardenUnderhellHqCore(world, room, owner);
    for (const idx of room.doors) {
      const door = world.doors.get(idx);
      if (door) door.state = DoorState.HERMETIC_CLOSED;
      world.factionControl[idx] = owner;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
}

function underhellAuthoredHqOwner(name: string): TerritoryOwner | undefined {
  if (name === 'Пост трех оплат' || name === 'Культовая пошлинная палата' || name === 'Палата якоря') return ZoneFaction.CULTIST;
  for (const compound of UNDERHELL_HQ_COMPOUNDS) {
    if (name === compound.core[4]) return compound.owner;
  }
  return undefined;
}

function recarveUnderhellHqInterior(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      world.cells[idx] = Cell.FLOOR;
      world.roomMap[idx] = room.id;
      world.floorTex[idx] = room.floorTex;
      world.wallTex[idx] = 0;
      world.features[idx] = Feature.NONE;
      world.factionControl[idx] = owner;
    }
  }
  if (room.doors.length === 0) {
    connectUnderhellRoomToPoint(world, room, nearestUnderhellRibCoord(room.x + (room.w >> 1)), nearestUnderhellRibCoord(room.y + (room.h >> 1)), DoorState.HERMETIC_CLOSED);
  }
}

function nearestUnderhellRibCoord(value: number): number {
  const ribs = [112, 168, 256, 304, 416, 448, 576, 608, 736, 760, 896, 904];
  let best = ribs[0];
  let bestDist = Math.abs(value - best);
  for (let i = 1; i < ribs.length; i++) {
    const dist = Math.abs(value - ribs[i]);
    if (dist < bestDist) {
      best = ribs[i];
      bestDist = dist;
    }
  }
  return best;
}

function addUnderhellConnectedRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  owner: TerritoryOwner,
  wallTex: Tex,
  floorTex: Tex,
  targetX: number,
  targetY: number,
  state: DoorState,
): Room | null {
  if (!canPlaceUnderhellRoom(world, x, y, w, h)) return null;
  const room = addRoom(world, type, x, y, w, h, name, wallTex, floorTex);
  paintUnderhellRoomTerritory(world, room, owner);
  connectUnderhellRoomToPoint(world, room, targetX, targetY, state);
  paintUnderhellRoomTerritory(world, room, owner);
  paintUnderhellTerritoryPatch(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Math.max(room.w, room.h) + 3, owner);
  return room;
}

function canPlaceUnderhellRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  if (x < 6 || y < 6 || x + w >= W - 6 || y + h >= W - 6) return false;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.cells[idx] === Cell.LIFT || world.doors.has(idx) || world.containerMap.has(idx)) return false;
      const interior = dx >= 0 && dx < w && dy >= 0 && dy < h;
      if (interior && world.roomMap[idx] >= 0) return false;
    }
  }
  return true;
}

function connectUnderhellRoomToPoint(world: World, room: Room, targetX: number, targetY: number, state: DoorState): void {
  const side = underhellDoorSideToward(world, room, targetX, targetY);
  let doorX = room.x + (room.w >> 1);
  let doorY = room.y + (room.h >> 1);
  let outX = doorX;
  let outY = doorY;
  if (side === 'north') {
    doorY = room.y - 1;
    outY = doorY - 1;
  } else if (side === 'south') {
    doorY = room.y + room.h;
    outY = doorY + 1;
  } else if (side === 'west') {
    doorX = room.x - 1;
    outX = doorX - 1;
  } else {
    doorX = room.x + room.w;
    outX = doorX + 1;
  }
  if (side === 'north' || side === 'south') outX = doorX;
  else outY = doorY;
  const doorIdx = world.idx(doorX, doorY);
  carveExpansionLine(world, outX, outY, targetX, targetY, 1, room.floorTex);
  world.cells[doorIdx] = Cell.DOOR;
  world.wallTex[doorIdx] = state === DoorState.HERMETIC_CLOSED || state === DoorState.HERMETIC_OPEN ? Tex.HERMO_WALL : Tex.DOOR_WOOD;
  world.floorTex[doorIdx] = room.floorTex;
  world.doors.set(doorIdx, { idx: doorIdx, state, roomA: room.id, roomB: -1, keyId: '', timer: 0 });
  if (!room.doors.includes(doorIdx)) room.doors.push(doorIdx);
  if (state === DoorState.HERMETIC_CLOSED || state === DoorState.HERMETIC_OPEN) world.hermoWall[doorIdx] = 1;
  reinforceUnderhellDoorSlot(world, side, doorX, doorY, state);
}

function underhellDoorSideToward(world: World, room: Room, targetX: number, targetY: number): UnderhellDoorSide {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  const dx = world.delta(cx, targetX);
  const dy = world.delta(cy, targetY);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west';
  return dy >= 0 ? 'south' : 'north';
}

function hardenUnderhellHqCore(world: World, room: Room, owner: TerritoryOwner): void {
  room.type = RoomType.HQ;
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) {
        if (world.roomMap[idx] === room.id) world.factionControl[idx] = owner;
        continue;
      }
      if (world.cells[idx] !== Cell.WALL && world.cells[idx] !== Cell.DOOR) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
  setFeature(world, room.x + 2, room.y + 2, Feature.SCREEN);
  setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SHELF);
  setFeature(world, room.x + (room.w >> 1), room.y + room.h - 3, Feature.TABLE);
}

function reinforceUnderhellDoorSlot(world: World, side: UnderhellDoorSide, doorX: number, doorY: number, state: DoorState): void {
  const wallTex = state === DoorState.HERMETIC_CLOSED || state === DoorState.HERMETIC_OPEN ? Tex.HERMO_WALL : Tex.MEAT;
  const flank = side === 'north' || side === 'south'
    ? [[-1, 0], [1, 0]] as const
    : [[0, -1], [0, 1]] as const;
  for (const [dx, dy] of flank) {
    const idx = world.idx(doorX + dx, doorY + dy);
    if (world.cells[idx] === Cell.LIFT) continue;
    world.cells[idx] = Cell.WALL;
    world.wallTex[idx] = wallTex;
    world.features[idx] = Feature.NONE;
    if (wallTex === Tex.HERMO_WALL) world.hermoWall[idx] = 1;
  }
}

function underhellMicroType(owner: TerritoryOwner, serial: number): RoomType {
  const cult = [RoomType.STORAGE, RoomType.SMOKING, RoomType.COMMON, RoomType.PRODUCTION, RoomType.BATHROOM] as const;
  const wild = [RoomType.STORAGE, RoomType.SMOKING, RoomType.COMMON, RoomType.BATHROOM, RoomType.PRODUCTION] as const;
  const liquidator = [RoomType.STORAGE, RoomType.OFFICE, RoomType.COMMON, RoomType.MEDICAL, RoomType.BATHROOM] as const;
  const scientist = [RoomType.OFFICE, RoomType.MEDICAL, RoomType.STORAGE, RoomType.PRODUCTION, RoomType.BATHROOM] as const;
  const citizen = [RoomType.KITCHEN, RoomType.COMMON, RoomType.STORAGE, RoomType.BATHROOM, RoomType.MEDICAL] as const;
  const samosbor = [RoomType.STORAGE, RoomType.PRODUCTION, RoomType.CORRIDOR, RoomType.SMOKING] as const;
  const list =
    owner === ZoneFaction.CULTIST ? cult
      : owner === ZoneFaction.WILD ? wild
        : owner === ZoneFaction.LIQUIDATOR ? liquidator
          : owner === ZoneFaction.SCIENTIST ? scientist
            : owner === ZoneFaction.SAMOSBOR ? samosbor
              : citizen;
  return list[serial % list.length];
}

function underhellWallTex(type: RoomType): Tex {
  if (type === RoomType.HQ) return Tex.HERMO_WALL;
  if (type === RoomType.BATHROOM || type === RoomType.KITCHEN || type === RoomType.MEDICAL) return Tex.TILE_W;
  if (type === RoomType.PRODUCTION) return Tex.GUT;
  if (type === RoomType.OFFICE) return Tex.PANEL;
  return Tex.MEAT;
}

function underhellFloorTex(type: RoomType): Tex {
  if (type === RoomType.BATHROOM || type === RoomType.KITCHEN || type === RoomType.MEDICAL) return Tex.F_TILE;
  if (type === RoomType.OFFICE || type === RoomType.HQ) return Tex.F_CONCRETE;
  if (type === RoomType.PRODUCTION) return Tex.F_GUT;
  if (type === RoomType.CORRIDOR) return Tex.F_VOID;
  return Tex.F_MEAT;
}

function underhellMicroName(type: RoomType, suffix: string): string {
  switch (type) {
    case RoomType.KITCHEN: return `микрокухня ${suffix}`;
    case RoomType.BATHROOM: return `микросанузел ${suffix}`;
    case RoomType.MEDICAL: return `медниша ${suffix}`;
    case RoomType.OFFICE: return `журнал ${suffix}`;
    case RoomType.PRODUCTION: return `мокрый станок ${suffix}`;
    case RoomType.SMOKING: return `курилка ${suffix}`;
    case RoomType.COMMON: return `общая будка ${suffix}`;
    default: return `кладовая ${suffix}`;
  }
}

function decorateUnderhellRoom(world: World, room: Room): void {
  if (room.type === RoomType.KITCHEN) {
    setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
    setFeature(world, room.x + (room.w >> 1), room.y + room.h - 3, Feature.TABLE);
  } else if (room.type === RoomType.BATHROOM) {
    setFeature(world, room.x + 2, room.y + 2, Feature.TOILET);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
  } else if (room.type === RoomType.MEDICAL) {
    setFeature(world, room.x + 2, room.y + 2, Feature.SINK);
    setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.SHELF);
  } else if (room.type === RoomType.OFFICE) {
    setFeature(world, room.x + 2, room.y + 2, Feature.DESK);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SCREEN);
  } else if (room.type === RoomType.PRODUCTION) {
    setFeature(world, room.x + 2, room.y + 2, Feature.MACHINE);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.APPARATUS);
  } else if (room.type === RoomType.SMOKING) {
    setFeature(world, room.x + 2, room.y + 2, Feature.CHAIR);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.CANDLE);
  } else {
    setFeature(world, room.x + 2, room.y + 2, Feature.SHELF);
    setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.TABLE);
  }
}

function paintUnderhellLineTerritory(world: World, line: UnderhellLineSpec, owner: TerritoryOwner): void {
  let x = line.ax;
  let y = line.ay;
  const sx = line.bx === line.ax ? 0 : line.bx > line.ax ? 1 : -1;
  const sy = line.by === line.ay ? 0 : line.by > line.ay ? 1 : -1;
  while (x !== line.bx) {
    paintUnderhellTerritoryPatch(world, x, y, line.width + 2, owner);
    x += sx;
  }
  while (y !== line.by) {
    paintUnderhellTerritoryPatch(world, x, y, line.width + 2, owner);
    y += sy;
  }
  paintUnderhellTerritoryPatch(world, x, y, line.width + 2, owner);
}

function paintUnderhellRectTerritory(world: World, x: number, y: number, w: number, h: number, owner: TerritoryOwner): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.cells[idx] === Cell.ABYSS || world.cells[idx] === Cell.LIFT) continue;
      world.factionControl[idx] = owner;
    }
  }
}

function paintUnderhellTerritoryPatch(world: World, x: number, y: number, radius: number, owner: TerritoryOwner): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const idx = world.idx(x + dx, y + dy);
      if (world.cells[idx] === Cell.ABYSS || world.cells[idx] === Cell.LIFT) continue;
      world.factionControl[idx] = owner;
    }
  }
}

function paintUnderhellRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id) world.factionControl[idx] = owner;
    }
  }
  for (const idx of room.doors) world.factionControl[idx] = owner;
}

function sinkExpandedUnderhellAbyss(world: World): void {
  const mask = underhellProtectedMask(world);
  for (let i = 0; i < W * W; i++) {
    if (mask[i]) continue;
    const cell = world.cells[i];
    if (cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.LIFT) continue;
    world.cells[i] = Cell.ABYSS;
    world.roomMap[i] = -1;
    world.wallTex[i] = Tex.DARK;
    world.floorTex[i] = Tex.F_ABYSS;
    world.features[i] = Feature.NONE;
  }
}

function underhellProtectedMask(world: World): Uint8Array {
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
  for (let i = 0; i < W * W; i++) if (world.cells[i] === Cell.LIFT || world.aptMask[i]) mask[i] = 1;
  return mask;
}

/* Expansion carve helpers keep the old full_floor semantics (overwrite walls,
   detach roomMap) but never touch lifts, protected apartments, registered
   door cells or container cells — those anchors must survive route expansion. */
function carveExpansionLine(world: World, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex): void {
  let x = ax;
  let y = ay;
  const sx = bx === ax ? 0 : bx > ax ? 1 : -1;
  const sy = by === ay ? 0 : by > ay ? 1 : -1;
  while (x !== bx) {
    carveExpansionDisc(world, x, y, width, floorTex);
    x += sx;
  }
  while (y !== by) {
    carveExpansionDisc(world, x, y, width, floorTex);
    y += sy;
  }
  carveExpansionDisc(world, x, y, width, floorTex);
}

function carveExpansionDisc(world: World, cx: number, cy: number, r: number, floorTex: Tex): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const ci = world.idx(cx + dx, cy + dy);
      if (world.cells[ci] === Cell.LIFT || world.aptMask[ci]) continue;
      if (world.doors.has(ci) || world.containerMap.has(ci)) continue;
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = -1;
      world.floorTex[ci] = floorTex;
    }
  }
}
