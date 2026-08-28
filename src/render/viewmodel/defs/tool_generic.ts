/**
 * Всё прочее, что носят в левой руке: рации, наборы, детекторы, мелок, банки.
 *
 * Пакет намеренно ничего конкретного не изображает. Честный общий силуэт —
 * небольшой ящичек с ремнём и дужкой в кулаке: он читается «в руке что-то
 * есть» и не врёт про то, чего у вещи нет. Отдельный силуэт стоит заводить
 * только той вещи, ради которой игрок и лезет в слот инструмента.
 *
 * Собран по правилам образцового пакета `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Видно и переднюю грань, и узкую боковину, и
 *    наклонный овал крышки. Анфас ящик читался серой плашкой.
 * 2. СБОРКА ОТ ЯКОРЯ. Якорь — ПЯТКА ЯЩИКА В КУЛАКЕ. От неё вверх идут корпус,
 *    крышка и дужка; вниз-влево растёт предплечье.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина — расстояние от якоря до КРЫШКИ, и
 *    ремень с замком делят её, а не удлиняют.
 * 4. РУКА РАСТЁТ ИЗ УГЛА. Предплечье уходит в нижний левый угол и ЗА него.
 *
 * Тринадцать разных вещей делят этот силуэт, поэтому пропорция ящика берётся из
 * зерна, засеянного идентификатором: плоская рация и высокая банка не должны
 * выглядеть одним и тем же предметом.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, line, skinTone } from '../draw';
import { VM } from '../types';

/** Якорь: пятка ящика, зажатая в кулаке. Уходит под полосу HUD. */
const HEEL_X = 20;
const HEEL_Y = 102;
/** Наклон оси от вертикали: ящик держат отвеснее фонаря, но не ровно. */
const TILT = 0.34;
/** Ось ОТ ПЯТКИ К КРЫШКЕ. */
const AX = Math.sin(TILT);
const AY = -Math.cos(TILT);
/** Поперечная ось: вправо-вниз, ближняя к зрителю узкая боковина. */
const NX = -AY;
const NY = AX;
/** Габарит от якоря до крышки: плоская коробка у нижней границы, банка у верхней. */
const REACH_MIN = 38;
const REACH_MAX = 48;

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
       * это читается как «объёмное»; ровная заливка читается наклейкой. */
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
  id: 'tool_generic',
  slot: 'tool',
  frames: ['idle'],
  draw({ buf, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));
    const mat = (c: readonly [number, number, number], k: number) =>
      [c[0] * k, c[1] * k, c[2] * k] as const;

    // Насколько высоко кулак сидит на ящике.
    const hold = 7 + rand() * 3;
    // Пропорция: 0 — плоская широкая коробка, 1 — высокая узкая банка.
    const stout = rand();
    const span = REACH_MIN + (REACH_MAX - REACH_MIN) * stout;
    /** Точка на оси ящика: `u` вдоль неё от пятки, `s` поперёк. */
    const at = (u: number, s = 0) => [HEEL_X + AX * u + NX * s, HEEL_Y + AY * u + NY * s] as const;

    const half = (7 + skin.bulk * 0.7) * (1.06 - stout * 0.16);
    /** Насколько далеко ближняя боковина отходит от передней грани. */
    const sideOff = half * 0.72;

    /* ── Ящик ── */
    // Узкая боковина позади передней грани: она и даёт три четверти.
    slab(buf, ...at(2, sideOff), AX, AY, span - 4, half * 0.44,
      mat(skin.body, 0.6), 11, skin.wear, 1.5);
    // Передняя грань.
    slab(buf, ...at(0), AX, AY, span, half, skin.body, 17, skin.wear, 2);
    // Крышка: наклонный овал верхнего среза. Осевой эллипс из `draw.ts` встал бы
    // горизонтально и убил разворот.
    slab(buf, ...at(span - 1.5, -half), NX, NY, half * 1.44 + sideOff, 2.6,
      mat(skin.body, 1.2), 19, skin.wear * 0.5, 2.2);
    // Шов крышки: тёмная черта под ней, иначе крышка сливается с корпусом.
    const [smX, smY] = at(span - 5, -half);
    slab(buf, smX, smY, NX, NY, half * 2, 0.9, mat(skin.body, 0.42), 23, 0, 0.8);
    // Шильдик на передней грани: тёмное утопленное окошко с латунной рамкой. По
    // нему ящик читается прибором, а не банкой, и не изображает при этом ничего
    // конкретного.
    const [plX, plY] = at(span * 0.32, -half * 0.44);
    slab(buf, plX, plY, AX, AY, span * 0.42, half * 0.34, mat(skin.accent, 0.72), 25, 0, 1.5);
    slab(buf, plX + AX * 1.4 + NX * 0.6, plY + AY * 1.4 + NY * 0.6,
      AX, AY, span * 0.42 - 3, half * 0.24, [24, 24, 28], 27, 0, 1);

    /* ── Ремень и дужка ── */
    // Ремень идёт ВДОЛЬ грани и охватывает крышку: по нему вещь читается
    // переноской, а не кирпичом.
    slab(buf, ...at(1, sideOff * 0.5), AX, AY, span - 1, 2.8, skin.grip, 29, skin.wear * 0.6, 1);
    // Замок ремня на передней грани.
    const [bkX, bkY] = at(span * 0.46, sideOff * 0.5);
    slab(buf, bkX - NX * 3.2, bkY - NY * 3.2, NX, NY, 6.4, 2.4, mat(skin.accent, 0.92), 31, 0, 2);
    // Дужка над крышкой: низкая и тонкая. Высокая дуга превращает ящик в корзину.
    const loopR = half * 0.62;
    const strap = tint(skin.grip, 1.05);
    const strapDark = tint(skin.grip, 0.62);
    let prevX = 0;
    let prevY = 0;
    for (let a = 0; a <= 24; a++) {
      const ang = Math.PI * (a / 24);
      // Дужка стоит над серединой КОРОБКИ, а не над передней гранью: иначе она
      // съезжает влево и читается крюком.
      const [lx, ly] = at(span + Math.sin(ang) * loopR * 0.7, sideOff * 0.5 - Math.cos(ang) * loopR);
      if (a > 0) {
        line(buf, prevX, prevY, lx, ly, strap, 2);
        line(buf, prevX, prevY + 1, lx, ly + 1, strapDark, 1);
      }
      prevX = lx;
      prevY = ly;
    }

    /* ── Кисть ── */
    /* Пальцы — валики ПОПЕРЁК ящика, между ними тёмная щель: сплошное телесное
     * пятно читается куском мяса, а не хватом. Кисть ЛЕВАЯ: масса уходит влево,
     * к самому краю кадра, большой палец лежит вдоль грани с левой стороны —
     * зеркально правой руке. */
    const [palmX, palmY] = at(hold - 10);
    slab(buf, palmX, palmY, AX, AY, 25, 12, tone, 47, 0, 5);
    for (let f = 0; f < 4; f++) {
      const u = hold + 10 - f * 5.6;
      const len = 24 - Math.abs(f - 1.3) * 1.8;
      const [fx, fy] = at(u, -len * 0.66);
      slab(buf, fx + 1, fy + 1.5, NX, NY, len, 3.7, [26, 18, 16], 53 + f, 0, 2.6);
      slab(buf, fx, fy, NX, NY, len, 3.2,
        [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], 59 + f, 0, 2.6);
      const [kx, ky] = at(u, -len * 0.28);
      ellipse(buf, kx, ky, 3, 2.7, flesh(1.2));
    }
    const [thX, thY] = at(hold - 4, -half * 1.24);
    slab(buf, thX, thY, AX * 0.86 + NX * 0.5, AY * 0.86 + NY * 0.5, 19, 3.9,
      [tone[0] * 1.06, tone[1] * 1.01, tone[2] * 0.97], 67, 0, 3);

    /* ── Предплечье ── */
    // Конус в нижний левый угол и ЗА него: рука растёт из кадра, а не висит.
    const [wristX, wristY] = at(hold - 15);
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = 12 + t * 10;
      ellipse(buf, wristX + (-16 - wristX) * t, wristY + (VM + 20 - wristY) * t, r, r,
        flesh(0.84 - t * 0.12));
    }
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      ellipse(buf, wristX + 6 + (-4 - wristX) * t, wristY - 6 + (VM - 4 - wristY) * t,
        5.5 - t * 1.8, 4.6 - t * 1.4, flesh(1.05));
    }

    contour(buf);
  },
});
