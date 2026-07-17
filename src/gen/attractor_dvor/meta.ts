import {
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';

export const ATTRACTOR_DVOR_ROUTE_ID = 'attractor_dvor' as const;

export const ATTRACTOR_DVOR_Z = -34;

export const ATTRACTOR_DVOR_BASE_FLOOR = 140;

export const CX = W >> 1;

export const CY = W >> 1;

export const FLOW_FLOOR = Tex.F_CONCRETE;

export const DEAD_FLOOR = Tex.F_WATER;

export const ATTRACTOR_DVOR_ROOM_DEF_IDS = {
  entry: 'Аттракторный двор: приемка потока',
  northSpine: 'Аттракторный двор: северная тензорная спина',
  eastSpine: 'Аттракторный двор: восточная тензорная спина',
  southSpine: 'Аттракторный двор: южная тензорная спина',
  westSpine: 'Аттракторный двор: западная тензорная спина',
  pumpCore: 'Аттракторный двор: насосный центр',
  deadZone: 'Аттракторный двор: мертвая зона',
  guardLoop: 'Аттракторный двор: пост предельной петли',
  westSwitch: 'Аттракторный двор: параметр западной струи',
  eastSwitch: 'Аттракторный двор: параметр восточной струи',
  northSwitch: 'Аттракторный двор: параметр верхнего вихря',
  transitCache: 'Аттракторный двор: ящик обходного течения',
} as const;

export type DoorSide = 'north' | 'south' | 'west' | 'east';

export type FlowId = 'main_stream' | 'return_stream' | 'dead_cut';

export interface Point {
  x: number;
  y: number;
}

export interface DoorSite {
  x: number;
  y: number;
  ox: number;
  oy: number;
}

export interface AttractorHqSupportSpec {
  type: RoomType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  doorSide: DoorSide;
  targetX: number;
  targetY: number;
}

export interface AttractorHqSpec {
  owner: TerritoryOwner;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  doorSide: DoorSide;
  targetX: number;
  targetY: number;
  supports: readonly AttractorHqSupportSpec[];
}

export interface AttractorStationSpec {
  x: number;
  y: number;
  owner: TerritoryOwner;
  vertical?: boolean;
  label: string;
}

export interface AttractorRooms {
  entry: Room;
  northSpine: Room;
  eastSpine: Room;
  southSpine: Room;
  westSpine: Room;
  pumpCore: Room;
  deadZone: Room;
  guardLoop: Room;
  westSwitch: Room;
  eastSwitch: Room;
  northSwitch: Room;
  transitCache: Room;
}

export interface AttractorStreamline {
  id: FlowId;
  label: string;
  points: readonly Point[];
  cellCount: number;
  risk: 1 | 2 | 3 | 4 | 5;
}

export interface AttractorSwitchPanel {
  id: string;
  roomDefId: string;
  panelDefId: 'panel_doors' | 'panel_vent' | 'panel_power';
  x: number;
  y: number;
  parameter: 'curl' | 'damping' | 'phase';
}

export interface AttractorPatrolLoop {
  id: string;
  roomDefIds: readonly string[];
  guardCount: number;
  predictionHint: string;
}

export interface AttractorDvorState {
  routeId: typeof ATTRACTOR_DVOR_ROUTE_ID;
  z: typeof ATTRACTOR_DVOR_Z;
  streamlines: readonly AttractorStreamline[];
  switchPanels: readonly AttractorSwitchPanel[];
  patrolLoops: readonly AttractorPatrolLoop[];
  deadZoneRoomName: string;
  debugEntry: {
    spawnX: number;
    spawnY: number;
    summary: string;
  };
}

export const FLOW_SPECS: readonly Omit<AttractorStreamline, 'cellCount'>[] = [
  {
    id: 'main_stream',
    label: 'синяя струя быстрого двора',
    risk: 2,
    points: [
      { x: CX, y: 766 }, { x: 423, y: 700 }, { x: 352, y: 612 },
      { x: 358, y: 472 }, { x: 426, y: 376 }, { x: CX, y: 348 },
      { x: 650, y: 390 }, { x: 714, y: CY }, { x: 650, y: 646 },
      { x: CX, y: 666 },
    ],
  },
  {
    id: 'return_stream',
    label: 'желтая возвратная струя патруля',
    risk: 3,
    points: [
      { x: 338, y: CY }, { x: 408, y: 430 }, { x: 514, y: 398 },
      { x: 624, y: 432 }, { x: 692, y: CY }, { x: 620, y: 612 },
      { x: 510, y: 626 }, { x: 408, y: 596 }, { x: 338, y: CY },
    ],
  },
  {
    id: 'dead_cut',
    label: 'сухой рез через мертвую зону',
    risk: 5,
    points: [
      { x: CX, y: 684 }, { x: CX - 10, y: 620 }, { x: CX + 12, y: 584 },
      { x: CX - 8, y: 536 }, { x: CX + 10, y: 474 }, { x: CX, y: 392 },
    ],
  },
];

export const ATTRACTOR_HQ_COMPOUNDS: readonly AttractorHqSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    name: 'Аттракторный двор: гражданский штаб расходной очереди',
    x: 142,
    y: 168,
    w: 38,
    h: 22,
    doorSide: 'east',
    targetX: 214,
    targetY: 180,
    supports: [
      { type: RoomType.KITCHEN, name: 'Аттракторный двор: кухня расходной очереди', x: 112, y: 170, w: 20, h: 14, doorSide: 'east', targetX: 214, targetY: 180 },
      { type: RoomType.COMMON, name: 'Аттракторный двор: комната старших потока', x: 145, y: 198, w: 34, h: 16, doorSide: 'north', targetX: 214, targetY: 180 },
      { type: RoomType.STORAGE, name: 'Аттракторный двор: склад общих прокладок', x: 188, y: 168, w: 22, h: 14, doorSide: 'west', targetX: 214, targetY: 180 },
      { type: RoomType.MEDICAL, name: 'Аттракторный двор: медпункт слабого напора', x: 146, y: 140, w: 24, h: 14, doorSide: 'south', targetX: 214, targetY: 180 },
    ],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    name: 'Аттракторный двор: главный ликвидаторский штаб петли',
    x: 778,
    y: 144,
    w: 48,
    h: 28,
    doorSide: 'south',
    targetX: 802,
    targetY: 206,
    supports: [
      { type: RoomType.STORAGE, name: 'Аттракторный двор: оружейная быстрой струи', x: 744, y: 150, w: 24, h: 16, doorSide: 'east', targetX: 802, targetY: 206 },
      { type: RoomType.OFFICE, name: 'Аттракторный двор: журнал петлевой охраны', x: 834, y: 150, w: 28, h: 16, doorSide: 'west', targetX: 802, targetY: 206 },
      { type: RoomType.MEDICAL, name: 'Аттракторный двор: санитарный шлюз ликвидаторов', x: 782, y: 108, w: 30, h: 16, doorSide: 'south', targetX: 802, targetY: 206 },
      { type: RoomType.KITCHEN, name: 'Аттракторный двор: полевая кухня петли', x: 782, y: 184, w: 32, h: 16, doorSide: 'north', targetX: 802, targetY: 206 },
    ],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    name: 'Аттракторный двор: НИИ-штаб фазовой решетки',
    x: 476,
    y: 112,
    w: 44,
    h: 26,
    doorSide: 'south',
    targetX: 512,
    targetY: 166,
    supports: [
      { type: RoomType.OFFICE, name: 'Аттракторный двор: кабинет фазовых протоколов', x: 430, y: 116, w: 30, h: 16, doorSide: 'east', targetX: 512, targetY: 166 },
      { type: RoomType.STORAGE, name: 'Аттракторный двор: архив датчиков притяжения', x: 530, y: 116, w: 28, h: 16, doorSide: 'west', targetX: 512, targetY: 166 },
      { type: RoomType.MEDICAL, name: 'Аттракторный двор: измерительная медкомната', x: 478, y: 76, w: 30, h: 16, doorSide: 'south', targetX: 512, targetY: 166 },
      { type: RoomType.PRODUCTION, name: 'Аттракторный двор: стенд сухого вихря', x: 482, y: 150, w: 34, h: 18, doorSide: 'north', targetX: 512, targetY: 166 },
    ],
  },
  {
    owner: ZoneFaction.CULTIST,
    name: 'Аттракторный двор: скрытый культовый штаб обратной струи',
    x: 182,
    y: 792,
    w: 34,
    h: 22,
    doorSide: 'east',
    targetX: 236,
    targetY: 804,
    supports: [
      { type: RoomType.COMMON, name: 'Аттракторный двор: тихая комната кругового следа', x: 142, y: 790, w: 26, h: 16, doorSide: 'east', targetX: 236, targetY: 804 },
      { type: RoomType.STORAGE, name: 'Аттракторный двор: кладовая свечей потока', x: 226, y: 790, w: 24, h: 16, doorSide: 'west', targetX: 236, targetY: 804 },
      { type: RoomType.KITCHEN, name: 'Аттракторный двор: кухня ритуального кипятка', x: 182, y: 824, w: 26, h: 16, doorSide: 'north', targetX: 236, targetY: 804 },
      { type: RoomType.BATHROOM, name: 'Аттракторный двор: мокрый предбанник обратной струи', x: 184, y: 756, w: 24, h: 16, doorSide: 'south', targetX: 236, targetY: 804 },
    ],
  },
  {
    owner: ZoneFaction.WILD,
    name: 'Аттракторный двор: дикий штаб сухого кармана',
    x: 796,
    y: 812,
    w: 42,
    h: 24,
    doorSide: 'west',
    targetX: 760,
    targetY: 824,
    supports: [
      { type: RoomType.STORAGE, name: 'Аттракторный двор: разобранная кладовая диких', x: 848, y: 814, w: 28, h: 16, doorSide: 'west', targetX: 760, targetY: 824 },
      { type: RoomType.SMOKING, name: 'Аттракторный двор: курилка самозахвата', x: 760, y: 850, w: 28, h: 16, doorSide: 'north', targetX: 760, targetY: 824 },
      { type: RoomType.COMMON, name: 'Аттракторный двор: общий угол сухого кармана', x: 756, y: 786, w: 30, h: 16, doorSide: 'south', targetX: 760, targetY: 824 },
      { type: RoomType.BATHROOM, name: 'Аттракторный двор: сломанный душ сухого кармана', x: 842, y: 790, w: 24, h: 16, doorSide: 'west', targetX: 760, targetY: 824 },
    ],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    name: 'Аттракторный двор: ликвидаторский форпост восточного завихрения',
    x: 884,
    y: 454,
    w: 36,
    h: 20,
    doorSide: 'west',
    targetX: 842,
    targetY: 466,
    supports: [
      { type: RoomType.STORAGE, name: 'Аттракторный двор: шкаф восточного форпоста', x: 928, y: 454, w: 22, h: 14, doorSide: 'west', targetX: 842, targetY: 466 },
      { type: RoomType.OFFICE, name: 'Аттракторный двор: стол восточного дозора', x: 884, y: 486, w: 28, h: 14, doorSide: 'north', targetX: 842, targetY: 466 },
    ],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    name: 'Аттракторный двор: ликвидаторский форпост нижней петли',
    x: 454,
    y: 846,
    w: 38,
    h: 20,
    doorSide: 'north',
    targetX: 480,
    targetY: 810,
    supports: [
      { type: RoomType.STORAGE, name: 'Аттракторный двор: шкаф нижнего форпоста', x: 410, y: 846, w: 24, h: 14, doorSide: 'east', targetX: 480, targetY: 810 },
      { type: RoomType.MEDICAL, name: 'Аттракторный двор: перевязочный угол нижней петли', x: 500, y: 846, w: 26, h: 14, doorSide: 'west', targetX: 480, targetY: 810 },
    ],
  },
];

