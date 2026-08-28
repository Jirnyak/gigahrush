/**
 * Бензопила: корпус с ручкой-скобой, шина с зубьями, обе руки.
 *
 * Пила собрана по образцу `pistol.ts` и держит те же четыре правила:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Пила развёрнута боком: видно борт картера,
 *    петлю скобы над ним и плоскость шины. Прежняя версия ставила корпус
 *    прямоугольником анфас, и он читался ящиком с торчащей палкой.
 * 2. СБОРКА ОТ ПЯТКИ ЗАДНЕЙ РУКОЯТИ. Пятка задаёт низ, рукоять поднимает
 *    картер, от картера ось идёт к объявленному носу шины. Сдвинув пятку,
 *    двигаешь всю пилу целиком.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина — это расстояние от картера до
 *    ОБЪЯВЛЕННОГО носа; `skin.barrel` решает, какую долю забрал корпус, а не
 *    насколько пила выросла. Иначе длинная шина уезжает к прицелу.
 * 4. РУКИ РАСТУТ ИЗ УГЛОВ. Правая с задней рукояти уходит вниз-вправо, левая
 *    со скобы — вниз-влево, обе за нижний срез кадра.
 *
 * Узнаваемость держится на зубьях: без них шина читается ломом, и весь силуэт
 * теряет смысл. Поэтому кромка выкладывается поштучно, а не заливается плашкой.
 *
 * Шина выходит из НИЖНЕГО переднего угла картера, а не из его середины: только
 * так петля скобы проходит над корпусом, не задевая цепь, и только так левой
 * руке есть где взяться, не залезая пальцами на зубья.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки 100..127
 * закрывает полоса HUD — туда идёт только масса предплечий и пятка рукояти.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, put, skinTone } from '../draw';
import { VM, type ViewmodelSkin } from '../types';

/** Длина задней рукояти от пятки до картера. */
const GRIP_LEN = 30;

/**
 * Три такта одного замаха.
 *
 * Пила тяжёлая, она ходит целиком: между кадрами меняются пятка, наклон
 * рукояти, объявленный нос шины и толщина железа. Толщина и есть «ближе к
 * глазу»: на замахе пила придвинута, в покое отведена.
 */
interface Pose {
  /** Пятка задней рукояти. */
  heelX: number;
  heelY: number;
  /** Наклон рукояти от вертикали. */
  gripT: number;
  /** Объявленный нос шины: габарит, который облик делит. */
  tipX: number;
  tipY: number;
  /** Приближение к глазу: во столько раз толще железо. */
  wide: number;
}

const POSES: Readonly<Record<string, Pose>> = {
  // Покой: шина смотрит вперёд-вверх-влево, пила отведена от лица.
  idle: { heelX: 98, heelY: 118, gripT: -0.42, tipX: 36, tipY: 32, wide: 1 },
  // Замах: пила поднята, шина встала круче и придвинулась к глазу.
  swing: { heelX: 92, heelY: 122, gripT: -0.30, tipX: 56, tipY: 31, wide: 1.08 },
  // Удар: шина ушла вниз-влево, корпус провалился следом.
  swing2: { heelX: 100, heelY: 112, gripT: -0.70, tipX: 20, tipY: 66, wide: 1.03 },
};

/** Точка на оси шины: `u` вдоль неё от корня, `s` поперёк (плюс — вверх). */
type AtFn = (u: number, s?: number) => readonly [number, number];

/** Точка на петле скобы, `t` от 0 (внутри картера) до 1 (нижний сход). */
type BowFn = (t: number) => readonly [number, number];

/** Цвет от базового с множителем. */
const tint = (c: readonly [number, number, number], k: number) =>
  rgba(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));

/**
 * Наклонная плашка со скруглёнными торцами и цилиндрической затенкой.
 *
 * Собственный примитив пакета, а не общий: у каждого силуэта своя геометрия, и
 * повтор между пакетами здесь замысел. `tube` из `draw.ts` рисует только по
 * осям и наклонное тело выразить не может.
 */
