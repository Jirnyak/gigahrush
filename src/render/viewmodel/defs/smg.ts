/**
 * Пистолет-пулемёт: перфорированный кожух, дисковый бубен, обе руки на железе.
 *
 * ФОРМУ ЗАДАЁТ АВТОРСКАЯ ПИКСЕЛЬНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ БОЕВЫХ ЧИСЕЛ.
 * Приём взят у образцового `pistol.ts` и по той же причине: на холсте, который
 * занимает в кадре полсотни пикселей, градиент — мыло, а попиксельный шум —
 * грязь. Форму несут силуэт, жёсткий контур и резкие границы тонов. Символ карты
 * называет МАТЕРИАЛ, а оттенок, износ и размер бубна решают числа вещи.
 *
 * ОДНО ОТЛИЧИЕ ОТ ПИСТОЛЕТА: карта авторится в СИСТЕМЕ ОРУЖИЯ — ствол лежит
 * горизонтально, дуло слева, `u` вдоль оружия, `v` поперёк. На холст она ложится
 * СО СДВИГОМ СТРОКИ (`SLOPE`), и оружие само встаёт по диагонали вверх-влево
 * чистой лесенкой 1:2. Рисовать эту лесенку вручную по клеткам нельзя: она
 * длиной в полсотни клеток, правится в одном месте, а разъезжается в трёх. Сдвиг
 * — это ТОЛЬКО перевод карты в клеточную сетку холста; тела и кромки считаются
 * уже по сетке, поэтому свет и грани выходят такими же, как у пистолета.
 *
 * ПРОФИЛЬ, А НЕ ВИД В ТОРЕЦ: зритель видит боковую плоскость — ряд отверстий в
 * кожухе, крышку коробки, диск бубна и цельную деревянную ложу.
 *
 * От пистолета ПП отличает не длина, а два признака, читаемых за один кадр:
 * прорези кожуха и КРУГЛЫЙ ДИСКОВЫЙ БУБЕН под коробкой. Рожок здесь был бы
 * ошибкой: архетип берут стволы с магазином от полусотни, а это ППШ и его родня.
 *
 * Обе руки в кадре: правая на шейке ложи внизу справа, левая на кожухе. Перчатка
 * ликвидатора СВЕТЛЕЕ воронения — иначе тёмная резина на тёмном железе сливается
 * в одно пятно, где не читаются ни пальцы, ни граница руки и оружия.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, put } from '../draw';
import { VM } from '../types';

/** Клетка карты — два пикселя; сетка холста ровно из таких клеток. */
const CELL = 2;
const G = VM / CELL;
/** Левый верхний угол карты в сетке и наклон: одна клетка вниз на две вправо. */
const X0 = 10;
const Y0 = 13;
const SLOPE = 0.5;

/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = X0 * CELL + 1;
const MUZZLE_Y = (Y0 + 4) * CELL + 1;

/**
 * Силуэт в системе оружия: `u` вдоль ствола от дула, `v` поперёк сверху вниз.
 *
 * `.` пусто · `B` канал ствола и прорези кожуха · `D` кожух и компенсатор
 * `R` мушка и целик · `S` ствольная коробка · `T` крышка коробки
 * `W` дерево ложи · `V` светлая грань дерева · `G` шейка ложи
 * `M` бубен · `N` крышка и ось бубна
 * `H` перчатка · `K` сустав пальца · `J` щель между пальцами · `C` манжет
 * `A` рукав · `E` тень рукава
 *
 *      0         1         2         3         4
 *      01234567890123456789012345678901234567890123456                       */
