/**
 * ПСИ: раскрытая левая кисть в перчатке ликвидатора держит узел.
 *
 * ЭТО ПРЕЖДЕ ВСЕГО РУКА, А ПОТОМ УЖЕ СВЕЧЕНИЕ. Восемнадцать вещей делят один
 * силуэт, и отличаются они `skin`, а не позой: размер узла несёт `skin.bulk`
 * (щит едва тлеет, игла пустоты держит заметное ядро), цвет — `skin.accent`.
 * Заводить восемнадцать пакетов ради восемнадцати заклинаний было бы враньём:
 * рука-то одна.
 *
 * ПСИ здесь — не фэнтезийный огонь в ладони, а холодный узел ЧУЖОЙ ЛОКАЛЬНОЙ
 * РЕАЛЬНОСТИ. Отсюда узел рисуется РАЗРЫВОМ, а не лампочкой: жёсткое ядро с
 * прорезью, рваное кольцо и прямые спицы, которые не подчиняются геометрии
 * кисти. Мягкого ореола нет намеренно — кадр проходит через блум, и ореол он
 * сделает сам, а мыло вытянуть не сможет.
 *
 * РИСУЕТСЯ ПЛОСКИМИ БЛОКАМИ ПО РАМПЕ ИЗ ПЯТИ ТОНОВ. Прежняя версия строила
 * кисть наклонными плашками с цилиндрической затенкой и попиксельным шумом, то
 * есть рендерила гладкий объём; на холсте, который ложится в кадр 320×200
 * пиксель в пиксель, кисть занимает полсотни пикселей, и любой градиент там
 * превращается в мыло, а шум — в грязь.
 *
 * Правила те же, что у родного брата `bare_hands.ts`, и каждое здесь уже
 * нарушалось:
 *
 * 1. ПЯТЬ ТОНОВ И НИ ОДНОГО ПРОМЕЖУТОЧНОГО.
 * 2. ПЕРЧАТКА, А НЕ ГОЛАЯ КИСТЬ. Голая рука — бледное пятно тона бетона, и на
 *    полусотне пикселей она сливается со стеной. Тёмная резина и нужна затем,
 *    чтобы против неё работал холодный свет узла: заливать светом всю кисть
 *    нельзя, он работает акцентом.
 * 3. ЩЕЛЬ МЕЖДУ ПАЛЬЦАМИ. Без тёмной борозды под каждым валиком четыре пальца
 *    слипаются в варежку, и раскрытая ладонь читается кулаком. Порядок отрисовки
 *    от мизинца к указательному, щель под пальцем: иначе следующий валик
 *    затирает борозду предыдущего.
 * 4. БОЛЬШОЙ ПАЛЕЦ — ОПОЗНАВАТЕЛЬНЫЙ ЗНАК №1. Он лежит поперёк, у ближнего края,
 *    с бликом на суставе, и держится ВНУТРИ силуэта: вынесенный наружу, он
 *    читается пятым пальцем или клювом.
 * 5. ДУГА КОСТЯШЕК: пясти по верхней кромке ладони, средняя выступает дальше
 *    всех, мизинец ниже всех. Ровный ряд одинаковых бугров — подъём ступни.
 * 6. РУКА РАСТЁТ ИЗ УГЛА: предплечье уходит в нижний ЛЕВЫЙ угол и за него.
 *
 * Геометрия холста (слот `tool`): столбец холста равен столбцу экрана, строка
 * `r` ложится в строку экрана `80 + r`. Левый край холста — край экрана, туда
 * можно и нужно. ПРАВЕЕ СТОЛБЦА 74 НЕЛЬЗЯ: там по центру кадра стоит оружие и
 * перекроет инструмент. Читаемое живёт в строках 22..100 (у инструмента 30..100:
 * он вспомогательный и не спорит с оружием за кадр), строки 100..127 закрывает
 * полоса HUD.
 */

