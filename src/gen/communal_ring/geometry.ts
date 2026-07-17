import type { Room, TerritoryOwner } from '../../core/types';
import { DoorState } from '../../core/types';
import {
  Cell,
  
  RoomType,
  Tex,
  W,
  ZoneFaction,
  Feature,
  
  
  
  type Zone,
} from '../../core/types';
import { World } from '../../core/world';
import { FloorStyle, setFeature, addRoom, carveLine, protectedMask } from '../shared';


export type CommunalSide = 'north' | 'south' | 'west' | 'east';

export interface CommunalServiceLoopSpec {
  name: string;
  type: RoomType;
  left: number;
  top: number;
  right: number;
  bottom: number;
  floorTex: Tex;
  wallTex: Tex;
  faction: ZoneFaction;
  level: number;
}

export type CommunalRoomDoorSide = 'north' | 'south' | 'west' | 'east';

export interface CommunalMicroRoomSpec {
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  doorSide: CommunalRoomDoorSide;
  targetX: number;
  targetY: number;
}

export interface CommunalHqRoomSpec {
  type: RoomType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  doorSide: CommunalRoomDoorSide;
  targetX: number;
  targetY: number;
}

export interface CommunalHqCompoundSpec {
  owner: TerritoryOwner;
  hall: readonly [number, number, number, number];
  rooms: readonly CommunalHqRoomSpec[];
}

export const COMMUNAL_SERVICE_LOOPS: readonly CommunalServiceLoopSpec[] = [
  { name: 'Петля кухонного кипятка', type: RoomType.KITCHEN, left: 426, top: 424, right: 596, bottom: 480, floorTex: Tex.F_TILE, wallTex: Tex.TILE_W, faction: ZoneFaction.CITIZEN, level: 2 },
  { name: 'Петля водяной очереди', type: RoomType.BATHROOM, left: 574, top: 464, right: 660, bottom: 552, floorTex: Tex.F_WATER, wallTex: Tex.TILE_W, faction: ZoneFaction.LIQUIDATOR, level: 3 },
  { name: 'Петля паечной кладовой', type: RoomType.STORAGE, left: 438, top: 550, right: 590, bottom: 612, floorTex: Tex.F_CONCRETE, wallTex: Tex.PANEL, faction: ZoneFaction.WILD, level: 3 },
  { name: 'Петля курилки свидетелей', type: RoomType.SMOKING, left: 330, top: 456, right: 410, bottom: 536, floorTex: Tex.F_LINO, wallTex: Tex.PANEL, faction: ZoneFaction.WILD, level: 2 },
  { name: 'Петля прачечной пропажи', type: RoomType.PRODUCTION, left: 396, top: 484, right: 478, bottom: 548, floorTex: Tex.F_TILE, wallTex: Tex.TILE_W, faction: ZoneFaction.SAMOSBOR, level: 3 },
  { name: 'Петля скрытой ведомости', type: RoomType.COMMON, left: 692, top: 596, right: 804, bottom: 688, floorTex: Tex.F_LINO, wallTex: Tex.PANEL, faction: ZoneFaction.CITIZEN, level: 3 },
];

export const COMMUNAL_MICRO_TYPES: readonly RoomType[] = [
  RoomType.LIVING,
  RoomType.STORAGE,
  RoomType.KITCHEN,
  RoomType.BATHROOM,
  RoomType.COMMON,
  RoomType.OFFICE,
  RoomType.SMOKING,
  RoomType.LIVING,
  RoomType.STORAGE,
];

export const COMMUNAL_HQ_COMPOUNDS: readonly CommunalHqCompoundSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    hall: [438, 318, 526, 318],
    rooms: [
      { type: RoomType.HQ, name: 'Гражданский штаб очереди', x: 474, y: 324, w: 30, h: 15, doorSide: 'north', targetX: 488, targetY: 318 },
      { type: RoomType.KITCHEN, name: 'Кухня гражданского штаба', x: 438, y: 300, w: 22, h: 11, doorSide: 'south', targetX: 449, targetY: 318 },
      { type: RoomType.STORAGE, name: 'Склад общих талонов', x: 506, y: 324, w: 20, h: 11, doorSide: 'north', targetX: 516, targetY: 318 },
      { type: RoomType.MEDICAL, name: 'Медпункт очереди', x: 462, y: 294, w: 20, h: 10, doorSide: 'south', targetX: 472, targetY: 318 },
      { type: RoomType.COMMON, name: 'Комната старших жильцов', x: 438, y: 326, w: 24, h: 12, doorSide: 'north', targetX: 450, targetY: 318 },
    ],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    hall: [704, 190, 784, 190],
    rooms: [
      { type: RoomType.HQ, name: 'Пост ликвидаторов у душевой дуги', x: 734, y: 196, w: 24, h: 13, doorSide: 'north', targetX: 746, targetY: 190 },
      { type: RoomType.STORAGE, name: 'Оружейный шкаф душевой дуги', x: 710, y: 172, w: 20, h: 11, doorSide: 'south', targetX: 720, targetY: 190 },
      { type: RoomType.BATHROOM, name: 'Санитарный шлюз ликвидаторов', x: 760, y: 196, w: 20, h: 11, doorSide: 'north', targetX: 770, targetY: 190 },
      { type: RoomType.OFFICE, name: 'Журнал напора ликвидаторов', x: 732, y: 170, w: 22, h: 11, doorSide: 'south', targetX: 743, targetY: 190 },
    ],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    hall: [244, 190, 320, 190],
    rooms: [
      { type: RoomType.HQ, name: 'НИИ жалобной доски', x: 260, y: 196, w: 24, h: 13, doorSide: 'north', targetX: 272, targetY: 190 },
      { type: RoomType.OFFICE, name: 'Кабинет протоколов жалоб', x: 244, y: 172, w: 22, h: 11, doorSide: 'south', targetX: 255, targetY: 190 },
      { type: RoomType.MEDICAL, name: 'Измерительная медкомната', x: 286, y: 196, w: 20, h: 11, doorSide: 'north', targetX: 296, targetY: 190 },
      { type: RoomType.STORAGE, name: 'Архив купонов НИИ', x: 270, y: 170, w: 20, h: 11, doorSide: 'south', targetX: 280, targetY: 190 },
    ],
  },
  {
    owner: ZoneFaction.WILD,
    hall: [704, 740, 784, 740],
    rooms: [
      { type: RoomType.HQ, name: 'Дикий штаб паечной кладовой', x: 734, y: 746, w: 24, h: 13, doorSide: 'north', targetX: 746, targetY: 740 },
      { type: RoomType.STORAGE, name: 'Разобранная кладовая диких', x: 710, y: 778, w: 22, h: 11, doorSide: 'north', targetX: 721, targetY: 740 },
      { type: RoomType.SMOKING, name: 'Курилка диких свидетелей', x: 760, y: 746, w: 20, h: 11, doorSide: 'north', targetX: 770, targetY: 740 },
      { type: RoomType.COMMON, name: 'Общий угол самозахвата', x: 732, y: 720, w: 22, h: 11, doorSide: 'south', targetX: 743, targetY: 740 },
    ],
  },
  {
    owner: ZoneFaction.CULTIST,
    hall: [236, 740, 360, 740],
    rooms: [
      { type: RoomType.HQ, name: 'Скрытый культовый штаб курилки', x: 288, y: 746, w: 24, h: 13, doorSide: 'north', targetX: 300, targetY: 740 },
      { type: RoomType.COMMON, name: 'Тихая комната следа', x: 236, y: 720, w: 22, h: 11, doorSide: 'south', targetX: 247, targetY: 740 },
      { type: RoomType.STORAGE, name: 'Кладовая свечей курилки', x: 336, y: 746, w: 20, h: 11, doorSide: 'north', targetX: 346, targetY: 740 },
      { type: RoomType.KITCHEN, name: 'Кухня ритуального кипятка', x: 288, y: 778, w: 22, h: 11, doorSide: 'north', targetX: 299, targetY: 740 },
    ],
  },
];

