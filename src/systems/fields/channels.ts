import { World, PERCEPTION_CHANNEL_COUNT } from '../../core/world';
import { W, Cell, DoorState } from '../../core/types';

/**
 * Слой полей восприятия.
 *
 * Закон: актор решает по тому, что читается в ЕГО клетке. Всё глобальное знание
 * доставляется полями, а драйв — это пара (канал, знак): идти вверх или вниз по
 * градиенту. Ни один потребитель поля не имеет права перебирать коллекцию
 * сущностей, чтобы узнать то, что уже написано в клетке.
 *
 * Хранилище — `world.perceptionFields`: PERCEPTION_CHANNEL_COUNT плоскостей
 * W×W подряд, по байту на клетку. Плоскость 0 — исторический `dangerField`,
 * и он остаётся её живым представлением (`subarray`), поэтому старые писатели
 * крови продолжают работать без правок.
 */
export const enum FieldChannel {
  /** Кровь и смерть. Импульс кладёт `blood_fx`, читает падальщик. */
  DANGER = 0,
  /** Выстрелы, крики, взрывы, вышибленные двери. Затухание — секунды. */
  NOISE = 1,
  /** Плотность живых людей. */
  PEOPLE = 2,
  /** Плотность монстров. */
  BEASTS = 3,
  /** След «кто здесь проходил»: долгий, почти без расплывания. */
  SCENT = 4,
  /** СТАТИЧЕСКОЕ поле просвета: 0 — глухой угол/чокпойнт, 255 — простор.
   *  Запекается один раз на загрузку этажа и не участвует в диффузии. */
  OPENNESS = 5,
}

/** Клеток в одной плоскости канала. */
export const FIELD_PLANE = W * W;

/** Динамические каналы идут подряд ПЕРЕД статическим OPENNESS, поэтому их
 *  количество — это и есть его индекс. Отдельной ручки для этого не заводим. */
export const DYNAMIC_FIELD_COUNT = FieldChannel.OPENNESS;

if (PERCEPTION_CHANNEL_COUNT !== FieldChannel.OPENNESS + 1) {
  throw new Error('perception field channel count out of sync with core/world');
}

/** Каданс всех полей: 2 Гц. Тот же, на котором жило поле крови. */
export const FIELD_TICK_SECONDS = 0.5;

/** Затухание канала DANGER за тик — каноническая шкала, из которой выводятся
 *  остальные. 255 → 0 примерно за 64 с. */
const FADE_RATE = 2;

/** Доля значения клетки, уходящая соседям за тик, для канала DANGER. */
const DIFFUSION = 0.25;

/** Убыль за тик по каналам. Всё выведено из FADE_RATE:
 *  шум ×16 (≈4 с), люди и звери ×2 (≈32 с), след ÷2 (≈128 с). */
const CHANNEL_FADE: readonly number[] = [
  FADE_RATE,
  FADE_RATE * 16,
  FADE_RATE * 2,
  FADE_RATE * 2,
  FADE_RATE >> 1,
];

/** Доля, растекающаяся по соседям. У следа расплывания нет по определению:
 *  это след, а не облако. */
const CHANNEL_DIFFUSION: readonly number[] = [
  DIFFUSION,
  DIFFUSION * 2,
  DIFFUSION,
  DIFFUSION,
  0,
];

/** Потолок значения в клетке. Плоскость байтовая, и продюсеры нормируют свою
 *  амплитуду на этот предел, а не на собственную шкалу. */
export const FIELD_VALUE_MAX = 255;

/* ── Амплитуды продюсеров ────────────────────────────────────────────────── */

/**
 * Страйд депозита присутствия: каждый 16-й кадр на актора, фаза берётся из id.
 *
 * Без страйда депозит на 60 Гц насыщает байт до 255 за долю секунды, и канал
 * перестаёт нести градиент: он обязан отвечать «насколько здесь людно», а не
 * «сколько кадров подряд тут вообще кто-то стоял».
 */
export const FIELD_DEPOSIT_STRIDE_MASK = 15;

/**
 * Вклад одного актора в PEOPLE/BEASTS за страйд. Выведен из собственной убыли
 * этих каналов: вклад стоит двух тиков затухания клетки, поэтому одиночка
 * держит клетку в нижней части байта, а плотная группа её насыщает — ровно то
 * различие, ради которого канал и заведён.
 */
export const FIELD_PRESENCE_DEPOSIT = CHANNEL_FADE[FieldChannel.PEOPLE] * 2;

/**
 * Отпечаток одного шага в SCENT. Расплывания у следа нет по определению, так
 * что вклад живёт ровно FIELD_SCENT_DEPOSIT / fade тиков — около четверти
 * минуты на клетку, и повторные проходы по той же клетке накапливаются.
 */