import { clamp, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { contour, ellipse, put } from '../draw';
import { VM } from '../types';

/** Запястье. Якорь сборки: ладонь, пальцы и предплечье считаются от него. */
const WRIST_X = 28;
const WRIST_Y = 94;
/** Наклон ладони от вертикали: раскрыта вверх-вправо, к центру кадра. */
const PALM_T = 0.28;
/** Локоть за нижним левым углом: рука обязана выйти ВНИЗ, а не вбок. */
const ELBOW_X = -22;
const ELBOW_Y = VM + 26;
/** Чаша: точка над ладонью, к которой доворачиваются кончики пальцев. */
const CUP_U = 46;
const CUP_V = -1;

/** Пять ступеней материала и ни одной между ними. */
function ramp(base: readonly [number, number, number]): readonly number[] {
  const at = (k: number) => rgba(clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k));
  return [at(0.5), at(0.76), at(1.05), at(1.5), at(2.0)];
}

/** Многоугольник плоской заливкой по строкам: им задан силуэт ладони. */
function poly(buf: Uint32Array, pts: readonly (readonly [number, number])[], color: number): void {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const xs: number[] = [];
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    xs.length = 0;
    const scan = y + 0.5;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] > scan) === (b[1] > scan)) continue;
      xs.push(a[0] + ((scan - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) put(buf, x, y, color);
    }
  }
}

/** Диск плоской заливкой. Костяшка — это диск, а не эллипс с градиентом. */
function disc(buf: Uint32Array, cx: number, cy: number, r: number, color: number): void {
  ellipse(buf, cx, cy, r, r, color);
}

/**
 * Прямая полоса без скруглённых торцов: манжет, грань, спица.
 *
 * Отдельно от валика, потому что валик с большой полушириной вырождается в
 * блямбу — торцевые диски съедают всю длину, и манжет выходит шаром на запястье
 * вместо полосы поперёк него.
 */
function band(
  buf: Uint32Array, x: number, y: number, ax: number, ay: number,
  len: number, half: number, color: number,
): void {
  const n = Math.hypot(ax, ay) || 1;
  const ux = ax / n;
  const uy = ay / n;
  poly(buf, [
    [x - uy * half, y + ux * half], [x + uy * half, y - ux * half],
    [x + ux * len + uy * half, y + uy * len - ux * half], [x + ux * len - uy * half, y + uy * len + ux * half],
  ], color);
}

/** Валик со скруглёнными торцами: фаланга, большой палец, предплечье. */
function bar(
  buf: Uint32Array, x: number, y: number, ax: number, ay: number,
  len: number, half: number, color: number,
): void {
  const n = Math.hypot(ax, ay) || 1;
  band(buf, x, y, ax, ay, len, half, color);
  disc(buf, x, y, half, color);
  disc(buf, x + (ax / n) * len, y + (ay / n) * len, half, color);
}

/**
 * Свет узла на перчатку.
 *
 * Ложится ТОЛЬКО на обращённую к узлу кромку силуэта: узел висит в чаше, поэтому
 * наливается та грань, что на него смотрит, а отвёрнутая остаётся тёмной. Ровная
 * радиальная заливка без этого различия читается аэрографом, а не светом, и
 * заодно съедает всю резину — а против тёмной резины свет и работает.
 */
function spill(
  buf: Uint32Array, cx: number, cy: number,
  acc: readonly [number, number, number], power: number, reach: number, burn: boolean,
): void {
  const y0 = Math.max(1, Math.floor(cy - reach));
  const y1 = Math.min(VM - 2, Math.ceil(cy + reach));
  const x0 = Math.max(1, Math.floor(cx - reach));
  const x1 = Math.min(VM - 2, Math.ceil(cx + reach));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * VM + x;
      const c = buf[i];
      const alpha = (c >>> 24) & 0xff;
      if (!alpha) continue;
      const dx = cx - x;
      const dy = cy - y;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      // Сосед вдоль луча: обращённая к узлу кромка пуста, отвёрнутая — нет.
      const sx = Math.round((dx / Math.max(1, d)) * 1.8);
      const sy = Math.round((dy / Math.max(1, d)) * 1.8);
      const facing = ((buf[i + sy * VM + sx] >>> 24) & 0xff) === 0;
      const f = power * (1 - d / reach) ** 2 * (facing ? 1 : 0.28);
      // Выжиг кромки: только там, где света уже много, и только на выпуске.
      const b = burn && facing ? Math.max(0, f - 0.5) * 210 : 0;
      buf[i] = rgba(
        clamp((c & 0xff) + acc[0] * f + b),
        clamp(((c >>> 8) & 0xff) + acc[1] * f * 1.05 + b),
        clamp(((c >>> 16) & 0xff) + acc[2] * f + b),
        alpha,
      );
    }
  }
}

