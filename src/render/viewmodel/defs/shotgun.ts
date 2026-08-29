/**
 * Дробовик: толстый ствол, деревянное цевьё, приклад в плечо, обе руки.
 *
 * ФОРМУ ЗАДАЁТ АВТОРСКАЯ ПИКСЕЛЬНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ БОЕВЫХ ЧИСЕЛ.
 * Приём взят у образцового `pistol.ts` и по той же причине: на холсте, который
 * занимает в кадре полсотни пикселей, градиент — мыло, а попиксельный шум —
 * грязь. Форму несут силуэт, жёсткий контур и резкие границы тонов.
 *
 * ОДНО ОТЛИЧИЕ ОТ ПИСТОЛЕТА: карта авторится в СИСТЕМЕ ОРУЖИЯ — ствол лежит
 * горизонтально, дуло слева, `u` вдоль оружия, `v` поперёк. На холст она ложится
 * СО СДВИГОМ СТРОКИ (`SLOPE`), и оружие само встаёт по диагонали вверх-влево
 * чистой лесенкой 1:2. Рисовать эту лесенку вручную по клеткам нельзя: она
 * длиной в полсотни клеток, правится в одном месте, а разъезжается в трёх. Сдвиг
 * — это ТОЛЬКО перевод карты в клеточную сетку холста; тела и кромки считаются
 * уже по сетке, поэтому свет и грани выходят такими же, как у пистолета.
 *
 * КАРТ ДВЕ, И ВЫБИРАЕТ МЕЖДУ НИМИ ЁМКОСТЬ. Переломка с двумя патронами и помпа
 * с подствольным магазином — разные вещи, и на плоских тонах их различает ровно
 * один признак: у двустволки два канала рядом со светлой прицельной планкой
 * между ними и никакой трубки под стволом, у помпы — один широкий канал и
 * трубка магазина, длина которой и есть его ёмкость.
 *
 * Обе руки в кадре: правая на шейке приклада внизу справа, левая на цевье.
 * Перчатка ликвидатора СВЕТЛЕЕ воронения — иначе тёмная резина на тёмном железе
 * сливается в одно пятно, где не читаются ни пальцы, ни граница руки и оружия.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, put } from '../draw';
import { VM } from '../types';

/** Клетка карты — два пикселя; сетка холста ровно из таких клеток. */
const CELL = 2;
const G = VM / CELL;
/** Левый верхний угол карты в сетке и наклон: одна клетка вниз на две вправо. */
const X0 = 6;
const Y0 = 12;
const SLOPE = 0.5;

/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = X0 * CELL + 1;
const MUZZLE_Y = (Y0 + 3) * CELL + 1;

/**
 * Помповое ружьё: один широкий канал, трубчатый магазин, скользящее цевьё.
 *
 * `.` пусто · `B` канал ствола · `D` ствол и коробка снизу · `R` мушка
 * `S` ствольная коробка и скоба · `T` верхняя грань коробки
 * `N` трубка подствольного магазина · `W` дерево · `V` светлая грань дерева
 * `G` шейка приклада
 * `H` перчатка · `K` сустав пальца · `J` щель между пальцами · `C` манжет
 * `A` рукав · `E` тень рукава
 *
 *      0         1         2         3         4
 *      012345678901234567890123456789012345678901234567                      */
