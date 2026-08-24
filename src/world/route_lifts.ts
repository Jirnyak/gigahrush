/* ── Маршрутные лифты: постановка по шахтам ребра ──────────────────
 *
 * Живёт в `world/`, потому что зовут отсюда ДВОЕ и с разных сторон: генерация
 * этажа и рантайм (смена этажа, открытие ворот маршрута). Пока постановка жила
 * в `gen/`, рантайм не мог её позвать — слой систем не импортирует генерацию, —
 * и держал собственную нормализацию с переносом якорей от этажа отправления.
 * Два источника истины о том, где стоят лифты, расходились молча.
 */

import { Cell, Feature, LiftDirection, Tex, W } from '../core/types';
import type { World } from '../core/world';
import { ROUTE_LIFT_GRID_STEP, routeLiftShaftsDown, routeLiftShaftsUp } from '../data/route_lift_shafts';

const SHAFT_LANDING_SEARCH_RADIUS = Math.floor(ROUTE_LIFT_GRID_STEP / 2);
const SHAFT_APPROACH_SEARCH_RADIUS = 40;

/**
 * Маршрутные лифты этажа по единой системе шахт.
 *
 * Этаж не решает, где стоят его лифты: это ЕДИНСТВЕННАЯ механика, которой
 * связаны соседние этажи, и потому она живёт вне модулей. Позиции берутся из
 * `data/route_lift_shafts` по ключу РЕБРА, и оба этажа перегона спрашивают одну
 * функцию с одним ключом — зеркальность выходит из арифметики, а не из
 * договорённости между генераторами.
 *
 * Шаг начинается со сноса ВСЕХ прежних маршрутных лифтов, включая авторские.
 * Кабины фаст-тревела не трогаются: это другая система (везёт на любой открытый
 * этаж, а не на соседний), и метит она себя `Feature.MACHINE`.
 *
 * Замерено до системы: 12 дизайн-этажей из 51 несли разное число лифтов вверх и
 * вниз, от 0/1 (с Базы Ликвидаторов нельзя было подняться) до 1/16.
 */
/* Посадка ищется в пределах своей ячейки сетки: дальше уходить нельзя, иначе
 * обещание «одна шахта на ячейку» перестаёт что-либо значить. */

export function stampRouteLiftShafts(
  world: World,
  runSeed: number,
  z: number,
  floorTex: Tex = Tex.F_CONCRETE,
): void {
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] !== Cell.LIFT) continue;
    if (world.features[i] === Feature.MACHINE) continue; // кабина фаст-тревела — чужая система
    demoteLiftCell(world, i, floorTex);
    world.aptMask[i] = 0; // защита принадлежала лифту, а не комнате: снимаем вместе с ним
  }

  // Занятые клетки помнятся на весь проход: сдвинутая шахта не имеет права сесть
  // на другую — иначе направление молча теряет лифт (замерено на underhell: 15
  // вместо 16, две шахты вниз сошлись в одну клетку после сдвига).
  const taken = new Set<number>();
  stampShaftSide(world, routeLiftShaftsUp(runSeed, z), LiftDirection.UP, floorTex, taken);
  stampShaftSide(world, routeLiftShaftsDown(runSeed, z), LiftDirection.DOWN, floorTex, taken);
}

function stampShaftSide(
  world: World, shafts: readonly number[], direction: LiftDirection, floorTex: Tex, taken: Set<number>,
): void {
  for (const shaft of shafts) {
    const idx = shaftLandingCell(world, shaft, taken);
    if (idx < 0) continue;
    taken.add(idx);
    setLiftCell(world, idx, direction);
    // Лифт важен системно, поэтому переживает самосбор наравне с гермокомнатой.
    world.aptMask[idx] = 1;
    carveShaftApproach(world, idx, floorTex);
  }
}

