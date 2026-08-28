/**
 * Огнемёт: сопло с запальником, шланг, бак, обе руки.
 *
 * Собран по образцу `pistol.ts` и держит те же четыре правила:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Труба развёрнута боком и наклонена: видно
 *    профиль приёмника, хомуты на сопле и вынесенный вбок запальник. Прежняя
 *    версия ставила сопло вертикально анфас, и оно читалось стопкой труб.
 * 2. СБОРКА ОТ ПЯТКИ РУКОЯТИ. Пятка задаёт низ, рукоять поднимает приёмник, от
 *    приёмника ось идёт к объявленному срезу раструба.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина — расстояние от приёмника до
 *    ОБЪЯВЛЕННОГО среза; `skin.barrel` решает лишь долю приёмника. Иначе
 *    длинное сопло уезжает к прицелу, а струя отрывается от железа.
 * 4. РУКИ РАСТУТ ИЗ УГЛОВ. Правая с рукояти уходит вниз-вправо, левая с цевья —
 *    вниз-влево, обе за нижний срез кадра.
 *
 * Вещь кустарная и собрана из того, что нашлось: бак отдельно, шланг снаружи,
 * хомуты на сопле. Читаемость держится на двух вещах — на запальнике, чей
 * огонёк горит и в покое, и на разнице материалов: сопло рыжее и горячее,
 * приёмник и шланг тёмные. Один материал на всё превращал силуэт в стопку труб.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки 100..127
 * закрывает полоса HUD. Струя обрезается по строке 22 умышленно: она уходит за
 * верх кадра, а не упирается в его край видимой границей.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { blend, contour, ellipse, skinTone } from '../draw';
import { VM, type ViewmodelSkin } from '../types';

/** Пятка рукояти. Уходит под полосу HUD: там ей и место. */
const BUTT_X = 100;
const BUTT_Y = 124;
/** Наклон рукояти от вертикали: завалена назад-вправо. */
const GRIP_T = -0.34;
const GRIP_LEN = 32;
/* Направление ОТ ПЯТКИ К ПРИЁМНИКУ, то есть вверх-влево. Ось названа по смыслу:
 * знак здесь легко перепутать, и тогда вся кисть уезжает за нижний край. */
const UPX = Math.sin(GRIP_T);
const UPY = -Math.cos(GRIP_T);
/** Приёмник: там рукоять встречает трубу. */
const BREECH_X = BUTT_X + UPX * GRIP_LEN;
const BREECH_Y = BUTT_Y + UPY * GRIP_LEN;

/** Срез раструба. Отсюда бьёт струя и стоит вспышка, поэтому он объявлен. */
const MOUTH_X = 38;
const MOUTH_Y = 32;
/** Выше этой строки пламя не пишется: язык уходит за кадр, а не упирается в него. */
const FLAME_CEIL = 22;

const SPAN_X = MOUTH_X - BREECH_X;
const SPAN_Y = MOUTH_Y - BREECH_Y;
const SPAN = Math.hypot(SPAN_X, SPAN_Y);
const AX = SPAN_X / SPAN;
const AY = SPAN_Y / SPAN;

/** Точка на оси трубы: `u` вдоль неё от приёмника, `s` поперёк. */
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

/** Бак на лямке и шланг от него к приёмнику: то, что выдаёт самоделье. */
function drawTankAndHose(
  buf: Uint32Array, at: AtFn, skin: ViewmodelSkin,
  iron: readonly [number, number, number], tank: readonly [number, number, number],
  brass: number, gripCol: number, hoseLit: number,
  rust: number, recvHalf: number,
): void {
  /* ── Бак ── */
  /* Висит на лямке слева-снизу и в кадр входит боком: он не часть трубы, он
   * прицеплен к ней шлангом, и это первое, что выдаёт самоделье. */
  const canHalf = Math.max(11, skin.magazine * 0.62);
  const canX = 31;
  const canY = VM + 4;
  const canT = -0.18;
  const cux = Math.sin(canT);
  const cuy = -Math.cos(canT);
  slab(buf, canX, canY, cux, cuy, 52, canHalf, tank, 29, rust, canHalf * 0.8);
  // Обручи: без них бак читается просто столбом.
  for (let i = 0; i < 3; i++) {
    const hx = canX + cux * (16 + i * 13);
    const hy = canY + cuy * (16 + i * 13);
    slab(buf, hx - (-cuy) * canHalf, hy - cux * canHalf, -cuy, cux, canHalf * 2, 1.6, [30, 26, 24], 31 + i, 0, 0);
  }
  // Горловина с вентилем: по ней бак и опознаётся баком.
  const valveX = canX + cux * 52;
  const valveY = canY + cuy * 52;
  slab(buf, valveX, valveY, cux, cuy, 7, 4, [iron[0] * 0.5, iron[1] * 0.5, iron[2] * 0.55], 47, 0, 0);
  ellipse(buf, valveX + cux * 8, valveY + cuy * 8, 5.5, 4.4, brass);
  ellipse(buf, valveX + cux * 8, valveY + cuy * 8, 2, 1.7, tint(iron, 0.4));

  /* ── Шланг ── */
  // Провисает между баком и приёмником: натянутая прямая читалась бы палкой.
  const h0x = valveX + 4;
  const h0y = valveY + 2;
  const [h2x, h2y] = at(4, -recvHalf * 0.9);
  const h1x = (h0x + h2x) * 0.5 + 2;
  const h1y = Math.max(h0y, h2y) + 15;
  for (let i = 0; i <= 44; i++) {
    const t = i / 44;
    const u = 1 - t;
    const hx = u * u * h0x + 2 * u * t * h1x + t * t * h2x;
    const hy = u * u * h0y + 2 * u * t * h1y + t * t * h2y;
    // Гофра: каждое четвёртое звено светлее, иначе шланг читается палкой.
    ellipse(buf, hx, hy, 3, 3, i % 4 === 0 ? hoseLit : gripCol);
  }
}