export function tuneCommunalRingZone(world: World, zone: Zone, baseDanger: number): void {
  let best = COMMUNAL_SERVICE_LOOPS[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < COMMUNAL_SERVICE_LOOPS.length; i++) {
    const spec = COMMUNAL_SERVICE_LOOPS[i]!;
    const cx = (spec.left + spec.right) / 2;
    const cy = (spec.top + spec.bottom) / 2;
    const rx = Math.max(1, spec.right - spec.left);
    const ry = Math.max(1, spec.bottom - spec.top);
    const radius = Math.max(rx, ry) * 1.35;
    const domainJitter = (((zone.id * 1103515245 + i * 1013904223) >>> 0) % 1024) / 1024;
    const d2 = world.dist2(zone.cx, zone.cy, cx, cy);
    const score = d2 / (radius * radius) + domainJitter * 0.42 - spec.level * 0.1;
    if (score < bestScore) {
      best = spec;
      bestScore = score;
    }
  }

  zone.faction = best.faction;
  zone.level = Math.max(zone.level, Math.min(5, Math.max(baseDanger, best.level)));
  zone.hasLift = zone.hasLift || best.type === RoomType.BATHROOM || best.type === RoomType.STORAGE;
}

export function expandCommunalRing(world: World, rng: () => number, s: FloorStyle): void {
  const mask = communalProtectedMask(world);
  const rings = [132, 252, 372, 456];
  for (const r of rings) carveCommunalRing(world, mask, r, r === 132 ? 3 : 4, s.floorTex);

  for (const x of [192, 320, 512, 704, 832]) {
    carveSafeLine(world, mask, x, 512 - 456, x, 512 - 132, 3, s.floorTex);
    carveSafeLine(world, mask, x, 512 + 132, x, 512 + 456, 3, s.floorTex);
  }
  for (const y of [192, 320, 512, 704, 832]) {
    carveSafeLine(world, mask, 512 - 456, y, 512 - 132, y, 3, s.floorTex);
    carveSafeLine(world, mask, 512 + 132, y, 512 + 456, y, 3, s.floorTex);
  }

  carveSafeLine(world, mask, 512, 512 - 132, 512, 460, 2, s.floorTex);
  carveSafeLine(world, mask, 512, 564, 512, 512 + 132, 2, s.floorTex);
  addCommunalServiceShafts(world, mask);
  addCommunalDomesticServiceLoops(world, mask);
  addCommunalBottlenecks(world, mask, s.wallTex);
  addCommunalHqCompounds(world, mask);

  const serviceTypes = [
    RoomType.KITCHEN,
    RoomType.COMMON,
    RoomType.BATHROOM,
    RoomType.PRODUCTION,
    RoomType.STORAGE,
    RoomType.SMOKING,
    RoomType.OFFICE,
    RoomType.LIVING,
  ];
  const sides: CommunalSide[] = ['north', 'east', 'south', 'west'];
  for (let ri = 1; ri < rings.length; ri++) {
    const r = rings[ri];
    const offsets = [-r + 72, Math.round(-r * 0.32), Math.round(r * 0.32), r - 72];
    for (let si = 0; si < sides.length; si++) {
      for (let oi = 0; oi < offsets.length; oi++) {
        const type = serviceTypes[(ri + si + oi) % serviceTypes.length];
        addCommunalKnot(world, mask, rng, s, sides[si], r, offsets[oi], type);
      }
    }
  }
  addCommunalMicroRoomBands(world, mask, rng, s);
}

