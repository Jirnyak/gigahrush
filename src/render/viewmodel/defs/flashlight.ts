/**
 * Ручной фонарь в левом кулаке.
 *
 * Самая частая вещь в левой руке за всю игру, поэтому силуэт разобран подробнее
 * соседей. Собран по правилам образцового пакета `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Фонарь завален вправо-вверх, срез отражателя
 *    виден наклонным овалом, рифление идёт поперёк оси. Строго анфас он читался
 *    куском трубы, приклеенным к краю кадра.
 * 2. СБОРКА ОТ ЯКОРЯ. Якорь — ПЯТКА КОРПУСА В КУЛАКЕ. От неё вверх по оси идут
 *    рукоять, корпус, раструб и стекло; вниз-влево из того же места растёт
 *    предплечье. Сдвинув якорь, двигаешь всю сборку целиком.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина — это расстояние от якоря до стекла,
 *    и рукоять с корпусом делят её между собой, а не суммируются в неё.
 * 4. РУКА РАСТЁТ ИЗ УГЛА. Предплечье уходит в нижний левый угол и ЗА него.
 *
 * Тот же пакет получает и переносной прожектор ликвидатора: боевых чисел у
 * фонарей нет, облик у обоих один, и развести их может только зерно, засеянное
 * идентификатором вещи. Поэтому калибр берётся из него — прожектор выходит
 * заметно крупнее фонарика.
 *
 * Холст инструмента прижат к ЛЕВОМУ краю кадра и утоплен под нижний срез:
 * строка холста `r` — это строка экрана `80 + r`. Читаемое живёт в строках
 * 30..100, ниже всё съедает полоса HUD, а правее столбца 74 начинается оружие.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, line, skinTone } from '../draw';
import { VM } from '../types';

/** Якорь: пятка корпуса, зажатая в кулаке. Уходит под полосу HUD. */
const HEEL_X = 15;
const HEEL_Y = 103;
/** Наклон оси от вертикали: фонарь завален вправо-вверх, отсюда три четверти. */
const TILT = 0.52;
/** Ось ОТ ПЯТКИ К СТЕКЛУ. */
const AX = Math.sin(TILT);
const AY = -Math.cos(TILT);
/** Поперечная ось: вправо-вниз, ближняя к зрителю сторона корпуса. */
const NX = -AY;
const NY = AX;
/** Габарит от якоря до стекла: фонарик у нижней границы, прожектор у верхней. */
const REACH_MIN = 64;
const REACH_MAX = 70;

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
 * Раструб отражателя: та же наклонная заливка, но полуширина растёт к срезу.
 *
 * Конус — половина всей узнаваемости фонаря, и выразить его стопкой `slab`
 * нельзя: скруглённые торцы каждого куска дали бы гармошку вместо кромки.
 */
function flare(
  buf: Uint32Array,
  x: number, y: number, ax: number, ay: number,
  len: number, half0: number, half1: number,
  base: readonly [number, number, number],
  seed: number, wear: number,
): void {
  const nx = -ay;
  const ny = ax;
  const pad = Math.ceil(Math.max(half0, half1) + 2);
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
      if (u < 0 || u > len) continue;
      const t = u / len;
      // Развал почти прямой: чистая парабола дала бы трубу горниста, а не
      // отражатель фонаря.
      const w = half0 + (half1 - half0) * t * (0.78 + t * 0.22);
      if (Math.abs(v) > w) continue;
      const s = v / w;
      const lit = 1.28 - (s + 0.44) * (s + 0.44) * 0.95;
      const n = (noise(px, py, seed) - 0.5) * (10 + wear * 40);
      buf[py * VM + px] = rgba(
        clamp(base[0] * lit + n), clamp(base[1] * lit + n), clamp(base[2] * lit + n),
      );
    }
  }
}

