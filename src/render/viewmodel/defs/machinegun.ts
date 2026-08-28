/**
 * Пулемёт: толстый ребристый кожух, сошки, короб и петля ленты.
 *
 * Пакет держит те же четыре правила, что образцовый `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Ствол уходит вверх-влево, видна верхняя грань
 *    крышки приёмника и косые рёбра кожуха. Симметричный анфас превращал
 *    пулемёт в толстую трубу.
 * 2. СБОРКА ОТ ПЯТКИ РУКОЯТИ. Пятка задаёт низ, рукоять поднимает казну, от
 *    казны корпус идёт к объявленному дулу; короб и лента висят под казной.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина от казны до дула фиксирована; облик
 *    решает лишь, сколько её занял кожух и сколько осталось коробке.
 * 4. РУКИ РАСТУТ ИЗ КРАЯ. Правое предплечье уходит в нижний правый угол, левое
 *    вниз-влево от кожуха за нижний срез — но НЕ в левый край холста: тот
 *    приходится на треть ширины экрана и даёт вертикальный срез в воздухе.
 *
 * Массу несут не размеры корпуса, а то, чего нет ни у автомата, ни у винтовки:
 * раскинутые сошки под стволом (они стоят высоко и потому читаются первыми),
 * рёбра охлаждения и провисшая петля ленты у короба.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, skinTone } from '../draw';
import { VM } from '../types';

/** Пятка пистолетной рукояти — якорь сборки. Уходит под полосу HUD: там ей место. */
const BUTT_X = 98;
const BUTT_Y = 116;
/** Наклон рукояти от вертикали: у пулемёта она почти отвесная. */
const GRIP_T = -0.20;
const GRIP_LEN = 34;
/** Направление ОТ ПЯТКИ К КАЗНЕ, то есть вверх-влево. */
const UPX = Math.sin(GRIP_T);
const UPY = -Math.cos(GRIP_T);
/** Казна: там рукоять встречает ствольную коробку. */
const BREECH_X = BUTT_X + UPX * GRIP_LEN;
const BREECH_Y = BUTT_Y + UPY * GRIP_LEN;

/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = 26;
const MUZZLE_Y = 36;

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
  slab(buf, x - ux * 11, y - uy * 11, ux, uy, 25, 11.5, tone, seed, 0, 5);
  for (let f = 0; f < 4; f++) {
    const u = 5 - f * 6.2;
    const fx = x + ux * u;
    const fy = y + uy * u;
    const len = 17 - Math.abs(f - 1.4) * 1.4;
    slab(buf, fx - px * 10.5 + 1, fy - py * 10.5 + 1.5, px, py, len, 3.5, [26, 18, 16], seed + 11 + f, 0, 2.6);
    slab(buf, fx - px * 10.5, fy - py * 10.5, px, py, len, 3,
      [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], seed + 21 + f, 0, 2.6);
    // Сустав ловит свет — без него пальцы читаются трубками.
    ellipse(buf, fx - px * 4, fy - py * 4, 2.9, 2.6, flesh(1.2));
  }
  /* Большой палец лежит ВДОЛЬ хвата с ближней стороны. Направление обязано
   * идти по оси хвата: смешав его поровну с поперечной, получаешь палец,
   * торчащий в сторону от кулака отдельной палкой. */
  slab(buf, x + px * 8 - ux * 5, y + py * 8 - uy * 5,
    ux * 0.95 + px * 0.3, uy * 0.95 + py * 0.3, 17, 3.7,
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
    ellipse(buf, x + sx + dx * t, y + sy + dy * t, 4.8 - t * 1.5, 4.2 - t * 1.2, flesh(1.05));
  }
}

