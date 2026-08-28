/**
 * Пусковая: короткая труба большого калибра с раструбом и соплом.
 *
 * Написана по образцу `pistol.ts` и держит те же четыре правила:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Труба развёрнута боком и наклонена: видно и
 *    раструб на срезе, и венчик сопла сзади, и то, что рукоять висит ПОД
 *    трубой. Прежняя версия смотрела строго в торец и читалась жестяным ведром.
 * 2. СБОРКА ОТ ПЯТКИ РУКОЯТИ. Пятка задаёт низ, рукоять поднимает трубу, труба
 *    идёт от сопла к объявленному срезу. Двигая пятку, двигаешь всё разом.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина трубы — это расстояние от сопла до
 *    среза, а калибр из `skin` решает только толщину и ширину раструба. Труба
 *    нарочно короткая и толстая: этим она и отличается от дробовика.
 * 4. РУКИ РАСТУТ ИЗ УГЛОВ. Правая на рукояти уходит вправо-вниз, левая с
 *    передней ручки — влево-вниз, и обе за край кадра.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, ниже полоса HUD —
 * туда идёт только масса предплечий и пятка рукояти.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, skinTone } from '../draw';
import { VM } from '../types';

/** Пятка пистолетной рукояти — якорь сборки. Уходит под полосу HUD. */
const BUTT_X = 78;
const BUTT_Y = 118;
/** Центр венчика сопла: задний конец трубы. */
const TAIL_X = 102;
const TAIL_Y = 88;
/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = 40;
const MUZZLE_Y = 36;

/* Ось трубы, ОТ СОПЛА К СРЕЗУ. */
const SPAN_X = MUZZLE_X - TAIL_X;
const SPAN_Y = MUZZLE_Y - TAIL_Y;
const SPAN = Math.hypot(SPAN_X, SPAN_Y);
const AX = SPAN_X / SPAN;
const AY = SPAN_Y / SPAN;
/** Поперечная трубы: `+` — верх, `−` — низ, туда висят рукояти. */
const NX = -AY;
const NY = AX;

/** Станция рукояти на оси трубы, считая от сопла. */
const GRIP_U = 26;
/** Станция передней ручки: она заметно ближе к срезу. */
const FORE_U = 52;

/* Ось рукояти, ОТ ПЯТКИ К ТРУБЕ. Знак важен: перепутав его, вся кисть уезжает
 * за нижний край и от руки остаётся одно пятно предплечья. */
