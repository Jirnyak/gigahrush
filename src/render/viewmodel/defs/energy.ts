/**
 * Энергетическое: гаусс, плазма, BFG, гравилуч.
 *
 * ФОРМУ ЗАДАЁТ АВТОРСКАЯ ПИКСЕЛЬНАЯ КАРТА, МАТЕРИАЛ СЧИТАЕТСЯ ИЗ БОЕВЫХ ЧИСЕЛ —
 * тот же приём, что в образцовом `pistol.ts`. Прежняя версия собирала эмиттер из
 * наклонных плашек с цилиндрической затенкой и попиксельным шумом: на холсте,
 * который занимает в кадре полсотни пикселей, градиент превращается в мыло, а шум
 * — в грязь. Форму на этом размере несут СИЛУЭТ, ЖЁСТКИЙ КОНТУР И РЕЗКИЕ ГРАНИЦЫ
 * ТОНОВ, и ничего больше.
 *
 * Свечение пишется ЖЁСТКИМИ СВЕТЛЫМИ ЯДРАМИ внутри силуэта: кадр вьюмодели
 * проходит через блум, и ореол он сделает сам — ему нужен яркий источник, а не
 * полупрозрачная дымка, которую потом обведёт контур. Заливать корпус светом
 * нельзя: свечение здесь работает АКЦЕНТОМ против железа, а не краской по нему.
 *
 * Клетка карты — два пикселя, но КРОМКИ рисуются по одному: светлая фаска сверху
 * и слева, тёмная снизу и справа. Это «свет сверху-слева» из рефов.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки 100..127
 * закрывает полоса HUD — туда идёт только масса предплечий. Холст прижат к
 * ПРАВОМУ краю кадра, столбец `c` — это столбец экрана `192 + c`: в ЛЕВЫЙ край
 * упираться нельзя, он приходится на середину кадра и дал бы прямой срез в
 * воздухе. Наружу можно вправо и вниз.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { blend, contour, line, put } from '../draw';
import { VM } from '../types';

/** Левый верхний угол карты на холсте. Клетка карты — два пикселя. */
const MAP_X = 16;
const MAP_Y = 24;
const CELL = 2;

/** Срез эмиттера. Из него бьёт луч и светит вспышка, поэтому он объявлен. */
const MUZZLE_X = MAP_X + 5 * CELL;
const MUZZLE_Y = MAP_Y + 4 * CELL;

/**
 * Силуэт.
 *
 * `.` пусто · `B` корпус и рельс · `O` шахта разгонного канала · `C` катушка
 * `E` заряд · `e` притухший заряд · `W` раскал добела · `M` батарея
 * `G` рукоять · `H` перчатка · `K` сустав пальца · `J` щель · `U` манжет
 *
 * ПРОФИЛЬ, А НЕ ВИД В ТОРЕЦ. Корпус уходит вверх-влево по диагонали, и зритель
 * видит БОКОВУЮ плоскость: борт ствольной коробки, кольца катушек, надетые на
 * разгонный канал, батарею под корпусом и венец эмиттера со штырями. Прежняя
 * версия ставила эмиттер строго анфас, и вещь читалась трубой с лампочкой: на
 * плоских тонах торцу показывать нечего.
 *
 * Опознавательных знаков три, и убрать нельзя ни один: КАТУШКИ поперёк канала
 * (медная шина — из рефов), ЗАРЯД жёстким ядром в шахте и на срезе, ВЕНЕЦ со
 * штырями. Без катушек это труба, без ядра — мёртвое железо.
 */