/** Сопло с раструбом, хомутами и топливной трубкой. */
function drawNozzle(
  buf: Uint32Array, at: AtFn, ax: number, ay: number, nx: number, ny: number,
  skin: ViewmodelSkin, rust: number, recvLen: number, nozHalf: number,
): void {
  // Рисуется до приёмника: тот закрывает её казённый конец, как и в железе.
  const [nozX, nozY] = at(recvLen - 8);
  slab(buf, nozX, nozY, ax, ay, SPAN - recvLen + 8, nozHalf, skin.body, 17, rust, 3);
  /* Раструб: настоящий конус, а не колпак. Кольцевыми плашками ПОПЕРЁК оси —
   * так расширение видно даже на дюжине пикселей, тогда как одна широкая
   * плашка читалась пробкой, забитой в трубу. */
  for (let i = 0; i <= 11; i++) {
    const w = nozHalf * (1 + (i / 11) * 0.72);
    const [cx, cy] = at(SPAN - 11 + i);
    // Плашка идёт ВДОЛЬ оси: затенка тогда ложится поперёк трубы, как у неё
    // самой. Кольца поперёк давали чересполосицу — каждое светилось само по себе.
    slab(buf, cx, cy, ax, ay, 1.2, w, skin.body, 19, rust * 0.6, 0);
  }
  // Обод среза: светлая кромка, по ней конец трубы и виден концом.
  const rimHalf = nozHalf * 1.55;
  slab(buf, MOUTH_X - nx * rimHalf, MOUTH_Y - ny * rimHalf, nx, ny, rimHalf * 2, 1.7, skin.accent, 21, rust * 0.4, 0);
  ellipse(buf, MOUTH_X - ax * 2.5, MOUTH_Y - ay * 2.5, nozHalf * 0.8, nozHalf * 0.66, rgba(18, 14, 13));
  // Хомуты по стволу: самоделье держится на стяжках, а не на резьбе.
  for (let i = 0; i < 3; i++) {
    const [cx, cy] = at(recvLen + 4 + i * 13);
    slab(buf, cx - nx * (nozHalf + 1.5), cy - ny * (nozHalf + 1.5), nx, ny, (nozHalf + 1.5) * 2, 1.8, skin.accent, 23 + i, rust * 0.5, 0);
  }
  // Топливная трубка вдоль сопла снизу: от приёмника к раструбу.
  const [fpX, fpY] = at(recvLen - 4, -nozHalf - 2.5);
  slab(buf, fpX, fpY, ax, ay, SPAN - recvLen - 12, 2, skin.grip, 27, rust * 0.7, 1);
}

/** Запальник: вынесен ВБОК от сопла — анфас он сливался со стволом в одну трубу. */
function drawPilot(
  buf: Uint32Array, at: AtFn, ax: number, ay: number, nx: number, ny: number,
  skin: ViewmodelSkin, iron: readonly [number, number, number], rust: number,
  recvLen: number, nozHalf: number, fire: boolean, flameMid: number, flameHot: number,
): void {
  const [pilX, pilY] = at(recvLen - 2, nozHalf + 7);
  const pilLen = SPAN - recvLen - 16;
  slab(buf, pilX, pilY, ax, ay, pilLen, 2.6, iron, 33, rust, 1);
  slab(buf, pilX - nx * 4, pilY - ny * 4, nx, ny, 8, 2, skin.accent, 35, rust * 0.4, 0);
  const pTipX = pilX + ax * pilLen;
  const pTipY = pilY + ay * pilLen;
  // Огонёк горит всегда: в покое — искра, на выстреле — язычок.
  const pilotR = fire ? 4.6 : 2.5;
  ellipse(buf, pTipX - ax * 1.5, pTipY - ay * 1.5, pilotR, pilotR * 1.5, flameMid);
  ellipse(buf, pTipX - ax * 1.5, pTipY - ay * 1.5, pilotR * 0.45, pilotR * 0.9, flameHot);
}

