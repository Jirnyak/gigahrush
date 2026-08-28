/**
 * Режущее в правой руке: нож, штык, сапёрная лопата, топор.
 *
 * Пакет держит те же правила, что образцовый `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Рукоять сломана относительно линии «пятка →
 *    остриё» на `cant`, гарда стоит наискось к клинку, а само полотно собрано из
 *    трёх слоёв — полотна, тёмного обуха с тыла и светлой фаски по кромке. Ровно
 *    это читается развёрнутым железом; симметричная плашка читается трубой.
 * 2. СБОРКА ОТ ПЯТКИ РУКОЯТИ. Пятка задаёт низ, рукоять поднимает гарду, от
 *    гарды железо идёт к объявленному острию. Сдвинув пятку, двигаешь всю позу.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина — это расстояние от пятки до острия
 *    позы, а не сумма кусков, посчитанных по `skin`. Иначе тяжёлый клинок
 *    перерастает отведённое место и обрубается о боковой край холста, который
 *    приходится на треть ширины экрана.
 * 4. РУКА РАСТЁТ ИЗ УГЛА. Предплечье уходит в нижний правый угол и за него.
 *
 * Разницу между ножом и топором несёт не отдельная картинка, а `skin.bulk`: у
 * лёгкого клинок продолжает рукоять, у тяжёлого железо насажено щекой на конец
 * топорища. Это единственная настоящая разница внутри класса, и она непрерывна —
 * порога, за которым нож вдруг становится топором, здесь нет.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки ниже сотой
 * закрывает полоса HUD — туда идёт только масса предплечья и пятка рукояти.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { blend, contour, ellipse, skinTone } from '../draw';
import { VM, type ViewmodelSkin } from '../types';

/** Поза одного такта удара. */
interface BladePose {
  /** Пятка рукояти: якорь сборки, уходит под полосу HUD. */
  bx: number; by: number;
  /** Остриё: объявленная рабочая точка, до неё меряется габарит. */
  tx: number; ty: number;
  /** Излом рукояти относительно линии «пятка → остриё», радианы. */
  cant: number;
  /** Приближение к глазу: на пике замаха железо крупнее. */
  zoom: number;
}

/**
 * Три такта ОДНОГО удара, и они нарочно разные: покой держит клинок опущенным
 * вбок и не загораживает кадр, пик замаха заносит его широко влево и вплотную к
 * глазу, проводка роняет его вниз-поперёк. Три похожие картинки означали бы, что
 * удара в кадре не видно вовсе.
 */
const POSES: Readonly<Record<string, BladePose>> = {
  idle: { bx: 102, by: 108, tx: 72, ty: 30, cant: 0.34, zoom: 1 },
  swing: { bx: 100, by: 108, tx: 30, ty: 46, cant: 0.44, zoom: 1.3 },
  swing2: { bx: 92, by: 104, tx: 20, ty: 68, cant: 0.26, zoom: 1.12 },
};

/** Тёмный оттенок базового цвета. Остаётся тройкой: идёт прямо в `slab`. */
const shade = (c: readonly [number, number, number], k: number) =>
  [c[0] * k, c[1] * k, c[2] * k] as const;

/**
 * Наклонная плашка со скруглёнными торцами и цилиндрической затенкой.
 *
 * Собственный примитив пакета, а не общий: силуэт каждого класса — его
 * собственное дело, и повтор между равнозначными пакетами здесь замысел.
 * `tube` из `draw.ts` рисует только по осям холста и наклонное тело выразить
 * не может, а клинок в кадре наклонён всегда.
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
 * Железо: топорище, полотно, обух, щека топора и фаска по кромке.
 *
 * Разницу между ножом и топором несёт `heavy`, а не отдельная картинка, и она
 * непрерывна — порога, за которым нож вдруг становится топором, здесь нет.
 */
