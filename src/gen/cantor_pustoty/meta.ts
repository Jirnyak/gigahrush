import {
  RoomType,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';

export const CANTOR_PUSTOTY_ROUTE_ID = 'cantor_pustoty' as const;

export const CANTOR_PUSTOTY_Z = -44 as const;

export const CANTOR_PUSTOTY_BASE_FLOOR = 200;

export const CANTOR_PUSTOTY_ROOM_NAMES = {
  entry: 'Кантор пустоты: входной остров досок',
  repair: 'Кантор пустоты: ремонтная полка мостов',
  dust: 'Кантор пустоты: пыльный остров тайника',
  hidden: 'Кантор пустоты: остров без обратного шага',
  upLift: 'Кантор пустоты: верхняя пустотная кабина',
  downLift: 'Кантор пустоты: нижняя пустотная кабина',
} as const;

export interface CantorPustotyMetrics {
  routeId: typeof CANTOR_PUSTOTY_ROUTE_ID;
  z: typeof CANTOR_PUSTOTY_Z;
  recursionDepth: number;
  proxyOpenCells: number;
  componentCountBeforeBridge: number;
  largestComponentBeforeBridge: number;
  bridgedComponents: number;
  bridgeProxyCells: number;
  stashIslandCount: number;
  reachableStashContainers: number;
  abyssCells: number;
  ungatedUpLiftReachable: boolean;
  ungatedDownLiftReachable: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface ProxyComponentGraph {
  label: Int16Array;
  sizes: number[];
  samples: number[][];
  largestId: number;
}

export interface CantorBuild {
  mask: Uint8Array;
  bridgeCells: number;
  bridgedComponents: number;
  componentCountBeforeBridge: number;
  largestComponentBeforeBridge: number;
  proxyOpenCells: number;
}

export interface CantorRooms {
  entry: Room;
  repair: Room;
  dust: Room;
  hidden: Room;
  upLift: Room;
  downLift: Room;
}

export interface CantorHqSpec {
  owner: TerritoryOwner;
  point: Point;
  name: string;
  supportPrefix: string;
  supportTypes: readonly [RoomType, RoomType, RoomType, RoomType];
}

export const PROXY_SIZE = 81;

export const PROXY_TILE = 12;

export const PROXY_ORIGIN = 26;

export const RECURSION_DEPTH = 4;

export const CENTER_PROXY = 40;

export const GAP = 0;

export const ISLAND = 1;

export const BRIDGE = 2;

export const ANCHOR = 3;

export const STASH = 4;

export const ENTRY_PROXY: Point = { x: CENTER_PROXY, y: CENTER_PROXY };

export const UP_PROXY: Point = { x: 13, y: 13 };

export const DOWN_PROXY: Point = { x: 67, y: 67 };

export const REPAIR_PROXY: Point = { x: 13, y: 67 };

export const DUST_PROXY: Point = { x: 67, y: 13 };

export const HIDDEN_PROXY: Point = { x: 40, y: 8 };

export const CANTOR_HQ_SPECS: readonly CantorHqSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    point: { x: 35, y: 43 },
    name: 'Кантор пустоты: гражданский штаб счетчиков шага',
    supportPrefix: 'гражданской полки',
    supportTypes: [RoomType.KITCHEN, RoomType.STORAGE, RoomType.MEDICAL, RoomType.COMMON],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    point: { x: 18, y: 18 },
    name: 'Кантор пустоты: пост ликвидаторов на верхней скобе',
    supportPrefix: 'ликвидаторской скобы',
    supportTypes: [RoomType.STORAGE, RoomType.OFFICE, RoomType.MEDICAL, RoomType.BATHROOM],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    point: { x: 62, y: 20 },
    name: 'Кантор пустоты: НИИ пыльной меры',
    supportPrefix: 'НИИ пыльной меры',
    supportTypes: [RoomType.OFFICE, RoomType.MEDICAL, RoomType.PRODUCTION, RoomType.STORAGE],
  },
  {
    owner: ZoneFaction.CULTIST,
    point: { x: 40, y: 16 },
    name: 'Кантор пустоты: культовый штаб разрыва',
    supportPrefix: 'культового разрыва',
    supportTypes: [RoomType.COMMON, RoomType.STORAGE, RoomType.KITCHEN, RoomType.SMOKING],
  },
  {
    owner: ZoneFaction.WILD,
    point: { x: 61, y: 62 },
    name: 'Кантор пустоты: дикий штаб обратной лестницы',
    supportPrefix: 'дикой лестницы',
    supportTypes: [RoomType.STORAGE, RoomType.SMOKING, RoomType.COMMON, RoomType.KITCHEN],
  },
];

export const CANTOR_MID_PROXIES: readonly Point[] = [
  { x: 23, y: 23 }, { x: 57, y: 23 }, { x: 23, y: 57 }, { x: 57, y: 57 },
  { x: 40, y: 23 }, { x: 23, y: 40 }, { x: 57, y: 40 }, { x: 40, y: 57 },
  { x: 8, y: 40 }, { x: 72, y: 40 }, { x: 40, y: 72 },
  { x: 18, y: 62 }, { x: 62, y: 18 }, { x: 32, y: 66 }, { x: 66, y: 32 },
  { x: 50, y: 50 }, { x: 30, y: 30 },
];

export const CANTOR_METRICS = new WeakMap<World, Omit<CantorPustotyMetrics, 'reachableStashContainers' | 'abyssCells' | 'ungatedUpLiftReachable' | 'ungatedDownLiftReachable'>>();

