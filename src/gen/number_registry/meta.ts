import {
  Faction,
  Occupation,
  RoomType,
  Tex,
  ZoneFaction,
  type TerritoryOwner,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('number_registry');

export const NUMBER_REGISTRY_ROUTE_ID = 'number_registry' as const;

export const NUMBER_REGISTRY_Z = 32 as const;

export const NUMBER_REGISTRY_BASE_FLOOR = 30;

export const NUMBER_REGISTRY_DEBUG_ENTRY = 'design_floor.number_registry' as const;

export type NextId = { v: number };

export interface ResidueLane {
  id: string;
  modulus: number;
  residue: number;
  axis: 'x' | 'y';
  label: string;
}

export interface NumberRegistryDecision {
  id: string;
  roomDefId: string;
  route: 'decode' | 'bribe' | 'prime_risk' | 'composite_public';
  itemId: string;
  eventTag: string;
  consequence: string;
}

export interface NumberRegistryCrtIntersection {
  id: string;
  modulusA: number;
  residueA: number;
  modulusB: number;
  residueB: number;
  combinedResidue: number;
  combinedModulus: number;
  label: string;
}

export const RESIDUE_LANES: readonly ResidueLane[] = [
  { id: 'mod_5_r2', modulus: 5, residue: 2, axis: 'x', label: 'остаток 2 по модулю 5' },
  { id: 'mod_7_r3', modulus: 7, residue: 3, axis: 'y', label: 'остаток 3 по модулю 7' },
  { id: 'mod_11_r4', modulus: 11, residue: 4, axis: 'x', label: 'остаток 4 по модулю 11' },
];

export const NUMBER_REGISTRY_RESIDUE_LANES = RESIDUE_LANES;

export const NUMBER_REGISTRY_CRT_INTERSECTIONS: readonly NumberRegistryCrtIntersection[] = [
  {
    id: 'crt_5_7_window',
    modulusA: 5,
    residueA: 2,
    modulusB: 7,
    residueB: 3,
    combinedResidue: crtResidue(5, 2, 7, 3),
    combinedModulus: 35,
    label: '17 mod 35',
  },
  {
    id: 'crt_7_11_archive',
    modulusA: 7,
    residueA: 3,
    modulusB: 11,
    residueB: 4,
    combinedResidue: crtResidue(7, 3, 11, 4),
    combinedModulus: 77,
    label: '25 mod 77',
  },
  {
    id: 'crt_5_11_safe',
    modulusA: 5,
    residueA: 2,
    modulusB: 11,
    residueB: 4,
    combinedResidue: crtResidue(5, 2, 11, 4),
    combinedModulus: 55,
    label: '37 mod 55',
  },
];

export const NUMBER_REGISTRY_DECISIONS: readonly NumberRegistryDecision[] = [
  {
    id: 'decode_residue_route',
    roomDefId: 'Зал сверки остатков',
    route: 'decode',
    itemId: 'blank_form',
    eventTag: 'residue_decode',
    consequence: 'Сверка остатков показывает короткий путь к пересечной картотеке без драки у простого коридора.',
  },
  {
    id: 'bribe_modulus_clerk',
    roomDefId: 'Касса модуля 7',
    route: 'bribe',
    itemId: 'elevator_access_order',
    eventTag: 'modulus_bribe',
    consequence: 'Кассир продает модуль и маршрутный ордер; очередь считает это оплатой, а не взяткой.',
  },
  {
    id: 'prime_risky_corridor',
    roomDefId: 'Простой рискованный коридор',
    route: 'prime_risk',
    itemId: 'forged_stamp_sheet',
    eventTag: 'prime_corridor',
    consequence: 'Простой коридор короче, но там печатееды и параграфы реагируют на бумагу.',
  },
  {
    id: 'composite_public_path',
    roomDefId: 'Составной публичный обход',
    route: 'composite_public',
    itemId: 'official_permit_slip',
    eventTag: 'composite_path',
    consequence: 'Составной обход длиннее, зато его можно пройти через окно, талон и свидетеля.',
  },
];

export const ROUTE_TARGET = {
  designFloorId: NUMBER_REGISTRY_ROUTE_ID,
  z: NUMBER_REGISTRY_Z,
  tags: ['number_registry', 'residue', 'modulus'],
  label: 'Числовой реестр',
  risk: 3,
} as const;

export interface RegistryTerritoryTarget {
  owner: TerritoryOwner;
  share: number;
  label: string;
  hq: { x: number; y: number };
}

export const NUMBER_REGISTRY_TERRITORY_TARGETS: readonly RegistryTerritoryTarget[] = [
  { owner: ZoneFaction.CITIZEN, share: 0.30, label: 'граждане', hq: { x: 170, y: 520 } },
  { owner: ZoneFaction.LIQUIDATOR, share: 0.18, label: 'ликвидаторы', hq: { x: 534, y: 228 } },
  { owner: ZoneFaction.CULTIST, share: 0.10, label: 'культисты', hq: { x: 184, y: 238 } },
  { owner: ZoneFaction.SCIENTIST, share: 0.34, label: 'учёные', hq: { x: 732, y: 654 } },
  { owner: ZoneFaction.WILD, share: 0.08, label: 'дикие', hq: { x: 178, y: 812 } },
] as const;

export const REGISTRAR_DEF: PlotNpcDef = {
  name: 'Вера Модульная',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 110,
  maxHp: 110,
  money: 97,
  speed: 0.72,
  inventory: [
    { defId: 'elevator_access_order', count: 1 },
    { defId: 'blank_form', count: 2 },
    { defId: 'ink_bottle', count: 1 },
  ],
  talkLines: [
    'Без модуля вы у нас просто человек в очереди. С модулем - человек в неправильном окне.',
    'Остаток пишите цифрой. Словами остатки принимают только после отбоя.',
    'Девяносто семь рублей в кассу, и я скажу, какой коридор сегодня не делает вид, что простое число.',
    'Подпись ставится после сверки. До сверки подпись считается кляксой с амбициями.',
  ],
  talkLinesPost: [
    'Ваш остаток записан. Теперь не путайте маршрутный ордер с талоном в столовую.',
    'Если коридор стал короче, проверьте, не стал ли он голоднее.',
  ],
};

export const PRIME_GUARD_DEF: PlotNpcDef = {
  name: 'Федор Простой',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 210,
  maxHp: 210,
  money: 55,
  speed: 0.92,
  weapon: 'makarov',
  inventory: [
    { defId: 'makarov', count: 1 },
    { defId: 'ammo_9mm', count: 12 },
    { defId: 'forged_stamp_sheet', count: 1 },
  ],
  talkLines: [
    'Простой коридор потому и простой: лишние люди в нем не остаются.',
    'Если на бумаге семь делителей, не несите ее туда, где ходят параграфы.',
    'Я держу пост до следующего простого номера. Потом пост держит меня.',
  ],
  talkLinesPost: [
    'Коридор прочищен. Долго он чистым не будет, но пройти успеете.',
    'Не размахивайте печатью. Печатееду всё равно, настоящая она или красивая.',
  ],
};

export const COMPOSITE_DEF: PlotNpcDef = {
  name: 'Семен Составной',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.STOREKEEPER,
  sprite: Occupation.STOREKEEPER,
  hp: 125,
  maxHp: 125,
  money: 33,
  speed: 0.65,
  inventory: [
    { defId: 'official_permit_slip', count: 1 },
    { defId: 'ration_registry_extract', count: 1 },
  ],
  talkLines: [
    'Составной путь длинный, зато свидетелей много. При свидетелях шкафы скрипят тише.',
    'Мне нужен чистый бланк. Я приложу его к общей ведомости, и дверь перестанет строить из себя экзамен.',
    'Простые любят риск. Составные любят очередь. Очередь хотя бы можно занять табуреткой.',
  ],
  talkLinesPost: [
    'Бланк подшит. Идите по публичному обходу, там ругаются, но не кусают.',
    'Если кто спросит, вы были не быстрым, а оформленным.',
  ],
};

export interface RegistryBlockSpec {
  key: string;
  owner: TerritoryOwner;
  name: string;
  left: number;
  top: number;
  cols: number;
  rows: number;
  roomW: number;
  roomH: number;
  gapX: number;
  gapY: number;
  floorTex: Tex;
  wallTex: Tex;
  roomTypes: readonly RoomType[];
}

export interface RegistryHqSpec {
  owner: TerritoryOwner;
  coreName: string;
  supportPrefix: string;
  x: number;
  y: number;
  floorTex: Tex;
  wallTex: Tex;
  supports: readonly { type: RoomType; name: string; dx: number; dy: number; w: number; h: number }[];
}

export const NUMBER_REGISTRY_HQ_SPECS: readonly RegistryHqSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    coreName: 'граждане: Миништаб общей очереди',
    supportPrefix: 'граждане',
    x: 158,
    y: 510,
    floorTex: Tex.F_PARQUET,
    wallTex: Tex.PANEL,
    supports: [
      { type: RoomType.KITCHEN, name: 'кухня талонной очереди', dx: -36, dy: -28, w: 24, h: 14 },
      { type: RoomType.BATHROOM, name: 'санузел публичных ожиданий', dx: 32, dy: -26, w: 20, h: 12 },
      { type: RoomType.STORAGE, name: 'кладовая чистых бланков', dx: -38, dy: 30, w: 26, h: 14 },
      { type: RoomType.MEDICAL, name: 'медпункт обморочных просителей', dx: 34, dy: 30, w: 26, h: 14 },
    ],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    coreName: 'ликвидаторы: Пост простого допуска',
    supportPrefix: 'ликвидаторы',
    x: 522,
    y: 220,
    floorTex: Tex.F_RED_CARPET,
    wallTex: Tex.METAL,
    supports: [
      { type: RoomType.STORAGE, name: 'оружейная простых номеров', dx: -38, dy: -26, w: 26, h: 14 },
      { type: RoomType.OFFICE, name: 'комната проверки делимости', dx: 34, dy: -26, w: 30, h: 14 },
      { type: RoomType.MEDICAL, name: 'перевязочная бумажных порезов', dx: -38, dy: 30, w: 26, h: 14 },
      { type: RoomType.PRODUCTION, name: 'мастерская пломбировочных щитов', dx: 34, dy: 30, w: 30, h: 14 },
    ],
  },
  {
    owner: ZoneFaction.CULTIST,
    coreName: 'культисты: Скрытая молельня неделимых',
    supportPrefix: 'культисты',
    x: 172,
    y: 230,
    floorTex: Tex.F_RED_CARPET,
    wallTex: Tex.DARK,
    supports: [
      { type: RoomType.COMMON, name: 'зал шепота простых чисел', dx: -38, dy: -28, w: 28, h: 14 },
      { type: RoomType.STORAGE, name: 'тайник списанных делителей', dx: 34, dy: -26, w: 24, h: 12 },
      { type: RoomType.SMOKING, name: 'курилка знамений остатка', dx: -36, dy: 30, w: 24, h: 12 },
      { type: RoomType.BATHROOM, name: 'омовение перед делением', dx: 34, dy: 30, w: 24, h: 12 },
    ],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    coreName: 'учёные: НИИ числовых остатков',
    supportPrefix: 'учёные',
    x: 720,
    y: 646,
    floorTex: Tex.F_TILE,
    wallTex: Tex.TILE_W,
    supports: [
      { type: RoomType.MEDICAL, name: 'лаборатория остаточных проб', dx: -42, dy: -30, w: 32, h: 16 },
      { type: RoomType.PRODUCTION, name: 'вычислительная мастерская модулей', dx: 34, dy: -30, w: 34, h: 16 },
      { type: RoomType.OFFICE, name: 'кабинет статистики ошибок', dx: -42, dy: 32, w: 32, h: 16 },
      { type: RoomType.STORAGE, name: 'хранилище эталонных таблиц', dx: 36, dy: 32, w: 30, h: 16 },
    ],
  },
  {
    owner: ZoneFaction.WILD,
    coreName: 'дикие: Лагерь списанных чисел',
    supportPrefix: 'дикие',
    x: 166,
    y: 804,
    floorTex: Tex.F_CONCRETE,
    wallTex: Tex.ROTTEN,
    supports: [
      { type: RoomType.STORAGE, name: 'склад рваных ведомостей', dx: -38, dy: -28, w: 28, h: 14 },
      { type: RoomType.SMOKING, name: 'курилка чужих номеров', dx: 34, dy: -26, w: 24, h: 12 },
      { type: RoomType.KITCHEN, name: 'кухня сухих пайков', dx: -36, dy: 30, w: 24, h: 14 },
      { type: RoomType.BATHROOM, name: 'ржавый умывальник лагеря', dx: 34, dy: 30, w: 22, h: 12 },
    ],
  },
];

