/**
 * Дробящее в правой руке: труба, молоток, кувалда, лом, дубинка, разводной ключ,
 * стул, шокер.
 *
 * ФОРМУ ЗАДАЁТ КЛЕТОЧНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ БОЕВЫХ ЧИСЕЛ. Приём тот
 * же, что у образцового `pistol.ts`, и принят он по той же причине: холст 128×128
 * ложится в кадр 320×200 пиксель в пиксель, и на таком размере любой градиент —
 * мыло, а шум — грязь. Прежняя версия пакета рисовала наклонные плашки с
 * цилиндрической затенкой и попиксельным шумом; выходило гладкое серое пятно без
 * граней, в котором голова не отличалась от древка.
 *
 * Разница с пистолетом одна, и она вынужденная: у дубины ТРИ такта удара, и
 * между ними она ходит через весь кадр под разными углами. Поэтому карта здесь
 * СОБИРАЕТСЯ: геометрия такта штампует в сетку 64×64 не цвета, а КОДЫ
 * МАТЕРИАЛОВ, и дальше идут ровно два прохода пистолета — тела клетками 2×2 и
 * кромки по одному пикселю. Клетка остаётся клеткой, тонов пять, свет
 * сверху-слева. Кисть при этом рукописная: её форму никакая геометрия не выражает.
 *
 * Опознавательный знак класса — МАССА НА КОНЦЕ ПРИ ТОНКОЙ РУКОЯТИ. Кувалда (урон
 * 52) и резиновая дубинка (урон 8) живут в одном силуэте и обязаны читаться
 * по-разному: разницу несёт `skin.bulk`, выведенный из урона, и он же решает и
 * вылет поперечины, и толщину древка. У первой голова вылезает за древко втрое,
 * у второй — лишь чуть толще палки.
 *
 * Ракурс выбран вариатором, а не на глаз: шесть карт дубинки и кувалды под
 * углами 70°..25° к вертикали были отрисованы одним листом. Пологая (70°)
 * укладывается поперёк кадра, и масса на конце теряется у самого края холста;
 * отвесная (25°) повторяет ошибку «вида в торец», от которой отказался пистолет.
 * Диагональ около 40° держит и длину рычага, и голову целиком в кадре — она
 * шире клинка, и боковой запас ей нужен больше.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки ниже сотой
 * закрывает полоса HUD — туда идёт только масса предплечья и пятка древка.
 * Холст прижат к ПРАВОМУ краю кадра: в ЛЕВЫЙ край упираться нельзя, он
 * приходится на середину кадра; наружу можно вправо и вниз.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { blend, contour, put } from '../draw';
import { VM } from '../types';

/** Клетка карты — два пикселя, ровно как у пистолета. */
const CELL = 2;
const GW = VM / CELL;
const GH = VM / CELL;

/**
 * Границы сетки — не вкус, а пороги холста, вбитые в саму запись клетки.
 *
 * Строка 10 — это пиксель 20: выше него силуэт лезет к прицелу, и первым туда
 * уходит именно голова на пике замаха. Столбец 0 — левый край холста, он
 * приходится на середину кадра, и дошедший до него силуэт обрывается
 * вертикальным срезом в воздухе. Столбец 63 упирается в край экрана: наружу
 * можно вправо и вниз.
 */
const TOP_ROW = 10;

/** Коды материалов. Символ называет МАТЕРИАЛ, а не цвет: оттенок решает `skin`. */
const enum M {
  EMPTY = 0,
  STEEL,   // древко и голова
  DARK,    // проушина, тень железа
  FACE,    // боёк: круглый торец, смотрящий на зрителя
  WRAP,    // обмотка под кулаком
  RING,    // кольцо шейки
  GLOVE,   // резина перчатки
  KNUCK,   // сустав пальца
  GAP,     // щель между пальцами
  THUMB,   // большой палец
  CUFF,    // кожаный манжет
  SLEEVE,  // рукав
}

