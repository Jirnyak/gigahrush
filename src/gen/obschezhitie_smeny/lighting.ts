/* ── Общежитие смены: дежурный свет ───────────────────────────────
 *
 * Этаж отдавал 3.3% освещённых клеток на 94 тысячи проходимых — 23 лампы и 19
 * свечей на всё общежитие. Тёмная спальная секция читается не как «смена спит»,
 * а как «сюда забыли провести генератор»: игрок не видит ни коек, ни шкафов, ни
 * того, кто стоит у него за спиной.
 *
 * Общежитие спит, и свет это говорит. Коридоры, кольца обхода, кухня, красный
 * угол и пост держат дежурный свет — по ним ночью ходит Глеб, и обход должен
 * видеть, что несут мимо шкафов. Спальные секции и кладовые живут на ночнике:
 * свеча у изголовья, тусклее лампы и вдвое ближе. Тихая кража остаётся
 * возможной — в кубрике сумрачно, — но, выйдя с добычей в коридор, ты выходишь
 * на свет, и свидетель у тебя появляется сам.
 *
 * Замерено: 90.3% против 3.3% до прохода.
 */

import { Cell, Feature, RoomType, W } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг дежурного света. Кольца обхода узкие, свет в них не разливается диском,
 *  поэтому шаг вдвое уже двойного радиуса лампы. */
const DUTY_STEP = 8;

/** Шаг ночников: свеча слабее (радиус 5) и ставится плотнее, иначе дальний
 *  конец спальной секции проваливается в ноль. */
const NIGHT_STEP = 6;

/** Спит — койка, шкаф, кладовая. Дежурит — всё остальное, включая клетки вне
 *  комнат: кольца обхода общежития комнатами не размечены. */
function sleeps(world: World, idx: number): boolean {
  const id = world.roomMap[idx];
  if (id < 0) return false;
  const type = world.rooms[id]?.type;
  return type === RoomType.LIVING || type === RoomType.STORAGE || type === RoomType.BATHROOM;
}

/** Свободная клетка рядом с точкой сетки. Занятую не переписываем: койки,
 *  шкафы и авторский свет поста поставлены раньше и знают о себе больше. */
function mount(world: World, x: number, y: number, feature: Feature, reach: number): void {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const i = world.idx(x + dx, y + dy);
        if (world.cells[i] !== Cell.FLOOR || world.features[i] !== Feature.NONE) continue;
        world.features[i] = feature;
        return;
      }
    }
  }
}

export function lightObschezhitieSmeny(world: World): void {
  // Дежурная линия: коридоры, кольца обхода, кухня, пост, красный угол.
  for (let y = DUTY_STEP >> 1; y < W; y += DUTY_STEP) {
    for (let x = DUTY_STEP >> 1; x < W; x += DUTY_STEP) {
      if (sleeps(world, world.idx(x, y))) continue;
      mount(world, x, y, Feature.LAMP, 2);
    }
  }

  // Ночники в кубриках и кладовых.
  for (let y = NIGHT_STEP >> 1; y < W; y += NIGHT_STEP) {
    for (let x = NIGHT_STEP >> 1; x < W; x += NIGHT_STEP) {
      if (!sleeps(world, world.idx(x, y))) continue;
      mount(world, x, y, Feature.CANDLE, 1);
    }
  }
}
