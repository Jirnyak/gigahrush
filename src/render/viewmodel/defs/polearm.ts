/**
 * Длинное в двух руках: арматура, багор, грабли, цепь на черенке, штык на палке.
 *
 * Пакет держит те же правила, что образцовый `pistol.ts`:
 *
 * 1. ТРИ ЧЕТВЕРТИ, А НЕ АНФАС. Древко идёт наискось через кадр, обе кисти
 *    сломаны относительно него на `cant`, зубья разведены не поперёк, а веером
 *    в стороны и вперёд, крюк загнут вбок. Ровно это читается железом на палке;
 *    симметричный частокол анфас читается куском трубы.
 * 2. СБОРКА ОТ ТОРЦА ДРЕВКА. Якорь лежит НИЖЕ холста: длинному наружу можно
 *    только вниз, боковые края холста приходятся на треть ширины экрана, и
 *    ушедшее в них древко обрубается прямым срезом в воздухе.
 * 3. ГАБАРИТ ЗАДАН, ОБЛИК ДЕЛИТ ЕГО. Длина — расстояние от торца до объявленного
 *    острия крюка; сокет, зубья и загиб делят этот отрезок, а не удлиняют его.
 * 4. РУКИ РАСТУТ ИЗ УГЛА. Оба предплечья уходят в нижний край кадра и за него.
 *
 * Вторую руку на древке и несёт весь смысл класса: вылет здесь берут рычагом, а
 * не массой. `skin.barrel` (он идёт от вылета) задаёт длину, `skin.bulk` —
 * толщину прута и вылет зубьев.
 *
 * Безопасная зона холста: читаемое живёт в строках 22..100, строки ниже сотой
 * закрывает полоса HUD — туда идёт только масса предплечий и пятка древка.
 */

import { clamp, noise, rgba } from '../../../core/pixutil';
import { registerViewmodel } from '../registry';
import { blend, contour, ellipse, skinTone } from '../draw';
import { VM } from '../types';

/** Поза одного такта удара. */
interface PolearmPose {
  /** Торец древка: якорь сборки, лежит НИЖЕ холста. */
  bx: number; by: number;
  /** Остриё крюка: объявленная рабочая точка, до неё меряется габарит. */
  tx: number; ty: number;
  /** Излом кистей относительно древка, радианы. */
  cant: number;
  /** Приближение к глазу: на пике замаха древко толще и длиннее. */
  zoom: number;
}

/**
 * Три такта ОДНОГО удара, и они нарочно разные: покой ведёт древко пологой
 * диагональю через весь кадр, пик замаха ставит его круто и заносит рабочий
 * конец под самый верх, проводка роняет конец вниз-влево. Три похожие картинки
 * означали бы, что удара в кадре не видно вовсе.
 *
 * Углы пологие не по вкусу. Видимого холста здесь всего строки 22..100, и на
 * крутом древке второй кулак немедленно уезжает под полосу HUD — хват перестаёт
 * читаться двуручным, а вместе с ним пропадает и весь класс. Пологая диагональ
 * разводит кулаки по ГОРИЗОНТАЛИ, оставляя над передним длинный участок древка.
 * Торец при этом обязан покидать холст ниже строки 110: выше неё правый край
 * приходится на треть ширины экрана, и древко обрубается срезом в воздухе.
 */
const POSES: Readonly<Record<string, PolearmPose>> = {
  idle: { bx: 128, by: 134, tx: 62, ty: 40, cant: 0.30, zoom: 1 },
  swing: { bx: 136, by: 124, tx: 18, ty: 36, cant: 0.40, zoom: 1.16 },
  swing2: { bx: 132, by: 121, tx: 16, ty: 70, cant: 0.22, zoom: 1.06 },
};

