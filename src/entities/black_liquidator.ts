/* -- Черный ликвидатор: выглядит как свой ----------------------------
 *
 * Всё свойство вида — внешность. Спрайт берётся у настоящего ликвидатора
 * (арт художника, запечённый в `generated_art_sprites`), и поверх него
 * процедурно ставится меловой номер на маску. По канону слухов чёрных и
 * отличают именно так: «у чёрных номера на масках мелом, не краской».
 *
 * Номер мелкий: издали он сливается с маской, вблизи читается.
 *
 * Режима два, и оба живут здесь: пока рядом есть свидетели, он ходит чужой
 * формой; оставшись с жертвой один на один — или получив по себе — сбрасывает
 * маскировку и показывает то, чем является. Различает режимы существующее поле
 * `monsterStage`, ровно как у головной слизи; своих полей в `AIState` вид не
 * заводит, на выходе обычный процедурный спрайт общего пайплайна.
 */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../core/pixutil';
import { firstPartyNpcArt } from './npc_visuals';
import { seededRandom } from '../core/rand';

export const DEF: MonsterDef = {
  kind: MonsterKind.BLACK_LIQUIDATOR,
  name: 'Черный ликвидатор',
  hp: 92,
  speed: 1.22,
  dmg: 15,
  attackRate: 1.8,
  reach: 1.35,
  sprite: 0,
  aiFlags: ['looksLiquidator'],
  counterplay: 'Не верьте обходу после тяжелого отбоя: держите дистанцию, прячьте образцы и сверяйте номер маски до открытия двери.',
  lootHint: 'обугленная бирка, мел с номером, черный крюк из инструментальной сумки',
};

function put(t: Uint32Array, x: number, y: number, c: number): void {
  if (x >= 0 && x < S && y >= 0 && y < S) t[y * S + x] = c;
}

function rect(t: Uint32Array, x0: number, y0: number, w: number, h: number, c: number): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) put(t, x, y, c);
  }
}

function line(t: Uint32Array, x0: number, y0: number, x1: number, y1: number, c: number): void {
  const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / steps);
    const y = Math.round(y0 + (y1 - y0) * i / steps);
    put(t, x, y, c);
  }
}

function ellipse(t: Uint32Array, cx: number, cy: number, rx: number, ry: number, c: number): void {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / Math.max(1, rx);
      const dy = (y - cy) / Math.max(1, ry);
      if (dx * dx + dy * dy <= 1) put(t, x, y, c);
    }
  }
}

export function generateBlackLiquidatorSprite(seed = 0): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = 31 + Math.floor(noise(seed, 4, 50_800) * 3);
  const heightShift = Math.floor(noise(seed, 7, 50_801) * 5) - 2;
  const shoulder = 8 + Math.floor(noise(seed, 9, 50_802) * 3);
  const coatTop = 18 + heightShift;
  const coatBot = 56 + Math.max(0, heightShift);
  const coat = rgba(18, 19, 21);
  const coat2 = rgba(28, 29, 31);
  const rubber = rgba(6, 7, 8);
  const chalk = rgba(226, 224, 205);
  const oldSeal = rgba(94, 26, 24);

  for (let y = 8 + heightShift; y < 18 + heightShift; y++) {
    const ry = (y - (13 + heightShift)) / 6;
    for (let x = cx - 6; x <= cx + 6; x++) {
      const rx = (x - cx) / 6;
      if (rx * rx + ry * ry < 1) put(t, x, y, rubber);
    }
  }

  for (let y = coatTop; y < coatBot; y++) {
    const taper = y < 30 ? 0 : Math.floor((y - 30) * 0.18);
    const sway = Math.floor((noise(y, seed, 50_803) - 0.5) * 2);
    const half = shoulder - Math.floor(Math.max(0, y - 40) * 0.08) + taper;
    for (let x = cx - half + sway; x <= cx + half + sway; x++) {
      const n = Math.floor(noise(x, y, 50_804 + seed) * 18);
      put(t, x, y, (x + y + seed) % 5 === 0
        ? rgba(clamp(22 + n), clamp(22 + n), clamp(24 + n))
        : coat);
    }
  }

  rect(t, cx - shoulder - 4, coatTop + 2, 5, 25, coat2);
  rect(t, cx + shoulder, coatTop + 1, 5, 26, coat2);
  for (let y = coatTop + 25; y < coatBot + 4; y++) {
    put(t, cx - 5, y, coat2);
    put(t, cx + 5, y, coat2);
  }

  ellipse(t, cx, 12 + heightShift, 5, 5, rgba(13, 14, 15));
  ellipse(t, cx - 2, 12 + heightShift, 2, 2, rgba(22, 0, 0));
  ellipse(t, cx + 3, 12 + heightShift, 2, 2, rgba(120, 18, 16));
  put(t, cx + 3, 12 + heightShift, rgba(235, 42, 32));
  rect(t, cx - 2, 16 + heightShift, 5, 3, rubber);
  rect(t, cx + 6, 15 + heightShift, 3, 7, rubber);

  const number = 1 + Math.floor(noise(seed, 11, 50_805) * 12);
  const ny = 25 + heightShift;
  if (number >= 10) rect(t, cx - 6, ny, 1, 5, chalk);
  const digitX = number >= 10 ? cx - 2 : cx - 4;
  const digit = number % 10;
  if (digit === 0 || digit === 6 || digit === 8 || digit === 9) {
    rect(t, digitX, ny, 4, 1, chalk);
    rect(t, digitX, ny + 4, 4, 1, chalk);
    put(t, digitX, ny + 1, chalk);
    put(t, digitX, ny + 2, chalk);
    put(t, digitX + 3, ny + 1, chalk);
    put(t, digitX + 3, ny + 2, chalk);
  } else if (digit === 1) {
    rect(t, digitX + 2, ny, 1, 5, chalk);
  } else if (digit === 2 || digit === 3) {
    rect(t, digitX, ny, 4, 1, chalk);
    rect(t, digitX, ny + 2, 4, 1, chalk);
    rect(t, digitX, ny + 4, 4, 1, chalk);
    put(t, digitX + 3, ny + 1, chalk);
    put(t, digit === 2 ? digitX : digitX + 3, ny + 3, chalk);
  } else {
    rect(t, digitX, ny + 2, 4, 1, chalk);
    put(t, digitX, ny, chalk);
    put(t, digitX, ny + 1, chalk);
    put(t, digitX + 3, ny, chalk);
    put(t, digitX + 3, ny + 1, chalk);
    if (digit === 5) {
      rect(t, digitX, ny, 4, 1, chalk);
      rect(t, digitX, ny + 4, 4, 1, chalk);
    }
  }

  rect(t, cx - shoulder - 6, coatTop + 7, 4, 3, oldSeal);
  put(t, cx - shoulder - 4, coatTop + 8, chalk);
  line(t, cx + shoulder + 4, coatTop + 18, cx + shoulder + 10, coatTop + 33, rgba(10, 10, 11));
  line(t, cx + shoulder + 10, coatTop + 33, cx + shoulder + 6, coatTop + 37, rgba(5, 5, 6));
  rect(t, cx + shoulder + 5, coatTop + 21, 6, 12, rgba(16, 15, 14));
  line(t, cx - shoulder - 3, coatTop + 4, cx - shoulder - 8, coatTop + 22, rgba(8, 8, 9));

  return t;
}

