/**
 * Энергетическое: гаусс, плазма, BFG, гравилуч.
 *
 * Собрано по образцу `pistol.ts` и держит те же четыре правила:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Корпус развёрнут боком и наклонён: видно борт
 *    ствольной коробки, гребёнку радиатора, батарею под ней и кольца катушек,
 *    надетые на разгонный канал. Прежняя версия ставила эмиттер строго анфас,
 *    и вещь читалась симметричной трубой с лампочкой.
 * 2. СБОРКА ОТ ПЯТКИ РУКОЯТИ. Пятка задаёт низ, рукоять поднимает казну, от
 *    казны ось идёт к объявленному срезу эмиттера.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина — расстояние от казны до
 *    ОБЪЯВЛЕННОГО среза; `skin.barrel` решает лишь долю корпуса. Иначе
 *    длинный разгон перерастает место и уезжает к прицелу.
 * 4. РУКИ РАСТУТ ИЗ УГЛОВ. Правая с рукояти уходит вниз-вправо, левая с цевья —
 *    вниз-влево, обе за нижний срез кадра.
 *
 * Свечение пишется ЖЁСТКИМИ СВЕТЛЫМИ ЯДРАМИ внутри силуэта: кадр вьюмодели
 * проходит через блум, и ореол он сделает сам — ему нужен яркий источник, а не
 * полупрозрачная дымка, которую потом обведёт контур. Неона и глянца тут нет:
 * вкус проекта — приглушённый пиксельный хоррор, светится только заряд.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки 100..127
 * закрывает полоса HUD — туда идёт только масса предплечий и пятка рукояти.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { blend, contour, ellipse, put, skinTone } from '../draw';
import { VM, type ViewmodelSkin } from '../types';

/** Пятка рукояти. Уходит под полосу HUD: там ей и место. */
const BUTT_X = 100;
const BUTT_Y = 122;
/** Наклон рукояти от вертикали: завалена назад-вправо. */
const GRIP_T = -0.28;
const GRIP_LEN = 30;
/* Направление ОТ ПЯТКИ К КАЗНЕ, то есть вверх-влево. Ось названа по смыслу:
 * знак здесь легко перепутать, и тогда вся кисть уезжает за нижний край. */
const UPX = Math.sin(GRIP_T);
const UPY = -Math.cos(GRIP_T);
/** Казна: там рукоять встречает корпус. */
const BREECH_X = BUTT_X + UPX * GRIP_LEN;
const BREECH_Y = BUTT_Y + UPY * GRIP_LEN;

/** Срез эмиттера. Из него бьёт луч и светит вспышка, поэтому он объявлен. */
const EMIT_X = 42;
const EMIT_Y = 34;

const SPAN_X = EMIT_X - BREECH_X;
const SPAN_Y = EMIT_Y - BREECH_Y;
const SPAN = Math.hypot(SPAN_X, SPAN_Y);
const AX = SPAN_X / SPAN;
const AY = SPAN_Y / SPAN;

/** Точка на оси корпуса: `u` вдоль неё от казны, `s` поперёк (плюс — вверх). */
type AtFn = (u: number, s?: number) => readonly [number, number];

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

/** Разгонный канал с шахтой и зарядом в ней. */
function drawRail(
  buf: Uint32Array, at: AtFn, ax: number, ay: number, skin: ViewmodelSkin,
  shaft: readonly [number, number, number], accLit: number, white: number,
  fire: boolean, glow: number, accFrom: number, accLen: number, railHalf: number,
): void {
  // Рисуется первым: корпус потом закрывает его казённый конец.
  const [rlX, rlY] = at(accFrom);
  slab(buf, rlX, rlY, ax, ay, accLen + 6, railHalf, skin.body, 13, skin.wear, 2);
  // Шахта канала: тёмная щель по оси, в ней и разгоняется заряд.
  slab(buf, rlX + ax * 3, rlY + ay * 3, ax, ay, accLen, railHalf * 0.42, shaft, 15, 0, 1);
  /* Заряд в шахте: жёсткое светлое ядро по оси, плотнее к срезу. Канал
   * разгоняет, а не просто светится, — иначе шахта читается краской. */
  for (let u = 2; u < accLen; u += 1) {
    const t = u / accLen;
    const k = fire ? 0.55 + t * 0.45 : 0.22 + t * 0.34;
    const wide = railHalf * 0.36 * (0.4 + t * 0.6);
    for (let s = -wide; s <= wide; s += 0.5) {
      const [px, py] = at(accFrom + 3 + u, s);
      blend(buf, px, py, Math.abs(s) < 1 && fire ? white : accLit, k * glow * (0.72 + noise(px | 0, py | 0, 61) * 0.5));
    }
  }
}

