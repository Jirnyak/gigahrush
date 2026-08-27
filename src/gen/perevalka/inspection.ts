/* ── Перевалка, слой 3: инфраструктура досмотра ───────────────────
 *
 * ИДЕЯ. Роль яруса в маршруте записана словами «досмотр, серый обход, перевалка
 * грузов» — и до этого слоя из трёх слов было построено одно. Груз через
 * Перевалку шёл, но нигде не взвешивался, не пломбировался, не изымался и не
 * сжигался; контрабанда Томилова была репликой, а не местом. Слой строит нитку
 * досмотра целиком: весовая линия, пломбировочные, карантинный ряд,
 * мусоросжигатель с приёмным жёлобом — и серый обход мимо всего этого.
 *
 * ПОЧЕМУ ОБХОД НЕ ПЕРЕКРЫТЬ. Мир — тор, решётка авеню кольцевая, а пси-дефазинг
 * проводит сквозь стены: «непроходимого мимо весов» на этом ярусе не бывает в
 * принципе, и строить его нельзя — это ломает общую систему ради одного этажа
 * (`AGENTS.md`, «системы выше головоломки»). Настоящая цена берётся другим:
 *
 *   нитка досмотра — шесть клеток шириной, освещена, вся в территории
 *   ликвидаторов, и на ней стоят весовщики: пройти можно, незамеченным нет;
 *   серый обход    — две клетки, ни одной лампы, ни одного укрытия, вдвое
 *   длиннее и идёт вплотную за стенкой карантинных боксов.
 *
 * Обход стоит времени, темноты и соседства с тем, что заперли в карантин, —
 * а не ключа. Бесплатным и случайным он при этом не бывает: мимо нитки досмотра
 * он не проложен, он проложен ЗА ней, и войти в него можно только с авеню.
 *
 * СТАДИЯ. Вместе с остальными слоями застройки: после дворов баз, ДО
 * `generateZones` и `ensureConnectivity`. Обе нитки выходят на авеню сами.
 */

import { Cell, DoorState, Feature, RoomType, Tex, type Room } from '../../core/types';
import { World } from '../../core/world';
import { stampRoom } from '../shared';
import { applyNamedRoom, type NamedRoomDef } from '../named_rooms';
import { perevalkaBlock } from './yard';

/** Кварталы нитки: два подряд, между ними авеню — она и есть грузовая дорога. */
const WEST_BLOCK = { bx: 3, by: 1 } as const;
const EAST_BLOCK = { bx: 4, by: 1 } as const;

/** Ширина нитки досмотра и ширина серого обхода. Разница — это и есть цена. */
const LINE_W = 6;
const GREY_W = 2;
/** Отступ нитки от северной кромки квартала: над ней ложится серый обход. */
const LINE_OFFSET = 44;
const GREY_HIGH = 8;
const GREY_LOW = 26;
const GREY_LEG = 38;

const WEIGH_W = 20;
const WEIGH_H = 15;
const SEAL_W = 16;
const SEAL_H = 13;
const QUARANTINE_W = 15;
const QUARANTINE_H = 11;
/** Шаг карантинного ряда: бокс плюс общий простенок. */
const QUARANTINE_PITCH = QUARANTINE_H + 2;
const INCINERATOR_W = 42;
const INCINERATOR_H = 24;
const CHUTE_W = 16;
/** Печь объявляет свой потолок: 5 → 3.5 м, чтобы труба читалась залом. */
const INCINERATOR_TIER = 5;

const WEIGHBRIDGE: NamedRoomDef = { type: RoomType.OFFICE, name: 'Весовая', tags: ['perevalka', 'inspection', 'weighing'] };
const SEAL_ROOM: NamedRoomDef = { type: RoomType.OFFICE, name: 'Пломбировочная', tags: ['perevalka', 'inspection', 'seal'] };
const QUARANTINE: NamedRoomDef = { type: RoomType.MEDICAL, name: 'Карантинный бокс', tags: ['perevalka', 'inspection', 'quarantine'] };
const INCINERATOR: NamedRoomDef = { type: RoomType.PRODUCTION, name: 'Мусоросжигатель яруса', tags: ['perevalka', 'inspection', 'incinerator'] };
const CHUTE: NamedRoomDef = { type: RoomType.STORAGE, name: 'Приёмный жёлоб изъятого', tags: ['perevalka', 'inspection', 'confiscated'] };

/**
 * Геометрия нитки и обхода в абсолютных клетках яруса. Отдельной функцией,
 * потому что её спрашивает не только генератор: замок слоя проверяет, что обход
 * НЕ касается нитки, и цифры для этого обязаны быть одни и те же.
 */
export function perevalkaInspectionLayout(): {
  lineY: number; lineFrom: number; lineTo: number; lineWidth: number;
  greyHighY: number; greyLowY: number; greyWidth: number;
} {
  const west = perevalkaBlock(WEST_BLOCK.bx, WEST_BLOCK.by);
  const east = perevalkaBlock(EAST_BLOCK.bx, EAST_BLOCK.by);
  return {
    lineY: west.y + LINE_OFFSET,
    lineFrom: west.x,
    lineTo: east.x + east.w - 1,
    lineWidth: LINE_W,
    greyHighY: west.y + GREY_HIGH,
    greyLowY: west.y + GREY_LOW,
    greyWidth: GREY_W,
  };
}