export const NUMBER_REGISTRY_BLOCKS: readonly RegistryBlockSpec[] = [
  { key: 'citizen_west_queue', owner: ZoneFaction.CITIZEN, name: 'граждане: публичная ячейка остатка', left: 68, top: 378, cols: 7, rows: 7, roomW: 18, roomH: 10, gapX: 10, gapY: 10, floorTex: Tex.F_PARQUET, wallTex: Tex.PANEL, roomTypes: [RoomType.OFFICE, RoomType.COMMON, RoomType.STORAGE, RoomType.KITCHEN] },
  { key: 'citizen_south_forms', owner: ZoneFaction.CITIZEN, name: 'граждане: нижняя очередь корешков', left: 316, top: 740, cols: 8, rows: 6, roomW: 17, roomH: 10, gapX: 9, gapY: 10, floorTex: Tex.F_GREEN_CARPET, wallTex: Tex.PANEL, roomTypes: [RoomType.COMMON, RoomType.OFFICE, RoomType.STORAGE] },
  { key: 'liquidator_prime_gate', owner: ZoneFaction.LIQUIDATOR, name: 'ликвидаторы: блок простого допуска', left: 378, top: 142, cols: 7, rows: 6, roomW: 18, roomH: 10, gapX: 10, gapY: 9, floorTex: Tex.F_RED_CARPET, wallTex: Tex.METAL, roomTypes: [RoomType.OFFICE, RoomType.STORAGE, RoomType.HQ, RoomType.PRODUCTION] },
  { key: 'liquidator_east_posts', owner: ZoneFaction.LIQUIDATOR, name: 'ликвидаторы: восточный пост делимости', left: 800, top: 374, cols: 5, rows: 7, roomW: 18, roomH: 10, gapX: 10, gapY: 10, floorTex: Tex.F_CONCRETE, wallTex: Tex.METAL, roomTypes: [RoomType.STORAGE, RoomType.OFFICE, RoomType.CORRIDOR] },
  { key: 'cultist_hidden_numerator', owner: ZoneFaction.CULTIST, name: 'культисты: скрытая числительская келья', left: 78, top: 128, cols: 7, rows: 6, roomW: 17, roomH: 10, gapX: 9, gapY: 9, floorTex: Tex.F_RED_CARPET, wallTex: Tex.DARK, roomTypes: [RoomType.COMMON, RoomType.STORAGE, RoomType.SMOKING] },
  { key: 'wild_scrap_register', owner: ZoneFaction.WILD, name: 'дикие: списанная карточная нора', left: 86, top: 700, cols: 7, rows: 6, roomW: 17, roomH: 10, gapX: 10, gapY: 10, floorTex: Tex.F_CONCRETE, wallTex: Tex.ROTTEN, roomTypes: [RoomType.STORAGE, RoomType.SMOKING, RoomType.CORRIDOR] },
  { key: 'scientist_upper_archive', owner: ZoneFaction.SCIENTIST, name: 'учёные: верхняя лаборатория модулей', left: 636, top: 172, cols: 8, rows: 7, roomW: 18, roomH: 10, gapX: 9, gapY: 9, floorTex: Tex.F_TILE, wallTex: Tex.TILE_W, roomTypes: [RoomType.MEDICAL, RoomType.PRODUCTION, RoomType.OFFICE, RoomType.STORAGE] },
  { key: 'scientist_lower_archive', owner: ZoneFaction.SCIENTIST, name: 'учёные: нижний архив остатков', left: 612, top: 600, cols: 8, rows: 7, roomW: 18, roomH: 10, gapX: 9, gapY: 10, floorTex: Tex.F_MARBLE_TILE, wallTex: Tex.MARBLE, roomTypes: [RoomType.OFFICE, RoomType.STORAGE, RoomType.PRODUCTION, RoomType.MEDICAL] },
  { key: 'scientist_center_tables', owner: ZoneFaction.SCIENTIST, name: 'учёные: таблица китайских пересечений', left: 300, top: 306, cols: 6, rows: 5, roomW: 17, roomH: 10, gapX: 10, gapY: 10, floorTex: Tex.F_MARBLE_TILE, wallTex: Tex.MARBLE, roomTypes: [RoomType.OFFICE, RoomType.STORAGE, RoomType.COMMON] },
];

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function crtResidue(modA: number, resA: number, modB: number, resB: number): number {
  if (gcd(modA, modB) !== 1) return -1;
  const limit = modA * modB;
  for (let n = ((resA % modA) + modA) % modA; n < limit; n += modA) {
    if (n % modB === ((resB % modB) + modB) % modB) return n;
  }
  return -1;
}
