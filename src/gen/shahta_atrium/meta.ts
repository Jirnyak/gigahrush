import {
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_FLOOR_ID = 'shahta_atrium' as const;

export const SHAHTA_ATRIUM_ROUTE_Z = -24 as const;

export const SHAHTA_ATRIUM_BASE_FLOOR = 140;

export const CX = W >> 1;

export const CY = W >> 1;

export const INNER_R = 138;

export const MID_R = 212;

export const OUTER_R = 304;

export const VOID_R = 116;

export const SHAHTA_MICRO_TYPES: readonly RoomType[] = [
  RoomType.STORAGE,
  RoomType.PRODUCTION,
  RoomType.OFFICE,
  RoomType.BATHROOM,
  RoomType.COMMON,
  RoomType.STORAGE,
  RoomType.SMOKING,
  RoomType.MEDICAL,
];

export interface ShahtaHqSupportSpec {
  type: RoomType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hermetic?: boolean;
}

export interface ShahtaHqSpec {
  owner: TerritoryOwner;
  key: string;
  hall: [number, number, number, number];
  connect: [number, number];
  wallTex: Tex;
  floorTex: Tex;
  support: readonly ShahtaHqSupportSpec[];
}

export interface ShahtaHqCompound {
  owner: TerritoryOwner;
  hall: Room;
  core: Room;
  support: Room[];
}

export interface ShahtaMidMicroStats {
  serviceCells: number;
  microRooms: number;
  hqCompounds: number;
}

export const SHAHTA_HQ_SPECS: readonly ShahtaHqSpec[] = [
  {
    owner: ZoneFaction.LIQUIDATOR,
    key: 'ликвидаторов восточной шахты',
    hall: [842, 430, 94, 7],
    connect: [936, 464],
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    support: [
      { type: RoomType.HQ, name: 'Гермоядро ликвидаторов восточной шахты', x: 870, y: 438, w: 28, h: 14, hermetic: true },
      { type: RoomType.STORAGE, name: 'Оружейный шкаф ликвидаторов шахты', x: 842, y: 414, w: 21, h: 10 },
      { type: RoomType.OFFICE, name: 'Журнал мостовых нарядов', x: 866, y: 414, w: 22, h: 10 },
      { type: RoomType.MEDICAL, name: 'Перевязочная страховочных тросов', x: 902, y: 438, w: 19, h: 10 },
      { type: RoomType.BATHROOM, name: 'Санузел восточного поста', x: 923, y: 438, w: 11, h: 10 },
      { type: RoomType.COMMON, name: 'Общая караула обода', x: 898, y: 414, w: 27, h: 10 },
      { type: RoomType.PRODUCTION, name: 'Мастерская мостовых щитов', x: 842, y: 438, w: 24, h: 12 },
    ],
  },
  {
    owner: ZoneFaction.CITIZEN,
    key: 'граждан ремонтного притвора',
    hall: [122, 274, 94, 7],
    connect: [86, 286],
    wallTex: Tex.PANEL,
    floorTex: Tex.F_LINO,
    support: [
      { type: RoomType.HQ, name: 'Гермоядро граждан ремонтного притвора', x: 150, y: 282, w: 26, h: 13, hermetic: true },
      { type: RoomType.KITCHEN, name: 'Кухня сухого пайка шахты', x: 122, y: 258, w: 22, h: 10 },
      { type: RoomType.BATHROOM, name: 'Санузел гражданского притвора', x: 146, y: 258, w: 12, h: 10 },
      { type: RoomType.STORAGE, name: 'Кладовая семейных касок', x: 180, y: 282, w: 21, h: 10 },
      { type: RoomType.MEDICAL, name: 'Медуголок ремонтных семей', x: 160, y: 258, w: 21, h: 10 },
      { type: RoomType.COMMON, name: 'Общая ожидания безопасного обхода', x: 122, y: 282, w: 24, h: 12 },
    ],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    key: 'ученых тросовой лаборатории',
    hall: [340, 146, 96, 7],
    connect: [512, 150],
    wallTex: Tex.PIPE,
    floorTex: Tex.F_TILE,
    support: [
      { type: RoomType.HQ, name: 'Гермоядро НИИ тросовой лаборатории', x: 370, y: 154, w: 26, h: 13, hermetic: true },
      { type: RoomType.MEDICAL, name: 'Измерительная травм от высоты', x: 340, y: 130, w: 24, h: 10 },
      { type: RoomType.OFFICE, name: 'Кабинет формулы тяги', x: 366, y: 130, w: 22, h: 10 },
      { type: RoomType.PRODUCTION, name: 'Стенд натяжения мостов', x: 400, y: 154, w: 26, h: 12 },
      { type: RoomType.STORAGE, name: 'Архив датчиков провала', x: 390, y: 130, w: 22, h: 10 },
      { type: RoomType.BATHROOM, name: 'Санузел НИИ у обрыва', x: 418, y: 130, w: 12, h: 10 },
    ],
  },
  {
    owner: ZoneFaction.CULTIST,
    key: 'культа нижнего эха',
    hall: [158, 846, 96, 7],
    connect: [150, 874],
    wallTex: Tex.ROTTEN,
    floorTex: Tex.F_CARPET,
    support: [
      { type: RoomType.HQ, name: 'Гермоядро культа нижнего эха', x: 190, y: 854, w: 24, h: 13, hermetic: true },
      { type: RoomType.COMMON, name: 'Тихая комната слушания шахты', x: 158, y: 830, w: 25, h: 10 },
      { type: RoomType.STORAGE, name: 'Кладовая свечей у провала', x: 216, y: 854, w: 20, h: 10 },
      { type: RoomType.KITCHEN, name: 'Кухня черного кипятка', x: 184, y: 830, w: 21, h: 10 },
      { type: RoomType.BATHROOM, name: 'Санузел следа нижнего эха', x: 238, y: 854, w: 12, h: 10 },
      { type: RoomType.SMOKING, name: 'Курилка шепчущей решетки', x: 208, y: 830, w: 24, h: 10 },
    ],
  },
  {
    owner: ZoneFaction.WILD,
    key: 'диких южной клети',
    hall: [708, 846, 96, 7],
    connect: [874, 874],
    wallTex: Tex.DARK,
    floorTex: Tex.F_CONCRETE,
    support: [
      { type: RoomType.HQ, name: 'Гермоядро диких южной клети', x: 738, y: 854, w: 24, h: 13, hermetic: true },
      { type: RoomType.STORAGE, name: 'Разобранная кладовая южной клети', x: 708, y: 830, w: 24, h: 10 },
      { type: RoomType.SMOKING, name: 'Курилка сорванных перил', x: 764, y: 854, w: 20, h: 10 },
      { type: RoomType.COMMON, name: 'Общий угол самозахвата шахты', x: 734, y: 830, w: 25, h: 10 },
      { type: RoomType.KITCHEN, name: 'Печь сухих консервов', x: 782, y: 854, w: 18, h: 10 },
      { type: RoomType.BATHROOM, name: 'Санузел ободранной клети', x: 762, y: 830, w: 12, h: 10 },
    ],
  },
];

export interface ShahtaAtriumBridgeState {
  id: string;
  name: string;
  exposedCells: number;
  coverCells: number;
  repairable: boolean;
  gapCells: number;
}

export interface ShahtaAtriumState {
  routeId: typeof DESIGN_FLOOR_ID;
  z: typeof SHAHTA_ATRIUM_ROUTE_Z;
  voidCells: number;
  ringCells: number;
  bridgeCount: number;
  serviceBypassCells: number;
  outerServiceCells: number;
  microRoomCount: number;
  hqCompoundCount: number;
  coverIslands: number;
  losCoverScore: number;
  repairableBridgeId: string;
  bridges: ShahtaAtriumBridgeState[];
}

export interface ShahtaAtriumGeneration extends FloorGeneration {
  shahtaAtriumState: ShahtaAtriumState;
}

export interface BridgeBuild {
  state: ShahtaAtriumBridgeState;
  cells: number[];
}

