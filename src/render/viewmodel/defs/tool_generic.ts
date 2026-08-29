/**
 * Всё прочее, что носят в левой руке: рации, наборы, детекторы, мелок, банки.
 *
 * ПАКЕТ НАМЕРЕННО НЕ ИЗОБРАЖАЕТ НИЧЕГО КОНКРЕТНОГО. Тринадцать разных вещей
 * делят этот силуэт, и нарисовать здесь гаечный ключ значит соврать про рацию,
 * дозиметр и банку разом. Честный общий силуэт — компактный прибор в кулаке:
 * корпус с крышкой, утопленное тёмное окошко в латунной рамке и ремешок с
 * замком. Он читается «в руке что-то есть» и не обещает того, чего у вещи нет.
 * Свой силуэт стоит заводить только той вещи, ради которой игрок и лезет в слот
 * инструмента.
 *
 * ФОРМУ ЗАДАЁТ АВТОРСКАЯ ПИКСЕЛЬНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ ЧИСЕЛ ВЕЩИ —
 * тот же приём, что в образцовом пакете `pistol.ts`: символ карты называет
 * МАТЕРИАЛ, клетка — два пикселя, оттенок и износ решает `skin`. Здесь стояла
 * параметрическая сборка из наклонных плашек с цилиндрической затенкой и шумом;
 * на холсте, который занимает в кадре полсотни пикселей, градиент читается мылом,
 * а шум грязью.
 *
 * Четыре правила силуэта: три четверти (видно и переднюю грань, и узкую
 * боковину, и наклонный срез крышки), сборка от якоря карты, габарит задан
 * картой, рука растёт из нижнего ЛЕВОГО угла и уходит за него.
 *
 * ГЕОМЕТРИЯ ХОЛСТА ИНСТРУМЕНТА ДРУГАЯ, ЧЕМ У ОРУЖИЯ: холст прижат к левому краю
 * кадра, столбец холста есть столбец экрана. В левый край упираться МОЖНО — это
 * край экрана. Правее столбца 74 нельзя: там начинается оружие по центру и
 * перекроет инструмент. Читаемое живёт в строках 30..100, ниже полоса HUD.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, line, put } from '../draw';
import { VM } from '../types';

/** Левый верхний угол карты на холсте. Клетка карты — два пикселя. */
const MAP_X = 3;
const MAP_Y = 24;
const CELL = 2;

/**
 * Силуэт.
 *
 * `.` пусто · `M` передняя грань · `S` узкая боковина · `V` крышка · `Z` шов
 * `W` латунная рамка окна · `P` утопленное окно · `T` ремень · `L` замок ремня
 * `H` ладонь · `K` палец · `J` щель между пальцами · `B` большой палец
 * `C` манжет · `A` рукав
 *
 * Пальцы идут валиками ПОПЕРЁК корпуса, а ниже середины ложатся ПОВЕРХ него —
 * так вещь оказывается в кулаке, а не рядом с ним. Большой палец `B` лежит вдоль
 * ближней боковины. Без этих двух вещей кисть читается стоящей рядом с прибором.
 */
const MAP: readonly string[] = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '...................VVVVVVVVVVVV',
  '...................VVVVVVVVVVVV',
  '..................ZZZZZZZZZSSS',
  '..................MMMMMMTTMSSS',
  '..................MMMMMMTTMSSS',
  '..................MWWWWWTTMSSS',
  '..................MWPPPWTTMBBB',
  '.................MWPPPWTTMBBB',
  '.................MWPPPWTTMBBB',
  '............KKKKKMWPPPWTTMBBB',
  '...........KKKKKKMWPPPWTTMBBB',
  '..........JJJJJJJMWWWWWTTMBBB',
  '.........KKKKKKKMMMMMLLLLBBB',
  '........KKKKKKKKMMMMMLLLLBBB',
  '........JJJJJJJJMMMMMMTTMBBB',
  '.......KKKKKKKKKMMMMMMTTMSSS',
  '.......KKKKKKKKMMMMMMMMMSSS',
  '......JJJJJJJJJJJJJJJJJJJJS',
  '......KKKKKKKKKKKKKKKKKKKKS',
  '......KKKKKKKKKKKKKKKKKKKSS',
  '......JJJJJJJJJJJJJJJJJJJSS',
  '......HHHHHHHHHHHHHHHHHSSS',
  '.......HHHHHHHHHHHHHHHMSSS',
  '........HHHHHHHHHHHHHMMSSS',
  '...CCCCCCCCCCCCCCCCCCCCC',
  '...CCCCCCCCCCCCCCCCCCCCC',
  '..AAAAAAAAAAAAAAAAAAAAA',
];

