/**
 * Винтовка: длинный ствол, деревянное цевьё, приклад в плечо.
 *
 * Пакет держит те же четыре правила, что образцовый `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Ствол уходит вверх-влево, ложа завалена вниз-
 *    вправо, видна верхняя грань коробки и скос приклада. Анфас читался куском
 *    трубы на палке.
 * 2. СБОРКА ОТ ЗАТЫЛЬНИКА ПРИКЛАДА. Он упёрт в плечо и в кадре не двигается,
 *    поэтому якорь именно здесь: от него поднимается шейка, на шейке стоит
 *    казна, от казны ствол идёт к объявленному дулу.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина от казны до дула фиксирована; облик
 *    решает лишь, сколько её закрыло цевьё и сколько ствола осталось голым.
 * 4. РУКИ РАСТУТ ИЗ КРАЯ. Правое предплечье уходит в нижний правый угол вместе
 *    с прикладом, левое — вниз от цевья за нижний срез.
 *
 * Признак силуэта — не длина сама по себе, а РАЗНЕСЁННЫЕ руки: левая кисть
 * высоко на цевье, правая внизу на шейке приклада, и между ними тянется голое
 * дерево. Автомат держат кучно, винтовку — врастяжку.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, skinTone } from '../draw';
import { VM } from '../types';

/** Затыльник приклада — якорь сборки. Уходит в нижний правый угол, под полосу HUD. */
const BUTT_X = 112;
const BUTT_Y = 114;
/** Наклон ложи от вертикали: круче ствола, оттого у шейки есть излом. */
const STOCK_T = -0.60;
const STOCK_LEN = 44;
/** Направление ОТ ЗАТЫЛЬНИКА К КАЗНЕ, то есть вверх-влево. */
const UPX = Math.sin(STOCK_T);
const UPY = -Math.cos(STOCK_T);
/** Казна: там ложа встречает ствол. */
const BREECH_X = BUTT_X + UPX * STOCK_LEN;
const BREECH_Y = BUTT_Y + UPY * STOCK_LEN;

/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = 18;
const MUZZLE_Y = 28;

const SPAN_X = MUZZLE_X - BREECH_X;
const SPAN_Y = MUZZLE_Y - BREECH_Y;
const SPAN = Math.hypot(SPAN_X, SPAN_Y);
const AX = SPAN_X / SPAN;
const AY = SPAN_Y / SPAN;

/**
 * Наклонная плашка со скруглёнными торцами и цилиндрической затенкой.
 *
 * Собственный примитив пакета, а не общий: у каждого силуэта своя геометрия, и
 * повтор между пакетами здесь замысел. `tube` из `draw.ts` рисует только по
 * осям и наклонное тело выразить не может.
 */
function slab(
  buf: Uint32Array,
  x: number, y: number, ax: number, ay: number,
  len: number, half: number,
  base: readonly [number, number, number],
  seed: number, wear: number, round = 0,
): void {
  const nx = -ay;
  const ny = ax;
  const pad = Math.ceil(half + 2);
  const x0 = Math.max(0, Math.floor(Math.min(x, x + ax * len) - pad));
  const x1 = Math.min(VM - 1, Math.ceil(Math.max(x, x + ax * len) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(y, y + ay * len) - pad));
  const y1 = Math.min(VM - 1, Math.ceil(Math.max(y, y + ay * len) + pad));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - x;
      const dy = py - y;
      const u = dx * ax + dy * ay;
      const v = dx * nx + dy * ny;
      if (u < -round || u > len + round) continue;
      let w = half;
      if (round > 0) {
        if (u < round) w = half * Math.sqrt(Math.max(0, 1 - ((round - u) / round) ** 2));
        else if (u > len - round) w = half * Math.sqrt(Math.max(0, 1 - ((u - (len - round)) / round) ** 2));
      }
      if (w <= 0 || Math.abs(v) > w) continue;
      /* Свет с одной стороны: блик ближе к левой кромке, тень к правой. Именно
       * это читается как «круглое»; ровная заливка читается наклейкой. */
      const t = v / half;
      const lit = 1.3 - (t + 0.46) * (t + 0.46) * 1.0;
      const n = (noise(px, py, seed) - 0.5) * (10 + wear * 40);
      const rust = wear > 0 && noise(px * 3, py * 3, seed + 7) < wear * 0.3;
      const r = rust ? base[0] * 0.6 + 60 : base[0];
      const g = rust ? base[1] * 0.48 + 28 : base[1];
      const b = rust ? base[2] * 0.42 + 15 : base[2];
      buf[py * VM + px] = rgba(clamp(r * lit + n), clamp(g * lit + n), clamp(b * lit + n));
    }
  }
}

