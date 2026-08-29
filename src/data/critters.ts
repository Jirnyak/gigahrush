/**
 * Фоновая живность как чистая функция от полей мира.
 *
 * Особь нигде не хранится: вершинный шейдер берёт клетку рядом с игроком,
 * собирает по ней вектор признаков и сравнивает его с вектором весов вида.
 * Совпало — особь родилась, не совпало — вырожденный треугольник. Поэтому здесь
 * лежат ТОЛЬКО веса и облик; ни спавна, ни пула, ни состояния.
 *
 * Оси признаков клетки — порядок обязателен, он же зашит в шейдер:
 *   blood — `world.dangerField`, затухающее поле трупного запаха
 *   food  — плита, раковина, полка (кухня и съестное)
 *   filth — унитаз и сырость
 *   dark  — 1 − `world.light`
 *   glow  — свет рядом с лампой или свечой (единственная ось, куда живность летит НА свет)
 *   cover — стол, кровать, стеллаж, угол из стен (укрытие, куда не ходят)
 *
 * Первые четыре — ИСТОЧНИКИ: причина в конкретной точке, их мало и они редки.
 * `dark` и `cover` — ФОН: он есть почти на каждой клетке пола. Счёт нормируется
 * на пиковый вес, то есть одной удовлетворённой оси достаточно, и вид с сильным
 * весом фона поэтому рождался ровно по особи на клетку — на весь тёмный этаж.
 * Долю фона в счёте гасит колониальный шум в шейдере (`vnoise`): фоновая
 * живность живёт пятнами, живность у источника шум не трогает. Отсюда правило
 * для новых видов: большой вес по `dark`/`cover` — это «где угодно в своём
 * пятне», а не «везде»; частоту вида задают веса, а не порог.
 */

/**
 * Как особь двигается. Число уезжает в шейдер, поэтому порядок значим, и оно же
 * решает силуэт: рывками по полу ползёт насекомое-тельце, а `SCURRY` — зверёк с
 * головой и хвостом. Отдельного поля «форма» поэтому нет.
 *
 * Неподвижного `STILL` больше нет. Он существовал ради паука, а паук, сидя в
 * геометрическом центре каждой тёмной клетки, и рисовал ту самую решётку.
 */
export const enum CritterMotion {
  /** Ползёт по полу внутри своей клетки. */
  GROUND = 0,
  /** Висит роем над клеткой, качается по высоте. */
  HOVER = 1,
  /** Кружит нимбом вокруг источника света, выше человеческого роста. */
  HALO = 2,
  /** Бежит по полу рывками: тело, голова, хвост, покачивание на бегу. */
  SCURRY = 3,
}

export interface CritterSpecies {
  id: string;
  /** RGB 0-255 в неосвещённом виде; свет накладывает шейдер. */
  color: readonly [number, number, number];
  /** Экранный масштаб, как у частиц. */
  size: number;
  /** Высота над полом. */
  baseZ: number;
  /** Амплитуда качания по высоте (0 для наземных). */
  zAmp: number;
  /** Радиус блуждания внутри клетки. */
  roam: number;
  /** Темп движения. */
  speed: number;
  /** Радиус, с которого особь шарахается от игрока (0 — не замечает). */
  fleeRadius: number;
  motion: CritterMotion;
  /** Веса по осям [blood, food, filth, dark, glow, cover]. */
  weights: readonly [number, number, number, number, number, number];
  /** Сколько особей даёт клетка при полном совпадении. */
  density: number;
}

