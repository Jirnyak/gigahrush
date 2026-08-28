/**
 * Зажигалка в левом кулаке.
 *
 * Собрана по правилам образцового пакета `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Латунная коробочка развёрнута боком: видно и
 *    широкую грань, и узкую боковину, и наклонный овал верхнего среза. Анфас она
 *    читалась плоской наклейкой.
 * 2. СБОРКА ОТ ЯКОРЯ. Якорь — ПЯТКА КОРПУСА В КУЛАКЕ. От неё вверх идут корпус,
 *    петля, откинутая крышка и колёсико; вниз-влево из того же места растёт
 *    предплечье.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина — это расстояние от якоря до
 *    КОЛЁСИКА: там стоит пламя, и оно не имеет права оторваться от железа.
 * 4. РУКА РАСТЁТ ИЗ УГЛА. Предплечье уходит в нижний левый угол и ЗА него.
 *
 * Вещь заведомо мелкая: корпус почти целиком в кулаке, над пальцами остаётся
 * треть коробочки, крышка и язычок пламени. Крупнее рисовать нельзя — рядом
 * фонарь, и разница в размере и есть то, чем зажигалка читается с одного взгляда.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, line, skinTone } from '../draw';
import { VM } from '../types';

/** Якорь: пятка коробочки, зажатая в кулаке. Уходит под полосу HUD. */
const HEEL_X = 20;
const HEEL_Y = 101;
/** Наклон оси от вертикали: коробочку держат завалив вправо-вверх. */
const TILT = 0.44;
/** Ось ОТ ПЯТКИ К КОЛЁСИКУ. */
const AX = Math.sin(TILT);
const AY = -Math.cos(TILT);
/** Поперечная ось: вправо-вниз, ближняя к зрителю узкая боковина. */
const NX = -AY;
const NY = AX;
/** Габарит от якоря до колёсика. Мельче фонаря вдвое — так и задумано. */
const REACH = 36;

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

/** Та же латунь в другой яркости: грань, боковина, срез, колпак. */
function mat(c: readonly [number, number, number], k: number): readonly [number, number, number] {
  return [c[0] * k, c[1] * k, c[2] * k] as const;
}