function slab(
  buf: Uint32Array,
  x: number, y: number, ax: number, ay: number,
  len: number, half: number,
  base: readonly [number, number, number],
  seed: number, wear: number, round = 0,
): void {
  const nx = -ay;
  const ny = ax;
  const pad = Math.ceil(half + 2);
  const x0 = Math.max(0, Math.floor(Math.min(x, x + ax * len) - pad));
  const x1 = Math.min(VM - 1, Math.ceil(Math.max(x, x + ax * len) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(y, y + ay * len) - pad));
  const y1 = Math.min(VM - 1, Math.ceil(Math.max(y, y + ay * len) + pad));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - x;
      const dy = py - y;
      const u = dx * ax + dy * ay;
      const v = dx * nx + dy * ny;
      if (u < -round || u > len + round) continue;
      let w = half;
      if (round > 0) {
        if (u < round) w = half * Math.sqrt(Math.max(0, 1 - ((round - u) / round) ** 2));
        else if (u > len - round) w = half * Math.sqrt(Math.max(0, 1 - ((u - (len - round)) / round) ** 2));
      }
      if (w <= 0 || Math.abs(v) > w) continue;
      /* Свет с одной стороны: блик ближе к левой кромке, тень к правой. Именно
       * это читается как «круглое»; ровная заливка читается наклейкой. */
      const t = v / half;
      const lit = 1.3 - (t + 0.46) * (t + 0.46) * 1.0;
      const n = (noise(px, py, seed) - 0.5) * (10 + wear * 40);
      const rust = wear > 0 && noise(px * 3, py * 3, seed + 7) < wear * 0.3;
      const r = rust ? base[0] * 0.6 + 60 : base[0];
      const g = rust ? base[1] * 0.48 + 28 : base[1];
      const b = rust ? base[2] * 0.42 + 15 : base[2];
      buf[py * VM + px] = rgba(clamp(r * lit + n), clamp(g * lit + n), clamp(b * lit + n));
    }
  }
}

/**
 * Шина с пазом, носовой звёздочкой и поштучной кромкой зубьев.
 *
 * Рисуется ПЕРВОЙ: картер потом закрывает её корень, как и в железе.
 */
function drawBarAndTeeth(
  buf: Uint32Array, at: AtFn, ax: number, ay: number, nx: number, ny: number,
  steel: readonly [number, number, number], wear: number,
  barFrom: number, barLen: number, barHalf: number, tipX: number, tipY: number,
  toothCol: number, toothLit: number, toothDark: number,
): void {
  const [barX, barY] = at(barFrom);
  slab(buf, barX, barY, ax, ay, barLen, barHalf, steel, 11, wear * 0.5, barHalf * 0.85);
  // Паз шины: тёмная канавка по оси, по ней ходит цепь.
  slab(buf, barX + ax * 5, barY + ay * 5, ax, ay, barLen - 12, barHalf * 0.28, [30, 30, 34], 13, 0, 2);
  // Носовая звёздочка: шина закруглена, а не обрублена.
  ellipse(buf, tipX, tipY, barHalf + 1.4, barHalf + 1.4, tint(steel, 1.06));
  ellipse(buf, tipX, tipY, barHalf * 0.36, barHalf * 0.36, tint(steel, 0.4));

  /* ── Зубья ── */
  // Кромка выкладывается поштучно: на заливке пила читается ломом.
  for (let s = 8; s <= barLen - 4; s += 6) {
    const bx = barX + ax * s;
    const by = barY + ay * s;
    for (let side = -1; side <= 1; side += 2) {
      for (let j = 0; j < 4; j++) {
        // Зуб наклонён против хода цепи, поэтому со сносом назад по оси шины.
        const out = barHalf - 0.5 + j;
        const back = j * 1.1;
        const tx = bx + nx * side * out - ax * back;
        const ty = by + ny * side * out - ay * back;
        const wide = j < 2 ? 3 : 2;
        for (let q = 0; q < wide; q++) put(buf, tx + ax * q, ty + ay * q, j < 3 ? toothCol : toothLit);
      }
      // Впадина между зубьями: без неё кромка сливается в сплошную полосу.
      const gx = bx + nx * side * (barHalf - 0.6) + ax * 3.2;
      const gy = by + ny * side * (barHalf - 0.6) + ay * 3.2;
      for (let q = 0; q < 3; q++) put(buf, gx + ax * q, gy + ay * q, toothDark);
    }
  }
}