/** Арты настоящих ликвидаторов: чёрный неотличим от них, пока не разглядишь мел. */
const LIQUIDATOR_ART_IDS = ['liquidator_m_1', 'liquidator_m_3', 'liquidator_m_5', 'liquidator_m_6'] as const;
const ART_SIDE = 128;
/** Меловой номер: две-три цифры мелким штрихом на уровне маски. */
const CHALK = rgba(226, 224, 214, 220);

/** Одна меловая палочка. Мел ложится неровно, поэтому пиксели через один пропускаются. */
function chalkStroke(t: Uint32Array, x0: number, y0: number, x1: number, y1: number, rand: () => number): void {
  const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    if (rand() < 0.22) continue;
    const x = Math.round(x0 + (x1 - x0) * i / steps);
    const y = Math.round(y0 + (y1 - y0) * i / steps);
    if (x >= 0 && x < ART_SIDE && y >= 0 && y < ART_SIDE) t[y * ART_SIDE + x] = CHALK;
  }
}

/** Цифра-палочка 3x5 в семисегментной раскладке: мельче уже не читается. */
function chalkDigit(t: Uint32Array, x: number, y: number, digit: number, rand: () => number): void {
  const segs = [
    [0b1110111, 0b0100100, 0b1011101, 0b1101101, 0b0101110, 0b1101011, 0b1111011, 0b0100101, 0b1111111, 0b1101111][digit],
  ][0];
  if (segs & 0b0000001) chalkStroke(t, x, y, x + 2, y, rand);
  if (segs & 0b0000010) chalkStroke(t, x, y, x, y + 2, rand);
  if (segs & 0b0000100) chalkStroke(t, x + 2, y, x + 2, y + 2, rand);
  if (segs & 0b0001000) chalkStroke(t, x, y + 2, x + 2, y + 2, rand);
  if (segs & 0b0010000) chalkStroke(t, x, y + 2, x, y + 4, rand);
  if (segs & 0b0100000) chalkStroke(t, x + 2, y + 2, x + 2, y + 4, rand);
  if (segs & 0b1000000) chalkStroke(t, x, y + 4, x + 2, y + 4, rand);
}

/**
 * Спрайт: арт живого ликвидатора плюс меловой номер на маске.
 * Если арт почему-то не запечён, остаётся прежний полностью рисованный силуэт —
 * вид не должен исчезать из-за отсутствующего ассета.
 */
/** Маскировка сброшена: под формой был он. */
export const BLACK_LIQUIDATOR_REVEALED_STAGE = 1;

/** Спрайт без маскировки — тот самый чёрный силуэт. */
export function generateRevealedSprite(seed = 0): Uint32Array {
  return generateBlackLiquidatorSprite(seed);
}

export function generateSprite(seed = 0): Uint32Array {
  const rand = seededRandom(seed || 1);
  const artId = LIQUIDATOR_ART_IDS[Math.floor(rand() * LIQUIDATOR_ART_IDS.length) % LIQUIDATOR_ART_IDS.length];
  const art = firstPartyNpcArt(artId);
  if (!art) return generateBlackLiquidatorSprite(seed);

  const t = art.slice();
  // Маска сидит в верхней трети арта; номер ставится сбоку от неё, как пометка
  // смены, а не как надпись по центру лица.
  const maskY = Math.round(ART_SIDE * 0.30) + Math.floor(rand() * 3);
  let x = Math.round(ART_SIDE * 0.44) + Math.floor(rand() * 3);
  const digits = 2 + (rand() < 0.4 ? 1 : 0);
  for (let i = 0; i < digits; i++) {
    chalkDigit(t, x, maskY, Math.floor(rand() * 10), rand);
    x += 4;
  }
  return t;
}