function drawSteel(
  buf: Uint32Array, guardX: number, guardY: number, heelX: number, heelY: number,
  ax: number, ay: number, nx: number, ny: number, skin: ViewmodelSkin,
  z: number, heavy: number, haftLen: number, edgeLen: number, wBlade: number,
): void {
  if (haftLen > 4) {
    slab(buf, guardX - ax * 2, guardY - ay * 2, ax, ay, haftLen + 4,
      (2.2 + skin.bulk * 0.17) * z, skin.grip, 11, skin.wear * 0.6, 2);
  }
  /* Полотно: крупное скругление торцов даёт лист, сходящий на остриё. У ножа
   * это весь клинок, у топора оно ужимается до проушины с обухом — иначе
   * поверх щеки торчит второе, ножевое остриё, и вещь читается кайтом. */
  const leafLen = edgeLen * (1 - heavy * 0.42);
  slab(buf, heelX, heelY, ax, ay, leafLen, wBlade, skin.body, 13, skin.wear, leafLen * 0.4);
  // Обух — тёмная полоса с тыльной стороны; ею и читается толщина железа,
  // без неё сталь остаётся плоской наклейкой при любом освещении.
  slab(buf, heelX - nx * (wBlade * 0.62 + heavy * 4 * z),
    heelY - ny * (wBlade * 0.62 + heavy * 4 * z), ax, ay,
    leafLen * 0.84, wBlade * (0.26 + heavy * 0.5), shade(skin.body, 0.46), 17, skin.wear,
    leafLen * 0.3);

  /* Щека топора: веер полос ВБОК от топорища — узко у проушины, высоко у
   * лезвия. Клин, а не овал: овал на палке читается сковородой, а вылет
   * меньше высоты — листом. У ножа `heavy` равен нулю, веер вырождается сам и
   * не рисуется вовсе — порога, за которым нож вдруг становится топором,
   * здесь нет. */
  const bitOut = heavy * (22 + skin.bulk * 1.2) * z;
  const midU = edgeLen * 0.46;
  const bitSteps = 8;
  for (let i = 1; i <= bitSteps && bitOut > 1.5; i++) {
    const t = i / bitSteps;
    const off = bitOut * t;
    const halfLen = edgeLen * (0.3 + t * 0.55) * 0.5;
    slab(buf, heelX + ax * (midU - halfLen) + nx * off, heelY + ay * (midU - halfLen) + ny * off,
      ax, ay, halfLen * 2, bitOut / bitSteps * 0.95, skin.body, 15 + i, skin.wear, 2.5);
  }

  // Фаска ловит свет вдоль режущей кромки — вторая половина того же объёма.
  // Смещение одно на оба облика: у ножа кромка идёт по краю полотна, у топора
  // по внешнему краю щеки, и это ровно одно и то же место.
  const lit = [
    clamp(skin.accent[0] * 1.25 + 62),
    clamp(skin.accent[1] * 1.25 + 66),
    clamp(skin.accent[2] * 1.25 + 72),
  ] as const;
  const bevelOff = wBlade * 0.52 + bitOut;
  const bevelLen = edgeLen * (0.9 - heavy * 0.45);
  slab(buf, heelX + ax * (midU - bevelLen * 0.5) + nx * bevelOff,
    heelY + ay * (midU - bevelLen * 0.5) + ny * bevelOff, ax, ay,
    bevelLen, wBlade * 0.2, lit, 19, 0, bevelLen * 0.42);
}

/**
 * Рукоять с намоткой и кисть на ней.
 *
 * Пальцы — отдельные валики ПОПЕРЁК рукояти с тёмной щелью под каждым.
 * Сплошное телесное пятно читается варежкой, а не хватом.
 */
