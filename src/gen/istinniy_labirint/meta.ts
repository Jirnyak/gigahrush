import {
  Faction,
  Feature,
  Occupation,
  RoomType,
  Tex,
  W,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('istinniy_labirint');

export const ISTINNIY_LABIRINT_ROUTE_ID = 'istinniy_labirint' as const;

export const ISTINNIY_LABIRINT_Z = 28;

export const ISTINNIY_LABIRINT_CHORD_KEY = 'key';

export const BASE_FLOOR = 30;

export const GRID_W = 63;

export const GRID_H = 63;

export const GRID_N = GRID_W * GRID_H;

export const PITCH = 16;

export const CENTER_OFFSET = 8;

export const START_GX = 31;

export const START_GY = 31;

export const SAFE_WALL_MIN = 32;

export const SAFE_WALL_MAX = W - 33;

export const ROOM_WALL = Tex.MARBLE;

export const ROOM_FLOOR = Tex.F_PARQUET;

export const MAZE_WALL = Tex.PANEL;

export const MAZE_FLOOR = Tex.F_CONCRETE;

export const THREAD_FLOOR = Tex.F_TILE;

export const CHORD_FLOOR = Tex.F_RED_CARPET;

export const SAFE_WALL_ROOM = 'Лабиринт: белая стена обратного пути';

export const LOST_ROOM = 'Лабиринт: узел потерянного Паши';

export const DOCUMENT_STASH_ROOM = 'Лабиринт: тупик документного ящика';

export const LANDMARK_ROOM_NAMES = new Set([
  'Лабиринт: нулевая катушка Ариадны',
  SAFE_WALL_ROOM,
  'Лабиринт: комната шести стрелок',
  'Лабиринт: узел короткой красной хорды',
  LOST_ROOM,
  DOCUMENT_STASH_ROOM,
  'Лабиринт: дальняя лифтовая спина',
]);

export const BIT_E = 1 << 0;

export const BIT_W = 1 << 1;

export const BIT_S = 1 << 2;

export const BIT_N = 1 << 3;

export interface Dir {
  dx: number;
  dy: number;
  bit: number;
  opposite: number;
}

export const DIRS: readonly Dir[] = [
  { dx: 1, dy: 0, bit: BIT_E, opposite: BIT_W },
  { dx: -1, dy: 0, bit: BIT_W, opposite: BIT_E },
  { dx: 0, dy: 1, bit: BIT_S, opposite: BIT_N },
  { dx: 0, dy: -1, bit: BIT_N, opposite: BIT_S },
] as const;

export interface MazeGraph {
  links: Uint8Array;
  start: number;
  exit: number;
  parent: Int32Array;
  depth: Int32Array;
  mainPath: number[];
  braidedLinks: number;
}

export interface LockedChord {
  a: number;
  b: number;
  doorIdx: number;
}

export interface CellPoint {
  x: number;
  y: number;
}

export interface Landmark {
  cell: number;
  name: string;
  type: RoomType;
  w: number;
  h: number;
  feature: Feature;
}

export interface LabyrinthOwnedRoom {
  room: Room;
  owner: TerritoryOwner;
}

export interface RoomStampSpec {
  cell: number;
  dx: number;
  dy: number;
  w: number;
  h: number;
  type: RoomType;
  name: string;
  wallTex: Tex;
  floorTex: Tex;
  feature: Feature;
  owner?: TerritoryOwner;
  sealed?: boolean;
  hermeticDoor?: boolean;
}

export interface IstinniyLabirintMetrics {
  routeId: typeof ISTINNIY_LABIRINT_ROUTE_ID;
  z: typeof ISTINNIY_LABIRINT_Z;
  landmarkCount: number;
  midRooms: number;
  microRooms: number;
  rewardDeadEnds: number;
  lockedChords: number;
  ariadneCueCells: number;
  mainPathLength: number;
  pathEntropy: number;
  minLandmarkSpacing: number;
  safeWallCells: number;
  ungatedDownLiftReachable: boolean;
  ungatedUpLiftReachable: boolean;
}

export const NPC_IDS = {
  ariadna: 'labyrinth_ariadna_zina',
  lostPavel: 'labyrinth_lost_pavel',
} as const;

export const ARIADNA_DEF: PlotNpcDef = {
  name: 'Зина Ариадна',
  isFemale: true,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 150,
  maxHp: 150,
  money: 64,
  speed: 1.0,
  weapon: 'makarov',
  inventory: [
    { defId: 'chalk', count: 1 },
    { defId: 'key', count: 1 },
    { defId: 'ammo_9mm', count: 10 },
  ],
  talkLines: [
    'Истинный лабиринт не прячет выход. Он прячет уверенность, что ты уже был здесь.',
    'Белую стену держи левой рукой. Красная хорда короче, но там голоса считают патроны.',
    'Мел ставь не на память, а на отступление. Память здесь берет взятки.',
    'Паша ушел по ламповому следу и перестал спорить. Если найдешь, веди к белой стене, не к центру.',
  ],
  talkLinesPost: [
    'Нить обновлена. Если метка свежая, а пыль старая, значит, метку поставили не люди.',
    'Ключ от хорды не делает ход безопасным. Он только делает ошибку короче.',
  ],
  talkQuestResponse: 'Паша дошел до поста и молчит правильно. Держи схему лифтов. В следующий раз бери мел до входа.',
};

export const LOST_PAVEL_DEF: PlotNpcDef = {
  name: 'Паша Без Нити',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.TRAVELER,
  sprite: Occupation.TRAVELER,
  hp: 88,
  maxHp: 88,
  money: 17,
  speed: 0.78,
  inventory: [
    { defId: 'bread', count: 1 },
    { defId: 'chalk', count: 1 },
  ],
  talkLines: [
    'Я помнил три поворота. Потом стены стали одинаковые, а мои метки начали смотреть назад.',
    'Если ведешь к лифту, не срезай по красному ковру. Там кто-то дышит между шагами.',
    'В тупике с ящиком лежит бумага. Я ее не трогал: бумага знала мое имя.',
  ],
  talkLinesPost: [
    'У белой стены тихо. Слишком тихо, но это уже работа Зины.',
    'Я больше не считаю повороты. Считаю воду.',
  ],
};