registerViewmodel({
  id: 'lighter',
  slot: 'tool',
  frames: ['idle'],
  draw({ buf, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));

    // Насколько высоко кулак сидит на коробочке.
    const hold = 4 + rand() * 3;
    /** Точка на оси корпуса: `u` вдоль неё от пятки, `s` поперёк. */
    const at = (u: number, s = 0) => [HEEL_X + AX * u + NX * s, HEEL_Y + AY * u + NY * s] as const;

    const half = 4.6 + skin.bulk * 0.34;
    // Облик делит объявленный габарит: корпус кончается там, где начинается
    // колёсико, и ни на пиксель дальше.
    const bodyLen = REACH - 3;

    /* ── Коробочка ── */
    // Узкая боковина позади широкой грани: она и даёт три четверти.
    slab(buf, ...at(1, half * 0.72), AX, AY, bodyLen - 1, half * 0.42,
      mat(skin.body, 0.66), 13, skin.wear * 0.5, 2);
    // Широкая грань.
    slab(buf, ...at(0), AX, AY, bodyLen, half, skin.body, 19, skin.wear, 2.4);
    // Верхний срез: наклонный овал поперёк оси. Осевой эллипс из `draw.ts` встал
    // бы горизонтально и убил разворот.
    slab(buf, ...at(bodyLen - 1, -half * 0.9), NX, NY, half * 1.8, 2.2,
      mat(skin.body, 1.22), 23, 0, 2);
    // Шов вальцовки поперёк корпуса: по нему коробочка читается штампованной.
    const [smX, smY] = at(bodyLen - 6, -half);
    slab(buf, smX, smY, NX, NY, half * 2, 0.9, mat(skin.body, 0.5), 29, 0, 0.8);
    // Накатка на широкой грани: короткие косые риски, чтобы латунь не была голой.
    for (let i = 0; i < 5; i++) {
      const u = bodyLen - 11 - i * 2.2;
      const [rx0, ry0] = at(u, -half * 0.62);
      const [rx1, ry1] = at(u - 1.6, half * 0.5);
      line(buf, rx0, ry0, rx1, ry1, tint(skin.body, 0.6), 1);
    }

    /* ── Откинутая крышка ── */
    // Петля у дальней грани, колпак завален назад-влево: закрытая зажигалка
    // читалась бы просто бруском.
    const [hgX, hgY] = at(bodyLen - 1, -half * 0.86);
    // Направление колпака: ось, повёрнутая назад-влево примерно на шестьдесят
    // градусов. Ровно поперёк оси он читался бы ложкой, а не откинутой крышкой.
    const lidX = AX * 0.54 - NX * 0.84;
    const lidY = AY * 0.54 - NY * 0.84;
    const lidLen = bodyLen * 0.4;
    const nrm = Math.hypot(lidX, lidY);
    slab(buf, hgX, hgY, lidX / nrm, lidY / nrm, lidLen, half * 0.72,
      mat(skin.body, 0.8), 31, skin.wear * 0.7, 2);
    ellipse(buf, hgX, hgY, 2.4, 2.2, tint(skin.accent, 0.6));

    /* ── Колёсико и пламя ── */
    const [whX, whY] = at(REACH, half * 0.62);
    slab(buf, whX - NX * 2.6, whY - NY * 2.6, NX, NY, 5.2, 2.6,
      mat(skin.body, 0.6), 37, 0, 2.4);
    // Насечка колёсика: три тёмных зуба поперёк него.
    for (let s = -1.6; s <= 1.6; s += 1.6) {
      const [tx, ty] = [whX + NX * s - AX * 2.2, whY + NY * s - AY * 2.2];
      line(buf, tx, ty, tx + AX * 4.4, ty + AY * 4.4, rgba(26, 22, 20), 1);
    }

    // Язычок пламени над колёсиком: капля с перехватом у самого низа. Стоит
    // ВЫШЕ колёсика, иначе закрывает единственную деталь, по которой зажигалка
    // и опознаётся.
    const glow = Math.max(0.25, skin.glow);
    const flameH = Math.round(10 + glow * 7);
    const flameW = 3.4 + glow * 2.4;
    const outer = rgba(clamp(skin.accent[0] * 1.1), clamp(skin.accent[1] * 0.95), clamp(skin.accent[2] * 0.7));
    const core = rgba(
      clamp(skin.accent[0] * 0.35 + 196 * glow),
      clamp(skin.accent[1] * 0.35 + 182 * glow),
      clamp(skin.accent[2] * 0.3 + 110 * glow),
    );
    // Фитиль стоит рядом с колёсиком, с дальней стороны, и пламя растёт из него.
    const [wkX, wkY] = at(REACH - 1, -half * 0.3);
    for (let i = 0; i < flameH; i++) {
      const t = i / flameH;
      // Вершина уходит вверх и чуть назад, как от сквозняка; дрожь берётся из
      // детерминированного шума, а не из ГПСЧ — картинка кэшируется навсегда.
      const drift = t * t * 2.2 + (noise(0, i, 41) - 0.5) * 0.7;
      const cx = wkX + AX * i - NX * drift;
      const cy = wkY + AY * i - NY * drift;
      // Капля: перехват у фитиля, самое широкое место в нижней трети.
      const w = flameW * Math.min(1, (i + 1) / 3.5) * Math.pow(Math.max(0, 1 - t), 0.6);
      line(buf, cx - NX * w, cy - NY * w, cx + NX * w, cy + NY * w, outer, 1);
      const cw = w * 0.45;
      if (cw >= 0.9) line(buf, cx - NX * cw, cy - NY * cw, cx + NX * cw, cy + NY * cw, core, 1);
    }

    /* ── Кисть ── */
    /* Кулак закрывает две трети коробочки: вещь мелкая, и это её главный
     * признак. Пальцы — валики ПОПЕРЁК корпуса, между ними тёмная щель. Кисть
     * ЛЕВАЯ: масса уходит влево, к самому краю кадра, большой палец подведён
     * снизу к колёсику — зеркально правой руке. */
    const [palmX, palmY] = at(hold - 10);
    slab(buf, palmX, palmY, AX, AY, 24, 11.8, tone, 47, 0, 5);
    for (let f = 0; f < 4; f++) {
      const u = hold + 10 - f * 5.4;
      const len = 20 - Math.abs(f - 1.3) * 1.7;
      const [fx, fy] = at(u, -len * 0.7);
      slab(buf, fx + 1, fy + 1.5, NX, NY, len, 3.6, [26, 18, 16], 53 + f, 0, 2.6);
      slab(buf, fx, fy, NX, NY, len, 3.1,
        [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], 59 + f, 0, 2.6);
      const [kx, ky] = at(u, -len * 0.32);
      ellipse(buf, kx, ky, 2.9, 2.6, flesh(1.2));
    }
    // Большой палец тянется вдоль корпуса к колёсику: он его и крутит.
    const [thX, thY] = at(hold - 2, -half * 1.7);
    slab(buf, thX, thY, AX * 0.9 + NX * 0.44, AY * 0.9 + NY * 0.44, 18, 3.8,
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