const GRIP_DX = TAIL_X + AX * GRIP_U - BUTT_X;
const GRIP_DY = TAIL_Y + AY * GRIP_U - BUTT_Y;
const GRIP_LEN = Math.hypot(GRIP_DX, GRIP_DY);
const UPX = GRIP_DX / GRIP_LEN;
const UPY = GRIP_DY / GRIP_LEN;

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
  id: 'launcher',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 2.4, bob: 0.85, swap: 1.1, flash: 0.11 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));

    const reload = frame === 'reload';
    /* На перезарядке трубу уводят ВНИЗ, и только вниз: вправо её вести нельзя —
     * венчик сопла упрётся в правый край холста, а он приходится на треть
     * ширины экрана и режет силуэт прямой вертикальной линией в воздухе. */
    const dip = reload ? 8 : 0;
    const bx0 = BUTT_X;
    const by0 = BUTT_Y + dip;
    const tx0 = TAIL_X;
    const ty0 = TAIL_Y + dip;
    /** Точка на оси трубы: `u` вдоль неё от сопла, `s` поперёк. */
    const at = (u: number, s = 0) => [tx0 + AX * u + NX * s, ty0 + AY * u + NY * s] as const;

    // Калибр — главный признак пусковой, и он идёт прямо от массы боеприпаса.
    const half = 8 + skin.bulk * 0.17;
    const flare = half * 0.2 + 1;

    /* ── Рукояти ── */
    // Рисуются ДО трубы: труба накрывает их корни, и стык выходит чистым.
    const gripHalf = 7 + skin.bulk * 0.08;
    slab(buf, bx0, by0, UPX, UPY, GRIP_LEN, gripHalf, skin.grip, 11, skin.wear * 0.7, 3);
    for (let i = 0; i < 5; i++) {
      const u = 9 + i * 4.5;
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
    // Передняя ручка: короткий пенёк под трубой, за неё держит левая.
    const [fgX, fgY] = at(FORE_U, -half * 0.4);
    slab(buf, fgX, fgY, -UPX, -UPY, 22, gripHalf * 0.86, skin.grip, 13, skin.wear * 0.7, 3);

    /* ── Труба ── */
    slab(buf, tx0, ty0, AX, AY, SPAN - 6, half, skin.body, 17, skin.wear, 0);
    /* Раструб: развальцован у самого среза, поэтому набирается кольцами, а не
     * одной плашкой. Он нарочно КОРОТКИЙ: длинный конус даёт в силуэте не
     * венчик, а чёрный клин — тень по правой образующей растёт вместе с ним. */
    for (let i = 0; i <= 6; i++) {
      const [rx, ry] = at(SPAN - 6 + i);
      slab(buf, rx, ry, AX, AY, 1.4, half + i * (flare / 6), skin.body, 19 + i, skin.wear, 0);
    }
    /* Кромка раструба одной плашкой ПОПЕРЁК среза, со скруглёнными торцами.
     * Без неё конус кончается острым чёрным рогом: правая образующая у него в
     * тени, и растущие кольца дают в силуэте шип, а не венчик. */
    const [lipX, lipY] = at(SPAN - 2, -(half + flare));
    slab(buf, lipX, lipY, NX, NY, (half + flare) * 2, 2.8,
      [skin.body[0] * 1.2 + 14, skin.body[1] * 1.2 + 14, skin.body[2] * 1.16 + 14], 27, 0, 2.6);
    // Усилительные бандажи: труба тонкостенная, без обручей она читается ведром.
    for (let b = 0; b < 3; b++) {
      const [bxs, bys] = at(14 + b * 14, -half * 0.92);
      slab(buf, bxs, bys, NX, NY, half * 1.8, 1.6,
        [skin.accent[0] * 0.72, skin.accent[1] * 0.66, skin.accent[2] * 0.58], 31 + b, 0, 1);
    }
    // Прицельная планка на верхней образующей, мушка на её же конце.
    const [rsX, rsY] = at(SPAN * 0.5, half * 0.7);
    slab(buf, rsX, rsY, AX, AY, 15, 2.4,
      [skin.body[0] * 0.62, skin.body[1] * 0.62, skin.body[2] * 0.66], 37, 0, 1);
    const [rbX, rbY] = at(SPAN * 0.5 + 14, half * 0.92);
    ellipse(buf, rbX, rbY, 2.4, 2.2, tint(skin.body, 0.4));

    /* ── Венчик сопла ── */
    // Труба уходит за плечо и расширяется назад: без венчика она обрывается.
    for (let i = 0; i <= 6; i++) {
      const [nxs, nys] = at(-i);
      slab(buf, nxs, nys, -AX, -AY, 1.4, half + i * 0.9, skin.body, 41 + i, skin.wear, 0);
    }
    const [nzX, nzY] = at(-6);
    ellipse(buf, nzX, nzY, half * 0.5, half * 0.44, rgba(14, 13, 15));

    /* Спусковая скоба под трубой. Рисуется ПОСЛЕ трубы, потому что висит перед
     * ней, и именно она с одного взгляда говорит «пистолетная рукоять», а не
     * «труба, которую зачем-то держат». */
    const perpX = -UPY;
    const perpY = UPX;
    const gdX = bx0 + UPX * 32 - perpX * 9;
    const gdY = by0 + UPY * 32 - perpY * 9;
    ellipse(buf, gdX, gdY, 10, 9, tint(skin.body, 0.62));
    ellipse(buf, gdX - 0.5, gdY + 0.5, 6.6, 5.8, rgba(0, 0, 0, 0));
    ellipse(buf, gdX + 2, gdY - 3, 2.2, 3.4, tint(skin.body, 0.4));

    /* ── Канал ── */
    // Чёрная дыра во весь калибр — это и есть «большой калибр».
    const [chX, chY] = at(SPAN - 4);
    ellipse(buf, chX, chY, (half + flare) * 0.5, (half + flare) * 0.46, rgba(12, 11, 13));
    if (frame === 'fire') {
      // Сразу после схода раскалены и кромка канала, и стенка раструба.
      ellipse(buf, chX, chY, (half + flare) * 0.46, (half + flare) * 0.42,
        rgba(clamp(skin.accent[0] * 1.5), clamp(skin.accent[1] * 1.05), clamp(skin.accent[2] * 0.5)));
      ellipse(buf, chX, chY, (half + flare) * 0.26, (half + flare) * 0.23, rgba(20, 16, 14));
      // Сопло тоже плюётся: без этого выстрел из трубы выглядит выстрелом из ружья.
      ellipse(buf, nzX, nzY, half * 0.6, half * 0.54,
        rgba(clamp(skin.accent[0] * 1.2), clamp(skin.accent[1] * 0.8), clamp(skin.accent[2] * 0.4)));
    } else {
      // Тупая головка гранаты в канале: заряжено видно, не открывая ничего.
      const head: readonly [number, number, number] = [
        skin.accent[0] * 0.44, skin.accent[1] * 0.52, skin.accent[2] * 0.34,
      ];
      const [hdX, hdY] = at(SPAN - 5);
      ellipse(buf, hdX, hdY, half * 0.44, half * 0.4, rgba(clamp(head[0]), clamp(head[1]), clamp(head[2])));
      ellipse(buf, hdX + NX * half * 0.18, hdY + NY * half * 0.18, half * 0.15, half * 0.13,
        rgba(clamp(head[0] * 1.3), clamp(head[1] * 1.25), clamp(head[2] * 1.15)));
    }

    /* ── Кисти ── */
    /* Пальцы — отдельные валики ПОПЕРЁК рукояти: сплошное телесное пятно
     * читается куском мяса, а не хватом. */
    const grab = (
      hx: number, hy: number, ux: number, uy: number, seed: number, count: number,
    ) => {
      const px = -uy;
      const py = ux;
      slab(buf, hx - ux * 10, hy - uy * 10, ux, uy, 22, 10.5, tone, seed, 0, 5);
      for (let f = 0; f < count; f++) {
        const u = 4 - f * 5.5;
        const fx = hx + ux * u;
        const fy = hy + uy * u;
        const len = 16 - Math.abs(f - 1.4) * 1.4;
        slab(buf, fx - px * 10 + 1, fy - py * 10 + 1.5, px, py, len, 3.4, [26, 18, 16], seed + 3 + f, 0, 2.6);
        slab(buf, fx - px * 10, fy - py * 10, px, py, len, 2.9,
          [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], seed + 11 + f, 0, 2.6);
        ellipse(buf, fx - px * 3, fy - py * 3, 2.7, 2.5, flesh(1.18));
      }
      slab(buf, hx + px * 7 - ux * 4, hy + py * 7 - uy * 4,
        ux * 0.8 + px * 0.6, uy * 0.8 + py * 0.6, 17, 3.6,
        [tone[0] * 1.06, tone[1] * 1.01, tone[2] * 0.97], seed + 19, 0, 3);
    };

    const rhX = bx0 + UPX * 20;
    const rhY = by0 + UPY * 20;
    const lhX = fgX - UPX * 13;
    const lhY = fgY - UPY * 13;
    if (!reload) grab(lhX, lhY, -UPX, -UPY, 53, 3);
    grab(rhX, rhY, UPX, UPY, 71, 4);

    if (reload) {
      /* Свежая граната поднимается к срезу СБОКУ-СНИЗУ, а не висит перед дулом:
       * вынесенная вперёд, она уводит вторую руку в верхний левый угол, и
       * предплечье встаёт поперёк кадра колонной мяса. */
      const [gX, gY] = at(SPAN * 0.8, -half * 2.4);
      const head: readonly [number, number, number] = [
        skin.accent[0] * 0.74, skin.accent[1] * 0.8, skin.accent[2] * 0.46,
      ];
      slab(buf, gX, gY, -AX, -AY, 17, half * 0.46, head, 97, 0, 5);
      slab(buf, gX - AX * 17, gY - AY * 17, -AX, -AY, 7, half * 0.36, skin.accent, 101, 0, 1);
      grab(gX - AX * 9, gY - AY * 9, -AX, -AY, 103, 3);
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
    if (reload) {
      const [gX, gY] = at(SPAN * 0.8, -half * 2.4);
      arm(gX - AX * 4, gY - AY * 4, 10, VM + 26, 5);
    } else {
      arm(lhX - UPX * 8, lhY - UPY * 8, 8, VM + 22, 5);
    }
    arm(rhX - UPX * 12, rhY - UPY * 12, VM + 10, VM + 26, 9);

    contour(buf);
  },
});
