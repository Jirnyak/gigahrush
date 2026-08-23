import { World } from '../../core/world';
import { W } from '../../core/types';
import {
  FieldChannel,
  FIELD_PLANE,
  FIELD_TICK_SECONDS,
  DYNAMIC_FIELD_COUNT,
  FIELD_DIR_DX,
  FIELD_DIR_DY,
  FIELD_DIAG_COMP_A,
  FIELD_DIAG_COMP_B,
  FIELD_ORTH_SHARE,
  FIELD_DIAG_SHARE,
  fieldBlocked,
  fieldFade,
  fieldDiffusion,
  fieldBoxMinX,
  fieldBoxMinY,
  fieldBoxMaxX,
  fieldBoxMaxY,
  setFieldBox,
  resetFieldBoxes,
  bumpFieldVersion,
} from './channels';
import { bakeOpennessField } from './openness';
import {
  bakeMacroFields,
  depositMacro,
  macroAt,
  macroTargetCell,
  resetMacroFields,
  updateMacroFields,
} from './macro';
import { depositField as depositCell } from './channels';

export {
  FieldChannel,
  FIELD_PLANE,
  FIELD_TICK_SECONDS,
  DYNAMIC_FIELD_COUNT,
  FIELD_VALUE_MAX,
  FIELD_DEPOSIT_STRIDE_MASK,
  FIELD_PRESENCE_DEPOSIT,
  FIELD_SCENT_DEPOSIT,
  fieldAt,
  fieldCellX,
  fieldCellY,
  fieldGradientStep,
  fieldVersion,
  markFieldCell,
} from './channels';
export { bakeOpennessField } from './openness';
export { MACRO_SHIFT, MACRO_W } from './macro';

/**
 * Многоканальный движок полей восприятия.
 *
 * Один общий проход на все динамические каналы, каданс 2 Гц, работа ограничена
 * рамкой активных клеток на канал. Диффузия 8-связная (диагональ весит 1/√2),
 * не проходит сквозь стены и закрытые двери и не срезает сомкнутый угол.
 *
 * Поля НЕ сериализуются: сейв хранит активный этаж, игрока и дельту макро-
 * популяции. Динамические каналы приходят на новый этаж пустыми, статический
 * просвет запекается заново — см. `world.perceptionBaked`.
 */

/* ── Два яруса одного поля ─────────────────────────────────────────
 * Поклеточный ярус — тактика: что под ногами. Стратегический (`./macro`) —
 * дальность: байт не носит градиент дальше двух клеток, это измерено. Оба
 * наполняются ОДНИМ депозитом, поэтому продюсеру про ярусы знать не нужно.
 * Связывает их эта точка сборки: обратное ребро из `channels` в `macro`
 * замкнуло бы цикл импортов, а запаса по циклам нет. */

/** Множитель распада на такт для стратегического яруса выводится из
 *  поклеточного затухания канала: второй таблицы тюнинга здесь не заводится. */
const MACRO_DECAYS: readonly number[] = Array.from(
  { length: DYNAMIC_FIELD_COUNT },
  (_, ch) => 1 - fieldFade(ch) / 256,
);

/** Долить в канал. Единственная точка входа для продюсеров: попадает сразу в
 *  оба яруса. */
export function depositField(
  world: World, ch: FieldChannel, x: number, y: number, amount: number,
): void {
  depositCell(world, ch, x, y, amount);
  const add = Math.round(amount);
  if (add > 0 && ch < DYNAMIC_FIELD_COUNT) depositMacro(world, ch, x, y, add);
}

/** Выстрел, крик, взрыв, вышибленная дверь. */
export function depositNoise(world: World, x: number, y: number, amount: number): void {
  depositField(world, FieldChannel.NOISE, x, y, amount);
}
/** Живой человек в своей клетке. */
export function depositPeople(world: World, x: number, y: number, amount: number): void {
  depositField(world, FieldChannel.PEOPLE, x, y, amount);
}
/** Монстр в своей клетке. */
export function depositBeasts(world: World, x: number, y: number, amount: number): void {
  depositField(world, FieldChannel.BEASTS, x, y, amount);
}
/** «Здесь кто-то прошёл»: долгий след под ногами. */
export function depositScent(world: World, x: number, y: number, amount: number): void {
  depositField(world, FieldChannel.SCENT, x, y, amount);
}
/** Кровь и смерть. */
export function depositDanger(world: World, x: number, y: number, amount: number): void {
  depositField(world, FieldChannel.DANGER, x, y, amount);
}