/* Защищённую клетку шахта не занимает: `aptMask === 1` носят кабины обеих систем,
 * гермостены, гермодвери и комнаты-убежища за ними. Их вертикаль не двигает —
 * шахта сходит на ближайшую незащищённую клетку. Зеркальность на таком этаже
 * рвётся локально, и это принятая цена: иначе шахта вскрывала бы убежище. */

function shaftTouchesWalkable(world: World, idx: number): boolean {
  const x = idx % W;
  const y = (idx / W) | 0;
  for (let i = 0; i < 4; i++) {
    const nx = world.wrap(x + (i === 0 ? 1 : i === 1 ? -1 : 0));
    const ny = world.wrap(y + (i === 2 ? 1 : i === 3 ? -1 : 0));
    const cell = world.cells[world.idx(nx, ny)];
    if (cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.WATER) return true;
  }
  return false;
}

/* Горловина коридора — проходимая клетка, у которой ровно два проходимых соседа,
 * и они напротив друг друга. Клетка лифта НЕПРОХОДИМА (`world.solid` зовёт её
 * стеной, в которую взаимодействуют), поэтому шахта в такой клетке разрезает
 * проход и запечатывает всё, что было за ним: замерено на министерстве — три
 * комнаты-цели квестов оказались замурованы вместо допустимых двух. */
function shaftSealsCorridor(world: World, idx: number): boolean {
  const x = idx % W;
  const y = (idx / W) | 0;
  const cell = world.cells[idx];
  if (cell !== Cell.FLOOR && cell !== Cell.WATER) return false;
  const walkable = (nx: number, ny: number) => {
    const c = world.cells[world.idx(nx, ny)];
    return c === Cell.FLOOR || c === Cell.DOOR || c === Cell.WATER;
  };
  const left = walkable(x - 1, y), right = walkable(x + 1, y);
  const up = walkable(x, y - 1), down = walkable(x, y + 1);
  const count = (left ? 1 : 0) + (right ? 1 : 0) + (up ? 1 : 0) + (down ? 1 : 0);
  if (count !== 2) return false;
  return (left && right) || (up && down);
}

function shaftLandingCell(world: World, shaft: number, taken: Set<number>): number {
  /* Дверной проём шахта не занимает: лифт непроходим, и связь через этот проём
   * исчезла бы вместе с дверью. Замерено на «Гармоническом банном» — этаж
   * терял 14 дверей из 680, а с ними и куски связности. */
  const free = (idx: number) => world.aptMask[idx] !== 1 && !taken.has(idx)
    && world.cells[idx] !== Cell.DOOR && !world.doors.has(idx);
  if (free(shaft) && shaftTouchesWalkable(world, shaft) && !shaftSealsCorridor(world, shaft)) return shaft;
  const sx = shaft % W;
  const sy = (shaft / W) | 0;
  /* Первый проход ищет клетку, У КОТОРОЙ УЖЕ ЕСТЬ проходимый сосед. Иначе шахта
   * садится в глухой бетон, подход к ней прорубить не от чего, и на этаже
   * остаётся карман в пару клеток: замерено — по десятку-другому клеток на
   * шести этажах, и тесты достижимости краснели именно на них. Рыть к такой
   * шахте коридор в сто клеток хуже, чем сдвинуть её внутри своей же ячейки. */
  for (let r = 1; r <= SHAFT_LANDING_SEARCH_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const idx = world.idx(sx + dx, sy + dy);
        if (free(idx) && shaftTouchesWalkable(world, idx) && !shaftSealsCorridor(world, idx)) return idx;
      }
    }
  }
  // Проходимого объёма в ячейке нет вовсе — берём любую незанятую клетку и
  // прорубаем подход, как раньше.
  for (let r = 1; r <= SHAFT_LANDING_SEARCH_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const idx = world.idx(sx + dx, sy + dy);
        if (free(idx)) return idx;
      }
    }
  }
  /* Незанятой незащищённой клетки не нашлось во всей ячейке. Закон «на этаже
   * одинаковое число лифтов вверх и вниз» важнее сохранности убежища: потеря
   * направления отрезает этаж от соседнего, а вскрытая гермокомната — нет.
   * Замерено на underhell: без этого этаж отдавал 15 лифтов вниз из 16.
   * Дверной проём и здесь неприкосновенен: лифт непроходим, и связь через
   * съеденную дверь исчезла бы вместе с ней. */
  const usable = (idx: number) => !taken.has(idx) && world.cells[idx] !== Cell.DOOR && !world.doors.has(idx);
  if (usable(shaft)) return shaft;
  for (let r = 1; r <= SHAFT_LANDING_SEARCH_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const idx = world.idx(sx + dx, sy + dy);
        if (usable(idx)) return idx;
      }
    }
  }
  return -1;
}