/**
 * Сам узел: разрыв, а не лампочка.
 *
 * Рваное кольцо, прямые спицы, линза со швом и жёсткое ядро. Размер приходит
 * снаружи: его несёт боевое число вещи, а не вкус этой функции.
 */
function clot(
  buf: Uint32Array, cx: number, cy: number, r: number,
  acc: readonly [number, number, number], spokes: number, fire: boolean, rand: () => number,
): void {
  const k = fire ? 1.45 : 1;
  const RING = rgba(clamp(acc[0] * k), clamp(acc[1] * k), clamp(acc[2] * k));
  const DIM = rgba(clamp(acc[0] * k * 0.55), clamp(acc[1] * k * 0.55), clamp(acc[2] * k * 0.55));
  const CORE = rgba(
    clamp(acc[0] * 0.4 + 132 + (fire ? 60 : 0)),
    clamp(acc[1] * 0.5 + 140 + (fire ? 60 : 0)),
    clamp(acc[2] * 0.5 + 136 + (fire ? 60 : 0)),
  );
  const VOID = rgba(10, 12, 16);
  // Спицы: прямые и короткие, геометрии кисти они не подчиняются.
  for (let i = 0; i < spokes; i++) {
    const ang = rand() * Math.PI * 2;
    const r0 = r * 1.25;
    const r1 = r * (1.5 + rand() * 0.35);
    band(buf, cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0,
      Math.cos(ang), Math.sin(ang), r1 - r0, 0.6, RING);
  }
  // Кольцо рвано: сплошное читается неоновым обручем, а не разрывом.
  for (let i = 0; i < 52; i++) {
    if (rand() < (fire ? 0.42 : 0.58)) continue;
    const ang = (i / 52) * Math.PI * 2;
    const rr = r * 1.65 * (0.94 + rand() * 0.12);
    put(buf, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.86, RING);
  }
  /* Тело — ЛИНЗА со швом, а не шар. Заливка ПЛОСКАЯ: затенка увела бы нижнюю
   * половину в чёрный, и вместо разрыва вышел бы полумесяц. */
  ellipse(buf, cx, cy, r, r * 0.84, DIM);
  ellipse(buf, cx - r * 0.1, cy - r * 0.16, r * 0.66, r * 0.5, RING);
  // Выщерблины по кромке: ровный овал читается наклейкой, рваный — прорехой.
  for (let i = 0; i < 5; i++) {
    const ang = rand() * Math.PI * 2;
    put(buf, cx + Math.cos(ang) * r * 0.94, cy + Math.sin(ang) * r * 0.78, VOID);
  }
  // Прорезь: за швом не свет, а дыра, и уже сквозь неё бьёт ядро.
  const sx = Math.cos(-0.55);
  const sy = Math.sin(-0.55);
  band(buf, cx - sx * r, cy - sy * r, sx, sy, r * 2, 1, VOID);
  band(buf, cx - sx * r * 0.74, cy - sy * r * 0.74, sx, sy, r * 1.48, 0.5, CORE);
  ellipse(buf, cx, cy, r * 0.3, r * 0.28, CORE);
}

/**
 * Пальцы: сдвиг поперёк ладони, вылет вдоль неё, разворот основания, длина
 * первой фаланги и полутолщина.
 *
 * Порядок в таблице от указательного (ближний к глазу, крупнее и светлее) к
 * мизинцу. Вылет основания задаёт ДУГУ КОСТЯШЕК: средняя пясть выступает дальше
 * всех, мизинец ниже всех.
 */
