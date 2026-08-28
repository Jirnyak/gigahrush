/**
 * Пистолет: короткий ствол, магазин в рукояти, одна рука.
 *
 * ОБРАЗЦОВЫЙ ПАКЕТ — по нему пишутся остальные силуэты. Держит четыре правила,
 * без которых оружие в кадре не читается:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Оружие развёрнуто боком и наклонено: видно
 *    профиль — затвор, скобу, скос рукояти. Первая версия рисовала пистолет
 *    строго сзади, симметричным блоком, и он читался куском трубы на палке.
 *    Это же правило у всех домовских вьюмоделей и есть главная их черта.
 * 2. СБОРКА ОТ ПЯТКИ РУКОЯТИ, а не от кисти. Пятка задаёт низ, рукоять
 *    поднимает казну, от казны корпус идёт к объявленному дулу. Сдвинув пятку,
 *    двигаешь всю сборку целиком, а не подгоняешь части поодиночке.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина корпуса — это расстояние от казны до
 *    дула, а не сумма посчитанных по `skin` частей. Иначе настильный ствол
 *    перерастает отведённое место и уходит к прицелу, а вспышка отрывается от
 *    железа.
 * 4. РУКА РАСТЁТ ИЗ УГЛА. Предплечье уходит в нижний правый угол и за него, а
 *    не обрывается посреди кадра.
 *
 * Безопасная зона холста: читаемое живёт в строках 8..100, строки 100..127
 * закрывает полоса HUD — туда идёт только масса предплечья и пятка рукояти.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, skinTone } from '../draw';
import { VM } from '../types';

/** Пятка рукояти. Уходит под полосу HUD: там ей и место. */
const BUTT_X = 96;
const BUTT_Y = 112;
/** Наклон рукояти от вертикали: завалена назад-вправо. */
const GRIP_T = -0.30;
const GRIP_LEN = 34;
/* Направление ОТ ПЯТКИ К КАЗНЕ, то есть вверх-влево.
 *
 * Знак здесь стоил отдельной поломки: рукоять, насечка и вся кисть строились в
 * противоположную сторону и уезжали за нижний край холста — в кадре от руки
 * оставалось одно пятно предплечья, а пистолет висел сам по себе. Ось названа
 * по смыслу, чтобы это не повторилось. */
const UPX = Math.sin(GRIP_T);
const UPY = -Math.cos(GRIP_T);
/** Казна: там рукоять встречает корпус. */
const BREECH_X = BUTT_X + UPX * GRIP_LEN;
const BREECH_Y = BUTT_Y + UPY * GRIP_LEN;

/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = 48;
const MUZZLE_Y = 26;

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