function drawGripAndHand(
  buf: Uint32Array, pose: BladePose, gux: number, guy: number,
  gripLen: number, gripHalf: number, z: number, skin: ViewmodelSkin,
  tone: readonly [number, number, number], flesh: (k: number) => number,
  hx: number, hy: number,
): void {
  slab(buf, pose.bx, pose.by, gux, guy, gripLen + 2, gripHalf, skin.grip, 29, skin.wear * 0.5, 3);
  // Насечка на щёчке: косые штрихи по живым пикселям, по ним рукоять читается
  // намотанной, а не крашеной.
  const wrapN = Math.max(3, Math.round(gripLen / 5));
  for (let i = 0; i < wrapN; i++) {
    const u = 3 + i * (gripLen - 4) / wrapN;
    const px1 = pose.bx + gux * u;
    const py1 = pose.by + guy * u;
    for (let s = -gripHalf * 0.8; s <= gripHalf * 0.8; s += 0.5) {
      const wx = (px1 - guy * s * 0.45 + gux * s * 0.5) | 0;
      const wy = (py1 + gux * s * 0.45 + guy * s * 0.5) | 0;
      if (wx < 0 || wy < 0 || wx >= VM || wy >= VM) continue;
      if (((buf[wy * VM + wx] >>> 24) & 0xff) === 0) continue;
      buf[wy * VM + wx] = rgba(clamp(skin.grip[0] * 0.62), clamp(skin.grip[1] * 0.62), clamp(skin.grip[2] * 0.66));
    }
  }

  /* ── Кисть ── */
  const fpx = -guy;
  const fpy = gux;
  // Ладонь позади рукояти, вдоль неё.
  slab(buf, hx - gux * 10, hy - guy * 10, gux, guy, 22 * z, 11 * z, tone, 47, 0, 5);
  const fingerLen = 16 * z;
  for (let f = 0; f < 4; f++) {
    const u = gripLen * 0.34 - f * 5 * z;
    const fx = hx + gux * u;
    const fy = hy + guy * u;
    const len = fingerLen - Math.abs(f - 1.4) * 1.6;
    slab(buf, fx - fpx * 10 + 1, fy - fpy * 10 + 1.5, fpx, fpy, len, 3.4 * z, [26, 18, 16], 53 + f, 0, 2.4);
    slab(buf, fx - fpx * 10, fy - fpy * 10, fpx, fpy, len, 2.9 * z,
      [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], 59 + f, 0, 2.4);
    // Сустав ловит свет — без него пальцы читаются трубками.
    ellipse(buf, fx - fpx * 3.5, fy - fpy * 3.5, 2.7 * z, 2.4 * z, flesh(1.2));
  }
  // Большой палец лежит вдоль рукояти с ближней стороны.
  slab(buf, hx + fpx * 7 - gux * 3, hy + fpy * 7 - guy * 3,
    gux * 0.82 + fpx * 0.57, guy * 0.82 + fpy * 0.57, 17 * z, 3.6 * z,
    [tone[0] * 1.06, tone[1] * 1.01, tone[2] * 0.97], 67, 0, 3);
}

/**
 * Предплечье: конус вниз и ЗА нижний край — рука растёт из кадра, а не висит.
 *
 * Уходит он вниз, а не в угол: кулак ближнего боя сидит на строках 84..100,
 * и конус из него в угол пересекает правый край холста ВЫШЕ полосы HUD.
 * Там край приходится на треть ширины экрана, и рука обрывается прямым
 * вертикальным срезом в воздухе. Наружу можно только вниз.
 */
function drawForearm(
  buf: Uint32Array, flesh: (k: number) => number,
  hx: number, hy: number, gux: number, guy: number,
): void {
  const wristX = hx - gux * 13;
  const wristY = hy - guy * 13;
  const outX = VM - 16;
  const outY = VM + 36;
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = 10 + t * 12;
    ellipse(buf, wristX + (outX - wristX) * t, wristY + (outY - wristY) * t, r, r,
      flesh(0.84 - t * 0.12));
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ellipse(buf, wristX - 6 + (outX - 12 - wristX) * t, wristY - 8 + (outY - 6 - wristY) * t,
      5.2 - t * 1.7, 4.4 - t * 1.3, flesh(1.05));
  }
}

/**
 * Смаз пройденной дуги за клинком: без него удар читается сменой позы, а не
 * движением.
 *
 * Кладётся ПОСЛЕ контура и только им. Обведённый контуром, он перестаёт быть
 * смазом и становится вторым телом: залитый сектор в чёрной рамке, который
 * закрывает само оружие.
 */
function drawTrail(
  buf: Uint32Array, guardX: number, guardY: number, ax: number, ay: number,
  bladeSpan: number, skin: ViewmodelSkin,
): void {
  const trail = rgba(
    clamp(skin.body[0] * 1.2 + 46), clamp(skin.body[1] * 1.2 + 50), clamp(skin.body[2] * 1.2 + 56));
  const arcSpan = 0.9;
  const mid = bladeSpan * 0.86;
  const band = bladeSpan * 0.2;
  for (let r = mid - band; r <= mid + band; r += 0.5) {
    // Шаг по углу привязан к радиусу: иначе дуга рассыпается в гребёнку.
    const step = 0.8 / r;
    const across = 1 - Math.abs(r - mid) / band;
    for (let a = 0.14; a <= arcSpan; a += step) {
      const rx = ax * Math.cos(a) - ay * Math.sin(a);
      const ry = ax * Math.sin(a) + ay * Math.cos(a);
      blend(buf, guardX + rx * r, guardY + ry * r, trail,
        across * Math.pow(1 - a / arcSpan, 0.8) * 0.5);
    }
  }
}