/** Струя с копотью. Рисуется только на кадре выстрела. */
function drawJet(
  buf: Uint32Array, ax: number, ay: number, nx: number, ny: number, nozHalf: number,
  flameSeed: number, flameHot: number, flameMid: number, soot: number, rand: () => number,
): void {
  /* Язык, а не шар: ширина падает от среза к концу, ядро горячее краёв.
   * Считается ВДОЛЬ ОСИ трубы, поэтому огонь идёт туда же, куда смотрит
   * раструб, и не отрывается от железа при смене наклона. */
  /* Язык раздаётся к концу, а не сходит на нет: верх кадра всё равно режет
   * его по `FLAME_CEIL`, и расширяющийся клин читается огнём, уходящим за
   * кадр, тогда как сужающийся читался бы коротким плевком. */
  const jet = 26;
  for (let u = -6; u <= jet; u += 0.5) {
    const t = Math.max(0, u) / jet;
    const w = nozHalf * 1.3 + t * t * 11;
    const cx = MOUTH_X + ax * u;
    const cy = MOUTH_Y + ay * u;
    for (let s = -w; s <= w; s += 0.5) {
      const px = cx + nx * s;
      const py = cy + ny * s;
      if (py < FLAME_CEIL) continue;
      const v = Math.abs(s) / w;
      const dens = (1 - v * v) * (0.55 + 0.7 * (1 - t));
      if (noise(px | 0, py | 0, flameSeed) > dens) continue;
      const heat = dens * (1 - v * 0.55);
      blend(buf, px, py, heat > 0.55 ? flameHot : flameMid, Math.min(1, 0.45 + heat));
    }
  }
  // Копоть по краям струи: чистого огня у этой трубы не бывает.
  for (let i = 0; i < 36; i++) {
    const u = rand() * jet;
    const s = (rand() - 0.5) * 26;
    const px = MOUTH_X + ax * u + nx * s;
    const py = MOUTH_Y + ay * u + ny * s;
    if (py < FLAME_CEIL) continue;
    blend(buf, px, py, soot, 0.4);
  }
}

