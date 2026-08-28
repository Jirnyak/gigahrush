/**
 * ПСИ-узел в раскрытой левой ладони.
 *
 * ПСИ здесь — не фэнтезийный огонь в руке, а холодный узел ЧУЖОЙ ЛОКАЛЬНОЙ
 * РЕАЛЬНОСТИ, который держат раскрытой ладонью. Из `psi.md` берётся ровно два
 * следствия для облика, и оба видны глазом:
 *
 * - «какая часть мира временно перестаёт быть стеной» — узел рисуется РАЗРЫВОМ,
 *   а не лампочкой: жёсткое ядро с прорезью, рваное кольцо и прямые спицы,
 *   которые не подчиняются геометрии кисти;
 * - «пси проходит сквозь материю» — на выпуске ладонь ПРОСВЕЧИВАЕТ: пясти видны
 *   сквозь залитую светом кожу, потому что кость светом не наливается.
 *
 * Мягкого ореола здесь нет намеренно: кадр проходит через блум, и ореол он
 * сделает сам, а мыло вытянуть не сможет. Поэтому свечение — жёсткие светлые
 * ядра и выжженная кромка силуэта.
 *
 * Правила сборки те же четыре, что у образцового `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Ладонь развёрнута и наклонена: у ближнего края
 *    бугор большого пальца, у дальнего — ребро ладони, между ними впадина.
 *    Прошлая версия разводила пальцы звездой в камеру и читалась плоским
 *    коричневым пятном с блёстками.
 * 2. СБОРКА ОТ ЗАПЯСТЬЯ. Запястье — якорь; ладонь, пальцы, большой и
 *    предплечье считаются от него, а узел висит в чаше пальцев.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Размер узла несёт боевое число вещи через
 *    `skin.bulk`: щит едва тлеет, луч заметно крупнее.
 * 4. РУКА РАСТЁТ ИЗ УГЛА. Предплечье уходит в нижний ЛЕВЫЙ угол и за него.
 *
 * Геометрия холста (слот `tool`): столбец холста равен столбцу экрана, строка
 * `r` ложится в строку экрана `80 + r`. Левый край холста — край экрана, туда
 * можно; правее столбца 74 нельзя, там по центру стоит оружие. Читаемое живёт в
 * строках 22..100, строки 100..127 закрывает полоса HUD.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, line, put, skinTone } from '../draw';
import { VM } from '../types';

/** Запястье. Якорь сборки: всё остальное считается от него. */
const WRIST_X = 22;
const WRIST_Y = 90;
/** Наклон ладони от вертикали: раскрыта вверх-вправо, к центру кадра. */
const PALM_T = 0.34;
/** Локоть за нижним левым углом кадра. */
const ELBOW_X = -20;
const ELBOW_Y = VM + 22;
/** Узел висит в чаше пальцев, над ладонью. Габарит, от которого идёт свет. */
const CLOT_A = 38;
const CLOT_B = 1;
/** Точка, к которой сходятся кончики: пальцы не торчат веером, а обнимают узел. */
const CUP_A = 52;
const CUP_B = -1;

/**
 * Наклонная плашка со скруглёнными торцами и цилиндрической затенкой.
 *
 * Собственный примитив пакета, а не общий: у каждого силуэта своя геометрия, и
 * повтор между пакетами здесь замысел. На фалангу и предплечье ложится
 * идеально — именно затенка поперёк тела и делает валик круглым.
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
 * Свет узла на плоть.
 *
 * Ложится на пальцы СНИЗУ: узел висит в чаше, поэтому наливается та кромка
 * силуэта, которая на него смотрит, а отвёрнутая остаётся тёмной. Ровная
 * радиальная заливка без этого различия читается аэрографом, а не светом.
 */
