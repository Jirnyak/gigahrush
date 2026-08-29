/**
 * Ультрафиолетовый прожектор ликвидатора в левом кулаке.
 *
 * ФОРМУ ЗАДАЁТ АВТОРСКАЯ ПИКСЕЛЬНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ ЧИСЕЛ ВЕЩИ —
 * тот же приём, что в образцовом пакете `pistol.ts`: символ карты называет
 * МАТЕРИАЛ, клетка — два пикселя, оттенок и износ решает `skin`. Здесь стояла
 * параметрическая сборка из наклонных плашек с цилиндрической затенкой и шумом;
 * на холсте, который занимает в кадре полсотни пикселей, градиент читается мылом,
 * а шум грязью.
 *
 * ОТ ФОНАРЯ ОТЛИЧАЕТСЯ ПРОПОРЦИЕЙ И ЦВЕТОМ, А НЕ ДЕТАЛЯМИ. Корпус короче и
 * заметно толще, раструб шире и развалистее, между корпусом и раструбом стоят
 * рёбра охлаждения — лампа греется. Стекло фиолетовое и забрано решёткой из трёх
 * прутьев: по ней вещь опознают с одного взгляда и по ней же читается, что срез
 * повёрнут. Пакет свой, а не общий с фонарём: перекрасить прожектор нельзя,
 * задев фонарь, и повтор между равнозначными пакетами здесь замысел.
 *
 * Четыре правила силуэта: три четверти (ось завалена вправо-вверх, срез виден
 * наклонным овалом), сборка от якоря карты, габарит задан картой, рука растёт из
 * нижнего ЛЕВОГО угла и уходит за него.
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
 * `.` пусто · `U` фиолетовое стекло · `Z` отбортовка раструба · `R` раструб
 * `W` ребро охлаждения · `D` корпус · `G` резиновая пятка
 * `H` ладонь · `K` палец · `J` щель между пальцами · `B` большой палец
 * `C` манжет · `A` рукав
 *
 * Хват читается по трём вещам разом: пальцы идут ВАЛИКАМИ ПОПЕРЁК корпуса и
 * выглядывают с дальней стороны (`K` правее корпуса), между ними тёмные щели
 * `J`, а большой палец `B` лежит вдоль корпуса с ближней стороны. Без выглянувших
 * кончиков кисть читается стоящей РЯДОМ с прожектором, а не держащей его.
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
  '..................ZZZZZZ',
  '................ZZZZZZZZZZZ',
  '...............ZZZUUUUUUUUZZZ',
  '..............ZZUUUUUUUUUUUUZZ',
  '..............ZZUUUUUUUUUUUUUZZ',
  '..............ZZUUUUUUUUUUUUUUZZ',
  '..............ZZUUUUUUUUUUUUUUUZZ',
  '...............ZUUUUUUUUUUUUUUUZZ',
  '...............ZZUUUUUUUUUUUUUUUZ',
  '................ZZUUUUUUUUUUUUUUZ',
  '................RZZUUUUUUUUUUUUZZ',
  '................RRZZZUUUUUUUUUZZZ',
  '...............WWWRRZZZZZUUUZZZZ',
  '..............WWWWWWWRRZZZZZZZ',
  '................WWWWWWWWRRRR',
  '...............DDDDWWWWWWWBBB',
  '.............KKDDDDDDWWWWWBBB',
  '............KKDDDDDDDDDDWBBB',
  '...........JJJDDDDDDDDDDDBBB',
  '..........KKKKDDDDDDDDDDDBBB',
  '.........KKKKGDDDDDDDDDDBBB',
  '........JJJJJGGGDDDDDDDDBBB',
  '.......KKKKKKGGGGGGDDDDDBBB',
  '......KKKKKKGGGGGGGGGGDBBB',
  '.....JJJJJJJGGGGGGGGGGGKK',
  '.....KKKKKKKGGGGGGGGGGGKK',
  '....KKKKKKKGGGGGGGGGGGKK',
  '....JJJJJJJGGGGGGGGGGGKK',
  '....HHHHHHGGGGGGGGGGGG',
  '....HHHHHHGGGGGGGGGGGG',
  '....HHHHHHGGGGGGGGGGG',
  '.....HHHHGGGGGGGGGGGG',
  '......HHHGGGGGGGGGGG',
  '...CCCCCCCCCCCCCCCCCCC',
  '...CCCCCCCCCCCCCCCCCCC',
  '..AAAAAAAAAAAAAAAAAAA',
];

/** Ширина считается по самой длинной строке: хвостовые точки в карте не пишем. */
const MAP_W = MAP.reduce((w, r) => Math.max(w, r.length), 0);

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'uv_spotlight',
  slot: 'tool',
  frames: ['idle'],
  draw({ buf, skin, rand }) {
    const [bD2, bD1, bM, bL, bH] = ramp(skin.body);
    const [gD2, , gM, gL] = ramp(skin.grip);
    /* Перчатка ликвидатора, а не голая кисть: голая рука — большое бледное пятно
     * тона бетона и сливается со стеной при любой анатомии.
     *
     * Резина ТЕМНЕЕ пистолетной, и это то же правило, а не разнобой. У пистолета
     * ствол воронёный, тёмный, и резину пришлось поднять СВЕТЛЕЕ железа. Здесь
     * корпус светлый, стальной, и пистолетная резина встала с ним тон в тон:
     * рука и труба сливались в один серый столб. Правило не «резина светлее», а
     * «рука и предмет расходятся на две ступени рампы». */
    const gt = rand();
    const [vD2, vD1, vM, vL] = ramp([52 + gt * 12, 55 + gt * 12, 63 + gt * 14]);
    /** Холодный рефлекс: у резины блик голубовато-серый, а не телесный. */
    const RIM = rgba(122, 138, 160);
    const CUFF = rgba(96, 58, 30);
    const CUFF_LIT = rgba(134, 86, 46);
    /** Фиолетовое стекло: у прожектора это единственный опознавательный цвет. */
    const glow = skin.glow;
    const LENS = rgba(
      clamp(skin.accent[0] * 0.5 + 54 * glow),
      clamp(skin.accent[1] * 0.28 + 18 * glow),
      clamp(skin.accent[2] * 0.62 + 92 * glow),
    );
    const LENS_LIT = rgba(
      clamp(skin.accent[0] * 0.72 + 92 * glow),
      clamp(skin.accent[1] * 0.5 + 52 * glow),
      clamp(skin.accent[2] * 0.86 + 118 * glow),
    );
    const GRILLE = rgba(20, 16, 28);

    /** Тело, светлая кромка, тёмная кромка — по одному на материал. */
    const MATERIAL: Readonly<Record<string, readonly [number, number, number]>> = {
      U: [LENS, LENS_LIT, rgba(28, 18, 46)],
      Z: [bD2, bD1, rgba(18, 17, 20)],
      // Раструб полированный: он идёт по ВЕРХНИМ ступеням и потому светлее
      // корпуса. Без этой разницы голова прожектора сливается с ним в один столб.
      R: [bL, bH, bD1],
      W: [bD1, bM, bD2],
      D: [bM, bL, bD2],
      G: [gM, gL, gD2],
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
     * предплечья закрывает манжет, ладонь и пятку прожектора одним серым клином.
     * Рука входит из нижнего ЛЕВОГО угла и уходит ЗА него: у инструмента левый
     * край холста есть край экрана, срез там не виден. Полосами, а не конусом:
     * конус даёт ровную заливку без граней и читается доской. */
    const wristX = MAP_X + 11 * CELL;
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
    /* Решётка: три прута ВДОЛЬ оси поперёк стекла. Рисуются ПОСЛЕ кромок и не
     * попадают в карту нарочно — в клетках два на два прут вырождался в
     * пунктирную лесенку из отдельных квадратов, а не в прут. */
    const lensX = MAP_X + 23.5 * CELL;
    const lensY = MAP_Y + 16 * CELL;
    for (let b = -1; b <= 1; b++) {
      // Прут идёт ВДОЛЬ оси (почти отвесно, с завалом влево книзу), а сами
      // прутья разнесены ПОПЕРЁК неё. Перепутать эти два направления — значит
      // положить решётку по диагонали кадра, мимо стекла.
      const cx = lensX + b * 9.4;
      const cy = lensY + b * 3.4;
      const len = b === 0 ? 11 : 8;
      line(buf, cx + 0.35 * len, cy - 0.94 * len, cx - 0.35 * len, cy + 0.94 * len, GRILLE, 1);
    }
    // Штатная вещь ликвидаторов, а не находка: рёбра держат светлую грань, а
    // сколов на корпусе тем меньше, чем дороже вещь.
    const chips = Math.round(skin.wear * 6);
    for (let i = 0; i < chips; i++) {
      const gy = 25 + Math.floor(rand() * 7);
      const gx = 15 + Math.floor(rand() * 8);
      if (cellAt(gx, gy) !== 'D') continue;
      put(buf, MAP_X + gx * CELL, MAP_Y + gy * CELL + 1, bD2);
    }

    contour(buf);

    /* Фиолетовый выхлоп кладётся ПОСЛЕ контура: `contour` обводит тёмным всё
     * непрозрачное, и обведённые лучи читались палками, приклеенными к голове.
     * Свет — единственное, что обводить нельзя. */
    for (let i = 1; i <= 3; i++) {
      const y = MAP_Y + (10 - i * 2) * CELL;
      const x0 = MAP_X + (16 + i * 2) * CELL;
      const x1 = MAP_X + (26 + i * 2) * CELL;
      line(buf, x0, y, x1, y + 9, i === 1 ? LENS_LIT : LENS, 1);
    }
  },
});