/* Шахта пробивает бетон: подход прорубается к ближайшему проходимому объёму,
 * иначе лифт остаётся замурованным в стене и этаж теряет направление. */
function carveShaftApproach(world: World, idx: number, floorTex: Tex): void {
  const x = idx % W;
  const y = (idx / W) | 0;
  for (let i = 0; i < 4; i++) {
    const nx = world.wrap(x + (i === 0 ? 1 : i === 1 ? -1 : 0));
    const ny = world.wrap(y + (i === 2 ? 1 : i === 3 ? -1 : 0));
    const cell = world.cells[world.idx(nx, ny)];
    if (cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.WATER) return;
  }
  let bestX = -1, bestY = -1, bestD2 = Infinity;
  for (let r = 1; r <= SHAFT_APPROACH_SEARCH_RADIUS && bestX < 0; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = world.wrap(x + dx), ny = world.wrap(y + dy);
        const cell = world.cells[world.idx(nx, ny)];
        if (cell !== Cell.FLOOR && cell !== Cell.DOOR && cell !== Cell.WATER) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; bestX = nx; bestY = ny; }
      }
    }
  }
  if (bestX < 0) {
    carveShaftFloorCell(world, world.wrap(x + 1), y, floorTex);
    carveShaftFloorCell(world, world.wrap(x - 1), y, floorTex);
    return;
  }
  let cx = x, cy = y;
  const stepX = Math.sign(world.delta(cx, bestX));
  let guard = 0;
  while (cx !== bestX && guard++ < W) {
    cx = world.wrap(cx + stepX);
    if (cx === bestX && cy === bestY) break;
    carveShaftFloorCell(world, cx, cy, floorTex);
  }
  const stepY = Math.sign(world.delta(cy, bestY));
  guard = 0;
  while (cy !== bestY && guard++ < W) {
    cy = world.wrap(cy + stepY);
    if (cx === bestX && cy === bestY) break;
    carveShaftFloorCell(world, cx, cy, floorTex);
  }
}

function carveShaftFloorCell(world: World, x: number, y: number, floorTex: Tex): void {
  const idx = world.idx(x, y);
  if (world.aptMask[idx] === 1) return; // подход не вскрывает убежище и не режет кабину
  const cell = world.cells[idx];
  if (cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.WATER || cell === Cell.LIFT) return;
  world.cells[idx] = Cell.FLOOR;
  world.roomMap[idx] = -1;
  world.floorTex[idx] = floorTex;
  world.wallTex[idx] = Tex.CONCRETE;
  world.features[idx] = Feature.NONE;
}



function setLiftCell(world: World, idx: number, direction: LiftDirection): void {
  if (world.cells[idx] === Cell.DOOR) world.removeDoorAt(idx);
  world.cells[idx] = Cell.LIFT;
  world.roomMap[idx] = -1;
  world.wallTex[idx] = Tex.LIFT_DOOR;
  world.features[idx] = Feature.NONE;
  world.liftDir[idx] = direction;
}

function demoteLiftCell(world: World, idx: number, floorTex: Tex): void {
  world.cells[idx] = Cell.FLOOR;
  world.roomMap[idx] = -1;
  world.floorTex[idx] = floorTex;
  world.wallTex[idx] = Tex.CONCRETE;
  world.features[idx] = Feature.NONE;
}
