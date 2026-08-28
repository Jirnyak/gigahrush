/* ── Шахта-атриум: огни над провалом ───────────────────────────────
 *
 * Этаж выходил из генератора с 49 лампами на 155 тысяч проходимых клеток:
 * 3.3% освещённости. Кольцевые галереи, все пять мостов, сервисный обод и
 * микрокварталы штабов не имели ни одного источника — вертикальный провал и
 * так чёрный, а вокруг него было ровно так же черно.
 *
 * Свет здесь работает планировкой, а не заливкой. Пустоту освещать нечем и
 * незачем: над провалом нет пола, лампу ставить не на что, и это правильно —
 * дыра обязана оставаться дырой. Зато мосты выложены частой нитью огней: с
 * дальней галереи мост читается линией, и игрок видит переправу раньше, чем
 * доходит до края. Кольца освещены реже — по ним ходят, но на них не смотрят.
 * Сервисный обод по периметру карты — служебный свет вахты, самый скупой.
 *
 * Порядок: сперва кольца по дуге (иначе построчный обход рвал бы кольцо на
 * дуги разной яркости), потом мосты, потом сердца комнат, помещения и остаток.
 * Занятую клетку проход не переписывает — прожектор пульта, машины ремонтного
 * поста и острова укрытий остаются как объявлены.
 */

import { Cell, Feature, W } from '../../core/types';
import type { World } from '../../core/world';
import { CX, CY, INNER_R, MID_R, OUTER_R } from './meta';

/** Шаг фонарей по дуге кольца. Кольцо шириной 6-7 клеток, лампа накрывает его
 *  поперёк целиком, поэтому важен только шаг вдоль. */
const RING_ARC = 18;

/** Мост: частая нить огней. Мост — это решение «идти напрямую или в обход», и
 *  решение должно быть видно с той стороны провала. */
const STEP_BRIDGE = 11;

/** Кольцевые галереи между мостами. */
const STEP_RING = 19;

/** Помещения обода: пульт, ремонтный пост, убежище, микрокварталы штабов. */
const STEP_ROOM = 16;

/** Служебный обод и всё, что снаружи атриума. Вахта экономит. */
const STEP_SERVICE = 21;

/** Полуширина полосы, которую считаем кольцом: сами кольца режутся с
 *  полушириной 6-7, плюс запас на косяки примыкающих спиц. */
const RING_BAND = 9;

/** Кольцевой поиск свободного пола. В обод и на мосты уходить далеко нельзя:
 *  за два шага от моста уже провал. */
const REACH = 3;

function radiusFrom(x: number, y: number): number {
  // Центр атриума — середина карты, поэтому обычная разность и есть торическая.
  return Math.hypot(x - CX, y - CY);
}

function onRing(d: number): boolean {
  return Math.abs(d - INNER_R) <= RING_BAND
    || Math.abs(d - MID_R) <= RING_BAND
    || Math.abs(d - OUTER_R) <= RING_BAND;
}

/** Шаг для клетки: мост, кольцо, помещение или служебный обод. */
function stepAt(world: World, idx: number): number {
  const x = idx % W;
  const y = (idx / W) | 0;
  const d = radiusFrom(x, y);
  if (d <= OUTER_R + RING_BAND) return onRing(d) ? STEP_RING : STEP_BRIDGE;
  return world.roomMap[idx] >= 0 ? STEP_ROOM : STEP_SERVICE;
}

function freeFloor(world: World, x: number, y: number): number {
  for (let r = 0; r <= REACH; r++) {
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

function claimDisc(claimed: Uint8Array, world: World, idx: number, r: number): void {
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

function lamp(world: World, claimed: Uint8Array, x: number, y: number, step: number): boolean {
  const spot = freeFloor(world, x, y);
  if (spot < 0) return false;
  world.features[spot] = Feature.LAMP;
  claimDisc(claimed, world, spot, step);
  return true;
}

/** Фонари по дуге: угловой шаг подобран так, чтобы длина дуги между лампами
 *  держалась около `RING_ARC` на любом радиусе. */
function lightRing(world: World, claimed: Uint8Array, radius: number): number {
  const count = Math.max(8, Math.round(2 * Math.PI * radius / RING_ARC));
  let placed = 0;
  for (let n = 0; n < count; n++) {
    const angle = n * Math.PI * 2 / count;
    const x = Math.round(CX + Math.cos(angle) * radius);
    const y = Math.round(CY + Math.sin(angle) * radius);
    if (claimed[world.idx(x, y)]) continue;
    if (lamp(world, claimed, x, y, STEP_RING)) placed++;
  }
  return placed;
}

/** Жадный построчный обход того, что пропускает `accept`. */
function sweep(world: World, claimed: Uint8Array, accept: (idx: number) => boolean): number {
  let placed = 0;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (claimed[idx]) continue;
      if (world.cells[idx] !== Cell.FLOOR) continue;
      if (!accept(idx)) continue;
      const spot = freeFloor(world, x, y);
      if (spot < 0) {
        claimed[idx] = 1;
        continue;
      }
      world.features[spot] = Feature.LAMP;
      claimDisc(claimed, world, spot, stepAt(world, spot));
      claimed[idx] = 1;
      placed++;
    }
  }
  return placed;
}

export function lightShahtaAtrium(world: World): number {
  const claimed = new Uint8Array(W * W);
  let placed = 0;

  // Кольца ставятся первыми и по дуге: три светящихся круга вокруг провала —
  // главный ориентир этажа.
  placed += lightRing(world, claimed, INNER_R);
  placed += lightRing(world, claimed, MID_R);
  placed += lightRing(world, claimed, OUTER_R);

  // Мосты и рёбра: всё, что внутри атриума и не легло на кольцо. Пустота сюда
  // не попадает — это не пол, лампу туда поставить нечем.
  placed += sweep(world, claimed, idx => {
    const d = radiusFrom(idx % W, (idx / W) | 0);
    return d <= OUTER_R + RING_BAND && !onRing(d);
  });

  // Сердце каждой комнаты обода. Кольцевая галерея и обод объявлены логическими
  // комнатами во всю карту, их середина приходится на провал — поиск свободного
  // пола там просто не находит места, и лишней лампы в пустоте не возникает.
  for (const room of world.rooms) {
    if (!room || room.w < 4 || room.h < 4) continue;
    const cx = world.wrap(room.x + (room.w >> 1));
    const cy = world.wrap(room.y + (room.h >> 1));
    if (claimed[world.idx(cx, cy)]) continue;
    if (lamp(world, claimed, cx, cy, STEP_ROOM)) placed++;
  }

  placed += sweep(world, claimed, idx => world.roomMap[idx] >= 0);
  placed += sweep(world, claimed, idx => world.roomMap[idx] < 0);

  return placed;
}
