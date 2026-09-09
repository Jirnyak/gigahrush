/* ── Раздел плоскости как элемент формы ───────────────────────────
 *
 * Форма процедурного этажа складывается из ДВУХ элементов: РАЗДЕЛ режет тор на
 * области, РЕЦЕПТ наполняет каждую область комнатами. Рецептов было десять, а
 * раздел ровно один — равномерная прямоугольная сетка 3×3…4×4. Поэтому все
 * нечётные этажи читались одной вафлей, и различие между «геометриями» пришлось
 * приколачивать сбоку накладками по имени: форма его выразить не умела.
 *
 * Здесь раздел — чистая функция от сида в список областей, ровно как рецепт —
 * чистая функция от области в комнаты. Семейств шесть, и каждое параметризовано
 * сидом, поэтому число различимых форм не перечисляется: сетка даёт свои
 * варианты, BSP — свои пропорции, Вороной — своё расположение центров.
 *
 * Область больше не обязана быть прямоугольником. У неё есть РАМКА (по ней
 * рецепт ходит, и она всегда лежит внутри [0, W) — комната через шов тора
 * миром не поддержана) и необязательная МАСКА принадлежности, которая на торе
 * честная. Маску спрашивают две воронки — прорезка клетки и штамп комнаты, —
 * поэтому все десять рецептов становятся безразличны к форме области даром: ни
 * один из них про маску не знает и знать не должен.
 *
 * Расхождение рамки и маски у семейств с кривой границей закрывает уже
 * существующий заполнитель пустот (`fillVoidGaps`, фаза 2.5), а связность —
 * `connectRoomsMST` и `ensureConnectivity` в конце. Граница области, оставшаяся
 * бетоном, это не дефект, а ровно то, что делает форму видимой.
 */

import { W } from '../core/types';
import { hashSeed } from '../core/rand';
import type { PartitionId } from '../data/procedural_floors';

/** Область раздела: рамка обхода плюс необязательная маска принадлежности. */
export interface RecipeRegion {
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** Принадлежит ли клетка области. Без маски область равна своей рамке. */
  contains?: (x: number, y: number) => boolean;
  /** Точка, вокруг которой область локальна. Нужна прижатию рамки: область,
   *  легшая на шов тора, имеет пробы у обоих краёв мира, и АБСОЛЮТНАЯ рамка по
   *  ним выходит во весь тор при доле маски в проценты. Относительно якоря она
   *  остаётся своего размера. */
  anchorX?: number;
  anchorY?: number;
}

/** Принадлежность клетки области — с учётом маски и обёртки тора. */
export function regionContains(region: RecipeRegion, x: number, y: number): boolean {
  return region.contains ? region.contains(((x % W) + W) % W, ((y % W) + W) % W) : true;
}

/* ── Локальный детерминированный поток ──────────────────────────
 *
 * Свой xorshift, а не `rng()`: раздел обязан воспроизводиться от сида этажа и
 * не зависеть от того, сколько бросков сделали до него. Тот же приём, что у
 * рецептов рядом.
 */
class Roll {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x1234567; }
  next(): number {
    this.s ^= this.s << 13; this.s ^= this.s >>> 17; this.s ^= this.s << 5;
    this.s = this.s >>> 0;
    return (this.s & 0x7FFFFFFF) / 0x7FFFFFFF;
  }
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  range(lo: number, hi: number): number { return lo + this.next() * (hi - lo); }
}

/** Кратчайшая разность по кольцу длиной W. */
function wrapDelta(a: number, b: number): number {
  let d = a - b;
  if (d > W / 2) d -= W;
  if (d < -W / 2) d += W;
  return d;
}

/** Приведение координаты в основной период тора. */
function wrapCoord(v: number): number {
  return ((v % W) + W) % W;
}


/* ── 1. Сетка ───────────────────────────────────────────────────
 * Прежний единственный раздел, но со своими числами и со сдвигом рядов:
 * сдвинутый ряд читается кирпичной кладкой, а не шахматной доской.
 */
