/**
 * Метательное: кулак держит гранату или подрывной заряд.
 *
 * Написано по образцу `pistol.ts` и держит те же четыре правила, только вместо
 * ствола здесь тело в кулаке:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Корпус завален набок и наклонён, сверху видно
 *    ЭЛЛИПС ТОРЦА, поперёк идут пояски. Прежняя версия рисовала кружок строго
 *    в лоб, и граната читалась монетой, а не телом с объёмом.
 * 2. СБОРКА ОТ КУЛАКА. Якорь — костяшки: от них строится корпус, от корпуса
 *    запал, рычаг и кольцо. Перенеся кулак, переносишь всё разом, и замах
 *    отличается от покоя одной парой чисел.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина корпуса берётся от массы заряда, а
 *    обвязка (запал, рычаг, кольцо) делит её долями: на пенном шарике штатная
 *    гайка от фугаса была бы больше самого заряда.
 * 4. РУКИ РАСТУТ ИЗ УГЛОВ. Бросающая уходит вправо-вниз, вторая — влево-вниз, и
 *    обе за край кадра.
 *
 * Дульной вспышки здесь нет и быть не может, поэтому `muzzle` не объявлен:
 * огонь из пустого кулака выглядел бы выстрелом.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, skinTone } from '../draw';
import { VM } from '../types';

/** Костяшки бросающего кулака в покое — якорь сборки. */
const FIST_X = 82;
const FIST_Y = 78;
/** Наклон корпуса от вертикали: завален влево, к лицу. */
const BODY_T = -0.34;
const BODY_UX = Math.sin(BODY_T);
const BODY_UY = -Math.cos(BODY_T);
/** Поперечная корпуса: `+` — дальний бок с рычагом, `−` — ближний, к пальцам. */
const BODY_NX = -BODY_UY;
const BODY_NY = BODY_UX;

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