registerViewmodel({
  id: 'pistol',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 1, flash: 0.055 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));

    const reload = frame === 'reload';
    const shiftX = reload ? 6 : 0;
    const shiftY = reload ? 14 : 0;
    const bx0 = BUTT_X + shiftX;
    const by0 = BUTT_Y + shiftY;
    const cx0 = BREECH_X + shiftX;
    const cy0 = BREECH_Y + shiftY;

    const ax = AX;
    const ay = AY;
    const nx = -ay;
    const ny = ax;
    /** Точка на оси корпуса: `u` вдоль ствола от казны, `s` поперёк. */
    const at = (u: number, s = 0) => [cx0 + ax * u + nx * s, cy0 + ay * u + ny * s] as const;

    const half = 10 + skin.bulk * 0.22;
    // Облик делит отведённую длину, а не удлиняет её: короткий ствол означает
    // длинный затвор и наоборот.
    const barrelLen = SPAN * Math.max(0.24, Math.min(0.44, skin.barrel / 62));
    const slideLen = SPAN - barrelLen;
    // Затвор на выстреле уходит НАЗАД по оси; ствол стоит на месте, иначе
    // дульная вспышка оторвётся от объявленной точки.
    const back = frame === 'fire' ? 7 : 0;

    /* ── Корпус ── */
    // Ствол: тонкая труба, выступающая из-под затвора к самому срезу.
    const [barX, barY] = at(slideLen - 8);
    slab(buf, barX, barY, ax, ay, barrelLen + 8, half * 0.44, skin.body, 11, skin.wear, 3);
    // Затвор — самое крупное тело силуэта, и единственное, что ездит.
    const [slX, slY] = at(-back);
    slab(buf, slX, slY, ax, ay, slideLen, half, skin.body, 17, skin.wear, 4);
    // Рамка под затвором стоит на месте: по ней и читается откат.
    const [frX, frY] = at(-4, half * 0.42);
    slab(buf, frX, frY, ax, ay, slideLen * 0.6, half * 0.62, skin.body, 23, skin.wear * 1.25, 2);

    // Насечка на заднем скате затвора: штрихи поперёк оси по живым пикселям.
    for (let i = 0; i < 6; i++) {
      const [sx, sy] = at(2 - back + i * 3);
      for (let s = -half * 0.8; s <= half * 0.8; s += 0.5) {
        const qx = (sx + nx * s) | 0;
        const qy = (sy + ny * s) | 0;
        if (qx < 0 || qy < 0 || qx >= VM || qy >= VM) continue;
        if (((buf[qy * VM + qx] >>> 24) & 0xff) === 0) continue;
        buf[qy * VM + qx] = tint(skin.body, 0.58);
      }
    }
    // Целик у казны, мушка у среза: две точки прицельной линии.
    const [rsX, rsY] = at(1 - back);
    ellipse(buf, rsX, rsY, 3.4, 2.8, tint(skin.body, 0.36));
    const [fsX, fsY] = at(SPAN - 5);
    ellipse(buf, fsX, fsY, 2.4, 2.2, tint(skin.body, 0.4));
    // Очко канала ствола на срезе.
    const [mzX, mzY] = at(SPAN);
    ellipse(buf, mzX, mzY, half * 0.28, half * 0.24, rgba(14, 13, 15));
    // Окно выброса сбоку; на выстреле открыто и черно.
    const [ejX, ejY] = at(slideLen * 0.52 - back, half * 0.36);
    slab(buf, ejX, ejY, ax, ay, 12, half * 0.3, [0, 0, 0], 29, 0, 1);
    if (frame !== 'fire') {
      const [cvX, cvY] = at(slideLen * 0.52 + 1, half * 0.36);
      slab(buf, cvX, cvY, ax, ay, 10, half * 0.22, skin.body, 31, skin.wear, 1);
    }

    /* ── Рукоять и скоба ── */
    const gripHalf = 9 + skin.bulk * 0.12;
    slab(buf, bx0, by0, UPX, UPY, GRIP_LEN, gripHalf, skin.grip, 37, skin.wear * 0.7, 3);
    // Насечка на щёчке: косые штрихи, по ним рукоять читается деревом.
    for (let i = 0; i < 5; i++) {
      const u = 8 + i * 4.5;
      const px1 = bx0 + UPX * u;
      const py1 = by0 + UPY * u;
      for (let s = -gripHalf * 0.7; s <= gripHalf * 0.7; s += 0.5) {
        const qx = (px1 - UPY * s * 0.4 + s * 0.9) | 0;
        const qy = (py1 + UPX * s * 0.4) | 0;
        if (qx < 0 || qy < 0 || qx >= VM || qy >= VM) continue;
        if (((buf[qy * VM + qx] >>> 24) & 0xff) === 0) continue;
        buf[qy * VM + qx] = tint(skin.grip, 0.66);
      }
    }
    // Скоба: кольцо перед рукоятью, внутренность выбита прозрачностью.
    const [gdX, gdY] = at(6, half * 1.15);
    ellipse(buf, gdX, gdY, 11, 10, tint(skin.body, 0.6));
    ellipse(buf, gdX + 0.5, gdY + 1, 7.4, 6.4, rgba(0, 0, 0, 0));
    slab(buf, gdX - 2.5, gdY - 5.5, UPX * 0.3 - ax * 0.9, UPY * 0.3 - ay * 0.9, 8, 1.8, skin.body, 41, 0, 1);

    // Магазин: пятка заподлицо, на перезарядке вышел наружу.
    if (skin.magazine > 0) {
      const out = reload ? 19 : 3;
      slab(buf, bx0, by0, -UPX, -UPY, out, gripHalf * 0.94, skin.accent, 43, skin.wear * 0.5, 1);
    }

    /* ── Кисть ── */
    /* Пальцы — отдельные валики ПОПЕРЁК рукояти, и именно они отличают руку от
     * варежки: сплошное телесное пятно читается куском мяса, а не хватом.
     * Между пальцами идёт тёмная щель, иначе они слипаются в одну колбасу. */
    const handU = 20;
    const hx = bx0 + UPX * handU;
    const hy = by0 + UPY * handU;
    // Поперечная ось рукояти: по ней пальцы обхватывают её спереди.
    const px = -UPY;
    const py = UPX;
    // Ладонь позади рукояти, вдоль неё.
    slab(buf, hx - UPX * 11, hy - UPY * 11, UPX, UPY, 25, 11.5, tone, 47, 0, 5);
    for (let f = 0; f < 4; f++) {
      const u = 5 - f * 6;
      const fx = hx + UPX * u;
      const fy = hy + UPY * u;
      const len = 17 - Math.abs(f - 1.4) * 1.5;
      // Тёмная щель под пальцем и сам палец поверх неё.
      slab(buf, fx - px * 11 + 1, fy - py * 11 + 1.5, px, py, len, 3.5, [26, 18, 16], 53 + f, 0, 2.6);
      slab(buf, fx - px * 11, fy - py * 11, px, py, len, 3,
        [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], 59 + f, 0, 2.6);
      // Сустав ловит свет — без него пальцы читаются трубками.
      ellipse(buf, fx - px * 4, fy - py * 4, 2.9, 2.6, flesh(1.2));
    }
    // Большой палец лежит вдоль рукояти с ближней стороны.
    slab(buf, hx + px * 8 - UPX * 4, hy + py * 8 - UPY * 4,
      UPX * 0.8 + px * 0.6, UPY * 0.8 + py * 0.6, 19, 3.8,
      [tone[0] * 1.06, tone[1] * 1.01, tone[2] * 0.97], 67, 0, 3);

    /* ── Предплечье ── */
    // Конус в нижний правый угол и ЗА него: рука растёт из кадра, а не висит.
    const wristX = hx - UPX * 14;
    const wristY = hy - UPY * 14;
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = 12 + t * 10;
      ellipse(buf, wristX + (VM + 16 - wristX) * t, wristY + (VM + 18 - wristY) * t, r, r,
        flesh(0.84 - t * 0.12));
    }
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      ellipse(buf, wristX - 7 + (VM - 2 - wristX) * t, wristY - 8 + (VM - 2 - wristY) * t,
        5.5 - t * 1.8, 4.6 - t * 1.4, flesh(1.05));
    }

    contour(buf);
  },
});
