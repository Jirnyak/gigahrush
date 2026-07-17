import {
  DoorState,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';

export const RADON_EXCHANGE_ROUTE_ID = 'radon_exchange' as const;

export const RADON_EXCHANGE_Z = 44 as const;

export const RADON_EXCHANGE_BASE_FLOOR = 30;

export const RADON_EXCHANGE_PROJECTION_KEY = 'key' as const;

export const RADON_EXCHANGE_META = {
  routeId: RADON_EXCHANGE_ROUTE_ID,
  displayName: 'Радоновый обменник',
  z: RADON_EXCHANGE_Z,
  debugEntry: 'generateRadonExchangeDesignFloor()',
} as const;

export const RADON_EXCHANGE_ROOM_NAMES = {
  exchangeHall: 'Радоновый обменный зал',
  zeroRadius: 'Узел нулевого радиуса',
  shutterNorth: 'Северная кассета заслонок',
  shutterEast: 'Восточная кассета заслонок',
  serviceChord: 'Сервисная хорда бетонной проекции',
  projectionKey: 'Комната проекционного ключа',
  blindWedge: 'Слепой клин дозиметристов',
  upLift: 'Верхняя кабина радонового обменника',
  downLift: 'Нижняя кабина радонового обменника',
} as const;

export interface Point {
  x: number;
  y: number;
}

export interface RadonLine {
  angle: number;
  radius: number;
  width: number;
  floorTex: Tex;
}

export interface RadonRooms {
  exchangeHall: Room;
  zeroRadius: Room;
  shutterNorth: Room;
  shutterEast: Room;
  serviceChord: Room;
  projectionKey: Room;
  blindWedge: Room;
  upLift: Room;
  downLift: Room;
}

export interface RadonFactionOutpostSpec {
  owner: TerritoryOwner;
  x: number;
  y: number;
  name: string;
  prefix: string;
  wallTex: Tex;
  floorTex: Tex;
  support: readonly RoomType[];
  hermeticDoor?: DoorState;
  compact?: boolean;
}

export interface RadonTerritoryTarget {
  owner: TerritoryOwner;
  share: number;
}

export interface RadonTerritoryAnchor {
  owner: TerritoryOwner;
  x: number;
  y: number;
  strength: number;
}

export interface RadonExchangeMetrics {
  routeId: typeof RADON_EXCHANGE_ROUTE_ID;
  z: typeof RADON_EXCHANGE_Z;
  scanLineCells: number;
  serviceChordCells: number;
  blindWedgeCells: number;
  shutterDoors: number;
  projectionKeyContainers: number;
  controlRooms: number;
  coverCells: number;
  longestScanRun: number;
  ungatedUpLiftReachable: boolean;
  ungatedDownLiftReachable: boolean;
}

export const CX = W >> 1;

export const CY = W >> 1;

export const EDGE = W - 1;

export const SCAN_FLOOR = Tex.F_MARBLE_TILE;

export const SERVICE_FLOOR = Tex.F_CONCRETE;

export const CONTROL_FLOOR = Tex.F_PARQUET;

export const ADMIN_WALL = Tex.MARBLE;

export const SERVICE_WALL = Tex.METAL;

export const BLIND_WALL = Tex.CONCRETE;

export const DOOR_METAL = Tex.DOOR_METAL;

export const TERRITORY_UNASSIGNED = 255;

export const RADON_LINES: readonly RadonLine[] = [
  { angle: 0, radius: -320, width: 1.25, floorTex: SCAN_FLOOR },
  { angle: 0, radius: -160, width: 1.6, floorTex: SCAN_FLOOR },
  { angle: 0, radius: 0, width: 2.2, floorTex: SCAN_FLOOR },
  { angle: 0, radius: 160, width: 1.6, floorTex: SCAN_FLOOR },
  { angle: 0, radius: 320, width: 1.25, floorTex: SCAN_FLOOR },
  { angle: Math.PI / 2, radius: -288, width: 1.25, floorTex: SCAN_FLOOR },
  { angle: Math.PI / 2, radius: -96, width: 1.5, floorTex: SCAN_FLOOR },
  { angle: Math.PI / 2, radius: 96, width: 1.5, floorTex: SCAN_FLOOR },
  { angle: Math.PI / 2, radius: 288, width: 1.25, floorTex: SCAN_FLOOR },
  { angle: Math.PI / 4, radius: -250, width: 1.2, floorTex: SCAN_FLOOR },
  { angle: Math.PI / 4, radius: 0, width: 1.7, floorTex: SCAN_FLOOR },
  { angle: Math.PI / 4, radius: 250, width: 1.2, floorTex: SCAN_FLOOR },
  { angle: -Math.PI / 4, radius: -250, width: 1.2, floorTex: SCAN_FLOOR },
  { angle: -Math.PI / 4, radius: 0, width: 1.7, floorTex: SCAN_FLOOR },
  { angle: -Math.PI / 4, radius: 250, width: 1.2, floorTex: SCAN_FLOOR },
];

export const CONTROL_POINTS: readonly Point[] = [
  { x: 512, y: 512 },
  { x: 352, y: 416 },
  { x: 672, y: 416 },
  { x: 352, y: 608 },
  { x: 672, y: 608 },
  { x: 224, y: 512 },
  { x: 800, y: 512 },
  { x: 512, y: 224 },
  { x: 512, y: 800 },
];

export const SHUTTER_DOORS: readonly { x: number; y: number; axis: 'horizontal' | 'vertical'; state: DoorState; keyId: string }[] = [
  { x: 512, y: 348, axis: 'vertical', state: DoorState.HERMETIC_OPEN, keyId: '' },
  { x: 512, y: 380, axis: 'vertical', state: DoorState.HERMETIC_CLOSED, keyId: '' },
  { x: 512, y: 644, axis: 'vertical', state: DoorState.HERMETIC_OPEN, keyId: '' },
  { x: 512, y: 676, axis: 'vertical', state: DoorState.HERMETIC_CLOSED, keyId: RADON_EXCHANGE_PROJECTION_KEY },
  { x: 348, y: 512, axis: 'horizontal', state: DoorState.HERMETIC_CLOSED, keyId: '' },
  { x: 380, y: 512, axis: 'horizontal', state: DoorState.HERMETIC_OPEN, keyId: '' },
  { x: 644, y: 512, axis: 'horizontal', state: DoorState.HERMETIC_CLOSED, keyId: RADON_EXCHANGE_PROJECTION_KEY },
  { x: 676, y: 512, axis: 'horizontal', state: DoorState.HERMETIC_OPEN, keyId: '' },
  { x: 400, y: 624, axis: 'horizontal', state: DoorState.CLOSED, keyId: '' },
  { x: 624, y: 400, axis: 'vertical', state: DoorState.CLOSED, keyId: '' },
];

export const RADON_TERRITORY_TARGETS: readonly RadonTerritoryTarget[] = [
  { owner: ZoneFaction.CITIZEN, share: 0.16 },
  { owner: ZoneFaction.LIQUIDATOR, share: 0.36 },
  { owner: ZoneFaction.CULTIST, share: 0.10 },
  { owner: ZoneFaction.SCIENTIST, share: 0.26 },
  { owner: ZoneFaction.WILD, share: 0.12 },
];

export const RADON_FACTION_OUTPOSTS: readonly RadonFactionOutpostSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    x: 132,
    y: 122,
    name: 'Гражданский гермопункт дозиметрической очереди',
    prefix: 'Гражданский дозиметрический пункт',
    wallTex: Tex.PANEL,
    floorTex: Tex.F_LINO,
    support: [RoomType.KITCHEN, RoomType.BATHROOM, RoomType.STORAGE, RoomType.MEDICAL],
    hermeticDoor: DoorState.HERMETIC_OPEN,
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    x: 450,
    y: 292,
    name: 'Ликвидаторский гермопост северных створок',
    prefix: 'Северный пост створок',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_CONCRETE,
    support: [RoomType.STORAGE, RoomType.PRODUCTION, RoomType.MEDICAL, RoomType.KITCHEN, RoomType.OFFICE],
    hermeticDoor: DoorState.HERMETIC_OPEN,
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    x: 760,
    y: 452,
    name: 'Ликвидаторская будка восточной отсечки',
    prefix: 'Восточная отсечка ликвидаторов',
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    support: [RoomType.STORAGE, RoomType.PRODUCTION, RoomType.BATHROOM],
    hermeticDoor: DoorState.HERMETIC_CLOSED,
    compact: true,
  },
  {
    owner: ZoneFaction.SCIENTIST,
    x: 702,
    y: 246,
    name: 'НИИ-гермокор измерения радона',
    prefix: 'НИИ радоновой проекции',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_TILE,
    support: [RoomType.MEDICAL, RoomType.PRODUCTION, RoomType.OFFICE, RoomType.STORAGE, RoomType.BATHROOM],
    hermeticDoor: DoorState.HERMETIC_OPEN,
  },
  {
    owner: ZoneFaction.CULTIST,
    x: 764,
    y: 760,
    name: 'Скрытый культовый гермоузел слепого клина',
    prefix: 'Слепой культовый узел',
    wallTex: Tex.MEAT,
    floorTex: Tex.F_GUT,
    support: [RoomType.STORAGE, RoomType.SMOKING, RoomType.KITCHEN],
    hermeticDoor: DoorState.HERMETIC_CLOSED,
    compact: true,
  },
  {
    owner: ZoneFaction.WILD,
    x: 214,
    y: 694,
    name: 'Дикий гермокарман сервисной хорды',
    prefix: 'Дикий сервисный карман',
    wallTex: Tex.BRICK,
    floorTex: Tex.F_CONCRETE,
    support: [RoomType.STORAGE, RoomType.KITCHEN, RoomType.BATHROOM, RoomType.SMOKING],
    hermeticDoor: DoorState.HERMETIC_CLOSED,
    compact: true,
  },
];