/** Поза одного такта. Угол считается ОТ ВЕРТИКАЛИ, влево — плюс. */
interface Pose {
  /** Кисть на древке, клетки. */
  hx: number; hy: number;
  /** Наклон древка от вертикали, градусы. */
  deg: number;
  /** Габарит от кисти до центра бойка, клетки. */
  len: number;
  /** Разворот головы от поперечника древка: с ним боёк смотрит на зрителя. */
  turn: number;
  /** Приближение к глазу: во столько раз крупнее железо и кисть. */
  z: number;
}

/**
 * Три такта ОДНОГО движения, а не три разные руки.
 *
 * Голова ПРИБЛИЖАЕТСЯ к глазу и встаёт круче (занос), потом проносится поперёк
 * кадра вниз-влево (проводка) и возвращается. Похожие картинки означали бы, что
 * удара в кадре не видно вовсе.
 */
const POSES: Readonly<Record<string, Pose>> = {
  idle: { hx: 46, hy: 45, deg: 40, len: 42, turn: 0.38, z: 1.0 },
  swing: { hx: 50, hy: 48, deg: 23, len: 40, turn: 0.30, z: 1.15 },
  swing2: { hx: 48, hy: 42, deg: 71, len: 39, turn: 0.50, z: 1.05 },
};

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

/**
 * Кисть в перчатке ликвидатора, сжатая на древке.
 *
 * Пальцы — ПОЛОСАМИ ПОПЕРЁК хвата: ряд сустава, ряд щели, снова ряд сустава.
 * Сплошное пятно резины читается куском, а не хватом, — то же правило, по
 * которому у пистолета чередуются `K` и `J`. Ось `y` карты идёт вдоль хвата, от
 * железа к локтю, и карта поворачивается вместе с ним.
 */
const FIST: readonly string[] = [
  '...NNNNNN...',
  '..NNNNNNNN..',
  '.NNNNNNNNNN.',
  '.NNNNNNNNNN.',
  '.JJJJJJJJJJ.',
  '.HHHHHHHHHT.',
  '.NNNNNNNNTT.',
  '.JJJJJJJJJT.',
  '.HHHHHHHHTT.',
  '.NNNNNNNNTT.',
  '.JJJJJJJJJT.',
  '..HHHHHHHT..',
  '..HHHHHHH...',
  '..CCCCCCC...',
  '..CCCCCCC...',
];

const FIST_CODES: Readonly<Record<string, M>> = {
  N: M.KNUCK, H: M.GLOVE, J: M.GAP, T: M.THUMB, C: M.CUFF,
};

/** Запись клетки. Пороги холста проверяются здесь, а не глазами по картинке. */
function set(g: Uint8Array, gx: number, gy: number, code: M): void {
  const x = Math.round(gx);
  const y = Math.round(gy);
  if (x < 1 || x > GW - 2 || y < TOP_ROW || y >= GH) return;
  g[y * GW + x] = code;
}

function at(g: Uint8Array, gx: number, gy: number): M {
  return (gx < 0 || gy < 0 || gx >= GW || gy >= GH) ? M.EMPTY : (g[gy * GW + gx] as M);
}

/** Наклонная плашка в клетках, с сужением от корня к концу. */
function slab(
  g: Uint8Array, x: number, y: number, ax: number, ay: number,
  len: number, h0: number, h1: number, code: M,
): void {
  const nx = -ay;
  const ny = ax;
  const steps = Math.max(1, Math.ceil(len * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = t * len;
    const h = h0 + (h1 - h0) * t;
    for (let s = -h; s <= h; s += 0.5) set(g, x + ax * u + nx * s, y + ay * u + ny * s, code);
  }
}

/** Диск в клетках. Боёк — это диск, а не эллипс с градиентом. */
function disc(g: Uint8Array, cx: number, cy: number, r: number, code: M): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(g, x, y, code);
    }
  }
}

/**
 * Авторская карта, повёрнутая вдоль оси хвата.
 *
 * Обратным отображением, а не прямым: прямое рвёт карту в решето на любом угле,
 * кроме кратного 45°, и кисть рассыпается на отдельные клетки.
 */