const PUMP: readonly string[] = [
  '.R',
  '..........KKJKKJK',
  'DDDDDDDDDDKKJKKJKDDDDTTTTTTTTTTTTT',
  'BDDDDDDDDDKKJKKJKDDDDSSSSSSSSSSSSSSS',
  'BDDDDDDDDDHHJHHJHDDDDSSSSSSSSSSSSSSSVVVVVVVVVVVV',
  'DDDDDDDDDDHHJHHJHDDDDSSSSSDDDDSSSSSSWWWWWWWWWWWW',
  'DDDDDDDDVVHHJHHJHVVVVSSSSSDDDDSSSSSSWWWWWWWWWWWW',
  'NNNNNNNNWWHHJHHJHWWWWSSSSSSSSSSSSSSSWWWWWWWWWWWW',
  'NNNNNNNNWWHHHHHHHWWWWSSSSSSSSSSSSSSSKKKKKKKKKWWW',
  'NNNNNNNNWWHHHHHHHWWWWSSSSSSSSSSSSSSSJJJJJJJJJWWW',
  '........WWHHHHHHHWWWWSSSSSSSSSSSSSSSKKKKKKKKKWWW',
  '........WWCCCCCC.WWWWSSSSSSSSSSSSSSSKKKKKKKKKWWW',
  '.........WAAAAAA.WWW.SSSSSSSSSSSSSSSJJJJJJJJJGGG',
  '.....................SSSSSSSSSSSSSSSKKKKKKKKK',
  '............................SSSSSSGGJJJJJJJJJ',
  '............................S....SGGKKKKKKKKK',
  '............................SSSSSSGGGKKKKKKKK',
  '..................................GGGJJJJJJJJ',
  '...................................GGGKKKKKKK',
  '...................................GGGKKKKKKK',
  '...................................GGGHHHHHHH',
  '.....................................CCCCCCC',
  '......................................AAAAA',
];

/**
 * Переломка: два канала рядом, светлая планка между ними, трубки нет вовсе.
 *
 * Тот же алфавит; `T` здесь работает ещё и планкой между стволами, а два `B` на
 * срезе — те самые два очка, по которым двустволку узнают с одного взгляда.
 */
