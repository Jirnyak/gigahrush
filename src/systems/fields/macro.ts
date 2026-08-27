import { World } from '../../core/world';
import { W, Cell } from '../../core/types';

/**
 * Стратегический ярус полей восприятия.
 *
 * ЗАЧЕМ ОН ЕСТЬ. Поклеточный ярус хранит байт и потому не умеет носить градиент
 * далеко: значение 7 после доли соседа даёт 0.26, а в байт это ноль — каскад
 * обрывается МЕЖДУ тактами, и никакая точность внутри такта его не спасает.
 * Замерено на точечном источнике: 255 → 205 → 56 → 14 → 0, то есть поле гаснет
 * на второй клетке. Для «убежать от опасности под ногами» этого хватает, для
 * «хищник чует толпу через этаж» — нет.
 *
 * Поэтому дальность живёт на крупной сетке: ячейка — 16×16 клеток мира, весь
 * этаж укладывается в 64×64 = 4096 ячеек, и там можно позволить себе плавающую
 * точность. Полный проход по каналу — 4096 ячеек вместо миллиона.
 *
 * РАЗДЕЛЕНИЕ ТРУДА. Поклеточный ярус — тактика: что под ногами, куда шагнуть
 * сейчас. Этот — стратегия: в какой стороне этажа густо. Драйв берёт отсюда
 * НАПРАВЛЕНИЕ и цель для маршрута, а дорогу прокладывает поиск пути: поле не
 * обязано знать про двери.
 *
 * Модуль намеренно не импортирует `./channels`: обратное ребро замкнуло бы цикл
 * импортов, а запаса по циклам в проекте нет. Номер канала и распад приходят
 * снаружи, ярусы связывает точка сборки `./index`.
 */

/** 16 клеток мира на ячейку — тот же шаг, что у бродфейза сущностей и у
 *  индексов комнат и ящиков. Своей ручки здесь не заводится. */
export const MACRO_SHIFT = 4;
export const MACRO_W = W >> MACRO_SHIFT;
export const MACRO_PLANE = MACRO_W * MACRO_W;
const MACRO_MASK = MACRO_W - 1;
/** Сколько клеток мира приходится на ячейку. */
/** Сторона ячейки в клетках мира и её площадь. */
const MACRO_CELLS_PER_SIDE = 1 << MACRO_SHIFT;
const MACRO_CELLS = 1 << (MACRO_SHIFT * 2);

/** Доля, уходящая соседям за такт. Вместе с распадом задаёт длину затухания:
 *  λ ≈ sqrt(доля / распад) ячеек. При распаде людей ~1.6% за такт это около
 *  пяти ячеек, то есть под сотню клеток мира — этаж целиком. */
const MACRO_SPREAD = 0.5;
const MACRO_DIAG = Math.SQRT1_2;
const MACRO_NEIGHBOR_SUM = 4 + 4 * MACRO_DIAG;
/** Ниже этого значение считается нулём: на плавающем ярусе округлять нечем,
 *  а бесконечный хвост тратил бы проход впустую. */
const MACRO_EPSILON = 1e-4;

const DIR_DX: readonly number[] = [1, -1, 0, 0, 1, 1, -1, -1];
const DIR_DY: readonly number[] = [0, 0, 1, -1, 1, -1, 1, -1];

let planes: Float32Array | null = null;
let scratch: Float32Array | null = null;
/** Доля проходимых клеток в ячейке, 0..1. Запекается вместе с этажом: сквозь
 *  сплошной бетон стратегия течь не должна, иначе хищник ломится в стену. */
let passable: Float32Array | null = null;

