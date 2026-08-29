/**
 * Винтовка: длинная ствольная коробка, рожок вниз, приклад в плечо, обе руки.
 *
 * ФОРМУ ЗАДАЁТ АВТОРСКАЯ ПИКСЕЛЬНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ БОЕВЫХ ЧИСЕЛ.
 * Приём взят у образцового `pistol.ts` и по той же причине: на холсте, который
 * занимает в кадре полсотни пикселей, градиент — мыло, а попиксельный шум —
 * грязь. Форму несут силуэт, жёсткий контур и резкие границы тонов. Символ карты
 * называет МАТЕРИАЛ, а какого он оттенка, насколько ржав и сколько патронов в
 * рожке — решают числа конкретного ствола, и восемь винтовок выглядят по-разному.
 *
 * ОДНО ОТЛИЧИЕ ОТ ПИСТОЛЕТА: карта авторится в СИСТЕМЕ ОРУЖИЯ — ствол лежит
 * горизонтально, дуло слева, `u` идёт вдоль оружия, `v` поперёк. На холст она
 * ложится СО СДВИГОМ СТРОКИ (`SLOPE`), и оружие само встаёт по диагонали
 * вверх-влево чистой лесенкой 1:2. Рисовать эту диагональ вручную по клеткам
 * нельзя: длинноствол занимает почти всю ширину холста, и лесенка длиной в
 * полсотни клеток правится в одном месте, а разъезжается в трёх. Сдвиг — это
 * ТОЛЬКО преобразование карты в клеточную сетку холста; тела и кромки считаются
 * уже по сетке, поэтому свет и грани выходят такими же, как у пистолета.
 *
 * ПРОФИЛЬ, А НЕ ВИД В ТОРЕЦ. Ствол, направленный строго в точку прицела, на
 * плоских тонах вырождается в столбик: у Doom это спрайт с настоящей отрисовкой
 * объёма, а торцу показывать нечего. Зритель видит БОКОВУЮ плоскость: коробку,
 * цевьё, рожок, скос приклада.
 *
 * Обе руки в кадре, и это главная разница с пистолетом: правая на рукояти внизу
 * справа, левая высоко на цевье. Перчатка ликвидатора СВЕТЛЕЕ воронения — иначе
 * тёмная резина на тёмном железе сливается в одно пятно, где не читаются ни
 * пальцы, ни граница руки и оружия.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки 100..127
 * закрывает полоса HUD. В БОКОВЫЕ края упираться нельзя: они приходятся на треть
 * ширины экрана, и силуэт оборвался бы прямым срезом в воздухе.
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
const Y0 = 11;
const SLOPE = 0.5;

/** Дульный срез. Из него светит вспышка, поэтому он объявлен, а не выведен. */
const MUZZLE_X = X0 * CELL + 1;
const MUZZLE_Y = (Y0 + 5) * CELL + 1;

/**
 * Силуэт в системе оружия: `u` вдоль ствола от дула, `v` поперёк сверху вниз.
 *
 * `.` пусто · `B` канал ствола · `P` ствол и газовая трубка · `R` мушка, целик,
 * газовый узел · `S` ствольная коробка · `D` окно выброса · `T` крышка коробки
 * `W` дерево цевья и приклада · `V` светлая грань дерева · `G` шейка и рукоять
 * `M` рожок · `N` пятка рожка
 * `H` перчатка · `K` сустав пальца · `J` щель между пальцами · `C` манжет
 * `A` рукав · `E` тень рукава
 *
 *      0         1         2         3         4         5
 *      0123456789012345678901234567890123456789012345678901                   */