const MAP: readonly string[] = [
  '.....EEBBB....................................',
  '.......BBBB...................................',
  '..WWeee.BBBC..................................',
  '..WWeEEeBBCCC.................................',
  '...eEEEeBBCCC.................................',
  '...eeEEeBCCCC..CC.............................',
  'EE..eeeeCCCCBBCCC.............................',
  'EEBBBBBBCCCOBCCCC.BC..........................',
  '.BBBBBBCCCCEOCCCBBCCC.........................',
  '...BBBBCCCBBCCCBBCCC..........................',
  '.....BCCCBBCCCCOBCCB..........................',
  '.......CC..CCCBECCCBBB........................',
  '..........CCCCBCCCBBBBBB......................',
  '..........CCC.BCCCBBBBBBBBB...................',
  '...........C.BCCCCBBBBBBBBBBB.................',
  '.............CCCCMBBBBBBBBBBBBBB..............',
  '..............CGGGMMMBBBBBBBBBBBBB............',
  '............GGGGGHMMMBBBBBBBBBBBBB............',
  '...........GGHHHKKKMMMMBBBBBBBBBB.............',
  '............HKKKKKKJMMMMBBBBBBBBB.............',
  '............KKKKJJHKMMMMMBBBBBBB..............',
  '............KKJKKKKKMMMMBBBBBBBB..............',
  '............KKKKKKJJJMMBBBBBBBB...............',
  '............KKKJJHKKKMMBBBBBGGK...............',
  '............KKHKKKKK....GGGKKKK...............',
  '..............HKKJJJU..GGKKKKGJ...............',
  '...............JUUUUU..GGKHJJKKK..............',
  '..............UUUUUUU...HJKKKKKK..............',
  '..............UUUUUUUU..GKKKHJJK..............',
  '...............UUUUU....KKJJKKKKK.............',
  '...............UU.......KKKKKKKJJ.............',
  '........................KKKKJJHKK.............',
  '.........................KKKKKKKKJ............',
  '.........................KHKKKJJJ.............',
  '..........................GJJGGGG.............',
  '..........................GGGUUUUU............',
  '...........................UUUUUUU............',
  '...........................UUUUUUU............',
];

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.82), at(1.15), at(1.5), at(1.95)];
}