/** Ширина считается по самой длинной строке: хвостовые точки в карте не пишем. */
const MAP_W = MAP.reduce((w, r) => Math.max(w, r.length), 0);

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'tool_generic',
  slot: 'tool',
  frames: ['idle'],
  draw({ buf, skin, rand }) {
    const [bD2, bD1, bM, bL, bH] = ramp(skin.body);
    const [gD2, , gM, gL] = ramp(skin.grip);
    const [, aD1, aM, aL] = ramp(skin.accent);
    /* Перчатка ликвидатора, а не голая кисть: голая рука — большое бледное пятно
     * тона бетона и сливается со стеной при любой анатомии.
     *
     * Резина ТЕМНЕЕ пистолетной, и это то же правило, а не разнобой. У пистолета
     * ствол воронёный, и резину пришлось поднять СВЕТЛЕЕ железа. Здесь корпус
     * светлый, стальной, и пистолетная резина встала с ним тон в тон. Правило не
     * «резина светлее», а «рука и предмет расходятся на две ступени рампы». */
    const gt = rand();
    const [vD2, vD1, vM, vL] = ramp([52 + gt * 12, 55 + gt * 12, 63 + gt * 14]);
    /** Холодный рефлекс: у резины блик голубовато-серый, а не телесный. */
    const RIM = rgba(122, 138, 160);
    const CUFF = rgba(96, 58, 30);
    const CUFF_LIT = rgba(134, 86, 46);

    /** Тело, светлая кромка, тёмная кромка — по одному на материал. */
    const MATERIAL: Readonly<Record<string, readonly [number, number, number]>> = {
      M: [bM, bL, bD2],
      // Узкая боковина уходит от света: она на ступень темнее передней грани, и
      // ровно этим корпус перестаёт быть плоской наклейкой.
      S: [bD1, bM, bD2],
      V: [bL, bH, bD1],
      Z: [bD2, bM, rgba(16, 15, 18)],
      W: [aM, aL, aD1],
      // Окошко ЧЁРНОЕ и утопленное: оно не изображает ни шкалы, ни экрана — ровно
      // затем, чтобы пакет не врал про назначение конкретной вещи.
      P: [rgba(20, 20, 24), bD1, rgba(10, 10, 12)],
      T: [gM, gL, gD2],
      L: [aM, aL, aD1],
      H: [vD1, vM, vD2],
      K: [vM, RIM, vD2],
      J: [vD2, vD1, vD2],
      B: [vL, RIM, vD1],
      C: [CUFF, CUFF_LIT, rgba(48, 28, 14)],
      A: [vD1, vM, vD2],
    };

    const cellAt = (gx: number, gy: number): string => {
      if (gy < 0 || gy >= MAP.length) return '.';
      const row = MAP[gy];
      return gx < 0 || gx >= row.length ? '.' : row[gx];
    };

    /* ── Предплечье ── */
    /* Кладётся ДО карты: карта обязана лечь ПОВЕРХ рукава, иначе широкая полоса
     * предплечья закрывает манжет и ладонь одним серым клином. Рука входит из
     * нижнего ЛЕВОГО угла и уходит ЗА него: у инструмента левый край холста есть
     * край экрана, срез там не виден. Полосами, а не конусом: конус даёт ровную
     * заливку без граней и читается доской. */
    const wristX = MAP_X + 12 * CELL;
    const wristY = MAP_Y + 42 * CELL;
    const elbowX = -10;
    const elbowY = VM + 30;
    line(buf, wristX, wristY, elbowX, elbowY, vD2, 17);
    line(buf, wristX - 3, wristY - 5, elbowX - 5, elbowY - 10, vD1, 6);
    line(buf, wristX + 5, wristY + 5, elbowX + 7, elbowY + 5, vD2, 6);

    /* ── Тела ── */
    for (let gy = 0; gy < MAP.length; gy++) {
      for (let gx = 0; gx < MAP_W; gx++) {
        const mat = MATERIAL[cellAt(gx, gy)];
        if (!mat) continue;
        const x = MAP_X + gx * CELL;
        const y = MAP_Y + gy * CELL;
        for (let dy = 0; dy < CELL; dy++) for (let dx = 0; dx < CELL; dx++) put(buf, x + dx, y + dy, mat[0]);
      }
    }

    /* ── Кромки ──
     * Клетка крупная, кромка тонкая: светлая грань сверху и слева, тёмная снизу
     * и справа. Это и есть «свет сверху-слева». */
    for (let gy = 0; gy < MAP.length; gy++) {
      for (let gx = 0; gx < MAP_W; gx++) {
        const ch = cellAt(gx, gy);
        const mat = MATERIAL[ch];
        if (!mat) continue;
        const x = MAP_X + gx * CELL;
        const y = MAP_Y + gy * CELL;
        const open = (dx: number, dy: number) => cellAt(gx + dx, gy + dy) !== ch;
        if (open(0, -1)) for (let dx = 0; dx < CELL; dx++) put(buf, x + dx, y, mat[1]);
        if (open(-1, 0)) for (let dy = 0; dy < CELL; dy++) put(buf, x, y + dy, mat[1]);
        if (open(0, 1)) for (let dx = 0; dx < CELL; dx++) put(buf, x + dx, y + CELL - 1, mat[2]);
        if (open(1, 0)) for (let dy = 0; dy < CELL; dy++) put(buf, x + CELL - 1, y + dy, mat[2]);
      }
    }

    /* ── Что решают числа вещи ── */
    /* Тринадцать вещей делят силуэт, боевых чисел у них нет, и развести их может
     * только зерно, засеянное идентификатором: у половины на крышке появляется
     * вторая защёлка. Карта одна, а вещи в руке разные. */
    if (rand() > 0.5) {
      for (let gx = 0; gx < MAP_W; gx++) {
        if (cellAt(gx, 19) !== 'V') continue;
        for (let dx = 0; dx < CELL; dx++) put(buf, MAP_X + gx * CELL + dx, MAP_Y + 19 * CELL, aM);
      }
    }
    // Сколы на краске: у дешёвой вещи их больше. Точками по кромке грани, а не
    // краплением по телу — крапление читается грязью, а не сколом.
    const chips = Math.round(skin.wear * 8);
    for (let i = 0; i < chips; i++) {
      const gy = 21 + Math.floor(rand() * 13);
      const gx = 17 + Math.floor(rand() * 8);
      if (cellAt(gx, gy) !== 'M') continue;
      put(buf, MAP_X + gx * CELL, MAP_Y + gy * CELL + 1, bD2);
    }

    contour(buf);
  },
});
