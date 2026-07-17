import {
  Faction,
  Occupation,
  Tex,
  ZoneFaction,
  type TerritoryOwner,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('cayley_byuro');

export const CAYLEY_BYURO_ROUTE_ID = 'cayley_byuro' as const;

export const CAYLEY_BYURO_Z = 36;

export const CAYLEY_BYURO_BASE_FLOOR = 30;

export type CayleyElement = 'e' | 'r' | 'rr' | 's' | 'sr' | 'srr';

export type CayleyGenerator = 'r' | 's';

export type CayleyCoset = 'even' | 'odd';

export const CAYLEY_BYURO_ROOM_NAMES: Readonly<Record<CayleyElement | 'lobby' | 'bribe' | 'audit' | 'quotient', string>> = {
  lobby: 'Лифтовая приемная бюро Кэли',
  e: 'Нулевая форма e',
  r: 'Окно R: печать после подписи',
  rr: 'Окно R2: подпись после печати',
  s: 'Окно S: смена личности',
  sr: 'Косетная очередь SR',
  srr: 'Косетная очередь SR2',
  bribe: 'Касса платного генератора R',
  audit: 'Комната разоблачения подделок',
  quotient: 'Факторный короткий ход',
} as const;

export const CAYLEY_NEXT: Readonly<Record<CayleyGenerator, Readonly<Record<CayleyElement, CayleyElement>>>> = {
  r: { e: 'r', r: 'rr', rr: 'e', s: 'sr', sr: 'srr', srr: 's' },
  s: { e: 's', r: 'srr', rr: 'sr', s: 'e', sr: 'rr', srr: 'r' },
};

export const CAYLEY_BYURO_DECISIONS = [
  {
    id: 'order_rs',
    sequence: ['r', 's'] as const,
    result: 'srr' as CayleyElement,
    cue: 'Формы R затем S ведут в SR2. S затем R ведет в SR.',
  },
  {
    id: 'bribe_generator_r',
    sequence: ['r'] as const,
    result: 'r' as CayleyElement,
    cue: 'Кассир продает ключ к дверям генератора R. Это взятка, но не подделка.',
  },
  {
    id: 'illegal_quotient',
    sequence: ['s'] as const,
    result: 'odd' as CayleyCoset,
    cue: 'Факторный ход пропускает точный порядок форм и принимает поддельный пропуск.',
  },
] as const;

export interface CayleyByuroState {
  routeId: typeof CAYLEY_BYURO_ROUTE_ID;
  anchorZ: typeof CAYLEY_BYURO_Z;
  groupRooms: Record<CayleyElement, number>;
  generatorDoorIds: number[];
  quotientShortcutDoorIds: number[];
  decisionContainerIds: number[];
  debugEntry: {
    spawnX: number;
    spawnY: number;
    summary: string;
  };
}

export interface CayleyByuroGeneration extends FloorGeneration {
  cayleyState: CayleyByuroState;
}

export const CAYLEY_TAGS = ['cayley_byuro', 'cayley_graph', 'forms'];

export interface Point {
  x: number;
  y: number;
}

export interface CayleyHqSpec {
  owner: TerritoryOwner;
  x: number;
  y: number;
  name: string;
  supportPrefix: string;
  wallTex: Tex;
  floorTex: Tex;
  coreW: number;
  coreH: number;
  strong?: boolean;
}

export const CAYLEY_GRAPH_POINTS: Readonly<Record<CayleyElement, Point>> = {
  e: { x: 512, y: 168 },
  r: { x: 800, y: 310 },
  rr: { x: 800, y: 674 },
  s: { x: 512, y: 858 },
  sr: { x: 224, y: 674 },
  srr: { x: 224, y: 310 },
} as const;

export const CAYLEY_LATTICE_X = [96, 224, 352, 512, 672, 800, 928] as const;

export const CAYLEY_LATTICE_Y = [96, 224, 352, 512, 672, 800, 928] as const;

export const CAYLEY_BYURO_TARGET_TERRITORY_SHARES: Readonly<Record<TerritoryOwner, number>> = {
  [ZoneFaction.CITIZEN]: 0.26,
  [ZoneFaction.LIQUIDATOR]: 0.20,
  [ZoneFaction.CULTIST]: 0.10,
  [ZoneFaction.SAMOSBOR]: 0,
  [ZoneFaction.WILD]: 0.10,
  [ZoneFaction.SCIENTIST]: 0.34,
} as const;

export const CAYLEY_TERRITORY_GRID: readonly (readonly TerritoryOwner[])[] = [
  [ZoneFaction.CITIZEN, ZoneFaction.CITIZEN, ZoneFaction.CITIZEN, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.LIQUIDATOR, ZoneFaction.LIQUIDATOR, ZoneFaction.LIQUIDATOR],
  [ZoneFaction.CITIZEN, ZoneFaction.CITIZEN, ZoneFaction.CITIZEN, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.LIQUIDATOR, ZoneFaction.LIQUIDATOR],
  [ZoneFaction.CITIZEN, ZoneFaction.CITIZEN, ZoneFaction.CITIZEN, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.LIQUIDATOR, ZoneFaction.LIQUIDATOR, ZoneFaction.LIQUIDATOR],
  [ZoneFaction.CITIZEN, ZoneFaction.CITIZEN, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.LIQUIDATOR, ZoneFaction.LIQUIDATOR, ZoneFaction.SCIENTIST],
  [ZoneFaction.CITIZEN, ZoneFaction.CITIZEN, ZoneFaction.CITIZEN, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.LIQUIDATOR, ZoneFaction.WILD],
  [ZoneFaction.CITIZEN, ZoneFaction.CULTIST, ZoneFaction.CULTIST, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.WILD, ZoneFaction.WILD],
  [ZoneFaction.CULTIST, ZoneFaction.CULTIST, ZoneFaction.CULTIST, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.WILD, ZoneFaction.WILD],
  [ZoneFaction.CULTIST, ZoneFaction.CITIZEN, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.SCIENTIST, ZoneFaction.LIQUIDATOR, ZoneFaction.LIQUIDATOR, ZoneFaction.WILD],
] as const;

export const CAYLEY_HQ_SPECS: readonly CayleyHqSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    x: 176,
    y: 176,
    name: 'Гражданская приемная очередей Кэли',
    supportPrefix: 'Гражданская очередь',
    wallTex: Tex.PANEL,
    floorTex: Tex.F_LINO,
    coreW: 50,
    coreH: 34,
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    x: 856,
    y: 184,
    name: 'Ликвидаторский пост проверки порядка',
    supportPrefix: 'Пост проверки',
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    coreW: 54,
    coreH: 36,
  },
  {
    owner: ZoneFaction.CULTIST,
    x: 178,
    y: 822,
    name: 'Скрытый культовый фактор-узел',
    supportPrefix: 'Факторная келья',
    wallTex: Tex.DARK,
    floorTex: Tex.F_RED_CARPET,
    coreW: 42,
    coreH: 30,
  },
  {
    owner: ZoneFaction.SCIENTIST,
    x: 626,
    y: 500,
    name: 'НИИ Кэли: герметичное ядро алгоритма',
    supportPrefix: 'НИИ Кэли',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_MARBLE_TILE,
    coreW: 76,
    coreH: 46,
    strong: true,
  },
  {
    owner: ZoneFaction.WILD,
    x: 856,
    y: 850,
    name: 'Дикий выбитый архив смежности',
    supportPrefix: 'Выбитый архив',
    wallTex: Tex.ROTTEN,
    floorTex: Tex.F_CONCRETE,
    coreW: 44,
    coreH: 32,
  },
] as const;

