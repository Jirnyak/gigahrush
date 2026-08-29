/**
 * Зажигалка в левом кулаке. Самая мелкая вещь в слоте инструмента.
 *
 * ФОРМУ ЗАДАЁТ АВТОРСКАЯ ПИКСЕЛЬНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ ЧИСЕЛ ВЕЩИ —
 * тот же приём, что в образцовом пакете `pistol.ts`: символ карты называет
 * МАТЕРИАЛ, клетка — два пикселя, оттенок и износ решает `skin`. Здесь стояла
 * параметрическая сборка из наклонных плашек с цилиндрической затенкой и шумом;
 * на холсте, который занимает в кадре полсотни пикселей, градиент читается мылом,
 * а шум грязью.
 *
 * МЕЛКОСТЬ — ЕЁ ЧЕРТА, И ОНА ЖЕ ГЛАВНАЯ ОПАСНОСТЬ ПАКЕТА. Кадр обязан нести не
 * меньше 256 непрозрачных пикселей, иначе реестр считает пакет ненаписанным и
 * рука ИСЧЕЗАЕТ молча. Площадь добирает кисть: коробочка почти целиком в кулаке,
 * над пальцами остаётся треть корпуса, откинутая крышка, колёсико и язычок
 * пламени. Крупнее рисовать нельзя — рядом фонарь, и разница в размере и есть
 * то, чем зажигалка читается с одного взгляда.
 *
 * Четыре правила силуэта: три четверти (видно и широкую грань, и узкую боковину,
 * и наклонный верхний срез), сборка от якоря карты, габарит задан картой, рука
 * растёт из нижнего ЛЕВОГО угла и уходит за него.
 *
 * ГЕОМЕТРИЯ ХОЛСТА ИНСТРУМЕНТА ДРУГАЯ, ЧЕМ У ОРУЖИЯ: холст прижат к левому краю
 * кадра, столбец холста есть столбец экрана. В левый край упираться МОЖНО — это
 * край экрана. Оружие зеркально прижато к правому краю кадра и начинается со
 * столбца 192, то есть с холстом инструмента больше не пересекается: весь холст
 * свободен. Читаемое живёт в строках 30..100, ниже полоса HUD.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, line, put } from '../draw';
import { VM } from '../types';

/** Левый верхний угол карты на холсте. Клетка карты — два пикселя. */
const MAP_X = 3;
const MAP_Y = 28;
const CELL = 2;

/**
 * Силуэт.
 *
 * `.` пусто · `M` широкая латунная грань · `S` узкая боковина · `Z` срез и шов
 * `V` откинутая крышка · `O` колёсико · `F` пламя · `N` ядро пламени
 * `H` ладонь · `K` палец · `J` щель между пальцами · `B` большой палец
 * `C` манжет · `A` рукав
 *
 * Большой палец `B` тянется вдоль ближней стороны ВВЕРХ К КОЛЁСИКУ: он его и
 * крутит, и без этого коробочка читается просто зажатым бруском. Пальцы идут
 * валиками ПОПЕРЁК корпуса и выглядывают с дальней стороны — без выглянувших
 * кончиков кисть читается стоящей РЯДОМ с вещью, а не держащей её.
 */
const MAP: readonly string[] = [
  '',
  '',
  '',
  '',
  '...........................F',
  '...........................F',
  '..........................FF',
  '..........................FNF',
  '..........................FNF',
  '..............VVVV.......FNNF',
  '.............VVVVVV......FNNNF',
  '.............VVVVVV......FNNNF',
  '..............VVVVVV.....FNNNF',
  '..............VVVVVV....FFNNNF',
  '...............VVVVVV.....OOOO',
  '................VVVVV.....OOOO',
  '.................VVVV.....OOOO',
  '....................ZZZZZZZZZ',
  '....................MMMMMMMBBB',
  '...................MMMMMMMBBB',
  '...................MMMMMMMBBB',
  '...................MMMMMMMBBB',
  '..................ZZZZZZZBBB',
  '..................ZZZZZZZBBB',
  '..................MMMMMMMBBB',
  '..................MMMMMMMBBB',
  '.............KKKKMMMMMMMBBB',
  '............KKKKKMMMMMMMBBB',
  '...........JJJJJJMMMMMMMBBB',
  '..........KKKKKKMMMMMMMBBB',
  '.........KKKKKKKMMMMMMMBBB',
  '........JJJJJJJJJJJJJJJJJ',
  '.......KKKKKKKKKKKKKKKKKK',
  '......KKKKKKKKKKKKKKKKKK',
  '.....JJJJJJJJJJJJJJJJJJJ',
  '.....KKKKKKKKKKKKKKKKKKK',
  '.....KKKKKKKKKKKKKKKKKK',
  '.....JJJJJJJJJJJJJJJJJJ',
  '.....HHHHHHHHHHHHHHHHHH',
  '.....HHHHHHHHHHHHHHHHHH',
  '......HHHHHHHHHHHHHHHH',
  '.......HHHHHHHHHHHHHHH',
  '....CCCCCCCCCCCCCCCCCCC',
  '....CCCCCCCCCCCCCCCCCCC',
  '...AAAAAAAAAAAAAAAAAAA',
];