registerViewmodel({
  id: 'blade',
  slot: 'weapon',
  frames: ['idle', 'swing', 'swing2'],
  motion: { recoil: 1, bob: 1.1, swap: 0.18 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));

    const pose = POSES[frame] ?? POSES.idle;
    const z = pose.zoom;

    /* ── Габарит ── */
    const spanX = pose.tx - pose.bx;
    const spanY = pose.ty - pose.by;
    const span = Math.hypot(spanX, spanY);
    const sx = spanX / span;
    const sy = spanY / span;
    // Излом рукояти: ось хвата не совпадает с осью железа, и ровно это
    // поворачивает вещь в три четверти. Совпадающие оси дают анфас.
    const gux = sx * Math.cos(pose.cant) - sy * Math.sin(pose.cant);
    const guy = sx * Math.sin(pose.cant) + sy * Math.cos(pose.cant);

    // Тяжесть железа. Лёгкому хватает короткой рукояти, тяжёлому нужен рычаг.
    const heavy = Math.max(0, Math.min(1, (skin.bulk - 8) / 6));
    /* Доля рукояти в габарите. Она не вкусовая: кулак обязан лечь на строки
     * 80..100 холста — ниже сотой его целиком съедает полоса HUD, и в кадре
     * остаётся клинок, висящий над пустым предплечьем. */
    const gripLen = span * (0.30 + heavy * 0.10);
    const guardX = pose.bx + gux * gripLen;
    const guardY = pose.by + guy * gripLen;

    // Клинок — ОСТАТОК габарита от гарды до объявленного острия.
    const bladeX = pose.tx - guardX;
    const bladeY = pose.ty - guardY;
    const bladeSpan = Math.hypot(bladeX, bladeY);
    const ax = bladeX / bladeSpan;
    const ay = bladeY / bladeSpan;
    const nx = -ay;
    const ny = ax;

    const wBlade = (2.4 + skin.bulk * 0.5) * z;
    const gripHalf = (4 + skin.bulk * 0.24) * z;

    /* ── Железо ── */
    // Топорище между гардой и полотном. У ножа оно вырождается почти в ноль:
    // там, где нож продолжает рукоять сталью, топор продолжает её деревом, а
    // железо садится щекой на конец. Это и есть вся разница внутри класса.
    const haftLen = bladeSpan * (0.05 + heavy * 0.9);
    const edgeLen = bladeSpan - haftLen;
    const heelX = guardX + ax * haftLen;
    const heelY = guardY + ay * haftLen;

    drawSteel(buf, guardX, guardY, heelX, heelY, ax, ay, nx, ny, skin,
      z, heavy, haftLen, edgeLen, wBlade);

    /* ── Гарда ── */
    // Перекрестье стоит НАИСКОСЬ к клинку: строго поперечное читается плюсиком
    // и убивает разворот, ради которого весь силуэт и построен.
    const guardHalf = (3.5 + skin.bulk * 0.42) * z * (1 - heavy * 0.55);
    const ga = 0.5;
    const qx = nx * Math.cos(ga) - ny * Math.sin(ga);
    const qy = nx * Math.sin(ga) + ny * Math.cos(ga);
    slab(buf, guardX - qx * guardHalf - ax * 2, guardY - qy * guardHalf - ay * 2,
      qx, qy, guardHalf * 2, 2.4 * z, skin.accent, 23, skin.wear * 0.7, 1.6);

    /* ── Рукоять и кисть ── */
    const handU = gripLen * 0.52;
    const hx = pose.bx + gux * handU;
    const hy = pose.by + guy * handU;
    drawGripAndHand(buf, pose, gux, guy, gripLen, gripHalf, z, skin, tone, flesh, hx, hy);

    /* ── Предплечье ── */
    drawForearm(buf, flesh, hx, hy, gux, guy);

    contour(buf);

    /* ── Проводка ── */
    // Смаз идёт ПОСЛЕ контура и только им: обведённый, он становится вторым
    // телом и закрывает само оружие.
    if (frame === 'swing2') drawTrail(buf, guardX, guardY, ax, ay, bladeSpan, skin);
  },
});