export const FIELD_SCENT_DEPOSIT = CHANNEL_FADE[FieldChannel.SCENT] * 32;

/**
 * Изотропная 8-связная окрестность. Первые четыре направления — ортогональные,
 * последние четыре — диагональные с весом 1/√2: 4-связная диффузия расползается
 * ромбом, а мир у нас изотропный.
 */
export const FIELD_DIR_DX: readonly number[] = [1, -1, 0, 0, 1, 1, -1, -1];
export const FIELD_DIR_DY: readonly number[] = [0, 0, 1, -1, 1, -1, 1, -1];

/** Ортогональные составляющие диагонали k (индексы в FIELD_DIR_*), чтобы
 *  запретить срез угла: через сомкнутый угол не течёт ни звук, ни запах. */
export const FIELD_DIAG_COMP_A: readonly number[] = [0, 0, 1, 1];
export const FIELD_DIAG_COMP_B: readonly number[] = [2, 3, 2, 3];

const DIAG_WEIGHT = Math.SQRT1_2;
const NEIGHBOR_WEIGHT_SUM = 4 + 4 * DIAG_WEIGHT; // 4 + 2√2
/** Доля общего выброса, приходящаяся на одного ортогонального соседа. */
export const FIELD_ORTH_SHARE = 1 / NEIGHBOR_WEIGHT_SUM;
/** То же для диагонального: ровно в √2 раз меньше. */
export const FIELD_DIAG_SHARE = DIAG_WEIGHT / NEIGHBOR_WEIGHT_SUM;

export function fieldFade(channel: FieldChannel): number {
  return CHANNEL_FADE[channel];
}

export function fieldDiffusion(channel: FieldChannel): number {
  return CHANNEL_DIFFUSION[channel];
}

/**
 * Клетка не пропускает поле: стена, пропасть, шахта лифта или закрытая дверь.
 * Ровно тот же набор, на котором жило поле крови, — поведение не меняем.
 */
export function fieldBlocked(world: World, i: number): boolean {
  const cellId = world.cells[i];
  if (cellId === Cell.WALL || cellId === Cell.ABYSS || cellId === Cell.LIFT) return true;
  if (cellId !== Cell.DOOR) return false;
  const door = world.doors.get(i);
  return !!door && (door.state === DoorState.CLOSED
    || door.state === DoorState.LOCKED
    || door.state === DoorState.HERMETIC_CLOSED);
}

/* ── Рамка активных клеток ───────────────────────────────────────────────── */

/**
 * [minX, minY, maxX, maxY] на канал. Пустая рамка — minX > maxX.
 *
 * Границы НЕ обёрнуты в [0, W): рамка вокруг клетки 0 честно записывается как
 * [-1, 1], а обход разворачивает её через `world.idx`, который сам маскирует
 * координату. Обрезание границ в [0, W-1] превращало бы каждое пятно у шва в
 * рамку во весь мир — и, что хуже, теряло растекание через шов.
 */
const boxes = new Int32Array(DYNAMIC_FIELD_COUNT * 4);
const versions = new Int32Array(PERCEPTION_CHANNEL_COUNT);

export function resetFieldBoxes(): void {
  for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) {
    const b = ch * 4;
    boxes[b] = W;
    boxes[b + 1] = W;
    boxes[b + 2] = -1;
    boxes[b + 3] = -1;
  }
}
resetFieldBoxes();

export function fieldBoxMinX(ch: FieldChannel): number { return boxes[ch * 4]; }
export function fieldBoxMinY(ch: FieldChannel): number { return boxes[ch * 4 + 1]; }
export function fieldBoxMaxX(ch: FieldChannel): number { return boxes[ch * 4 + 2]; }
export function fieldBoxMaxY(ch: FieldChannel): number { return boxes[ch * 4 + 3]; }

export function setFieldBox(
  ch: FieldChannel, minX: number, minY: number, maxX: number, maxY: number,
): void {
  const b = ch * 4;
  boxes[b] = minX;
  boxes[b + 1] = minY;
  boxes[b + 2] = maxX;
  boxes[b + 3] = maxY;
}

/**
 * Единственный протокол записи в поле: кто положил значение — тот обязан
 * назвать клетку. Обновление ходит только по рамке, и без этой отметки свежий
 * импульс на холодном участке никогда бы не затух и не растёкся.
 *
 * Рамка расширяется на клетку вокруг: за тик значение уходит ровно на соседей,
 * и место их записи обязано быть внутри рамки — иначе в скретч-буфер попадёт
 * мусор с прошлых тиков (буфер общий на все каналы и чистится по рамке).
 */