/**
 * Кисть, обхватывающая цилиндр; `ux,uy` — ось того, что держат.
 *
 * Пальцы — отдельные валики ПОПЕРЁК этой оси, и именно они отличают руку от
 * варежки: сплошное телесное пятно читается куском мяса, а не хватом. Между
 * пальцами идёт тёмная щель, иначе они слипаются в одну колбасу.
 */
function fist(
  buf: Uint32Array,
  x: number, y: number, ux: number, uy: number,
  tone: readonly [number, number, number], seed: number,
): void {
  const px = -uy;
  const py = ux;
  const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
  slab(buf, x - ux * 11, y - uy * 11, ux, uy, 24, 11, tone, seed, 0, 5);
  for (let f = 0; f < 4; f++) {
    const u = 5 - f * 6;
    const fx = x + ux * u;
    const fy = y + uy * u;
    const len = 16 - Math.abs(f - 1.4) * 1.4;
    slab(buf, fx - px * 10 + 1, fy - py * 10 + 1.5, px, py, len, 3.4, [26, 18, 16], seed + 11 + f, 0, 2.6);
    slab(buf, fx - px * 10, fy - py * 10, px, py, len, 2.9,
      [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], seed + 21 + f, 0, 2.6);
    // Сустав ловит свет — без него пальцы читаются трубками.
    ellipse(buf, fx - px * 4, fy - py * 4, 2.8, 2.5, flesh(1.2));
  }
  /* Большой палец лежит ВДОЛЬ хвата с ближней стороны. Направление обязано
   * идти по оси хвата: смешав его поровну с поперечной, получаешь палец,
   * торчащий в сторону от кулака отдельной палкой. */
  slab(buf, x + px * 7.5 - ux * 5, y + py * 7.5 - uy * 5,
    ux * 0.95 + px * 0.3, uy * 0.95 + py * 0.3, 16, 3.6,
    [tone[0] * 1.06, tone[1] * 1.01, tone[2] * 0.97], seed + 31, 0, 3);
}

/** Предплечье конусом ЗА указанную точку: рука растёт из кадра, а не висит. */
function forearm(
  buf: Uint32Array,
  x: number, y: number, tx: number, ty: number,
  tone: readonly [number, number, number], r0: number, r1: number,
): void {
  const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.max(1, Math.hypot(dx, dy));
  // Блик по одной кромке конуса: ровный конус читается доской.
  const sx = -dy / d * 5;
  const sy = dx / d * 5;
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = r0 + (r1 - r0) * t;
    ellipse(buf, x + dx * t, y + dy * t, r, r, flesh(0.84 - t * 0.12));
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ellipse(buf, x + sx + dx * t, y + sy + dy * t, 4.6 - t * 1.5, 4 - t * 1.2, flesh(1.05));
  }
}