/**
 * Петля скобы: идёт над картером и спускается к его переднему низу — там за неё
 * и берётся левая рука, в стороне от цепи. Кубическая кривая, потому что
 * квадратная такой разворот выразить не может.
 */
function makeBow(at: AtFn, bodyLen: number, bodyHalf: number, rise: number): BowFn {
  const b0 = at(1, rise + bodyHalf * 0.4);
  const b1 = at(bodyLen * 0.5, rise + bodyHalf * 1.7);
  const b2 = at(bodyLen * 0.88, rise + bodyHalf * 0.4);
  const b3 = at(bodyLen * 0.48, rise - bodyHalf * 2.0);
  return (t: number) => {
    const u = 1 - t;
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    return [
      w0 * b0[0] + w1 * b1[0] + w2 * b2[0] + w3 * b3[0],
      w0 * b0[1] + w1 * b1[1] + w2 * b2[1] + w3 * b3[1],
    ] as const;
  };
}

/** Дуга скобы от звена `i0` до конца: 48 звеньев, каждое пятое светлее. */
function drawBowArc(buf: Uint32Array, bow: BowFn, i0: number, gripLit: number, gripCol: number): void {
  for (let i = i0; i <= 48; i++) {
    const [hx, hy] = bow(i / 48);
    ellipse(buf, hx, hy, 2.8, 2.8, i % 5 === 0 ? gripLit : gripCol);
  }
}

/** Картер с крышками, вентиляцией и шнуром стартёра. */
function drawCase(
  buf: Uint32Array, at: AtFn, ax: number, ay: number, nx: number, ny: number,
  skin: ViewmodelSkin, steel: readonly [number, number, number],
  bodyLen: number, bodyHalf: number, rise: number,
  darkBody: number, vent: readonly [number, number, number],
): void {
  const [caseX, caseY] = at(0, rise);
  slab(buf, caseX, caseY, ax, ay, bodyLen, bodyHalf, skin.body, 23, skin.wear, 5);
  /* Верхняя крышка. Цилиндрическая затенка кладёт на дальний борт почти
   * чёрное, и на картере такого размера это половина силуэта. Крышка со своим
   * бликом разбивает чёрный скат и читается пластиковым кожухом. */
  const [tcX, tcY] = at(bodyLen * 0.06, rise + bodyHalf * 0.5);
  slab(buf, tcX, tcY, ax, ay, bodyLen * 0.88, bodyHalf * 0.56,
    [skin.body[0] * 0.54, skin.body[1] * 0.5, skin.body[2] * 0.5], 27, skin.wear, 4);
  // Крышка сцепления: она прячет вход шины в картер.
  const [clX, clY] = at(bodyLen * 0.74, rise * 0.4);
  ellipse(buf, clX, clY, bodyHalf * 0.6, bodyHalf * 0.56, darkBody);
  ellipse(buf, clX, clY, bodyHalf * 0.18, bodyHalf * 0.16, tint(steel, 0.92));
  // Вентиляция картера: щели ПОПЕРЁК оси, по ним борт и читается бортом.
  for (let i = 0; i < 5; i++) {
    const [vx, vy] = at(bodyLen * 0.2 + i * 3.8, rise - bodyHalf * 0.6);
    slab(buf, vx, vy, nx, ny, bodyHalf * 1.1, 1.2, vent, 29 + i, 0, 0);
  }
  // Крышка бака на верхнем скате.
  const [capX, capY] = at(bodyLen * 0.2, rise + bodyHalf * 0.55);
  ellipse(buf, capX, capY, 4.2, 3.6, tint(skin.body, 1.4));
  // Шнур стартёра сзади.
  const [cordX, cordY] = at(1, rise - bodyHalf * 0.25);
  slab(buf, cordX, cordY, -ax, -ay, 8, 3, skin.grip, 37, skin.wear * 0.6, 2);
}

