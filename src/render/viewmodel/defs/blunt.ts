/**
 * Дробящее в правой руке: труба, молоток, кувалда, лом, дубинка, разводной ключ.
 *
 * Пакет держит те же правила, что образцовый `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Древко идёт по диагонали, кисть сломана
 *    относительно него на `cant`, а голова насажена ПОПЕРЁК древка и развёрнута
 *    к зрителю бойком. Виден профиль обуха и круглый торец — именно так вещь
 *    читается железом на палке, а не куском трубы анфас.
 * 2. СБОРКА ОТ ПЯТКИ ДРЕВКА. Пятка задаёт низ, древко поднимает шейку, на
 *    шейке сидит голова. Сдвинув пятку, двигаешь всю позу целиком.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина — расстояние от пятки до объявленного
 *    центра бойка, а не сумма кусков по `skin`. Иначе тяжёлая голова
 *    перерастает отведённое место и обрубается о боковой край холста, который
 *    приходится на треть ширины экрана.
 * 4. РУКА РАСТЁТ ИЗ УГЛА. Предплечье уходит в нижний правый угол и за него.
 *
 * Насколько тяжела голова, решает `skin.bulk` (он идёт от урона), насколько
 * ржаво древко — `skin.wear` (он идёт от цены вещи). Поэтому кувалда и резиновая
 * дубинка живут в одном силуэте и всё равно читаются по-разному: у первой
 * поперечина вылезает за древко вдвое, у второй голова лишь чуть толще палки.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки ниже сотой
 * закрывает полоса HUD — туда идёт только масса предплечья и пятка древка.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { blend, contour, ellipse, skinTone } from '../draw';
import { VM } from '../types';

/** Поза одного такта удара. */
interface BluntPose {
  /** Пятка древка: якорь сборки, уходит под полосу HUD. */
  bx: number; by: number;
  /** Центр бойка: объявленная рабочая точка, до неё меряется габарит. */
  kx: number; ky: number;
  /** Излом кисти относительно линии «пятка → боёк», радианы. */
  cant: number;
  /** Разворот головы от поперечника древка: с ним боёк смотрит на зрителя. */
  turn: number;
  /** Приближение к глазу: на пике замаха железо крупнее. */
  zoom: number;
}

/**
 * Три такта ОДНОГО удара, и они нарочно разные: покой роняет голову вправо-вниз
 * и не загораживает кадр, пик замаха заносит её широко влево и вплотную к глазу,
 * проводка проносит её вниз-поперёк. Три похожие картинки означали бы, что удара
 * в кадре не видно вовсе.
 */
const POSES: Readonly<Record<string, BluntPose>> = {
  idle: { bx: 112, by: 120, kx: 76, ky: 44, cant: 0.30, turn: 0.38, zoom: 1 },
  swing: { bx: 114, by: 112, kx: 34, ky: 46, cant: 0.40, turn: 0.30, zoom: 1.3 },
  swing2: { bx: 96, by: 116, kx: 24, ky: 76, cant: 0.24, turn: 0.5, zoom: 1.12 },
};

