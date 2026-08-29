/**
 * Пусковая: короткая труба большого калибра, венчик сопла сзади, обе руки.
 *
 * ФОРМУ ЗАДАЁТ АВТОРСКАЯ ПИКСЕЛЬНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ БОЕВЫХ ЧИСЕЛ —
 * тот же приём, что в образцовом `pistol.ts`. Прежняя версия собирала трубу из
 * наклонных плашек с цилиндрической затенкой и попиксельным шумом: на холсте,
 * который занимает в кадре полсотни пикселей, градиент превращается в мыло, а шум
 * — в грязь. Форму на этом размере несут СИЛУЭТ, ЖЁСТКИЙ КОНТУР И РЕЗКИЕ ГРАНИЦЫ
 * ТОНОВ, и ничего больше.
 *
 * В карте нет ни одного цвета: символ называет МАТЕРИАЛ, а какого он оттенка,
 * насколько ржав и заряжена ли труба, решают числа конкретной вещи. Один силуэт
 * обслуживает шесть пусковых, и все шесть выглядят по-разному.
 *
 * Клетка карты — два пикселя, но КРОМКИ рисуются по одному: светлая фаска сверху
 * и слева, тёмная снизу и справа. Это «свет сверху-слева» из рефов.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки 100..127
 * закрывает полоса HUD — туда идёт только масса предплечий. Холст прижат к
 * ПРАВОМУ краю кадра, столбец `c` — это столбец экрана `192 + c`: в ЛЕВЫЙ край
 * упираться нельзя, он приходится на середину кадра и дал бы прямой срез в
 * воздухе. Наружу можно вправо и вниз; на перезарядке труба всё равно уводится
 * строго ВНИЗ — вбок её увёл бы за собственный габарит, а не за край кадра.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, line, put } from '../draw';
import { VM } from '../types';

/** Левый верхний угол карты на холсте. Клетка карты — два пикселя. */
const MAP_X = 16;
const MAP_Y = 24;
const CELL = 2;

/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = MAP_X + 6 * CELL;
const MUZZLE_Y = MAP_Y + 5 * CELL;
/** Центр венчика сопла: труба уходит за плечо и там плюётся на выстреле. */
const VENT_X = MAP_X + 38 * CELL;
const VENT_Y = MAP_Y + 25 * CELL;

/**
 * Силуэт.
 *
 * `.` пусто · `B` труба · `O` канал и жерло сопла · `C` бандаж · `D` венчик сопла
 * `V` прицельная планка и мушка · `G` рукоять
 * `H` перчатка · `K` сустав пальца · `J` щель между пальцами · `U` манжет
 *
 * ПРОФИЛЬ, А НЕ ВИД В ТОРЕЦ. Труба уходит вверх-влево по диагонали, и зритель
 * видит БОКОВУЮ плоскость: развальцованный срез, бандажи, планку на верхней
 * образующей, обе рукояти ПОД трубой и венчик сопла сзади. Прежняя версия
 * смотрела строго в торец и читалась жестяным ведром: на плоских тонах торцу
 * показывать нечего.
 *
 * Калибр читается ПУСТОТОЙ: чёрный канал во весь диаметр — это и есть «большой
 * калибр», и убрать его нельзя ничем другим. Венчик сзади обязателен по той же
 * причине, по какой обязателен раструб спереди: без него труба просто обрывается.
 */