function partitionGrid(roll: Roll): RecipeRegion[] {
  const cols = roll.int(2, 5);
  const rows = roll.int(2, 5);
  const shear = roll.next() < 0.4 ? roll.range(0.2, 0.5) : 0;
  const out: RecipeRegion[] = [];
  for (let row = 0; row < rows; row++) {
    const offset = Math.round(shear * (W / cols) * (row % 2));
    const y0 = Math.floor(row * W / rows);
    const y1 = Math.floor((row + 1) * W / rows);
    /* Сдвинутый ряд обязан ДОБРАТЬ голову: рамка через шов не переносится, и
     * первый столбец сдвинутого ряда просто не начинался с нуля — полоса
     * шириной со сдвиг оставалась ничьей и не строилась вовсе. */
    const edges = new Set<number>([0, W]);
    for (let col = 0; col <= cols; col++) {
      const e = Math.floor(col * W / cols) + offset;
      if (e > 0 && e < W) edges.add(e);
    }
    const sorted = [...edges].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const x0 = sorted[i];
      const x1 = sorted[i + 1];
      if (y1 - y0 < 8) continue;
      // Огрызок уже шириной комнаты прирастает к соседу слева, а не пропадает.
      const last = out[out.length - 1];
      if (x1 - x0 < 8 && last && last.y0 === y0 && last.x0 + last.w === x0) { last.w += x1 - x0; continue; }
      out.push({ x0, y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return out;
}

/* ── 2. Рекурсивный разрез ──────────────────────────────────────
 * Делит пополам по длинной стороне со случайной пропорцией. Даёт области
 * СИЛЬНО разного размера — то, чего равномерная сетка не умеет в принципе.
 */
function partitionBsp(roll: Roll): RecipeRegion[] {
  const depth = roll.int(3, 5);
  const out: RecipeRegion[] = [];
  const split = (x0: number, y0: number, w: number, h: number, left: number): void => {
    if (left <= 0 || (w < 96 && h < 96)) { out.push({ x0, y0, w, h }); return; }
    const vertical = w === h ? roll.next() < 0.5 : w > h;
    const ratio = roll.range(0.32, 0.68);
    if (vertical) {
      const cut = Math.max(24, Math.min(w - 24, Math.round(w * ratio)));
      split(x0, y0, cut, h, left - 1);
      split(x0 + cut, y0, w - cut, h, left - 1);
    } else {
      const cut = Math.max(24, Math.min(h - 24, Math.round(h * ratio)));
      split(x0, y0, w, cut, left - 1);
      split(x0, y0 + cut, w, h - cut, left - 1);
    }
  };
  split(0, 0, W, W, depth);
  return out;
}

/* ── 3. Вороной ─────────────────────────────────────────────────
 * Центры разбросаны по тору, клетка принадлежит ближайшему. Границы кривые и
 * непрямые — это единственное семейство, дающее неортогональную форму этажа.
 */
function partitionVoronoi(roll: Roll): RecipeRegion[] {
  const count = roll.int(7, 16);
  const sites: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) sites.push({ x: roll.range(0, W), y: roll.range(0, W) });

  /* Рамкой служит весь тор, а настоящие границы клетки найдёт `tightenFrames`:
   * рукописная рамка вокруг центра либо отрезала у клетки край, либо была
   * втрое больше её. */
  return sites.map((site, index) => ({
    x0: 0, y0: 0, w: W, h: W,
    anchorX: wrapCoord(site.x),
    anchorY: wrapCoord(site.y),
    contains: (x: number, y: number) => {
      const dx = wrapDelta(x, site.x);
      const dy = wrapDelta(y, site.y);
      const own = dx * dx + dy * dy;
      for (let i = 0; i < sites.length; i++) {
        if (i === index) continue;
        const ox = wrapDelta(x, sites[i].x);
        const oy = wrapDelta(y, sites[i].y);
        if (ox * ox + oy * oy < own) return false;
      }
      return true;
    },
  }));
}

/* ── 4. Кольца и лучи ───────────────────────────────────────────
 * Полярный раздел вокруг одного центра: кольца × секторы. Читается как двор с
 * расходящимися улицами, чего декартовы семейства не дают вовсе.
 */
function partitionRadial(roll: Roll): RecipeRegion[] {
  const cx = roll.range(0, W);
  const cy = roll.range(0, W);
  const rings = roll.int(2, 4);
  const sectors = roll.int(3, 8);
  /* Дальняя точка тора от центра лежит в углу, на W/√2, а не на W/2. С прежним
   * потолком кольца накрывали лишь вписанный круг, и пятая часть мира не
   * доставалась никому ПО ПОСТРОЕНИЮ — а такой кусок бетона ловится замком
   * «нет сплошного блока 12×12». Внешнее кольцо заворачивается вокруг мира и
   * распадается на клочки; их разбирает разрез рамки по антиподу. */
  const maxR = W * 0.71;
  const out: RecipeRegion[] = [];
  for (let ring = 0; ring < rings; ring++) {
    const r0 = (ring / rings) * maxR;
    const r1 = ((ring + 1) / rings) * maxR;
    // У ядра секторов меньше: иначе внутренние клинья вырождаются в щели.
    const ringSectors = ring === 0 ? Math.max(1, sectors >> 1) : sectors;
    for (let s = 0; s < ringSectors; s++) {
      const a0 = (s / ringSectors) * Math.PI * 2 - Math.PI;
      const a1 = ((s + 1) / ringSectors) * Math.PI * 2 - Math.PI;
      /* Рамкой служит весь тор: настоящую границу клина всё равно найдёт
       * `tightenFrames`, а рукописный прямоугольник вокруг дуги промахивался —
       * широкий внешний клин в квадрат по середине не влезает. */
      const midA = (a0 + a1) / 2;
      const midR = (r0 + r1) / 2;
      out.push({
        x0: 0, y0: 0, w: W, h: W,
        anchorX: wrapCoord(cx + Math.cos(midA) * midR),
        anchorY: wrapCoord(cy + Math.sin(midA) * midR),
        contains: (x: number, y: number) => {
          const dx = wrapDelta(x, cx);
          const dy = wrapDelta(y, cy);
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r < r0 || r >= r1) return false;
          const a = Math.atan2(dy, dx);
          return a >= a0 && a < a1;
        },
      });
    }
  }
  return out;
}

/* ── 5. Полосы ──────────────────────────────────────────────────
 * Параллельные ленты. Углы взяты только те четыре, что замыкаются на торе:
 * по осям и по диагоналям (`x+y`, `x−y` по модулю W). Косая полоса под любым
 * другим углом на шве не сойдётся сама с собой.
 */
function partitionStrips(roll: Roll): RecipeRegion[] {
  const axis = roll.int(0, 3);
  const bands = roll.int(4, 9);
  const project = (x: number, y: number): number => {
    if (axis === 0) return x;
    if (axis === 1) return y;
    if (axis === 2) return (x + y) % W;
    return ((x - y) % W + W) % W;
  };
  const edges: number[] = [0];
  for (let i = 1; i < bands; i++) edges.push(Math.round(W * (i / bands + roll.range(-0.35, 0.35) / bands)));
  edges.push(W);
  edges.sort((a, b) => a - b);

  const out: RecipeRegion[] = [];
  for (let i = 0; i < bands; i++) {
    const u0 = edges[i];
    const u1 = edges[i + 1];
    if (u1 - u0 < 24) continue;
    const inBand = (x: number, y: number): boolean => {
      const u = project(x, y);
      return u >= u0 && u < u1;
    };
    if (axis === 0) { out.push({ x0: u0, y0: 0, w: u1 - u0, h: W }); continue; }
    if (axis === 1) { out.push({ x0: 0, y0: u0, w: W, h: u1 - u0 }); continue; }
    /* Диагональная лента идёт через весь тор, и одна рамка на неё — это рамка
     * во весь мир: рецепт сыпал бы комнаты по всей карте, а маска принимала бы
     * одну из `bands`. Поэтому лента режется на локальные звенья вдоль своего
     * направления — каждое звено само себе область с той же маской. */
    const links = Math.max(2, Math.round(W / Math.max(96, u1 - u0)));
    const mid = (u0 + u1) / 2;
    for (let k = 0; k < links; k++) {
      const xa = Math.floor(k * W / links);
      const xb = Math.floor((k + 1) * W / links);
      const cx = (xa + xb) / 2;
      // axis 2: u = x+y → y = u−x. axis 3: u = x−y → y = x−u.
      const cy = axis === 2 ? mid - cx : cx - mid;
      /* Звено владеет СВОИМ отрезком ленты. Без этого рамки соседних звеньев
       * перекрываются на ширину полосы, и одну клетку строят два рецепта. */
      /* Рамкой служит весь тор: лента идёт наискось и через шов, а её
       * настоящие куски найдёт разрез по антиподу. */
      out.push({
        x0: 0, y0: 0, w: W, h: W,
        anchorX: wrapCoord(cx),
        anchorY: wrapCoord(cy),
        contains: (x: number, y: number) => x >= xa && x < xb && inBand(x, y),
      });
    }
  }
  return out;
}

/* ── 6. Квадродерево ────────────────────────────────────────────
 * Делит квадрант на четыре с убывающей вероятностью: рядом оказываются области
 * разного МАСШТАБА, а не разной пропорции, как у BSP.
 */
function partitionQuadtree(roll: Roll): RecipeRegion[] {
  const out: RecipeRegion[] = [];
  const splitChance = roll.range(0.45, 0.8);
  const subdivide = (x0: number, y0: number, size: number, depth: number): void => {
    if (size <= 96 || depth >= 4 || roll.next() > splitChance - depth * 0.12) {
      out.push({ x0, y0, w: size, h: size });
      return;
    }
    const half = size >> 1;
    subdivide(x0, y0, half, depth + 1);
    subdivide(x0 + half, y0, half, depth + 1);
    subdivide(x0, y0 + half, half, depth + 1);
    subdivide(x0 + half, y0 + half, half, depth + 1);
  };
  const root = W >> 1;
  subdivide(0, 0, root, 1);
  subdivide(root, 0, root, 1);
  subdivide(0, root, root, 1);
  subdivide(root, root, root, 1);
  return out;
}

const PARTITIONS: Record<PartitionId, (roll: Roll) => RecipeRegion[]> = {
  grid: partitionGrid,
  bsp: partitionBsp,
  voronoi: partitionVoronoi,
  radial: partitionRadial,
  strips: partitionStrips,
  quadtree: partitionQuadtree,
};

/**
 * Режет тор выбранным семейством. Число областей плавает от сида — это и есть
 * половина разнообразия формы, вторая половина в том, какой рецепт достанется
 * какой области.
 */
/**
 * Превращает маску в рамки: прижимает к настоящим границам области и, если та
 * легла на шов тора, режет её на непрерывные куски.
 *
 * Оба шага обязательны, и оба доказаны замером. Без прижатия рамка у кривых
 * семейств втрое больше своей области, рецепт сыплет комнаты мимо маски, и
 * этаж выходит ПУСТЕЕ прежнего: 32.54 млн проходимых клеток против 34.10 млн,
 * то есть −4.6% пола. Без разреза область, легшая на шов, теряет дальнюю
 * половину вовсе — рамка через шов не переносится, — и на её месте остаётся
 * бетонный монолит, который ловит замок «нет сплошного блока 12×12».
 */
function tightenFrames(regions: RecipeRegion[]): RecipeRegion[] {
  const STEP = 8;
  const out: RecipeRegion[] = [];
  for (const region of regions) {
    if (!region.contains) { out.push(region); continue; }
    const ax = region.anchorX ?? region.x0 + region.w / 2;
    const ay = region.anchorY ?? region.y0 + region.h / 2;
    /* Разрез идёт по АНТИПОДУ якоря: область локальна вокруг него, значит
     * противоположная точка мира заведомо лежит вне её тела и разрез не режет
     * ничего живого. Куски по обе стороны разреза в абсолютных координатах
     * непрерывны — а именно это и требуется рамке, которая не заворачивается. */
    const cutX = wrapCoord(ax + W / 2);
    const cutY = wrapCoord(ay + W / 2);
    const box = [
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    ];
    for (let y = region.y0; y < region.y0 + region.h; y += STEP) {
      for (let x = region.x0; x < region.x0 + region.w; x += STEP) {
        if (!regionContains(region, x, y)) continue;
        const b = box[(x >= cutX ? 1 : 0) + (y >= cutY ? 2 : 0)];
        if (x < b.minX) b.minX = x;
        if (y < b.minY) b.minY = y;
        if (x > b.maxX) b.maxX = x;
        if (y > b.maxY) b.maxY = y;
      }
    }
    for (let q = 0; q < box.length; q++) {
      const b = box[q];
      if (b.minX === Infinity) continue;
      /* Припуск в шаг пробы не смеет перелезть через разрез: иначе рамки двух
       * кусков ОДНОЙ области накрывают одни клетки, и рецепт строит их дважды. */
      const loX = (q & 1) ? cutX : 0;
      const hiX = (q & 1) ? W : cutX;
      const loY = (q & 2) ? cutY : 0;
      const hiY = (q & 2) ? W : cutY;
      const x0 = Math.max(loX, Math.round(b.minX - STEP));
      const y0 = Math.max(loY, Math.round(b.minY - STEP));
      const x1 = Math.min(hiX, Math.round(b.maxX + STEP));
      const y1 = Math.min(hiY, Math.round(b.maxY + STEP));
      if ((x1 - x0) * (y1 - y0) < 256) continue;
      out.push({ ...region, x0, y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return out;
}

/* Предел стороны области.
 *
 * Рецепт обязуется застроить своей области не меньше 60% — и калиброван он на
 * сектор прежней сетки, то есть примерно на треть мира. Отдай ему четверть
 * карты одним куском, и обязательство остаётся формально выполненным, а внутри
 * стоят бетонные монолиты: замерено на сиде 12345 — раздел из пяти областей по
 * 512×512 дал 5349 сплошных блоков 12×12 при общей плотности 0.509.
 *
 * Поэтому предел общий для всех шести семейств и стоит ОДИН раз здесь, а не
 * подпирается числами в каждом из них. */
const MAX_REGION_SIDE = W / 3;

/** Режет слишком крупную область пополам, пока обе стороны не войдут в предел. */
function limitRegionSize(regions: RecipeRegion[]): RecipeRegion[] {
  const out: RecipeRegion[] = [];
  const push = (region: RecipeRegion): void => {
    if (region.w <= MAX_REGION_SIDE && region.h <= MAX_REGION_SIDE) { out.push(region); return; }
    if (region.w >= region.h) {
      const cut = region.w >> 1;
      push({ ...region, w: cut });
      push({ ...region, x0: region.x0 + cut, w: region.w - cut });
    } else {
      const cut = region.h >> 1;
      push({ ...region, h: cut });
      push({ ...region, y0: region.y0 + cut, h: region.h - cut });
    }
  };
  for (const region of regions) push(region);
  return out;
}

export function partitionTorus(id: PartitionId, seed: number): RecipeRegion[] {
  const roll = new Roll(hashSeed(`partition:${id}`, seed));
  /* Вырожденные области снимаются: рецепт над пустой маской работает вхолостую
   * и оставляет дыру ровно там, где обещал комнаты. */
  const regions = limitRegionSize(tightenFrames(PARTITIONS[id](roll)).filter(r => r.w > 0 && r.h > 0));
  // Пустой раздел означал бы этаж без единой комнаты; вырожденный сид не
  // должен уметь этого никогда.
  return regions.length > 0 ? regions : partitionGrid(new Roll(seed ^ 0x5EED));
}

/** Выбор семейства из объявленного геометрией набора. */
export function pickPartition(pool: readonly PartitionId[], seed: number): PartitionId {
  if (pool.length === 0) return 'grid';
  return pool[(hashSeed('partition:pick', seed) >>> 7) % pool.length];
}