export interface PerevalkaInspectionLine {
  /** Ряд, по которому идёт грузовая нитка: от него считают всё остальное. */
  lineY: number;
  weighbridges: Room[];
  sealRooms: Room[];
  quarantine: Room[];
  incinerator: Room;
  chute: Room;
  /** Длина серого обхода в клетках: замер его цены. */
  greyLength: number;
}

function carve(world: World, x: number, y: number, floorTex: Tex): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.LIFT || world.cells[i] === Cell.DOOR) return;
  world.cells[i] = Cell.FLOOR;
  world.roomMap[i] = -1;
  world.floorTex[i] = floorTex;
  world.features[i] = Feature.NONE;
}

function carveBand(world: World, x: number, y: number, w: number, h: number, floorTex: Tex): number {
  let cells = 0;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) { carve(world, x + dx, y + dy, floorTex); cells++; }
  }
  return cells;
}

function stampInspectionRoom(
  world: World, def: NamedRoomDef, alias: string, name: string,
  x: number, y: number, w: number, h: number, wallTex: Tex, floorTex: Tex, tier?: number,
): Room {
  const room = stampRoom(world, world.rooms.length, def.type, x, y, w, h, -1);
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  if (tier !== undefined) room.ceilingTier = tier;
  applyNamedRoom(room, alias, def);
  room.name = name;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.WALL) world.wallTex[i] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) world.floorTex[world.idx(room.x + dx, room.y + dy)] = floorTex;
  }
  return room;
}

function hangDoor(world: World, room: Room, x: number, y: number, state = DoorState.CLOSED): void {
  const i = world.idx(x, y);
  world.cells[i] = Cell.DOOR;
  world.wallTex[i] = state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED
    ? Tex.HERMO_WALL : Tex.DOOR_METAL;
  world.features[i] = Feature.NONE;
  world.roomMap[i] = -1;
  world.doors.set(i, { idx: i, state, roomA: room.id, roomB: -1, keyId: '', timer: 0 });
  room.doors.push(i);
}

/** Ворота цеха: полоса стены в пол, за комнатой. Фура в дверь не заезжает. */
function openGate(world: World, room: Room, x: number, y: number, len: number, horizontal: boolean): void {
  for (let n = 0; n < len; n++) {
    const i = world.idx(horizontal ? x + n : x, horizontal ? y : y + n);
    world.cells[i] = Cell.FLOOR;
    world.roomMap[i] = room.id;
    world.floorTex[i] = room.floorTex;
    world.features[i] = Feature.NONE;
  }
}

/**
 * Серый обход: ломаная в две клетки за спиной у досмотра. Идёт от западной
 * авеню до восточной, ни разу не касаясь нитки, и ни одной лампы на нём нет.
 */
function carveGreyBypass(world: World, west: { x: number }, east: { x: number; w: number }, top: number): number {
  let cells = 0;
  let x = west.x;
  const endX = east.x + east.w - 1;
  let high = true;
  while (x < endX) {
    const run = Math.min(GREY_LEG, endX - x + 1);
    const y = top + (high ? GREY_HIGH : GREY_LOW);
    cells += carveBand(world, x, y, run, GREY_W, Tex.F_CONCRETE);
    // Колено: вертикальная перемычка между высокой и низкой полкой.
    if (x + run <= endX) {
      cells += carveBand(world, x + run - GREY_W, top + GREY_HIGH, GREY_W, GREY_LOW - GREY_HIGH + GREY_W, Tex.F_CONCRETE);
    }
    x += run;
    high = !high;
  }
  return cells;
}

