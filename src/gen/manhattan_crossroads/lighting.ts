/* ── Перекрёстки: уличный свет ────────────────────────────────────
 *
 * Этаж выходил из генератора с 566 источниками на 328 894 проходимых клетки:
 * одна лампа на пятьсот восемьдесят. Авеню, кросс, зебры, съезд «Неправильный
 * поворот» — всё это игрок читал по звуку и по памяти, а не глазами.
 *
 * Здесь нельзя вешать потолочную сетку: авеню и улицы — открытые каньоны с
 * уличным ярусом потолка, и «комната» тут одна на весь квартал. Свет должен
 * идти по проезжей части, как ему и положено в городе: цепочки фонарей по
 * ОБОИМ бордюрам каждой магистрали. Тогда игрок видит развилку раньше, чем
 * доходит до неё, а перекрёсток светится вдвойне — там сходятся четыре цепочки.
 *
 * Кварталы между магистралями — здания, и они держат свой внутренний свет:
 * лампа посреди помещения и разводка по крупным. Три логические комнаты
 * района (асфальт, бордюры, разметка) сетку не получают: они накрывают весь
 * район целиком, и разводка по ним залила бы город ровным светом без улиц.
 *
 * Проход детерминированный: шаг по оси, без жребия. Лампа — потолочный плафон,
 * не путевая преграда, поэтому цепочка ничего не запирает, а занятую клетку
 * проход не переписывает — авторские светофоры и витрины остаются как стоят.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { AVENUE_WIDTH, STREET_WIDTH, SHELL_AVENUE_CENTERS, SHELL_STREET_CENTERS, DISTRICT_MAX, DISTRICT_MIN } from './meta';

/** Шаг фонарей вдоль магистрали. Радиус лампы 8, и шаг чуть меньше диаметра
 *  пятна даёт непрерывную цепочку без провалов на длинной прямой. */
const POLE_PITCH = 9;

/** Шаг разводки внутри здания. Тот же принцип, что у магистрали, но помещения
 *  режут стены, и запас на них берётся шагом чуть теснее. */
const INDOOR_PITCH = 10;

/** Логическая комната района шире любого здания — по ней узнаётся асфальт,
 *  бордюры и разметка, накрывающие весь квартальный прямоугольник. */
const DISTRICT_SPAN = DISTRICT_MAX - DISTRICT_MIN;

function hangLamp(world: World, x: number, y: number): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = Feature.LAMP;
  return true;
}

/** Фонарь садится на первую свободную клетку вокруг цели. Без этого столб
 *  пропадает всякий раз, когда в бордюр упёрлась витрина или барьер. */
function hangLampNear(world: World, x: number, y: number, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (hangLamp(world, x + dx, y + dy)) return true;
      }
    }
  }
  return false;
}

/** Здание, а не логическая комната района. */
function isBuilding(room: Room | undefined): boolean {
  return !!room && room.w < DISTRICT_SPAN && room.h < DISTRICT_SPAN;
}

/** Цепочка фонарей по одному бордюру: `offset` — снос от осевой линии наружу,
 *  на тротуар, где столбу и место. */
function lineOfPoles(world: World, axis: 'vertical' | 'horizontal', center: number, offset: number): void {
  for (let t = 0; t < W; t += POLE_PITCH) {
    if (axis === 'vertical') hangLampNear(world, center + offset, t, 3);
    else hangLampNear(world, t, center + offset, 3);
  }
}

export function lightManhattanCrossroads(world: World): void {
  // Бордюр лежит сразу за проезжей частью: половина ширины дороги плюс шаг на
  // сам бордюрный камень. Числа взяты из ширины магистралей, а не выдуманы.
  const avenueCurb = (AVENUE_WIDTH >> 1) + 1;
  const streetCurb = (STREET_WIDTH >> 1) + 1;

  for (const center of SHELL_AVENUE_CENTERS) {
    lineOfPoles(world, 'vertical', center, -avenueCurb);
    lineOfPoles(world, 'vertical', center, avenueCurb);
  }
  for (const center of SHELL_STREET_CENTERS) {
    lineOfPoles(world, 'horizontal', center, -streetCurb);
    lineOfPoles(world, 'horizontal', center, streetCurb);
  }

  // Здания квартала: сначала лампа посреди помещения, потом разводка по крупным
  // залам — иначе гараж и жилой блок светятся одной точкой и тонут по углам.
  for (const room of world.rooms) {
    if (!isBuilding(room)) continue;
    hangLampNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 2);
    for (let y = room.y + (INDOOR_PITCH >> 1); y < room.y + room.h; y += INDOOR_PITCH) {
      for (let x = room.x + (INDOOR_PITCH >> 1); x < room.x + room.w; x += INDOOR_PITCH) {
        hangLampNear(world, x, y, 1);
      }
    }
  }
}
