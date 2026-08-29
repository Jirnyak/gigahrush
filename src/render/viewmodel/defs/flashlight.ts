/**
 * Ручной фонарь в левом кулаке. Тот же пакет носит прожектор ликвидатора.
 *
 * ФОРМУ ЗАДАЁТ АВТОРСКАЯ ПИКСЕЛЬНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ ЧИСЕЛ ВЕЩИ —
 * тот же приём, что в образцовом пакете `pistol.ts`, и по той же причине. Здесь
 * стояла параметрическая сборка из наклонных плашек с цилиндрической затенкой и
 * шумом: на холсте, который занимает в кадре полсотни пикселей, градиент читается
 * мылом, а шум грязью. Карта держит форму прямо в исходнике: символ называет
 * МАТЕРИАЛ, клетка — два пикселя, а какого материал оттенка и насколько ржав,
 * решает `skin`, то есть характеристики самой вещи.
 *
 * Четыре правила силуэта:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Ось завалена вправо-вверх на четверть прямого
 *    угла, и оттого срез отражателя виден наклонной полосой стекла, а не кружком:
 *    его левый край стоит отвесно, правый уходит вниз. Строго анфас фонарь
 *    читался куском трубы, приклеенным к краю кадра.
 * 2. СБОРКА ОТ ЯКОРЯ. Якорь — левый верхний угол карты; от него считается всё,
 *    включая предплечье. Сдвинув якорь, двигаешь сборку целиком.
 * 3. ГАБАРИТ ЗАДАН КАРТОЙ. Длина фонаря — это длина карты, а не сумма кусков,
 *    и облик делит её между рукоятью, корпусом и головой.
 * 4. РУКА РАСТЁТ ИЗ УГЛА. Предплечье уходит в нижний ЛЕВЫЙ угол и за него.
 *
 * ГЕОМЕТРИЯ ХОЛСТА ИНСТРУМЕНТА ДРУГАЯ, ЧЕМ У ОРУЖИЯ. Холст прижат к левому краю
 * кадра: столбец холста — это столбец экрана. Левый край холста есть край
 * экрана, и упираться в него МОЖНО — срез там не виден. Правее столбца 74 лезть
 * нельзя: там начинается холст оружия по центру, и оно перекроет инструмент.
 * Строка холста `r` — строка экрана `80 + r`; читаемое живёт в строках 30..100,
 * ниже всё съедает полоса HUD.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, line, put } from '../draw';
import { VM } from '../types';

/** Левый верхний угол карты на холсте. Клетка карты — два пикселя. */
const MAP_X = 1;
const MAP_Y = 28;
const CELL = 2;

/**
 * Силуэт.
 *
 * `.` пусто · `E` стекло · `N` нить накала · `Z` ободок отражателя
 * `R` отражатель · `W` хомут · `D` корпус · `P` кнопка · `G` резиновая рукоять
 * `H` ладонь · `K` палец · `J` щель между пальцами · `B` большой палец
 * `C` манжет · `A` рукав
 *
 * Хват читается по трём вещам разом: пальцы идут ВАЛИКАМИ ПОПЕРЁК корпуса и
 * выглядывают с дальней стороны (`K` правее корпуса), между ними тёмные щели
 * `J`, а большой палец `B` лежит вдоль трубы с ближней стороны. Без выглянувших
 * кончиков кисть читается стоящей РЯДОМ с фонарём, а не держащей его: ровно этим
 * хват отличается от двух предметов в одном кадре.
 */
const MAP: readonly string[] = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '.......................ZZZ',
  '....................ZZZZZZZZZ',
  '....................ZZEEEEEEZZZ',
  '...................ZZEEEEEEEEEZZ',
  '...................ZZEEEEENEEEEZZ',
  '...................ZZEEEENNNNEEEZZ',
  '....................ZZEEENNNNNEEEZZ',
  '....................ZZEEEENNNEEEEZZ',
  '....................RZZZEEEEEEEEEZZ',
  '....................RRRZZEEEEEEEEZZ',
  '...................RRRRRZZZZZEEZZZ',
  '..................RRRRRRRRRRRRRZZ',
  '..................RRRRRRRRRRRRR',
  '.................WWWWWWWWWWWWW',
  '...................DDDDDDDDD',
  '..................DDDDDDDDDBB',
  '..................DDDDDDDDDBBB',
  '............KKKKKKDDDDDDDDDBBB',
  '..........KKKKKKKDDDDDDDDDBBB',
  '.........JJJJJJJJDDDDDPPPDBBB',
  '........KKKKKKKKDDDDDPPPDBBB',
  '.......KKKKKKKKKDDDDDPPPDBBB',
  '......JJJJJJJJJDDDDDPPPDBBB',
  '.....KKKKKKKKKKDDDDDDDDDBBB',
  '....KKKKKKKKKKDDDDDDDDDBBB',
  '....JJJJJJJJJJDDDDDDDDDKK',
  '...KKKKKKKKKKKGGGGGGGGGKK',
  '...KKKKKKKKKKGGGGGGGGGKK',
  '...JJJJJJJJJJGGGGGGGGGKK',
  '...HHHHHHHHHGGGGGGGGGKK',
  '...HHHHHHHHHGGGGGGGGG',
  '....HHHHHHHGGGGGGGGG',
  '....HHHHHHHGGGGGGGGG',
  '.....HHHHHGGGGGGGGG',
  '...CCCCCCCCCCCCCCCCCCC',
  '...CCCCCCCCCCCCCCCCCCC',
  '..CCCCCCCCCCCCCCCCCC',
  '..AAAAAAAAAAAAAAAAA',
];

