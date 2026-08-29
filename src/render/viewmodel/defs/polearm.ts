/**
 * Длинное в двух руках: арматура, багор, грабли, цепь на черенке, штык на палке.
 *
 * ФОРМУ ЗАДАЁТ КЛЕТОЧНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ БОЕВЫХ ЧИСЕЛ. Приём тот
 * же, что у образцового `pistol.ts`, и принят он по той же причине: холст 128×128
 * ложится в кадр 320×200 пиксель в пиксель, и на таком размере любой градиент —
 * мыло, а шум — грязь. Прежняя версия пакета рисовала наклонные плашки с
 * цилиндрической затенкой и попиксельным шумом; древко выходило гладкой серой
 * макарониной, а рабочий конец — птичьей лапой.
 *
 * Разница с пистолетом одна, и она вынужденная: у древкового ТРИ такта удара, и
 * между ними оно ходит через весь кадр под разными углами. Поэтому карта здесь
 * СОБИРАЕТСЯ: геометрия такта штампует в сетку 64×64 не цвета, а КОДЫ
 * МАТЕРИАЛОВ, и дальше идут ровно два прохода пистолета — тела клетками 2×2 и
 * кромки по одному пикселю. Клетка остаётся клеткой, тонов пять, свет
 * сверху-слева. Кисти при этом рукописные: их форму никакая геометрия не выражает.
 *
 * Опознавательный знак класса — ДЛИНА И ДВЕ РУКИ НА ДРЕВКЕ. Вылет здесь берут
 * рычагом, а не массой, и обе кисти обязаны быть видны врозь: одна кисть на
 * палке — это дубина, две — это древковое.
 *
 * ДЛИНА ЧИТАЕТСЯ СУЖЕНИЕМ, А НЕ РАЗМЕРОМ. Ракурс выбран вариатором: шесть карт
 * под углами 85°..40° к вертикали были отрисованы одним листом. Пологое древко
 * (85°) укладывается поперёк кадра и упирается в боковые столбцы холста, которые
 * приходятся на треть ширины экрана; отвесное теряет вылет. Диагональ около 42°
 * даёт самый длинный отрезок, целиком помещающийся в холст, и разводит кулаки по
 * ГОРИЗОНТАЛИ, оставляя над передним длинный участок голого древка. Сужение к
 * рабочему концу — прямо с авторского листа рефов (`Blood`, тычок вилами): у
 * тычкового оружия древко сходит к центру кадра, и ровно это читается «вглубь».
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки ниже сотой
 * закрывает полоса HUD — туда идёт только масса предплечий и пятка древка.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { blend, contour, put } from '../draw';
import { VM } from '../types';
import type { ViewmodelSkin } from '../types';

/** Клетка карты — два пикселя, ровно как у пистолета. */
const CELL = 2;
const GW = VM / CELL;
const GH = VM / CELL;

/**
 * Границы сетки — не вкус, а пороги холста, вбитые в саму запись клетки.
 *
 * Строка 10 — это пиксель 20: выше него силуэт лезет к прицелу. Столбцы 0 и 63 —
 * боковые края холста, и у ДЛИННОГО оружия именно они опаснее всего: древко
 * длиннее любого другого силуэта и первым уходит вбок. Наружу можно только вниз.
 */
const TOP_ROW = 10;

/** Коды материалов. Символ называет МАТЕРИАЛ, а не цвет: оттенок решает `skin`. */
const enum M {
  EMPTY = 0,
  STEEL,   // древко, сокет, зубья
  DARK,    // пояски, тень железа
  EDGE,    // заточка по внутренней стороне крюка
  WRAP,    // обмотка под кулаками
  GLOVE,   // резина перчатки
  KNUCK,   // сустав пальца
  GAP,     // щель между пальцами
  THUMB,   // большой палец
  CUFF,    // кожаный манжет
  SLEEVE,  // рукав
}

/** Поза одного такта. Угол считается ОТ ВЕРТИКАЛИ, влево — плюс. */
interface Pose {
  /** Задняя кисть: якорь сборки, клетки. */
  hx: number; hy: number;
  /** Наклон древка от вертикали, градусы. */
  deg: number;
  /** Габарит от задней кисти до острия крюка, клетки. */
  len: number;
  /** Приближение к глазу. */
  z: number;
}