const MAP: readonly string[] = [
  '.....R.....................RRR',
  '....RRR............KKJKKJK.RRR',
  '....RRR..PPPPPPRRPPKKJKKJKPRRRTTTTTTTTTTTT',
  '....RRRPPPPPPPPRRVVKKJKKJKVSSSSSSSSSSSSSSSS',
  'BDPPRRRPPPPPPPPRRWWHHJHHJHWSSSSSSSSSSSSSSSSVVVVVVVVVVV',
  'BDPPRRRPPPPPPPPRRWWHHJHHJHWSSSSSSSSSSSSSSSSWWWWWWWWWWW',
  'PPPPRRRPPPPPPPPRRWWHHJHHJHWSSSSSDDDSSSSSSSSWWWWWWWWWWW',
  '...............RRWWHHJHHJHWSSSSSSSSSSSSSSSSWWWWWWWWWWW',
  '.................WWHHJHHJHWSSSSSSSSSSSSSSSSWWWWWWWWWWW',
  '..................HHHHHHH..SSSSSSSSSSSSSSSS.WWWWWWWWWW',
  '..................HHHHHHH..MMMMMMMMMM..SSSSSSKKKKKKKWW',
  '..................CCCCCCC.MMMMMMMMMMM..S....SJJJJJJJWW',
  '..................AAAAAAA.MMMMMMMMMM...S....SKKKKKKKGG',
  '.........................MMMMMMMMMMM...SSSSSSKKKKKKKKK',
  '.........................MMMMMMMMMM......GGGJJJJJJJJJJ',
  '.........................MMMMMMMMMM......GGGKKKKKKKKKK',
  '.........................MMMMMMMMM........GGGKKKKKKKKK',
  '..........................MMMMMMMM........GGGJJJJJJJJJ',
  '..........................MMMMMMM..........GGGKKKKKKKK',
  '...........................................GGGKKKKKKKK',
  '...........................................GGGHHHHHHHH',
  '.............................................CCCCCCCC',
  '..............................................AAAAAA',
];

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'rifle',
  slot: 'weapon',
  frames: ['idle', 'fire', 'reload'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 1.35, bob: 0.9, swap: 0.28, flash: 0.06 },
  draw({ buf, frame, skin, rand }) {
    const [bD2, bD1, bM, bL, bH] = ramp(skin.body);
    const [gD2, gD1, gM, gL, gH] = ramp(skin.grip);
    /* Бакелит рожка выведен из дерева ложи, а не заведён отдельной палитрой:
     * это тот же кустарный полимер Хруща, только краснее и темнее. */
    const [kD2, kD1, kM, kL] = ramp([skin.grip[0] * 0.96, skin.grip[1] * 0.7, skin.grip[2] * 0.62]);
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
      P: [bD1, bL, bD2],
      R: [bD2, bM, bD2],
      S: [bM, bH, bD2],
      D: [bD2, bD1, bD2],
      T: [bL, bH, bD1],
      W: [gM, gL, gD2],
      V: [gL, gH, gD1],
      G: [gD1, gM, gD2],
      M: [kM, kL, kD2],
      N: [kD1, kM, kD2],
      H: [vM, vL, vD2],
      K: [vL, RIM, vD1],
      J: [vD2, vD1, vD2],
      C: [CUFF, rgba(134, 86, 46), rgba(48, 28, 14)],
      A: [vD1, vM, vD2],
      E: [vD2, vD1, vD2],
    };

    const fire = frame === 'fire';
    const reload = frame === 'reload';
    /* На перезарядке винтовку уводят вниз-вправо целиком, вместе с руками: так
     * же, как у пистолета. Подмена одной детали на месте читалась бы дёрганьем. */
    const sx = reload ? 3 : 0;
    const sy = reload ? 6 : 0;
    /* Ёмкость решает, насколько глубоко рожок свисает: обойма на пять патронов
     * не должна выглядеть тридцатизарядным рогом. */
    const magRows = Math.max(4, Math.min(9, 3 + Math.round(skin.magazine / 4)));
    const magLast = 9 + magRows;

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
    forearm(21, 9, -7, 3);
    forearm(48, 18, 5, 3.6);

    /* ── Карта в сетку холста ── */
    for (let v = 0; v < MAP.length; v++) {
      const row = MAP[v];
      for (let u = 0; u < row.length; u++) {
        let ch = row[u];
        if (ch === '.') continue;
        if (ch === 'M' || ch === 'N') {
          // Магазин на перезарядке вышел из гнезда: рисуется ниже и отдельно.
          if (reload || v > magLast) continue;
          ch = v === magLast ? 'N' : 'M';
        }
        if (!skin.stock && (u > 42 && (ch === 'W' || ch === 'V'))) continue;
        const x = cellX(u);
        const y = cellY(u, v);
        if (x < 0 || y < 0 || x >= G || y >= G) continue;
        grid[y * G + x] = ch;
      }
    }
    /* Затвор на очереди отведён: окно выброса распахнуто и черно. Ствол и дуло
     * при этом стоят на месте, иначе вспышка оторвётся от объявленной точки. */
    if (fire) {
      for (let u = 31; u <= 35; u++) {
        for (let v = 5; v <= 7; v++) {
          const x = cellX(u);
          const y = cellY(u, v);
          if (x >= 0 && y >= 0 && x < G && y < G) grid[y * G + x] = 'B';
        }
      }
    }
    // Вышедший рожок висит под коробкой, ниже своего гнезда.
    if (reload) {
      for (let v = 0; v < magRows; v++) {
        for (let u = 26; u < 36; u++) {
          const x = cellX(u) - 2;
          const y = cellY(u, 14 + v);
          if (x >= 0 && y >= 0 && x < G && y < G) grid[y * G + x] = v === magRows - 1 ? 'N' : 'M';
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
    // Сколы на воронении: у дешёвого ствола их больше. Точками по кромке
    // коробки, а не краплением по телу — крапление читается грязью, а не сколом.
    const chips = Math.round(skin.wear * 9);
    for (let i = 0; i < chips; i++) {
      const u = 28 + Math.floor(rand() * 14);
      const v = 3 + Math.floor(rand() * 6);
      const x = cellX(u);
      const y = cellY(u, v);
      if (at(x, y) !== 'S') continue;
      put(buf, x * CELL, y * CELL + 1, bL);
    }

    contour(buf);
  },
});
