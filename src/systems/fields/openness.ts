import { World } from '../../core/world';
import { W } from '../../core/types';
import { FieldChannel, FIELD_PLANE, fieldBlocked } from './channels';

/**
 * Статическое поле просвета: 0 — глухой угол или чокпойнт, 255 — открытое
 * пространство. Запекается один раз на загрузку этажа.
 *
 * `getSubcellNavCost` в `ai/pathfinding.ts` уже опрашивает восемь соседей каждой
 * подклетки во время запекания путей — и выбрасывает ответ в двоичную корзину
 * (1 или 2). Здесь тот же опрос, но результат сохраняется целиком: вместо «есть
 * ли рядом стена» — «как далеко до ближайшей стены». Двоичная корзина остаётся
 * ровно на своём месте внутри этой шкалы: клетка с перекрытым ортогональным
 * соседом получает 25, с перекрытым только диагональным — 35, клетка со всеми
 * восемью открытыми — не меньше 50.
 *
 * Считается чамфер-преобразованием 5-7: два растровых прохода (вперёд и назад)
 * вместо очереди, никакого BFS. Тор закрывается вторым кругом проходов —
 * растровый порядок распространяет только по направлению обхода, и шов между
 * x=1023 и x=0 иначе остался бы виден.
 */

const CHAMFER_ORTH = 5;
const CHAMFER_DIAG = 7; // 7/5 = 1.4 ≈ √2
/** Дальше этого расстояния просвет уже полный, шкала байта кончилась. */
const CHAMFER_CAP = (255 / CHAMFER_ORTH) | 0; // 51 клетка ≈ 10.2 клетки простора

function relax(plane: Uint8Array, base: number, i: number, from: number, weight: number): void {
  const cand = plane[base + from] + weight;
  if (cand < plane[base + i]) plane[base + i] = cand;
}

/** Проход по возрастанию: смотрит на уже посчитанных соседей W, NW, N, NE. */
function chamferForward(world: World, plane: Uint8Array, base: number): void {
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = world.idx(x, y);
      if (plane[base + i] === 0) continue;
      relax(plane, base, i, world.idx(x - 1, y), CHAMFER_ORTH);
      relax(plane, base, i, world.idx(x, y - 1), CHAMFER_ORTH);
      relax(plane, base, i, world.idx(x - 1, y - 1), CHAMFER_DIAG);
      relax(plane, base, i, world.idx(x + 1, y - 1), CHAMFER_DIAG);
    }
  }
}

/** Проход по убыванию: соседи E, SE, S, SW. */
function chamferBackward(world: World, plane: Uint8Array, base: number): void {
  for (let y = W - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = world.idx(x, y);
      if (plane[base + i] === 0) continue;
      relax(plane, base, i, world.idx(x + 1, y), CHAMFER_ORTH);
      relax(plane, base, i, world.idx(x, y + 1), CHAMFER_ORTH);
      relax(plane, base, i, world.idx(x + 1, y + 1), CHAMFER_DIAG);
      relax(plane, base, i, world.idx(x - 1, y + 1), CHAMFER_DIAG);
    }
  }
}

/**
 * Запечь просвет для текущей геометрии этажа. O(W²) — только на загрузке этажа
 * и после сшивки самосбора, никогда в кадре симуляции (Железный закон).
 */
export function bakeOpennessField(world: World): void {
  const plane = world.perceptionFields;
  const base = FieldChannel.OPENNESS * FIELD_PLANE;

  for (let i = 0; i < FIELD_PLANE; i++) {
    plane[base + i] = fieldBlocked(world, i) ? 0 : CHAMFER_CAP;
  }

  chamferForward(world, plane, base);
  chamferBackward(world, plane, base);
  chamferForward(world, plane, base);
  chamferBackward(world, plane, base);

  for (let i = 0; i < FIELD_PLANE; i++) {
    const d = plane[base + i];
    plane[base + i] = d >= CHAMFER_CAP ? 255 : d * CHAMFER_ORTH;
  }
}