registerViewmodel({
  id: 'energy',
  slot: 'weapon',
  frames: ['idle', 'fire'],
  muzzle: [MUZZLE_X, MUZZLE_Y],
  motion: { recoil: 1.7, flash: 0.1, bob: 0.85 },
  draw({ buf, frame, skin, rand }) {
    const fire = frame === 'fire';
    const glow = Math.max(0.2, skin.glow);
    const [bD2, bD1, bM, , bH] = ramp(skin.body);
    const [gD2, , gM, gL] = ramp(skin.grip);
    /** Медная шина катушек: из рефов, и она же отделяет разгон от корпуса. */
    const [pD2, , pM, pL] = ramp([148, 92, 46]);
    const [mD2, , mM, mL] = ramp([skin.body[0] * 0.55, skin.body[1] * 0.55, skin.body[2] * 0.6]);
    const SHAFT = rgba(clamp(skin.body[0] * 0.24), clamp(skin.body[1] * 0.24), clamp(skin.body[2] * 0.3));
    /* Раскал светлый, но НЕ белый: чисто белым ядром эмиттер терял цвет заряда и
     * читался лампочкой. Белое остаётся только на самом острие. */
    const acc = skin.accent;
    const HOT = rgba(
      clamp(acc[0] * (fire ? 1.6 : 1.2) + glow * 42),
      clamp(acc[1] * (fire ? 1.6 : 1.2) + glow * 52),
      clamp(acc[2] * (fire ? 1.6 : 1.2) + glow * 52),
    );
    const DIM = rgba(clamp(acc[0] * 0.5), clamp(acc[1] * 0.62), clamp(acc[2] * 0.66));
    const WHITE = rgba(248, 254, 255);
    /* Перчатка ликвидатора, и здесь она ТЕМНЕЕ железа — наоборот к пистолету.
     * Правило одно и то же: рука обязана спорить с корпусом тоном. У пистолета
     * ствол воронёный, и резину пришлось высветлить; тут корпус — светлая сталь,
     * и светлая перчатка слилась бы с ней в одно пятно ровно так же. */
    const gt = rand();
    const [vD2, vD1, vM, vL] = ramp([44 + gt * 12, 47 + gt * 12, 54 + gt * 14]);
    /** Холодный рефлекс: у резины блик голубовато-серый, а не телесный. */
    const RIM = rgba(122, 138, 160);
    const CUFF = rgba(96, 58, 30);
    const CUFF_LIT = rgba(134, 86, 46);

    /** Тело, светлая кромка, тёмная кромка — по одному на материал. */
    const MATERIAL: Readonly<Record<string, readonly [number, number, number]>> = {
      B: [bM, bH, bD2],
      O: [SHAFT, bD1, SHAFT],
      C: [pM, pL, pD2],
      E: [HOT, WHITE, DIM],
      e: [DIM, HOT, bD2],
      W: [WHITE, WHITE, HOT],
      M: [mM, mL, mD2],
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
     * Пишутся ДО карты: кисти обязаны лечь ПОВЕРХ руки, иначе предплечье
     * накрывает собственные пальцы и от хвата остаётся серый клин.
     * Обе руки уходят в нижние углы и ЗА них. Левая — вниз-влево, но НЕ в левый
     * край холста: там был бы прямой вертикальный срез посреди экрана. */
    const leftX = MAP_X + 16 * CELL;
    const leftY = MAP_Y + 29 * CELL;
    line(buf, leftX, leftY, 24, VM + 30, vD1, 18);
    line(buf, leftX - 6, leftY - 4, 16, VM + 22, vM, 5);
    line(buf, leftX + 6, leftY + 4, 34, VM + 34, vD2, 6);

    const rightX = MAP_X + 30 * CELL;
    const rightY = MAP_Y + 35 * CELL;
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
     * и справа. Шахта канала кромки не получает — щель не имеет фаски. */
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
    /* Гребёнка радиатора: рёбра ПОПЕРЁК оси, и красят они ТОЛЬКО клетки корпуса.
     * В карте гребёнки нет намеренно — стоя в карте отдельным материалом, она
     * рассыпалась крапиной по пустоте вокруг силуэта. Здесь ребро физически не
     * может вылезти за корпус: оно пишется по его же клеткам. */
    for (let rib = 0; rib < 4; rib++) {
      const sx = 22 + rib * 2.6;
      const sy = 15 + rib * 1.8;
      for (let k = -4; k <= 4; k++) {
        const gx = Math.round(sx + k * 0.55);
        const gy = Math.round(sy - k * 0.84);
        if (cellAt(gx, gy) !== 'B') continue;
        for (let dx = 0; dx < CELL; dx++) put(buf, MAP_X + gx * CELL + dx, MAP_Y + gy * CELL, bD1);
      }
    }
    /* Шкала заряда на борту батареи: горит доля от ёмкости, на выстреле — на одну
     * меньше. Единственный элемент, по которому видно, сколько осталось. */
    const cells = 5;
    const lit = Math.max(1, Math.min(cells, Math.round(skin.magazine / 5) + 1)) - (fire ? 1 : 0);
    for (let i = 0; i < cells; i++) {
      const gx = 20 + i;
      const gy = 21 - Math.round(i * 0.7);
      // Ячейка пишется ТОЛЬКО по клетке батареи: иначе шкала рассыпается синими
      // точками по перчатке и корпусу, и заряда по ней не прочитать вовсе.
      if (cellAt(gx, gy) !== 'M') continue;
      put(buf, MAP_X + gx * CELL, MAP_Y + gy * CELL, i < lit ? HOT : DIM);
      put(buf, MAP_X + gx * CELL + 1, MAP_Y + gy * CELL, i < lit ? WHITE : DIM);
    }
    /* Металл в свету заряда: свет идёт ОТ вещи, а не сверху, поэтому ближнее
     * железо берёт цвет заряда. Наружу ореол не пишется — его сделает блум кадра,
     * ему нужен яркий источник, а не дымка, которую обведёт контур. */
    const glowR = fire ? 34 : 22;
    const glowK = (fire ? 0.34 : 0.15) * glow;
    for (let y = Math.max(0, MUZZLE_Y - glowR); y < Math.min(VM, MUZZLE_Y + glowR); y++) {
      for (let x = Math.max(0, MUZZLE_X - glowR); x < Math.min(VM, MUZZLE_X + glowR); x++) {
        if (!((buf[y * VM + x] >>> 24) & 0xff)) continue;
        const d = Math.hypot(x - MUZZLE_X, y - MUZZLE_Y);
        if (d > glowR) continue;
        // Красит металл ЦВЕТОМ заряда, а не белым: белый съедал катушки и рёбра в
        // одно светлое пятно, и вещь переставала читаться железом.
        blend(buf, x, y, HOT, (1 - d / glowR) * glowK * (0.65 + noise(x, y, 67) * 0.7));
      }
    }

    contour(buf);
  },
});
