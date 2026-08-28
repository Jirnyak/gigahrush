/* ── Прачечная Пенроуза: свет по рядам ─────────────────────────────
 *
 * Этаж выходил из генератора с 41 лампой на 325 тысяч проходимых клеток:
 * 1.8% освещённости, самый тёмный из маршрутных. Апериодичная россыпь ромбов,
 * паровые дворы, штабные кварталы и краевые водостоки не имели ни одного
 * источника вовсе — тринадцать авторских плитк светились, остальной этаж нет.
 *
 * Свет здесь висит по работе, а не по узору. Ряды машин и сушек освещены плотно:
 * у стиральной линии работают руками, и над ней всегда вешают лишний плафон.
 * Мокрые полоскальные держат свет с сухого края — светильник в воду не ставят,
 * зато вода несёт отблеск дальше бетона. Обычные ромбы и переходы между ними
 * светят рабочим шагом.
 *
 * Тайники остаются тёмными нарочно. Скрытая умывальная и сухой кэш — это
 * награда за чтение символов, а освещённый тайник виден с порога и перестаёт
 * быть тайником: свет не должен выдавать то, что игрок обязан найти.
 *
 * Проход детерминированный, жадный, без жребия; занятую клетку не переписывает.
 */

import { Cell, Feature, W } from '../../core/types';
import type { World } from '../../core/world';
import { PENROSE_LAUNDRY_ROOM_DEF_IDS } from './meta';

/** Шаг над линией машин: где стирают и сушат, там всегда светлее. */
const STEP_MACHINE_ROW = 11;

/** Рабочий шаг помещений: ромбы, штабы, паровые дворы. */
const STEP_ROOM = 15;

/** Шаг переходов между ромбами. Апериодичная связка длинная, и заливать её
 *  целиком незачем — переход должен читаться цепочкой пятен. */
const STEP_LINK = 17;

/** Насколько далеко от клетки ищется машина, чтобы считать место линией. */
const MACHINE_RANGE = 3;

const REACH_DRY = 4;

const REACH_WATER = 6;

/** Тайники прачечной: их темнота — часть загадки символов. */
const DARK_ROOM_NAMES: readonly string[] = [
  PENROSE_LAUNDRY_ROOM_DEF_IDS.hiddenCache,
  PENROSE_LAUNDRY_ROOM_DEF_IDS.dryCache,
];

function collectDarkRoomIds(world: World): Set<number> {
  const ids = new Set<number>();
  for (const room of world.rooms) {
    if (room && DARK_ROOM_NAMES.includes(room.name)) ids.add(room.id);
  }
  return ids;
}

/** Линия машин: рядом стоит стиральная или сушильная машина. */
function nearMachineRow(world: World, idx: number): boolean {
  const x = idx % W;
  const y = (idx / W) | 0;
  for (let dy = -MACHINE_RANGE; dy <= MACHINE_RANGE; dy++) {
    for (let dx = -MACHINE_RANGE; dx <= MACHINE_RANGE; dx++) {
      if (world.features[world.idx(x + dx, y + dy)] === Feature.MACHINE) return true;
    }
  }
  return false;
}

function stepAt(world: World, idx: number): number {
  if (nearMachineRow(world, idx)) return STEP_MACHINE_ROW;
  return world.roomMap[idx] >= 0 ? STEP_ROOM : STEP_LINK;
}

function dryFreeCell(world: World, x: number, y: number, reach: number): number {
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

function markTaken(claimed: Uint8Array, world: World, idx: number, r: number): void {
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

function hang(world: World, claimed: Uint8Array, x: number, y: number, reach: number, dark: Set<number>): boolean {
  const spot = dryFreeCell(world, x, y, reach);
  if (spot < 0) return false;
  if (dark.has(world.roomMap[spot])) return false;
  world.features[spot] = Feature.LAMP;
  markTaken(claimed, world, spot, stepAt(world, spot));
  return true;
}

function sweep(world: World, claimed: Uint8Array, dark: Set<number>, accept: (idx: number) => boolean): number {
  let placed = 0;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (claimed[idx]) continue;
      const cell = world.cells[idx];
      const wet = cell === Cell.WATER;
      if (cell !== Cell.FLOOR && !wet) continue;
      if (dark.has(world.roomMap[idx])) {
        claimed[idx] = 1;
        continue;
      }
      if (!accept(idx)) continue;
      if (hang(world, claimed, x, y, wet ? REACH_WATER : REACH_DRY, dark)) placed++;
      else markTaken(claimed, world, idx, 2);
      claimed[idx] = 1;
    }
  }
  return placed;
}

export function lightPenroseLaundry(world: World): number {
  const claimed = new Uint8Array(W * W);
  const dark = collectDarkRoomIds(world);
  let placed = 0;

  // Середина каждой комнаты — первым делом: у ромба короткая диагональ, и без
  // центрального плафона он читается кольцом света вокруг тёмного ядра.
  for (const room of world.rooms) {
    if (!room || room.w < 4 || room.h < 4 || dark.has(room.id)) continue;
    const cx = world.wrap(room.x + (room.w >> 1));
    const cy = world.wrap(room.y + (room.h >> 1));
    if (claimed[world.idx(cx, cy)]) continue;
    if (hang(world, claimed, cx, cy, REACH_DRY, dark)) placed++;
  }

  // Затем линии машин: рабочая полоса прачечной светлее всего остального.
  placed += sweep(world, claimed, dark, idx => nearMachineRow(world, idx));

  // Затем помещения целиком.
  placed += sweep(world, claimed, dark, idx => world.roomMap[idx] >= 0);

  // И в конце переходы апериодичной связки.
  placed += sweep(world, claimed, dark, idx => world.roomMap[idx] < 0);

  return placed;
}
