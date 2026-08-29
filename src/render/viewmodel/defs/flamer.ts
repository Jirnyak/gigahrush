/**
 * Огнемёт: раструб с запальником, шланг, канистра, обе руки.
 *
 * ФОРМУ ЗАДАЁТ АВТОРСКАЯ ПИКСЕЛЬНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ БОЕВЫХ ЧИСЕЛ —
 * тот же приём, что в образцовом `pistol.ts`, и по той же причине. Прежняя версия
 * пакета собирала ствол из наклонных плашек с цилиндрической затенкой и
 * попиксельным шумом: на холсте, который занимает в кадре полсотни пикселей,
 * градиент превращается в мыло, а шум — в грязь. Форму на этом размере несут
 * СИЛУЭТ, ЖЁСТКИЙ КОНТУР И РЕЗКИЕ ГРАНИЦЫ ТОНОВ, и ничего больше.
 *
 * В карте нет ни одного цвета: символ называет МАТЕРИАЛ, а какого он оттенка,
 * насколько ржав и как высоко горит запальник, решают числа конкретной вещи.
 * Один силуэт обслуживает пять огнемётов, и все пять выглядят по-разному.
 *
 * Клетка карты — два пикселя, но КРОМКИ рисуются по одному: светлая фаска сверху
 * и слева, тёмная снизу и справа. Это «свет сверху-слева» из рефов, и ровно этим
 * плоская заливка перестаёт быть наклейкой.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки 100..127
 * закрывает полоса HUD — туда идёт только масса предплечий. В БОКОВЫЕ края
 * упираться нельзя: они приходятся на треть ширины экрана, и силуэт оборвался бы
 * прямым срезом в воздухе. Наружу можно только вниз — поэтому и струя на выстреле
 * обрезана не только сверху, но и слева.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { blend, contour, line, put } from '../draw';
import { VM } from '../types';

/** Левый верхний угол карты на холсте. Клетка карты — два пикселя. */
const MAP_X = 16;
const MAP_Y = 24;
const CELL = 2;

/** Срез раструба. Отсюда бьёт струя и стоит вспышка, поэтому он объявлен. */
const MUZZLE_X = MAP_X + 5 * CELL;
const MUZZLE_Y = MAP_Y + 4 * CELL;

/**
 * Ось трубы в пикселях холста, ОТ ПРИЁМНИКА К СРЕЗУ. По ней же идёт струя: огонь
 * тогда летит туда, куда смотрит раструб, а не поперёк собственного ствола.
 */
const AX = -0.837;
const AY = -0.547;
/** Выше этой строки и левее этого столбца огонь не пишется: он уходит ЗА кадр. */
const JET_CEIL = 22;
const JET_LEFT = 4;

/**
 * Силуэт.
 *
 * `.` пусто · `B` сопло · `O` жерло · `C` хомут · `D` приёмник · `V` трубка
 * запальника · `f` пламя · `F` ядро пламени · `T` канистра · `V` её обручи
 * `S` шланг · `s` гофра шланга · `G` рукоять
 * `H` перчатка · `K` сустав пальца · `J` щель между пальцами · `U` манжет
 *
 * ПРОФИЛЬ, А НЕ ВИД В ТОРЕЦ. Труба уходит вверх-влево по диагонали, и зритель
 * видит БОКОВУЮ плоскость: обод раструба, хомуты, борт приёмника, скос рукояти.
 * Схема выбрана не на вкус: у пистолета шесть карт были отрисованы разом одним
 * листом, и оружием читалась ровно одна — наклонная. На плоских тонах вид в
 * торец вырождается в столбик, потому что показывать ему нечего.
 *
 * Огнемёт опознаётся тремя вещами разом, и убрать нельзя ни одну: РАСТРУБ с
 * чёрным жерлом, ОГОНЁК ЗАПАЛЬНИКА сбоку от него (горит и в покое) и КАНИСТРА со
 * ШЛАНГОМ внизу слева. Без канистры вещь читается коротким дробовиком, без
 * запальника — просто трубой.
 */