/** Задняя рукоять с насечкой и курком газа. */
function drawRearGrip(
  buf: Uint32Array, pose: Pose, upx: number, upy: number, rearHalf: number,
  skin: ViewmodelSkin, trigCol: readonly [number, number, number], hatchCol: number,
): void {
  slab(buf, pose.heelX, pose.heelY, upx, upy, GRIP_LEN, rearHalf, skin.grip, 43, skin.wear * 0.5, 3);
  // Насечка на щёчке: без неё рукоять читается гладкой трубой.
  for (let i = 0; i < 5; i++) {
    const u = 6 + i * 4.4;
    const hx = pose.heelX + upx * u;
    const hy = pose.heelY + upy * u;
    for (let s = -rearHalf * 0.75; s <= rearHalf * 0.75; s += 0.5) {
      const qx = (hx - upy * s) | 0;
      const qy = (hy + upx * s) | 0;
      if (qx < 0 || qy < 0 || qx >= VM || qy >= VM) continue;
      if (((buf[qy * VM + qx] >>> 24) & 0xff) === 0) continue;
      buf[qy * VM + qx] = hatchCol;
    }
  }
  // Курок газа с ближней стороны рукояти.
  slab(buf, pose.heelX + upx * 21 - upy * rearHalf * 0.85, pose.heelY + upy * 21 + upx * rearHalf * 0.85,
    -upy, upx, 7, 2.2, trigCol, 47, 0, 1);
}

/**
 * Кисть на хвате.
 *
 * Пальцы — отдельные валики ПОПЕРЁК хвата, и именно они отличают руку от
 * варежки: сплошное телесное пятно читается куском мяса, а не хватом.
 * Между пальцами идёт тёмная щель, иначе они слипаются в одну колбасу.
 */
function grasp(
  buf: Uint32Array, tone: readonly [number, number, number], flesh: (k: number) => number,
  hx: number, hy: number, gx: number, gy: number, seed: number,
): void {
  const px = -gy;
  const py = gx;
  slab(buf, hx - gx * 10, hy - gy * 10, gx, gy, 22, 10.5, tone, seed, 0, 5);
  for (let f = 0; f < 4; f++) {
    const u = 4 - f * 5.4;
    const fx = hx + gx * u;
    const fy = hy + gy * u;
    const len = 15 - Math.abs(f - 1.4) * 1.3;
    slab(buf, fx - px * 9 + 1, fy - py * 9 + 1.5, px, py, len, 3.2, [26, 18, 16], seed + 3 + f, 0, 2.4);
    slab(buf, fx - px * 9, fy - py * 9, px, py, len, 2.8,
      [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], seed + 11 + f, 0, 2.4);
    // Сустав ловит свет — без него пальцы читаются трубками.
    ellipse(buf, fx - px * 3.6, fy - py * 3.6, 2.7, 2.4, flesh(1.2));
  }
  // Большой палец лежит вдоль хвата с ближней стороны.
  slab(buf, hx + px * 7 - gx * 4, hy + py * 7 - gy * 4, gx * 0.8 + px * 0.6, gy * 0.8 + py * 0.6,
    16, 3.5, [tone[0] * 1.06, tone[1] * 1.01, tone[2] * 0.97], seed + 19, 0, 3);
}

/** Конус в угол кадра и ЗА него: рука растёт из кадра, а не висит. */
function forearm(
  buf: Uint32Array, flesh: (k: number) => number,
  hx: number, hy: number, tx: number, ty: number,
): void {
  const dx = tx - hx;
  const dy = ty - hy;
  const d = Math.max(1, Math.hypot(dx, dy));
  const wx = hx + (dx / d) * 9;
  const wy = hy + (dy / d) * 9;
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ellipse(buf, wx + (tx - wx) * t, wy + (ty - wy) * t, 10.5 + t * 9, 10.5 + t * 9, flesh(0.84 - t * 0.12));
  }
}

