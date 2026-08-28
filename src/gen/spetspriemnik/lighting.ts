/* ── Спецприёмник: свет караула ────────────────────────────────────
 *
 * Этаж выходил из генератора с 249 источниками на 283 757 проходимых клеток —
 * 11.5% освещённых. Для места, где всё решают ключ, решётка и журнал обхода,
 * это неправда: в спецприёмнике свет — инструмент надзора, и гасят его в
 * последнюю очередь.
 *
 * Караульная петля, приёмная, штаб, двор переклички и лифтовые тамбуры держат
 * частую сетку: там ходят с фонарём в кобуре, а не в руке. Камеры задержанных
 * освещены той же лампой, но реже — потолочный свет за решёткой ставят по
 * одному на угол, потому что задержанному светят, а не освещают. Разница между
 * коридором и камерой читается шагом света, и игрок чувствует её раньше, чем
 * увидит решётку.
 *
 * Склад передач — единственное тёмное место режима. Он заперт на бирку ключа,
 * линию туда не тянут, и приходят со свечой. Кто попал внутрь — попал не по
 * ведомости, и темнота это подтверждает.
 *
 * Проход детерминированный, лампа не путевая преграда, занятые клетки не
 * переписываются: нары, решётки, панели и авторские лампы остаются как
 * объявлены.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';

/** Караульная сетка: лампа гаснет к 7.6 клетки, угол сетки шагом 9 отстоит на
 *  6.36 — свет перекрывается, теней на маршруте обхода не остаётся. */
const GUARD_STEP = 9;
const GUARD_HALF = GUARD_STEP >> 1;

/** Камера: тот же светильник, но по одному на угол. Угол сетки шагом 13
 *  отстоит на 9.19, дальше досягаемости лампы — по краям камеры темнеет. */
const CELL_STEP = 13;
const CELL_HALF = CELL_STEP >> 1;

/** Склад передач: свечи и редко. Линии там нет. */
const DARK_STEP = 12;
const DARK_HALF = DARK_STEP >> 1;

function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки: середина камеры занята нарами почти
 *  всегда, и без обхода светильник в неё не встаёт. */
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

function gridRoom(world: World, room: Room, step: number, half: number, feature: Feature): void {
  for (let y = room.y + half; y < room.y + room.h; y += step) {
    for (let x = room.x + half; x < room.x + room.w; x += step) {
      placeNear(world, x, y, feature, 1);
    }
  }
}

/**
 * @param cellRooms камеры задержанных — редкий потолочный свет за решёткой
 * @param darkRooms помещения без линии (склад передач) — свечи
 */
export function lightSpetspriemnik(
  world: World,
  cellRooms: readonly Room[],
  darkRooms: readonly Room[],
): void {
  const cells = new Set<number>();
  for (const room of cellRooms) cells.add(room.id);
  const dark = new Set<number>();
  for (const room of darkRooms) dark.add(room.id);

  for (const room of world.rooms) {
    if (!room) continue;

    if (dark.has(room.id)) {
      gridRoom(world, room, DARK_STEP, DARK_HALF, Feature.CANDLE);
      continue;
    }

    if (cells.has(room.id)) {
      gridRoom(world, room, CELL_STEP, CELL_HALF, Feature.LAMP);
      continue;
    }

    placeNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.LAMP, 2);
    gridRoom(world, room, GUARD_STEP, GUARD_HALF, Feature.LAMP);
  }

  // Открытая земля: караульная петля, прорубленные расширением связки и дворы
  // между блоками. Свет сквозь стену не идёт, поэтому у петли своя линия.
  for (let y = GUARD_HALF; y < W; y += GUARD_STEP) {
    for (let x = GUARD_HALF; x < W; x += GUARD_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      placeNear(world, x, y, Feature.LAMP, 2);
    }
  }
}