export function labelCommunalRingPopulationRooms(world: World): void {
  for (const room of world.rooms) {
    switch (room.name) {
      case 'Радиальная общая кухня':
        room.type = RoomType.KITCHEN;
        break;
      case 'Банный ряд кольца':
        room.type = RoomType.BATHROOM;
        break;
      case 'Прачечный узел':
        room.type = RoomType.PRODUCTION;
        break;
      case 'Кладовая у спицы':
        room.type = RoomType.STORAGE;
        break;
      case 'Дежурная доска':
        room.type = RoomType.OFFICE;
        break;
      case 'Курилка у кольца':
        room.type = RoomType.SMOKING;
        break;
      case 'Коммунальная тесная комната':
        room.type = RoomType.LIVING;
        break;
    }
  }

  for (const spec of COMMUNAL_SERVICE_LOOPS) {
    labelCommunalLogicalRoom(
      world,
      spec.type,
      spec.name,
      spec.left,
      spec.top,
      spec.right - spec.left + 1,
      spec.bottom - spec.top + 1,
      spec.floorTex,
      spec.wallTex,
    );
  }

  const storageLines: readonly [string, number, number, number, number][] = [
    ['Мусорный сервисный ход северо-запада', 56, 220, 380, 220],
    ['Мусорный сервисный ход северо-востока', 644, 284, 968, 284],
    ['Прачечный сервисный ход юго-запада', 212, 644, 212, 968],
    ['Водяной сервисный ход востока', 812, 56, 812, 380],
    ['Пищевой сервисный ход юга', 140, 812, 388, 812],
    ['Сухой сервисный ход юго-востока', 636, 720, 884, 720],
  ];
  for (const [name, ax, ay, bx, by] of storageLines) {
    labelCommunalLineRoom(world, RoomType.STORAGE, name, ax, ay, bx, by, 5, Tex.F_CONCRETE, Tex.PIPE);
  }

  const commonRooms: readonly [string, number, number, number, number][] = [
    ['Очередь северной общей кухни', 470, 454, 86, 17],
    ['Очередь паечной кладовой', 466, 552, 92, 21],
    ['Спорный угол прачечной', 416, 486, 32, 38],
    ['Мокрая очередь душевой', 574, 486, 33, 40],
    ['Доска жалоб у внешнего кольца', 520, 466, 54, 24],
    ['Протестный узел северо-запада', 174, 176, 44, 30],
    ['Протестный узел северо-востока', 806, 174, 48, 32],
    ['Протестный узел юго-запада', 176, 806, 46, 34],
    ['Протестный узел юго-востока', 804, 804, 50, 34],
    ['Общий разворот внутреннего кольца', 478, 488, 74, 46],
  ];
  for (const [name, x, y, w, h] of commonRooms) {
    labelCommunalLogicalRoom(world, RoomType.COMMON, name, x, y, w, h, Tex.F_LINO, Tex.PANEL);
  }

  for (const r of [132, 252, 372, 456]) {
    const width = r === 132 ? 6 : 8;
    labelCommunalLogicalRoom(world, RoomType.CORRIDOR, `Северное кольцо коммуналки R${r}`, 512 - r, 512 - r - 2, r * 2 + width, width + 4, Tex.F_LINO, Tex.PANEL);
    labelCommunalLogicalRoom(world, RoomType.CORRIDOR, `Южное кольцо коммуналки R${r}`, 512 - r, 512 + r - 2, r * 2 + width, width + 4, Tex.F_LINO, Tex.PANEL);
    labelCommunalLogicalRoom(world, RoomType.CORRIDOR, `Западное кольцо коммуналки R${r}`, 512 - r - 2, 512 - r, width + 4, r * 2 + width, Tex.F_LINO, Tex.PANEL);
    labelCommunalLogicalRoom(world, RoomType.CORRIDOR, `Восточное кольцо коммуналки R${r}`, 512 + r - 2, 512 - r, width + 4, r * 2 + width, Tex.F_LINO, Tex.PANEL);
  }

  for (const x of [192, 320, 512, 704, 832]) {
    labelCommunalLogicalRoom(world, RoomType.CORRIDOR, `Северная коммунальная спица ${x}`, x - 3, 56, 7, 324, Tex.F_LINO, Tex.PANEL);
    labelCommunalLogicalRoom(world, RoomType.CORRIDOR, `Южная коммунальная спица ${x}`, x - 3, 644, 7, 324, Tex.F_LINO, Tex.PANEL);
  }
  for (const y of [192, 320, 512, 704, 832]) {
    labelCommunalLogicalRoom(world, RoomType.CORRIDOR, `Западная коммунальная спица ${y}`, 56, y - 3, 324, 7, Tex.F_LINO, Tex.PANEL);
    labelCommunalLogicalRoom(world, RoomType.CORRIDOR, `Восточная коммунальная спица ${y}`, 644, y - 3, 324, 7, Tex.F_LINO, Tex.PANEL);
  }
}

export function labelCommunalLineRoom(
  world: World,
  type: RoomType,
  name: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  wallTex: Tex,
): void {
  const half = Math.floor(width / 2);
  const x = Math.min(ax, bx) - half;
  const y = Math.min(ay, by) - half;
  const w = Math.abs(ax - bx) + width;
  const h = Math.abs(ay - by) + width;
  labelCommunalLogicalRoom(world, type, name, x, y, w, h, floorTex, wallTex);
}

export function labelCommunalLogicalRoom(
  world: World,
  type: RoomType,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  floorTex: Tex,
  wallTex: Tex,
): void {
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
  let mapped = 0;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] !== Cell.FLOOR || world.roomMap[ci] >= 0) continue;
      if (mapped === 0) world.rooms.push(room);
      world.roomMap[ci] = room.id;
      mapped++;
    }
  }
}

export function communalProtectedMask(world: World): Uint8Array {
  return protectedMask(world);
}