export const ATTRACTOR_STATIONS: readonly AttractorStationSpec[] = [
  { x: 118, y: 118, owner: ZoneFaction.CITIZEN, label: 'северо-западный расход' },
  { x: 314, y: 126, owner: ZoneFaction.LIQUIDATOR, label: 'северный затвор' },
  { x: 626, y: 126, owner: ZoneFaction.SCIENTIST, label: 'северная фазовая полка' },
  { x: 904, y: 122, owner: ZoneFaction.LIQUIDATOR, label: 'северо-восточный пост' },
  { x: 126, y: 334, owner: ZoneFaction.WILD, vertical: true, label: 'левая дальняя струя' },
  { x: 300, y: 304, owner: ZoneFaction.CITIZEN, label: 'пункт выдачи сухих талонов' },
  { x: 726, y: 306, owner: ZoneFaction.SCIENTIST, label: 'стенд бокового сдвига' },
  { x: 904, y: 344, owner: ZoneFaction.LIQUIDATOR, vertical: true, label: 'правый патрульный крюк' },
  { x: 118, y: 522, owner: ZoneFaction.CULTIST, vertical: true, label: 'серая обратная щель' },
  { x: 260, y: 524, owner: ZoneFaction.WILD, label: 'дикий разборный остров' },
  { x: 764, y: 520, owner: ZoneFaction.LIQUIDATOR, label: 'узел внешней петли' },
  { x: 910, y: 526, owner: ZoneFaction.WILD, vertical: true, label: 'правый сухой карман' },
  { x: 128, y: 708, owner: ZoneFaction.CULTIST, label: 'нижний след струи' },
  { x: 330, y: 736, owner: ZoneFaction.WILD, label: 'паечная свалка' },
  { x: 530, y: 748, owner: ZoneFaction.LIQUIDATOR, label: 'нижний пульт напора' },
  { x: 720, y: 730, owner: ZoneFaction.SCIENTIST, label: 'сухая лаборатория завихрения' },
  { x: 904, y: 730, owner: ZoneFaction.WILD, label: 'крайний самозахват' },
  { x: 126, y: 910, owner: ZoneFaction.CULTIST, label: 'нижняя скрытая петля' },
  { x: 332, y: 900, owner: ZoneFaction.CITIZEN, label: 'нижний жилой остров' },
  { x: 520, y: 908, owner: ZoneFaction.WILD, label: 'разгрузка сухих труб' },
  { x: 710, y: 896, owner: ZoneFaction.LIQUIDATOR, label: 'нижний ликвидаторский проход' },
  { x: 910, y: 904, owner: ZoneFaction.WILD, label: 'юго-восточный сухой двор' },
];

