/**
 * Пистолет-пулемёт: перфорированный кожух, косой рожок, обе руки на железе.
 *
 * Пакет держит те же четыре правила, что образцовый `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Оружие развёрнуто боком и завалено: видно
 *    профиль коробки, скос рожка и верхнюю грань крышки. Симметричный анфас
 *    читается куском трубы, а не оружием.
 * 2. СБОРКА ОТ ПЯТКИ РУКОЯТИ. Пятка задаёт низ, рукоять поднимает казну, от
 *    казны корпус идёт к объявленному дулу. Сдвинув пятку, двигаешь сборку
 *    целиком.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина от казны до дула фиксирована; облик
 *    решает лишь, сколько из неё занял кожух и сколько осталось коробке.
 * 4. РУКИ РАСТУТ ИЗ КРАЯ. Правое предплечье уходит в нижний правый угол, левое
 *    вниз мимо рожка — оба ЗА нижний срез, и ни одно не упирается в боковой
 *    край холста: тот приходится на треть ширины экрана.
 *
 * От пистолета ПП отличает не длина, а два признака, читаемых за один кадр:
 * ряд отверстий в кожухе ствола и длинный рожок, ушедший вперёд-вниз, на
 * котором лежит левая кисть.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, skinTone } from '../draw';
import { VM } from '../types';

/** Пятка пистолетной рукояти — якорь сборки. Уходит под полосу HUD: там ей место. */
const BUTT_X = 94;
const BUTT_Y = 114;
/** Наклон рукояти от вертикали: завалена назад-вправо. */
const GRIP_T = -0.30;
const GRIP_LEN = 30;
/** Направление ОТ ПЯТКИ К КАЗНЕ, то есть вверх-влево. */
const UPX = Math.sin(GRIP_T);
const UPY = -Math.cos(GRIP_T);
/** Казна: там рукоять встречает коробку. */
const BREECH_X = BUTT_X + UPX * GRIP_LEN;
const BREECH_Y = BUTT_Y + UPY * GRIP_LEN;