registerViewmodel({
  id: 'machinegun',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 0.85, bob: 0.8, swap: 0.34, flash: 0.05 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));
    const shade = (c: readonly [number, number, number], k: number) =>
      [c[0] * k, c[1] * k, c[2] * k] as const;

    const fire = frame === 'fire';
    const reload = frame === 'reload';
    const shiftX = reload ? 5 : 0;
    const shiftY = reload ? 10 : 0;
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
    const recvHalf = 12 + Math.min(22, skin.bulk) * 0.24;
    const jacketHalf = recvHalf * 0.7;
    // Облик делит отведённую длину, а не удлиняет её: длинный кожух означает
    // короткую коробку и наоборот.
    const jacketLen = SPAN * Math.max(0.46, Math.min(0.66, skin.barrel / 78));
    const recvLen = SPAN - jacketLen;
    const back = fire ? 7 : 0;

    /* ── Кожух ствола ── */
    const [jkX, jkY] = at(recvLen - 6);
    slab(buf, jkX, jkY, ax, ay, jacketLen + 6, jacketHalf, skin.body, 23, skin.wear, 3);
    // Рёбра охлаждения поперёк кожуха: у пулемёта они и есть признак массы.
    for (let r = 0; r * 6 + 8 < jacketLen; r++) {
      const [rx, ry] = at(recvLen + 4 + r * 6, jacketHalf + 1.4);
      slab(buf, rx, ry, -nx, -ny, jacketHalf * 2 + 2.8, 1.5, shade(skin.body, 1.26), 29 + r, skin.wear * 0.5, 0);
      const [sx2, sy2] = at(recvLen + 6 + r * 6, jacketHalf + 1.4);
      slab(buf, sx2, sy2, -nx, -ny, jacketHalf * 2 + 2.8, 0.9, shade(skin.body, 0.5), 47 + r, 0, 0);
    }
    // Пламегаситель: у пулемёта он заметно шире кожуха.
    const [fhX, fhY] = at(SPAN - 10);
    slab(buf, fhX, fhY, ax, ay, 10, jacketHalf * 1.14, shade(skin.body, 0.72), 59, skin.wear, 1);
    const [mzX, mzY] = at(SPAN - 2);
    ellipse(buf, mzX, mzY, jacketHalf * 0.26, jacketHalf * 0.24, rgba(10, 9, 11));

    /* ── Ствольная коробка ── */
    const [rcX, rcY] = at(-12);
    slab(buf, rcX, rcY, ax, ay, recvLen + 12, recvHalf, skin.body, 61, skin.wear, 4);
    // Крышка приёмника: на перезарядке откинута вверх от коробки.
    if (reload) {
      const [cvX, cvY] = at(-6, recvHalf * 0.5);
      slab(buf, cvX, cvY, ax * 0.72 + nx * 0.7, ay * 0.72 + ny * 0.7, recvLen * 0.8, 3.4,
        shade(skin.body, 0.96), 67, skin.wear * 0.6, 2);
    } else {
      const [cvX, cvY] = at(-8, recvHalf * 0.62);
      slab(buf, cvX, cvY, ax, ay, recvLen + 6, recvHalf * 0.3, shade(skin.body, 1.22), 67, skin.wear * 0.5, 2);
    }
    // Окно выброса и рукоятка перезаряжания — обе с ближней стороны.
    const [ejX, ejY] = at(recvLen * 0.4, recvHalf * 0.34);
    slab(buf, ejX, ejY, ax, ay, 13, recvHalf * 0.26, [0, 0, 0], 71, 0, 1);
    const [chX, chY] = at(recvLen * 0.62 - back, recvHalf * 0.36);
    slab(buf, chX, chY, ax, ay, 12, recvHalf * 0.24, shade(skin.body, 0.95), 73, 0, 2);
    // Целик у заднего среза коробки.
    const [rsX, rsY] = at(-4, recvHalf * 0.8);
    ellipse(buf, rsX, rsY, 3.6, 3.1, tint(skin.body, 0.3));

    /* ── Патронный короб и лента ── */
    const canLen = 20 + Math.min(28, skin.magazine) * 0.28;
    const canHalf = 10 + Math.min(28, skin.magazine) * 0.1;
    // Короб висит под КОРОБКОЙ, а не под кожухом: под кожухом уже стоят сошки,
    // и два тела в одном месте сливались в общее тёмное пятно.
    const canU = SPAN * 0.2;
    /** Насколько короб опущен под ось: горловина и лента считаются от него же. */
    const canDrop = recvHalf + canHalf - 6;
    const [canX, canY] = at(canU, -canDrop - (reload ? 7 : 0));
    // Короб приглушён относительно акцента: в полную сталь он забивает собой и
    // корпус, и ленту, ради которой стоит.
    slab(buf, canX - ax * canLen * 0.5, canY - ay * canLen * 0.5, ax, ay, canLen, canHalf,
      shade(skin.accent, 0.78), 79, skin.wear, 2);
    // Верхняя грань и поясок: без них короб сливается с коробкой в одно пятно.
    slab(buf, canX - ax * canLen * 0.46 + nx * (canHalf - 2), canY - ay * canLen * 0.46 + ny * (canHalf - 2),
      ax, ay, canLen * 0.92, 1.7, shade(skin.accent, 1.32), 83, skin.wear * 0.5, 1);
    slab(buf, canX - nx * canHalf, canY - ny * canHalf, nx, ny, canHalf * 2, 1.4,
      shade(skin.accent, 0.42), 89, skin.wear, 0);
    // Горловина, из которой выходит лента.
    const [ltX, ltY] = at(canU - canLen * 0.4, -(canDrop - canHalf + 3));
    slab(buf, ltX, ltY, -nx, -ny, 8, 3, shade(skin.accent, 0.5), 91, skin.wear, 1);

    // Лента провисает петлёй от приёмника к горловине короба. Петля и есть
    // самый дешёвый и самый однозначный признак пулемёта.
    const [beltAX, beltAY] = at(recvLen * 0.95, -recvHalf * 0.85);
    const [beltBX, beltBY] = at(canU - canLen * 0.4, -(canDrop - canHalf + 5));
    const sagX = (beltAX + beltBX) * 0.5 - nx * 13;
    const sagY = (beltAY + beltBY) * 0.5 - ny * 13;
    const links = 6;
    for (let i = 0; i < links; i++) {
      const t = i / (links - 1);
      const k = 1 - t;
      const lx = k * k * beltAX + 2 * k * t * sagX + t * t * beltBX;
      const ly = k * k * beltAY + 2 * k * t * sagY + t * t * beltBY;
      const tx = 2 * (k * (sagX - beltAX) + t * (beltBX - sagX));
      const ty = 2 * (k * (sagY - beltAY) + t * (beltBY - sagY));
      const tl = Math.max(0.01, Math.hypot(tx, ty));
      // Патрон стоит ПОПЕРЁК ленты: вдоль неё он читается верёвкой.
      const px2 = -ty / tl;
      const py2 = tx / tl;
      slab(buf, lx - px2 * 4.5, ly - py2 * 4.5, px2, py2, 9, 2.9, shade(skin.accent, 1.34), 97 + i, skin.wear * 0.4, 1);
      slab(buf, lx - px2 * 1.4, ly - py2 * 1.4, px2, py2, 3, 2.8, shade(skin.accent, 0.44), 113 + i, 0, 0);
    }

    /* ── Сошки ── */
    /* Рисуются ПОСЛЕ короба, а не до него. Под стволом, наклонённым к вертикали
     * на полсотни градусов, «низ» приходится вниз-ВЛЕВО — ровно туда, где висит
     * короб. Спрятанные за ним ноги пропадали целиком, и от сошек в кадре
     * оставалась одна культя. */
    const [bpX, bpY] = at(SPAN * 0.78, -jacketHalf * 0.85);
    const legColor = shade(skin.body, 0.5);
    /** Одна нога вперёд-вниз, другая почти отвесно: сошки видны раскрытыми. */
    const leg = (mixA: number, len: number, seed: number) => {
      const dx = -nx + ax * mixA;
      const dy = -ny + ay * mixA;
      const d = Math.hypot(dx, dy);
      const ux = dx / d;
      const uy = dy / d;
      slab(buf, bpX, bpY, ux, uy, len, 2.6, legColor, seed, skin.wear, 1);
      // Опорная лапа ПОПЕРЁК ноги: вдоль неё она просто удлиняет палку.
      slab(buf, bpX + ux * len + uy * 5, bpY + uy * len - ux * 5, -uy, ux, 10, 2,
        shade(skin.body, 0.34), seed + 2, skin.wear, 1);
    };
    leg(0.55, 23, 11);
    leg(-0.1, 28, 15);

    /* ── Рукоять ── */
    const gripHalf = 9 + Math.min(22, skin.bulk) * 0.11;
    slab(buf, bx0, by0, UPX, UPY, GRIP_LEN, gripHalf, skin.grip, 127, skin.wear * 0.7, 3);
    for (let i = 0; i < 5; i++) {
      const u = 7 + i * 4.6;
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
    // Плечевой упор уходит назад-вправо за нижний угол.
    if (skin.stock) {
      const [stX, stY] = at(-10, -recvHalf * 0.2);
      slab(buf, stX, stY, -ax * 0.62 - nx * 0.78, -ay * 0.62 - ny * 0.78, 30, 5.5,
        skin.grip, 131, skin.wear * 0.8, 3);
    }
    // Спусковая скоба перед рукоятью.
    const [gdX, gdY] = at(-8, -recvHalf * 1.0);
    ellipse(buf, gdX, gdY, 9.6, 9, tint(skin.body, 0.58));
    ellipse(buf, gdX - 0.4, gdY - 0.6, 6.4, 5.8, rgba(0, 0, 0, 0));

    /* ── Правая кисть на рукояти ── */
    const rhU = 20;
    const rhx = bx0 + UPX * rhU;
    const rhy = by0 + UPY * rhU;
    forearm(buf, rhx - UPX * 13, rhy - UPY * 13, VM + 18, VM + 18, tone, 13, 23);
    fist(buf, rhx, rhy, UPX, UPY, tone, 137);

    /* ── Левая кисть на кожухе ── */
    // Позади сошек: накрыв их, она стирает признак, который читается первым.
    const [lhx, lhy] = at(SPAN * 0.55, -jacketHalf * 0.7);
    forearm(buf, lhx, lhy, 24, VM + 24, tone, 11, 20);
    fist(buf, lhx, lhy, ax, ay, tone, 149);

    contour(buf);
  },
});
