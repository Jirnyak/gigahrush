/* ── Кремниевый НЕТ-колодец: аварийная линия ──────────────────────
 *
 * Колодец выходил из генератора на 15% освещённых клеток: горел терминальный
 * зал, пара лабораторий, и всё. Двести сорок ламп на двести одиннадцать тысяч
 * проходимых клеток — этаж, где игрок не видит собственной кромки провала.
 *
 * Свет здесь не хозяйский, а сетевой: узел кормит узел. Поэтому лампы висят
 * УЗЛОВОЙ РЕШЁТКОЙ, привязанной к середине каждого помещения, — регулярная
 * сетка питания, одинаковая в зале, в лаборатории и в кабельной кишке. Ровный
 * шаг читается как инженерная линия, а не как чей-то уют, и это верно: людей
 * тут меньше, чем кремния.
 *
 * Два отступления от решётки, и оба обязательные.
 *
 * КРОМКА КОЛОДЦА. Провал без дна — главный объект этажа, и падают в него
 * ровно потому, что не видят края. По кромке идёт замкнутая аварийная линия:
 * кольцо ламп сразу за обрезом бездны. Сам провал не освещается ничем — свет
 * туда не проникает и не должен, вниз смотреть незачем.
 *
 * ВНЕ ПОМЕЩЕНИЙ. Всё, что нарезано маршрутным расширением поверх ядра, живёт
 * без питания: там стоят не лампы, а свечи, редкой сеткой. Служебные
 * шестьдесят процентов этажа — это освещённая сеть и тёмные обочины между её
 * узлами, и переход с лампы на свечу игрок читает как выход из-под питания.
 *
 * Проход детерминированный: решётка выводится из геометрии помещений, кольцо —
 * из радиуса бездны, жребия нет.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';
import type { SiliconRooms } from './meta';

/** Шаг узловой решётки. Пятно лампы достаёт на 7-8 клеток, шаг 19 оставляет
 *  между узлами полосу тени: сеть светит узлами, а не заливает пол. */
const NODE_STEP = 19;

/** Шаг свечей вне помещений: вдвое чаще решётки, но свеча и достаёт вдвое
 *  ближе — обочина остаётся сумеречной. */
const OFFGRID_STEP = 13;

/** Радиус бездны задан `carveVoidShaft`: пятнадцать клеток от середины зала.
 *  Аварийная линия идёт на две клетки дальше обреза, чтобы лампа стояла на
 *  полу, а не висела над провалом. */
const ABYSS_RADIUS = 15;
const RIM_RADIUS = ABYSS_RADIUS + 2;

/** Шаг ламп по кромке в клетках дуги: кольцо должно читаться линией, а не
 *  цепочкой отдельных огней. */
const RIM_ARC_STEP = 9;

function setLight(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Узел решётки часто занят стойкой, терминалом или кремниевым наростом.
 *  Смещаемся кольцами наружу: узел без света — это дыра в линии питания. */
function setLightNear(world: World, x: number, y: number, feature: Feature, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (setLight(world, x + dx, y + dy, feature)) return true;
      }
    }
  }
  return false;
}

/**
 * Решётка привязана к СЕРЕДИНЕ помещения, а не к координатам мира. Мировая
 * сетка проходит мимо узких помещений целиком: кабельная кишка шириной в пять
 * клеток ловит мировую линию в лучшем случае через раз, и половина кишок
 * осталась бы чёрной по всей своей длине в семьсот восемьдесят клеток.
 */
function lightRoomGrid(world: World, room: Room): void {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  const startX = cx - Math.floor((cx - room.x) / NODE_STEP) * NODE_STEP;
  const startY = cy - Math.floor((cy - room.y) / NODE_STEP) * NODE_STEP;
  for (let y = startY; y < room.y + room.h; y += NODE_STEP) {
    for (let x = startX; x < room.x + room.w; x += NODE_STEP) {
      setLightNear(world, x, y, Feature.LAMP, 2);
    }
  }
}

/** Замкнутая аварийная линия по обрезу бездны. */
function lightAbyssRim(world: World, well: Room): void {
  const cx = well.x + (well.w >> 1);
  const cy = well.y + (well.h >> 1);
  const count = Math.max(4, Math.round((2 * Math.PI * RIM_RADIUS) / RIM_ARC_STEP));
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    const x = cx + Math.round(Math.cos(angle) * RIM_RADIUS);
    const y = cy + Math.round(Math.sin(angle) * RIM_RADIUS);
    setLightNear(world, x, y, Feature.LAMP, 2);
  }
}

export function lightSiliconNetWell(world: World, rooms: SiliconRooms): void {
  for (const room of world.rooms) {
    if (room) lightRoomGrid(world, room);
  }
  lightAbyssRim(world, rooms.well);

  // Обочина маршрутного расширения: питания там нет, есть свечи.
  for (let y = OFFGRID_STEP >> 1; y < W; y += OFFGRID_STEP) {
    for (let x = OFFGRID_STEP >> 1; x < W; x += OFFGRID_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      setLightNear(world, x, y, Feature.CANDLE, 2);
    }
  }
}
