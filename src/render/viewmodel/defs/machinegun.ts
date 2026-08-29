/**
 * Пулемёт: ребристый кожух, сошки, короб с лентой — самый массивный силуэт.
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
 * Массу несут не размеры корпуса, а то, чего нет ни у автомата, ни у винтовки:
 * РАСКИНУТЫЕ СОШКИ под кожухом, поперечные рёбра охлаждения и КОРОБ С ЛЕНТОЙ
 * под коробкой. Архетип берут стволы с лентой от сотни патронов, и эта сотня
 * обязана быть видна как железный ящик, а не как рожок побольше.
 *
 * Обе руки в кадре: правая на рукояти внизу справа, левая на кожухе позади
 * сошек. Перчатка ликвидатора СВЕТЛЕЕ воронения — иначе тёмная резина на тёмном
 * железе сливается в одно пятно, где не читаются ни пальцы, ни граница руки.
 *
 * Холст прижат к ПРАВОМУ краю кадра, столбец `c` — это столбец экрана `192 + c`.
 * В ЛЕВЫЙ край упираться нельзя: он приходится на середину кадра, и силуэт
 * оборвался бы прямым срезом в воздухе. Это правило нарушал именно пулемёт и
 * стоило отдельной починки: наружу можно вправо и вниз.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, put } from '../draw';
import { VM } from '../types';

/** Клетка карты — два пикселя; сетка холста ровно из таких клеток. */
const CELL = 2;
const G = VM / CELL;
/** Левый верхний угол карты в сетке и наклон: одна клетка вниз на две вправо. */
const X0 = 5;
const Y0 = 10;
const SLOPE = 0.5;

/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = X0 * CELL + 1;
const MUZZLE_Y = (Y0 + 4) * CELL + 1;

/**
 * Силуэт в системе оружия: `u` вдоль ствола от дула, `v` поперёк сверху вниз.
 *
 * `.` пусто · `B` канал ствола · `D` кожух · `T` ребро охлаждения и крышка
 * `S` ствольная коробка, сошки, скоба · `W` дерево упора · `V` светлая грань
 * `G` рукоять · `M` короб ленты · `N` пояс короба и патроны ленты
 * `H` перчатка · `K` сустав пальца · `J` щель между пальцами · `C` манжет
 * `A` рукав · `E` тень рукава
 *
 *      0         1         2         3         4         5
 *      0123456789012345678901234567890123456789012345678901                   */
