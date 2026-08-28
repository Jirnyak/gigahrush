/* ── Архив критической протечки: свет по сухому ────────────────────
 *
 * Этаж выходил из генератора с 99 лампами на 125 тысяч проходимых клеток:
 * 6.8% освещённости. Перколяционная россыпь проходов, мокрые перемычки, средние
 * блоки хранения и микрокомнаты штабов не имели ни одного источника — архив,
 * в котором нельзя прочитать ни одной надписи.
 *
 * Свет здесь считает воду. Светильник в воду не ставят: в затопленном проходе
 * его вешают на сухую кромку, и вода сама разносит отблеск дальше, чем это
 * сделал бы бетон. Так игрок видит границу мокрого раньше, чем ступает в него,
 * и выбор «коротким ходом по воде или сухим обходом» становится читаемым
 * решением, а не лотереей.
 *
 * Стеллажные проходы держат шаг плотнее прочего: в архиве не ходят, а читают,
 * и тёмный стеллаж равен отсутствующему. Сухие острова и шлюзовые залы светят
 * рабочим шагом, перколяционные капилляры между ними — самым редким: они и
 * задуманы как то, что приходится проходить наощупь.
 *
 * Проход детерминированный, жадный, без жребия; занятую клетку не переписывает,
 * поэтому авторские плафоны сухого индекса и гермоядер остаются как объявлены.
 */

import { Cell, Feature, W } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг в стеллажном проходе. Читать надо у самой полки. */
const STEP_STACKS = 12;

/** Рабочий шаг залов: обмен, шлюз, сушильная, гермоядра штабов. */
const STEP_HALL = 15;

/** Шаг перколяционных капилляров между островами. Самый редкий на этаже. */
const STEP_CAPILLARY = 17;

/** Радиус, в котором стеллаж делает клетку стеллажным проходом. */
const SHELF_RANGE = 2;

/** Докуда искать сухое место под светильник на суше. */
const REACH_DRY = 4;

/** И докуда — с воды: до берега мокрой перемычки бывает дальше. */
const REACH_BANK = 7;

function nearStacks(world: World, idx: number): boolean {
  const x = idx % W;
  const y = (idx / W) | 0;
  for (let dy = -SHELF_RANGE; dy <= SHELF_RANGE; dy++) {
    for (let dx = -SHELF_RANGE; dx <= SHELF_RANGE; dx++) {
      if (world.features[world.idx(x + dx, y + dy)] === Feature.SHELF) return true;
    }
  }
  return false;
}

function stepAt(world: World, idx: number): number {
  if (nearStacks(world, idx)) return STEP_STACKS;
  return world.roomMap[idx] >= 0 ? STEP_HALL : STEP_CAPILLARY;
}

/** Сухая свободная клетка вокруг цели. Вода отсекается здесь и только здесь —
 *  весь остальной проход про воду ничего знать не обязан. */
function dryBank(world: World, x: number, y: number, reach: number): number {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const idx = world.idx(x + dx, y + dy);
        if (world.cells[idx] === Cell.FLOOR && world.features[idx] === Feature.NONE) return idx;
      }
    }
  }
  return -1;
}

function reserve(claimed: Uint8Array, world: World, idx: number, r: number): void {
  const x = idx % W;
  const y = (idx / W) | 0;
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      claimed[world.idx(x + dx, y + dy)] = 1;
    }
  }
}

function mountLamp(world: World, claimed: Uint8Array, x: number, y: number, reach: number): boolean {
  const spot = dryBank(world, x, y, reach);
  if (spot < 0) return false;
  world.features[spot] = Feature.LAMP;
  reserve(claimed, world, spot, stepAt(world, spot));
  return true;
}

function sweep(world: World, claimed: Uint8Array, accept: (idx: number) => boolean): number {
  let placed = 0;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (claimed[idx]) continue;
      const cell = world.cells[idx];
      const flooded = cell === Cell.WATER;
      if (cell !== Cell.FLOOR && !flooded) continue;
      if (!accept(idx)) continue;
      if (mountLamp(world, claimed, x, y, flooded ? REACH_BANK : REACH_DRY)) placed++;
      else reserve(claimed, world, idx, 2);
      claimed[idx] = 1;
    }
  }
  return placed;
}

export function lightCriticalLeakArchive(world: World): number {
  const claimed = new Uint8Array(W * W);
  let placed = 0;

  // Сначала середина каждого зала: сухой индекс и спорный стеллаж велики, и без
  // центрального плафона у них светятся только углы с авторскими лампами.
  for (const room of world.rooms) {
    if (!room || room.w < 4 || room.h < 4) continue;
    const cx = world.wrap(room.x + (room.w >> 1));
    const cy = world.wrap(room.y + (room.h >> 1));
    if (claimed[world.idx(cx, cy)]) continue;
    if (mountLamp(world, claimed, cx, cy, REACH_DRY)) placed++;
  }

  // Потом стеллажные проходы: ради них архив и существует.
  placed += sweep(world, claimed, idx => nearStacks(world, idx));

  // Потом залы целиком.
  placed += sweep(world, claimed, idx => world.roomMap[idx] >= 0);

  // И в последнюю очередь капилляры протечки между островами.
  placed += sweep(world, claimed, idx => world.roomMap[idx] < 0);

  return placed;
}