/** Ширина считается по самой длинной строке: хвостовые точки в карте не пишем. */
const MAP_W = MAP.reduce((w, r) => Math.max(w, r.length), 0);

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'flashlight',
  slot: 'tool',
  frames: ['idle'],
  draw({ buf, skin, rand }) {
    const [bD2, bD1, bM, bL, bH] = ramp(skin.body);
    const [gD2, gD1, gM, gL] = ramp(skin.grip);
    const [, aD1, aM, aL] = ramp(skin.accent);
    /* Перчатка ликвидатора, а не голая кисть: голая рука — большое бледное пятно
     * тона бетона, она сливается со стеной при любой анатомии. Тёмная резина
     * спецовки держит силуэт и кровь.
     *
     * ПАЛИТРА РЕЗИНЫ ЗДЕСЬ ТЕМНЕЕ ПИСТОЛЕТНОЙ, И ЭТО НЕ РАЗНОБОЙ, А ТО ЖЕ САМОЕ
     * ПРАВИЛО. У пистолета ствол воронёный, тёмный, и резину пришлось поднять
     * СВЕТЛЕЕ железа, иначе рука и оружие слились в одно чёрное пятно. Здесь
     * железо светлое — полированная сталь фонаря, — и пистолетная резина встала
     * с ним тон в тон: рука и труба слились в один серый столб. Правило не «резина
     * светлее», а «рука и предмет расходятся на две ступени рампы»; знак разницы
     * задаёт материал предмета. Отсюда тёмная резина и стальные верхние ступени. */
    const gt = rand();
    const [vD2, vD1, vM, vL] = ramp([52 + gt * 12, 55 + gt * 12, 63 + gt * 14]);
    /** Холодный рефлекс: у резины блик голубовато-серый, а не телесный. */
    const RIM = rgba(122, 138, 160);
    const CUFF = rgba(96, 58, 30);
    const CUFF_LIT = rgba(134, 86, 46);
    /** Стекло и нить: свечение фонаря — его главный опознавательный знак. */
    const glow = skin.glow;
    const LENS = rgba(
      clamp(skin.accent[0] * 0.16 + 108 + 118 * glow),
      clamp(skin.accent[1] * 0.16 + 110 + 114 * glow),
      clamp(skin.accent[2] * 0.16 + 104 + 96 * glow),
    );
    const LENS_LIT = rgba(clamp(206 + 48 * glow), clamp(204 + 48 * glow), clamp(188 + 50 * glow));
    const HOT = rgba(255, 254, 246);
    const BEZEL = rgba(20, 19, 22);

    /** Тело, светлая кромка, тёмная кромка — по одному на материал. */
    const MATERIAL: Readonly<Record<string, readonly [number, number, number]>> = {
      E: [LENS, LENS_LIT, aD1],
      N: [HOT, HOT, LENS_LIT],
      Z: [bD2, bD1, BEZEL],
      // Отражатель полированный: он идёт по ВЕРХНИМ ступеням и потому светлее
      // корпуса. Без этой разницы голова фонаря сливается с трубой в один столб.
      R: [bL, bH, bD1],
      W: [aM, aL, aD1],
      D: [bM, bL, bD2],
      P: [rgba(34, 32, 36), aM, rgba(12, 11, 13)],
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
     * предплечья закрывает манжет, ладонь и пятку фонаря одним серым клином —
     * ровно это и вышло с первого захода.
     *
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
     * и справа. Это и есть «свет сверху-слева», и ровно этим плоская заливка
     * перестаёт быть наклейкой. */
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
    /* Калибр: фонарик и прожектор ликвидатора делят и пакет, и облик, боевых
     * чисел у них нет, и развести их может только зерно, засеянное
     * идентификатором вещи. Прожектор получает вторую насечку на рукояти и
     * лишний поясок на хомуте — карта одна, а вещи в руке разные. */
    const grade = rand();
    for (let i = 0; i < 3 + Math.round(grade * 2); i++) {
      const gy = 34 + i * 2;
      for (let gx = 0; gx < MAP_W; gx++) {
        if (cellAt(gx, gy) !== 'G') continue;
        for (let dx = 0; dx < CELL; dx++) put(buf, MAP_X + gx * CELL + dx, MAP_Y + gy * CELL, gD1);
      }
    }
    if (grade > 0.5) {
      for (let gx = 0; gx < MAP_W; gx++) {
        if (cellAt(gx, 21) !== 'D') continue;
        for (let dx = 0; dx < CELL; dx++) put(buf, MAP_X + gx * CELL + dx, MAP_Y + 21 * CELL, aL);
      }
    }
    // Сколы на анодировке: у дешёвого фонаря их больше. Точками по кромке, а не
    // краплением по телу — крапление читается грязью, а не сколом.
    const chips = Math.round(skin.wear * 8);
    for (let i = 0; i < chips; i++) {
      const gy = 21 + Math.floor(rand() * 11);
      const gx = 16 + Math.floor(rand() * 9);
      if (cellAt(gx, gy) !== 'D') continue;
      put(buf, MAP_X + gx * CELL, MAP_Y + gy * CELL + 1, bD2);
    }

    contour(buf);

    /* Выхлоп света кладётся ПОСЛЕ контура, и это не мелочь: `contour` обводит
     * тёмным всё непрозрачное, и обведённые лучи читались тремя палками,
     * приклеенными к голове. Свет — единственное, что обводить нельзя.
     * Идут они ПАРАЛЛЕЛЬНО срезу стекла: веером они читались мусором. */
    for (let i = 1; i <= 3; i++) {
      const y = MAP_Y + (9 - i * 2) * CELL;
      const x0 = MAP_X + (20 + i * 2) * CELL;
      const x1 = MAP_X + (30 + i * 2) * CELL;
      line(buf, x0, y, x1, y + 9, i === 1 ? LENS_LIT : LENS, 1);
    }
  },
});
