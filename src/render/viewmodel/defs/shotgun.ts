/**
 * Дробовик: толстый ствол, деревянное цевьё, приклад в плечо.
 *
 * Переписан по образцу `pistol.ts` и держит те же четыре правила:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Ствол уходит вверх-влево, приклад падает
 *    вниз-вправо, и между их осями есть излом — тот самый отвал приклада, по
 *    которому длинноствол читается длинностволом. Прежняя версия рисовала
 *    дробовик строго сзади, симметричным столбиком труб, и он не читался ничем.
 * 2. СБОРКА ОТ ПЯТКИ ПРИКЛАДА. Пятка задаёт низ, приклад поднимает казну, от
 *    казны корпус идёт к объявленному дулу. Двигая пятку, двигаешь всё разом.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина от казны до дула фиксирована; длина
 *    ствола из `skin` решает только, сколько от неё занимает цевьё, а сколько —
 *    голый ствол. Иначе настильный ствол перерос бы отведённое место и вспышка
 *    оторвалась бы от железа.
 * 4. РУКИ РАСТУТ ИЗ УГЛОВ. Правая уходит в нижний правый угол, левая — в нижний
 *    левый, и обе за край, а не обрываются посреди кадра.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки ниже
 * закрывает полоса HUD — туда идёт только масса приклада и предплечий.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, skinTone } from '../draw';
import { VM } from '../types';

/** Пятка приклада — якорь сборки. Уходит под полосу HUD: там ей и место. */
const BUTT_X = 108;
const BUTT_Y = 124;
/** Казна: там приклад встречает ствольную коробку. */
const BREECH_X = 84;
const BREECH_Y = 84;
/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = 26;
const MUZZLE_Y = 30;

/* Ось приклада, ОТ ПЯТКИ К КАЗНЕ. Она круче оси канала, и разница углов и есть
 * отвал приклада: пятка лежит ниже продолжения канала, как у настоящего ружья. */
const STOCK_DX = BREECH_X - BUTT_X;
const STOCK_DY = BREECH_Y - BUTT_Y;
const STOCK_LEN = Math.hypot(STOCK_DX, STOCK_DY);
const SUX = STOCK_DX / STOCK_LEN;
const SUY = STOCK_DY / STOCK_LEN;