function spillLight(
  buf: Uint32Array,
  cx: number, cy: number,
  acc: readonly [number, number, number],
  power: number, ceiling: number, reach: number, burnEdge: boolean,
): void {
  for (let y = 1; y < VM - 1; y++) {
    for (let x = 1; x < VM - 1; x++) {
      const i = y * VM + x;
      const c = buf[i];
      const alpha = (c >>> 24) & 0xff;
      if (!alpha) continue;
      const dx = cx - x;
      const dy = cy - y;
      const d = Math.hypot(dx, dy);
      if (d > reach * 3.2) continue;
      // Соседи вдоль луча: обращённая к узлу кромка и отвёрнутая от него.
      const sx = Math.round(dx / Math.max(1, d) * 1.8);
      const sy = Math.round(dy / Math.max(1, d) * 1.8);
      const facing = ((buf[i + sy * VM + sx] >>> 24) & 0xff) === 0;
      const back = ((buf[i - sy * VM - sx] >>> 24) & 0xff) === 0;
      const q = (d * d) / (reach * reach);
      // Зерно СВЕТА, а не только кожи: ровная заливка читается аэрографом,
      // рваная — облучённой плотью.
      const grain = 0.62 + noise(x, y, 91) * 0.72;
      const f = Math.min(ceiling, power / (1 + q * q)) * grain * (facing ? 2 : back ? 0.4 : 0.8);
      // Выжиг кромки: только на выпуске и только там, где света уже много.
      const burn = burnEdge ? Math.max(0, f - 0.66) * 230 : 0;
      const n = (noise(x, y, 33) - 0.5) * 12;
      const k = 1 - Math.min(0.3, y / VM * 0.26);
      buf[i] = rgba(
        clamp((c & 0xff) * k + n + acc[0] * f + burn),
        clamp(((c >>> 8) & 0xff) * k + n + acc[1] * f * 1.05 + burn),
        clamp(((c >>> 16) & 0xff) * k + n + acc[2] * f + burn),
        alpha,
      );
    }
  }
}

/**
 * Сам узел: разрыв, а не лампочка.
 *
 * Рваное кольцо, прямые спицы, линза со швом и жёсткое ядро. Порядок обратный
 * яркости — шов последним, чтобы кольцо не съело его края. Размер `r` приходит
 * снаружи: его несёт боевое число вещи, а не вкус этой функции.
 */
function drawClot(
  buf: Uint32Array,
  cx: number, cy: number, r: number,
  acc: readonly [number, number, number],
  bulk: number, fire: boolean, rand: () => number,
): void {
  const ringK = fire ? 1.4 : 0.98;
  const ring = rgba(clamp(acc[0] * ringK), clamp(acc[1] * ringK), clamp(acc[2] * ringK));
  const core = rgba(
    clamp(acc[0] * 0.4 + 104 + (fire ? 70 : 0)),
    clamp(acc[1] * 0.5 + 112 + (fire ? 70 : 0)),
    clamp(acc[2] * 0.5 + 108 + (fire ? 70 : 0)),
  );
  // Спицы: прямые и короткие, геометрии кисти они не подчиняются.
  const spokes = 3 + (bulk > 12 ? 2 : 0);
  for (let i = 0; i < spokes; i++) {
    const ang = rand() * Math.PI * 2;
    const r1 = r * (1.7 + rand() * 0.8);
    line(buf, cx + Math.cos(ang) * r * 1.4, cy + Math.sin(ang) * r * 1.4,
      cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1, ring, 1);
  }
  for (let i = 0; i < 48; i++) {
    const ang = (i / 48) * Math.PI * 2;
    // Кольцо рвано: сплошное читается неоновым обручем, а не разрывом.
    if (rand() < (fire ? 0.4 : 0.6)) continue;
    const rr = r * 2.2 * (0.9 + rand() * 0.2);
    put(buf, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.86, ring);
  }
  /* Тело узла — ЛИНЗА со швом, а не шар. Ровный круг одного тона читается
   * стеклянным шариком в ладони. Заливка тут ПЛОСКАЯ: цилиндрическая затенка
   * плашки увела бы нижнюю половину узла в чёрный, и вместо разрыва вышел бы
   * полумесяц. Наклон шва свой и геометрии кисти не подчиняется. */
  const rax = Math.cos(-0.55);
  const ray = Math.sin(-0.55);
  ellipse(buf, cx, cy, r, r * 0.8,
    rgba(clamp(acc[0] * ringK * 0.6), clamp(acc[1] * ringK * 0.6), clamp(acc[2] * ringK * 0.6)));
  ellipse(buf, cx - rax * r * 0.12, cy - ray * r * 0.12 - r * 0.12, r * 0.66, r * 0.5, ring);
  // Выщерблины по кромке: ровный овал читается наклейкой, рваный — прорехой.
  for (let i = 0; i < 5; i++) {
    const ang = rand() * Math.PI * 2;
    put(buf, cx + Math.cos(ang) * r * 0.94, cy + Math.sin(ang) * r * 0.76, rgba(12, 14, 18));
  }
  // Прорезь: за швом не свет, а дыра, и уже сквозь неё бьёт ядро.
  line(buf, cx - rax * r, cy - ray * r, cx + rax * r, cy + ray * r, rgba(10, 12, 16), 2);
  line(buf, cx - rax * r * 0.78, cy - ray * r * 0.78, cx + rax * r * 0.78, cy + ray * r * 0.78, core, 1);
  ellipse(buf, cx, cy, r * 0.3, r * 0.28, core);

  /* Разряды по коже: короткие жёсткие штрихи, а не звёздная пыль. Узел «сажает»
   * соседнюю плоть, и это видно даже когда он едва тлеет. */
  const spark = rgba(clamp(acc[0] * 0.55 + 96), clamp(acc[1] * 0.65 + 116), clamp(acc[2] * 0.65 + 110));
  for (let i = 0; i < (fire ? 11 : 4); i++) {
    const ang = rand() * Math.PI * 2;
    const rr = r * 2.4 + rand() * (fire ? 22 : 14);
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr * 0.85;
    if (x < 0 || y < 0 || x >= VM || y >= VM) continue;
    if (((buf[(y | 0) * VM + (x | 0)] >>> 24) & 0xff) === 0) continue;
    line(buf, x, y, x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 6, spark, 1);
  }
}