/** Катушки: кольца, надетые на разгонный канал. */
function drawCoils(
  buf: Uint32Array, at: AtFn, nx: number, ny: number, skin: ViewmodelSkin,
  accHot: number, accLit: number, fire: boolean, glow: number,
  accFrom: number, accLen: number, railHalf: number,
): void {
  // Кольца НАДЕТЫ на канал: плашка поперёк оси, торцы её выходят за габарит
  // канала, и именно по этому силуэт читается разгонным, а не просто трубой.
  const coilHalf = railHalf * 1.6;
  const coils = 3;
  for (let i = 0; i < coils; i++) {
    const u = accFrom + 6 + i * ((accLen - 8) / coils);
    const [cx, cy] = at(u, -coilHalf);
    slab(buf, cx, cy, nx, ny, coilHalf * 2, 3.8, skin.body, 21 + i, skin.wear, 1.6);
    // Обмотка тем горячее, чем ближе к эмиттеру.
    const heat = (fire ? 1 : 0.36) * (0.55 + (i / coils) * 0.45) * glow;
    for (let s = -coilHalf; s <= coilHalf; s += 0.5) {
      const [px, py] = at(u, s);
      blend(buf, px, py, fire ? accHot : accLit, heat * (0.6 + noise(px | 0, py | 0, 77) * 0.7));
    }
  }
}

/** Эмиттер: венец со штырями и ядро среза. */
function drawEmitter(
  buf: Uint32Array, at: AtFn, ax: number, ay: number, nx: number, ny: number,
  skin: ViewmodelSkin, bodyHalf: number, fire: boolean,
  white: number, accLit: number, accHot: number, accDim: number, darkBody: number,
): void {
  // Венец: широкая плашка ПОПЕРЁК оси, из неё вперёд торчат штыри.
  const crownHalf = bodyHalf * 0.82;
  const [crX, crY] = at(SPAN - 5, -crownHalf);
  slab(buf, crX, crY, nx, ny, crownHalf * 2, 4.2, skin.body, 25, skin.wear, 2);
  for (let i = -1; i <= 1; i++) {
    const s = i * crownHalf * 0.72;
    const [pgX, pgY] = at(SPAN - 8, s);
    slab(buf, pgX, pgY, ax, ay, 11, 2.1, skin.body, 27 + i, skin.wear, 1);
    const [tipX, tipY] = at(SPAN + 2.4, s);
    // Наконечники штырей горят всегда: по ним венец и читается венцом.
    ellipse(buf, tipX, tipY, 2.2, 2.2, fire ? white : accLit);
  }
  // Ядро среза: жёсткие ступени, без мыла. Блум сделает ореол сам.
  ellipse(buf, EMIT_X, EMIT_Y, crownHalf * 0.62, crownHalf * 0.56, darkBody);
  ellipse(buf, EMIT_X, EMIT_Y, fire ? crownHalf * 0.52 : crownHalf * 0.38,
    fire ? crownHalf * 0.46 : crownHalf * 0.34, fire ? accHot : accDim);
  ellipse(buf, EMIT_X, EMIT_Y, fire ? crownHalf * 0.34 : crownHalf * 0.2,
    fire ? crownHalf * 0.3 : crownHalf * 0.18, fire ? white : accLit);
  if (fire) ellipse(buf, EMIT_X, EMIT_Y, crownHalf * 0.16, crownHalf * 0.14, rgba(255, 255, 255));
}

