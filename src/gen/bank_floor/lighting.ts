/* ── Банк Б-22: свет как надзор ────────────────────────────────────
 *
 * Этаж выходил из генератора с 4.6% освещённости на 111 118 проходимых клеток:
 * 42 лампы убранства на весь квартал банка. Кассовая линия, депозитный ряд и
 * хранилище — места, где смысл в том, что на тебя СМОТРЯТ, — не были видны.
 *
 * В банке свет не уют, а надзор. Клиентская половина залита ровно и плотно:
 * у кассы тень означала бы кражу, поэтому лампы стоят чаще, чем нужно глазу.
 * Служебный обход и долговая петля освещены реже: этими ходами пользоваться
 * не положено, их не благоустраивают, и должника ведут по полутьме. Разница
 * читается сразу — игрок понимает, что сошёл с законного пути, ещё до того,
 * как это скажет охрана.
 *
 * Проход детерминированный, без жребия. Лампа не путевая преграда, поэтому
 * сетка не запирает ни обход, ни оболочку хранилища.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { BANK_ROOM_NAMES } from './meta';

/* Клиентская половина: шаг заметно уже, чем позволяет пятно лампы (видно около
 * 7.6 клетки), — перекрытие намеренное, банк пересвечивает свои залы. */
const COUNTER_STEP = 9;

/* Теневая половина: шаг шире диаметра пятна по углам, между лампами остаётся
 * настоящая темнота. Не настолько, чтобы игрок потерял стену, — настолько,
 * чтобы он понял, куда попал. */
const SHADOW_STEP = 18;

/* Земля между корпусами банка: шаг клиентской половины со сдвигом, чтобы линии
 * коридорной сетки не совпали с комнатными и лампы не встали парой у порога. */
const OUTSIDE_STEP = 12;
const OUTSIDE_OFFSET = 5;

/** Комнаты, которые банк не освещает по своей воле: черный обход, его пост,
 *  долговая петля, очередь должников и наружная оболочка хранилища. */
const SHADOW_ROOMS: ReadonlySet<string> = new Set<string>([
  BANK_ROOM_NAMES.bypass,
  BANK_ROOM_NAMES.bypassGate,
  BANK_ROOM_NAMES.debtorCircuit,
  BANK_ROOM_NAMES.queue,
  BANK_ROOM_NAMES.vaultShell,
]);

/** Занятую клетку не переписываем: убранство `dressBankRooms`, стойки касс,
 *  сейфы и ячейки объявлены раньше этого прохода. */
function placeLamp(world: World, x: number, y: number): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = Feature.LAMP;
  return true;
}

/** Кольцевой обход вокруг узла: узел сетки в банке регулярно приходится на
 *  стойку кассы или на ячейку, и без обхода зал терял бы свою лампу. */
function placeNear(world: World, x: number, y: number, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (placeLamp(world, x + dx, y + dy)) return true;
      }
    }
  }
  return false;
}

function roomStep(room: Room): number {
  return SHADOW_ROOMS.has(room.name) ? SHADOW_STEP : COUNTER_STEP;
}

export function lightBankFloor(world: World): void {
  for (const room of world.rooms) {
    if (!room) continue;
    // Середина комнаты первой: кредитное окно и кассовые кабинки малы, между
    // узлами общей сетки они провалились бы целиком — свет не идёт сквозь стены.
    placeNear(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), 2);
    const step = roomStep(room);
    const half = Math.floor(step / 2);
    for (let dy = half; dy < room.h; dy += step) {
      for (let dx = half; dx < room.w; dx += step) {
        placeNear(world, room.x + dx, room.y + dy, 2);
      }
    }
  }

  // Земля между корпусами: подходы к вестибюлю, дворы, расширенный квартал.
  // Клетки комнат уже прошли своим шагом выше.
  for (let y = OUTSIDE_OFFSET; y < W; y += OUTSIDE_STEP) {
    for (let x = OUTSIDE_OFFSET; x < W; x += OUTSIDE_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      placeNear(world, x, y, 3);
    }
  }
}