/**
 * Наклонная плашка со скруглёнными торцами и цилиндрической затенкой.
 *
 * Собственный примитив пакета, а не общий: силуэт каждого класса — его
 * собственное дело, и повтор между равнозначными пакетами здесь замысел.
 * `tube` из `draw.ts` рисует только по осям холста и наклонное тело выразить
 * не может, а древко в кадре наклонено всегда.
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
  id: 'blunt',
  slot: 'weapon',
  frames: ['idle', 'swing', 'swing2'],
  motion: { recoil: 1.35, bob: 1.25, swap: 0.26 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const shade = (c: readonly [number, number, number], k: number) =>
      [c[0] * k, c[1] * k, c[2] * k] as const;

    const pose = POSES[frame] ?? POSES.idle;
    const z = pose.zoom;

    /* ── Габарит ── */
    const spanX = pose.kx - pose.bx;
    const spanY = pose.ky - pose.by;
    const span = Math.hypot(spanX, spanY);
    const ax = spanX / span;
    const ay = spanY / span;
    const nx = -ay;
    const ny = ax;
    // Излом кисти: ось хвата не совпадает с осью древка, и ровно это
    // поворачивает вещь в три четверти. Совпадающие оси дают анфас.
    const gux = ax * Math.cos(pose.cant) - ay * Math.sin(pose.cant);
    const guy = ax * Math.sin(pose.cant) + ay * Math.cos(pose.cant);

    // Тяжесть головы. Дубинке хватает утолщения, кувалде нужна поперечина.
    const heavy = Math.max(0, Math.min(1, (skin.bulk - 12) / 8));
    const shaftHalf = (2.4 + skin.bulk * 0.17) * z;
    // Голова тем длиннее рычага, чем легче: тяжёлую сажают ближе к кулаку.
    const headLen = (6 + skin.bulk * 0.5 + heavy * 11) * z;
    const headHalf = (3.2 + skin.bulk * 0.3) * z;
    // Шейка — граница древка и железа. Всё, что выше неё, это уже голова.
    const neckU = span - headHalf * 0.9;

    /* ── Древко ── */
    // Пятка нарочно выступает за кулак: обрезанная у самой кисти труба читается
    // палкой, растущей из ладони.
    slab(buf, pose.bx - ax * 12 * z, pose.by - ay * 12 * z, ax, ay,
      neckU + 12 * z, shaftHalf, skin.body, 21, skin.wear, 3);

    /* ── Голова ── */
    // Поперечина насажена НАИСКОСЬ поперёк древка: строго перпендикулярная
    // читается плюсиком и убивает разворот, ради которого силуэт и построен.
    const hux = nx * Math.cos(pose.turn) - ny * Math.sin(pose.turn);
    const huy = nx * Math.sin(pose.turn) + ny * Math.cos(pose.turn);
    // Обух короче бойка: голова несимметрична, и по этому она читается железом,
    // а не гантелью.
    const back = headLen * 0.34;
    const face = headLen - back;
    const kx = pose.kx;
    const ky = pose.ky;
    slab(buf, kx - hux * back, ky - huy * back, hux, huy, headLen, headHalf,
      skin.body, 33, skin.wear, headHalf * 0.55);
    // Тёмный проушник вокруг древка: им голова и садится на палку.
    slab(buf, kx - ax * headHalf * 0.85, ky - ay * headHalf * 0.85, ax, ay,
      headHalf * 1.7, headHalf * 1.05, shade(skin.body, 0.52), 35, skin.wear, 2);
    // Боёк смотрит на зрителя: круглый торец со светом — вторая половина
    // объёма, ради которой голова и развёрнута.
    const faceX = kx + hux * face;
    const faceY = ky + huy * face;
    ellipse(buf, faceX, faceY, headHalf * 1.02, headHalf * 0.92,
      rgba(clamp(skin.body[0] * 1.24 + 16), clamp(skin.body[1] * 1.24 + 18), clamp(skin.body[2] * 1.22 + 20)));
    ellipse(buf, faceX - hux * 1.6, faceY - huy * 1.6, headHalf * 0.62, headHalf * 0.55,
      rgba(clamp(skin.body[0] * 0.76), clamp(skin.body[1] * 0.76), clamp(skin.body[2] * 0.8)));
    // Кольцо шейки отделяет железо от древка одной тёмной чертой.
    const ringHalf = shaftHalf * 1.5;
    slab(buf, pose.bx + ax * neckU - nx * ringHalf, pose.by + ay * neckU - ny * ringHalf,
      nx, ny, ringHalf * 2, 1.8 * z, shade(skin.accent, 0.4), 39, 0, 1);

    /* ── Обмотка ── */
    // Единственное на этом оружии, что не металл: под кулаком древко обмотано.
    const handU = span * 0.3;
    const hx = pose.bx + ax * handU;
    const hy = pose.by + ay * handU;
    slab(buf, hx - ax * 13 * z, hy - ay * 13 * z, ax, ay, 26 * z, shaftHalf * 1.28,
      skin.grip, 27, skin.wear * 0.4, 2);

    /* ── Кисть ── */
    /* Пальцы — отдельные валики ПОПЕРЁК древка с тёмной щелью под каждым.
     * Сплошное телесное пятно читается варежкой, а не хватом. */
    const fpx = -guy;
    const fpy = gux;
    slab(buf, hx - gux * 11, hy - guy * 11, gux, guy, 24 * z, 11.5 * z, tone, 47, 0, 5);
    for (let f = 0; f < 4; f++) {
      const u = 6 * z - f * 5.4 * z;
      const fx = hx + gux * u;
      const fy = hy + guy * u;
      const len = (16.5 - Math.abs(f - 1.4) * 1.6) * z;
      slab(buf, fx - fpx * 10 + 1, fy - fpy * 10 + 1.5, fpx, fpy, len, 3.5 * z, [26, 18, 16], 53 + f, 0, 2.6);
      slab(buf, fx - fpx * 10, fy - fpy * 10, fpx, fpy, len, 3 * z,
        [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], 59 + f, 0, 2.6);
      // Сустав ловит свет — без него пальцы читаются трубками.
      ellipse(buf, fx - fpx * 3.5, fy - fpy * 3.5, 2.8 * z, 2.5 * z, flesh(1.2));
    }
    // Большой палец лежит вдоль древка с ближней стороны.
    slab(buf, hx + fpx * 7.5 - gux * 3, hy + fpy * 7.5 - guy * 3,
      gux * 0.82 + fpx * 0.57, guy * 0.82 + fpy * 0.57, 18 * z, 3.7 * z,
      [tone[0] * 1.06, tone[1] * 1.01, tone[2] * 0.97], 67, 0, 3);

    /* ── Предплечье ── */
    /* Конус вниз и ЗА нижний край: рука растёт из кадра, а не висит в нём.
     *
     * Уходит он вниз, а не в угол: кулак ближнего боя сидит на строках 84..104,
     * и конус из него в угол пересекает правый край холста ВЫШЕ полосы HUD.
     * Там край приходится на треть ширины экрана, и рука обрывается прямым
     * вертикальным срезом в воздухе. Наружу можно только вниз. */
    const wristX = hx - gux * 13;
    const wristY = hy - guy * 13;
    const outX = VM - 16;
    const outY = VM + 36;
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = 10.5 + t * 12;
      ellipse(buf, wristX + (outX - wristX) * t, wristY + (outY - wristY) * t, r, r,
        flesh(0.84 - t * 0.12));
    }
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      ellipse(buf, wristX - 6 + (outX - 12 - wristX) * t, wristY - 8 + (outY - 6 - wristY) * t,
        5.4 - t * 1.8, 4.5 - t * 1.4, flesh(1.05));
    }

    contour(buf);

    /* ── Проводка ── */
    /* На втором такте за головой стоит смаз пройденной дуги: без него удар
     * читается сменой позы, а не движением.
     *
     * Смаз кладётся ПОСЛЕ контура и только им. Обведённый контуром, он
     * перестаёт быть смазом и становится вторым телом: залитый сектор в чёрной
     * рамке, который закрывает само оружие. */
    if (frame === 'swing2') {
      const trail = rgba(
        clamp(skin.body[0] * 1.2 + 46), clamp(skin.body[1] * 1.2 + 50), clamp(skin.body[2] * 1.2 + 56));
      const arcSpan = 0.84;
      const band = headHalf * 1.4;
      for (let r = span - band; r <= span + band; r += 0.5) {
        // Шаг по углу привязан к радиусу: иначе дуга рассыпается в гребёнку.
        const step = 0.8 / r;
        const across = 1 - Math.abs(r - span) / band;
        for (let a = 0.16; a <= arcSpan; a += step) {
          const rx = ax * Math.cos(a) - ay * Math.sin(a);
          const ry = ax * Math.sin(a) + ay * Math.cos(a);
          blend(buf, pose.bx + rx * r, pose.by + ry * r, trail,
            across * Math.pow(1 - a / arcSpan, 0.8) * 0.5);
        }
      }
    }
  },
});