export const CRITTER_SPECIES: readonly CritterSpecies[] = [
  {
    /* Реже и крупнее: встреча с крысой должна читаться как событие, а не как фон.
     * Редкость держит не порог, а вес тьмы — единственной оси, которая есть почти
     * везде: 0.32 при пике 0.75 не дотягивает до порога сам по себе, и крысу надо
     * чем-то ещё оправдать (трупный запах, кухня, укрытие). */
    id: 'rat',
    color: [120, 100, 100],
    size: 18,
    baseZ: 0.05,
    zAmp: 0,
    roam: 0.42,
    speed: 1.25,
    fleeRadius: 3.2,
    motion: CritterMotion.SCURRY,
    weights: [0.75, 0.35, 0.2, 0.32, 0, 0.3],
    density: 1,
  },
  {
    id: 'roach',
    color: [140, 90, 50],
    size: 6,
    baseZ: 0.02,
    zAmp: 0,
    roam: 0.45,
    speed: 1.7,
    fleeRadius: 1.4,
    motion: CritterMotion.GROUND,
    weights: [0.2, 0.95, 0.8, 0.55, 0, 0.3],
    density: 3,
  },
  {
    id: 'fly',
    color: [16, 16, 18],
    size: 1.6,
    baseZ: 0.38,
    zAmp: 0.22,
    roam: 0.34,
    speed: 2.6,
    fleeRadius: 0,
    motion: CritterMotion.HOVER,
    weights: [1, 0.25, 0.45, 0, 0, 0],
    density: 3,
  },
  {
    id: 'moth',
    color: [190, 176, 142],
    size: 2.6,
    baseZ: 0.78,
    zAmp: 0.16,
    roam: 0.5,
    speed: 1.9,
    fleeRadius: 0,
    motion: CritterMotion.HALO,
    weights: [0, 0, 0, 0, 1, 0],
    density: 2,
  },
  {
    id: 'woodlouse',
    color: [96, 92, 96],
    size: 4,
    baseZ: 0.02,
    zAmp: 0,
    roam: 0.3,
    speed: 0.55,
    fleeRadius: 0.9,
    motion: CritterMotion.GROUND,
    weights: [0, 0.15, 1, 0.5, 0, 0.35],
    density: 2,
  },
  {
    /* Паук ходит. Пока он сидел неподвижно с `roam` в одну восьмую клетки, он
     * стоял ровно в её центре, а тьма одна оправдывала его рождение — выходила
     * правильная решётка чёрных точек на весь тёмный пол. Ходьба, широкий роум и
     * колониальный шум разбирают её с трёх сторон. */
    id: 'spider',
    color: [32, 26, 30],
    size: 5,
    baseZ: 0.06,
    zAmp: 0,
    roam: 0.38,
    speed: 0.5,
    fleeRadius: 1.8,
    motion: CritterMotion.GROUND,
    weights: [0, 0, 0.2, 0.8, 0, 0.95],
    density: 1,
  },
  {
    /* Пепел вместо мошкары: тот же нимб у огня, но цвет угля. Ад и всё, что горит. */
    id: 'ash_moth',
    color: [176, 96, 54],
    size: 3,
    baseZ: 0.7,
    zAmp: 0.2,
    roam: 0.6,
    speed: 2.2,
    fleeRadius: 0,
    motion: CritterMotion.HALO,
    weights: [0.2, 0, 0, 0, 1, 0],
    density: 3,
  },
];

export type CritterSpeciesId = (typeof CRITTER_SPECIES)[number]['id'];

/** Живность, которую несёт этаж, если он не объявил свою. */
export const DEFAULT_FAUNA: readonly string[] = ['rat', 'roach', 'fly', 'moth', 'woodlouse', 'spider'];

/** Столько видов помещается в один проход; больше — лишние ветки в шейдере. */
export const CRITTER_ACTIVE_SPECIES_CAP = 6;
/** Float-ов на вид в uniform-таблице; layout описан в `packCritterSpecies`. */
export const CRITTER_SPECIES_STRIDE = 16;

export function critterSpecies(id: string): CritterSpecies | undefined {
  return CRITTER_SPECIES.find(s => s.id === id);
}

/**
 * Раскладывает набор видов в плоскую таблицу для шейдера: 4 vec4 на вид.
 *   v0 = цвет.rgb, размер
 *   v1 = baseZ, zAmp, roam, speed
 *   v2 = вес blood, food, filth, dark
 *   v3 = вес glow, cover, радиус испуга, (motion + плотность×4)
 * Последнее поле — два маленьких целых в одном float: иначе виду нужен пятый
 * vec4 ради одного числа. Шейдер разбирает обратно через mod/floor.
 * Возвращает число уложенных видов; остаток буфера обнуляется.
 */
export function packCritterSpecies(ids: readonly string[], out: Float32Array): number {
  out.fill(0);
  let count = 0;
  for (const id of ids) {
    if (count >= CRITTER_ACTIVE_SPECIES_CAP) break;
    const s = critterSpecies(id);
    if (!s) continue;
    const o = count * CRITTER_SPECIES_STRIDE;
    out[o] = s.color[0] / 255;
    out[o + 1] = s.color[1] / 255;
    out[o + 2] = s.color[2] / 255;
    out[o + 3] = s.size;
    out[o + 4] = s.baseZ;
    out[o + 5] = s.zAmp;
    out[o + 6] = s.roam;
    out[o + 7] = s.speed;
    out[o + 8] = s.weights[0];
    out[o + 9] = s.weights[1];
    out[o + 10] = s.weights[2];
    out[o + 11] = s.weights[3];
    out[o + 12] = s.weights[4];
    out[o + 13] = s.weights[5];
    out[o + 14] = s.fleeRadius;
    out[o + 15] = s.motion + s.density * 4;
    count++;
  }
  return count;
}