function stampFist(g: Uint8Array, cx: number, cy: number, ax: number, ay: number, scale: number): void {
  const w = FIST[0].length;
  const h = FIST.length;
  const rad = Math.ceil((Math.max(w, h) * scale) / 2) + 2;
  const nx = -ay;
  const ny = ax;
  for (let y = Math.round(cy - rad); y <= cy + rad; y++) {
    for (let x = Math.round(cx - rad); x <= cx + rad; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const ly = Math.round((dx * ax + dy * ay) / scale + h / 2);
      const lx = Math.round((dx * nx + dy * ny) / scale + w / 2);
      if (ly < 0 || ly >= h || lx < 0 || lx >= w) continue;
      const code = FIST_CODES[FIST[ly][lx]];
      if (code) set(g, x, y, code);
    }
  }
}

/**
 * Предплечье: конус ВНИЗ и за нижний срез — рука растёт из кадра, а не висит.
 *
 * Уходит вниз, а не в левый угол: кулак ближнего боя сидит на строках 84..100,
 * и конус из него в угол пересёк бы левый край холста ВЫШЕ полосы HUD, а он
 * приходится на середину кадра.
 */
function forearm(g: Uint8Array, wx: number, wy: number, tx: number, ty: number, r0: number): void {
  const d = Math.max(0.001, Math.hypot(tx - wx, ty - wy));
  const ax = (tx - wx) / d;
  const ay = (ty - wy) / d;
  slab(g, wx, wy, ax, ay, d, r0, r0 + 3, M.SLEEVE);
  // Светлая грань по верхне-левой стороне: ею рука и становится круглой.
  slab(g, wx - ay * (r0 - 1), wy + ax * (r0 - 1), ax, ay, d, 1, 1.5, M.GLOVE);
}