const MAP: readonly string[] = [
  '..BBBBBBB.....................................',
  '.BBOOOOBBC....................................',
  '.BOOOOOOCC....................................',
  '.BOOOOOOCB....................................',
  'BBOOOOOCCBBCC.................................',
  '.BOOOOCCBBCCCB................................',
  '.BBOOOCCBBCCBBB...............................',
  '.BBBBCCBBCCBBBBCCC............................',
  '..BBCCBBCCCBBBBCCBB...........................',
  '..FffC.BCCBBBBCCCBBB.DDD......................',
  '..FFf..CCBBBBBCCBBBBCCDDDD....................',
  '..fffVV...BBBCCBBBBCCCBBDDD...................',
  '.....VVV...BCCCBBBBCCBBBBDDDD.................',
  '......VVVV..CCBBBBCCCBBBBDCCCDD...............',
  '........VVV...BBBCCCBBBBDDCCCCDDD.............',
  '.........VVVV..BBCCBBBBDDDDCCCCDDD............',
  '...........VVV..CCCBBBBDDDDDDCDDDDD...........',
  '............VVVVssBBBBDDDDDDDDDDDD............',
  '..............VssssBBDDDDDDDDDDDD.............',
  '............GG.ssssDDDDDDDDDDDDDD.............',
  '.........GGHHKKKsssDDDDDDDDDDDDD..............',
  '......s.HHKKKKKKsss.DDDDDDDDDDDD..............',
  '.....sSSGKKKKJJSSSS...DDDDDDDDD...............',
  '.....sSSKKJJKKKKKSS....DDDDDGG................',
  '......SSKKKKKKKJJSS.....DGGGKKK...............',
  '......SsKKKKJJHKKSS....GKKKKKKJ...............',
  '.CCCTCCCCTTHKKKKKSs....GGKKJJHKK..............',
  '.TTTTTTTTTTHKKKJJJ.....GHJHKKKKK..............',
  '.VVVVVVVVVVSJJUUUU......HKKKKJJJ..............',
  '.TTTTTTTTTTTUUUUUUU.....KKJJJKKKK.............',
  '.TTTTTTTTTTTUUUUUUU.....KKKKKKKGJ.............',
  '.TTTTTTTTTTTUUUUUU......KKKKHJJKK.............',
  '.VVVVVVVVVVVUU..........KKHJKKKKK.............',
  '.TTTTTTTTTTTT............KKKKKKJJ.............',
  '.TTTTTTTTTTTT.............HGJJGGG.............',
  '.TTTTTTTTTTTT.............GGGGUUU.............',
  '.VVVVVVVVVVVV..............UUUUUUU............',
  '.TTTTTTTTTTTT..............UUUUUUU............',
];

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'flamer',
  slot: 'weapon',
  frames: ['idle', 'fire'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 0.3, flash: 0.12, bob: 0.9 },
  draw({ buf, frame, skin, rand }) {
    const fire = frame === 'fire';
    const [bD2, , bM, bL, bH] = ramp(skin.body);
    const [, , cM, cL] = ramp(skin.accent);
    const [gD2, , gM, gL] = ramp(skin.grip);
    /* Приёмник — тёплое ТЁМНОЕ железо, выведенное из корпуса, а не своя палитра.
     * Серым он вставал ровно в тон перчатки, и рука пропадала в казённой части. */
    const [iD2, iD1, iM, iL] = ramp([skin.body[0] * 0.5, skin.body[1] * 0.5, skin.body[2] * 0.52]);
    /** Оливковый баллон армейского образца: он не деталь трубы, он к ней прицеплен. */
    const [tD2, , tM, tL] = ramp([70, 84, 58]);
    const HOOP = rgba(34, 30, 26);
    const BORE = rgba(14, 12, 12);
    const FLAME_MID = rgba(246, 142, 40);
    const FLAME_HOT = rgba(255, 232, 168);
    const SOOT = rgba(88, 42, 20);
    /* Перчатка ликвидатора, а не голая кисть: голая рука — большое бледное пятно
     * тона бетона, и она сливается со стеной при любой анатомии. Резина СВЕТЛЕЕ
     * тёмного приёмника, и это обязательное условие, а не вкус: тёмная перчатка
     * на тёмном железе слилась бы в одно пятно, где не читаются ни пальцы, ни
     * граница между рукой и оружием. */
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
      C: [cM, cL, bD2],
      D: [iM, iL, iD2],
      V: [HOOP, iD1, BORE],
      f: [FLAME_MID, FLAME_HOT, SOOT],
      F: [FLAME_HOT, FLAME_HOT, FLAME_MID],
      T: [tM, tL, tD2],
      /* Шланг и его гофра. Гофра идёт ЛАТУННОЙ ниткой, а не просто светлее резины:
       * тёмная на тёмном она сливалась с перчаткой, мимо которой шланг проходит, и
       * от связи бака с приёмником не оставалось ничего. */
      S: [gM, gL, gD2],
      s: [cM, cL, gD2],
      G: [gM, gL, gD2],
      H: [vM, vL, vD2],
      K: [vL, RIM, vD1],
      J: [vD2, vD1, vD2],
      U: [CUFF, CUFF_LIT, rgba(48, 28, 14)],
    };

    const cellAt = (gx: number, gy: number): string => {
      if (gy < 0 || gy >= MAP.length) return '.';
      const row = MAP[gy];
      return gx < 0 || gx >= row.length ? '.' : row[gx];
    };

    /* ── Предплечья ──
     * Пишутся ДО карты, а не после: канистра и кисти обязаны лечь ПОВЕРХ руки.
     * Нарисованное последним предплечье накрывало и бак, и собственные пальцы, и
     * от композиции оставался серый клин во весь низ кадра.
     *
     * Обе руки входят из нижних углов и уходят ЗА них: рука растёт из кадра, а не
     * висит в нём. Полосами, а не конусом: конус даёт ровную заливку без граней и
     * читается доской. Левая уводится вниз-влево МИМО левого края холста — там
     * был бы прямой вертикальный срез посреди экрана. */
    const leftX = MAP_X + 15 * CELL;
    const leftY = MAP_Y + 30 * CELL;
    line(buf, leftX, leftY, 22, VM + 30, vD1, 18);
    line(buf, leftX - 6, leftY - 4, 14, VM + 22, vM, 5);
    line(buf, leftX + 6, leftY + 4, 32, VM + 34, vD2, 6);

    const rightX = MAP_X + 35 * CELL;
    const rightY = MAP_Y + 33 * CELL;
    line(buf, rightX, rightY, VM - 8, VM + 34, vD1, 19);
    line(buf, rightX - 6, rightY - 5, VM - 18, VM + 26, vM, 5);
    line(buf, rightX + 6, rightY + 5, VM, VM + 38, vD2, 6);

    /* ── Тела ── */
    for (let gy = 0; gy < MAP.length; gy++) {
      for (let gx = 0; gx < MAP[0].length; gx++) {
        const mat = MATERIAL[cellAt(gx, gy)];
        if (!mat) continue;
        const x = MAP_X + gx * CELL;
        const y = MAP_Y + gy * CELL;
        for (let dy = 0; dy < CELL; dy++) for (let dx = 0; dx < CELL; dx++) put(buf, x + dx, y + dy, mat[0]);
      }
    }

    /* ── Кромки ──
     * Клетка крупная, кромка тонкая: светлая грань сверху и слева, тёмная снизу
     * и справа. Жерло кромки не получает — дыра не имеет фаски. */
    for (let gy = 0; gy < MAP.length; gy++) {
      for (let gx = 0; gx < MAP[0].length; gx++) {
        const ch = cellAt(gx, gy);
        if (ch === 'O') continue;
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
    /* Сколы и прогар на сопле: труба сварена в подвале и горит каждый день,
     * поэтому износ здесь всегда выше объявленного. Точками по кромке, а не
     * краплением по телу — крапление читается грязью, а не сколом. */
    const chips = Math.round(Math.min(1, skin.wear + 0.34) * 9);
    for (let i = 0; i < chips; i++) {
      const gy = 5 + Math.floor(rand() * 12);
      const gx = 8 + Math.floor(rand() * 10);
      if (cellAt(gx, gy) !== 'B') continue;
      put(buf, MAP_X + gx * CELL, MAP_Y + gy * CELL + 1, bL);
    }
    /* Огонёк запальника: в покое искра, на выстреле язычок. Он горит ВСЕГДА, и
     * именно по нему труба опознаётся огнемётом, а не коротким дробовиком. */
    const pilotX = MAP_X + 4 * CELL;
    const pilotY = MAP_Y + 9 * CELL;
    const pilotR = fire ? 5 : 3;
    for (let dy = -pilotR * 2; dy <= pilotR; dy++) {
      for (let dx = -pilotR; dx <= pilotR; dx++) {
        const d = dx * dx * 2.4 + dy * dy;
        if (d > pilotR * pilotR * 2.4) continue;
        blend(buf, pilotX + dx, pilotY + dy, d < pilotR * pilotR ? FLAME_HOT : FLAME_MID, 0.9);
      }
    }

    /* ── Струя ──
     * Язык, а не шар: считается ВДОЛЬ ОСИ трубы, поэтому огонь идёт туда, куда
     * смотрит раструб. Обрезан и сверху, и слева: наружу из холста оружия можно
     * только вниз, а боковой край приходится на треть ширины экрана. */
    if (fire) {
      const nx = -AY;
      const ny = AX;
      for (let u = -4; u <= 22; u += 0.5) {
        const t = Math.max(0, u) / 22;
        const w = 3.4 + t * t * 4.2;
        const cx = MUZZLE_X + AX * u;
        const cy = MUZZLE_Y + AY * u;
        for (let s = -w; s <= w; s += 0.5) {
          const px = cx + nx * s;
          const py = cy + ny * s;
          if (py < JET_CEIL || px < JET_LEFT) continue;
          const v = Math.abs(s) / w;
          const dens = (1 - v * v) * (0.72 + 0.6 * (1 - t));
          if (noise(px | 0, py | 0, 61) > dens) continue;
          const heat = dens * (1 - v * 0.55);
          blend(buf, px, py, heat > 0.55 ? FLAME_HOT : FLAME_MID, Math.min(1, 0.45 + heat));
        }
      }
      // Копоть по краям: чистого огня у этой трубы не бывает.
      for (let i = 0; i < 30; i++) {
        const px = MUZZLE_X + AX * rand() * 22 + nx * (rand() - 0.5) * 22;
        const py = MUZZLE_Y + AY * rand() * 22 + ny * (rand() - 0.5) * 22;
        if (py < JET_CEIL || px < JET_LEFT) continue;
        blend(buf, px, py, SOOT, 0.4);
      }
    }
    /* Металл в свету собственного огня: греется и в покое, от запальника. Красит
     * только уже написанное — наружу ореол не пишется, его сделает блум кадра. */
    const glowR = fire ? 44 : 20;
    const glowK = (fire ? 0.55 : 0.18) * Math.max(0.35, skin.glow);
    for (let y = Math.max(0, MUZZLE_Y - glowR); y < Math.min(VM, MUZZLE_Y + glowR); y++) {
      for (let x = Math.max(0, MUZZLE_X - glowR); x < Math.min(VM, MUZZLE_X + glowR); x++) {
        if (!((buf[y * VM + x] >>> 24) & 0xff)) continue;
        const d = Math.hypot(x - MUZZLE_X, y - MUZZLE_Y);
        if (d > glowR) continue;
        blend(buf, x, y, rgba(255, 148, 54), (1 - d / glowR) * glowK * (0.7 + noise(x, y, 53) * 0.6));
      }
    }

    contour(buf);
  },
});