/**
 * Наклонная плашка со скруглёнными торцами и цилиндрической затенкой.
 *
 * Собственный примитив пакета, а не общий: силуэт каждого класса — его
 * собственное дело, и повтор между равнозначными пакетами здесь замысел.
 * `tube` из `draw.ts` рисует только по осям холста и наклонное тело выразить
 * не может, а древко здесь идёт по диагонали всегда.
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

registerViewmodel({
  id: 'polearm',
  slot: 'weapon',
  frames: ['idle', 'swing', 'swing2'],
  motion: { recoil: 1.2, bob: 1.3, swap: 0.28 },
  draw({ buf, frame, skin, rand }) {
    const tone = skinTone(rand);
    const flesh = (k: number) => rgba(clamp(tone[0] * k), clamp(tone[1] * k), clamp(tone[2] * k));
    const shade = (c: readonly [number, number, number], k: number) =>
      [c[0] * k, c[1] * k, c[2] * k] as const;

    const pose = POSES[frame] ?? POSES.idle;
    const z = pose.zoom;

    /* ── Габарит ── */
    const spanX = pose.tx - pose.bx;
    const spanY = pose.ty - pose.by;
    const span = Math.hypot(spanX, spanY);
    const ax = spanX / span;
    const ay = spanY / span;
    const nx = -ay;
    const ny = ax;
    // Излом кистей: ось хвата не совпадает с осью древка, и ровно это
    // поворачивает вещь в три четверти. Совпадающие оси дают анфас.
    const gux = ax * Math.cos(pose.cant) - ay * Math.sin(pose.cant);
    const guy = ax * Math.sin(pose.cant) + ay * Math.cos(pose.cant);

    // Прут тонкий нарочно: толстое древко на таком вылете читается бревном, а
    // длину силуэту даёт именно отношение длины к толщине.
    const shaftHalf = (1.9 + skin.bulk * 0.2) * z;
    // Рабочий конец делит объявленный габарит, а не приписывается к нему.
    const hookLen = span * (0.09 + skin.bulk * 0.003);
    const sockU = span - hookLen;
    const sockX = pose.bx + ax * sockU;
    const sockY = pose.by + ay * sockU;

    /* ── Древко ── */
    // От торца ниже холста до сокета одним телом. Металл, а не дерево:
    // деревянный прут в кадре сливается с кожей рук в одно пятно.
    slab(buf, pose.bx, pose.by, ax, ay, sockU, shaftHalf, skin.body, 17, skin.wear, 2);
    // Пояски по древку: без них длинная труба читается ровной палкой и теряет
    // и масштаб, и направление.
    for (let i = 1; i <= 3; i++) {
      const u = sockU * (0.24 + i * 0.17);
      slab(buf, pose.bx + ax * u - nx * shaftHalf * 1.2, pose.by + ay * u - ny * shaftHalf * 1.2,
        nx, ny, shaftHalf * 2.4, 1.5 * z, shade(skin.body, 0.55), 19 + i, skin.wear, 1);
    }

    /* ── Рабочий конец ── */
    // Сокет: стальная обойма, которой железо насажено на древко. Короткая
    // нарочно — крупный рабочий конец съедает то самое отношение длины к
    // толщине, которым силуэт и читается длинным.
    slab(buf, sockX - ax * 11 * z, sockY - ay * 11 * z, ax, ay, 12 * z,
      shaftHalf * 1.55, skin.body, 21, skin.wear, 2);
    // Зубья веером: разные углы и разная длина, иначе гребёнка читается
    // симметричным частоколом анфас. Длина берётся от габарита, а не от
    // толщины: короткие зубья на длинном древке пропадают в контуре.
    const tineLen = span * 0.11;
    const tineHalf = (1.4 + skin.bulk * 0.11) * z;
    // Оба зуба уведены на ОДНУ сторону: разведённые в разные стороны они с
    // крюком посередине читаются пассатижами, а не крюком с гребёнкой.
    const fan = [-0.82, -0.4] as const;
    for (let i = 0; i < fan.length; i++) {
      const a = fan[i];
      const rx = ax * Math.cos(a) - ay * Math.sin(a);
      const ry = ax * Math.sin(a) + ay * Math.cos(a);
      const len = tineLen * (0.82 + i * 0.24);
      slab(buf, sockX - ax * 3, sockY - ay * 3, rx, ry, len, tineHalf,
        skin.body, 25 + i, skin.wear, tineHalf);
      // Каждый зуб кончается остриём, а не срезом.
      ellipse(buf, sockX - ax * 3 + rx * len, sockY - ay * 3 + ry * len, tineHalf * 0.9, tineHalf * 0.9,
        rgba(clamp(skin.body[0] * 0.7), clamp(skin.body[1] * 0.7), clamp(skin.body[2] * 0.74)));
    }
    // Крюк по оси и его загиб: тем, что он загнут, багор и отличается от прута.
    slab(buf, sockX - ax * 4, sockY - ay * 4, ax, ay, hookLen + 4, tineHalf * 1.5,
      skin.body, 29, skin.wear, tineHalf);
    const ba = 1.05;
    const bx2 = ax * Math.cos(ba) - ay * Math.sin(ba);
    const by2 = ax * Math.sin(ba) + ay * Math.cos(ba);
    const barb = (5 + skin.bulk * 0.35) * z;
    slab(buf, pose.tx - ax * 2, pose.ty - ay * 2, bx2, by2, barb, tineHalf * 1.1,
      skin.accent, 31, skin.wear, tineHalf);
    // Светлая фаска по внутренней стороне крюка: она и читается заточкой.
    const lit = [
      clamp(skin.accent[0] * 1.2 + 54),
      clamp(skin.accent[1] * 1.2 + 58),
      clamp(skin.accent[2] * 1.2 + 64),
    ] as const;
    slab(buf, sockX + nx * tineHalf * 0.9, sockY + ny * tineHalf * 0.9, ax, ay,
      hookLen, tineHalf * 0.5, lit, 37, 0, tineHalf * 0.5);

    /* ── Хват ── */
    /* Две точки хвата и есть признак класса: задняя толкает, передняя ведёт.
     * Доли выбраны по холсту, а не по вкусу: выше них задний кулак уезжает под
     * полосу HUD и хват перестаёт читаться двуручным, ниже — обе кисти съедают
     * тот самый длинный участок древка, ради которого класс и существует. */
    const frontU = span * 0.44;
    const backU = span * 0.26;
    const fx0 = pose.bx + ax * frontU;
    const fy0 = pose.by + ay * frontU;
    const bx0 = pose.bx + ax * backU;
    const by0 = pose.by + ay * backU;
    for (const [wx, wy, seed] of [[fx0, fy0, 41], [bx0, by0, 43]] as const) {
      slab(buf, wx - ax * 12 * z, wy - ay * 12 * z, ax, ay, 24 * z, shaftHalf * 1.35,
        skin.grip, seed, skin.wear * 0.4, 2);
    }

    /* ── Предплечья ── */
    /* Конусы вниз и ЗА нижний край: руки растут из кадра, а не висят в нём.
     *
     * Уходят они вниз, а не в угол: кулаки сидят на строках 70..105, и конус из
     * них в угол пересекает правый край холста ВЫШЕ полосы HUD. Там край
     * приходится на треть ширины экрана, и рука обрывается прямым вертикальным
     * срезом в воздухе. Наружу можно только вниз. */
    const fore = 30;
    for (const [wx, wy, tx2, ty2, r0] of [
      [fx0 - gux * 12, fy0 - guy * 12, VM - 34, VM + 38, 9],
      [bx0 - gux * 12, by0 - guy * 12, VM - 14, VM + 34, 10.5],
    ] as const) {
      for (let i = 0; i <= fore; i++) {
        const t = i / fore;
        ellipse(buf, wx + (tx2 - wx) * t, wy + (ty2 - wy) * t, r0 + t * 10, r0 + t * 10,
          flesh(0.8 - t * 0.12));
      }
    }

    /* Пятка древка поверх предплечий. Уходящий к бойцу конец ближе к глазу, чем
     * его собственные руки, и без этого куска нижняя треть древка тонет в мясе:
     * длинное оружие превращается в короткое, зажатое в двух кулаках. */
    slab(buf, pose.bx, pose.by, ax, ay, backU, shaftHalf, skin.body, 17, skin.wear, 0);

    /* ── Кисти ── */
    /* Пальцы — отдельные валики ПОПЕРЁК древка с тёмной щелью под каждым.
     * Сплошное телесное пятно читается варежкой, а две сплошных — одним куском
     * мяса, и хват перестаёт читаться вовсе. Кисти нарочно мельче, чем у
     * одноручных пакетов: две крупные съедают древко, а без древка класса нет. */
    const fpx = -guy;
    const fpy = gux;
    for (const [wx, wy, seed] of [[bx0, by0, 47], [fx0, fy0, 61]] as const) {
      slab(buf, wx - gux * 8, wy - guy * 8, gux, guy, 17 * z, 8.4 * z, tone, seed, 0, 4.5);
      for (let f = 0; f < 3; f++) {
        const u = 4 * z - f * 4.8 * z;
        const px1 = wx + gux * u;
        const py1 = wy + guy * u;
        const len = (12.5 - Math.abs(f - 1) * 1.4) * z;
        slab(buf, px1 - fpx * 7 + 1, py1 - fpy * 7 + 1.3, fpx, fpy, len, 2.9 * z,
          [26, 18, 16], seed + 1 + f, 0, 2.2);
        slab(buf, px1 - fpx * 7, py1 - fpy * 7, fpx, fpy, len, 2.4 * z,
          [tone[0] * 0.99, tone[1] * 0.96, tone[2] * 0.94], seed + 5 + f, 0, 2.2);
        ellipse(buf, px1 - fpx * 2.6, py1 - fpy * 2.6, 2.2 * z, 2 * z, flesh(1.18));
      }
      // Большой палец лежит вдоль древка с ближней стороны.
      slab(buf, wx + fpx * 5.6 - gux * 2.6, wy + fpy * 5.6 - guy * 2.6,
        gux * 0.82 + fpx * 0.57, guy * 0.82 + fpy * 0.57, 13 * z, 2.9 * z,
        [tone[0] * 1.06, tone[1] * 1.01, tone[2] * 0.97], seed + 9, 0, 2.6);
    }

    contour(buf);

    /* ── Проводка ── */
    /* На втором такте за рабочим концом стоит смаз пройденной дуги: без него
     * удар читается сменой позы, а не движением.
     *
     * Смаз кладётся ПОСЛЕ контура и только им. Обведённый контуром, он
     * перестаёт быть смазом и становится вторым телом: залитый сектор в чёрной
     * рамке, который закрывает само оружие. */
    if (frame === 'swing2') {
      const trail = rgba(
        clamp(skin.body[0] * 1.2 + 46), clamp(skin.body[1] * 1.2 + 50), clamp(skin.body[2] * 1.2 + 56));
      const arcSpan = 0.45;
      const mid = span * 0.86;
      const band = span * 0.1;
      for (let r = mid - band; r <= mid + band; r += 0.5) {
        // Шаг по углу привязан к радиусу: иначе дуга рассыпается в гребёнку.
        const step = 0.8 / r;
        const across = 1 - Math.abs(r - mid) / band;
        for (let a = 0.12; a <= arcSpan; a += step) {
          const rx = ax * Math.cos(a) - ay * Math.sin(a);
          const ry = ax * Math.sin(a) + ay * Math.cos(a);
          blend(buf, pose.bx + rx * r, pose.by + ry * r, trail,
            across * Math.pow(1 - a / arcSpan, 0.8) * 0.5);
        }
      }
    }
  },
});
