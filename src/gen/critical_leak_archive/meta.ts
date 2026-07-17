import {
  Faction,
  Occupation,
  Tex,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('critical_leak_archive');

export const CRITICAL_LEAK_ARCHIVE_ROUTE_ID = 'critical_leak_archive' as const;

export const CRITICAL_LEAK_ARCHIVE_Z = 24;

export const CRITICAL_LEAK_ARCHIVE_BASE_FLOOR = 30;

export const CRITICAL_LEAK_ARCHIVE_ROOM_NAMES = {
  lobby: 'Сухой лифтовый тамбур критической протечки',
  trade: 'Окно обмена сухих архивных пакетов',
  dryIndex: 'Сухой остров дел постоянного хранения',
  disputedStack: 'Мокрая картотека спорных причин',
  floodgate: 'Пульт архивной водоотсечки',
  shortcut: 'Зараженный водяной короткий ход',
  dryingRoom: 'Комната аварийной просушки',
  witness: 'Стол свидетелей протечки',
} as const;

export interface CriticalLeakArchiveState {
  routeId: typeof CRITICAL_LEAK_ARCHIVE_ROUTE_ID;
  anchorZ: typeof CRITICAL_LEAK_ARCHIVE_Z;
  largestComponentCells: number;
  wetCausewayCells: number;
  dryCausewayCells: number;
  bridgesAdded: number;
  contaminatedShortcutCells: number;
  midArchiveBlocks: number;
  microArchiveRooms: number;
  hqAnchorRooms: number;
  hqSupportRooms: number;
  dryPacketContainerIds: number[];
  floodgateContainerId: number;
  debugEntry: {
    spawnX: number;
    spawnY: number;
    summary: string;
  };
}

export interface CriticalLeakArchiveGeneration extends FloorGeneration {
  criticalLeakState: CriticalLeakArchiveState;
}

export interface Point {
  x: number;
  y: number;
}

export interface PercolationField {
  inLargest: Uint8Array;
  east: Uint8Array;
  south: Uint8Array;
  largestCells: number[];
  centers: Point[];
}

export type NextId = { v: number };

export interface ArchiveBlockSpec {
  cx: number;
  cy: number;
  cols: number;
  lanes: number;
  wet?: boolean;
  prefix: string;
}

export interface FactionHqSpec {
  owner: TerritoryOwner;
  x: number;
  y: number;
  label: string;
  wallTex: Tex;
  floorTex: Tex;
}

export interface FactionHqCompound {
  owner: TerritoryOwner;
  core: Room;
  supportRooms: Room[];
}

export interface ArchiveExpansionStats {
  blocks: number;
  microRooms: number;
  hqRooms: number;
  supportRooms: number;
  hqCompounds: FactionHqCompound[];
}

export const GRID_W = 45;

export const GRID_H = 45;

export const GRID_STEP = 20;

export const GRID_ORIGIN = 72;

export const SITE_P = 0.64;

export const BOND_P = 0.66;

export const WATER_TAGS = ['critical_leak_archive', 'wet_archive', 'contaminated_shortcut'] as const;

export const ARCHIVE_ROOM_W = 11;

export const ARCHIVE_ROOM_H = 8;

export const ARCHIVE_ROOM_GAP = 3;

export const ARCHIVE_AISLE_W = 3;

export const ARCHIVE_LANE_GAP = 8;

export const ARCHIVE_BLOCKS: readonly ArchiveBlockSpec[] = [
  { cx: 150, cy: 130, cols: 7, lanes: 4, prefix: 'Северо-западная сетка сухих причин' },
  { cx: 506, cy: 116, cols: 8, lanes: 4, prefix: 'Северная сетка отсроченных жалоб' },
  { cx: 858, cy: 126, cols: 7, lanes: 4, wet: true, prefix: 'Северо-восточная сетка мокрых актов' },
  { cx: 122, cy: 310, cols: 7, lanes: 4, prefix: 'Левый реестр аварийных писем' },
  { cx: 362, cy: 338, cols: 7, lanes: 4, prefix: 'Сухой карман проверочных листов' },
  { cx: 640, cy: 346, cols: 7, lanes: 4, prefix: 'Поперечный архив причинных скрепок' },
  { cx: 888, cy: 330, cols: 7, lanes: 4, wet: true, prefix: 'Правый мокрый реестр отказов' },
  { cx: 142, cy: 548, cols: 8, lanes: 4, prefix: 'Западная сетка свидетельских копий' },
  { cx: 638, cy: 548, cols: 7, lanes: 4, prefix: 'Средняя сетка водоотсечки' },
  { cx: 888, cy: 590, cols: 7, lanes: 4, wet: true, prefix: 'Восточная сетка зараженных дел' },
  { cx: 138, cy: 782, cols: 7, lanes: 4, prefix: 'Нижний левый архив сухих отметок' },
  { cx: 430, cy: 820, cols: 8, lanes: 4, prefix: 'Нижний центральный архив просушки' },
  { cx: 704, cy: 836, cols: 7, lanes: 4, prefix: 'Нижняя сетка насосных ведомостей' },
  { cx: 900, cy: 830, cols: 7, lanes: 4, wet: true, prefix: 'Нижний правый мокрый каталог' },
] as const;

export const ARCHIVE_HQ_SPECS: readonly FactionHqSpec[] = [
  { owner: ZoneFaction.CITIZEN, x: 68, y: 454, label: 'гражданской сухой очереди', wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
  { owner: ZoneFaction.LIQUIDATOR, x: 828, y: 438, label: 'ликвидаторской отсечки', wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE },
  { owner: ZoneFaction.CULTIST, x: 824, y: 184, label: 'культа мокрой причины', wallTex: Tex.MARBLE, floorTex: Tex.F_WATER },
  { owner: ZoneFaction.SCIENTIST, x: 552, y: 782, label: 'ученого учета протечки', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { owner: ZoneFaction.WILD, x: 70, y: 820, label: 'дикой сушки трофеев', wallTex: Tex.BRICK, floorTex: Tex.F_CONCRETE },
] as const;

export const TARGET_ROUTE = {
  designFloorId: CRITICAL_LEAK_ARCHIVE_ROUTE_ID,
  z: CRITICAL_LEAK_ARCHIVE_Z,
  tags: ['critical_leak_archive', 'wet_archive', 'documents', 'floodgate'],
  label: 'Архив критической протечки',
  risk: 4,
} as const;

export const ARCHIVIST_DEF: PlotNpcDef = {
  name: 'Варвара Сухопись',
  isFemale: true,
  faction: Faction.SCIENTIST,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 110, maxHp: 110, money: 84, speed: 0.72,
  inventory: [
    { defId: 'filter_receipt', count: 1 },
    { defId: 'blank_form', count: 2 },
    { defId: 'seal_wax', count: 1 },
  ],
  talkLines: [
    'Сухой пакет несут двумя руками. Мокрый пакет сам несет вас к проверке.',
    'Здесь важна не папка, а путь, по которому она осталась сухой.',
    'Если вода соединила шкафы, значит причина уже почти доказана.',
  ],
  talkLinesPost: [
    'Сухой пакет принят. Теперь у протечки есть причина, а у причины есть номер.',
    'Не кладите сухие бумаги рядом с зараженными. Они начинают спорить чернилами.',
  ],
};

export const LIQUIDATOR_DEF: PlotNpcDef = {
  name: 'Егор Отсечка',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 210, maxHp: 210, money: 42, speed: 0.92,
  inventory: [
    { defId: 'makarov', count: 1 },
    { defId: 'ammo_9mm', count: 10 },
    { defId: 'decon_fluid', count: 1 },
  ],
  talkLines: [
    'Короткий ход есть. Он мокрый. Умный человек называет это ценой, а не дорогой.',
    'Шлюз поднимете - архив вздохнет. Не поднимете - вода сама найдет форму.',
    'Если пошли через воду, не прячьте перчатки. Их потом находят первыми.',
  ],
  talkLinesPost: [
    'Затвор поднят. Вода ушла ровно настолько, чтобы вернуться без предупреждения.',
    'Пакет сухой, ботинки нет. Для архива это приемлемый баланс.',
  ],
};