const MAP: readonly string[] = [
  '....R....................RR',
  '...RRR.......KKJKKJK.....RR',
  'DDDRRRDDDDDDDKKJKKJKDDTTTTTTTTTTT',
  'DDDDDDBDBDBDDKKJKKJKDDSSSSSSSSSSSSSSS',
  'BDDDDDDDDDDDDHHJHHJHDDSSSSSSSSSSSSSSSVVVVVVVVVVV',
  'BDDDDDBDBDBDDHHJHHJHDDSSSSSSSSSSSSSSSWWWWWWWWWWW',
  'DDDDDDDDDDDDDHHJHHJHDDSSSSSSSSSSSSSSSWWWWWWWWWWW',
  '.............HHJHHJHDDSSSSSSSSSSSSSSSKKKKKKKKKWW',
  '.............HHHHHHH.DSSSSSSSSSSSSSSSJJJJJJJJJWW',
  '.............HHHHHHH..SSSSSSSSSSSSSSSKKKKKKKKKWW',
  '..............CCCCCC....MMMMMMMMM.SSSSKKKKKKKKKW',
  '..............AAAAAA...MMMMMMMMMMMS..SJJJJJJJJJW',
  '......................MMMMMMMMMMMMS..SKKKKKKKKKG',
  '......................MMMMNNNMMMMMSSSSKKKKKKKKK',
  '......................MMMNNNNNMMMM..GGJJJJJJJJJ',
  '......................MMMNNNNNMMMM..GGKKKKKKKKK',
  '......................MMMMNNNMMMMM..GGHHHHHHHHH',
  '......................MMMMMMMMMMMM...GCCCCCCCCC',
  '.......................MMMMMMMMMM....GAAAAAAA',
  '........................MMMMMMMM',
];

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'smg',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 0.72, bob: 1.05, flash: 0.045 },
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
      R: [bD2, bM, bD2],
      S: [bM, bH, bD2],
      T: [bL, bH, bD1],
      W: [gM, gL, gD2],
      V: [gL, gH, gD1],
      G: [gD1, gM, gD2],
      M: [aD1, aM, aD2],
      N: [aM, aL, aD1],
      H: [vM, vL, vD2],
      K: [vL, RIM, vD1],
      J: [vD2, vD1, vD2],
      C: [CUFF, rgba(134, 86, 46), rgba(48, 28, 14)],
      A: [vD1, vM, vD2],
      E: [vD2, vD1, vD2],
    };

    const fire = frame === 'fire';
    const reload = frame === 'reload';
    /* На перезарядке ПП уводят вниз-вправо целиком, вместе с руками: подмена
     * одной детали на месте читалась бы дёрганьем, а не движением. */
    const sx = reload ? 4 : 0;
    const sy = reload ? 7 : 0;
    /* Диаметр бубна от ёмкости: семьдесят один патрон и тридцать не могут
     * висеть под коробкой одинаковым блином. */
    const drumTrim = skin.magazine >= 26 ? 0 : skin.magazine >= 18 ? 1 : 2;

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
    forearm(16, 8, -7, 3);
    forearm(42, 15, 5, 3.6);

    /* ── Карта в сетку холста ── */
    for (let v = 0; v < MAP.length; v++) {
      const row = MAP[v];
      for (let u = 0; u < row.length; u++) {
        const ch = row[u];
        if (ch === '.') continue;
        // Бубен на перезарядке снят: он рисуется отдельно, ниже и в стороне.
        if ((ch === 'M' || ch === 'N') && (reload || v < 10 + drumTrim || v > 19 - drumTrim)) continue;
        if (!skin.stock && u > 37 && (ch === 'W' || ch === 'V')) continue;
        const x = cellX(u);
        const y = cellY(u, v);
        if (x < 0 || y < 0 || x >= G || y >= G) continue;
        grid[y * G + x] = ch;
      }
    }
    /* Затвор на очереди отведён: окно выброса распахнуто и черно. Кожух и дуло
     * при этом стоят на месте, иначе вспышка оторвётся от объявленной точки. */
    if (fire) {
      for (let u = 26; u <= 30; u++) {
        for (let v = 4; v <= 6; v++) {
          const x = cellX(u);
          const y = cellY(u, v);
          if (x >= 0 && y >= 0 && x < G && y < G) grid[y * G + x] = 'B';
        }
      }
    }
    // Снятый бубен висит под коробкой, ниже своего гнезда.
    if (reload) {
      for (let v = 10; v < 20; v++) {
        const row = MAP[v];
        for (let u = 0; u < row.length; u++) {
          const ch = row[u];
          if (ch !== 'M' && ch !== 'N') continue;
          if (v < 10 + drumTrim || v > 19 - drumTrim) continue;
          const x = cellX(u) - 3;
          const y = cellY(u, v) + 7;
          if (x >= 0 && y >= 0 && x < G && y < G) grid[y * G + x] = ch;
        }
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
    // Сколы на воронении кожуха: у дешёвого ствола их больше. Точками по кромке,
    // а не краплением по телу — крапление читается грязью, а не сколом.
    const chips = Math.round(skin.wear * 9);
    for (let i = 0; i < chips; i++) {
      const u = 2 + Math.floor(rand() * 10);
      const v = 2 + Math.floor(rand() * 4);
      const x = cellX(u);
      const y = cellY(u, v);
      if (at(x, y) !== 'D') continue;
      put(buf, x * CELL, y * CELL + 1, bL);
    }

    contour(buf);
  },
});