/** Корпус с гребёнкой радиатора и батареей под ним. */
function drawBodyAndBattery(
  buf: Uint32Array, at: AtFn, ax: number, ay: number, nx: number, ny: number,
  skin: ViewmodelSkin, acc: readonly [number, number, number],
  bodyLen: number, bodyHalf: number,
): void {
  slab(buf, BREECH_X, BREECH_Y, ax, ay, bodyLen, bodyHalf, skin.body, 33, skin.wear, 5);
  // Гребёнка радиатора на верхнем борту: рёбра ПОПЕРЁК оси, а не плашка.
  for (let i = 0; i < 7; i++) {
    const [fx, fy] = at(bodyLen * 0.18 + i * (bodyLen * 0.1), bodyHalf * 0.45);
    slab(buf, fx, fy, nx, ny, bodyHalf * 0.62, 1.5,
      [skin.body[0] * 0.42, skin.body[1] * 0.42, skin.body[2] * 0.48], 35 + i, 0, 0);
  }
  // Батарея под корпусом: размер прямо от ёмкости, шов светится остатком.
  const batHalf = 4 + skin.magazine * 0.16;
  const [btX, btY] = at(bodyLen * 0.12, -bodyHalf * 0.72 - batHalf);
  slab(buf, btX, btY, ax, ay, bodyLen * 0.58, batHalf, skin.body, 43, skin.wear, 2);
  for (let u = 4; u < bodyLen * 0.54; u += 4) {
    const [sx, sy] = at(bodyLen * 0.12 + u, -bodyHalf * 0.72 - batHalf * 1.5);
    slab(buf, sx, sy, nx, ny, batHalf * 0.9, 0.9, [acc[0] * 0.4, acc[1] * 0.4, acc[2] * 0.45], 45, 0, 0);
  }
}

/** Шкала заряда: пять ячеек на борту казны. */
function drawChargeGauge(
  buf: Uint32Array, at: AtFn, nx: number, ny: number, skin: ViewmodelSkin,
  bodyLen: number, bodyHalf: number, fire: boolean,
  darkBody: number, accHot: number, accLit: number, accDim: number,
): void {
  // Горит доля от ёмкости, на выстреле — на одну меньше. Единственный элемент,
  // по которому видно, сколько осталось.
  const cells = 5;
  const litCells = Math.max(1, Math.min(cells, Math.round(skin.magazine / 5) + 1)) - (fire ? 1 : 0);
  for (let i = 0; i < cells; i++) {
    const [cx, cy] = at(bodyLen * 0.34 + i * 4.6, -bodyHalf * 0.22);
    ellipse(buf, cx, cy, 2.2, 2, darkBody);
    put(buf, cx, cy, i < litCells ? accHot : accDim);
    put(buf, cx + nx * 0.9, cy + ny * 0.9, i < litCells ? accLit : accDim);
  }
}

/** Рукоять с насечкой и скобой со спуском. */
function drawGrip(
  buf: Uint32Array, at: AtFn, ax: number, ay: number, skin: ViewmodelSkin,
  bodyHalf: number, hatchCol: number, guardCol: number,
): void {
  const gripHalf = 8;
  slab(buf, BUTT_X, BUTT_Y, UPX, UPY, GRIP_LEN, gripHalf, skin.grip, 47, skin.wear * 0.5, 3);
  // Насечка на щёчке: без неё рукоять читается гладкой трубой.
  for (let i = 0; i < 5; i++) {
    const u = 7 + i * 4.2;
    const hx = BUTT_X + UPX * u;
    const hy = BUTT_Y + UPY * u;
    for (let s = -gripHalf * 0.72; s <= gripHalf * 0.72; s += 0.5) {
      const qx = (hx - UPY * s) | 0;
      const qy = (hy + UPX * s) | 0;
      if (qx < 0 || qy < 0 || qx >= VM || qy >= VM) continue;
      if (((buf[qy * VM + qx] >>> 24) & 0xff) === 0) continue;
      buf[qy * VM + qx] = hatchCol;
    }
  }
  // Скоба со спуском перед рукоятью.
  const [gdX, gdY] = at(4, -bodyHalf * 0.95);
  ellipse(buf, gdX, gdY, 9.6, 8.6, guardCol);
  ellipse(buf, gdX + 0.5, gdY + 1, 6.2, 5.4, rgba(0, 0, 0, 0));
  slab(buf, gdX - 2, gdY - 4.5, UPX * 0.3 - ax * 0.9, UPY * 0.3 - ay * 0.9, 7, 1.7, skin.body, 49, 0, 1);
}

/**
 * Металл в свету заряда.
 *
 * Свет идёт от вещи, а не сверху: ближний металл берёт цвет заряда. Наружу
 * ореол не пишется — его сделает блум кадра, ему нужен яркий источник.
 */