registerViewmodel({
  id: 'blunt',
  slot: 'weapon',
  frames: ['idle', 'swing', 'swing2'],
  motion: { recoil: 1.35, bob: 1.25, swap: 0.26 },
  draw({ buf, frame, skin, rand }) {
    const [bD2, bD1, bM, bL, bH] = ramp(skin.body);
    const [gD2, , gM, gL] = ramp(skin.grip);
    const [, aD1, aM] = ramp(skin.accent);
    /* Перчатка ликвидатора, а не голая кисть: голая рука — большое бледное пятно
     * тона бетона, и на пятидесяти пикселях она сливается со стеной при любой
     * анатомии. Тёмная резина держит силуэт, вспышку и кровь.
     *
     * Она ТЕМНЕЕ железа, и это ровно та же задача, что у пистолета, решённая в
     * другую сторону. Там корпус вороненый, и резину пришлось поднять, иначе
     * рука и ствол слипались в одно чёрное пятно. Здесь корпус — светлая сталь,
     * и та же резина слилась бы с ней в одно серое поле. Правило — КОНТРАСТ
     * рука/железо, а не число. */
    const gt = rand();
    const [vD2, vD1, vM, vL] = ramp([54 + gt * 12, 57 + gt * 12, 66 + gt * 14]);
    /** Холодный рефлекс: у резины блик голубовато-серый, а не телесный. */
    const RIM = rgba(122, 138, 160);
    const CUFF = rgba(96, 58, 30);
    const CUFF_LIT = rgba(134, 86, 46);

    /** Тело, светлая кромка, тёмная кромка — по одному на материал. */
    const MATERIAL: Readonly<Record<number, readonly [number, number, number]>> = {
      [M.STEEL]: [bM, bH, bD2],
      [M.DARK]: [bD2, bD1, bD2],
      [M.FACE]: [bL, bH, bM],
      [M.WRAP]: [gM, gL, gD2],
      [M.RING]: [aD1, aM, aD1],
      [M.GLOVE]: [vD1, vM, vD2],
      [M.KNUCK]: [vM, RIM, vD2],
      [M.GAP]: [vD2, vD1, vD2],
      [M.THUMB]: [vM, vL, vD2],
      [M.CUFF]: [CUFF, CUFF_LIT, rgba(48, 28, 14)],
      [M.SLEEVE]: [vD2, vD1, vD2],
    };

    const pose = POSES[frame] ?? POSES.idle;
    const z = pose.z;
    const rad = (pose.deg * Math.PI) / 180;
    const ax = -Math.sin(rad);
    const ay = -Math.cos(rad);
    const nx = -ay;
    const ny = ax;

    /* ── Габарит ──
     * Длина — расстояние от кисти до объявленного центра бойка, а не сумма
     * кусков по `skin`. Иначе тяжёлая голова перерастает отведённое место и
     * обрубается о боковой край холста. */
    const span = pose.len * (0.9 + skin.barrel / 480);
    /* Тяжесть головы: дубинке хватает утолщения, кувалде нужна поперечина.
     * Считается от `skin.bulk`, который идёт от урона, — и это единственная
     * настоящая разница внутри класса. */
    const heavy = Math.max(0, Math.min(1, (skin.bulk - 12) / 7));

    const g = new Uint8Array(GW * GH);

    /* ── Древко ── */
    // Тонкое нарочно: масса читается только по контрасту с рукоятью, и толстая
    // палка отбирает у головы весь вес силуэта. Пятка выступает ЗА кулак —
    // обрезанная у самой кисти труба читается палкой, растущей из ладони.
    const shaft = (1.2 + heavy * 1.5) * z;
    const headHalf = (1.9 + heavy * 3.0) * z;
    const neck = span - headHalf * 0.9;
    slab(g, pose.hx - ax * 12 * z, pose.hy - ay * 12 * z, ax, ay, neck + 12 * z, shaft, shaft, M.STEEL);

    /* ── Голова ── */
    // Поперечина насажена НАИСКОСЬ поперёк древка: строго перпендикулярная
    // читается плюсиком и убивает разворот, ради которого силуэт и построен.
    const hux = nx * Math.cos(pose.turn) - ny * Math.sin(pose.turn);
    const huy = nx * Math.sin(pose.turn) + ny * Math.cos(pose.turn);
    // Обух короче бойка: голова несимметрична, и по этому она читается железом,
    // а не гантелью.
    const headLen = (3.6 + heavy * 9) * z;
    const back = headLen * 0.34;
    const kx = pose.hx + ax * span;
    const ky = pose.hy + ay * span;
    slab(g, kx - hux * back, ky - huy * back, hux, huy, headLen, headHalf, headHalf, M.STEEL);
    /* Тёмная проушина вокруг древка: ею голова и садится на палку. УЗКАЯ: широкая
     * закрывала железо целиком, и голова читалась чёрным пятном на палке. */
    slab(g, kx - ax * headHalf * 0.45, ky - ay * headHalf * 0.45, ax, ay,
      headHalf * 0.9, headHalf * 0.38, headHalf * 0.38, M.DARK);
    // Боёк смотрит на зрителя: круглый светлый торец — вторая половина объёма,
    // ради которой голова и развёрнута.
    const face = headLen - back;
    disc(g, kx + hux * face, ky + huy * face, headHalf * 0.85, M.FACE);
    // Кольцо шейки отделяет железо от древка одной чертой.
    slab(g, pose.hx + ax * neck - nx * shaft * 1.5, pose.hy + ay * neck - ny * shaft * 1.5,
      nx, ny, shaft * 3, 0.5 * z, 0.5 * z, M.RING);

    /* ── Обмотка ── */
    // Единственное на этом оружии, что не металл: под кулаком древко обмотано.
    slab(g, pose.hx - ax * 11 * z, pose.hy - ay * 11 * z, ax, ay, 22 * z,
      shaft * 1.6, shaft * 1.6, M.WRAP);

    /* ── Рука ── */
    /* Предплечье входит из нижнего ПРАВОГО угла и уходит за него: рука растёт из
     * кадра, а не висит в нём. Толщина здесь не украшение — тонкий рукав под
     * полосой HUD не читается вовсе, и дубина повисает в воздухе сама по себе. */
    forearm(g, pose.hx - ax * 10 * z, pose.hy - ay * 10 * z, 56, GH + 10, 8 * z);
    stampFist(g, pose.hx, pose.hy, ax, ay, 1.24 * z);

    /* ── Ржавчина ──
     * У дешёвой трубы её больше. Щербинами вдоль ОДНОЙ стороны древка, а не
     * краплением по всему телу: крапление читается грязью, а не ржавчиной. */
    const chips = Math.round(skin.wear * 7);
    for (let i = 0; i < chips; i++) {
      const u = neck * (0.2 + rand() * 0.7);
      const s = shaft * (0.3 + rand() * 0.7);
      const cx = Math.round(pose.hx + ax * u + nx * s);
      const cy = Math.round(pose.hy + ay * u + ny * s);
      if (at(g, cx, cy) === M.STEEL) set(g, cx, cy, M.DARK);
    }

    /* ── Тела ── */
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const mat = MATERIAL[at(g, gx, gy)];
        if (!mat) continue;
        const x = gx * CELL;
        const y = gy * CELL;
        for (let dy = 0; dy < CELL; dy++) for (let dx = 0; dx < CELL; dx++) put(buf, x + dx, y + dy, mat[0]);
      }
    }

    /* ── Кромки ──
     * Клетка крупная, кромка тонкая: светлая грань сверху и слева, тёмная снизу
     * и справа. Это и есть «свет сверху-слева», и ровно этим плоская заливка
     * перестаёт быть наклейкой. */
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const ch = at(g, gx, gy);
        const mat = MATERIAL[ch];
        if (!mat) continue;
        const x = gx * CELL;
        const y = gy * CELL;
        if (at(g, gx, gy - 1) !== ch) for (let dx = 0; dx < CELL; dx++) put(buf, x + dx, y, mat[1]);
        if (at(g, gx - 1, gy) !== ch) for (let dy = 0; dy < CELL; dy++) put(buf, x, y + dy, mat[1]);
        if (at(g, gx, gy + 1) !== ch) for (let dx = 0; dx < CELL; dx++) put(buf, x + dx, y + CELL - 1, mat[2]);
        if (at(g, gx + 1, gy) !== ch) for (let dy = 0; dy < CELL; dy++) put(buf, x + CELL - 1, y + dy, mat[2]);
      }
    }

    contour(buf);

    /* ── Проводка ──
     * Смаз пройденной дуги за головой: без него удар читается сменой позы, а не
     * движением. Кладётся ПОСЛЕ контура и только им: обведённый контуром, он
     * перестаёт быть смазом и становится вторым телом — залитым сектором в
     * чёрной рамке, который закрывает само оружие.
     *
     * Дуга идёт НАЗАД по ходу удара и ЖЁСТКАЯ, в две ступени плотности с
     * прореживанием через пиксель: плавная заливка по альфе даёт на этом размере
     * серое облако — то самое мыло, ради отказа от которого пакет и переписан. */
    if (frame === 'swing2') {
      const trail = rgba(clamp(skin.body[0] * 1.2 + 46), clamp(skin.body[1] * 1.2 + 50), clamp(skin.body[2] * 1.2 + 56));
      const px = pose.hx * CELL;
      const py = pose.hy * CELL;
      const mid = span * CELL;
      for (const [off, dens] of [[0, 0.62], [-5, 0.34], [5, 0.34]] as const) {
        const r = mid + off;
        const step = 0.9 / r;
        for (let a = 0.2; a <= 0.82; a += step) {
          const rx = ax * Math.cos(a) - ay * Math.sin(a);
          const ry = ax * Math.sin(a) + ay * Math.cos(a);
          const x = Math.round(px + rx * r);
          const y = Math.round(py + ry * r);
          if (((x + y) & 1) === 0) continue;
          /* Смаз подчиняется тем же порогам холста, что и сама карта: он идёт
           * ПОСЛЕ контура, минуя сетку, и без этой проверки уходил выше строки
           * прицела и за боковые столбцы — там, где силуэту нельзя, а следу от
           * него, стало быть, тоже. */
          if (y < TOP_ROW * CELL || x < CELL || x >= VM - CELL) continue;
          blend(buf, x, y, trail, dens * (1 - a / 0.82));
        }
      }
    }
  },
});
