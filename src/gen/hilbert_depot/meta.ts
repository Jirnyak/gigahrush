import {
  RoomType,
  ZoneFaction,
  type TerritoryOwner,
} from '../../core/types';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_FLOOR_ID = 'hilbert_depot' as const;

export const HILBERT_DEPOT_ROUTE_Z = -30;

export const HILBERT_DEPOT_BASE_FLOOR = 140;

export const HILBERT_DEPOT_CARGO_TAG = 'hilbert_depot_indexed_cargo';

export const HILBERT_DEPOT_CHORD_TAG = 'hilbert_depot_locked_chord';

export const CURVE_ORDER = 4;

export const CURVE_STEP = 34;

export const CURVE_X = 256;

export const CURVE_Y = 256;

export const CONTENT_TAG = 'hilbert_depot';

export const SAFE_AISLE_RADIUS = 1;

export const BAY_FIRST_INDEX = 8;

export const BAY_INDEX_STEP = 8;

export const ROUTE_GRAPH_ORDER = 5;

export const ROUTE_GRAPH_X = 32;

export const ROUTE_GRAPH_Y = 32;

export const ROUTE_GRAPH_STEP = 30;

export const BLOCK_GRAPH_ORDER = 3;

export const BLOCK_GRAPH_X = 92;

export const BLOCK_GRAPH_Y = 108;

export const BLOCK_GRAPH_STEP = 112;

export interface Point {
  x: number;
  y: number;
}

export interface DepotHqSpec {
  owner: TerritoryOwner;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  support: readonly DepotSupportSpec[];
}

export interface DepotSupportSpec {
  type: RoomType;
  name: string;
  dx: number;
  dy: number;
  w: number;
  h: number;
}

export const DEPOT_OWNER_SEQUENCE: readonly TerritoryOwner[] = [
  ZoneFaction.LIQUIDATOR,
  ZoneFaction.SCIENTIST,
  ZoneFaction.CITIZEN,
  ZoneFaction.WILD,
  ZoneFaction.LIQUIDATOR,
  ZoneFaction.CULTIST,
  ZoneFaction.SCIENTIST,
  ZoneFaction.LIQUIDATOR,
];

export const DEPOT_HQ_SPECS: readonly DepotHqSpec[] = [
  {
    owner: ZoneFaction.LIQUIDATOR,
    name: 'Склад Гильберта: главный гермопост ликвидаторов',
    x: 716,
    y: 176,
    w: 34,
    h: 18,
    support: [
      { type: RoomType.STORAGE, name: 'оружейная ячейка', dx: -30, dy: -18, w: 24, h: 12 },
      { type: RoomType.OFFICE, name: 'журнал коротких хорд', dx: 40, dy: -16, w: 24, h: 12 },
      { type: RoomType.KITCHEN, name: 'пункт сухпайка', dx: -28, dy: 28, w: 24, h: 12 },
      { type: RoomType.MEDICAL, name: 'перевязочная учета', dx: 42, dy: 26, w: 22, h: 12 },
      { type: RoomType.COMMON, name: 'караульный предбанник', dx: 6, dy: 32, w: 26, h: 12 },
    ],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    name: 'Склад Гильберта: НИИ узла нумерации',
    x: 164,
    y: 188,
    w: 30,
    h: 16,
    support: [
      { type: RoomType.OFFICE, name: 'кабинет индекса', dx: -28, dy: -16, w: 22, h: 11 },
      { type: RoomType.MEDICAL, name: 'измерительная', dx: 34, dy: -16, w: 22, h: 11 },
      { type: RoomType.STORAGE, name: 'архив этикеток', dx: -28, dy: 26, w: 22, h: 11 },
      { type: RoomType.PRODUCTION, name: 'стол калибровки', dx: 34, dy: 24, w: 24, h: 12 },
      { type: RoomType.BATHROOM, name: 'санпропускник НИИ', dx: 4, dy: 30, w: 20, h: 10 },
    ],
  },
  {
    owner: ZoneFaction.CITIZEN,
    name: 'Склад Гильберта: гражданская приемка паек',
    x: 168,
    y: 710,
    w: 30,
    h: 16,
    support: [
      { type: RoomType.KITCHEN, name: 'кухня талонов', dx: -30, dy: -16, w: 24, h: 12 },
      { type: RoomType.COMMON, name: 'комната очереди', dx: 34, dy: -16, w: 24, h: 12 },
      { type: RoomType.STORAGE, name: 'общая кладовая', dx: -30, dy: 26, w: 24, h: 12 },
      { type: RoomType.MEDICAL, name: 'медугол очереди', dx: 36, dy: 24, w: 22, h: 11 },
      { type: RoomType.BATHROOM, name: 'санузел приемки', dx: 4, dy: 30, w: 20, h: 10 },
    ],
  },
  {
    owner: ZoneFaction.WILD,
    name: 'Склад Гильберта: разбитый гермокор диких',
    x: 746,
    y: 790,
    w: 28,
    h: 15,
    support: [
      { type: RoomType.STORAGE, name: 'разобранная кладовая', dx: -30, dy: -16, w: 24, h: 12 },
      { type: RoomType.SMOKING, name: 'курилка самозахвата', dx: 34, dy: -16, w: 22, h: 11 },
      { type: RoomType.COMMON, name: 'общий угол', dx: -28, dy: 24, w: 24, h: 12 },
      { type: RoomType.KITCHEN, name: 'плитка на ящике', dx: 34, dy: 24, w: 22, h: 11 },
      { type: RoomType.BATHROOM, name: 'сорванный санузел', dx: 2, dy: 28, w: 20, h: 10 },
    ],
  },
  {
    owner: ZoneFaction.CULTIST,
    name: 'Склад Гильберта: скрытая культовая ячейка',
    x: 376,
    y: 858,
    w: 28,
    h: 15,
    support: [
      { type: RoomType.COMMON, name: 'тихая комната следа', dx: -30, dy: -16, w: 24, h: 12 },
      { type: RoomType.STORAGE, name: 'кладовая свечей', dx: 34, dy: -16, w: 22, h: 11 },
      { type: RoomType.KITCHEN, name: 'ритуальный кипяток', dx: -28, dy: 24, w: 22, h: 11 },
      { type: RoomType.OFFICE, name: 'лист чужих номеров', dx: 34, dy: 24, w: 22, h: 11 },
      { type: RoomType.BATHROOM, name: 'мойка хорд', dx: 2, dy: 28, w: 20, h: 10 },
    ],
  },
];

export interface HilbertDepotChordState {
  fromIndex: number;
  toIndex: number;
  doorCells: number[];
}

export interface HilbertDepotState {
  routeId: typeof DESIGN_FLOOR_ID;
  anchorZ: typeof HILBERT_DEPOT_ROUTE_Z;
  curveOrder: typeof CURVE_ORDER;
  curvePointCount: number;
  cargoContainerIds: number[];
  cargoOrders: number[];
  lockedChordDoorCells: number[];
  chords: HilbertDepotChordState[];
  debugEntry: {
    spawnX: number;
    spawnY: number;
    summary: string;
  };
}

export interface HilbertDepotGeneration extends FloorGeneration {
  hilbertState: HilbertDepotState;
}

