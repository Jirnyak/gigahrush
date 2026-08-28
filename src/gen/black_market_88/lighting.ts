/* ── Чёрный рынок 88: свет прилавков ──────────────────────────────
 *
 * Базар выходил из генератора со 151 источником на 108 285 проходимых клеток.
 * Аукционная яма, ряды, долговая контора и будки задвижек стояли в темноте —
 * то есть на торговом этаже нельзя было разглядеть ни товар, ни лицо продавца,
 * а именно ради них сюда и приходят.
 *
 * Торговля покупает свет первой: где есть прилавок, там горит. Поэтому свет
 * здесь идёт от помещений наружу — лампа над прилавком, разводка по крупным
 * залам, гирлянда вдоль рядов и переулков между ними. Рынок должен быть самым
 * светлым, что игрок видел с жилого этажа.
 *
 * Изнанка рынка света не получает СПЕЦИАЛЬНО: курьерские щели и всё, что
 * названо щелью, остаётся тёмным. Там передают то, что не показывают, и
 * темнота — это цена, а не недоделка: игрок сам решает, лезть ли туда вслепую.
 *
 * Проход детерминированный, шагом по сетке, без жребия. Занятая клетка не
 * переписывается: авторские кассы, витрины и лотки стоят как объявлены.
 */

import { Cell, Feature, RoomType, W, type Room } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг разводки. Лампа несёт радиус 8: шаг чуть теснее диаметра пятна не
 *  оставляет тёмного угла ни в зале, ни в переулке между рядами. */
const STALL_STEP = 10;

function hangBulb(world: World, x: number, y: number, dark: Set<number>): boolean {
  const i = world.idx(x, y);
  if (world.cells[i] !== Cell.FLOOR || world.features[i] !== Feature.NONE) return false;
  // Кольцевой поиск умеет заехать соседу за стену, поэтому щель проверяется на
  // самой клетке, а не только на входе в помещение.
  if (dark.has(world.roomMap[i])) return false;
  world.features[i] = Feature.LAMP;
  return true;
}

/** Кольцевой поиск свободной клетки: середину лавки почти всегда занимает сам
 *  прилавок, и без обхода лампа над ним не появилась бы вовсе. */
function hangBulbNear(world: World, x: number, y: number, reach: number, dark: Set<number>): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (hangBulb(world, x + dx, y + dy, dark)) return true;
      }
    }
  }
  return false;
}

/** Изнанка рынка: курьерские щели и всё, что так названо. Свет туда не идёт. */
function isBackAlley(room: Room): boolean {
  return room.type === RoomType.SMOKING || room.name.includes('щель');
}

export function lightBlackMarket88(world: World): void {
  const darkRoomIds = new Set<number>();
  for (const room of world.rooms) if (room && isBackAlley(room)) darkRoomIds.add(room.id);

  // Лавки, конторы, будки, аукционная яма: лампа над прилавком, дальше разводка.
  // Одной точки хватает будке, но не яме на сорок на двадцать восемь.
  for (const room of world.rooms) {
    if (!room || darkRoomIds.has(room.id)) continue;
    hangBulbNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 2, darkRoomIds);
    for (let y = room.y + (STALL_STEP >> 1); y < room.y + room.h; y += STALL_STEP) {
      for (let x = room.x + (STALL_STEP >> 1); x < room.x + room.w; x += STALL_STEP) {
        hangBulbNear(world, x, y, 1, darkRoomIds);
      }
    }
  }

  // Ряды, переулки, кольца обхода: гирлянда по той же сетке. Клетки помещений
  // уже прошли выше, тёмные щели пропускаются вместе со своим кольцевым поиском.
  for (let y = STALL_STEP >> 1; y < W; y += STALL_STEP) {
    for (let x = STALL_STEP >> 1; x < W; x += STALL_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      hangBulbNear(world, x, y, 2, darkRoomIds);
    }
  }
}