/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = 32;
const MUZZLE_Y = 32;

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
  id: 'smg',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 0.72, bob: 1.05, flash: 0.045 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));
    const shade = (c: readonly [number, number, number], k: number) =>
      [c[0] * k, c[1] * k, c[2] * k] as const;

    const fire = frame === 'fire';
    const reload = frame === 'reload';
    const shiftX = reload ? 5 : 0;
    const shiftY = reload ? 11 : 0;
    const bx0 = BUTT_X + shiftX;
    const by0 = BUTT_Y + shiftY;
    const cx0 = BREECH_X + shiftX;
    const cy0 = BREECH_Y + shiftY;

    const ax = AX;
    const ay = AY;
    const nx = -ay;
    const ny = ax;
    /** Точка на оси корпуса: `u` вдоль ствола от казны, `s` поперёк (+ вверх-вправо). */
    const at = (u: number, s = 0) => [cx0 + ax * u + nx * s, cy0 + ay * u + ny * s] as const;

    // Толщина ограничена сверху: без потолка тяжёлый ствол вылезал кожухом за
    // левый край холста, а тот приходится на треть ширины экрана.
    const half = 9 + Math.min(20, skin.bulk) * 0.2;
    // Облик делит отведённую длину, а не удлиняет её: длинный кожух означает
    // короткую коробку и наоборот.
    const shroudLen = SPAN * Math.max(0.38, Math.min(0.58, skin.barrel / 62));
    const boxLen = SPAN - shroudLen;
    const back = fire ? 6 : 0;

    /* ── Приклад-упор: проволочная рама назад-вправо, за нижний угол ── */
    if (skin.stock) {
      const [t0x, t0y] = at(-4, half * 0.55);
      slab(buf, t0x, t0y, -ax, -ay, 32, 2.6, shade(skin.body, 0.66), 11, skin.wear, 1);
      const [t1x, t1y] = at(-4, -half * 0.3);
      slab(buf, t1x, t1y, -ax, -ay, 28, 2.4, shade(skin.body, 0.5), 13, skin.wear, 1);
      slab(buf, t0x - ax * 32 - nx * 6, t0y - ay * 32 - ny * 6, nx, ny, 13, 2.4,
        shade(skin.grip, 0.8), 17, skin.wear, 1);
    }

    /* ── Кожух ствола ── */
    const [shX, shY] = at(boxLen - 8);
    slab(buf, shX, shY, ax, ay, shroudLen + 8, half * 0.6, skin.body, 19, skin.wear, 3);
    // Ряд отверстий: главный признак кожуха ПП, поэтому он крупный и тёмный.
    const holeDark = tint(skin.body, 0.2);
    for (let i = 0; i * 7 + 10 < shroudLen; i++) {
      const [hx, hy] = at(boxLen + 6 + i * 7, -half * 0.1);
      ellipse(buf, hx, hy, 2.1, 1.9, holeDark);
    }
    // Компенсатор на срезе: у ПП он всегда шире кожуха.
    const [mbX, mbY] = at(SPAN - 8);
    slab(buf, mbX, mbY, ax, ay, 8, half * 0.76, shade(skin.body, 0.82), 23, skin.wear, 1);
    const [mzX, mzY] = at(SPAN - 2);
    ellipse(buf, mzX, mzY, half * 0.22, half * 0.2, rgba(12, 11, 13));
    // Мушка на кожухе, у самого среза.
    const [fsX, fsY] = at(SPAN - 14, half * 0.4);
    slab(buf, fsX, fsY, nx, ny, 7, 1.8, shade(skin.body, 0.42), 29, 0, 1);

    /* ── Ствольная коробка ── */
    const [rcX, rcY] = at(-9);
    slab(buf, rcX, rcY, ax, ay, boxLen + 9, half, skin.body, 31, skin.wear, 4);
    // Верхняя грань крышки: она и делает вид тремя четвертями, а не анфасом.
    const [tpX, tpY] = at(-7, half * 0.6);
    slab(buf, tpX, tpY, ax, ay, boxLen + 6, half * 0.28, shade(skin.body, 1.2), 37, skin.wear * 0.5, 2);
    // Окно выброса; на очереди открыто и черно, иначе закрыто затвором.
    const [ejX, ejY] = at(boxLen * 0.58, half * 0.32);
    slab(buf, ejX, ejY, ax, ay, 13, half * 0.28, [0, 0, 0], 41, 0, 1);
    if (!fire) {
      const [cvX, cvY] = at(boxLen * 0.58 + 1, half * 0.32);
      slab(buf, cvX, cvY, ax, ay, 11, half * 0.22, skin.body, 43, skin.wear, 1);
    }
    // Рукоятка затвора: единственное, что ездит на выстреле.
    const [chX, chY] = at(boxLen * 0.34 - back, half * 0.34);
    slab(buf, chX, chY, ax, ay, 10, half * 0.24, shade(skin.body, 0.94), 47, 0, 2);
    // Целик у заднего среза коробки.
    const [rsX, rsY] = at(1, half * 0.66);
    ellipse(buf, rsX, rsY, 3.4, 2.9, tint(skin.body, 0.32));

    /* ── Рожок ── */
    // Вниз-вперёд от коробки: главный опознавательный знак силуэта.
    const mgRawX = -nx * 0.97 + ax * 0.18;
    const mgRawY = -ny * 0.97 + ay * 0.18;
    const mgLen = Math.hypot(mgRawX, mgRawY);
    const mdx = mgRawX / mgLen;
    const mdy = mgRawY / mgLen;
    const magLen = 32 + Math.min(28, skin.magazine) * 0.52;
    const magHalf = 5.4 + Math.min(20, skin.bulk) * 0.08;
    const drop = reload ? 22 : 0;
    const [mgX0, mgY0] = at(boxLen * 0.86, -half * 0.75);
    const mgX = mgX0 + mdx * drop;
    const mgY = mgY0 + mdy * drop;
    if (skin.magazine > 0) {
      slab(buf, mgX, mgY, mdx, mdy, magLen, magHalf, skin.grip, 53, skin.wear * 0.7, 2);
      // Поперечные рёбра: без них рожок читается доской, а не коробкой.
      for (let i = 1; i * 6 < magLen - 3; i++) {
        const rx = mgX + mdx * i * 6 + mdy * magHalf;
        const ry = mgY + mdy * i * 6 - mdx * magHalf;
        slab(buf, rx, ry, -mdy, mdx, magHalf * 2, 0.9, shade(skin.grip, 0.58), 59 + i, 0, 0);
      }
      // Пятка рожка: поперечная плашка, ЦЕНТРИРОВАННАЯ на оси магазина.
      slab(buf, mgX + mdx * magLen + mdy * (magHalf + 2), mgY + mdy * magLen - mdx * (magHalf + 2),
        -mdy, mdx, magHalf * 2 + 4, 2.4, shade(skin.accent, 0.6), 67, skin.wear * 0.4, 1);
    }

    /* ── Рукоять и скоба ── */
    const gripHalf = 8.5 + Math.min(20, skin.bulk) * 0.1;
    slab(buf, bx0, by0, UPX, UPY, GRIP_LEN, gripHalf, skin.grip, 71, skin.wear * 0.7, 3);
    // Насечка на щёчке: косые штрихи по живым пикселям, по ним читается материал.
    for (let i = 0; i < 5; i++) {
      const u = 7 + i * 4.4;
      const gx = bx0 + UPX * u;
      const gy = by0 + UPY * u;
      for (let s = -gripHalf * 0.7; s <= gripHalf * 0.7; s += 0.5) {
        const qx = (gx - UPY * s * 0.4 + s * 0.9) | 0;
        const qy = (gy + UPX * s * 0.4) | 0;
        if (qx < 0 || qy < 0 || qx >= VM || qy >= VM) continue;
        if (((buf[qy * VM + qx] >>> 24) & 0xff) === 0) continue;
        buf[qy * VM + qx] = tint(skin.grip, 0.66);
      }
    }
    // Скоба: кольцо перед рукоятью, внутренность выбита прозрачностью.
    const [gdX, gdY] = at(3, -half * 1.05);
    ellipse(buf, gdX, gdY, 10, 9.4, tint(skin.body, 0.6));
    ellipse(buf, gdX - 0.4, gdY - 0.6, 6.6, 6, rgba(0, 0, 0, 0));

    /* ── Правая кисть на рукояти ── */
    const rhU = 19;
    const rhx = bx0 + UPX * rhU;
    const rhy = by0 + UPY * rhU;
    forearm(buf, rhx - UPX * 13, rhy - UPY * 13, VM + 16, VM + 18, tone, 12, 22);
    fist(buf, rhx, rhy, UPX, UPY, tone, 79);

    /* ── Левая кисть на рожке ── */
    if (skin.magazine > 0) {
      // Кисть держит рожок ВЫСОКО, у самой коробки: накрыв его середину, она
      // стирает единственный признак, по которому ПП отличают от пистолета.
      const lhU = magLen * 0.16;
      const lhx = mgX + mdx * lhU;
      const lhy = mgY + mdy * lhU;
      /* Предплечье уходит вниз КРУЧЕ рожка и ЗА нижний срез. Пущенное вдоль
       * рожка, оно ложится ровно на него и стирает главный признак силуэта; в
       * левый край холста его пускать тоже нельзя — тот приходится на треть
       * ширины экрана и даёт вертикальный срез в воздухе. */
      forearm(buf, lhx, lhy, 46, VM + 26, tone, 11, 20);
      fist(buf, lhx, lhy, mdx, mdy, tone, 89);
    }

    contour(buf);
  },
});