registerViewmodel({
  id: 'chainsaw',
  slot: 'weapon',
  frames: ['idle', 'swing', 'swing2'],
  // Дула пила не объявляет: она не стреляет, вспышке негде стоять.
  motion: { recoil: 0.45, bob: 1.25, swap: 0.5 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));

    const pose = POSES[frame] ?? POSES.idle;

    /* ── Сборка от пятки ── */
    const upx = Math.sin(pose.gripT);
    const upy = -Math.cos(pose.gripT);
    // Корень шины: там задняя рукоять встречает низ картера.
    const rootX = pose.heelX + upx * GRIP_LEN;
    const rootY = pose.heelY + upy * GRIP_LEN;
    const spanX = pose.tipX - rootX;
    const spanY = pose.tipY - rootY;
    const span = Math.hypot(spanX, spanY);
    const ax = spanX / span;
    const ay = spanY / span;
    const nx = -ay;
    const ny = ax;
    /** Точка на оси шины: `u` вдоль неё от корня, `s` поперёк (плюс — вверх). */
    const at = (u: number, s = 0) => [rootX + ax * u + nx * s, rootY + ay * u + ny * s] as const;

    // Облик делит отведённую длину: длинная шина означает короткий картер.
    const bodyLen = span * Math.max(0.30, Math.min(0.50, 1 - skin.barrel / 140));
    const bodyHalf = (11 + skin.bulk * 0.24) * pose.wide;
    // Картер сидит НАД осью шины: его середина поднята почти на полтолщины.
    const rise = bodyHalf * 0.45;
    const barHalf = (4.4 + skin.bulk * 0.05) * pose.wide;
    const barFrom = bodyLen * 0.85;
    const barLen = span - barFrom;

    const steel = skin.accent;
    const toothLit = tint(steel, 1.5);
    const toothCol = tint(steel, 1.15);
    const toothDark = rgba(16, 15, 17);
    const darkBody = tint(skin.body, 0.36);
    const vent: readonly [number, number, number] = [18, 16, 17];
    const trigCol: readonly [number, number, number] = [steel[0] * 0.62, steel[1] * 0.62, steel[2] * 0.66];

    /* ── Шина с зубьями ── */
    drawBarAndTeeth(buf, at, ax, ay, nx, ny, steel, skin.wear,
      barFrom, barLen, barHalf, pose.tipX, pose.tipY, toothCol, toothLit, toothDark);

    /* ── Скоба ── */
    /* Рисуется ДО картера и намеренно начинается ВНУТРИ него: видимыми остаются
     * только дуга над корпусом и передняя нога вниз к кисти. Нарисованная сверху
     * петля клала тёмную диагональ поперёк оранжевого борта, и корпус переставал
     * читаться корпусом. */
    const gripLit = tint(skin.grip, 1.9);
    const gripCol = rgba(skin.grip[0], skin.grip[1], skin.grip[2]);
    const bow = makeBow(at, bodyLen, bodyHalf, rise);
    drawBowArc(buf, bow, 0, gripLit, gripCol);

    /* ── Картер ── */
    drawCase(buf, at, ax, ay, nx, ny, skin, steel, bodyLen, bodyHalf, rise, darkBody, vent);
    // Передняя нога скобы идёт ПЕРЕД картером: за неё берётся левая кисть, и без
    // повтора поверх корпуса рука висела бы, не держась ни за что.
    drawBowArc(buf, bow, 32, gripLit, gripCol);

    /* ── Задняя рукоять ── */
    const rearHalf = 7.2 * pose.wide;
    drawRearGrip(buf, pose, upx, upy, rearHalf, skin, trigCol, tint(skin.grip, 1.55));

    /* ── Кисти ── */
    // Левая: на нижнем сходе скобы, предплечье уходит вниз-влево за срез.
    const [lhx, lhy] = bow(0.95);
    const [ltx, lty] = bow(0.8);
    const ld = Math.max(0.001, Math.hypot(ltx - lhx, lty - lhy));
    forearm(buf, flesh, lhx, lhy, 22, VM + 16);
    grasp(buf, tone, flesh, lhx, lhy, (ltx - lhx) / ld, (lty - lhy) / ld, 53);

    // Правая: на задней рукояти, предплечье — вниз-вправо за срез.
    const rhx = pose.heelX + upx * 18;
    const rhy = pose.heelY + upy * 18;
    forearm(buf, flesh, rhx, rhy, VM + 12, VM + 20);
    grasp(buf, tone, flesh, rhx, rhy, upx, upy, 71);

    contour(buf);
  },
});