export function carveCommunalRing(world: World, mask: Uint8Array, r: number, width: number, floorTex: Tex): void {
  carveSafeRect(world, mask, 512 - r, 512 - r, r * 2, width, floorTex);
  carveSafeRect(world, mask, 512 - r, 512 + r, r * 2, width, floorTex);
  carveSafeRect(world, mask, 512 - r, 512 - r, width, r * 2, floorTex);
  carveSafeRect(world, mask, 512 + r, 512 - r, width, r * 2 + width, floorTex);
}

export function carveSafeRect(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number, floorTex: Tex): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) carveSafeCell(world, mask, x + dx, y + dy, floorTex);
  }
}

export function carveSafeLine(world: World, mask: Uint8Array, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex): void {
  if (ax !== bx && ay !== by) {
    carveSafeLine(world, mask, ax, ay, bx, ay, width, floorTex);
    carveSafeLine(world, mask, bx, ay, bx, by, width, floorTex);
    return;
  }
  const half = Math.floor(width / 2);
  const from = ax === bx ? Math.min(ay, by) : Math.min(ax, bx);
  const to = ax === bx ? Math.max(ay, by) : Math.max(ax, bx);
  for (let p = from; p <= to; p++) {
    for (let n = 0; n < width; n++) {
      const o = n - half;
      carveSafeCell(world, mask, ax === bx ? ax + o : p, ax === bx ? p : ay + o, floorTex);
    }
  }
}

export function carveSafeCell(world: World, mask: Uint8Array, x: number, y: number, floorTex: Tex): void {
  const ci = world.idx(x, y);
  if (mask[ci] || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = -1;
  world.floorTex[ci] = floorTex;
  world.factionControl[ci] = ZoneFaction.CITIZEN;
}

export function addCommunalKnot(
  world: World,
  mask: Uint8Array,
  rng: () => number,
  s: FloorStyle,
  side: CommunalSide,
  radius: number,
  offset: number,
  type: RoomType,
): void {
  const size = communalKnotSize(type, rng);
  const center = 512 + offset;
  let x = 0;
  let y = 0;
  let doorX = 0;
  let doorY = 0;
  let ringX = 0;
  let ringY = 0;

  if (side === 'north' || side === 'south') {
    x = Math.round(center - size.w / 2);
    y = side === 'north' ? 512 - radius - size.h - 9 : 512 + radius + 9;
    doorX = Math.round(center);
    doorY = side === 'north' ? y + size.h : y - 1;
    ringX = doorX;
    ringY = side === 'north' ? 512 - radius + 1 : 512 + radius + 2;
  } else {
    x = side === 'west' ? 512 - radius - size.w - 9 : 512 + radius + 9;
    y = Math.round(center - size.h / 2);
    doorX = side === 'west' ? x + size.w : x - 1;
    doorY = Math.round(center);
    ringX = side === 'west' ? 512 - radius + 1 : 512 + radius + 2;
    ringY = doorY;
  }

  if (!canPlaceCommunalRoom(world, mask, x, y, size.w, size.h)) return;
  const tileRoom = type === RoomType.BATHROOM || type === RoomType.KITCHEN;
  const room = addRoom(world, type, x, y, size.w, size.h, communalKnotName(type), tileRoom ? Tex.TILE_W : s.wallTex, tileRoom ? Tex.F_TILE : s.floorTex);
  carveSafeLine(world, mask, doorX, doorY, ringX, ringY, 2, s.floorTex);
  decorateCommunalKnot(world, room, rng);
  placeCommunalQueueMarker(world, ringX, ringY, type);
}

export function communalKnotSize(type: RoomType, rng: () => number): { w: number; h: number } {
  switch (type) {
    case RoomType.KITCHEN: return { w: 32 + Math.floor(rng() * 8), h: 16 + Math.floor(rng() * 4) };
    case RoomType.BATHROOM: return { w: 28 + Math.floor(rng() * 6), h: 15 + Math.floor(rng() * 4) };
    case RoomType.PRODUCTION: return { w: 30 + Math.floor(rng() * 8), h: 16 + Math.floor(rng() * 6) };
    case RoomType.STORAGE: return { w: 24 + Math.floor(rng() * 8), h: 14 + Math.floor(rng() * 5) };
    case RoomType.SMOKING: return { w: 22 + Math.floor(rng() * 6), h: 12 + Math.floor(rng() * 4) };
    case RoomType.OFFICE: return { w: 24 + Math.floor(rng() * 7), h: 13 + Math.floor(rng() * 4) };
    default: return { w: 22 + Math.floor(rng() * 8), h: 13 + Math.floor(rng() * 5) };
  }
}

export function canPlaceCommunalRoom(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number): boolean {
  if (x < 6 || y < 6 || x + w >= W - 6 || y + h >= W - 6) return false;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (mask[ci] || world.cells[ci] !== Cell.WALL) return false;
    }
  }
  return true;
}

export function communalKnotName(type: RoomType): string {
  switch (type) {
    case RoomType.KITCHEN: return 'Радиальная общая кухня';
    case RoomType.BATHROOM: return 'Банный ряд кольца';
    case RoomType.PRODUCTION: return 'Прачечный узел';
    case RoomType.STORAGE: return 'Кладовая у спицы';
    case RoomType.SMOKING: return 'Курилка у кольца';
    case RoomType.OFFICE: return 'Дежурная доска';
    default: return 'Коммунальная тесная комната';
  }
}