registerViewmodel({
  id: 'flashlight',
  slot: 'tool',
  frames: ['idle'],
  draw({ buf, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));

    // Насколько высоко кулак сидит на рукояти.
    const hold = 7 + rand() * 3;
    // Калибр: фонарик и прожектор ликвидатора делят и пакет, и облик; отличает
    // их только зерно вещи. Прожектор выходит длиннее и толще — это и есть та
    // разница, по которой их различают в руке.
    const grade = rand();
    const span = REACH_MIN + (REACH_MAX - REACH_MIN) * grade;
    /** Точка на оси корпуса: `u` вдоль неё от пятки, `s` поперёк. */
    const at = (u: number, s = 0) => [HEEL_X + AX * u + NX * s, HEEL_Y + AY * u + NY * s] as const;

    const half = (4.4 + skin.bulk * 0.26) * (0.88 + grade * 0.3);
    const headHalf = half * (1.38 + grade * 0.26);
    // Облик делит объявленный габарит, а не удлиняет его: длинная рукоять
    // означает короткий корпус, и наоборот.
    const gripLen = span * Math.min(0.52, Math.max(0.34, skin.barrel / 38));
    const headLen = span * 0.2;
    /** Ободок отражателя: цилиндрический поясок перед стеклом. */
    const bezelLen = 3.5;

    /* ── Корпус ── */
    // Металлическая труба от рукояти до раструба.
    const [bodyX, bodyY] = at(gripLen - 3);
    slab(buf, bodyX, bodyY, AX, AY, span - headLen - bezelLen - gripLen + 3, half,
      skin.body, 17, skin.wear * 0.4, 2);
    // Резиновая рукоять: чуть толще корпуса, пятка скруглена.
    slab(buf, HEEL_X, HEEL_Y, AX, AY, gripLen, half * 1.08, skin.grip, 23, skin.wear * 0.5, 3);
    // Рифление рукояти: тёмная канавка поперёк оси и светлое ребро над ней. По
    // ним рукоять читается резиной, а не продолжением трубы.
    const ribDark = tint(skin.grip, 0.42);
    const ribLit = tint(skin.grip, 1.9);
    for (let u = 3; u < gripLen - 1.5; u += 3.4) {
      for (let s = -half * 1.05; s <= half * 1.05; s += 0.5) {
        const [gx, gy] = at(u, s);
        const qx = gx | 0;
        const qy = gy | 0;
        if (qx < 0 || qy < 0 || qx >= VM || qy >= VM) continue;
        if (((buf[qy * VM + qx] >>> 24) & 0xff) === 0) continue;
        buf[qy * VM + qx] = ribDark;
      }
      for (let s = -half * 0.85; s <= half * 0.45; s += 0.5) {
        const [gx, gy] = at(u + 1, s);
        const qx = gx | 0;
        const qy = gy | 0;
        if (qx < 0 || qy < 0 || qx >= VM || qy >= VM) continue;
        if (((buf[qy * VM + qx] >>> 24) & 0xff) === 0) continue;
        buf[qy * VM + qx] = ribLit;
      }
    }
    // Хомут между рукоятью и корпусом: без него стык не читается.
    const [clX, clY] = at(gripLen - 2);
    slab(buf, clX, clY, AX, AY, 3, half * 1.14, skin.accent, 29, skin.wear * 0.4, 1);
    // Кнопка на ближней стороне корпуса: тёмный резиновый колпачок с латунным
    // ободком. Без неё цилиндр остаётся трубой.
    const [btX, btY] = at(gripLen + 4, half * 0.5);
    slab(buf, btX, btY, AX, AY, 7, 2.6, [30, 28, 30], 31, 0, 2.4);
    slab(buf, btX + NX * 0.9, btY + NY * 0.9, AX, AY, 7, 1.3, skin.accent, 33, 0, 1.2);

    /* ── Отражатель и стекло ── */
    // Конус отражателя, а за ним прямой поясок: голый конус читается раструбом
    // трубы, поясок делает из него голову фонаря.
    flare(buf, ...at(span - headLen - bezelLen), AX, AY, headLen, half, headHalf * 0.96,
      skin.body, 37, skin.wear * 0.4);
    slab(buf, ...at(span - bezelLen), AX, AY, bezelLen, headHalf, skin.body, 39, skin.wear * 0.3);
    const [lensX, lensY] = at(span - 1.2);
    // Ободок отражателя: наклонный овал среза. Собирается плашкой ПОПЕРЁК оси —
    // осевой эллипс из `draw.ts` встал бы горизонтально и убил три четверти.
    slab(buf, lensX - NX * headHalf, lensY - NY * headHalf, NX, NY, headHalf * 2, 4.8,
      [skin.body[0] * 0.3, skin.body[1] * 0.3, skin.body[2] * 0.34], 41, 0, 4.4);
    // Горячее стекло внутри ободка: плоская заливка вдоль того же овала.
    const glow = skin.glow;
    const core = rgba(
      clamp(skin.accent[0] * 0.4 + 200 * glow),
      clamp(skin.accent[1] * 0.4 + 186 * glow),
      clamp(skin.accent[2] * 0.35 + 150 * glow),
    );
    for (let s = -headHalf * 0.66; s <= headHalf * 0.66; s += 0.6) {
      ellipse(buf, lensX + NX * s, lensY + NY * s, 2.4, 2.2, core);
    }
    // Нить накала: одна яркая точка, иначе стекло читается плоской заплаткой.
    ellipse(buf, lensX - NX * headHalf * 0.22, lensY - NY * headHalf * 0.22, 2.4, 2.2,
      rgba(clamp(196 + 56 * glow), clamp(192 + 52 * glow), clamp(174 + 48 * glow)));
    // Короткий выхлоп света над стеклом. Длиннее делать нельзя: `contour`
    // обводит всё непрозрачное, и дальний ореол стал бы чёрной каймой.
    for (let i = 1; i <= 3; i++) {
      const w = headHalf * (0.58 - i * 0.13);
      const [ax0, ay0] = at(span - 1.2 + i * 1.3, -w);
      const [ax1, ay1] = at(span - 1.2 + i * 1.3, w);
      line(buf, ax0, ay0, ax1, ay1, core, 1);
    }

    /* ── Кисть ── */
    /* Пальцы — отдельные валики ПОПЕРЁК корпуса, и именно они отличают руку от
     * варежки. Между пальцами идёт тёмная щель, иначе они слипаются в одну
     * колбасу. Кисть ЛЕВАЯ: масса уходит влево, к самому краю кадра, а большой
     * палец лежит вдоль корпуса с левой стороны — зеркально правой руке. */
    const [palmX, palmY] = at(hold - 10);
    slab(buf, palmX, palmY, AX, AY, 24, 11.5, tone, 47, 0, 5);
    for (let f = 0; f < 4; f++) {
      const u = hold + 11 - f * 5.4;
      const len = 20 - Math.abs(f - 1.3) * 1.7;
      const [fx, fy] = at(u, -len * 0.72);
      slab(buf, fx + 1, fy + 1.5, NX, NY, len, 3.6, [26, 18, 16], 53 + f, 0, 2.6);
      slab(buf, fx, fy, NX, NY, len, 3.1,
        [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], 59 + f, 0, 2.6);
      // Сустав ловит свет — без него пальцы читаются трубками.
      const [kx, ky] = at(u, -len * 0.34);
      ellipse(buf, kx, ky, 2.9, 2.6, flesh(1.2));
    }
    const [thX, thY] = at(hold - 4, -half * 1.5);
    slab(buf, thX, thY, AX * 0.86 + NX * 0.5, AY * 0.86 + NY * 0.5, 19, 3.8,
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