/**
 * Значение стратегического яруса под точкой, в той же шкале 0..255, что и
 * поклеточный: формулы драйвов ярусы не различают.
 */
export function fieldMacroAt(world: World, ch: FieldChannel, x: number, y: number): number {
  return macroAt(world, ch, x, y);
}

/**
 * Дальняя цель по градиенту: центр соседней ячейки яруса вверх (`sign > 0`) или
 * вниз (`sign < 0`) по каналу. Возвращает клетку мира — это ЦЕЛЬ ДЛЯ МАРШРУТА,
 * а не соседняя клетка; дорогу прокладывает поиск пути. Склона нет — вернёт −1.
 */
export function fieldMacroTargetCell(
  world: World, ch: FieldChannel, x: number, y: number, sign: number,
): number {
  return macroTargetCell(world, ch, x, y, sign);
}

/** Один общий буфер записи на все каналы: каналы считаются последовательно,
 *  и каждый чистит перед собой ровно свою рамку. */
let scratch: Uint8Array | null = null;
let tickCounter = 0;

/** Рамка, которую собирает текущий проход. Модульная, чтобы поливалка соседей
 *  не была замыканием: в горячем пути аллокаций быть не должно. */
let boxMinX = W;
let boxMinY = W;
let boxMaxX = -1;
let boxMaxY = -1;
const orthBlocked = new Uint8Array(4);

function ensureScratch(): Uint8Array {
  if (!scratch) scratch = new Uint8Array(FIELD_PLANE);
  return scratch;
}

function growBox(x: number, y: number): void {
  if (x < boxMinX) boxMinX = x;
  if (x > boxMaxX) boxMaxX = x;
  if (y < boxMinY) boxMinY = y;
  if (y > boxMaxY) boxMaxY = y;
}

function pour(next: Uint8Array, ni: number, nx: number, ny: number, amount: number): void {
  const acc = next[ni] + amount;
  next[ni] = acc > 255 ? 255 : acc;
  growBox(nx, ny);
}

/** Координаты здесь НЕ оборачиваются: рамка живёт в развёрнутом пространстве,
 *  а `world.idx` сам маскирует индекс — так шов тора не рвётся. */
function spread(
  world: World, next: Uint8Array, cx: number, cy: number, orth: number, diag: number,
): void {
  for (let k = 0; k < 4; k++) {
    const nx = cx + FIELD_DIR_DX[k];
    const ny = cy + FIELD_DIR_DY[k];
    const ni = world.idx(nx, ny);
    orthBlocked[k] = fieldBlocked(world, ni) ? 1 : 0;
    // В перекрытую клетку значение всё же кладётся — оно там и умрёт, потому что
    // перекрытая клетка сама уже не растекается. Так кровь метит стену, а сквозь
    // стену поле не проходит.
    if (orth > 0) pour(next, ni, nx, ny, orth);
  }
  if (diag <= 0) return;
  for (let k = 4; k < 8; k++) {
    const d = k - 4;
    if (orthBlocked[FIELD_DIAG_COMP_A[d]] !== 0 || orthBlocked[FIELD_DIAG_COMP_B[d]] !== 0) continue;
    const nx = cx + FIELD_DIR_DX[k];
    const ny = cy + FIELD_DIR_DY[k];
    pour(next, world.idx(nx, ny), nx, ny, diag);
  }
}

