import {
  Faction, 
  Occupation, 
  W, 
  type Entity, type Item
  ,
} from '../../core/types';
import { World } from '../../core/world';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('underhell');

export const DESIGN_FLOOR_ID = 'underhell' as const;

export const UNDERHELL_ROUTE_ID = DESIGN_FLOOR_ID;

export const UNDERHELL_Z = -38;

export const UNDERHELL_DEFAULT_SEED = 19032;

export const UNDERHELL_FLOOR = 180;

export const SPAWN_X = W >> 1;

export const SPAWN_Y = W >> 1;

export const THRESHOLD_MASK = 0b0000_0000_0000_0111;

export const WITNESS_MASK = 0b0000_0000_0001_1000;

export const UNDERHELL_THRESHOLD_CHAIN_MIN_SCORE = 9;

export const UNDERHELL_FLAGS = {
  THRESHOLD_HOLY_WATER: 1 << 0,
  THRESHOLD_PASSPORT_STUB: 1 << 1,
  THRESHOLD_BLOOD_HP: 1 << 2,
  WITNESS_RESCUED: 1 << 3,
  WITNESS_SILENCED: 1 << 4,
  DEBT_BURNED: 1 << 5,
  VOID_ANCHOR_BROKEN: 1 << 6,
  VOID_GATE_OPEN: 1 << 7,
} as const;

export type UnderhellWitnessState = 'sealed' | 'rescued' | 'silenced';

export type UnderhellVoidGateState = 'sealed' | 'anchored' | 'open';

export type UnderhellLateWarningId =
  | 'underhell_threshold_price_echo'
  | 'underhell_void_cut_darkness_trace'
  | 'underhell_root_retreat_ledge'
  | 'underhell_lower_retreat_ledge';

export interface UnderhellLateWarning {
  id: UnderhellLateWarningId;
  label: string;
  sourceRoomName: string;
  targetRoomDefId: string;
  warning: string;
  tags: readonly string[];
}

export interface UnderhellRitualState {
  routeId: typeof UNDERHELL_ROUTE_ID;
  z: typeof UNDERHELL_Z;
  seed: number;
  flags: number;
  entryRoomId: number;
  fallbackRoomId: number;
  thresholdRoomId: number;
  witnessRoomIds: number[];
  witnessDoorCells: number[];
  lowerFallbackRoomId: number;
  debtRoomId: number;
  voidGateRoomId: number;
  debtWellCell: number;
  voidGateCell: number;
  voidAnchorEntityId: number;
  capillaryCells: number;
  tributeFrontCells: number;
  shelterCells: number;
  lateWarningIds: UnderhellLateWarningId[];
}

export interface UnderhellRitualSnapshot {
  thresholdPaid: boolean;
  thresholdCost: UnderhellThresholdCostId | 'none';
  witnessState: UnderhellWitnessState;
  debtBurned: boolean;
  voidGateState: UnderhellVoidGateState;
  flags: number;
}

export interface UnderhellDesignGeneration {
  world: World;
  entities: Entity[];
  spawnX: number;
  spawnY: number;
  ritualState: UnderhellRitualState;
  thresholdChain: UnderhellThresholdChainScore;
  isDecentralized: true;
}

export interface UnderhellGenerationOptions {
  seed?: number;
  forceOpenVoidGate?: boolean;
}

export type UnderhellThresholdCostId = 'holy_water' | 'passport_stub' | 'blood_35hp';

export type UnderhellThresholdChainRole = 'entry' | 'threat' | 'fallback' | 'reward' | 'exit';

export interface UnderhellThresholdChainNode {
  role: UnderhellThresholdChainRole;
  roomId: number;
  roomDefId: string;
  x: number;
  y: number;
  reachable: boolean;
}

export interface UnderhellThresholdChainScore {
  routeId: typeof UNDERHELL_ROUTE_ID;
  z: typeof UNDERHELL_Z;
  score: number;
  minScore: number;
  nodes: readonly UnderhellThresholdChainNode[];
  hasRetreat: boolean;
  hasWitnessBranch: boolean;
  hasDebtReward: boolean;
  hasVoidExit: boolean;
  capillaryCells: number;
  tributeFrontCells: number;
  shelterCells: number;
}

export interface UnderhellSdfMetrics {
  tributeFrontCells: number;
  shelterCells: number;
}

export interface UnderhellThresholdCost {
  id: UnderhellThresholdCostId;
  label: string;
  flag: number;
  item?: Item;
  hp?: number;
  backlash?: 'identity';
}

export const UNDERHELL_THRESHOLD_COSTS = [
  {
    id: 'holy_water',
    label: '1 фляга воды с церковной печатью',
    flag: UNDERHELL_FLAGS.THRESHOLD_HOLY_WATER,
    item: { defId: 'holy_water', count: 1 },
  },
  {
    id: 'passport_stub',
    label: '1 паспортный корешок',
    flag: UNDERHELL_FLAGS.THRESHOLD_PASSPORT_STUB,
    item: { defId: 'passport_stub', count: 1 },
    backlash: 'identity',
  },
  {
    id: 'blood_35hp',
    label: '35 HP кровью у поста',
    flag: UNDERHELL_FLAGS.THRESHOLD_BLOOD_HP,
    hp: 35,
  },
] as const satisfies readonly UnderhellThresholdCost[];