/**
 * ПРЕДСТАВИТЕЛЬ ячейки: ближайшая к её центру ПРОХОДИМАЯ клетка мира, `-1` у
 * глухой ячейки.
 *
 * Раньше цель яруса была геометрическим центром ячейки, а сторожем — только
 * «в ячейке есть хоть одна не-стена». Замерено: центр попадает в стену на 61%
 * ячеек жилого этажа и на 99.7% квартир — там шаг сетки квартир совпал с шагом
 * яруса, и стратегический ярус был мёртв целиком. Комментарий «точку внутри
 * уточнит маршрут» не соответствовал делу: поиск пути на непроходимой цели
 * возвращает пустой путь, и драйв молча падал.
 *
 * Считается тем же проходом, что и проходимость: своей цены у этого нет.
 */
let representative: Int32Array | null = null;
let channelCount = 0;

function macroIdx(mx: number, my: number): number {
  return ((my & MACRO_MASK) * MACRO_W) + (mx & MACRO_MASK);
}

/**
 * Запечь ярус под этаж: проходимость ячеек и чистые плоскости.
 * O(W²) внутри — звать только с пути загрузки этажа или после сшивки самосбора.
 */
export function bakeMacroFields(world: World, channels: number): void {
  channelCount = channels;
  const pass = passable ?? (passable = new Float32Array(MACRO_PLANE));
  pass.fill(0);
  const cells = world.cells;
  for (let y = 0; y < W; y++) {
    const row = (y >> MACRO_SHIFT) * MACRO_W;
    for (let x = 0; x < W; x++) {
      if (cells[world.idx(x, y)] !== Cell.WALL) pass[row + (x >> MACRO_SHIFT)]++;
    }
  }
  for (let i = 0; i < MACRO_PLANE; i++) pass[i] /= MACRO_CELLS;

  /* Представитель ячейки — та её проходимая клетка, что ближе всех к центру.
   * Меряем в КВАДРАТЕ расстояния до центра: корень тут ничего не решает. */
  const rep = representative ?? (representative = new Int32Array(MACRO_PLANE));
  rep.fill(-1);
  const bestD2 = new Int32Array(MACRO_PLANE).fill(0x7fffffff);
  const half = 1 << (MACRO_SHIFT - 1);
  for (let y = 0; y < W; y++) {
    const my = y >> MACRO_SHIFT;
    const row = my * MACRO_W;
    const dy = (y & (MACRO_CELLS_PER_SIDE - 1)) - half;
    for (let x = 0; x < W; x++) {
      const i = world.idx(x, y);
      if (cells[i] === Cell.WALL) continue;
      const mi = row + (x >> MACRO_SHIFT);
      const dx = (x & (MACRO_CELLS_PER_SIDE - 1)) - half;
      const d2 = dx * dx + dy * dy;
      if (d2 >= bestD2[mi]) continue;
      bestD2[mi] = d2;
      rep[mi] = i;
    }
  }
  planes = new Float32Array(channels * MACRO_PLANE);
  scratch = new Float32Array(channels * MACRO_PLANE);
}

/** Только для тестов и смены этажа. */
export function resetMacroFields(): void {
  representative?.fill(-1);
  planes?.fill(0);
  scratch?.fill(0);
  channelCount = 0;
}

/** Долить в ярус. Зовётся из общего депозита канала, продюсерам про ярусы
 *  знать не нужно. */
export function depositMacro(world: World, ch: number, x: number, y: number, amount: number): void {
  if (!planes || ch >= channelCount) return;
  const mx = world.wrap(Math.floor(x)) >> MACRO_SHIFT;
  const my = world.wrap(Math.floor(y)) >> MACRO_SHIFT;
  planes[ch * MACRO_PLANE + macroIdx(mx, my)] += amount;
}

/**
 * Один такт яруса ОДНОГО канала: распад плюс размытие по проходимости.
 * `decay` — множитель канала за такт, приходит от владельца шкалы затухания,
 * чтобы ярусы старели согласованно и здесь не заводилось второй таблицы тюнинга.
 *
 * По каналу, а не по всем сразу, потому что такт полей размазан по кадрам
 * (`./index`): каналы не пересекаются ни одной ячейкой — каждый пишет только в
 * свой срез `base + mi`, — поэтому разбиение общего прохода на пять посильных
 * ровно то же самое поле и даёт.
 */