const TWIN: readonly string[] = [
  '.R',
  '..........KKJKKJK',
  'BDDDDDDDDDKKJKKJKDDDDTTTTTTTTTTTTT',
  'DDDDDDDDDDKKJKKJKDDDDSSSSSSSSSSSSSSS',
  'TTTTTTTTTTHHJHHJHTTTTSSSSSSSSSSSSSSSVVVVVVVVVVVV',
  'BDDDDDDDDDHHJHHJHDDDDSSSSSDDDDSSSSSSWWWWWWWWWWWW',
  'DDDDDDDDDDHHJHHJHDDDDSSSSSDDDDSSSSSSWWWWWWWWWWWW',
  '....VVVVVVHHJHHJHVVVVSSSSSSSSSSSSSSSWWWWWWWWWWWW',
  '....WWWWWWHHHHHHHWWWWSSSSSSSSSSSSSSSKKKKKKKKKWWW',
  '....WWWWWWHHHHHHHWWWWSSSSSSSSSSSSSSSJJJJJJJJJWWW',
  '.....WWWWWHHHHHHHWWWWSSSSSSSSSSSSSSSKKKKKKKKKWWW',
  '......WWWWCCCCCC.WWW.SSSSSSSSSSSSSSSKKKKKKKKKWWW',
  '..........AAAAAA.....SSSSSSSSSSSSSSSJJJJJJJJJGGG',
  '.....................SSSSSSSSSSSSSSSKKKKKKKKK',
  '............................SSSSSSGGJJJJJJJJJ',
  '............................S....SGGKKKKKKKKK',
  '............................SSSSSSGGGKKKKKKKK',
  '..................................GGGJJJJJJJJ',
  '...................................GGGKKKKKKK',
  '...................................GGGKKKKKKK',
  '...................................GGGHHHHHHH',
  '.....................................CCCCCCC',
  '......................................AAAAA',
];

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'shotgun',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 1.7, bob: 1.1, flash: 0.075 },
  draw({ buf, frame, skin, rand }) {
    const [bD2, bD1, bM, bL, bH] = ramp(skin.body);
    const [gD2, gD1, gM, gL, gH] = ramp(skin.grip);
    const [, aD1, aM] = ramp(skin.accent);
    /* Резина СВЕТЛЕЕ воронёного железа, и это обязательное условие, а не вкус:
     * тёмная перчатка на тёмном стволе сливается в одно чёрное пятно. */
    const gt = rand();
    const [vD2, vD1, vM, vL] = ramp([86 + gt * 16, 90 + gt * 16, 98 + gt * 18]);
    /** Холодный рефлекс: у резины блик голубовато-серый, а не телесный. */
    const RIM = rgba(122, 138, 160);
    const CUFF = rgba(96, 58, 30);
    const BORE = rgba(12, 11, 13);

    /** Тело, светлая кромка, тёмная кромка — по одному на материал. */
    const MATERIAL: Readonly<Record<string, readonly [number, number, number]>> = {
      B: [BORE, BORE, BORE],
      D: [bD1, bL, bD2],
      R: [bD2, bM, bD2],
      S: [bM, bH, bD2],
      T: [bL, bH, bD1],
      N: [bD1, bM, bD2],
      Y: [aM, aD1, aD1],
      W: [gM, gL, gD2],
      V: [gL, gH, gD1],
      G: [gD1, gM, gD2],
      H: [vM, vL, vD2],
      K: [vL, RIM, vD1],
      J: [vD2, vD1, vD2],
      C: [CUFF, rgba(134, 86, 46), rgba(48, 28, 14)],
      A: [vD1, vM, vD2],
      E: [vD2, vD1, vD2],
    };

    const fire = frame === 'fire';
    const reload = frame === 'reload';
    /* Ёмкости у переломки почти нет, и весь силуэт следует именно отсюда: два
     * ствола рядом вместо трубчатого магазина. */
    const twin = skin.magazine <= 5;
    const MAP = twin ? TWIN : PUMP;
    /* На перезарядке ружьё уводят вправо и вниз, а не только вниз: под коробкой
     * начинается полоса HUD, и опущенное строго вниз окно просто исчезает. */
    const sx = reload ? 5 : 0;
    const sy = reload ? 6 : 0;
    /* Ёмкость видна тем, НАСКОЛЬКО далеко трубка магазина уходит к срезу: у
     * шестизарядного она обрывается на полствола, у ленточного идёт почти к дулу. */
    const tubeLen = Math.max(4, Math.min(9, Math.round(skin.magazine * 0.9)));
    /* Цевьё отведено назад на выстреле и на перезарядке — это и есть помпа.
     * У переломки цевьё не ездит: там ездят сами стволы. */
    const pump = !twin && frame !== 'idle' ? 2 : 0;

    const grid = new Array<string>(G * G).fill('.');
    const cellX = (u: number) => X0 + u + sx;
    const cellY = (u: number, v: number) => Y0 + v + sy + Math.floor(u * SLOPE);

    /* ── Предплечья ──
     * Кладутся ПЕРВЫМИ: кисть обязана лечь поверх рукава, а не наоборот. Рука
     * входит из кадра и уходит ЗА нижний срез; в боковой край её пускать нельзя —
     * он приходится на треть ширины экрана. */
    const forearm = (u: number, v: number, lean: number, r0: number) => {
      const x = cellX(u);
      const y = cellY(u, v);
      const tx = x + lean;
      const ty = G + 4;
      for (let i = 0; i <= 64; i++) {
        const t = i / 64;
        const cx = x + (tx - x) * t;
        const cy = y + (ty - y) * t;
        const rr = r0 + t * 1.4;
        const lo = Math.round(cx - rr);
        const hi = Math.round(cx + rr);
        for (let dy = -1; dy <= 1; dy++) {
          const py = Math.round(cy) + dy;
          if (py < 0 || py >= G) continue;
          for (let px = lo; px <= hi; px++) {
            if (px < 0 || px >= G) continue;
            grid[py * G + px] = px === lo ? 'A' : 'E';
          }
        }
      }
    };
    forearm(13 - pump, 9, -7, 3.1);
    forearm(40, 17, 5, 3.7);

    /* ── Карта в сетку холста ── */
    for (let v = 0; v < MAP.length; v++) {
      const row = MAP[v];
      for (let u = 0; u < row.length; u++) {
        const ch = row[u];
        if (ch === '.') continue;
        if (ch === 'N' && u >= tubeLen) continue;
        if (!skin.stock && u > 35 && (ch === 'W' || ch === 'V')) continue;
        /* Цевьё, кисть и манжет едут вместе: помпа передёрнута назад. Ствол,
         * коробка и дуло стоят, иначе вспышка оторвётся от объявленной точки. */
        const slide = pump && u >= 8 && u <= 20 && (ch === 'W' || ch === 'V' || ch === 'H' || ch === 'K' || ch === 'J' || ch === 'C');
        const x = cellX(u) + (slide ? pump : 0);
        const y = cellY(u, v) + (slide ? 1 : 0);
        if (x < 0 || y < 0 || x >= G || y >= G) continue;
        grid[y * G + x] = ch;
      }
    }
    /* Из-под отведённого цевья выходит голая трубка магазина. Без неё на месте
     * ушедшего дерева остаётся дыра, и ствол читается переломленным пополам. */
    for (let u = 8; u < 8 + pump; u++) {
      for (let v = 6; v <= 11; v++) {
        const x = cellX(u);
        const y = cellY(u, v);
        if (x < 0 || y < 0 || x >= G || y >= G) continue;
        if (grid[y * G + x] === '.' || grid[y * G + x] === 'E' || grid[y * G + x] === 'A') grid[y * G + x] = 'N';
      }
    }
    /* Окно выброса на ближней щеке: на выстреле распахнуто и оттуда летит гильза. */
    if (fire) {
      for (let u = 26; u <= 29; u++) {
        for (let v = 5; v <= 6; v++) {
          const x = cellX(u);
          const y = cellY(u, v);
          if (x >= 0 && y >= 0 && x < G && y < G) grid[y * G + x] = 'B';
        }
      }
      for (let i = 0; i < 3; i++) {
        const x = cellX(28) + 2 + i;
        const y = cellY(28, 3) - 2 - i;
        if (x >= 0 && y >= 0 && x < G && y < G) grid[y * G + x] = 'Y';
      }
    }
    // На перезарядке свежий патрон идёт в распахнутое окно с ближней щеки.
    if (reload) {
      for (let i = 0; i < 5; i++) {
        const x = cellX(27) + i;
        const y = cellY(27, 10) + 2;
        if (x >= 0 && y >= 0 && x < G && y < G) grid[y * G + x] = i < 2 ? 'Y' : 'W';
      }
    }

    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= G || y >= G ? '.' : grid[y * G + x]);

    /* ── Тела ── */
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const mat = MATERIAL[at(x, y)];
        if (!mat) continue;
        for (let dy = 0; dy < CELL; dy++) {
          for (let dx = 0; dx < CELL; dx++) put(buf, x * CELL + dx, y * CELL + dy, mat[0]);
        }
      }
    }

    /* ── Кромки ──
     * Клетка крупная, кромка тонкая: светлая грань сверху и слева, тёмная снизу
     * и справа. Это и есть «свет сверху-слева», и ровно этим плоская заливка
     * перестаёт быть наклейкой. */
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const ch = at(x, y);
        const mat = MATERIAL[ch];
        if (!mat || ch === 'B') continue;
        const px = x * CELL;
        const py = y * CELL;
        if (at(x, y - 1) !== ch) for (let dx = 0; dx < CELL; dx++) put(buf, px + dx, py, mat[1]);
        if (at(x - 1, y) !== ch) for (let dy = 0; dy < CELL; dy++) put(buf, px, py + dy, mat[1]);
        if (at(x, y + 1) !== ch) for (let dx = 0; dx < CELL; dx++) put(buf, px + dx, py + CELL - 1, mat[2]);
        if (at(x + 1, y) !== ch) for (let dy = 0; dy < CELL; dy++) put(buf, px + CELL - 1, py + dy, mat[2]);
      }
    }

    /* ── Что решают числа вещи ── */
    // Латунный поясок на казённом срезе: у ружья он единственная тёплая точка.
    for (let v = 3; v <= 6; v++) {
      const x = cellX(21);
      const y = cellY(21, v);
      if (at(x, y) !== 'S') continue;
      put(buf, x * CELL, y * CELL, aM);
      put(buf, x * CELL, y * CELL + 1, aD1);
    }
    // Сколы на воронении ствола: у дешёвого ружья их больше. Точками по кромке,
    // а не краплением по телу — крапление читается грязью, а не сколом.
    const chips = Math.round(skin.wear * 9);
    for (let i = 0; i < chips; i++) {
      const u = 1 + Math.floor(rand() * 9);
      const v = 2 + Math.floor(rand() * 4);
      const x = cellX(u);
      const y = cellY(u, v);
      if (at(x, y) !== 'D') continue;
      put(buf, x * CELL, y * CELL + 1, bL);
    }

    contour(buf);
  },
});