const MAP: readonly string[] = [
  '.......................TTTTTTTTTTTTTTT',
  '......................SSSSSSSSSSSSSSSSS',
  '......................SSSSSSSSSSSSSSSSS',
  'DDDTDDTDDTDDTDDTDDTDDTSSSSSSSSSSSSSSSSSVVVVVVVVVVVV',
  'BDDTDDTDDTKKJKKJKDDTSSSSSSSSSSSSSSSSSSSWWWWWWWWWWWW',
  'BDDTDDTDDTKKJKKJKDDTSSSSSDDDDSSSSSSSSSSWWWWWWWWWWWW',
  'DDDTDDTDDTHHJHHJHDDTSSSSSDDDDSSSSSSSSSSWWWWWWWWWWWW',
  'DDDTDDTDDTHHJHHJHDDTSSSSSSSSSSSSSSSSSSSWWWWWWWWWWWW',
  'DDDTDDTDDTHHJHHJHDDTSSSSSSSSSSSSSSSSSSSWWWWWWWWWWWW',
  '...DDDDDDDHHHHHHHDDDSSSSSSSSSSSSSSSSSSSKKKKKKKKKWWW',
  '.......SSS..HHHHHHH..SSSSSSSSSSSSSSSSSSJJJJJJJJJWWW',
  '......SS.SS.CCCCCC.......NMNMNMNMSSSSSSKKKKKKKKKWWW',
  '.....SS...SS.AAAAAA.....MMMMMMMMMS....SJJJJJJJJJWWW',
  '....SS.....SS...........MMMMMMMMMS....SKKKKKKKKKGGG',
  '...SS.......SS..........MMMNNNMMMSSSSSSKKKKKKKKKKK',
  '..SS.........SS.........MMMNNNMMM..GGGJJJJJJJJJJJJ',
  '.SS...........SS........MMMNNNMMM..GGGKKKKKKKKKKKK',
  'SS.............SS.......MMMMMMMMM...GGGKKKKKKKKKKK',
  'SSS...........SSS.......MMMMMMMMM...GGGJJJJJJJJJJJ',
  '........................NNNNNNNNN...GGGKKKKKKKKKKK',
  '....................................GGGHHHHHHHHHHH',
  '.....................................CCCCCCCCCC',
  '......................................AAAAAAAA',
];

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'machinegun',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 0.85, bob: 0.8, swap: 0.34, flash: 0.05 },
  draw({ buf, frame, skin, rand }) {
    const [bD2, bD1, bM, bL, bH] = ramp(skin.body);
    const [gD2, gD1, gM, gL, gH] = ramp(skin.grip);
    const [aD2, aD1, aM, aL] = ramp(skin.accent);
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
      T: [bL, bH, bD1],
      S: [bM, bH, bD2],
      W: [gM, gL, gD2],
      V: [gL, gH, gD1],
      G: [gD1, gM, gD2],
      M: [aD2, aD1, aD2],
      N: [aL, aL, aM],
      H: [vM, vL, vD2],
      K: [vL, RIM, vD1],
      J: [vD2, vD1, vD2],
      C: [CUFF, rgba(134, 86, 46), rgba(48, 28, 14)],
      A: [vD1, vM, vD2],
      E: [vD2, vD1, vD2],
    };

    const fire = frame === 'fire';
    const reload = frame === 'reload';
    /* На перезарядке пулемёт уводят вниз-вправо целиком, вместе с руками, и
     * крышка приёмника откинута. Подмена детали на месте читалась бы дёрганьем. */
    const sx = reload ? 4 : 0;
    const sy = reload ? 7 : 0;
    /* Глубина короба от ёмкости ленты: сотня патронов и полсотни не могут
     * висеть под коробкой одинаковым ящиком. */
    const canTrim = skin.magazine >= 26 ? 0 : skin.magazine >= 18 ? 1 : 2;

    const grid = new Array<string>(G * G).fill('.');
    const cellX = (u: number) => X0 + u + sx;
    const cellY = (u: number, v: number) => Y0 + v + sy + Math.floor(u * SLOPE);

    /* ── Предплечья ──
     * Кладутся ПЕРВЫМИ: кисть обязана лечь поверх рукава, а не наоборот. Левое
     * уходит вниз-влево МИМО сошек, а не в левый край холста: тот приходится на
     * середину кадра и дал бы вертикальный срез в воздухе. */
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
    forearm(13, 8, -4, 3.1);
    forearm(43, 17, 5, 3.8);

    /* ── Карта в сетку холста ── */
    for (let v = 0; v < MAP.length; v++) {
      const row = MAP[v];
      for (let u = 0; u < row.length; u++) {
        const ch = row[u];
        if (ch === '.') continue;
        // Короб и лента: на перезарядке короб снят, лента висит из приёмника.
        if ((ch === 'M' || ch === 'N') && u >= 22 && u <= 35) {
          if (reload && v >= 12) continue;
          if (v > 19 - canTrim) continue;
        }
        if (!skin.stock && u > 38 && (ch === 'W' || ch === 'V')) continue;
        const x = cellX(u);
        const y = cellY(u, v);
        if (x < 0 || y < 0 || x >= G || y >= G) continue;
        grid[y * G + x] = ch;
      }
    }
    /* Затвор на очереди отведён: окно выброса распахнуто и черно. Кожух и дуло
     * при этом стоят на месте, иначе вспышка оторвётся от объявленной точки. */
    if (fire) {
      for (let u = 25; u <= 28; u++) {
        for (let v = 5; v <= 7; v++) {
          const x = cellX(u);
          const y = cellY(u, v);
          if (x >= 0 && y >= 0 && x < G && y < G) grid[y * G + x] = 'B';
        }
      }
    }
    // На перезарядке крышка приёмника откинута вверх, и это видно с одного взгляда.
    if (reload) {
      for (let i = 0; i < 14; i++) {
        const u = 24 + i;
        const x = cellX(u);
        const y = cellY(u, 1) - 2 - (i >> 2);
        if (x >= 0 && y >= 0 && x < G && y < G) grid[y * G + x] = 'T';
        if (x >= 0 && y + 1 >= 0 && x < G && y + 1 < G) grid[(y + 1) * G + x] = 'S';
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
    // Сколы на воронении коробки: у дешёвого ствола их больше. Точками по
    // кромке, а не краплением по телу — крапление читается грязью, а не сколом.
    const chips = Math.round(skin.wear * 9);
    for (let i = 0; i < chips; i++) {
      const u = 23 + Math.floor(rand() * 14);
      const v = 2 + Math.floor(rand() * 6);
      const x = cellX(u);
      const y = cellY(u, v);
      if (at(x, y) !== 'S') continue;
      put(buf, x * CELL, y * CELL + 1, bL);
    }

    contour(buf);
  },
});
