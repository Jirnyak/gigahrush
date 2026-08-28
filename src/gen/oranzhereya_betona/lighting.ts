/* ── Оранжерея бетона: свет как урожай ─────────────────────────────
 *
 * Этаж выходил из генератора с 266 лампами на 423 тысячи проходимых клеток:
 * 4.0% освещённости. Часть из них ставил общий `scatterAmbientLights` — россыпь
 * по всей карте наугад, одинаковая и над грядкой, и над глухим бетоном. Для
 * оранжереи это худший из возможных светов: здесь лампа не украшение, а
 * производственный ресурс, и она обязана висеть там, где что-то растёт.
 *
 * Поэтому свет читается как хозяйство. Над зеленью — частые ряды фитоламп:
 * гряды, галерея и грибная палата держат самый плотный шаг на этаже, потому что
 * ими этаж и кормится. Насосная, склад семян, рынок и щитовые светят обычным
 * рабочим шагом. Проходы между кварталами — реже всех: коридор ничего не родит.
 *
 * Водяной бассейн освещается с сухого края: светильник в воду не ставят, а вода
 * разносит свет дальше бетона, и одна лампа на кромке достаёт до середины.
 *
 * Проход детерминированный, жадный, без жребия: шаг задаёт покрытие пола, и
 * занятая клетка не переписывается — насосы, столы и авторские плафоны целы.
 */

import { Cell, Feature, Tex, W } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг фитоламп над зеленью. Самый плотный на этаже: растениям нужен свет, и
 *  тёмная грядка — это неурожай, а не атмосфера. */
const STEP_BED = 10;

/** Рабочий шаг помещений: насосная, кладовые, рынок, караулка. */
const STEP_ROOM = 13;

/** Шаг проходов между кварталами. */
const STEP_PASSAGE = 15;

/** Докуда искать сухую свободную клетку под светильник. */
const REACH_DRY = 4;

/** С воды до берега бывает дальше: бассейн шире грядки. */
const REACH_WATER = 7;

/** Пол грядки: зелёный настил гидропоники. По нему и опознаётся посадка —
 *  комнаты тут перекраиваются расширением, а настил остаётся с клеткой. */
function isBedCell(world: World, idx: number): boolean {
  return world.floorTex[idx] === Tex.F_GREEN_CARPET;
}

function stepAt(world: World, idx: number): number {
  if (isBedCell(world, idx)) return STEP_BED;
  return world.roomMap[idx] >= 0 ? STEP_ROOM : STEP_PASSAGE;
}

/** Сухая свободная клетка вокруг цели: в середине грядки обычно стоит стол
 *  рассады, в бассейне — вода. */
function dryCell(world: World, x: number, y: number, reach: number): number {
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

function occupy(claimed: Uint8Array, world: World, idx: number, r: number): void {
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

function hangLamp(world: World, claimed: Uint8Array, x: number, y: number, reach: number): boolean {
  const spot = dryCell(world, x, y, reach);
  if (spot < 0) return false;
  world.features[spot] = Feature.LAMP;
  occupy(claimed, world, spot, stepAt(world, spot));
  return true;
}

/** Жадный построчный обход. Всё, что пропускает `accept` и осталось незанятым,
 *  получает свою лампу — так ни одна грядка не остаётся без света. */
function sweep(world: World, claimed: Uint8Array, accept: (idx: number) => boolean): number {
  let placed = 0;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (claimed[idx]) continue;
      const cell = world.cells[idx];
      const wet = cell === Cell.WATER;
      if (cell !== Cell.FLOOR && !wet) continue;
      if (!accept(idx)) continue;
      if (hangLamp(world, claimed, x, y, wet ? REACH_WATER : REACH_DRY)) placed++;
      else occupy(claimed, world, idx, 2);
      claimed[idx] = 1;
    }
  }
  return placed;
}

export function lightOranzhereyaBetona(world: World): number {
  const claimed = new Uint8Array(W * W);
  let placed = 0;

  // Сердце каждой комнаты: без него посреди рынка и караулки остаётся тёмный
  // пятак, а игрок именно туда и заходит.
  for (const room of world.rooms) {
    if (!room || room.w < 4 || room.h < 4) continue;
    const cx = world.wrap(room.x + (room.w >> 1));
    const cy = world.wrap(room.y + (room.h >> 1));
    if (claimed[world.idx(cx, cy)]) continue;
    if (hangLamp(world, claimed, cx, cy, REACH_DRY)) placed++;
  }

  // Потом посадки: зелень получает свет раньше бетона, потому что этаж живёт с
  // урожая, а не с коридоров.
  placed += sweep(world, claimed, idx => isBedCell(world, idx));

  // Остальные помещения квартала.
  placed += sweep(world, claimed, idx => world.roomMap[idx] >= 0);

  // И только в конце проходы между ними.
  placed += sweep(world, claimed, idx => world.roomMap[idx] < 0);

  return placed;
}