/* Ось канала, ОТ КАЗНЫ К ДУЛУ. */
const SPAN_X = MUZZLE_X - BREECH_X;
const SPAN_Y = MUZZLE_Y - BREECH_Y;
const SPAN = Math.hypot(SPAN_X, SPAN_Y);
const AX = SPAN_X / SPAN;
const AY = SPAN_Y / SPAN;
/** Поперечная канала: `+` — верх-право ружья, `−` — низ-лево, туда всё висит. */
const NX = -AY;
const NY = AX;

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
  id: 'shotgun',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 1.7, bob: 1.1, flash: 0.075 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const tint = (c: readonly [number, number, number], k: number) =>
      rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));

    const reload = frame === 'reload';
    /* На перезарядке ружьё уводят вправо и вниз, а не только вниз: под коробкой
     * начинается полоса HUD, и опущенное строго вниз окно просто исчезает. */
    const shiftX = reload ? 12 : 0;
    const shiftY = reload ? 7 : 0;
    const bx0 = BUTT_X + shiftX;
    const by0 = BUTT_Y + shiftY;
    const cx0 = BREECH_X + shiftX;
    const cy0 = BREECH_Y + shiftY;
    /** Точка на оси канала: `u` вдоль ствола от казны, `s` поперёк. */
    const at = (u: number, s = 0) => [cx0 + AX * u + NX * s, cy0 + AY * u + NY * s] as const;

    const bore = 4.6 + skin.bulk * 0.16;
    const recHalf = 9 + skin.bulk * 0.34;
    // Переломка вместо помпы: ёмкости у неё почти нет, и весь силуэт следует
    // именно отсюда — два ствола рядом вместо трубчатого магазина.
    const twin = skin.magazine <= 5;
    // Облик делит отведённую длину: настильный ствол означает короткое цевьё.
    const forendLen = SPAN * Math.max(0.26, Math.min(0.42, (56 - skin.barrel) / 26));
    const forendU = 20;
    // Цевьё отведено назад на выстреле и на перезарядке — это и есть помпа.
    const pump = frame !== 'idle' && !twin ? 9 : 0;

    /* ── Стволы ── */
    if (twin) {
      // Спарка: два канала бок о бок, ближний перекрывает дальний. Два очка на
      // срезе — единственное, чем переломка отличается от помпы с одного взгляда.
      const [fx, fy] = at(10, bore * 0.86);
      slab(buf, fx, fy, AX, AY, SPAN - 10, bore * 0.8, skin.body, 13, skin.wear, 2);
      const [nx2, ny2] = at(10, -bore * 0.86);
      slab(buf, nx2, ny2, AX, AY, SPAN - 10, bore * 0.8, skin.body, 19, skin.wear, 2);
      const [mfX, mfY] = at(SPAN - bore * 0.7, bore * 0.86);
      ellipse(buf, mfX, mfY, bore * 0.36, bore * 0.32, rgba(12, 11, 13));
      const [mnX, mnY] = at(SPAN - bore * 0.7, -bore * 0.86);
      ellipse(buf, mnX, mnY, bore * 0.36, bore * 0.32, rgba(12, 11, 13));
    } else {
      const [bxs, bys] = at(10);
      slab(buf, bxs, bys, AX, AY, SPAN - 10, bore, skin.body, 13, skin.wear, 2);
      // Очко канала во весь калибр: широкая дыра и есть главный признак картечи.
      const [mzX, mzY] = at(SPAN - bore * 0.8);
      ellipse(buf, mzX, mzY, bore * 0.62, bore * 0.56, rgba(12, 11, 13));
      /* Подствольный магазин. Ёмкость видна тем, НАСКОЛЬКО БЛИЗКО к срезу
       * доходит трубка: у пятизарядного она обрывается на полствола, у
       * ленточного идёт почти до мушки. */
      const magLen = SPAN * Math.max(0.3, Math.min(0.66, skin.magazine / 16));
      const [mgX, mgY] = at(14, -bore * 1.6);
      slab(buf, mgX, mgY, AX, AY, magLen, bore * 0.55, skin.body, 23,
        Math.min(1, skin.wear + 0.08), 2);
      // Хомут, которым трубку притянули к стволу: идёт ОТ трубки К стволу.
      const [clX, clY] = at(14 + magLen - 4, -bore * 2.3);
      slab(buf, clX, clY, NX, NY, bore * 2.1, 2.2,
        [skin.accent[0] * 0.74, skin.accent[1] * 0.7, skin.accent[2] * 0.66], 29, 0, 1);
    }
    // Мушка над каналом: смотрим почти вдоль ствола, и она торчит над дулом.
    const [fsX, fsY] = at(SPAN - 7, bore * 1.05);
    ellipse(buf, fsX, fsY, 2.6, 2.4, tint(skin.body, 0.42));

    /* ── Цевьё ── */
    const foreHalf = bore + 6.5;
    const [feX, feY] = at(forendU - pump, -bore * 0.9);
    slab(buf, feX, feY, AX, AY, forendLen, foreHalf, skin.grip, 37, skin.wear * 0.7, 4);
    // Продольные насечки по дереву: без них колодка читается пластилином.
    for (let i = 0; i < 3; i++) {
      const s = (i - 1) * foreHalf * 0.5;
      for (let u = 3; u < forendLen - 3; u += 0.5) {
        const [qx, qy] = at(forendU - pump + u, -bore * 0.9 + s);
        const ix = qx | 0;
        const iy = qy | 0;
        if (ix < 0 || iy < 0 || ix >= VM || iy >= VM) continue;
        if (((buf[iy * VM + ix] >>> 24) & 0xff) === 0) continue;
        buf[iy * VM + ix] = tint(skin.grip, 0.62);
      }
    }

    /* ── Ствольная коробка ── */
    /* Коробка сидит НИЖЕ линии канала, а не по её оси: ствол лежит сверху, и
     * именно этот уступ читается профилем длинноствола, а не трубой. */
    const [rcX, rcY] = at(-8, -recHalf * 0.42);
    slab(buf, rcX, rcY, AX, AY, 30, recHalf, skin.body, 41, skin.wear, 3);
    // Окно выброса на ближней щеке: на выстреле распахнуто и оттуда летит гильза.
    const [ejX, ejY] = at(3, recHalf * 0.2);
    slab(buf, ejX, ejY, AX, AY, 10, frame === 'fire' ? recHalf * 0.3 : recHalf * 0.18,
      [0, 0, 0], 43, 0, 1);
    if (frame === 'fire') {
      const [shX, shY] = at(9, recHalf * 1.5);
      slab(buf, shX, shY, NX, NY, 11, 3.4,
        [clamp(skin.accent[0] * 0.62), clamp(skin.accent[1] * 0.36), clamp(skin.accent[2] * 0.3)], 47, 0, 2);
      slab(buf, shX, shY, NX, NY, 4, 3.4, skin.accent, 53, 0, 1);
    }
    // Спусковая скоба под коробкой, со стороны стрелка.
    const [gdX, gdY] = at(-1, -recHalf * 1.5);
    ellipse(buf, gdX, gdY, 9.5, 8.5, tint(skin.body, 0.62));
    ellipse(buf, gdX - 0.5, gdY - 0.5, 6.2, 5.4, rgba(0, 0, 0, 0));
    ellipse(buf, gdX + 1, gdY - 3, 2.2, 3.4, tint(skin.body, 0.4));

    /* ── Приклад ── */
    // Шейка тонкая, колодка широкая: одна плашка такого перепада не выражает.
    slab(buf, bx0, by0, SUX, SUY, STOCK_LEN - 8, 8.5, skin.grip, 59, skin.wear * 0.6, 3);
    slab(buf, bx0, by0, SUX, SUY, STOCK_LEN * 0.62, 13.5, skin.grip, 61, skin.wear * 0.6, 4);
    // Затыльник: тёмная плашка поперёк пятки.
    slab(buf, bx0 - SUX * 2, by0 - SUY * 2, -SUY, SUX, 26, 3, [30, 26, 24], 67, 0, 2);

    /* ── Кисти ── */
    /* Пальцы — отдельные валики ПОПЕРЁК цевья и шейки, и именно они отличают
     * руку от варежки: сплошное телесное пятно читается куском мяса. */
    // Левая на цевье: ладонь под колодкой, пальцы обхватывают её снизу.
    const [lhX, lhY] = at(forendU - pump + forendLen * 0.5, -foreHalf * 1.9);
    slab(buf, lhX - AX * 11, lhY - AY * 11, AX, AY, 22, 9.5, tone, 71, 0, 5);
    for (let f = 0; f < 4; f++) {
      const u = forendU - pump + forendLen * 0.5 + 7 - f * 5.5;
      const [fxs, fys] = at(u, -foreHalf * 2.5);
      slab(buf, fxs + 1, fys + 1.5, NX, NY, 13, 3.3, [26, 18, 16], 73 + f, 0, 2.6);
      slab(buf, fxs, fys, NX, NY, 13, 2.8,
        [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], 79 + f, 0, 2.6);
      ellipse(buf, fxs + NX * 8, fys + NY * 8, 2.6, 2.4, flesh(1.18));
    }

    // Правая на шейке приклада: та же схема, но ось поперечная прикладу.
    const handU = STOCK_LEN - 12;
    const hx = bx0 + SUX * handU;
    const hy = by0 + SUY * handU;
    const px = -SUY;
    const py = SUX;
    slab(buf, hx - SUX * 10, hy - SUY * 10, SUX, SUY, 22, 10.5, tone, 83, 0, 5);
    for (let f = 0; f < 4; f++) {
      const u = 4 - f * 5.5;
      const fx = hx + SUX * u;
      const fy = hy + SUY * u;
      const len = 16 - Math.abs(f - 1.4) * 1.4;
      slab(buf, fx - px * 10 + 1, fy - py * 10 + 1.5, px, py, len, 3.4, [26, 18, 16], 89 + f, 0, 2.6);
      slab(buf, fx - px * 10, fy - py * 10, px, py, len, 2.9,
        [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], 97 + f, 0, 2.6);
      ellipse(buf, fx - px * 3, fy - py * 3, 2.7, 2.5, flesh(1.18));
    }
    // Большой палец лежит вдоль шейки с ближней стороны.
    slab(buf, hx + px * 7 - SUX * 4, hy + py * 7 - SUY * 4,
      SUX * 0.8 + px * 0.6, SUY * 0.8 + py * 0.6, 17, 3.6,
      [tone[0] * 1.06, tone[1] * 1.01, tone[2] * 0.97], 101, 0, 3);

    // На перезарядке свежий патрон идёт в распахнутое окно с ближней щеки.
    if (reload) {
      const [pcX, pcY] = at(2, recHalf * 2.1);
      slab(buf, pcX, pcY, -NX, -NY, 15, 4.2,
        [clamp(skin.accent[0] * 0.62), clamp(skin.accent[1] * 0.36), clamp(skin.accent[2] * 0.3)], 103, 0, 2);
      slab(buf, pcX, pcY, -NX, -NY, 5, 4.2, skin.accent, 107, 0, 1);
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
    arm(lhX - AX * 12, lhY - AY * 12, 6, VM + 20, 5);
    arm(hx - SUX * 12, hy - SUY * 12, VM + 6, VM + 24, 9);

    contour(buf);
  },
});
