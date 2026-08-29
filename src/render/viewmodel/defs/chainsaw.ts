/**
 * Бензопила: корпус с ручкой-скобой, шина с зубьями, обе руки.
 *
 * ФОРМУ ЗАДАЁТ КЛЕТОЧНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ БОЕВЫХ ЧИСЕЛ. Приём тот
 * же, что у образцового `pistol.ts`, и принят он по той же причине: холст 128×128
 * ложится в кадр 320×200 пиксель в пиксель, и на таком размере любой градиент —
 * мыло, а шум — грязь. Прежняя версия пакета рисовала наклонные плашки с
 * цилиндрической затенкой и попиксельным шумом: цилиндрическая затенка клала на
 * дальний борт картера почти чёрное, и половина силуэта уходила в пятно.
 *
 * Разница с пистолетом одна, и она вынужденная: у пилы ТРИ такта замаха, и между
 * ними она ходит целиком под разными углами. Поэтому карта здесь СОБИРАЕТСЯ:
 * геометрия такта штампует в сетку 64×64 не цвета, а КОДЫ МАТЕРИАЛОВ, и дальше
 * идут ровно два прохода пистолета — тела клетками 2×2 и кромки по одному
 * пикселю. Клетка остаётся клеткой, тонов пять, свет сверху-слева. Кисти при
 * этом рукописные: их форму никакая геометрия не выражает.
 *
 * Опознавательный знак класса — ЗУБЬЯ. Без них шина читается ломом, и весь силуэт
 * теряет смысл: пила — самая узнаваемая вещь в руках, и узнаётся она кромкой, а
 * не корпусом. Поэтому зубья выкладываются ПОКЛЕТОЧНО по обеим кромкам шины, а не
 * заливаются плашкой.
 *
 * Шина выходит из НИЖНЕГО переднего угла картера, а не из его середины: только
 * так петля скобы проходит над корпусом, не задевая цепь, и только так левой руке
 * есть где взяться, не залезая пальцами на зубья.
 *
 * Ракурс выбран вариатором: шесть карт пилы под углами 75°..30° к вертикали и с
 * разной долей корпуса были отрисованы одним листом. Пологая (75°) укладывает
 * шину поперёк кадра и упирается в левый столбец холста, который приходится на
 * середину кадра; отвесная прячет зубья за собственным корпусом. Диагональ
 * около 40° показывает обе кромки шины во всю длину и оставляет корпусу низ
 * кадра, где его и держат руки.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки ниже сотой
 * закрывает полоса HUD — туда идёт только масса предплечий и пятка рукояти.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, put } from '../draw';
import { VM } from '../types';

/** Клетка карты — два пикселя, ровно как у пистолета. */
const CELL = 2;
const GW = VM / CELL;
const GH = VM / CELL;

/**
 * Границы сетки — не вкус, а пороги холста, вбитые в саму запись клетки.
 *
 * Строка 10 — это пиксель 20: выше него силуэт лезет к прицелу, и первым туда
 * уходит нос шины на пике замаха. Столбец 0 — левый край холста, он приходится
 * на середину кадра: шина длинная и лезет туда сразу за древковыми. Столбец 63
 * упирается в край экрана, и наружу можно вправо и вниз.
 */
const TOP_ROW = 10;

/** Длина задней рукояти от пятки до картера, клетки. */
const GRIP_LEN = 15;

/** Коды материалов. Символ называет МАТЕРИАЛ, а не цвет: оттенок решает `skin`. */
const enum M {
  EMPTY = 0,
  BODY,    // корпус картера
  COWL,    // верхняя крышка
  DARKB,   // крышка сцепления, тень корпуса
  VENT,    // щели вентиляции
  BAR,     // шина
  GROOVE,  // паз шины: по нему ходит цепь
  TOOTH,   // зуб
  HANDLE,  // скоба и задняя рукоять
  HAND_LIT,// блик на скобе
  GLOVE,   // резина перчатки
  KNUCK,   // сустав пальца
  GAP,     // щель между пальцами
  THUMB,   // большой палец
  CUFF,    // кожаный манжет
  SLEEVE,  // рукав
}