/** Металл, подсвеченный собственным огнём: греется и в покое, от запальника. */
function drawHeatGlow(buf: Uint32Array, fire: boolean): void {
  const glowR = fire ? 46 : 22;
  const glowK = fire ? 0.58 : 0.2;
  const gy0 = Math.max(0, (MOUTH_Y - glowR) | 0);
  const gy1 = Math.min(VM, (MOUTH_Y + glowR) | 0);
  const gx0 = Math.max(0, (MOUTH_X - glowR) | 0);
  const gx1 = Math.min(VM, (MOUTH_X + glowR) | 0);
  for (let y = gy0; y < gy1; y++) {
    for (let x = gx0; x < gx1; x++) {
      if (!((buf[y * VM + x] >>> 24) & 0xff)) continue;
      const d = Math.hypot(x - MOUTH_X, y - MOUTH_Y);
      if (d > glowR) continue;
      blend(buf, x, y, rgba(255, 148, 54), (1 - d / glowR) * glowK * (0.7 + noise(x, y, 53) * 0.6));
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
  id: 'flamer',
  slot: 'weapon',
  frames: ['idle', 'fire'],
  muzzle: [MOUTH_X, MOUTH_Y],
  motion: { recoil: 0.3, flash: 0.12, bob: 0.9 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));

    const fire = frame === 'fire';
    // Самоделье ржавеет вне зависимости от цены: сварено в подвале из трубы.
    const rust = Math.min(1, skin.wear + 0.34);
    const flameSeed = 60 + ((rand() * 96) | 0);

    const ax = AX;
    const ay = AY;
    const nx = -ay;
    const ny = ax;
    /** Точка на оси трубы: `u` вдоль неё от приёмника, `s` поперёк. */
    const at = (u: number, s = 0) => [BREECH_X + ax * u + nx * s, BREECH_Y + ay * u + ny * s] as const;

    // Тёмное железо приёмника выводится из резины рукояти, а не из своей палитры.
    const iron: readonly [number, number, number] = [
      clamp(skin.grip[0] * 2.0 + 10), clamp(skin.grip[1] * 2.0 + 10), clamp(skin.grip[2] * 1.9 + 12),
    ];
    const tank: readonly [number, number, number] = [
      clamp(skin.body[0] * 0.6), clamp(skin.body[1] * 0.62), clamp(skin.body[2] * 0.68),
    ];
    const darkIron = tint(iron, 0.4);
    const brass = rgba(skin.accent[0], skin.accent[1], skin.accent[2]);
    const gripCol = rgba(skin.grip[0], skin.grip[1], skin.grip[2]);
    const hoseLit = tint(skin.grip, 1.9);
    const flameHot = rgba(255, 232, 168);
    const flameMid = rgba(246, 142, 40);
    const soot = rgba(96, 46, 22);

    // Облик делит отведённую длину: длинное сопло означает короткий приёмник.
    const recvLen = SPAN * Math.max(0.28, Math.min(0.46, 1 - skin.barrel / 60));
    const recvHalf = 8 + skin.bulk * 0.26;
    const nozHalf = 4 + skin.bulk * 0.12;

    /* Порядок узлов дословный: бак и шланг сзади, сопло до приёмника, приёмник
     * закрывает её казённый конец, огонь и подсветка — поверх железа. */
    drawTankAndHose(buf, at, skin, iron, tank, brass, gripCol, hoseLit, rust, recvHalf);
    drawNozzle(buf, at, ax, ay, nx, ny, skin, rust, recvLen, nozHalf);
    drawPilot(buf, at, ax, ay, nx, ny, skin, iron, rust, recvLen, nozHalf, fire, flameMid, flameHot);

    /* ── Приёмник ── */
    slab(buf, BREECH_X, BREECH_Y, ax, ay, recvLen, recvHalf, iron, 31, rust * 0.7, 4);
    // Бак-питатель на ближнем борту: маленький, дежурный, поверх приёмника.
    const [fdX, fdY] = at(recvLen * 0.22, recvHalf * 0.35);
    slab(buf, fdX, fdY, ax, ay, recvLen * 0.5, recvHalf * 0.42, tank, 37, rust, 3);
    // Кран подачи: медный рычаг вдоль корпуса, у него и стоит палец.
    const [lvX, lvY] = at(recvLen * 0.62, -recvHalf * 0.75);
    slab(buf, lvX, lvY, -ax, -ay, 13, 2.2, skin.accent, 39, 0, 1);
    ellipse(buf, lvX, lvY, 3.4, 3, darkIron);
    // Хомут крепления сопла к приёмнику.
    const [clX, clY] = at(recvLen - 3);
    slab(buf, clX - nx * (recvHalf * 0.8), clY - ny * (recvHalf * 0.8), nx, ny, recvHalf * 1.6, 2.4, skin.accent, 41, rust * 0.5, 0);

    /* ── Рукоять ── */
    const gripHalf = 7.6;
    slab(buf, BUTT_X, BUTT_Y, UPX, UPY, GRIP_LEN, gripHalf, skin.grip, 43, skin.wear * 0.6, 3);
    // Скоба со спуском перед рукоятью.
    const [gdX, gdY] = at(3, -recvHalf * 0.95);
    ellipse(buf, gdX, gdY, 9.5, 8.6, tint(iron, 0.65));
    ellipse(buf, gdX + 0.5, gdY + 1, 6.2, 5.4, rgba(0, 0, 0, 0));
    slab(buf, gdX - 2, gdY - 4.5, UPX * 0.3 - ax * 0.9, UPY * 0.3 - ay * 0.9, 7, 1.7, skin.accent, 45, 0, 1);

    /* ── Струя и подсвеченный ею металл ── */
    if (fire) drawJet(buf, ax, ay, nx, ny, nozHalf, flameSeed, flameHot, flameMid, soot, rand);
    drawHeatGlow(buf, fire);

    /* ── Кисти ── */
    // Левая: на цевье под приёмником, предплечье уходит вниз-влево за срез.
    const [lhx, lhy] = at(recvLen - 4, -nozHalf - 9);
    forearm(buf, flesh, lhx, lhy, 20, VM + 18);
    grasp(buf, tone, flesh, lhx, lhy, ax, ay, 53);

    // Правая: на рукояти, предплечье — вниз-вправо за срез.
    const rhx = BUTT_X + UPX * 19;
    const rhy = BUTT_Y + UPY * 19;
    forearm(buf, flesh, rhx, rhy, VM + 12, VM + 20);
    grasp(buf, tone, flesh, rhx, rhy, UPX, UPY, 71);

    contour(buf);
  },
});
