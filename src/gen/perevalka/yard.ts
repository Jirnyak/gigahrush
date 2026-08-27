/* ── Перевалка: грузовой двор во всю ширину яруса ─────────────────
 *
 * Замерено до этого модуля: этаж занимал прямоугольник 424×176 в мире 1024×1024,
 * то есть 1.5% площади. Единая система шахт ставит лифты по сетке 4×4 на ВЕСЬ
 * мир, и пятнадцать из шестнадцати её клеток приходились на глухой бетон.
 * Шахта в бетоне уезжает искать проходимое до 128 клеток и садилась туда, где
 * хоть что-то есть, — на карман соседнего лифта. Итог: лифты вниз стояли в двух
 * клетках от лифтов вверх, а двенадцать из шестнадцати были вообще недостижимы
 * обычной ходьбой.
 *
 * Лечится не правкой системы лифтов (её трогать нельзя и не нужно), а тем, что
 * ярус наконец занимает свой ярус: решётка грузовых авеню шагом 128 клеток даёт
 * проходимый объём не дальше 64 клеток от любой клетки сетки шахт. Тогда шахта
 * садится у ближайшей авеню, а не у чужого лифта.
 */

import { Cell, DoorState, Feature, Tex, ZoneFaction, type Room } from '../../core/types';
import { World } from '../../core/world';
import { stampRoom } from '../shared';
import { applyNamedRoom } from '../named_rooms';
import { BASE_HQ_H, BASE_HQ_W, BASE_WORK_W, PEREVALKA_BASES, PEREVALKA_ROOMS, type PerevalkaBaseId } from './meta';

/** Шаг решётки грузовых авеню. Половина ячейки сетки шахт: дальше 64 клеток от
 *  авеню не окажется ни одна шахта, и её посадка остаётся в своём районе. */
export const AVENUE_STEP = 128;
export const AVENUE_WIDTH = 5;
const AVENUE_OFFSET = 96;

export function avenueCoords(): number[] {
  const out: number[] = [];
  for (let c = AVENUE_OFFSET; c < 1024; c += AVENUE_STEP) out.push(c);
  return out;
}

/** Сколько клеток от осевой линии авеню занято дорогой плюс её косяк. */
const BLOCK_INSET = (AVENUE_WIDTH >> 1) + 1;
/** Сторона глухого квартала между четырьмя авеню, включая обе кромки. */
export const BLOCK_SIDE = AVENUE_STEP - BLOCK_INSET * 2 + 1;

export interface PerevalkaBlock { x: number; y: number; w: number; h: number }

/**
 * Глухой квартал решётки: прямоугольник бетона между четырьмя авеню.
 *
 * Живёт здесь, потому что решётка объявлена здесь: слои застройки не вправе
 * помнить ни шаг 128, ни смещение 96 — иначе первая же правка решётки разъедет
 * все четыре слоя молча. Индексы `bx`/`by` — номера авеню, считая с запада и
 * с севера; квартал `(bx, by)` лежит ЮГО-ВОСТОЧНЕЕ перекрёстка этих двух.
 *
 * Верхний и левый ряды квартала касаются дороги напрямую: карман, вырытый от
 * `y`, оказывается открыт на авеню без единого прохода — так грузовой двор и
 * читается со стороны трассы.
 */
export function perevalkaBlock(bx: number, by: number): PerevalkaBlock {
  const av = avenueCoords();
  return {
    x: av[bx % av.length] + BLOCK_INSET,
    y: av[by % av.length] + BLOCK_INSET,
    w: BLOCK_SIDE,
    h: BLOCK_SIDE,
  };
}

function carveYardCell(world: World, x: number, y: number): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.LIFT) return;
  world.cells[i] = Cell.FLOOR;
  world.roomMap[i] = -1;
  world.floorTex[i] = Tex.F_CONCRETE;
  world.wallTex[i] = Tex.CONCRETE;
  world.features[i] = Feature.NONE;
}

/** Кольцевая авеню: мир — тор, поэтому линия идёт по всей стороне и замыкается. */
function carveAvenue(world: World, fixed: number, vertical: boolean): void {
  const half = AVENUE_WIDTH >> 1;
  for (let p = 0; p < 1024; p++) {
    for (let n = -half; n <= half; n++) {
      const c = world.wrap(fixed + n);
      carveYardCell(world, vertical ? c : p, vertical ? p : c);
    }
  }
}

/** Решётка грузовых авеню на весь ярус. Зовётся ПЕРВОЙ: комнаты этажа
 *  штампуются поверх и сами решают, где авеню прерывается стеной. */
export function carvePerevalkaFreightYard(world: World): number {
  for (const c of avenueCoords()) {
    carveAvenue(world, c, true);
    carveAvenue(world, c, false);
  }
  let cells = 0;
  for (let i = 0; i < world.cells.length; i++) if (world.cells[i] === Cell.FLOOR) cells++;
  // Фонари по перекрёсткам: грузовой ярус читается как двор, а не как катакомбы.
  for (const cx of avenueCoords()) {
    for (const cy of avenueCoords()) {
      const i = world.idx(cx, cy);
      if (world.cells[i] === Cell.FLOOR) world.features[i] = Feature.LAMP;
    }
  }
  return cells;
}