const FINGERS: readonly (readonly [number, number, number, number, number])[] = [
  [12, 19, 0.3, 21, 5.0],
  [3, 22, 0.10, 22.5, 5.2],
  [-7, 21, -0.14, 20.5, 4.8],
  [-16, 17, -0.42, 16.5, 4.1],
];

registerViewmodel({
  id: 'psi_hand',
  slot: 'tool',
  frames: ['idle', 'fire'],
  motion: { recoil: 0.35, bob: 0.9 },
  draw({ buf, frame, skin, rand }) {
    const t = rand();
    const G = ramp([40 + t * 13, 42 + t * 13, 49 + t * 15]);
    const [GD2, GD1, GM, GL, GH] = G;
    /** Холодный рефлекс резины. Он же родня свету узла, и оттого они дружат. */
    const RIM = rgba(118, 132, 154);
    const CUFF = rgba(96, 58, 30);
    const CUFF_LIT = rgba(132, 84, 44);
    const acc = skin.accent;

    const fire = frame === 'fire';
    /* Кадра всего два, и разница между ними обязана быть в ПОЗЕ, а не только в
     * яркости: на выпуске кисть подаётся вперёд, пальцы распускаются, узел
     * растёт и выжигает обращённые к нему кромки. */
    const pose = fire
      ? { x: WRIST_X, y: WRIST_Y - 3, s: 1.02, fan: 1.1, mix: 0.3 }
      : { x: WRIST_X, y: WRIST_Y, s: 1, fan: 1, mix: 0.44 };

    /** Ось ладони от запястья К КОНЧИКАМ и поперечная к большому пальцу. */
    const ux = Math.sin(PALM_T);
    const uy = -Math.cos(PALM_T);
    const nx = -uy;
    const ny = ux;
    /** Точка кисти: `u` вдоль оси от запястья, `v` поперёк к большому пальцу. */
    const at = (u: number, v: number): readonly [number, number] => [
      pose.x + (ux * u + nx * v) * pose.s,
      pose.y + (uy * u + ny * v) * pose.s,
    ];
    const S = (v: number) => v * pose.s;
    /** Направление оси ладони, повёрнутое на угол. */
    const turn = (a: number): readonly [number, number] =>
      [ux * Math.cos(a) - uy * Math.sin(a), ux * Math.sin(a) + uy * Math.cos(a)];

    /* ── Предплечье ── */
    /* Полосами, а не конусом из полусотни эллипсов: конус даёт ровную заливку
     * без граней и читается доской. Полос три — тело, светлая грань локтевой
     * кости, тёмная нижняя, — и рука становится круглой этими двумя границами. */
    const wx = pose.x - S(2);
    const wy = pose.y + S(6);
    const ax = ELBOW_X - wx;
    const ay = ELBOW_Y - wy;
    const alen = Math.hypot(ax, ay);
    band(buf, wx, wy, ax, ay, alen, S(15), GM);
    band(buf, wx + 11, wy - 5, ax, ay, alen, S(4.6), GL);
    band(buf, wx - 12, wy + 6, ax, ay, alen, S(5), GD1);

    /* ── Ладонь ── */
    /* Одним многоугольником с завалом: широкая у пясти, сузилась к запястью.
     * Осевой блок этого не умеет — от него ладонь выходит кирпичом, а раскрытая
     * кисть с кирпичом вместо ладони читается варежкой. */
    poly(buf, [at(-12, -14), at(17, -16), at(24, -4), at(22, 12), at(10, 17), at(-12, 15)], GD1);
    // Свет сверху-слева: узкая грань по дальней кромке, тень со стороны большого.
    poly(buf, [at(-12, -14), at(17, -16), at(19, -10), at(-12, -8)], GM);
    poly(buf, [at(14, 8), at(22, 12), at(10, 17), at(-12, 15), at(-12, 10)], GD2);
    /* Складки ладони: ДВЕ ЛИНИИ поперёк чаши, а не тёмная плашка. Плашка здесь
     * стояла и читалась дырой в перчатке — на плоских тонах закрашенный
     * четырёхугольник посреди массы не даёт впадины, он даёт заплату. */
    band(buf, ...at(3, -8), nx * 0.86 + ux * 0.5, ny * 0.86 + uy * 0.5, S(15), S(0.7), GD2);
    band(buf, ...at(13, -9), nx * 0.94 + ux * 0.34, ny * 0.94 + uy * 0.34, S(17), S(0.7), GD2);

    /* ── Манжет ── */
    /* Единственное тёплое пятно на всей руке, и стоит оно на стыке кисти и
     * рукава — там, где рука иначе читается одной трубой без сустава. Ставится
     * по оси ПРЕДПЛЕЧЬЯ: по оси ладони он уезжал бы вместе с её наклоном. */
    const aux = ax / alen;
    const auy = ay / alen;
    band(buf, wx + aux * S(15), wy + auy * S(15), aux, auy, S(11), S(15), CUFF);
    band(buf, wx + aux * S(15), wy + auy * S(15), aux, auy, S(3.4), S(15), CUFF_LIT);
    band(buf, wx + aux * S(26), wy + auy * S(26), aux, auy, S(3), S(15), GD2);

    /* ── Пальцы ── */
    /* Каждый из двух звеньев: основание расходится веером, вторая фаланга
     * ДОВОРАЧИВАЕТСЯ к чаше. Прямые пальцы, растущие лучами, читаются звездой;
     * довёрнутые — рукой, которая держит.
     *
     * Порядок ОТ МИЗИНЦА, щель кладётся под палец: иначе следующий валик затирал
     * борозду предыдущего, и от четырёх щелей оставалась одна. */
    const [cupX, cupY] = at(CUP_U, CUP_V);
    for (let k = FINGERS.length - 1; k >= 0; k--) {
      const [v, u, t0, l0, hw] = FINGERS[k];
      const [bx, by] = at(u, v * pose.fan);
      const [d0x, d0y] = turn(t0 * pose.fan);
      const len0 = S(l0);
      const half = S(hw);
      const jx = bx + d0x * len0;
      const jy = by + d0y * len0;
      const cd = Math.max(1, Math.hypot(cupX - jx, cupY - jy));
      /* Доворот — смесь собственного направления и ВЗГЛЯДА на узел. Взгляд
       * обязан быть единичным: смесь единичного вектора с сырой разностью
       * координат перевешивает в сторону разности целиком, и пальцы
       * заворачиваются обратно в ладонь узлом. */
      const fx = (1 - pose.mix) * d0x + pose.mix * ((cupX - jx) / cd);
      const fy = (1 - pose.mix) * d0y + pose.mix * ((cupY - jy) / cd);
      const fl = Math.hypot(fx, fy) || 1;
      const d1x = fx / fl;
      const d1y = fy / fl;
      const len1 = len0 * 0.74;
      const tipX = jx + d1x * len1;
      const tipY = jy + d1y * len1;
      // Щель со стороны большого пальца: без неё валики слипаются в варежку.
      const gx = nx * S(2.2);
      const gy = ny * S(2.2);
      bar(buf, bx + gx, by + gy, d0x, d0y, len0, half + S(1.2), GD2);
      bar(buf, jx + gx, jy + gy, d1x, d1y, len1, half * 0.9 + S(1), GD2);
      // Тело: ближние пальцы светлее дальних — это и есть три четверти.
      bar(buf, bx, by, d0x, d0y, len0, half, k <= 1 ? GL : GM);
      bar(buf, jx, jy, d1x, d1y, len1, half * 0.9, k <= 1 ? GL : GM);
      /* Рефлекс серпом по дальней кромке. На тёмной резине это ЕДИНСТВЕННОЕ,
       * чем форма пальца вообще читается. */
      bar(buf, bx - gx * 0.7, by - gy * 0.7, d0x, d0y, len0 * 0.9, half * 0.3, RIM);
      // Сустав ловит свет, складка под ним его сажает: без пары палец — макарона.
      disc(buf, jx, jy, half * 0.94, k <= 1 ? GL : GM);
      disc(buf, jx - S(1), jy - S(1.1), half * 0.5, k <= 1 ? GH : RIM);
      band(buf, jx + gx * 0.8, jy + gy * 0.8, d0x, d0y, S(1.4), half * 0.8, GD2);
      // Подушечка на кончике: иначе палец кончается ничем.
      disc(buf, tipX, tipY, half * 0.68, k <= 1 ? GH : GL);
      /* Костяшка пясти в основании: ИМЕННО ОНИ образуют дугу, по которой кисть
       * отличается от подъёма ступни. Вылет основания в таблице выше и задаёт
       * её: средняя выступает дальше всех, мизинец ниже всех. */
      disc(buf, bx, by, half * 0.92, k <= 1 ? GM : GD1);
      disc(buf, bx - S(0.9), by - S(1), half * 0.46, k <= 1 ? RIM : GM);
    }

    /* ── Большой палец ── */
    /* Рисуется ПОСЛЕДНИМ из плоти: он ближе всех к глазу и лежит поверх пальцев,
     * уходящих вглубь. Держится ВНУТРИ силуэта — вынесенный наружу, он читается
     * пятым пальцем. */
    /* Бугор большого пальца: без него палец растёт прямо из кромки ладони и
     * читается пятым пальцем сбоку. Ставится ДО самого пальца. */
    poly(buf, [at(-10, 4), at(4, 6), at(12, 14), at(6, 18), at(-8, 15)], GM);
    poly(buf, [at(-10, 4), at(4, 6), at(2, 11), at(-10, 9)], GL);
    const [ta, tb] = at(-6, 9);
    const [tjx, tjy] = at(7, 19);
    const [tex, tey] = at(19, 22);
    const tl0 = Math.hypot(tjx - ta, tjy - tb);
    const tl1 = Math.hypot(tex - tjx, tey - tjy);
    bar(buf, ta + nx * S(2.2), tb + ny * S(2.2), tjx - ta, tjy - tb, tl0, S(6.4), GD2);
    bar(buf, tjx + nx * S(2), tjy + ny * S(2), tex - tjx, tey - tjy, tl1, S(5.4), GD2);
    bar(buf, ta, tb, tjx - ta, tjy - tb, tl0, S(5.6), GL);
    bar(buf, tjx, tjy, tex - tjx, tey - tjy, tl1, S(4.8), GL);
    bar(buf, ta - nx * S(1.8), tb - ny * S(1.8), tjx - ta, tjy - tb, tl0 * 0.85, S(1.8), RIM);
    // Блик НА СУСТАВЕ: он одна из четырёх точек, которые ловят свет.
    disc(buf, tjx, tjy, S(4.4), GH);
    disc(buf, tjx + S(1.4), tjy + S(1.5), S(2.2), GL);
    // Ноготь на кончике: иначе палец кончается ничем.
    disc(buf, tex, tey, S(3.4), GH);

    /* ── Свет узла и сам узел ── */
    /* Размер несёт боевое число вещи: `bulk` выведен из урона, поэтому щит
     * (урона нет) тлеет искрой, а игла пустоты держит заметное ядро. */
    const r = (5.4 + skin.bulk * 0.3) * (fire ? 1.32 : 1) * pose.s;
    /* Свет кладётся ДО узла: иначе он размажет само ядро, ради контраста с
     * которым всё и затевалось. Сила берёт `skin.glow` — у пси он всегда 1, но
     * число тут каноническое, а не вписанное от руки. */
    spill(buf, cupX, cupY, acc, (fire ? 0.9 : 0.55) * (0.4 + skin.glow * 0.6), r * 5, fire);
    clot(buf, cupX, cupY, r, acc, 3 + (skin.bulk > 11 ? 2 : 0), fire, rand);

    contour(buf);
  },
});
