/* ── База Ликвидаторов: свет гарнизона ────────────────────────────
 *
 * Этаж выходил из генератора с 34 источниками на 407 265 проходимых клеток —
 * одна лампа на двенадцать тысяч, то есть темнота везде, кроме разводной линейки
 * и стены памяти. Арена, казарма, оружейная, лазарет, плац, штаб, весь квартал
 * снабжения не имели ни одного источника вовсе.
 *
 * Свет здесь читается как граница, а не как заливка. Внутри стены форт: гарнизон
 * держит свет, потому что ночью тут строятся, чинят и ходят караулом. Снаружи
 * земля диких: там жгут костры, и между кострами по-настоящему темно. Игрок
 * видит, где кончилась чужая власть, не открывая карты.
 *
 * Проход детерминированный, без жребия: сетка ламп внутри форта и редкая сетка
 * свечей в диких землях. Лампа не путевая преграда, поэтому сетка ничего не
 * запирает. Занятые клетки не трогаются, так что авторский свет кварталов и
 * прожектора арены остаются как объявлены.
 *
 * Замерено: форт 90.3% освещённых клеток, дикие земли 18.8%, этаж целиком 56.8%
 * против 0.6% до прохода.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { FORT_SIDE, FORT_X0, FORT_Y0 } from './fort';

/** Шаг гарнизонной сетки. Лампа несёт радиус 8, и шаг чуть шире диаметра пятна
 *  оставляет тень по углам сетки: форт освещён, но не залит. Шаг 8 давал 97% —
 *  контору, а не гарнизон. */
const FORT_STEP = 11;
const FORT_HALF = Math.floor(FORT_STEP / 2);

/** Шаг костров в диких землях: вдвое реже света форта — свет там событие. */
const WILD_STEP = 20;
const WILD_HALF = Math.floor(WILD_STEP / 2);

function insideFort(x: number, y: number): boolean {
  return x >= FORT_X0 && x < FORT_X0 + FORT_SIDE && y >= FORT_Y0 && y < FORT_Y0 + FORT_SIDE;
}

/** Ставит источник, если клетка свободна. Занятую не трогает: авторский свет и
 *  мебель кварталов старше общего прохода. */
function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки вокруг цели: без него лампа комнаты пропадает
 *  всякий раз, когда в середину встал стол. */
function placeNear(world: World, x: number, y: number, feature: Feature, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (placeSource(world, x + dx, y + dy, feature)) return true;
      }
    }
  }
  return false;
}

/** Арена светит по-своему (`lightArena` в `fort.ts`): кольцо прожекторов над
 *  песком и полутьма на дальних рядах. Сетка форта её не переписывает. */
function isArena(room: Room | undefined): boolean {
  return room?.tags?.includes('arena') === true;
}

export function lightLiquidatorBase(world: World): void {
  const arenaIds = new Set<number>();
  for (const room of world.rooms) if (isArena(room)) arenaIds.add(room.id);

  // Комнаты форта: лампа в середине, а крупные — ещё и по своей сетке, иначе
  // казарма и штаб светятся одной точкой в центре и тонут по краям.
  for (const room of world.rooms) {
    if (!room || arenaIds.has(room.id)) continue;
    if (!insideFort(room.x + room.w / 2, room.y + room.h / 2)) continue;
    placeNear(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), Feature.LAMP, 2);
    for (let y = room.y + FORT_HALF; y < room.y + room.h; y += FORT_STEP) {
      for (let x = room.x + FORT_HALF; x < room.x + room.w; x += FORT_STEP) {
        placeNear(world, x, y, Feature.LAMP, 1);
      }
    }
  }

  // Открытая земля форта: улицы, плац, променад по стене, дворы кварталов.
  for (let y = FORT_Y0 + FORT_HALF; y < FORT_Y0 + FORT_SIDE; y += FORT_STEP) {
    for (let x = FORT_X0 + FORT_HALF; x < FORT_X0 + FORT_SIDE; x += FORT_STEP) {
      // Клетки комнат уже прошли своей сеткой выше; здесь только земля между ними.
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      placeNear(world, x, y, Feature.LAMP, 2);
    }
  }

  // Дикие земли: костры между развалин. Свеча, а не лампа — у диких нет линии.
  for (let y = WILD_HALF; y < W; y += WILD_STEP) {
    for (let x = WILD_HALF; x < W; x += WILD_STEP) {
      if (insideFort(x, y)) continue;
      placeNear(world, x, y, Feature.CANDLE, 3);
    }
  }
}
