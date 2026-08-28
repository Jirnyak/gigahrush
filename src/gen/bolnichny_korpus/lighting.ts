/* ── Больничный корпус: свет по режиму ─────────────────────────────
 *
 * Корпус выходил из генератора с 16 лампами и 22 свечами на 134 710
 * проходимых клеток — 2.8% освещённых. Больница, куда приходят за помощью,
 * была темнее подвала, а найти в такой палату по номеру нельзя.
 *
 * Свет тут показывает режим, а режим в больнице и есть сюжет. Чистая петля,
 * приёмная, операционная, кабинеты и коридоры держат ровную сетку: по этим
 * местам ходят с каталкой и в перчатках, и там светло всегда. Аптека, холодный
 * шкаф и северная чистая петля светятся плотнее прочих — за холодом и
 * препаратами смотрят непрерывно, и полутени там не допускают.
 *
 * Грязные палаты — лихорадочная, красная и чёрная — освещены свечами и редко.
 * Это не экономия генератора: за герметичной стеной свет гасят, чтобы больные
 * спали, а к чёрной палате уже никто не ходит с обходом. Игрок различает
 * чистую половину корпуса от грязной по одному признаку — ровный белый свет
 * против пятен от свечей, — и различает её раньше, чем прочтёт табличку.
 *
 * Проход детерминированный. Занятые клетки не переписываются, поэтому койки,
 * приборы и авторские лампы палат остаются как объявлены.
 *
 * Замечание о порядке: до этого прохода корпус красил освещённость аптеки,
 * холодного шкафа и северной петли прямо в `world.light` (0.34) ещё до
 * расширения. Полный `bakeLights()` в `finalizeExpandedFloor` начинается с
 * `light.fill(0)` и стирал эту заливку целиком — она не доживала до игры ни
 * разу. Тот же замысел теперь несут фичи: холодные помещения получают более
 * частую сетку ламп. Фича переживает и повторный бейк после самосбора, а
 * заливка не пережила бы и его.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг обычной сетки: лампа гаснет к 7.6 клетки, угол сетки отстоит на 7.07 —
 *  светло везде, но пятна ещё различимы. */
const WARD_STEP = 10;
const WARD_HALF = WARD_STEP >> 1;

/** Холодная линия: аптека, холодный шкаф, северная чистая петля. Шаг вдвое
 *  меньше — эти комнаты светятся ровно, без единой тени по углам. */
const COLD_STEP = 6;
const COLD_HALF = COLD_STEP >> 1;

/** Грязные палаты: свеча несёт радиус 5 и гаснет к 4.4 клетки, так что при
 *  шаге 10 между пятнами остаётся настоящая темнота — примерно половина палаты.
 *  Шаг 8 давал сплошное покрытие: свечей много, а темноты нет, и палата
 *  переставала отличаться от чистой. Так и надо: там гасят. */
const DIRTY_STEP = 10;
const DIRTY_HALF = DIRTY_STEP >> 1;


function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки: середина палаты почти всегда занята
 *  койкой или каталкой, и без обхода лампа комнаты просто не ставится. */
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
 * @param coldRooms аптека, холодный шкаф и северная чистая петля — плотный свет
 * @param dirtyWards лихорадочная, красная и чёрная палаты — свечи и полутьма
 */
export function lightBolnichnyKorpus(
  world: World,
  coldRooms: readonly Room[],
  dirtyWards: readonly Room[],
): void {
  const cold = new Set<number>();
  for (const room of coldRooms) cold.add(room.id);
  const dirty = new Set<number>();
  for (const room of dirtyWards) dirty.add(room.id);

  for (const room of world.rooms) {
    if (!room) continue;

    if (dirty.has(room.id)) {
      gridRoom(world, room, DIRTY_STEP, DIRTY_HALF, Feature.CANDLE);
      continue;
    }

    if (cold.has(room.id)) {
      gridRoom(world, room, COLD_STEP, COLD_HALF, Feature.LAMP);
      continue;
    }

    // Лампа в середине плюс сетка: без сетки длинная палата и приёмная светятся
    // одной точкой, а по краям, где как раз стоят койки, темно.
    placeNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.LAMP, 2);
    gridRoom(world, room, WARD_STEP, WARD_HALF, Feature.LAMP);
  }

  // Открытая земля между корпусами: связки, дворы, вентиляционные обходы.
  // Стены гасят свет наглухо, комнатная сетка через них не достаёт.
  for (let y = WARD_HALF; y < W; y += WARD_STEP) {
    for (let x = WARD_HALF; x < W; x += WARD_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      placeNear(world, x, y, Feature.LAMP, 2);
    }
  }
}