/**
 * Пальцы: сдвиг поперёк ладони, вылет вдоль неё, разворот основания, длины двух
 * фаланг и полутолщина. Порядок от указательного (ближний к глазу) к мизинцу
 * (дальний): ближние крупнее и светлее — это и есть три четверти.
 */
const FINGERS: readonly (readonly [number, number, number, number, number, number])[] = [
  [12, 30, 0.3, 17, 14, 5.3],
  [4, 32, 0.06, 18, 15, 5.4],
  [-5, 30.5, -0.17, 16, 13, 5],
  [-13.5, 27, -0.42, 13, 11, 4.3],
];

registerViewmodel({
  id: 'psi_hand',
  slot: 'tool',
  frames: ['idle', 'fire'],
  motion: { recoil: 0.35, bob: 0.9 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const mass = (k: number) => [tone[0] * k, tone[1] * k, tone[2] * k] as const;

    const fire = frame === 'fire';
    // На выпуске ладонь подаётся вперёд и пальцы чуть разводит: кадра всего два,
    // и разница между ними обязана быть в позе, а не только в яркости.
    const pose = fire ? { x: WRIST_X + 2, y: WRIST_Y - 3, s: 1.04, fan: 1.1 } : { x: WRIST_X, y: WRIST_Y, s: 1, fan: 1 };

    /** Ось ладони: от запястья К КОНЧИКАМ пальцев, вверх-вправо. */
    const hx = Math.sin(PALM_T);
    const hy = -Math.cos(PALM_T);
    /** Поперёк ладони: `+` к большому пальцу, то есть к ближнему краю. */
    const px = -hy;
    const py = hx;
    const u = (v: number) => v * pose.s;
    /** Точка ладони: `a` вдоль оси от запястья, `b` поперёк к большому пальцу. */
    const at = (a: number, b: number) => [
      pose.x + (hx * a + px * b) * pose.s,
      pose.y + (hy * a + py * b) * pose.s,
    ] as const;
    /** Направление оси ладони, повёрнутое на угол. */
    const turn = (t: number) => [hx * Math.cos(t) - hy * Math.sin(t), hx * Math.sin(t) + hy * Math.cos(t)] as const;

    const acc = skin.accent;
    /* Размер узла несёт боевое число вещи: `bulk` выведен из урона, поэтому щит
     * (урона нет) тлеет искрой, а луч и игла пустоты держат заметное ядро. */
    const rCore = (2.4 + skin.bulk * 0.34) * (fire ? 1.5 : 1);
    const [clotX, clotY] = at(CLOT_A, CLOT_B);

    /* ── Предплечье ── */
    // Конус в нижний левый угол и ЗА него: рука растёт из кадра, а не висит.
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = u(15) + t * 11;
      ellipse(buf, pose.x + (ELBOW_X - pose.x) * t, pose.y + 6 + (ELBOW_Y - pose.y) * t, r, r,
        flesh(0.84 - t * 0.14));
    }
    // Светлая грань локтевой кости: ровный конус читается трубой из мяса.
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      ellipse(buf, pose.x - u(11) + (ELBOW_X - 6 - pose.x) * t, pose.y + u(14) + (ELBOW_Y - 14 - pose.y) * t,
        u(5) - t * 1.2, u(4.4) - t * 1, flesh(1.04));
    }

    /* ── Ладонь ── */
    /* Две широкие плашки внахлёст, а не одна: затенка плашки квадратична и на
     * большой полуширине уводит дальнюю треть ладони в чистый чёрный. Вторая
     * закрывает тёмную кромку первой, и на ладони остаётся честная теневая
     * грань только с одного края. */
    const [p1x, p1y] = at(-8, -9);
    slab(buf, p1x, p1y, hx, hy, u(39), u(12.5), mass(0.98), 11, 0, u(10));
    const [p2x, p2y] = at(-10, 5);
    slab(buf, p2x, p2y, hx, hy, u(36), u(12), mass(1.04), 13, 0, u(10));

    /* Рельеф ладони: два бугра и впадина между ними. Ровная заливка между
     * запястьем и пальцами читается варежкой — именно это и было главной бедой
     * прошлой версии, а не размер узла. */
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      // Ребро ладони с дальнего края.
      const [ax1, ay1] = at(2 + t * 22, -12 - t * 2);
      ellipse(buf, ax1, ay1, u(4.6), u(4.4), flesh(1.02 - t * 0.06));
      // Бугор большого пальца: ближний край, поэтому он крупнее и светлее.
      const [ax2, ay2] = at(-2 + t * 20, 9 + t * 3);
      ellipse(buf, ax2, ay2, u(6.4 - t * 1.4), u(6 - t * 1.2), flesh(1.12 - t * 0.08));
      // Впадина между ними — та самая чаша, в которой висит узел.
      const [ax3, ay3] = at(6 + t * 20, -1 + t * 0.5);
      ellipse(buf, ax3, ay3, u(5.4), u(5), flesh(0.74 + t * 0.06));
    }
    // Складки ладони: две поперёк чаши. По ним ладонь и читается ладонью.
    for (let k = 0; k < 2; k++) {
      const [c0x, c0y] = at(16 + k * 8, -11 + k * 1.5);
      const [c1x, c1y] = at(19 + k * 7, 10 - k * 1.5);
      line(buf, c0x, c0y, c1x, c1y, flesh(0.6), 1);
    }

    /* ── Большой палец ── */
    // Ближе всех к глазу и лежит поперёк, поэтому рисуется до пальцев: те
    // уходят вглубь и обязаны оказаться ЗА ним по перекрытию.
    const [tb0x, tb0y] = at(6, 12);
    const [t0x, t0y] = turn(0.72);
    slab(buf, tb0x, tb0y, t0x, t0y, u(15), u(5.4), mass(1.1), 17, 0, u(4.8));
    const [t1x, t1y] = turn(0.5);
    const tjx = tb0x + t0x * u(15);
    const tjy = tb0y + t0y * u(15);
    slab(buf, tjx, tjy, t1x, t1y, u(12), u(4.6), mass(1.06), 19, 0, u(4.2));
    ellipse(buf, tjx, tjy, u(3.4), u(3.1), flesh(1.2));

    /* ── Пальцы ── */
    /* Каждый из двух звеньев: основание расходится веером, а вторая фаланга
     * ДОВОРАЧИВАЕТСЯ к общей точке над ладонью. Прямые пальцы, растущие лучами,
     * читаются звездой; довёрнутые — рукой, которая держит. */
    const [cupX, cupY] = at(CUP_A, CUP_B);
    for (let k = 0; k < FINGERS.length; k++) {
      const [b, a, t0, l0, l1, half] = FINGERS[k];
      const [bx, by] = at(a, b);
      const [d0x, d0y] = turn(t0 * pose.fan);
      const jx = bx + d0x * u(l0);
      const jy = by + d0y * u(l0);
      // Тёмная щель со стороны мизинца: без неё пальцы слипаются в варежку.
      slab(buf, bx - px * 1.6, by - py * 1.6, d0x, d0y, u(l0), u(half) + 0.9,
        [34, 22, 20], 23 + k, 0, u(half * 0.7));
      slab(buf, bx, by, d0x, d0y, u(l0), u(half), mass(1.06 - k * 0.05), 29 + k, 0, u(half * 0.7));
      /* Доворот к чаше: смесь собственного направления и ВЗГЛЯДА на узел.
       * Взгляд обязан быть единичным — смесь единичного вектора с сырой
       * разностью координат перевешивает в сторону разности целиком, и пальцы
       * заворачиваются обратно в ладонь узлом. */
      const cl = Math.max(1, Math.hypot(cupX - jx, cupY - jy));
      const fxRaw = 0.68 * d0x + 0.32 * ((cupX - jx) / cl);
      const fyRaw = 0.68 * d0y + 0.32 * ((cupY - jy) / cl);
      const fl = Math.hypot(fxRaw, fyRaw);
      const d1x = fxRaw / fl;
      const d1y = fyRaw / fl;
      slab(buf, jx, jy, d1x, d1y, u(l1), u(half * 0.92), mass(1.02 - k * 0.05), 37 + k, 0, u(half * 0.68));
      // Сустав ловит свет, складка под ним его сажает: без пары палец — макарона.
      ellipse(buf, jx, jy, u(half * 0.72), u(half * 0.68), flesh(1.22 - k * 0.04));
      line(buf, jx - d0y * u(half * 0.8) - d0x * u(2), jy + d0x * u(half * 0.8) - d0y * u(2),
        jx + d0y * u(half * 0.8) - d0x * u(2), jy - d0x * u(half * 0.8) - d0y * u(2), flesh(0.64), 1);
      // Подушечка на кончике.
      ellipse(buf, jx + d1x * u(l1), jy + d1y * u(l1), u(half * 0.6), u(half * 0.56), flesh(1.1));
    }

    /* ── Свет узла на плоть ── */
    spillLight(buf, clotX, clotY, acc, (fire ? 0.58 : 0.28) * (0.4 + skin.glow * 0.6),
      fire ? 0.72 : 0.4, rCore * (fire ? 3.8 : 3), fire);

    if (fire) {
      /* Ладонь просвечивает: пясти видны СКВОЗЬ залитую светом кожу. Кость
       * светом не наливается, поэтому она рисуется ПОВЕРХ прохода света —
       * это и есть «пси проходит сквозь материю», а не украшение. */
      const bone = rgba(clamp(acc[0] * 0.28 + 16), clamp(acc[1] * 0.32 + 20), clamp(acc[2] * 0.32 + 20));
      for (let k = 0; k < FINGERS.length; k++) {
        const [b, a] = FINGERS[k];
        const [b0x, b0y] = at(4, b * 0.45);
        const [b1x, b1y] = at(a - 2, b);
        line(buf, b0x, b0y, b1x, b1y, bone, 1);
      }
    }

    /* ── Сам узел ── */
    drawClot(buf, clotX, clotY, rCore, acc, skin.bulk, fire, rand);

    contour(buf);
  },
});