const MAP: readonly string[] = [
  '...OCCOBBB....................................',
  '..OCCCOOOBBB..................................',
  '.OOCCOOOOBBBBB....VVV.........................',
  '.OCCOOOOOOBBBBB..VVVVV........................',
  '.CCCOOOOOOBBBBBBCVVVVVVV......................',
  '.CCOOOOOOOBBBBBCCB...VVVV.....................',
  'CCOOOOOOOOBBBBCCCBBB..VVVVV.VV................',
  'CCOOOOOOOBBBBBCCBBBBBB..VVVVVVV...............',
  'CBBOOOOOBBBBBCCBBBBBBBBC.VVVVV................',
  'BBBBBBBBBBBBCCCBBBBBBBCCBVVV..................',
  'BBBBBBBBBBBBCCBBBBBBBCCCBBV...................',
  '....BBBBBBBCCBBBBBBBBCCBBBBB..................',
  '......BBBBCCCBBBBBBBCCBBBBBBBC................',
  '.......BBBCCBBBBBBBCCCBBBBBBBCCB..............',
  '........BCCBBBBBBBBCCBBBBBBBCCCBB.............',
  '.........CCBBBGGBBCCBBBBBBBCCCBBBBB...........',
  '...........GGGGGBCCCBBBBBBBCCBBBBBBBB.........',
  '..........GGGHHHKKCBBBBBBBCCCBBBBBBBDDDDDDD...',
  '..........HHKKKKKKBBBBBBBCCCBBBBBBBBDDDDDD....',
  '..........GHKKKJJJKBBBBBBCCBBBBBBBBDDDDDD.....',
  '..........KKJJHKKKKBBBBBCCCBBBBBBBDDDDDDD.....',
  '..........KKKKKKKHJBBBBCCCBBBBBBBBDDDDDD......',
  '...........KKKJJJKKBBBBCCBBBBBBBBDDOOOD.......',
  '...........KKJKKKKKK.BCCCBBBBBBBDDOOOOO.......',
  '...........KHKKK.JJ...CCBBBBGGBBDOOOOOOO......',
  '.............JJJUUU....BBGGGKKKDDOOOOOOO......',
  '............UUUUUUUU...GGKKKKKJJDOOOOOOO......',
  '.............UUUUUUU...GGKKJJJKKDDOOOOO.......',
  '.............UUUUUU.....HJHKKKKKDDDOOO........',
  '.............UUU........GHKKKJJJDDD...........',
  '........................KKJJJKKKKD............',
  '........................KKKKKKKHJ.............',
  '........................KKKKHJJKK.............',
  '.........................KKJKKKKKK............',
  '.........................KKKKKKJJ.............',
  '..........................HGJJGGGU............',
  '..........................GGGGUUUU............',
  '...........................UUUUUUU............',
];

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'launcher',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 2.4, bob: 0.85, swap: 1.1, flash: 0.11 },
  draw({ buf, frame, skin, rand }) {
    const fire = frame === 'fire';
    const reload = frame === 'reload';
    const [bD2, bD1, bM, bL, bH] = ramp(skin.body);
    const [, cD1, cM, cL] = ramp(skin.accent);
    const [gD2, , gM, gL] = ramp(skin.grip);
    const BORE = rgba(12, 11, 13);
    /** Тёмная деталь: планка, мушка, тень венчика. */
    const IRON = rgba(clamp(skin.body[0] * 0.44), clamp(skin.body[1] * 0.44), clamp(skin.body[2] * 0.48));
    /* Перчатка ликвидатора, а не голая кисть: голая рука — большое бледное пятно
     * тона бетона, и она сливается со стеной при любой анатомии. Резина СВЕТЛЕЕ
     * воронёной трубы, и это обязательное условие, а не вкус: тёмная перчатка на
     * тёмном железе слилась бы в одно пятно, где не читаются ни пальцы, ни граница
     * между рукой и оружием. */
    const gt = rand();
    const [vD2, vD1, vM, vL] = ramp([86 + gt * 16, 90 + gt * 16, 98 + gt * 18]);
    /** Холодный рефлекс: у резины блик голубовато-серый, а не телесный. */
    const RIM = rgba(122, 138, 160);
    const CUFF = rgba(96, 58, 30);
    const CUFF_LIT = rgba(134, 86, 46);

    /** Тело, светлая кромка, тёмная кромка — по одному на материал. */
    const MATERIAL: Readonly<Record<string, readonly [number, number, number]>> = {
      B: [bM, bH, bD2],
      O: [BORE, BORE, BORE],
      // Бандажи латунные, но ПРИГЛУШЁННЫЕ: во всю яркость акцента труба
      // читалась осой в жёлтую полоску, а не воронёным железом со стяжками.
      C: [cD1, cM, bD2],
      D: [bD1, bM, bD2],
      V: [IRON, bL, BORE],
      G: [gM, gL, gD2],
      H: [vM, vL, vD2],
      K: [vL, RIM, vD1],
      J: [vD2, vD1, vD2],
      U: [CUFF, CUFF_LIT, rgba(48, 28, 14)],
    };

    /* На перезарядке трубу уводят ВНИЗ, и только вниз: правый край холста теперь
     * совпадает с краем экрана, и уведённая вбок труба ушла бы за кадр целиком —
     * увод перестал бы читаться. Вниз он виден до самого конца. */
    const ox = MAP_X;
    const oy = MAP_Y + (reload ? 14 : 0);

    const cellAt = (gx: number, gy: number): string => {
      if (gy < 0 || gy >= MAP.length) return '.';
      const row = MAP[gy];
      return gx < 0 || gx >= row.length ? '.' : row[gx];
    };

    /* ── Предплечья ──
     * Пишутся ДО карты: кисти обязаны лечь ПОВЕРХ руки, иначе предплечье
     * накрывает собственные пальцы и от хвата остаётся серый клин.
     * Обе руки уходят в нижние углы и ЗА них. Левая — вниз-влево, но НЕ в левый
     * край холста: там был бы прямой вертикальный срез посреди экрана. */
    const leftX = ox + 13 * CELL;
    const leftY = oy + 28 * CELL;
    line(buf, leftX, leftY, 22, VM + 30, vD1, 18);
    line(buf, leftX - 6, leftY - 4, 14, VM + 22, vM, 5);
    line(buf, leftX + 6, leftY + 4, 32, VM + 34, vD2, 6);

    const rightX = ox + 30 * CELL;
    const rightY = oy + 36 * CELL;
    line(buf, rightX, rightY, VM - 8, VM + 34, vD1, 19);
    line(buf, rightX - 6, rightY - 5, VM - 18, VM + 26, vM, 5);
    line(buf, rightX + 6, rightY + 5, VM, VM + 38, vD2, 6);

    /* ── Тела ── */
    for (let gy = 0; gy < MAP.length; gy++) {
      for (let gx = 0; gx < MAP[0].length; gx++) {
        const mat = MATERIAL[cellAt(gx, gy)];
        if (!mat) continue;
        const x = ox + gx * CELL;
        const y = oy + gy * CELL;
        for (let dy = 0; dy < CELL; dy++) for (let dx = 0; dx < CELL; dx++) put(buf, x + dx, y + dy, mat[0]);
      }
    }

    /* ── Кромки ──
     * Клетка крупная, кромка тонкая: светлая грань сверху и слева, тёмная снизу
     * и справа. Канал кромки не получает — дыра не имеет фаски. */
    for (let gy = 0; gy < MAP.length; gy++) {
      for (let gx = 0; gx < MAP[0].length; gx++) {
        const ch = cellAt(gx, gy);
        if (ch === 'O') continue;
        const mat = MATERIAL[ch];
        if (!mat) continue;
        const x = ox + gx * CELL;
        const y = oy + gy * CELL;
        const open = (dx: number, dy: number) => cellAt(gx + dx, gy + dy) !== ch;
        if (open(0, -1)) for (let dx = 0; dx < CELL; dx++) put(buf, x + dx, y, mat[1]);
        if (open(-1, 0)) for (let dy = 0; dy < CELL; dy++) put(buf, x, y + dy, mat[1]);
        if (open(0, 1)) for (let dx = 0; dx < CELL; dx++) put(buf, x + dx, y + CELL - 1, mat[2]);
        if (open(1, 0)) for (let dy = 0; dy < CELL; dy++) put(buf, x + CELL - 1, y + dy, mat[2]);
      }
    }

    /* ── Что решают числа вещи ── */
    // Сколы на воронении трубы: у дешёвой пусковой их больше. Точками по кромке,
    // а не краплением по телу — крапление читается грязью, а не сколом.
    const chips = Math.round(skin.wear * 9);
    for (let i = 0; i < chips; i++) {
      const gy = 9 + Math.floor(rand() * 12);
      const gx = 6 + Math.floor(rand() * 20);
      if (cellAt(gx, gy) !== 'B') continue;
      put(buf, ox + gx * CELL, oy + gy * CELL + 1, bL);
    }

    const mx = ox + 6 * CELL;
    const my = oy + 5 * CELL;
    if (fire) {
      /* Сразу после схода раскалены и кромка канала, и стенка венчика. Сопло
       * тоже плюётся: без этого выстрел из трубы выглядит выстрелом из ружья. */
      ellipse(buf, mx, my, 7, 5.6, rgba(clamp(skin.accent[0] * 1.6), clamp(skin.accent[1] * 1.1), clamp(skin.accent[2] * 0.5)));
      ellipse(buf, mx, my, 3.6, 2.8, rgba(255, 236, 190));
      ellipse(buf, VENT_X, VENT_Y, 5.4, 4.4, rgba(clamp(skin.accent[0] * 1.3), clamp(skin.accent[1] * 0.9), clamp(skin.accent[2] * 0.42)));
      ellipse(buf, VENT_X, VENT_Y, 2.4, 2, rgba(255, 226, 176));
    } else if (skin.magazine > 0) {
      /* Тупая головка гранаты в канале: заряжено видно, не открывая ничего.
       * Размер прямо от ёмкости — однозарядная труба показывает её крупнее. */
      const r = 3.4 + Math.max(0, 12 - skin.magazine) * 0.16;
      ellipse(buf, mx, my, r, r * 0.82, rgba(clamp(skin.accent[0] * 0.5), clamp(skin.accent[1] * 0.56), clamp(skin.accent[2] * 0.38)));
      ellipse(buf, mx - 1, my - 1, r * 0.44, r * 0.36, rgba(clamp(skin.accent[0] * 0.9), clamp(skin.accent[1] * 0.86), clamp(skin.accent[2] * 0.7)));
    }
    if (reload) {
      /* Свежая граната поднимается к срезу СБОКУ-СНИЗУ, а не висит перед дулом:
       * вынесенная вперёд, она уводит взгляд в верхний левый угол, где у холста
       * оружия нет ни места, ни права быть. */
      ellipse(buf, mx - 4, my + 20, 4.2, 3.4, rgba(clamp(skin.accent[0] * 0.72), clamp(skin.accent[1] * 0.78), clamp(skin.accent[2] * 0.46)));
      ellipse(buf, mx - 4, my + 27, 3.2, 4.6, cM);
      ellipse(buf, mx - 5, my + 18, 1.8, 1.4, cL);
    }

    contour(buf);
  },
});