export function decorateCommunalKnot(world: World, room: Room, rng: () => number): void {
  if (room.type === RoomType.KITCHEN) {
    for (let x = room.x + 3; x < room.x + room.w - 3; x += 6) setFeature(world, x, room.y + 2, Feature.STOVE);
    setFeature(world, room.x + 2, room.y + room.h - 3, Feature.SINK);
    setFeature(world, room.x + room.w - 5, room.y + room.h - 4, Feature.TABLE);
    return;
  }
  if (room.type === RoomType.BATHROOM) {
    for (let x = room.x + 3; x < room.x + room.w - 3; x += 5) {
      setFeature(world, x, room.y + 2, Feature.SINK);
      setFeature(world, x + 1, room.y + room.h - 3, Feature.TOILET);
    }
    const water = world.idx(room.x + (room.w >> 1), room.y + (room.h >> 1));
    world.cells[water] = Cell.WATER;
    world.floorTex[water] = Tex.F_WATER;
    return;
  }
  if (room.type === RoomType.PRODUCTION) {
    for (let x = room.x + 3; x < room.x + room.w - 3; x += 7) setFeature(world, x, room.y + 3, Feature.MACHINE);
    setFeature(world, room.x + room.w - 4, room.y + room.h - 4, Feature.SHELF);
    setFeature(world, room.x + 4, room.y + room.h - 4, Feature.SINK);
    return;
  }
  if (room.type === RoomType.STORAGE) {
    for (let x = room.x + 3; x < room.x + room.w - 3; x += 4) setFeature(world, x, room.y + 3, Feature.SHELF);
    for (let x = room.x + 5; x < room.x + room.w - 3; x += 6) setFeature(world, x, room.y + room.h - 4, Feature.SHELF);
    return;
  }
  if (room.type === RoomType.SMOKING) {
    setFeature(world, room.x + 3, room.y + 3, Feature.TABLE);
    setFeature(world, room.x + 6, room.y + 3, Feature.CHAIR);
    setFeature(world, room.x + room.w - 4, room.y + 3, Feature.CANDLE);
    setFeature(world, room.x + room.w - 5, room.y + room.h - 4, Feature.SHELF);
    return;
  }
  if (room.type === RoomType.OFFICE) {
    setFeature(world, room.x + 3, room.y + 3, Feature.DESK);
    setFeature(world, room.x + 8, room.y + 3, Feature.SCREEN);
    setFeature(world, room.x + room.w - 4, room.y + room.h - 4, Feature.SHELF);
    return;
  }
  setFeature(world, room.x + 3, room.y + 3, Feature.BED);
  setFeature(world, room.x + room.w - 4, room.y + room.h - 4, rng() < 0.5 ? Feature.TABLE : Feature.CHAIR);
}

export function placeCommunalQueueMarker(world: World, x: number, y: number, type: RoomType): void {
  setFeature(world, x + 2, y, type === RoomType.STORAGE ? Feature.SHELF : Feature.TABLE);
  setFeature(world, x - 2, y, type === RoomType.BATHROOM ? Feature.SINK : Feature.CHAIR);
}

export function addCommunalDomesticServiceLoops(world: World, mask: Uint8Array): void {
  for (const spec of COMMUNAL_SERVICE_LOOPS) {
    carveCommunalServiceLoop(world, mask, spec);
    placeCommunalLoopMarkers(world, spec);
  }
}

export function carveCommunalServiceLoop(world: World, mask: Uint8Array, spec: CommunalServiceLoopSpec): void {
  carveSafeLine(world, mask, spec.left, spec.top, spec.right, spec.top, 2, spec.floorTex);
  carveSafeLine(world, mask, spec.right, spec.top, spec.right, spec.bottom, 2, spec.floorTex);
  carveSafeLine(world, mask, spec.right, spec.bottom, spec.left, spec.bottom, 2, spec.floorTex);
  carveSafeLine(world, mask, spec.left, spec.bottom, spec.left, spec.top, 2, spec.floorTex);
}

export function placeCommunalLoopMarkers(world: World, spec: CommunalServiceLoopSpec): void {
  const cx = Math.round((spec.left + spec.right) / 2);
  const cy = Math.round((spec.top + spec.bottom) / 2);
  if (spec.type === RoomType.KITCHEN) {
    setFeature(world, cx - 8, spec.top, Feature.STOVE);
    setFeature(world, cx + 8, spec.top, Feature.SINK);
    setFeature(world, cx, spec.bottom, Feature.TABLE);
    return;
  }
  if (spec.type === RoomType.BATHROOM) {
    setFeature(world, cx, spec.top, Feature.SINK);
    setFeature(world, spec.right, cy, Feature.TOILET);
    const ci = world.idx(cx, spec.bottom);
    if (world.cells[ci] === Cell.FLOOR) {
      world.cells[ci] = Cell.WATER;
      world.floorTex[ci] = Tex.F_WATER;
    }
    return;
  }
  if (spec.type === RoomType.STORAGE) {
    setFeature(world, spec.left, cy, Feature.SHELF);
    setFeature(world, spec.right, cy, Feature.SHELF);
    setFeature(world, cx, spec.bottom, Feature.TABLE);
    return;
  }
  if (spec.type === RoomType.PRODUCTION) {
    setFeature(world, spec.left, cy, Feature.MACHINE);
    setFeature(world, cx, spec.top, Feature.SINK);
    setFeature(world, spec.right, cy, Feature.APPARATUS);
    return;
  }
  if (spec.type === RoomType.SMOKING) {
    setFeature(world, spec.left, cy, Feature.CHAIR);
    setFeature(world, cx, spec.top, Feature.CANDLE);
    setFeature(world, spec.right, cy, Feature.TABLE);
    return;
  }
  if (spec.type === RoomType.COMMON) {
    setFeature(world, spec.left, cy, Feature.TABLE);
    setFeature(world, cx, spec.top, Feature.CHAIR);
    setFeature(world, spec.right, cy, Feature.LAMP);
  }
}

