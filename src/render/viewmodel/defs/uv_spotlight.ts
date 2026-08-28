/**
 * УФ-прожектор ликвидатора в левой руке.
 *
 * Собран по правилам образцового пакета `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Корпус завален вправо-вверх, срез раструба виден
 *    наклонным овалом, рёбра охлаждения идут поперёк оси. Анфас прожектор
 *    читался куском трубы.
 * 2. СБОРКА ОТ ЯКОРЯ. Якорь — ПЯТКА КОРПУСА В КУЛАКЕ. От неё вверх идут
 *    резиновая пятка, корпус, раструб и стекло; вниз-влево растёт предплечье, а
 *    вправо-вниз уходит кабель к аккумуляторному блоку.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина — расстояние от якоря до СТЕКЛА.
 * 4. РУКА РАСТЁТ ИЗ УГЛА. Предплечье уходит в нижний левый угол и ЗА него.
 *
 * От фонаря отличается пропорцией, а не деталями: корпус короче и заметно
 * толще, раструб шире и развалистее, стекло фиолетовое и забрано решёткой.
 * Штатная вещь ликвидаторов, а не находка, поэтому износ низкий, а питание —
 * отдельным блоком на кабеле.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, line, skinTone } from '../draw';
import { VM } from '../types';

/** Якорь: пятка корпуса, зажатая в кулаке. Уходит под полосу HUD. */
const HEEL_X = 17;
const HEEL_Y = 103;
/** Наклон оси от вертикали: прожектор держат чуть отвеснее фонаря. */
const TILT = 0.46;
/** Ось ОТ ПЯТКИ К СТЕКЛУ. */
const AX = Math.sin(TILT);
const AY = -Math.cos(TILT);
/** Поперечная ось: вправо-вниз, ближняя к зрителю сторона корпуса. */
const NX = -AY;
const NY = AX;
/** Габарит от якоря до стекла. Короче фонаря — и это главное их отличие. */
const REACH = 54;

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
 * Раструб: та же наклонная заливка, но полуширина растёт к срезу.
 *
 * Развал здесь резче, чем у фонаря, и это единственное, чем прожектор опознают
 * с одного взгляда. Стопкой `slab` его не выразить: скруглённые торцы каждого
 * куска дали бы гармошку вместо кромки.
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
      // Раструб колоколом: у корпуса почти цилиндр, у кромки резкий развал.
      const w = half0 + (half1 - half0) * t * t;
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
  id: 'uv_spotlight',
  slot: 'tool',
  frames: ['idle'],
  draw({ buf, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));
    const mat = (c: readonly [number, number, number], k: number) =>
      [c[0] * k, c[1] * k, c[2] * k] as const;

    // Насколько высоко кулак сидит на корпусе.
    const hold = 8 + rand() * 3;
    /** Точка на оси корпуса: `u` вдоль неё от пятки, `s` поперёк. */
    const at = (u: number, s = 0) => [HEEL_X + AX * u + NX * s, HEEL_Y + AY * u + NY * s] as const;

    const half = 5 + skin.bulk * 0.42;
    const headHalf = half * 1.76;
    // Облик делит объявленный габарит, а не удлиняет его.
    const bootLen = REACH * 0.2;
    const headLen = REACH * 0.26;
    /** Отбортованная кромка раструба. */
    const bezelLen = 4;

    /* ── Кабель и аккумулятор ── */
    /* Рисуются ДО корпуса и кисти: кулак перекроет середину провода, и тот
     * честно нырнёт за него, а не ляжет поверх пальцев. Блок держится левее
     * столбца 74 — правее начинается оружие по центру кадра. */
    const cable = tint(skin.grip, 0.8);
    const packX = 51;
    const packY = 93;
    const [cabX, cabY] = at(REACH * 0.5, half * 0.9);
    line(buf, cabX, cabY, packX + 2, packY - 4, cable, 3);
    line(buf, packX + 2, packY - 4, packX + 6, packY + 2, cable, 3);
    // Аккумуляторный блок на поясе, срезанный полосой HUD.
    slab(buf, packX, packY + 2, 0.36, 0.93, 24, 9, mat(skin.body, 0.68), 11, skin.wear, 2);
    slab(buf, packX + 2, packY + 6, 0.36, 0.93, 7, 6, mat(skin.accent, 0.7), 13, 0, 1.5);

    /* ── Корпус ── */
    // Резиновая пятка: ею прожектор ставят на пол, и она же держится в кулаке.
    slab(buf, HEEL_X, HEEL_Y, AX, AY, bootLen, half * 1.06, skin.grip, 17, skin.wear * 0.6, 3);
    // Металлический корпус до раструба.
    slab(buf, ...at(bootLen - 2), AX, AY, REACH - headLen - bezelLen - bootLen + 2, half,
      skin.body, 19, skin.wear, 2);
    // Рёбра охлаждения под раструбом: лампа греется, и это единственная деталь
    // корпуса, которая остаётся видна над кулаком.
    const finDark = tint(skin.body, 0.4);
    const finLit = tint(skin.body, 1.2);
    for (let u = REACH - headLen - bezelLen - 3; u > REACH * 0.46; u -= 4) {
      for (let s = -half * 1.02; s <= half * 1.02; s += 0.5) {
        const [gx, gy] = at(u, s);
        const qx = gx | 0;
        const qy = gy | 0;
        if (qx < 0 || qy < 0 || qx >= VM || qy >= VM) continue;
        if (((buf[qy * VM + qx] >>> 24) & 0xff) === 0) continue;
        buf[qy * VM + qx] = finDark;
      }
      for (let s = -half * 0.8; s <= half * 0.4; s += 0.5) {
        const [gx, gy] = at(u + 1.2, s);
        const qx = gx | 0;
        const qy = gy | 0;
        if (qx < 0 || qy < 0 || qx >= VM || qy >= VM) continue;
        if (((buf[qy * VM + qx] >>> 24) & 0xff) === 0) continue;
        buf[qy * VM + qx] = finLit;
      }
    }
    // Штуцер кабеля на ближней стороне: провод должен во что-то входить.
    slab(buf, ...at(REACH * 0.5 - 3, half * 0.55), NX, NY, 6, 3, mat(skin.body, 0.55), 23, 0, 2);

    /* ── Раструб и стекло ── */
    flare(buf, ...at(REACH - headLen - bezelLen), AX, AY, headLen, half, headHalf * 0.95,
      skin.body, 29, skin.wear * 0.5);
    slab(buf, ...at(REACH - bezelLen), AX, AY, bezelLen, headHalf, skin.body, 31, skin.wear * 0.4);

    const [lensX, lensY] = at(REACH - 1.4);
    const glow = skin.glow;
    // Ободок раструба: наклонный овал среза. Осевой эллипс из `draw.ts` встал бы
    // горизонтально и убил разворот.
    slab(buf, lensX - NX * headHalf, lensY - NY * headHalf, NX, NY, headHalf * 2, 5.4,
      mat(skin.body, 0.3), 37, 0, 5);
    // Фиолетовое стекло: плоская заливка вдоль того же овала.
    const lens = rgba(
      clamp(skin.accent[0] * 0.5 + 62 * glow),
      clamp(skin.accent[1] * 0.32 + 26 * glow),
      clamp(skin.accent[2] * 0.62 + 96 * glow),
    );
    for (let s = -headHalf * 0.72; s <= headHalf * 0.72; s += 0.6) {
      ellipse(buf, lensX + NX * s, lensY + NY * s, 2.8, 2.6, lens);
    }
    // Решётка: три тёмных прута ВДОЛЬ оси поперёк стекла — по ним вещь и
    // опознаётся, и по ним же читается, что срез повёрнут.
    for (let b = -1; b <= 1; b++) {
      const s = b * headHalf * 0.46;
      const [b0x, b0y] = at(REACH - 4.4, s);
      const [b1x, b1y] = at(REACH + 1.4, s);
      line(buf, b0x, b0y, b1x, b1y, rgba(22, 18, 30), 1);
    }
    // Холодный отблеск на дальней кромке.
    const [g0x, g0y] = at(REACH - 1.4, -headHalf * 0.9);
    const [g1x, g1y] = at(REACH - 1.4, -headHalf * 0.4);
    line(buf, g0x, g0y, g1x, g1y,
      rgba(clamp(skin.accent[0] * 0.7 + 64), clamp(skin.accent[1] * 0.6 + 44), clamp(skin.accent[2] * 0.8 + 74)), 1);

    /* ── Кисть ── */
    /* Пальцы — валики ПОПЕРЁК корпуса, между ними тёмная щель: сплошное
     * телесное пятно читается куском мяса, а не хватом. Кисть ЛЕВАЯ: масса
     * уходит влево, к самому краю кадра, большой палец лежит вдоль корпуса с
     * левой стороны — зеркально правой руке. */
    const [palmX, palmY] = at(hold - 10);
    slab(buf, palmX, palmY, AX, AY, 25, 12, tone, 47, 0, 5);
    for (let f = 0; f < 4; f++) {
      const u = hold + 11 - f * 5.6;
      const len = 23 - Math.abs(f - 1.3) * 1.7;
      const [fx, fy] = at(u, -len * 0.68);
      slab(buf, fx + 1, fy + 1.5, NX, NY, len, 3.7, [26, 18, 16], 53 + f, 0, 2.6);
      slab(buf, fx, fy, NX, NY, len, 3.2,
        [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], 59 + f, 0, 2.6);
      const [kx, ky] = at(u, -len * 0.3);
      ellipse(buf, kx, ky, 3, 2.7, flesh(1.2));
    }
    const [thX, thY] = at(hold - 4, -half * 1.3);
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