/** Поза одного такта. Угол считается ОТ ВЕРТИКАЛИ, влево — плюс. */
interface Pose {
  /** Корень шины: там задняя рукоять встречает низ картера, клетки. */
  rx: number; ry: number;
  /** Наклон шины от вертикали, градусы. */
  deg: number;
  /** Габарит от корня до носа шины, клетки. */
  span: number;
  /** Наклон задней рукояти от вертикали, радианы. */
  gripT: number;
  /** Приближение к глазу. */
  z: number;
}

/**
 * Три такта ОДНОГО движения, а не три разные пилы.
 *
 * Пила тяжёлая, она ходит целиком: в заносе поднята, встала круче и придвинута к
 * глазу, на проводке шина ушла вниз-влево и корпус провалился следом.
 */
const POSES: Readonly<Record<string, Pose>> = {
  idle: { rx: 46, ry: 43, deg: 40, span: 42, gripT: -0.42, z: 1.0 },
  swing: { rx: 50, ry: 47, deg: 24, span: 39, gripT: -0.30, z: 1.08 },
  swing2: { rx: 48, ry: 41, deg: 66, span: 40, gripT: -0.70, z: 1.03 },
};

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

/**
 * Кисть в перчатке ликвидатора, сжатая на хвате.
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

/** Диск в клетках. Носовая звёздочка — это диск, а не эллипс с градиентом. */
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
 * Предплечье: конус ВНИЗ и за нижний срез — руки растут из кадра, а не висят.
 *
 * Уходят они вниз, а не в левый угол: кулаки сидят на строках 66..100, и конус
 * из них в угол пересёк бы левый край холста ВЫШЕ полосы HUD, а он приходится на
 * середину кадра.
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
  id: 'chainsaw',
  slot: 'weapon',
  frames: ['idle', 'swing', 'swing2'],
  // Дула пила не объявляет: она не стреляет, вспышке негде стоять.
  motion: { recoil: 0.45, bob: 1.25, swap: 0.5 },
  draw({ buf, frame, skin, rand }) {
    const [oD2, oD1, oM, oL, oH] = ramp(skin.body);
    const [, sD1, sM, , sH] = ramp(skin.accent);
    const [gD2, gD1, gM, gL] = ramp(skin.grip);
    /* Перчатка ликвидатора, а не голая кисть: голая рука — большое бледное пятно
     * тона бетона, и на пятидесяти пикселях она сливается со стеной при любой
     * анатомии. Тёмная резина держит силуэт и кровь.
     *
     * Она ТЕМНЕЕ и железа шины, и оранжевого картера. У пистолета резину
     * пришлось поднять над вороненым стволом, здесь корпус — самое светлое пятно
     * кадра, и рука обязана уйти вниз по тону, иначе две руки из четырёх крупных
     * пятен силуэта сливаются с ним. Правило — КОНТРАСТ, а не число. */
    const gt = rand();
    const [vD2, vD1, vM, vL] = ramp([54 + gt * 12, 57 + gt * 12, 66 + gt * 14]);
    /** Холодный рефлекс: у резины блик голубовато-серый, а не телесный. */
    const RIM = rgba(122, 138, 160);
    const CUFF = rgba(96, 58, 30);
    const CUFF_LIT = rgba(134, 86, 46);
    const BORE = rgba(14, 13, 15);

    /** Тело, светлая кромка, тёмная кромка — по одному на материал. */
    const MATERIAL: Readonly<Record<number, readonly [number, number, number]>> = {
      [M.BODY]: [oM, oH, oD2],
      [M.COWL]: [oD1, oL, oD2],
      [M.DARKB]: [oD2, oD1, oD2],
      [M.VENT]: [BORE, oL, BORE],
      [M.BAR]: [sM, sH, sD1],
      [M.GROOVE]: [BORE, BORE, BORE],
      [M.TOOTH]: [sH, sH, sM],
      [M.HANDLE]: [gM, gL, gD2],
      [M.HAND_LIT]: [gL, gL, gD1],
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
    /** Точка на оси шины: `u` вдоль неё от корня, `s` поперёк (плюс — вверх). */
    const P = (u: number, s = 0) => [pose.rx + ax * u + nx * s, pose.ry + ay * u + ny * s] as const;

    const g = new Uint8Array(GW * GH);

    /* ── Габарит ──
     * Облик ДЕЛИТ отведённую длину, а не удлиняет её: длинная шина означает
     * короткий картер. Иначе шина уезжает к прицелу и вылезает за верхний порог
     * холста, а на замахе — и за боковой. */
    const span = pose.span;
    const bodyLen = span * Math.max(0.30, Math.min(0.48, 1 - skin.barrel / 150));
    const bodyHalf = (4.4 + skin.bulk * 0.08) * z;
    // Картер сидит НАД осью шины: его середина поднята почти на полтолщины.
    const rise = bodyHalf * 0.45;
    const barHalf = (1.7 + skin.bulk * 0.02) * z;
    const barFrom = bodyLen * 0.85;
    const barLen = span - barFrom;

    /* ── Шина с зубьями ──
     * Рисуется ПЕРВОЙ: картер потом закрывает её корень, как и в железе. */
    const [barX, barY] = P(barFrom);
    slab(g, barX, barY, ax, ay, barLen, barHalf, barHalf, M.BAR);
    // Паз шины: тёмная канавка по оси, по ней ходит цепь.
    slab(g, barX + ax * 3, barY + ay * 3, ax, ay, barLen - 7, 0.5, 0.5, M.GROOVE);
    // Носовая звёздочка: шина закруглена, а не обрублена.
    const [tipX, tipY] = P(span);
    disc(g, tipX, tipY, barHalf + 0.6, M.BAR);
    /* Зубья ПОКЛЕТОЧНО по обеим кромкам. Заливкой полосой кромка сливается в
     * сплошную линию, и пила читается ломом; узнаваемость класса держится
     * целиком на этом чередовании зуба и впадины. */
    for (let u = 3; u <= barLen - 1; u += 3) {
      const [bx, by] = P(barFrom + u);
      for (const side of [-1, 1]) {
        // Зуб наклонён против хода цепи, поэтому со сносом назад по оси шины.
        set(g, bx + nx * side * (barHalf + 0.7) - ax * 0.4, by + ny * side * (barHalf + 0.7) - ay * 0.4, M.TOOTH);
        set(g, bx + nx * side * (barHalf + 1.5) - ax * 1.2, by + ny * side * (barHalf + 1.5) - ay * 1.2, M.TOOTH);
      }
    }

    /* ── Скоба ──
     * Петля идёт НАД картером и спускается к его переднему низу — там за неё и
     * берётся левая рука, в стороне от цепи. Рисуется ДО картера: нарисованная
     * поверх, она кладёт тёмную диагональ через оранжевый борт, и корпус
     * перестаёт читаться корпусом. Видимыми остаются дуга над корпусом и
     * передняя нога вниз к кисти. */
    const bow = (t: number): readonly [number, number] => {
      const u = bodyLen * (0.05 + t * 0.95);
      // Дуга поднята НАД верхним скатом картера и круто падает у переднего края:
      // проходя по борту, она читалась бы тёмной диагональю на корпусе.
      const s = rise + bodyHalf * 1.34 + Math.sin(t * Math.PI) * bodyHalf * 0.5
        - Math.pow(t, 2.4) * bodyHalf * 3.05;
      return P(u, s);
    };
    const drawBow = (from: number) => {
      for (let i = from; i <= 40; i++) {
        const [hx, hy] = bow(i / 40);
        disc(g, hx, hy, 1.1 * z, i % 5 === 0 ? M.HAND_LIT : M.HANDLE);
      }
    };
    drawBow(0);

    /* ── Картер ── */
    const [caseX, caseY] = P(0, rise);
    slab(g, caseX, caseY, ax, ay, bodyLen, bodyHalf, bodyHalf, M.BODY);
    /* Верхняя крышка. Без неё борт такого размера — половина силуэта одним
     * ровным оранжевым полем; крышка со своим тоном разбивает его и читается
     * пластиковым кожухом. */
    const [cowlX, cowlY] = P(bodyLen * 0.08, rise + bodyHalf * 0.68);
    slab(g, cowlX, cowlY, ax, ay, bodyLen * 0.82, bodyHalf * 0.3, bodyHalf * 0.3, M.COWL);
    // Крышка сцепления: она прячет вход шины в картер.
    const [clX, clY] = P(bodyLen * 0.74, rise * 0.3);
    disc(g, clX, clY, bodyHalf * 0.36, M.DARKB);
    /* Вентиляция картера: КОРОТКИЕ щели поперёк оси, у заднего борта. Длинные
     * складывались в чёрное поле посреди корпуса, и картер читался дырой, а не
     * бортом. */
    for (let i = 0; i < 4; i++) {
      const [vx, vy] = P(bodyLen * 0.18 + i * 3.4, rise - bodyHalf * 0.62);
      slab(g, vx, vy, nx, ny, bodyHalf * 0.5, 0.4, 0.4, M.VENT);
    }
    // Крышка бака на верхнем скате.
    const [capX, capY] = P(bodyLen * 0.24, rise + bodyHalf * 0.28);
    disc(g, capX, capY, 1.4 * z, M.DARKB);
    // Передняя нога скобы идёт ПЕРЕД картером: за неё берётся левая кисть, и без
    // повтора поверх корпуса рука висела бы, не держась ни за что.
    drawBow(27);

    /* ── Задняя рукоять ── */
    const upx = Math.sin(pose.gripT);
    const upy = -Math.cos(pose.gripT);
    const heelX = pose.rx - upx * GRIP_LEN * z;
    const heelY = pose.ry - upy * GRIP_LEN * z;
    slab(g, heelX, heelY, upx, upy, GRIP_LEN * z, 3 * z, 3.2 * z, M.HANDLE);
    // Курок газа с ближней стороны рукояти.
    slab(g, heelX + upx * 9 * z - upy * 3 * z, heelY + upy * 9 * z + upx * 3 * z,
      -upy, upx, 3 * z, 0.7 * z, 0.7 * z, M.DARKB);

    /* ── Ржавчина и копоть ──
     * У побитой пилы её больше. Пятнами по борту картера, а не по всему кадру:
     * крапление поверх зубьев съело бы единственный опознавательный знак класса. */
    const chips = Math.round(skin.wear * 10);
    for (let i = 0; i < chips; i++) {
      const [cx, cy] = P(bodyLen * (0.1 + rand() * 0.8), rise + (rand() - 0.5) * bodyHalf * 1.6);
      if (at(g, Math.round(cx), Math.round(cy)) === M.BODY) set(g, cx, cy, M.DARKB);
    }

    /* ── Кисти ──
     * Левая на переднем сходе скобы, правая на задней рукояти; предплечья уходят
     * в разные стороны вниз за срез. Сведённые в одну точку они складываются в
     * общий кусок мяса под пилой. */
    const [lhx, lhy] = bow(0.9);
    const [ltx, lty] = bow(0.68);
    const ld = Math.max(0.001, Math.hypot(ltx - lhx, lty - lhy));
    forearm(g, lhx - (ltx - lhx) / ld * 9, lhy - (lty - lhy) / ld * 9, 16, GH + 20, 4.6 * z);
    const rhx = heelX + upx * GRIP_LEN * z * 0.55;
    const rhy = heelY + upy * GRIP_LEN * z * 0.55;
    forearm(g, rhx - upx * 7 * z, rhy - upy * 7 * z, 58, GH + 12, 6.5 * z);
    stampFist(g, lhx, lhy, (ltx - lhx) / ld, (lty - lhy) / ld, 1.06 * z);
    stampFist(g, rhx, rhy, upx, upy, 1.08 * z);

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
  },
});