export function addCommunalServiceShafts(world: World, mask: Uint8Array): void {
  const shafts: [number, number, number, number][] = [
    [56, 220, 380, 220],
    [644, 284, 968, 284],
    [212, 644, 212, 968],
    [812, 56, 812, 380],
    [140, 812, 388, 812],
    [636, 720, 884, 720],
  ];
  for (const [ax, ay, bx, by] of shafts) {
    carveSafeLine(world, mask, ax, ay, bx, by, 1, Tex.F_CONCRETE);
    setFeature(world, ax, ay, Feature.APPARATUS);
    setFeature(world, bx, by, Feature.LAMP);
  }
}

export function addCommunalBottlenecks(world: World, mask: Uint8Array, wallTex: Tex): void {
  addHorizontalPinch(world, mask, 248, 56, 4, 2, wallTex);
  addHorizontalPinch(world, mask, 696, 884, 4, 1, wallTex);
  addHorizontalPinch(world, mask, 396, 260, 4, 1, wallTex);
  addHorizontalPinch(world, mask, 612, 764, 4, 2, wallTex);
  addVerticalPinch(world, mask, 56, 628, 4, 1, wallTex);
  addVerticalPinch(world, mask, 884, 356, 4, 2, wallTex);
  addVerticalPinch(world, mask, 260, 436, 4, 2, wallTex);
  addVerticalPinch(world, mask, 764, 596, 4, 1, wallTex);
}

export function addHorizontalPinch(world: World, mask: Uint8Array, x: number, y: number, width: number, gapOffset: number, wallTex: Tex): void {
  for (let dy = 0; dy < width; dy++) if (dy !== gapOffset) setCommunalWall(world, mask, x, y + dy, wallTex);
}

export function addVerticalPinch(world: World, mask: Uint8Array, x: number, y: number, width: number, gapOffset: number, wallTex: Tex): void {
  for (let dx = 0; dx < width; dx++) if (dx !== gapOffset) setCommunalWall(world, mask, x + dx, y, wallTex);
}

export function setCommunalWall(world: World, mask: Uint8Array, x: number, y: number, wallTex: Tex): void {
  const ci = world.idx(x, y);
  if (mask[ci] || world.cells[ci] !== Cell.FLOOR) return;
  world.cells[ci] = Cell.WALL;
  world.roomMap[ci] = -1;
  world.wallTex[ci] = wallTex;
  world.features[ci] = Feature.NONE;
}

export function addCommunalMicroRoomBands(world: World, mask: Uint8Array, rng: () => number, s: FloorStyle): void {
  const rings = [132, 252, 372, 456] as const;
  const sides: CommunalSide[] = ['north', 'east', 'south', 'west'];
  for (const radius of rings) {
    const step = radius === 132 ? 28 : radius === 252 ? 32 : 36;
    for (let offset = -radius + 34; offset <= radius - 34; offset += step) {
      for (let si = 0; si < sides.length; si++) {
        const side = sides[si];
        const noise = Math.floor(rng() * 9) - 4;
        const type = COMMUNAL_MICRO_TYPES[(radius + offset + si * 3 + COMMUNAL_MICRO_TYPES.length * 16) % COMMUNAL_MICRO_TYPES.length];
        addCommunalMicroRoom(world, mask, rng, s, communalMicroRoomSpec(side, radius, offset + noise, false, type, rng));
        if (radius !== 132 && (Math.abs(offset) > 58 || radius >= 372)) {
          const innerType = COMMUNAL_MICRO_TYPES[(radius + offset + si * 5 + 3 + COMMUNAL_MICRO_TYPES.length * 16) % COMMUNAL_MICRO_TYPES.length];
          addCommunalMicroRoom(world, mask, rng, s, communalMicroRoomSpec(side, radius, offset - noise, true, innerType, rng));
        }
      }
    }
  }
}

export function communalMicroRoomSpec(
  side: CommunalSide,
  radius: number,
  offset: number,
  inward: boolean,
  type: RoomType,
  rng: () => number,
): CommunalMicroRoomSpec {
  const horizontal = side === 'north' || side === 'south';
  const size = communalMicroRoomSize(type, horizontal, rng);
  const ringWidth = radius === 132 ? 3 : 4;
  const gap = 5 + Math.floor(rng() * 4);
  const center = 512 + offset;
  if (side === 'north') {
    const targetY = 512 - radius + 1;
    return {
      type,
      x: Math.round(center - size.w / 2),
      y: inward ? 512 - radius + ringWidth + gap : 512 - radius - gap - size.h,
      w: size.w,
      h: size.h,
      doorSide: inward ? 'north' : 'south',
      targetX: Math.round(center),
      targetY,
    };
  }
  if (side === 'south') {
    const targetY = 512 + radius + 1;
    return {
      type,
      x: Math.round(center - size.w / 2),
      y: inward ? 512 + radius - gap - size.h : 512 + radius + ringWidth + gap,
      w: size.w,
      h: size.h,
      doorSide: inward ? 'south' : 'north',
      targetX: Math.round(center),
      targetY,
    };
  }
  if (side === 'west') {
    const targetX = 512 - radius + 1;
    return {
      type,
      x: inward ? 512 - radius + ringWidth + gap : 512 - radius - gap - size.w,
      y: Math.round(center - size.h / 2),
      w: size.w,
      h: size.h,
      doorSide: inward ? 'west' : 'east',
      targetX,
      targetY: Math.round(center),
    };
  }
  const targetX = 512 + radius + 1;
  return {
    type,
    x: inward ? 512 + radius - gap - size.w : 512 + radius + ringWidth + gap,
    y: Math.round(center - size.h / 2),
    w: size.w,
    h: size.h,
    doorSide: inward ? 'east' : 'west',
    targetX,
    targetY: Math.round(center),
  };
}

