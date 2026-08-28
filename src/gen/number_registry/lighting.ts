/* ── Числовой реестр: свет по модулю ───────────────────────────────
 *
 * Этаж выходил из генератора с 15.2% освещённости: 400 ламп, поставленных
 * убранством авторского ядра, и ни одной на расширенных конторских коридорах,
 * которые и составляют большую часть из 244 301 проходимой клетки. Игрок читал
 * номера окон на ощупь.
 *
 * Реестр светит ровно и одинаково: это контора, где сверяют остатки, и разница
 * в освещении между залом и коридором была бы здесь ошибкой учёта. Своё лицо
 * этаж получает не яркостью, а шагом — шаг сетки и её смещение взяты из
 * собственных модулей реестра, 11 и 5.
 *
 * Проход детерминированный, без жребия. Лампа не путевая преграда, поэтому
 * сетка не запирает ни простой коридор, ни составной обход.
 */

import { Cell, Feature, W } from '../../core/types';
import type { World } from '../../core/world';

/* Шаг — модуль дальнего окна реестра. Заодно он честно попадает в физику: пятно
 * лампы видно примерно на 7.6 клетки, дальний угол клетки сетки — 7.78, и в
 * углах остаётся узкая тень. Контора освещена, но не залита. */
const MODULUS_STEP = 11;
const MODULUS_HALF = Math.floor(MODULUS_STEP / 2);

/* Остаток, на который сдвинута коридорная сетка. Не украшение: без сдвига узлы
 * коридора садятся на те же линии, что узлы залов, и у порога комнаты встают
 * две лампы вплотную, а в трёх шагах в сторону — провал. */
const CORRIDOR_RESIDUE = 5;

/** Занятую клетку не переписываем: убранство `decorateRegistryRooms`, стойки
 *  касс и экраны остатков объявлены раньше этого прохода. */
function placeLamp(world: World, x: number, y: number): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = Feature.LAMP;
  return true;
}

/** Кольцевой обход вокруг узла: без него лампа зала теряется всякий раз, когда
 *  в узел встал стол сверки или картотечный шкаф. */
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

export function lightNumberRegistry(world: World): void {
  // Залы, окна остатков, кассы, картотека, сейф: каждая комната получает свою
  // лампу в середине, а крупная — ещё и сетку. Без середины маленький кабинет
  // между узлами общей сетки остался бы тёмным: свет не идёт сквозь его стены.
  for (const room of world.rooms) {
    if (!room) continue;
    placeNear(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), 2);
    for (let dy = MODULUS_HALF; dy < room.h; dy += MODULUS_STEP) {
      for (let dx = MODULUS_HALF; dx < room.w; dx += MODULUS_STEP) {
        placeNear(world, room.x + dx, room.y + dy, 2);
      }
    }
  }

  // Конторские коридоры и открытая земля между конторами. Клетки комнат уже
  // прошли своей сеткой выше и здесь пропускаются.
  for (let y = CORRIDOR_RESIDUE; y < W; y += MODULUS_STEP) {
    for (let x = CORRIDOR_RESIDUE; x < W; x += MODULUS_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      placeNear(world, x, y, 3);
    }
  }
}