/** Ближайшая авеню к координате: по ней база выходит наружу. */
function nearestAvenue(world: World, c: number): number {
  let best = AVENUE_OFFSET;
  let bestD = 1 << 30;
  for (const a of avenueCoords()) {
    const d = Math.abs(world.delta(c, a));
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

function decorateBaseRoom(world: World, room: Room, feature: Feature): void {
  for (let dy = 3; dy < room.h - 3; dy += 6) {
    for (let dx = 3; dx < room.w - 3; dx += 7) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.FLOOR) world.features[i] = feature;
    }
  }
}

export function paintRoomTerritory(world: World, room: Room, owner: ZoneFaction): void {
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      world.factionControl[world.idx(room.x + dx, room.y + dy)] = owner;
    }
  }
}

export interface PerevalkaBaseRooms {
  id: PerevalkaBaseId;
  hq: Room;
  work: Room;
}

/**
 * Двор одной базы: штаб и рабочая комната через общую стену, вход с ближайшей
 * авеню. Вход НЕ заперт — базу надо уметь войти и поговорить; заперты только
 * лифтовые тамбуры, и это разные двери с разной ценой.
 */
function buildBaseCompound(world: World, spec: typeof PEREVALKA_BASES[number]): PerevalkaBaseRooms {
  const hq = stampRoom(world, world.rooms.length, PEREVALKA_ROOMS[spec.hqAlias].type, spec.x, spec.y, BASE_HQ_W, BASE_HQ_H, -1);
  hq.wallTex = spec.wallTex;
  hq.floorTex = spec.floorTex;
  applyNamedRoom(hq, spec.hqAlias, PEREVALKA_ROOMS[spec.hqAlias]);

  const workX = spec.x + BASE_HQ_W + 1;
  const work = stampRoom(world, world.rooms.length, PEREVALKA_ROOMS[spec.workAlias].type, workX, spec.y, BASE_WORK_W, BASE_HQ_H, -1);
  work.wallTex = spec.workWallTex;
  work.floorTex = spec.workFloorTex;
  applyNamedRoom(work, spec.workAlias, PEREVALKA_ROOMS[spec.workAlias]);

  for (const room of [hq, work]) {
    for (let dy = -1; dy <= room.h; dy++) {
      for (let dx = -1; dx <= room.w; dx++) {
        const i = world.idx(room.x + dx, room.y + dy);
        if (world.cells[i] === Cell.WALL) world.wallTex[i] = room.wallTex;
      }
    }
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) world.floorTex[world.idx(room.x + dx, room.y + dy)] = room.floorTex;
    }
  }

  // Общая стена штаба и рабочей комнаты: проём ровно один, проходимо с обеих
  // сторон, стены по вертикали — `sanitizeDoors` такую дверь не снимает.
  const shareX = world.wrap(spec.x + BASE_HQ_W);
  const shareY = world.wrap(spec.y + (BASE_HQ_H >> 1));
  const shareIdx = world.idx(shareX, shareY);
  world.cells[shareIdx] = Cell.DOOR;
  world.wallTex[shareIdx] = Tex.DOOR_METAL;
  world.doors.set(shareIdx, { idx: shareIdx, state: DoorState.CLOSED, roomA: hq.id, roomB: work.id, keyId: '', timer: 0 });
  hq.doors.push(shareIdx);
  work.doors.push(shareIdx);

  // Вход с авеню в штаб: западная стена, коридор до ближайшей вертикальной авеню.
  const gateX = world.wrap(spec.x - 1);
  const gateY = world.wrap(spec.y + (BASE_HQ_H >> 1) - 6);
  const gateIdx = world.idx(gateX, gateY);
  const avenueX = nearestAvenue(world, spec.x - 8);
  let cx = world.wrap(gateX - 1);
  const step = Math.sign(world.delta(cx, avenueX)) || -1;
  for (let guard = 0; guard < 1024; guard++) {
    carveYardCell(world, cx, gateY);
    if (cx === avenueX) break;
    cx = world.wrap(cx + step);
  }
  world.cells[gateIdx] = Cell.DOOR;
  world.wallTex[gateIdx] = Tex.DOOR_METAL;
  world.doors.set(gateIdx, { idx: gateIdx, state: DoorState.CLOSED, roomA: hq.id, roomB: -1, keyId: '', timer: 0 });
  hq.doors.push(gateIdx);

  paintRoomTerritory(world, hq, spec.owner);
  paintRoomTerritory(world, work, spec.owner);
  decorateBaseRoom(world, hq, Feature.DESK);
  decorateBaseRoom(world, work, spec.id === 'wild' ? Feature.TREE : spec.id === 'science' ? Feature.APPARATUS : Feature.SHELF);

  return { id: spec.id, hq, work };
}

export function buildPerevalkaBases(world: World): PerevalkaBaseRooms[] {
  return PEREVALKA_BASES.map(spec => buildBaseCompound(world, spec));
}