/** Точка входа слоя. */
export function buildPerevalkaInspection(world: World): PerevalkaInspectionLine {
  const west = perevalkaBlock(WEST_BLOCK.bx, WEST_BLOCK.by);
  const east = perevalkaBlock(EAST_BLOCK.bx, EAST_BLOCK.by);
  const { lineY, lineFrom, lineTo } = perevalkaInspectionLayout();

  // Грузовая нитка: одна прямая на два квартала, оба конца выходят на авеню,
  // и авеню между кварталами она пересекает по уже вырытому.
  carveBand(world, lineFrom, lineY, lineTo - lineFrom + 1, LINE_W, Tex.F_CONCRETE);
  for (let x = lineFrom + 6; x < lineTo; x += 14) {
    world.features[world.idx(x, lineY + 1)] = Feature.LAMP;
  }

  // Весовые — южная сторона нитки. Плита весов лежит НА нитке перед дверью:
  // мимо неё груз не проедет, а объехать её — уже другой маршрут.
  const weighbridges: Room[] = [];
  for (let i = 0; i < 3; i++) {
    const x = west.x + 8 + i * (WEIGH_W + 8);
    const room = stampInspectionRoom(world, WEIGHBRIDGE, `perevalka_weighbridge_${i + 1}`, `Весовая ${i + 1}`,
      x, lineY + LINE_W + 1, WEIGH_W, WEIGH_H, Tex.PANEL, Tex.F_LINO);
    hangDoor(world, room, room.x + (WEIGH_W >> 1), room.y - 1);
    world.features[world.idx(room.x + (WEIGH_W >> 1), lineY + LINE_W - 1)] = Feature.MACHINE;
    world.features[world.idx(room.x + 3, room.y + 3)] = Feature.DESK;
    world.features[world.idx(room.x + 6, room.y + 3)] = Feature.SCREEN;
    weighbridges.push(room);
  }

  // Пломбировочные — северная сторона. Сюда груз заходит целым и выходит
  // опечатанным; тот же коридор ведёт дальше на карантин.
  const sealRooms: Room[] = [];
  for (let i = 0; i < 2; i++) {
    const x = west.x + 20 + i * (SEAL_W + 14);
    const room = stampInspectionRoom(world, SEAL_ROOM, `perevalka_seal_${i + 1}`, `Пломбировочная ${i + 1}`,
      x, lineY - SEAL_H - 1, SEAL_W, SEAL_H, Tex.PANEL, Tex.F_TILE);
    hangDoor(world, room, room.x + (SEAL_W >> 1), room.y + SEAL_H);
    world.features[world.idx(room.x + 3, room.y + 3)] = Feature.DESK;
    world.features[world.idx(room.x + 3, room.y + 6)] = Feature.SHELF;
    sealRooms.push(room);
  }

  // Карантинный ряд: своя нитка на юг от грузовой, боксы тупиковые и гермет.
  const branchX = east.x + 24;
  const branchTop = lineY + LINE_W;
  const branchLen = 42;
  carveBand(world, branchX, branchTop, LINE_W - 2, branchLen, Tex.F_CONCRETE);
  const quarantine: Room[] = [];
  for (let i = 0; i < 6; i++) {
    const left = i % 2 === 0;
    const y = branchTop + 5 + (i >> 1) * QUARANTINE_PITCH;
    const x = left ? branchX - QUARANTINE_W - 1 : branchX + LINE_W - 2 + 1;
    const room = stampInspectionRoom(world, QUARANTINE, `perevalka_quarantine_${i + 1}`, `Карантинный бокс ${i + 1}`,
      x, y, QUARANTINE_W, QUARANTINE_H, Tex.HERMO_WALL, Tex.F_TILE);
    room.sealed = true;
    hangDoor(world, room, left ? room.x + QUARANTINE_W : room.x - 1, room.y + (QUARANTINE_H >> 1), DoorState.HERMETIC_OPEN);
    world.features[world.idx(room.x + 2, room.y + 2)] = Feature.APPARATUS;
    quarantine.push(room);
  }

  /* Печь и жёлоб: конец нитки. Изъятое приезжает сюда и не уезжает никуда.
   * Оба стоят между карантинным рядом и южной служебной дорогой квартала:
   * север — ворота с карантина, юг — ворота на дорогу. Дорога прорублена во всю
   * ширину квартала и потому выходит на обе продольные авеню сама. */
  // Стена печи ложится ровно на первый ряд после карантинной нитки: ворота в
  // ней смотрят на её последнюю клетку, а не на глухой простенок.
  const furnaceY = branchTop + branchLen + 1;
  const roadY = furnaceY + INCINERATOR_H + 1;
  carveBand(world, east.x, roadY, east.w, east.y + east.h - roadY, Tex.F_CONCRETE);

  const incinerator = stampInspectionRoom(world, INCINERATOR, 'perevalka_incinerator', 'Мусоросжигатель яруса',
    east.x + 8, furnaceY, INCINERATOR_W, INCINERATOR_H, Tex.METAL, Tex.F_CONCRETE, INCINERATOR_TIER);
  openGate(world, incinerator, branchX, incinerator.y - 1, LINE_W - 2, true);
  openGate(world, incinerator, incinerator.x + 18, incinerator.y + INCINERATOR_H, 4, true);
  for (let dx = 5; dx < INCINERATOR_W - 4; dx += 8) {
    world.features[world.idx(incinerator.x + dx, incinerator.y + 6)] = Feature.MACHINE;
    world.features[world.idx(incinerator.x + dx, incinerator.y + INCINERATOR_H - 6)] = Feature.MACHINE;
  }
  const chute = stampInspectionRoom(world, CHUTE, 'perevalka_chute', 'Приёмный жёлоб изъятого',
    incinerator.x + INCINERATOR_W + 4, furnaceY, CHUTE_W, INCINERATOR_H, Tex.METAL, Tex.F_CONCRETE);
  hangDoor(world, chute, chute.x + (CHUTE_W >> 1), chute.y + INCINERATOR_H);
  world.features[world.idx(chute.x + 2, chute.y + 2)] = Feature.SHELF;
  world.features[world.idx(chute.x + 5, chute.y + 5)] = Feature.SHELF;

  const greyLength = carveGreyBypass(world, west, east, west.y);

  return { lineY, weighbridges, sealRooms, quarantine, incinerator, chute, greyLength };
}