registerViewmodel({
  id: 'thrown',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  motion: { recoil: 0.2, bob: 1.2, swap: 0.5 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));

    const fire = frame === 'fire';
    const reload = frame === 'reload';
    /* Замах уносит кулак вверх-вправо, за ухо; доставание — вниз к поясу.
     * Дальше правее нельзя: правый край холста приходится на треть ширины
     * экрана, и вышедшее туда предплечье режется прямой линией в воздухе. */
    const fx0 = fire ? FIST_X + 14 : FIST_X;
    const fy0 = fire ? FIST_Y - 20 : reload ? FIST_Y + 12 : FIST_Y;

    // Масса заряда — единственное, чем один корпус отличается от другого.
    const half = 9 + skin.bulk * 0.34;
    const bodyLen = 20 + skin.bulk * 0.7;
    /** Точка на оси корпуса: `u` вверх от кулака, `s` поперёк. */
    const at = (u: number, s = 0) =>
      [fx0 + BODY_UX * u + BODY_NX * s, fy0 + BODY_UY * u + BODY_NY * s] as const;

    /* ── Корпус ── */
    /* Дно и верх считаются ОДИН раз, и от них строится всё: запал, пояски,
     * рычаг. Смешав «долю длины» с «расстоянием от кулака», сажаешь запал в
     * скруглённый носок корпуса — там ширина уже ноль.
     *
     * Кулак держит корпус за НИЖНЮЮ четверть: выше кисти обязано остаться тело,
     * иначе пальцы съедают ровно ту ширину, ради которой корпус и рисуется. */
    const botU = -bodyLen * 0.25;
    const topU = bodyLen * 0.75;
    const [baseX, baseY] = at(botU);
    slab(buf, baseX, baseY, BODY_UX, BODY_UY, bodyLen, half, skin.grip, 11, skin.wear, half * 0.32);
    // Пояски поперёк корпуса: по ним тело читается точёным цилиндром.
    for (let i = 1; i < 5; i++) {
      const u = botU + (bodyLen * i) / 5;
      for (let s = -half; s <= half; s += 0.5) {
        const [qx, qy] = at(u, s);
        const ix = qx | 0;
        const iy = qy | 0;
        if (ix < 0 || iy < 0 || ix >= VM || iy >= VM) continue;
        if (((buf[iy * VM + ix] >>> 24) & 0xff) === 0) continue;
        buf[iy * VM + ix] = tint(skin.grip, 0.52);
      }
    }
    // Продольные рёбра: две борозды вдоль тела, они и ломают ровную заливку.
    for (let g = -1; g <= 1; g += 2) {
      for (let u = -bodyLen * 0.3; u <= bodyLen * 0.5; u += 0.5) {
        const [qx, qy] = at(u, g * half * 0.5);
        const ix = qx | 0;
        const iy = qy | 0;
        if (ix < 0 || iy < 0 || ix >= VM || iy >= VM) continue;
        if (((buf[iy * VM + ix] >>> 24) & 0xff) === 0) continue;
        buf[iy * VM + ix] = tint(skin.grip, 0.58);
      }
    }
    /* Блик по ближней образующей. Корпус тут вороненый, то есть почти в цвет
     * бетона за ним: без прямой засветки он проваливается в фон, и от гранаты
     * остаётся один контур. */
    for (let u = botU + 3; u <= topU - 3; u += 0.5) {
      const [qx, qy] = at(u, -half * 0.46);
      const ix = qx | 0;
      const iy = qy | 0;
      if (ix < 0 || iy < 0 || ix >= VM || iy >= VM) continue;
      if (((buf[iy * VM + ix] >>> 24) & 0xff) === 0) continue;
      buf[iy * VM + ix] = tint(skin.grip, 1.5);
    }

    /* Эллипс верхнего торца. Именно он делает из кружка ТЕЛО: сверху видно
     * донце, а не силуэт. Без него три четверти не читаются ничем. */
    const [topX, topY] = at(topU - half * 0.42);
    ellipse(buf, topX, topY, half * 0.82, half * 0.4, tint(skin.grip, 1.34));
    ellipse(buf, topX + half * 0.2, topY + half * 0.06, half * 0.5, half * 0.22, tint(skin.grip, 0.82));

    /* ── Обвязка ── */
    // Запал: гайка на верхнем торце, доля от калибра корпуса — на пенном шарике
    // штатная гайка от фугаса была бы больше самого заряда.
    const fuseHalf = half * 0.36;
    const [fuX, fuY] = at(topU - half * 0.5);
    slab(buf, fuX, fuY, BODY_UX, BODY_UY, half * 0.62, fuseHalf, skin.accent, 17, skin.wear * 0.4, 1);
    slab(buf, fuX + BODY_UX * half * 0.62, fuY + BODY_UY * half * 0.62,
      BODY_UX, BODY_UY, half * 0.3, fuseHalf * 0.6, skin.body, 19, 0, 1);
    // Спусковой рычаг вдоль дальнего бока: планка от запала вниз по корпусу.
    const [lvX, lvY] = at(topU - half * 0.5, half * 0.78);
    slab(buf, lvX, lvY, -BODY_UX, -BODY_UY, bodyLen * 0.7, 2.4,
      [skin.accent[0] * 0.86, skin.accent[1] * 0.82, skin.accent[2] * 0.74], 23, skin.wear * 0.3, 1);
    slab(buf, lvX, lvY, -BODY_UX, -BODY_UY, bodyLen * 0.7, 0.9,
      [skin.accent[0] * 1.16 + 12, skin.accent[1] * 1.12 + 10, skin.accent[2] * 1.08 + 8], 29, 0, 1);

    /* ── Кисти ── */
    /* Пальцы — отдельные валики ПОПЕРЁК корпуса, и именно они отличают хват от
     * варежки: сплошное телесное пятно читается куском мяса. Между пальцами
     * идёт тёмная щель, иначе они слипаются в одну колбасу. */
    const grab = (hx: number, hy: number, ux: number, uy: number, seed: number, count: number) => {
      const px = -uy;
      const py = ux;
      slab(buf, hx - ux * 10, hy - uy * 10, ux, uy, 20, 9.5, tone, seed, 0, 5);
      for (let f = 0; f < count; f++) {
        const u = 4 - f * 5.5;
        const cx = hx + ux * u;
        const cy = hy + uy * u;
        const len = 14 - Math.abs(f - 1.4) * 1.3;
        slab(buf, cx - px * 10 + 1, cy - py * 10 + 1.5, px, py, len, 3.4, [26, 18, 16], seed + 3 + f, 0, 2.6);
        slab(buf, cx - px * 10, cy - py * 10, px, py, len, 2.9,
          [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], seed + 11 + f, 0, 2.6);
        ellipse(buf, cx - px * 3, cy - py * 3, 2.7, 2.5, flesh(1.18));
      }
    };

    // Бросающий кулак обхватывает корпус: пальцы идут с ближнего бока.
    grab(fx0 - BODY_NX * half * 0.5, fy0 - BODY_NY * half * 0.5, BODY_UX, BODY_UY, 41, 4);
    // Большой палец прижимает рычаг с дальнего бока — пока он прижат, не рванёт.
    const [thX, thY] = at(botU + bodyLen * 0.42, half * 0.95);
    slab(buf, thX, thY, BODY_UX * 0.9 + BODY_NX * 0.44, BODY_UY * 0.9 + BODY_NY * 0.44, 14, 3.6,
      [tone[0] * 1.06, tone[1] * 1.01, tone[2] * 0.97], 47, 0, 3);

    /* ── Чека ── */
    /* Вторая рука: в покое придерживает снизу-слева, на замахе уносит кольцо, а
     * на доставании её в кадре нет — вещь берут одной рукой с пояса. Рисуется
     * ДО кольца: сорванная чека обязана лежать поверх пальцев, иначе замах
     * выглядит пустым кулаком у пояса. */
    const leftX = fire ? 36 : 52;
    const leftY = fire ? 94 : 96;
    if (!reload) grab(leftX, leftY, 0.28, -0.96, 59, 3);

    const ringR = Math.max(3.8, half * 0.34);
    const ring = rgba(clamp(skin.accent[0] * 1.3), clamp(skin.accent[1] * 1.22), clamp(skin.accent[2] * 1.1));
    // Кольцо на месте — сидит у запала с ближнего бока. Сорванное уезжает во
    // вторую руку, и именно по нему замах отличается от покоя.
    const [pinX, pinY] = at(topU - half * 0.15, -(fuseHalf + ringR + 1));
    const rx = fire ? 40 : pinX;
    const ry = fire ? 84 : pinY;
    for (let a = 0; a < 44; a++) {
      const ang = (a / 44) * Math.PI * 2;
      ellipse(buf, rx + Math.cos(ang) * ringR, ry + Math.sin(ang) * ringR * 0.84, 1.5, 1.5, ring);
    }
    if (fire) {
      // Проволока тянется от вырванного кольца к опустевшему запалу.
      const [wx, wy] = at(topU - half * 0.5, -fuseHalf * 0.4);
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        ellipse(buf, rx + ringR + (wx - rx - ringR) * t, ry + (wy - ry) * t, 1, 1, ring);
      }
    }

    /* ── Предплечья ── */
    // Конусы в нижние углы и ЗА них: руки растут из кадра, а не висят.
    const arm = (sx: number, sy: number, tx: number, ty: number, seed: number) => {
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const r = 10.5 + t * 9;
        ellipse(buf, sx + (tx - sx) * t, sy + (ty - sy) * t, r, r, flesh(0.84 - t * 0.12));
      }
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        ellipse(buf, sx - 6 + (tx - 6 - sx) * t, sy - 7 + (ty - 7 - sy) * t,
          5.2 - t * 1.7, 4.4 - t * 1.3, flesh(1.02 + noise(seed, i, 3) * 0.06));
      }
    };
    if (!reload) arm(leftX - 4, leftY + 12, 2, VM + 16, 5);
    arm(fx0 - BODY_UX * 14 - BODY_NX * half * 0.5, fy0 - BODY_UY * 14 - BODY_NY * half * 0.5,
      fire ? VM - 6 : VM + 8, VM + 26, 9);

    contour(buf);
  },
});