/**
 * Три такта ОДНОГО движения, а не три разные руки.
 *
 * Древко ПРИБЛИЖАЕТСЯ к глазу и встаёт круче (занос), потом рабочий конец
 * проносится вниз-влево (проводка) и возвращается. Похожие картинки означали бы,
 * что удара в кадре не видно вовсе.
 */
const POSES: Readonly<Record<string, Pose>> = {
  idle: { hx: 50, hy: 50, deg: 42, len: 52, z: 1.0 },
  swing: { hx: 54, hy: 54, deg: 26, len: 46, z: 1.1 },
  swing2: { hx: 52, hy: 46, deg: 68, len: 46, z: 1.04 },
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
 * Сплошное пятно резины читается куском, а две сплошных — одним куском мяса, и
 * хват перестаёт читаться вовсе. Ось `y` карты идёт вдоль хвата, от железа к
 * локтю, и карта поворачивается вместе с ним.
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
 * Уходит вниз, а не в боковой угол: кулаки сидят на строках 60..100, и конус из
 * них в угол пересёк бы край холста ВЫШЕ полосы HUD, где край приходится на
 * треть ширины экрана.
 */
function forearm(g: Uint8Array, wx: number, wy: number, tx: number, ty: number, r0: number): void {
  const d = Math.max(0.001, Math.hypot(tx - wx, ty - wy));
  const ax = (tx - wx) / d;
  const ay = (ty - wy) / d;
  slab(g, wx, wy, ax, ay, d, r0, r0 + 3, M.SLEEVE);
  // Светлая грань по верхне-левой стороне: ею рука и становится круглой.
  slab(g, wx - ay * (r0 - 1), wy + ax * (r0 - 1), ax, ay, d, 1, 1.5, M.GLOVE);
}

/**
 * Цвет каждого материала карты: тело, светлая кромка, тёмная кромка.
 *
 * Отдельной функцией, потому что `draw` упиралась в потолок длины инварианта, а
 * палитра — единственная её часть, не зависящая ни от кадра, ни от позы.
 */
function palette(
  skin: ViewmodelSkin,
  rand: () => number,
): Readonly<Record<number, readonly [number, number, number]>> {
  const [bD2, bD1, bM, bL, bH] = ramp(skin.body);
  const [gD2, , gM, gL] = ramp(skin.grip);
  /* Перчатка ликвидатора, а не голая кисть: голая рука — большое бледное пятно
   * тона бетона, и на пятидесяти пикселях она сливается со стеной при любой
   * анатомии. Тёмная резина держит силуэт, вспышку и кровь.
   *
   * Она ТЕМНЕЕ железа, и это ровно та же задача, что у пистолета, решённая в
   * другую сторону. Там корпус вороненый, и резину пришлось поднять, иначе рука
   * и ствол слипались в одно чёрное пятно. Здесь древко — светлая сталь, и та же
   * резина слилась бы с ней в одно серое поле. Правило — КОНТРАСТ рука/железо, а
   * не число. */
  const gt = rand();
  const [vD2, vD1, vM, vL] = ramp([54 + gt * 12, 57 + gt * 12, 66 + gt * 14]);
  /** Холодный рефлекс: у резины блик голубовато-серый, а не телесный. */
  const RIM = rgba(122, 138, 160);
  const CUFF = rgba(96, 58, 30);
  const CUFF_LIT = rgba(134, 86, 46);

  return {
    [M.STEEL]: [bM, bH, bD2],
    [M.DARK]: [bD2, bD1, bD2],
    [M.EDGE]: [bH, bH, bL],
    [M.WRAP]: [gM, gL, gD2],
    [M.GLOVE]: [vD1, vM, vD2],
    [M.KNUCK]: [vM, RIM, vD2],
    [M.GAP]: [vD2, vD1, vD2],
    [M.THUMB]: [vM, vL, vD2],
    [M.CUFF]: [CUFF, CUFF_LIT, rgba(48, 28, 14)],
    [M.SLEEVE]: [vD2, vD1, vD2],
  };
}

registerViewmodel({
  id: 'polearm',
  slot: 'weapon',
  frames: ['idle', 'swing', 'swing2'],
  motion: { recoil: 1.2, bob: 1.3, swap: 0.28 },
  draw({ buf, frame, skin, rand }) {
    const MATERIAL = palette(skin, rand);

    const pose = POSES[frame] ?? POSES.idle;
    const z = pose.z;
    const rad = (pose.deg * Math.PI) / 180;
    const ax = -Math.sin(rad);
    const ay = -Math.cos(rad);
    const nx = -ay;
    const ny = ax;

    /* ── Габарит ──
     * Длина — расстояние от задней кисти до объявленного острия; сокет, зубья и
     * загиб ДЕЛЯТ этот отрезок, а не удлиняют его. Иначе рабочий конец уезжает
     * за боковой край холста, который приходится на треть ширины экрана. */
    const span = pose.len * (0.92 + skin.barrel / 700);
    /* Пятка выступает ЗА заднюю кисть и уходит под нижний срез: обрезанное у
     * самой ладони древко читается палкой, растущей из кулака. */
    const heel = 10 * z;

    const g = new Uint8Array(GW * GH);

    /* ── Древко ──
     * Прут тонкий нарочно, и он СУЖАЕТСЯ к рабочему концу. Толстое древко на
     * таком вылете читается бревном; ровное по всей длине — палкой, лежащей
     * поперёк экрана. Длину силуэту даёт отношение длины к толщине И сужение:
     * второе и есть перспектива, без которой оружие не уходит вглубь кадра. */
    const butt = (3.0 + skin.bulk * 0.1) * z;
    const tipW = butt * 0.5;
    const sockU = span * 0.82;
    slab(g, pose.hx - ax * heel, pose.hy - ay * heel, ax, ay, sockU + heel, butt, tipW, M.STEEL);
    // Пояски по древку: без них длинная труба читается ровной палкой и теряет и
    // масштаб, и направление. Шаг СОКРАЩАЕТСЯ к концу — та же перспектива.
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const u = sockU * (t * t * 0.55 + t * 0.45);
      const h = butt + (tipW - butt) * (u / sockU);
      slab(g, pose.hx + ax * u - nx * h, pose.hy + ay * u - ny * h, nx, ny, h * 2, 0.5 * z, 0.5 * z, M.DARK);
    }

    /* ── Рабочий конец ──
     * Сокет короткий нарочно: крупный рабочий конец съедает то самое отношение
     * длины к толщине, которым силуэт и читается длинным. */
    const sx = pose.hx + ax * sockU;
    const sy = pose.hy + ay * sockU;
    slab(g, sx - ax * 2 * z, sy - ay * 2 * z, ax, ay, 5 * z, tipW * 1.5, tipW * 1.4, M.STEEL);
    /* Зубья веером на ОДНУ сторону: разведённые в разные стороны они с крюком
     * посередине читаются пассатижами, а не крюком с гребёнкой. Длина берётся от
     * габарита — короткие зубья на длинном древке пропадают в контуре. */
    const prong = span * 0.18;
    for (const a of [-0.72, -0.36]) {
      const rx = ax * Math.cos(a) - ay * Math.sin(a);
      const ry = ax * Math.sin(a) + ay * Math.cos(a);
      slab(g, sx, sy, rx, ry, prong * 0.9, tipW * 0.8, tipW * 0.4, M.STEEL);
    }
    // Крюк по оси: тем, что он загнут, багор и отличается от прута.
    slab(g, sx, sy, ax, ay, prong, tipW * 0.9, tipW * 0.45, M.STEEL);
    const ba = 0.95;
    const bx = ax * Math.cos(ba) - ay * Math.sin(ba);
    const by = ax * Math.sin(ba) + ay * Math.cos(ba);
    slab(g, sx + ax * prong * 0.86, sy + ay * prong * 0.86, bx, by, prong * 0.55,
      tipW * 0.75, tipW * 0.4, M.STEEL);
    // Светлая фаска по внутренней стороне крюка: она и читается заточкой.
    slab(g, sx + nx * tipW * 0.8, sy + ny * tipW * 0.8, ax, ay, prong * 0.85, 0.5, 0.5, M.EDGE);

    /* ── Хват ──
     * Две точки хвата и есть признак класса: задняя толкает, передняя ведёт.
     * Доли выбраны по холсту, а не по вкусу: ближе них кулаки сливаются в один
     * кусок резины, дальше — передний уезжает к рабочему концу и над ним не
     * остаётся того голого древка, ради которого класс и существует. */
    const frontU = span * 0.44;
    const fx = pose.hx + ax * frontU;
    const fy = pose.hy + ay * frontU;
    const frontH = butt + (tipW - butt) * (frontU / sockU);
    /** Обмотка под каждым кулаком. Кладётся своим шагом ниже, поверх древка. */
    const wraps = () => {
      slab(g, pose.hx - ax * 7 * z, pose.hy - ay * 7 * z, ax, ay, 13 * z, butt * 1.28, butt * 1.24, M.WRAP);
      slab(g, fx - ax * 5.5 * z, fy - ay * 5.5 * z, ax, ay, 10 * z, frontH * 1.4, frontH * 1.34, M.WRAP);
    };
    wraps();

    /* ── Ржавчина ──
     * У дешёвых грабель её больше. Щербинами вдоль ОДНОЙ стороны древка, а не
     * краплением по всему телу: крапление читается грязью, а не ржавчиной. */
    const chips = Math.round(skin.wear * 9);
    for (let i = 0; i < chips; i++) {
      const u = sockU * (0.12 + rand() * 0.8);
      const h = butt + (tipW - butt) * (u / sockU);
      const s = h * (0.2 + rand() * 0.75);
      const cx = Math.round(pose.hx + ax * u + nx * s);
      const cy = Math.round(pose.hy + ay * u + ny * s);
      if (at(g, cx, cy) === M.STEEL) set(g, cx, cy, M.DARK);
    }

    /* ── Руки ──
     * Оба предплечья уходят ВНИЗ за срез, и в разные стороны: сведённые в одну
     * точку они складываются в общий кусок мяса под оружием. Кисти нарочно мельче
     * одноручных пакетов — две крупные съедают древко, а без древка класса нет. */
    forearm(g, fx - ax * 8 * z, fy - ay * 8 * z, 30, GH + 18, 4.5 * z);
    forearm(g, pose.hx - ax * 9 * z, pose.hy - ay * 9 * z, 58, GH + 12, 6 * z);
    /* Древко ПОВЕРХ предплечий, от пятки до передней кисти. Уходящий к бойцу
     * конец ближе к глазу, чем его собственные руки, и без этого куска вся
     * нижняя половина древка тонет в мясе: длинное оружие превращается в
     * короткое, зажатое в двух кулаках. */
    slab(g, pose.hx - ax * heel, pose.hy - ay * heel, ax, ay, heel + frontU, butt * 0.86, frontH, M.STEEL);
    wraps();
    stampFist(g, fx, fy, ax, ay, 0.94 * z);
    stampFist(g, pose.hx, pose.hy, ax, ay, 1.06 * z);

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
     * Смаз пройденной дуги за рабочим концом: без него удар читается сменой позы,
     * а не движением. Кладётся ПОСЛЕ контура и только им: обведённый контуром, он
     * перестаёт быть смазом и становится вторым телом — залитым сектором в чёрной
     * рамке, который закрывает само оружие.
     *
     * Дуга идёт НАЗАД по ходу удара и ЖЁСТКАЯ, в две ступени плотности с
     * прореживанием через пиксель: плавная заливка по альфе даёт на этом размере
     * серое облако — то самое мыло, ради отказа от которого пакет и переписан. */
    if (frame === 'swing2') {
      const trail = rgba(clamp(skin.body[0] * 1.2 + 46), clamp(skin.body[1] * 1.2 + 50), clamp(skin.body[2] * 1.2 + 56));
      const px = pose.hx * CELL;
      const py = pose.hy * CELL;
      const mid = span * CELL * 0.92;
      for (const [off, dens] of [[0, 0.6], [-5, 0.32], [5, 0.32]] as const) {
        const r = mid + off;
        const step = 0.9 / r;
        for (let a = 0.18; a <= 0.62; a += step) {
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
          blend(buf, x, y, trail, dens * (1 - a / 0.62));
        }
      }
    }
  },
});