export function markFieldCell(world: World, ch: FieldChannel, cx: number, cy: number): void {
  if (ch >= DYNAMIC_FIELD_COUNT) return;
  versions[ch]++;
  const x = world.wrap(cx);
  const y = world.wrap(cy);
  const b = ch * 4;
  if (x - 1 < boxes[b]) boxes[b] = x - 1;
  if (y - 1 < boxes[b + 1]) boxes[b + 1] = y - 1;
  if (x + 1 > boxes[b + 2]) boxes[b + 2] = x + 1;
  if (y + 1 > boxes[b + 3]) boxes[b + 3] = y + 1;
}

export function bumpFieldVersion(ch: FieldChannel): void {
  versions[ch]++;
}

/** Растёт только когда поле реально переписали: рендер по нему решает, нужна ли
 *  заливка текстуры. Пустое поле не стоит ни одной выгрузки. */
export function fieldVersion(ch: FieldChannel): number {
  return versions[ch];
}

/* ── Чтение O(1) ─────────────────────────────────────────────────────────── */

/** Значение канала в клетке, 0..255. Ядро всех драйвов. */
export function fieldAt(world: World, ch: FieldChannel, x: number, y: number): number {
  return world.perceptionFields[ch * FIELD_PLANE + world.idx(x, y)];
}

/** Разбор клетки, которую вернул `fieldGradientStep`. */
export function fieldCellX(cell: number): number { return cell % W; }
export function fieldCellY(cell: number): number { return (cell / W) | 0; }

const stepBlocked = new Uint8Array(4);

/**
 * Шаг по градиенту канала: соседняя проходимая клетка, где значение строго
 * больше (sign > 0) или строго меньше (sign < 0) текущего. Возвращает индекс
 * клетки (`world.idx`) или -1, если актор уже стоит в локальном экстремуме.
 *
 * Восемь соседей, ни одной аллокации, разрез угла запрещён: по диагонали можно
 * шагнуть только когда обе её ортогональные составляющие проходимы.
 */
export function fieldGradientStep(
  world: World, ch: FieldChannel, x: number, y: number, sign: number,
): number {
  const cx = world.wrap(Math.floor(x));
  const cy = world.wrap(Math.floor(y));
  const base = ch * FIELD_PLANE;
  const plane = world.perceptionFields;
  const up = sign > 0;
  let bestVal = plane[base + world.idx(cx, cy)];
  let bestCell = -1;

  for (let k = 0; k < 4; k++) {
    const nx = world.wrap(cx + FIELD_DIR_DX[k]);
    const ny = world.wrap(cy + FIELD_DIR_DY[k]);
    const blocked = world.solid(nx, ny);
    stepBlocked[k] = blocked ? 1 : 0;
    if (blocked) continue;
    const ni = world.idx(nx, ny);
    const v = plane[base + ni];
    if (up ? v > bestVal : v < bestVal) { bestVal = v; bestCell = ni; }
  }

  for (let k = 4; k < 8; k++) {
    const d = k - 4;
    if (stepBlocked[FIELD_DIAG_COMP_A[d]] !== 0 || stepBlocked[FIELD_DIAG_COMP_B[d]] !== 0) continue;
    const nx = world.wrap(cx + FIELD_DIR_DX[k]);
    const ny = world.wrap(cy + FIELD_DIR_DY[k]);
    if (world.solid(nx, ny)) continue;
    const ni = world.idx(nx, ny);
    const v = plane[base + ni];
    if (up ? v > bestVal : v < bestVal) { bestVal = v; bestCell = ni; }
  }

  return bestCell;
}

/* ── Запись ──────────────────────────────────────────────────────────────── */

/**
 * Долить в канал в клетке. Единственная точка входа для продюсеров: бой, шаги,
 * двери, движение акторов. Насыщается на 255 — поле хранит «насколько», а не
 * «сколько раз».
 */
export function depositField(
  world: World, ch: FieldChannel, x: number, y: number, amount: number,
): void {
  if (ch >= DYNAMIC_FIELD_COUNT) return; // OPENNESS статичен, в него не льют
  const add = Math.round(amount);
  if (!(add > 0)) return;
  const cx = world.wrap(Math.floor(x));
  const cy = world.wrap(Math.floor(y));
  const i = ch * FIELD_PLANE + world.idx(cx, cy);
  const next = world.perceptionFields[i] + add;
  world.perceptionFields[i] = next > 255 ? 255 : next;
  markFieldCell(world, ch, cx, cy);
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

/** Кровь и смерть. Существующие писатели крови пишут в `world.dangerField`
 *  напрямую и зовут `markDangerFieldCell`; это — тот же путь через поле. */
export function depositDanger(world: World, x: number, y: number, amount: number): void {
  depositField(world, FieldChannel.DANGER, x, y, amount);
}