/** Ширина считается по самой длинной строке: хвостовые точки в карте не пишем. */
const MAP_W = MAP.reduce((w, r) => Math.max(w, r.length), 0);

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'lighter',
  slot: 'tool',
  frames: ['idle'],
  draw({ buf, skin, rand }) {
    const [bD2, bD1, bM, bL, bH] = ramp(skin.body);
    /* Перчатка ликвидатора, а не голая кисть: голая рука — большое бледное пятно
     * тона бетона и сливается со стеной при любой анатомии.
     *
     * Резина ТЕМНЕЕ пистолетной, и это то же правило, а не разнобой. У пистолета
     * ствол воронёный, и резину пришлось поднять СВЕТЛЕЕ железа. Здесь предмет
     * латунный, светлый и тёплый: тёмная холодная резина расходится с ним и по
     * тону, и по температуре цвета. Правило не «резина светлее», а «рука и
     * предмет расходятся на две ступени рампы». */
    const gt = rand();
    const [vD2, vD1, vM, vL] = ramp([52 + gt * 12, 55 + gt * 12, 63 + gt * 14]);
    /** Холодный рефлекс: у резины блик голубовато-серый, а не телесный. */
    const RIM = rgba(122, 138, 160);
    const CUFF = rgba(96, 58, 30);
    const CUFF_LIT = rgba(134, 86, 46);
    /** Огонь: единственный горячий цвет на всём холсте. */
    const glow = Math.max(0.25, skin.glow);
    const FLAME = rgba(
      clamp(skin.accent[0] * 1.1),
      clamp(skin.accent[1] * 0.88),
      clamp(skin.accent[2] * 0.52),
    );
    const CORE = rgba(clamp(214 + 40 * glow), clamp(196 + 44 * glow), clamp(120 + 60 * glow));

    /** Тело, светлая кромка, тёмная кромка — по одному на материал. */
    const MATERIAL: Readonly<Record<string, readonly [number, number, number]>> = {
      M: [bM, bH, bD1],
      // Узкая боковина уходит от света: она на ступень темнее широкой грани, и
      // ровно этим коробочка перестаёт быть плоской наклейкой.
      S: [bD1, bM, bD2],
      Z: [bD2, bM, rgba(16, 13, 8)],
      V: [bD1, bL, bD2],
      O: [rgba(46, 40, 34), bM, rgba(14, 12, 10)],
      F: [FLAME, CORE, rgba(122, 44, 12)],
      N: [CORE, rgba(255, 246, 214), FLAME],
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
    // Накатка на широкой грани: косые риски. Красит ТОЛЬКО клетки самой грани,
    // иначе штрихи вылезают за силуэт и висят в воздухе рядом с зажигалкой.
    for (let i = 0; i < 4; i++) {
      const gy = 26 + i * 2;
      for (let gx = 0; gx < MAP_W; gx++) {
        if (cellAt(gx, gy) !== 'M') continue;
        put(buf, MAP_X + gx * CELL, MAP_Y + gy * CELL + 1, bD1);
      }
    }
    // Латунь у дешёвой зажигалки битая: точки по кромке грани, а не крапление по
    // телу — крапление читается грязью, а не сколом.
    const chips = Math.round(skin.wear * 7);
    for (let i = 0; i < chips; i++) {
      const gy = 18 + Math.floor(rand() * 20);
      const gx = 15 + Math.floor(rand() * 9);
      if (cellAt(gx, gy) !== 'M') continue;
      put(buf, MAP_X + gx * CELL + 1, MAP_Y + gy * CELL, bD2);
    }

    contour(buf);

    /* Отсвет пламени на верхнем срезе кладётся ПОСЛЕ контура: `contour` обводит
     * тёмным всё непрозрачное, и обведённый отсвет читался бы приклеенной
     * палкой. Свет — единственное, что обводить нельзя. */
    line(buf, MAP_X + 20 * CELL, MAP_Y + 17 * CELL, MAP_X + 26 * CELL, MAP_Y + 17 * CELL, CORE, 1);
  },
});