export function updateMacroChannel(ch: number, decay: number): void {
  const plane = planes;
  const next = scratch;
  const pass = passable;
  if (!plane || !next || !pass || ch >= channelCount) return;
  const base = ch * MACRO_PLANE;
  next.fill(0, base, base + MACRO_PLANE);

  for (let my = 0; my < MACRO_W; my++) {
    for (let mx = 0; mx < MACRO_W; mx++) {
      const mi = macroIdx(mx, my);
      const v = plane[base + mi] * decay;
      if (v <= MACRO_EPSILON) continue;
      if (pass[mi] <= 0) { next[base + mi] += v; continue; }

      // Доля, ушедшая соседу, взвешена ЕГО проходимостью: глухая ячейка не
      // принимает, и невыданный остаток честно остаётся на месте, а не
      // исчезает — иначе поле утекало бы вдоль стен.
      let sent = 0;
      for (let k = 0; k < 8; k++) {
        const ni = macroIdx(mx + DIR_DX[k], my + DIR_DY[k]);
        const w = (k < 4 ? 1 : MACRO_DIAG) / MACRO_NEIGHBOR_SUM;
        const share = v * MACRO_SPREAD * w * pass[ni];
        if (share <= 0) continue;
        next[base + ni] += share;
        sent += share;
      }
      next[base + mi] += v - sent;
    }
  }
  plane.set(next.subarray(base, base + MACRO_PLANE), base);
}

/**
 * Значение яруса под точкой, приведённое к той же шкале 0..255, что и
 * поклеточный ярус, — чтобы формулы драйвов не различали ярусы.
 */
export function macroAt(world: World, ch: number, x: number, y: number): number {
  if (!planes || ch >= channelCount) return 0;
  const mx = world.wrap(Math.floor(x)) >> MACRO_SHIFT;
  const my = world.wrap(Math.floor(y)) >> MACRO_SHIFT;
  const v = planes[ch * MACRO_PLANE + macroIdx(mx, my)];
  return v >= 255 ? 255 : v;
}

/**
 * Куда идти по ярусу: центр соседней ячейки, где значение выше (`sign > 0`) или
 * ниже (`sign < 0`) текущей. Возвращает индекс клетки мира — это ЦЕЛЬ ДЛЯ
 * МАРШРУТА, а не соседняя клетка: дорогу до неё прокладывает поиск пути. Склона
 * нет — возвращает −1, и драйв обязан честно промолчать.
 */
export function macroTargetCell(
  world: World, ch: number, x: number, y: number, sign: number,
): number {
  const plane = planes;
  const pass = passable;
  if (!plane || !pass || ch >= channelCount) return -1;
  const base = ch * MACRO_PLANE;
  const mx = world.wrap(Math.floor(x)) >> MACRO_SHIFT;
  const my = world.wrap(Math.floor(y)) >> MACRO_SHIFT;

  let bestVal = plane[base + macroIdx(mx, my)];
  let bestMx = -1;
  let bestMy = -1;
  for (let k = 0; k < 8; k++) {
    const nx = mx + DIR_DX[k];
    const ny = my + DIR_DY[k];
    const mi = macroIdx(nx, ny);
    if (pass[mi] <= 0) continue;
    const v = plane[base + mi];
    if (sign > 0 ? v > bestVal : v < bestVal) { bestVal = v; bestMx = nx; bestMy = ny; }
  }
  if (bestMx < 0) return -1;
  /* Отдаём ПРЕДСТАВИТЕЛЯ ячейки, а не её геометрический центр: центр в шести
   * случаях из десяти лежит в бетоне, и цель туда — это молча упавший драйв. */
  return representative?.[macroIdx(bestMx, bestMy)] ?? -1;
}