registerViewmodel({
  id: 'rifle',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 1.35, bob: 0.9, swap: 0.28, flash: 0.06 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));
    const shade = (c: readonly [number, number, number], k: number) =>
      [c[0] * k, c[1] * k, c[2] * k] as const;

    const fire = frame === 'fire';
    const reload = frame === 'reload';
    const shiftX = reload ? 4 : 0;
    const shiftY = reload ? 9 : 0;
    const bx0 = BUTT_X + shiftX;
    const by0 = BUTT_Y + shiftY;
    const cx0 = BREECH_X + shiftX;
    const cy0 = BREECH_Y + shiftY;

    const ax = AX;
    const ay = AY;
    const nx = -ay;
    const ny = ax;
    /** Точка на оси ствола: `u` вдоль от казны, `s` поперёк (+ вверх-вправо). */
    const at = (u: number, s = 0) => [cx0 + ax * u + nx * s, cy0 + ay * u + ny * s] as const;
    /** Точка на оси ложи: `u` вдоль от затыльника к казне. */
    const st = (u: number, s = 0) => [bx0 + UPX * u - UPY * s, by0 + UPY * u + UPX * s] as const;

    // Толщина ограничена сверху: без потолка тяжёлый ствол вылезал коробкой за
    // боковой край холста, а тот приходится на треть ширины экрана.
    const recvHalf = 8 + Math.min(20, skin.bulk) * 0.16;
    // Облик делит отведённую длину: длинное цевьё означает короткий голый
    // ствол и наоборот. Складывать длину из кусков нельзя — ствол перерастёт
    // кадр и вспышка оторвётся от железа.
    const woodLen = (SPAN - 20) * Math.max(0.42, Math.min(0.7, skin.barrel / 74));
    const boltBack = fire ? 8 : reload ? 13 : 0;

    /* ── Ложа ── */
    // Приклад расширяется к затыльнику и уходит за нижний правый угол.
    slab(buf, bx0 - UPX * 4, by0 - UPY * 4, UPX, UPY, 30, 12, skin.grip, 11, skin.wear * 0.8, 5);
    // Шейка: тоньше приклада, на ней и лежит правая кисть.
    slab(buf, ...st(24), UPX, UPY, STOCK_LEN - 22, 7.2, skin.grip, 13, skin.wear * 0.8, 3);
    // Гребень: светлая грань сверху, без неё ложа читается плоской доской.
    slab(buf, ...st(10, 7), UPX, UPY, 30, 2.2, shade(skin.grip, 1.24), 17, skin.wear * 0.5, 2);
    // Затыльник поперёк ложи.
    slab(buf, ...st(-3, -10), -UPY, UPX, 18, 2.6, shade(skin.body, 0.62), 19, skin.wear, 1);
    // Насечка на щеке приклада.
    for (let i = 0; i < 4; i++) {
      const [gx, gy] = st(9 + i * 5);
      for (let s = -8; s <= 8; s += 0.5) {
        const qx = (gx - UPY * s + s * 0.3) | 0;
        const qy = (gy + UPX * s) | 0;
        if (qx < 0 || qy < 0 || qx >= VM || qy >= VM) continue;
        if (((buf[qy * VM + qx] >>> 24) & 0xff) === 0) continue;
        buf[qy * VM + qx] = tint(skin.grip, 0.7);
      }
    }

    /* ── Ствол ── */
    const [brX, brY] = at(8);
    slab(buf, brX, brY, ax, ay, SPAN - 8, 3.4, skin.body, 23, skin.wear, 2);
    // Намушник и мушка: у винтовки она высокая и заметная.
    const [nsX, nsY] = at(SPAN - 8);
    slab(buf, nsX, nsY, ax, ay, 8, 5, shade(skin.body, 0.78), 29, skin.wear, 1);
    const [fsX, fsY] = at(SPAN - 5, 2);
    slab(buf, fsX, fsY, nx, ny, 6, 1.7, shade(skin.body, 0.4), 31, 0, 1);
    const [mzX, mzY] = at(SPAN - 1);
    ellipse(buf, mzX, mzY, 2, 1.9, rgba(12, 11, 13));

    /* ── Цевьё ── */
    const [fwX, fwY] = at(14);
    slab(buf, fwX, fwY, ax, ay, woodLen, 7, skin.grip, 37, skin.wear * 0.8, 3);
    // Продольная светлая грань: дерево круглое, а не наклеенная полоса.
    const [flX, flY] = at(14, 3.6);
    slab(buf, flX, flY, ax, ay, woodLen - 3, 1.6, shade(skin.grip, 1.22), 41, skin.wear * 0.5, 1);
    // Ложевое кольцо: перехват цевья, без него дерево читается доской.
    const [bandX, bandY] = at(14 + woodLen - 5, -8);
    slab(buf, bandX, bandY, nx, ny, 16, 2.2, shade(skin.body, 0.72), 43, skin.wear, 1);

    /* ── Ствольная коробка ── */
    const [rcX, rcY] = at(-12);
    slab(buf, rcX, rcY, ax, ay, 28, recvHalf, skin.body, 47, skin.wear, 3);
    // Прицельная планка с целиком: у винтовки она поднята над коробкой.
    const [rsX, rsY] = at(-4, recvHalf * 0.72);
    slab(buf, rsX, rsY, ax, ay, 18, 2.1, shade(skin.body, 0.5), 53, skin.wear * 0.6, 1);
    const [rnX, rnY] = at(-3, recvHalf * 0.95);
    ellipse(buf, rnX, rnY, 2.6, 2.4, rgba(11, 10, 12));
    // Окно выброса: открыто, пока затвор отведён.
    const [ejX, ejY] = at(6, recvHalf * 0.32);
    slab(buf, ejX, ejY, ax, ay, 11, recvHalf * 0.3, [0, 0, 0], 59, 0, 1);
    if (!boltBack) {
      const [cvX, cvY] = at(7, recvHalf * 0.32);
      slab(buf, cvX, cvY, ax, ay, 10, recvHalf * 0.24, skin.body, 61, skin.wear, 1);
    }
    // Рукоятка затвора вбок и назад: единственное, что ездит между кадрами.
    const [blX, blY] = at(2 - boltBack, recvHalf * 0.45);
    slab(buf, blX, blY, nx * 0.8 - ax * 0.6, ny * 0.8 - ay * 0.6, 11, 2.2, shade(skin.body, 0.95), 67, 0, 1);
    ellipse(buf, blX + (nx * 0.8 - ax * 0.6) * 11, blY + (ny * 0.8 - ay * 0.6) * 11, 3.4, 3.2,
      tint(skin.body, 1.2));

    // Коробка магазина под казной: у винтовки она короткая, всего на обойму.
    // На перезарядке вышла из гнезда — по ней кадр и опознаётся.
    if (skin.magazine > 0) {
      const magLen = 9 + Math.min(22, skin.magazine) * 0.55;
      const [mgX, mgY] = at(2, -recvHalf * 0.7 - (reload ? 13 : 0));
      slab(buf, mgX, mgY, -nx, -ny, magLen, 6.2, skin.accent, 71, skin.wear * 0.6, 2);
      slab(buf, mgX - nx * magLen + ny * 8, mgY - ny * magLen - nx * 8, -ny, nx, 16, 2,
        shade(skin.accent, 0.6), 73, skin.wear * 0.4, 1);
    }
    // Спусковая скоба перед шейкой.
    const [gdX, gdY] = at(-12, -recvHalf * 1.05);
    ellipse(buf, gdX, gdY, 9.4, 8.8, tint(skin.body, 0.58));
    ellipse(buf, gdX - 0.4, gdY - 0.6, 6.2, 5.6, rgba(0, 0, 0, 0));

    /* ── Левая кисть высоко на цевье ── */
    /* Верхняя точка хвата и главная примета винтовки: между кистями остаётся
     * голое дерево, которого у автомата нет. С цевья она не уходит и на
     * перезарядке: «выше казны» здесь означает вверх-ВПРАВО, и поднятая туда
     * кисть тянула предплечье наискось через весь ствол. Перезарядку несут
     * отведённый затвор и вышедший магазин, а не смена хвата. */
    const [lhx, lhy] = at(14 + woodLen * (reload ? 0.3 : 0.48), -6);
    forearm(buf, lhx, lhy, 34, VM + 20, tone, 9.5, 16);
    fist(buf, lhx, lhy, ax, ay, tone, 79);

    /* ── Правая кисть внизу на шейке приклада ── */
    const [rhx, rhy] = st(17);
    /* Цель конуса взята КРУТО вниз, а не вбок. Пущенное отлого, предплечье
     * дотягивалось до правого края холста на строках 108–109, то есть посреди
     * экрана, и обрывалось там вертикальным срезом. */
    forearm(buf, rhx - UPX * 12, rhy - UPY * 12, VM + 2, VM + 26, tone, 12, 20);
    fist(buf, rhx, rhy, UPX, UPY, tone, 89);

    contour(buf);
  },
});
