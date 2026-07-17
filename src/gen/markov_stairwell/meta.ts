import {
  Faction,
  Feature,
  Occupation,
  RoomType,
  Tex,
  ZoneFaction,
  type Room,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('markov_stairwell');

export const MARKOV_STAIRWELL_ROUTE_ID = 'markov_stairwell' as const;

export const MARKOV_STAIRWELL_Z = 20;

export const MARKOV_STAIRWELL_BYPASS_KEY = 'container_key_label';

export const BASE_FLOOR = 30;

export const SPINE_X = 494;

export const SPINE_Y = 148;

export const SPINE_W = 36;

export const SPINE_H = 734;

export const LANDING_COUNT = 18;

export const LANDING_Y0 = 178;

export const LANDING_STEP = 38;

export const SERVICE_X = 665;

export const SERVICE_W = 7;

export const SERVICE_ENTRY_STEP = 4;

export const SERVICE_EXIT_STEP = 13;

export const RARE_STEP_MIN = 9;

export const RARE_STEP_SPAN = 5;

export const GRAPH_NODE_W = 42;

export const GRAPH_NODE_H = 22;

export const GRAPH_ROW_Y = [240, 372, 504, 636, 768] as const;

export const GRAPH_COLUMNS = [
  { x: 86, side: 'left', label: 'L0' },
  { x: 198, side: 'left', label: 'L1' },
  { x: 310, side: 'left', label: 'L2' },
  { x: 682, side: 'right', label: 'R0' },
  { x: 794, side: 'right', label: 'R1' },
  { x: 906, side: 'right', label: 'R2' },
] as const;

export const LEFT_TRUNK_X = 360;

export const RIGHT_TRUNK_X = 640;

export const GRAPH_RING_LEFT = 58;

export const GRAPH_RING_RIGHT = 972;

export const GRAPH_RING_TOP = 176;

export const GRAPH_RING_BOTTOM = 828;

export const HQ_SUPPORT_LIMIT = 5;

export type MotifId = 'landing' | 'kitchen' | 'registry' | 'bath' | 'storage' | 'service' | 'rare';

export type HiddenState = 'quiet' | 'watched' | 'hunting' | 'rare';

export type DoorSide = 'north' | 'south' | 'west' | 'east';

export interface WeightedMotif {
  id: MotifId;
  weight: number;
}

export interface MotifDef {
  id: MotifId;
  label: string;
  type: RoomType;
  w: number;
  h: number;
  wallTex: Tex;
  floorTex: Tex;
  feature: Feature;
}

export interface ChainRoom {
  room: Room;
  motif: MotifId;
  state: HiddenState;
  step: number;
}

export interface HqSpec {
  owner: ZoneFaction;
  title: string;
  x: number;
  y: number;
  wallTex: Tex;
  floorTex: Tex;
  supportWallTex: Tex;
  supportFloorTex: Tex;
  strong?: boolean;
}

export interface MarkovStairwellMetrics {
  routeId: typeof MARKOV_STAIRWELL_ROUTE_ID;
  z: typeof MARKOV_STAIRWELL_Z;
  sequenceLength: number;
  motifChanges: number;
  watchedRooms: number;
  huntingRooms: number;
  rareRooms: number;
  patternTellCells: number;
  serviceBypassCells: number;
  lockedServiceDoors: number;
  patternStashes: number;
  rareStateStashes: number;
  ungatedUpLiftReachable: boolean;
  ungatedDownLiftReachable: boolean;
}

export const MOTIFS: Readonly<Record<MotifId, MotifDef>> = {
  landing: {
    id: 'landing',
    label: 'площадка',
    type: RoomType.CORRIDOR,
    w: 54,
    h: 20,
    wallTex: Tex.PANEL,
    floorTex: Tex.F_LINO,
    feature: Feature.LAMP,
  },
  kitchen: {
    id: 'kitchen',
    label: 'кухня',
    type: RoomType.KITCHEN,
    w: 62,
    h: 22,
    wallTex: Tex.TILE_W,
    floorTex: Tex.F_TILE,
    feature: Feature.STOVE,
  },
  registry: {
    id: 'registry',
    label: 'журнал',
    type: RoomType.OFFICE,
    w: 66,
    h: 22,
    wallTex: Tex.MARBLE,
    floorTex: Tex.F_PARQUET,
    feature: Feature.DESK,
  },
  bath: {
    id: 'bath',
    label: 'мокрая',
    type: RoomType.BATHROOM,
    w: 50,
    h: 20,
    wallTex: Tex.TILE_W,
    floorTex: Tex.F_TILE,
    feature: Feature.SINK,
  },
  storage: {
    id: 'storage',
    label: 'кладовая',
    type: RoomType.STORAGE,
    w: 58,
    h: 22,
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.SHELF,
  },
  service: {
    id: 'service',
    label: 'служебка',
    type: RoomType.PRODUCTION,
    w: 60,
    h: 22,
    wallTex: Tex.PIPE,
    floorTex: Tex.F_CONCRETE,
    feature: Feature.APPARATUS,
  },
  rare: {
    id: 'rare',
    label: 'редкое состояние',
    type: RoomType.STORAGE,
    w: 72,
    h: 24,
    wallTex: Tex.DARK,
    floorTex: Tex.F_GREEN_CARPET,
    feature: Feature.SCREEN,
  },
};

export const TRANSITIONS: Readonly<Record<MotifId, readonly WeightedMotif[]>> = {
  landing: [
    { id: 'kitchen', weight: 4 },
    { id: 'registry', weight: 3 },
    { id: 'storage', weight: 2 },
    { id: 'bath', weight: 2 },
  ],
  kitchen: [
    { id: 'landing', weight: 3 },
    { id: 'bath', weight: 3 },
    { id: 'storage', weight: 2 },
    { id: 'registry', weight: 1 },
  ],
  registry: [
    { id: 'landing', weight: 3 },
    { id: 'storage', weight: 3 },
    { id: 'service', weight: 2 },
    { id: 'kitchen', weight: 1 },
  ],
  bath: [
    { id: 'kitchen', weight: 3 },
    { id: 'landing', weight: 3 },
    { id: 'service', weight: 2 },
    { id: 'storage', weight: 1 },
  ],
  storage: [
    { id: 'registry', weight: 3 },
    { id: 'service', weight: 3 },
    { id: 'landing', weight: 2 },
    { id: 'rare', weight: 1 },
  ],
  service: [
    { id: 'landing', weight: 3 },
    { id: 'storage', weight: 2 },
    { id: 'registry', weight: 2 },
    { id: 'bath', weight: 1 },
  ],
  rare: [
    { id: 'landing', weight: 4 },
    { id: 'service', weight: 2 },
    { id: 'storage', weight: 1 },
  ],
};

export const NPC_IDS = {
  watcher: 'markov_stairwell_watcher',
} as const;

export const WATCHER_DEF: PlotNpcDef = {
  name: 'Павел Марков',
  isFemale: false,
  faction: Faction.SCIENTIST,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 92,
  maxHp: 92,
  money: 41,
  speed: 0.82,
  inventory: [
    { defId: 'chalk', count: 1 },
    { defId: MARKOV_STAIRWELL_BYPASS_KEY, count: 1 },
    { defId: 'note', count: 1 },
  ],
  talkLines: [
    'Лестница не шутит, она просто повторяет привычки. После кухни чаще мокрая, после журнала чаще кладовая.',
    'Видишь три одинаковых бирки подряд - не геройствуй. Служебная дверь короче и честнее.',
    'Редкое состояние бывает, когда кладовая не спорит с журналом. Там шкаф тихий, зато запись потом спрашивают.',
    'Мелом отмечай не вход, а выход. Тут многие ставили стрелку туда, где уже были.',
  ],
  talkLinesPost: [
    'Цепочку переписали. Если после самосбора звено другое, значит, старая запись сгорела правильно.',
    'Служебная дверь опять закрыта. Бирка есть у того, кто не выбросил её в первую мокрую комнату.',
  ],
  talkQuestResponse: 'Лифтограмму принёс? Хорошо. Теперь хотя бы один маршрут не будет считаться на пальцах.',
};

export const MARKOV_HQ_SPECS: readonly HqSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    title: 'гражданский счётный узел',
    x: 402,
    y: 52,
    wallTex: Tex.PANEL,
    floorTex: Tex.F_LINO,
    supportWallTex: Tex.PANEL,
    supportFloorTex: Tex.F_LINO,
    strong: true,
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    title: 'караул среза',
    x: 802,
    y: 76,
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    supportWallTex: Tex.METAL,
    supportFloorTex: Tex.F_CONCRETE,
  },
  {
    owner: ZoneFaction.CULTIST,
    title: 'узел неверной вероятности',
    x: 112,
    y: 76,
    wallTex: Tex.DARK,
    floorTex: Tex.F_GREEN_CARPET,
    supportWallTex: Tex.ROTTEN,
    supportFloorTex: Tex.F_WOOD,
  },
  {
    owner: ZoneFaction.SCIENTIST,
    title: 'НИИ переходных матриц',
    x: 802,
    y: 850,
    wallTex: Tex.MARBLE,
    floorTex: Tex.F_MARBLE_TILE,
    supportWallTex: Tex.TILE_W,
    supportFloorTex: Tex.F_TILE,
  },
  {
    owner: ZoneFaction.WILD,
    title: 'дикая ночёвка под маршем',
    x: 112,
    y: 850,
    wallTex: Tex.BRICK,
    floorTex: Tex.F_CONCRETE,
    supportWallTex: Tex.BRICK,
    supportFloorTex: Tex.F_WOOD,
  },
] as const;