export const CLERK_DEF: PlotNpcDef = {
  name: 'Григорий Кэли',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 120,
  maxHp: 120,
  money: 110,
  speed: 0.75,
  inventory: [
    { defId: 'blank_form', count: 2 },
    { defId: 'official_permit_slip', count: 1 },
    { defId: 'seal_wax', count: 1 },
  ],
  talkLines: [
    'У нас порядок форм важнее самих форм. R потом S - это одно окно, S потом R - совсем другое.',
    'Двери R открываются ключом. Ключ продается как ускорительный сбор, чтобы слово взятка не пачкало журнал.',
    'Факторный ход короткий, но он не проверяет личность. Потом личность проверяет ликвидатор.',
  ],
  talkLinesPost: [
    'Генератор R оплачен. Теперь не путайте чек с оправданием.',
    'Если дверь спорит, покажите ключ. Если клерк спорит, покажите вторую копию.',
  ],
};

export const COSET_DEF: PlotNpcDef = {
  name: 'Маша Косетная',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 105,
  maxHp: 105,
  money: 55,
  speed: 0.8,
  inventory: [
    { defId: 'passport_stub', count: 1 },
    { defId: 'blank_form', count: 1 },
  ],
  talkLines: [
    'Мне все равно, кто вы. Мне важно, в какой класс смежности вас положили.',
    'Сделайте R потом S и зайдите в SR2. Потом сделайте наоборот и увидите, что очередь другая.',
    'Короткий ход пропускает кабинет, но оставляет поддельный след.',
  ],
  talkLinesPost: [
    'Вы дошли до нужного окна. Значит, порядок был правильный или очень удачно украденный.',
    'Не говорите "то же самое" в коридоре. Тут за это ставят второй штамп.',
  ],
};

export const INSPECTOR_DEF: PlotNpcDef = {
  name: 'Инспектор Смежности',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.DIRECTOR,
  sprite: Occupation.DIRECTOR,
  hp: 230,
  maxHp: 230,
  money: 140,
  speed: 0.88,
  inventory: [
    { defId: 'denunciation', count: 1 },
    { defId: 'makarov', count: 1 },
    { defId: 'official_permit_slip', count: 1 },
  ],
  talkLines: [
    'Поддельная личность не лжет. Она сокращает проверку. За сокращение отвечают отдельно.',
    'Принесете липовый пропуск - я закрою факторный ход на бумаге. Дверь может еще не знать.',
    'Параграфы здесь стреляют по прямой строке. Не стойте в строке.',
  ],
  talkLinesPost: [
    'Подделка принята как улика. Теперь у нее есть владелец, и это уже не вы.',
    'Короткий ход останется коротким. Просто за ним теперь смотрят.',
  ],
};