export function communalMicroRoomSize(type: RoomType, horizontal: boolean, rng: () => number): { w: number; h: number } {
  const along = 7 + Math.floor(rng() * 5);
  const across = 5 + Math.floor(rng() * 3);
  let w = horizontal ? along : across;
  let h = horizontal ? across : along;
  if (type === RoomType.KITCHEN || type === RoomType.BATHROOM) {
    w += horizontal ? 2 : 1;
    h += horizontal ? 1 : 2;
  } else if (type === RoomType.COMMON || type === RoomType.LIVING) {
    w += 1;
    h += 1;
  }
  return { w, h };
}

export function addCommunalMicroRoom(
  world: World,
  mask: Uint8Array,
  rng: () => number,
  s: FloorStyle,
  spec: CommunalMicroRoomSpec,
): boolean {
  if (!canPlaceCommunalRoom(world, mask, spec.x, spec.y, spec.w, spec.h)) return false;
  const room = addRoom(
    world,
    spec.type,
    spec.x,
    spec.y,
    spec.w,
    spec.h,
    communalMicroRoomName(spec.type),
    communalWallTex(spec.type, s),
    communalFloorTex(spec.type, s),
  );
  decorateCommunalMicroRoom(world, room, rng);
  return connectCommunalRoomToCorridor(world, mask, room, spec.doorSide, spec.targetX, spec.targetY, DoorState.CLOSED);
}

export function communalMicroRoomName(type: RoomType): string {
  switch (type) {
    case RoomType.KITCHEN: return 'Микрокухня между коридорами';
    case RoomType.BATHROOM: return 'Микросанузел между коридорами';
    case RoomType.STORAGE: return 'Кладовка между коридорами';
    case RoomType.SMOKING: return 'Курительная ниша между коридорами';
    case RoomType.OFFICE: return 'Кабинет жалоб между коридорами';
    case RoomType.COMMON: return 'Общая микрокомната';
    default: return 'Тесная проходная комната';
  }
}

export function communalWallTex(type: RoomType, s: FloorStyle): Tex {
  if (type === RoomType.BATHROOM || type === RoomType.KITCHEN || type === RoomType.MEDICAL) return Tex.TILE_W;
  if (type === RoomType.PRODUCTION) return Tex.PIPE;
  if (type === RoomType.HQ) return Tex.HERMO_WALL;
  return s.wallTex;
}

export function communalFloorTex(type: RoomType, s: FloorStyle): Tex {
  if (type === RoomType.BATHROOM || type === RoomType.KITCHEN || type === RoomType.MEDICAL) return Tex.F_TILE;
  if (type === RoomType.STORAGE || type === RoomType.PRODUCTION || type === RoomType.HQ) return Tex.F_CONCRETE;
  if (type === RoomType.LIVING) return Tex.F_WOOD;
  return s.floorTex;
}

export function decorateCommunalMicroRoom(world: World, room: Room, rng: () => number): void {
  switch (room.type) {
    case RoomType.KITCHEN:
      setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
      setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
      setFeature(world, room.x + (room.w >> 1), room.y + room.h - 3, Feature.TABLE);
      break;
    case RoomType.BATHROOM:
      setFeature(world, room.x + 2, room.y + 2, Feature.TOILET);
      setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
      break;
    case RoomType.STORAGE:
      setFeature(world, room.x + 2, room.y + 2, Feature.SHELF);
      setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.SHELF);
      break;
    case RoomType.OFFICE:
      setFeature(world, room.x + 2, room.y + 2, Feature.DESK);
      setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SCREEN);
      break;
    case RoomType.SMOKING:
      setFeature(world, room.x + 2, room.y + 2, Feature.CHAIR);
      setFeature(world, room.x + room.w - 3, room.y + 2, Feature.CANDLE);
      break;
    case RoomType.MEDICAL:
      setFeature(world, room.x + 2, room.y + 2, Feature.SINK);
      setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.SHELF);
      break;
    default:
      setFeature(world, room.x + 2, room.y + 2, Feature.BED);
      setFeature(world, room.x + room.w - 3, room.y + room.h - 3, rng() < 0.55 ? Feature.TABLE : Feature.SHELF);
      break;
  }
}

export function addCommunalHqCompounds(world: World, mask: Uint8Array): void {
  for (const compound of COMMUNAL_HQ_COMPOUNDS) {
    carveSafeLine(world, mask, compound.hall[0], compound.hall[1], compound.hall[2], compound.hall[3], 2, Tex.F_CONCRETE);
    for (const spec of compound.rooms) {
      if (!canPlaceCommunalRoom(world, mask, spec.x, spec.y, spec.w, spec.h)) continue;
      const room = addRoom(
        world,
        spec.type,
        spec.x,
        spec.y,
        spec.w,
        spec.h,
        spec.name,
        spec.type === RoomType.HQ ? Tex.HERMO_WALL : communalWallTex(spec.type, { wallTex: Tex.PANEL, floorTex: Tex.F_LINO }),
        communalFloorTex(spec.type, { wallTex: Tex.PANEL, floorTex: Tex.F_LINO }),
      );
      paintCommunalRoomTerritory(world, room, compound.owner);
      if (spec.type === RoomType.HQ) hardenCommunalHqShell(world, room, compound.owner);
      else decorateCommunalMicroRoom(world, room, () => 0.5);
      connectCommunalRoomToCorridor(
        world,
        mask,
        room,
        spec.doorSide,
        spec.targetX,
        spec.targetY,
        spec.type === RoomType.HQ ? DoorState.HERMETIC_CLOSED : DoorState.CLOSED,
      );
    }
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
}

export function connectCommunalRoomToCorridor(
  world: World,
  mask: Uint8Array,
  room: Room,
  side: CommunalRoomDoorSide,
  targetX: number,
  targetY: number,
  state: DoorState,
  keyId = '',
): boolean {
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
  if (mask[doorIdx] || world.cells[doorIdx] === Cell.LIFT) return false;
  world.cells[doorIdx] = Cell.DOOR;
  world.wallTex[doorIdx] = state === DoorState.HERMETIC_CLOSED || state === DoorState.HERMETIC_OPEN ? Tex.HERMO_WALL : Tex.DOOR_WOOD;
  world.floorTex[doorIdx] = room.floorTex;
  world.factionControl[doorIdx] = world.factionControl[world.idx(room.x + (room.w >> 1), room.y + (room.h >> 1))];
  world.doors.set(doorIdx, {
    idx: doorIdx,
    state,
    roomA: room.id,
    roomB: -1,
    keyId,
    timer: 0,
  });
  room.doors.push(doorIdx);
  carveSafeLine(world, mask, outX, outY, targetX, targetY, 1, room.floorTex);
  return true;
}

export function connectCommunalRoomToCorridorLoose(
  world: World,
  room: Room,
  side: CommunalRoomDoorSide,
  targetX: number,
  targetY: number,
  state: DoorState,
): boolean {
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
  if (world.cells[doorIdx] === Cell.LIFT) return false;
  world.cells[doorIdx] = Cell.DOOR;
  world.wallTex[doorIdx] = state === DoorState.HERMETIC_CLOSED || state === DoorState.HERMETIC_OPEN ? Tex.HERMO_WALL : Tex.DOOR_WOOD;
  world.floorTex[doorIdx] = room.floorTex;
  world.factionControl[doorIdx] = world.factionControl[world.idx(room.x + (room.w >> 1), room.y + (room.h >> 1))];
  world.doors.set(doorIdx, {
    idx: doorIdx,
    state,
    roomA: room.id,
    roomB: -1,
    keyId: '',
    timer: 0,
  });
  room.doors.push(doorIdx);
  carveLine(world, outX, outY, targetX, targetY, 1, room.floorTex);
  return true;
}

export function paintCommunalRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id) world.factionControl[idx] = owner;
    }
  }
  for (const idx of room.doors) world.factionControl[idx] = owner;
}