function updateChannel(world: World, ch: FieldChannel): void {
  const minX = fieldBoxMinX(ch);
  const minY = fieldBoxMinY(ch);
  const maxX = fieldBoxMaxX(ch);
  const maxY = fieldBoxMaxY(ch);
  if (maxX < minX || maxY < minY) return; // канал спит — ни одного байта работы

  const plane = world.perceptionFields;
  const base = ch * FIELD_PLANE;
  const next = ensureScratch();
  const fade = fieldFade(ch);
  const diffusion = fieldDiffusion(ch);

  // Буфер записи общий на все каналы, поэтому чистим ровно свою рамку — она же
  // накрывает и всё, что этот проход может записать (рамка растянута на клетку).
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) next[world.idx(cx, cy)] = 0;
  }

  boxMinX = W; boxMinY = W; boxMaxX = -1; boxMaxY = -1;
  let active = 0;

  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const i = world.idx(cx, cy);
      const val = plane[base + i];
      if (val === 0) continue;
      active++;
      const decayed = val - fade;
      if (decayed <= 0) continue;
      growBox(cx, cy);

      if (fieldBlocked(world, i)) {
        if (decayed > next[i]) next[i] = decayed;
        continue;
      }

      const budget = decayed * diffusion;
      const orth = (budget * FIELD_ORTH_SHARE) | 0;
      const diag = (budget * FIELD_DIAG_SHARE) | 0;
      const retained = next[i] + decayed - orth * 4 - diag * 4;
      next[i] = retained > 255 ? 255 : retained;
      if (orth > 0 || diag > 0) spread(world, next, cx, cy, orth, diag);
    }
  }

  if (active === 0) {
    setFieldBox(ch, W, W, -1, -1);
    return;
  }

  bumpFieldVersion(ch);
  // Обратно — по той же рамке, что чистили: она накрывает и все записи прохода,
  // и клетки, догоревшие до нуля, которые иначе остались бы висеть навсегда.
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const i = world.idx(cx, cy);
      plane[base + i] = next[i];
    }
  }

  if (boxMaxX < 0) {
    setFieldBox(ch, W, W, -1, -1);
    return;
  }
  // Запас на клетку: за следующий тик значение уйдёт ровно на соседей, и место
  // их записи обязано быть внутри рамки — её же чистит следующий проход.
  let nMinX = boxMinX - 1;
  let nMinY = boxMinY - 1;
  let nMaxX = boxMaxX + 1;
  let nMaxY = boxMaxY + 1;
  // Развёрнутая рамка не имеет права перерасти мир: дальше она начала бы
  // обходить одни и те же клетки по нескольку раз.
  if (nMaxX - nMinX > W - 1) { nMinX = 0; nMaxX = W - 1; }
  if (nMaxY - nMinY > W - 1) { nMinY = 0; nMaxY = W - 1; }
  setFieldBox(ch, nMinX, nMinY, nMaxX, nMaxY);
}

/**
 * Подготовить поля к этажу: запечь статический просвет и обнулить рамки.
 * Идемпотентна. O(W²) внутри — звать только с пути загрузки этажа или после
 * сшивки самосбора, никогда в кадре симуляции.
 */
export function prewarmPerceptionFields(world: World): void {
  if (world.perceptionBaked) return;
  // Динамические каналы этаж не наследует: сейв их не хранит, и значение без
  // рамки всё равно не затухало бы. Обнуляем ДО отметки о запекании, чтобы
  // депозиты, сделанные после прогрева, пережили его.
  world.perceptionFields.fill(0, 0, DYNAMIC_FIELD_COUNT * FIELD_PLANE);
  resetFieldBoxes();
  ensureScratch().fill(0); // в буфере лежит мусор прошлого этажа
  bakeOpennessField(world);
  bakeMacroFields(world, DYNAMIC_FIELD_COUNT);
  world.perceptionBaked = true;
}

/**
 * Один такт всех полей. Ленивая подготовка внутри: этаж, который никто не
 * прогрел явно, запечётся на первом же вызове (тот же контракт, что у
 * `ensureNavigationTree`). Правка геометрии в рантайме просвет НЕ перепекает —
 * принимаем устаревшее значение, как это делает навигация.
 */
export function updatePerceptionFields(world: World, dt: number): void {
  prewarmPerceptionFields(world);
  tickCounter += dt;
  if (tickCounter < FIELD_TICK_SECONDS) return;
  tickCounter -= FIELD_TICK_SECONDS;
  for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) updateChannel(world, ch);
  updateMacroFields(MACRO_DECAYS);
}

/** Только для тестов: сбросить рамки, буфер записи и накопленный такт. */
export function resetPerceptionFieldsState(): void {
  tickCounter = 0;
  resetFieldBoxes();
  scratch?.fill(0);
  resetMacroFields();
}