export const UNDERHELL_LATE_WARNINGS: readonly UnderhellLateWarning[] = [
  {
    id: 'underhell_threshold_price_echo',
    label: 'Цена пропуска возвращается слухом',
    sourceRoomName: 'Пост трех оплат',
    targetRoomDefId: 'Свидетельские клетки',
    warning: 'Пост берет одну плату сейчас, но свидетельская клетка решает, кто потом расскажет о цене.',
    tags: ['underhell', 'threshold', 'witness', 'warning'],
  },
  {
    id: 'underhell_void_cut_darkness_trace',
    label: 'Разрез к Пустоте оставляет след',
    sourceRoomName: 'Списочная створка',
    targetRoomDefId: 'Разрез к Пустоте',
    warning: 'Открытый разрез ведет к Пустоте, а позже может оставить мокрый след в темном отсеке.',
    tags: ['underhell', 'void_gate', 'darkness', 'warning'],
  },
  {
    id: 'underhell_root_retreat_ledge',
    label: 'Верхний обратный уступ виден до платы',
    sourceRoomName: 'Корневой вход',
    targetRoomDefId: 'Обратный уступ',
    warning: 'Обратный уступ и корневая лестница остаются открытыми: если пост слишком громкий, уходи к лифту тем же светом.',
    tags: ['underhell', 'retreat', 'threshold', 'warning'],
  },
  {
    id: 'underhell_lower_retreat_ledge',
    label: 'Нижний уступ не запирает разрез',
    sourceRoomName: 'Культовая пошлинная палата',
    targetRoomDefId: 'Нижний обратный уступ',
    warning: 'Нижний обратный уступ связывает долг, якорь и разрез: награду можно взять и уйти без прямого боя у створки.',
    tags: ['underhell', 'retreat', 'reward', 'warning'],
  },
];

export const UNDERHELL_DEBUG_ENTRY = {
  routeId: UNDERHELL_ROUTE_ID,
  z: UNDERHELL_Z,
  label: 'Нижний пропускник',
  generator: 'generateUnderhellDesignFloor',
  seed: UNDERHELL_DEFAULT_SEED,
  smokePath: [
    'spawn',
    'Корневой вход',
    'Обратный уступ',
    'Корневая лестница',
    'Пост трех оплат',
    'Культовая пошлинная палата',
    'Свидетельские клетки',
    'Печь долга',
    'Палата якоря',
    'Списочная створка',
    'Разрез к Пустоте',
  ],
} as const;

export const THRESHOLD_MARFUSHA_DEF: PlotNpcDef = {
  name: 'Марфуша Постовая',
  isFemale: true,
  faction: Faction.CULTIST,
  occupation: Occupation.PRIEST,
  sprite: Occupation.PRIEST,
  hp: 620, maxHp: 620, money: 6, speed: 0.75,
  inventory: [
    { defId: 'holy_water', count: 1 },
    { defId: 'note', count: 1 },
  ],
  talkLines: [
    'Нижний пропускник не слушает веру. Нужна вода с печатью, корешок паспорта или кровь на мокрой плитке.',
    'Пост принимает три платы: флягу с печатью, паспортный корешок или тридцать пять здоровья прямо здесь.',
    'Платить можно один раз. Второй раз пост спросит у свидетеля, списка или двери.',
  ],
  talkLinesPost: [
    'Пост принял плату. Теперь смотри на клетки: свидетели помнят лишнее.',
    'Если Пустота откроется мягко, не верь мягкости.',
  ],
};

export const DEBT_CULTIST_DEF: PlotNpcDef = {
  name: 'Иона Долгожог',
  isFemale: false,
  faction: Faction.CULTIST,
  occupation: Occupation.STOREKEEPER,
  sprite: Occupation.STOREKEEPER,
  hp: 420, maxHp: 420, money: 88, speed: 0.8,
  inventory: [
    { defId: 'forged_stamp_sheet', count: 1 },
    { defId: 'water_coupon', count: 2 },
  ],
  talkLines: [
    'Рынок 88 и этаж 69 пишут долги разными чернилами. Горят одинаково.',
    'Принеси лист с поддельной печатью. Я сожгу долг, а запах уйдет в журнал как оплата.',
    'Бумага исчезнет сразу. Последствие придет позже, с чужой фамилией.',
  ],
  talkLinesPost: [
    'Печь сыта. Если наверху стало дешевле, значит снизу стало личнее.',
    'Не называй это прощением. Это отсрочка с зубами.',
  ],
};

export const WORDLESS_LIQUIDATOR_DEF: PlotNpcDef = {
  name: 'Безмолвный ликвидатор',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 500, maxHp: 500, money: 0, speed: 0.9,
  inventory: [
    { defId: 'ammo_9mm', count: 10 },
    { defId: 'bandage', count: 1 },
    { defId: 'note', count: 1 },
  ],
  talkLines: [
    '...',
    'Он чертит на полу: КЛЕТКА - ДОЛГ - ЯКОРЬ.',
    'На записке: свидетеля можно вывести, можно замолчать. Разница всплывет слухом.',
  ],
  talkLinesPost: [
    'Он кивает на разрез в полу и больше не пишет.',
  ],
};

export const FALSE_YAKOV_DEF: PlotNpcDef = {
  name: 'Ложный Яков-эхо',
  isFemale: false,
  faction: Faction.CULTIST,
  occupation: Occupation.SCIENTIST,
  sprite: Occupation.SCIENTIST,
  hp: 260, maxHp: 260, money: 0, speed: 0.95,
  inventory: [
    { defId: 'psi_dust', count: 1 },
    { defId: 'antidep', count: 1 },
  ],
  talkLines: [
    'Яков Давидович бы сказал: не трогай якорь. Поэтому я скажу наоборот.',
    'Разрез откроется, когда пост оплачен, а якорь разбит. Порядок не важен.',
    'Если голос в банке начнет учить тебя фамилии, закрой банку патроном.',
  ],
  talkLinesPost: [
    'Эхо стало короче. Значит, где-то стало пустее.',
  ],
};