export function hardenCommunalHqShell(world: World, room: Room, owner: TerritoryOwner): void {
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

export function reinforceCommunalRingAuthoredHqTerritory(world: World): void {
  for (const room of world.rooms) {
    if (room.type !== RoomType.HQ) continue;
    if (communalAuthoredOwnerForRoomName(room.name) !== undefined) continue;
    demoteCommunalFallbackHq(world, room);
  }

  const roomByName = new Map<string, Room>();
  for (const room of world.rooms) {
    if (room.name && !roomByName.has(room.name)) {
      roomByName.set(room.name, room);
    }
  }

  for (const compound of COMMUNAL_HQ_COMPOUNDS) {
    for (const spec of compound.rooms) {
      const room = roomByName.get(spec.name);
      if (!room) continue;
      room.type = spec.type;
      room.sealed = spec.type === RoomType.HQ;
      room.wallTex = spec.type === RoomType.HQ ? Tex.HERMO_WALL : communalWallTex(spec.type, { wallTex: Tex.PANEL, floorTex: Tex.F_LINO });
      room.floorTex = communalFloorTex(spec.type, { wallTex: Tex.PANEL, floorTex: Tex.F_LINO });
      paintCommunalRoomTerritory(world, room, compound.owner);
      if (spec.type === RoomType.HQ) {
        hardenCommunalHqShell(world, room, compound.owner);
        if (room.doors.length === 0) {
          connectCommunalRoomToCorridorLoose(world, room, spec.doorSide, spec.targetX, spec.targetY, DoorState.HERMETIC_CLOSED);
        }
        for (const idx of room.doors) {
          const door = world.doors.get(idx);
          if (door) door.state = DoorState.HERMETIC_CLOSED;
          world.wallTex[idx] = Tex.HERMO_WALL;
          world.factionControl[idx] = compound.owner;
        }
      } else if (room.doors.length === 0) {
        connectCommunalRoomToCorridorLoose(world, room, spec.doorSide, spec.targetX, spec.targetY, DoorState.CLOSED);
      }
    }
  }
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty(false);
}

export const COMMUNAL_AUTHORED_OWNER_MAP = new Map<string, TerritoryOwner>();
for (const compound of COMMUNAL_HQ_COMPOUNDS) {
  for (const room of compound.rooms) {
    if (room.type === RoomType.HQ) {
      COMMUNAL_AUTHORED_OWNER_MAP.set(room.name, compound.owner);
    }
  }
}

export function communalAuthoredOwnerForRoomName(name: string): TerritoryOwner | undefined {
  return COMMUNAL_AUTHORED_OWNER_MAP.get(name);
}

export function demoteCommunalFallbackHq(world: World, room: Room): void {
  room.type = demotedCommunalRoomType(room.name);
  room.sealed = false;
  room.wallTex = communalWallTex(room.type, { wallTex: Tex.PANEL, floorTex: Tex.F_LINO });
  room.floorTex = communalFloorTex(room.type, { wallTex: Tex.PANEL, floorTex: Tex.F_LINO });
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) {
        if (world.roomMap[idx] === room.id) world.floorTex[idx] = room.floorTex;
        continue;
      }
      if (world.cells[idx] !== Cell.WALL && world.cells[idx] !== Cell.DOOR) continue;
      world.hermoWall[idx] = 0;
      world.wallTex[idx] = room.wallTex;
    }
  }
}

export function demotedCommunalRoomType(name: string): RoomType {
  if (name.includes('Клад') || name.includes('клад') || name.includes('Паёч')) return RoomType.STORAGE;
  if (name.includes('душ') || name.includes('Душ') || name.includes('сан')) return RoomType.BATHROOM;
  if (name.includes('кух') || name.includes('Кух')) return RoomType.KITCHEN;
  if (name.includes('кур') || name.includes('Кур')) return RoomType.SMOKING;
  if (name.includes('НИИ') || name.includes('кабин') || name.includes('Кабин')) return RoomType.OFFICE;
  return RoomType.COMMON;
}