function drawChargeGlow(buf: Uint32Array, fire: boolean, glow: number, accLit: number): void {
  const glowR = fire ? 30 : 20;
  const glowK = (fire ? 0.3 : 0.13) * glow;
  const gy0 = Math.max(0, (EMIT_Y - glowR) | 0);
  const gy1 = Math.min(VM, (EMIT_Y + glowR) | 0);
  const gx0 = Math.max(0, (EMIT_X - glowR) | 0);
  const gx1 = Math.min(VM, (EMIT_X + glowR) | 0);
  for (let y = gy0; y < gy1; y++) {
    for (let x = gx0; x < gx1; x++) {
      if (!((buf[y * VM + x] >>> 24) & 0xff)) continue;
      const d = Math.hypot(x - EMIT_X, y - EMIT_Y);
      if (d > glowR) continue;
      // Красит металл ЦВЕТОМ заряда, а не белым: белый съедал катушки и
      // рёбра в одно светлое пятно, и вещь переставала читаться железом.
      blend(buf, x, y, accLit, (1 - d / glowR) * glowK * (0.65 + noise(x, y, 67) * 0.7));
    }
  }
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
  id: 'energy',
  slot: 'weapon',
  frames: ['idle', 'fire'],
  muzzle: [EMIT_X, EMIT_Y],
  motion: { recoil: 1.7, flash: 0.1, bob: 0.85 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));

    const fire = frame === 'fire';
    const glow = Math.max(0.2, skin.glow);

    const ax = AX;
    const ay = AY;
    const nx = -ay;
    const ny = ax;
    /** Точка на оси корпуса: `u` вдоль неё от казны, `s` поперёк (плюс — вверх). */
    const at = (u: number, s = 0) => [BREECH_X + ax * u + nx * s, BREECH_Y + ay * u + ny * s] as const;

    // Акцент холодный, раскал белый. Между ними и живёт весь заряд.
    const acc = skin.accent;
    const accDim = tint(acc, 0.45);
    const accLit = rgba(
      clamp(acc[0] * (fire ? 1.5 : 1.15) + glow * 40),
      clamp(acc[1] * (fire ? 1.5 : 1.15) + glow * 50),
      clamp(acc[2] * (fire ? 1.5 : 1.15) + glow * 50),
    );
    /* Раскал светлый, но НЕ белый: чисто белым ядром эмиттер терял цвет заряда и
     * читался лампочкой. Белое остаётся только на самом острие. */
    const accHot = rgba(clamp(112 + glow * 72), clamp(222 + glow * 24), clamp(228 + glow * 22));
    const white = rgba(248, 254, 255);
    const darkBody = tint(skin.body, 0.32);
    const shaft: readonly [number, number, number] = [skin.body[0] * 0.3, skin.body[1] * 0.3, skin.body[2] * 0.34];

    // Облик делит отведённую длину: длинный разгон означает короткий корпус.
    const bodyLen = SPAN * Math.max(0.32, Math.min(0.54, 1 - skin.barrel / 100));
    const bodyHalf = 9 + skin.bulk * 0.26;
    const railHalf = bodyHalf * 0.44;
    const accFrom = bodyLen - 6;
    const accLen = SPAN - accFrom - 6;

    /* Порядок узлов дословный: канал первым, корпус закрывает его казённый
     * конец, шкала и рукоять поверх корпуса, свет заряда — поверх всего
     * железа, руки последними. */
    drawRail(buf, at, ax, ay, skin, shaft, accLit, white, fire, glow, accFrom, accLen, railHalf);
    drawCoils(buf, at, nx, ny, skin, accHot, accLit, fire, glow, accFrom, accLen, railHalf);
    drawEmitter(buf, at, ax, ay, nx, ny, skin, bodyHalf, fire, white, accLit, accHot, accDim, darkBody);
    drawBodyAndBattery(buf, at, ax, ay, nx, ny, skin, acc, bodyLen, bodyHalf);
    drawChargeGauge(buf, at, nx, ny, skin, bodyLen, bodyHalf, fire, darkBody, accHot, accLit, accDim);
    drawGrip(buf, at, ax, ay, skin, bodyHalf, tint(skin.grip, 1.6), tint(skin.body, 0.55));
    drawChargeGlow(buf, fire, glow, accLit);

    /* ── Кисти ── */
    // Левая: на цевье под корпусом, предплечье уходит вниз-влево за срез.
    const [lhx, lhy] = at(bodyLen * 0.95, -bodyHalf * 0.8 - 8);
    forearm(buf, flesh, lhx, lhy, 20, VM + 18);
    grasp(buf, tone, flesh, lhx, lhy, ax, ay, 53);

    // Правая: на рукояти, предплечье — вниз-вправо за срез.
    const rhx = BUTT_X + UPX * 18;
    const rhy = BUTT_Y + UPY * 18;
    forearm(buf, flesh, rhx, rhy, VM + 12, VM + 20);
    grasp(buf, tone, flesh, rhx, rhy, UPX, UPY, 71);

    contour(buf);
  },
});
