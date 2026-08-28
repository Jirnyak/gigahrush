/* ── НИИ слизи: свет лаборатории ───────────────────────────────────
 *
 * Этаж выходил из генератора с 27 источниками на 265 671 проходимую клетку —
 * полтора процента освещённых клеток. Институт, где посменно ведут пробы,
 * оказался темнее брошенного склада: свет в мире берётся только из фич
 * LAMP/CANDLE через `bakeLights`, а систематического прохода расстановки у
 * этажа не было вовсе.
 *
 * Свет здесь — дисциплина, а не украшение. Лаборатории, кабинеты, галереи,
 * шлюзы и коридоры держат ровную сетку: в НИИ работают, и за слизью смотрят
 * глазами, а не на ощупь. Исключение одно, и оно осмысленное — гермокамеры.
 * Над живой пробой держат дежурную свечу: наблюдают за камерой из освещённой
 * галереи через стекло, а внутри свет глушат, чтобы проба не тянулась к нему.
 * Полутьма камеры — это протокол, а не забытая лампа, и игрок читает его
 * глазами: галерея светла, камера темна, граница между ними — стекло.
 *
 * Проход детерминированный, без жребия: сетка по комнатам и вторая сетка по
 * открытой земле между ними. Лампа не путевая преграда, поэтому сетка ничего
 * не запирает, а занятые клетки не переписываются — авторские приборы, панели
 * и мебель кабинетов остаются как объявлены.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг рабочей сетки. Лампа несёт радиус 8 и гаснет к 7.6 клетки, поэтому при
 *  шаге 10 угол сетки отстоит на 7.07 — света хватает всюду, но пятна ещё
 *  читаются отдельными. Шаг 8 давал бы заливку без теней, а НИИ не операционная. */
const LAB_STEP = 10;
const LAB_HALF = LAB_STEP >> 1;

/** Кусок имени гермокамеры. Пакет объявляет полный префикс в `index.ts`, но
 *  тянуть его сюда значило бы завести цикл импорта ради одной строки: свет
 *  зовётся из `index.ts`, а не наоборот. */
const CAMERA_NAME_MARK = 'Гермокамера';

/** Ставит источник, если клетка действительно свободна. Занятую не трогает:
 *  авторская расстановка старше общего прохода. */
function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки вокруг цели: без него лампа комнаты
 *  пропадает всякий раз, когда в середину встал стол или автоклав. */
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

function isSlimeCamera(room: Room): boolean {
  return room.name.includes(CAMERA_NAME_MARK);
}

export function lightSlimeNii(world: World): void {
  for (const room of world.rooms) {
    if (!room) continue;

    // Гермокамера: одна дежурная свеча в середине и ничего больше. Смотровая
    // галерея снаружи её осветит ровно настолько, насколько нужно наблюдателю.
    if (isSlimeCamera(room)) {
      placeNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.CANDLE, 3);
      continue;
    }

    // Рабочее помещение: лампа в середине, а крупные — ещё и по своей сетке.
    // Без сетки главный зал и палата добровольцев светятся одной точкой в
    // центре и тонут по краям, где как раз стоят койки и шкафы проб.
    placeNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.LAMP, 2);
    for (let y = room.y + LAB_HALF; y < room.y + room.h; y += LAB_STEP) {
      for (let x = room.x + LAB_HALF; x < room.x + room.w; x += LAB_STEP) {
        placeNear(world, x, y, Feature.LAMP, 1);
      }
    }
  }

  // Открытая земля: коридоры макросети, обходы и дворы между филиалами. Стены
  // гасят свет наглухо, поэтому у коридора обязана быть своя линия ламп —
  // комнатная сетка через стену туда не достаёт.
  for (let y = LAB_HALF; y < W; y += LAB_STEP) {
    for (let x = LAB_HALF; x < W; x += LAB_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      placeNear(world, x, y, Feature.LAMP, 2);
    }
  }
}
