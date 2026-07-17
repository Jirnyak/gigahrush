import {
  Faction,
  Occupation,
  RoomType,
  Tex,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { hashSeed } from '../../core/rand';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('hyperbolic_switchyard');

export const HYPERBOLIC_SWITCHYARD_DESIGN_FLOOR_ID = 'hyperbolic_switchyard' as const;

export const HYPERBOLIC_SWITCHYARD_ROUTE_Z = -20;

export const HYPERBOLIC_SWITCHYARD_BASE_FLOOR = 140;

export const HYPERBOLIC_SWITCHYARD_ROOM_NAMES = {
  shortcut: 'Геодезическая служебная кишка',
} as const;

export const SEED = hashSeed(HYPERBOLIC_SWITCHYARD_DESIGN_FLOOR_ID);

export const GUIDE_NPC_ID = 'hyperbolic_switchyard_guide_zinaida';

export type SwitchyardArcFamily = 'blue' | 'red';

export type SwitchyardDecisionId = 'pay_guide' | 'switch_family' | 'geodesic_shortcut' | 'sabotage_false_platform';

export interface SwitchyardArcSummary {
  id: string;
  family: SwitchyardArcFamily;
  cellCount: number;
  platformRoomId: number;
  shortcut: boolean;
}

export interface SwitchyardPlatformSummary {
  id: string;
  roomId: number;
  name: string;
  x: number;
  y: number;
  falsePlatform?: boolean;
}

export interface HyperbolicSwitchyardState {
  routeId: typeof HYPERBOLIC_SWITCHYARD_DESIGN_FLOOR_ID;
  z: typeof HYPERBOLIC_SWITCHYARD_ROUTE_Z;
  arcs: SwitchyardArcSummary[];
  platforms: SwitchyardPlatformSummary[];
  decisionIds: SwitchyardDecisionId[];
  panelCells: number[];
  guideNpcId: typeof GUIDE_NPC_ID;
  shortcutMonsterCells: number[];
  debugEntry: {
    spawnX: number;
    spawnY: number;
    summary: string;
  };
}

export interface HyperbolicSwitchyardGeneration extends FloorGeneration {
  switchyardState: HyperbolicSwitchyardState;
}

export interface ArcSpec {
  id: string;
  family: SwitchyardArcFamily;
  cx: number;
  cy: number;
  radius: number;
  start: number;
  end: number;
  width: number;
  tex: Tex;
  platform: keyof SwitchyardRooms;
  shortcut?: boolean;
}

export interface SwitchyardRooms {
  guide: Room;
  central: Room;
  north: Room;
  south: Room;
  west: Room;
  east: Room;
  blueSwitch: Room;
  redSwitch: Room;
  shortcut: Room;
  falsePlatform: Room;
}

export type SwitchyardDoorSide = 'north' | 'south' | 'west' | 'east';

export interface SwitchyardServiceBlockSpec {
  owner: TerritoryOwner;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: RoomType;
  wallTex: Tex;
  floorTex: Tex;
  micro: number;
}

export interface SwitchyardHqSpec {
  owner: TerritoryOwner;
  title: string;
  x: number;
  y: number;
  wallTex: Tex;
  floorTex: Tex;
  supportWallTex: Tex;
  supportFloorTex: Tex;
  strong?: boolean;
}

export const SWITCHYARD_SERVICE_BLOCKS: readonly SwitchyardServiceBlockSpec[] = [
  { owner: ZoneFaction.CITIZEN, name: 'Очередь к северо-западной стрелке', x: 84, y: 166, w: 88, h: 44, type: RoomType.COMMON, wallTex: Tex.PANEL, floorTex: Tex.F_LINO, micro: 24 },
  { owner: ZoneFaction.SCIENTIST, name: 'Архив кривизны северной дуги', x: 250, y: 126, w: 92, h: 42, type: RoomType.OFFICE, wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET, micro: 22 },
  { owner: ZoneFaction.LIQUIDATOR, name: 'Пост обстрела верхнего семейства', x: 590, y: 126, w: 92, h: 42, type: RoomType.PRODUCTION, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, micro: 24 },
  { owner: ZoneFaction.LIQUIDATOR, name: 'Склад стрелочных заслонок', x: 780, y: 166, w: 92, h: 44, type: RoomType.STORAGE, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE, micro: 24 },
  { owner: ZoneFaction.WILD, name: 'Разобранный западный двор рельс', x: 74, y: 372, w: 96, h: 52, type: RoomType.COMMON, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, micro: 28 },
  { owner: ZoneFaction.CITIZEN, name: 'Бытовой остров ложной платформы', x: 230, y: 322, w: 90, h: 46, type: RoomType.KITCHEN, wallTex: Tex.PANEL, floorTex: Tex.F_TILE, micro: 24 },
  { owner: ZoneFaction.SCIENTIST, name: 'Измерительный остров красной хорды', x: 724, y: 322, w: 90, h: 46, type: RoomType.PRODUCTION, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, micro: 24 },
  { owner: ZoneFaction.WILD, name: 'Восточный двор неправильных путей', x: 858, y: 374, w: 96, h: 52, type: RoomType.STORAGE, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, micro: 28 },
  { owner: ZoneFaction.CULTIST, name: 'Нижний след двойной стрелки', x: 86, y: 598, w: 92, h: 48, type: RoomType.COMMON, wallTex: Tex.MEAT, floorTex: Tex.F_MEAT, micro: 24 },
  { owner: ZoneFaction.LIQUIDATOR, name: 'Запасной караул нижней платформы', x: 250, y: 694, w: 92, h: 44, type: RoomType.STORAGE, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, micro: 24 },
  { owner: ZoneFaction.SCIENTIST, name: 'Лаборатория обратной стрелки', x: 602, y: 694, w: 92, h: 44, type: RoomType.MEDICAL, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, micro: 24 },
  { owner: ZoneFaction.WILD, name: 'Юго-восточный двор снятых шпал', x: 782, y: 598, w: 96, h: 48, type: RoomType.COMMON, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, micro: 28 },
  { owner: ZoneFaction.CULTIST, name: 'Тихая петля расписания', x: 410, y: 788, w: 104, h: 46, type: RoomType.SMOKING, wallTex: Tex.DARK, floorTex: Tex.F_GREEN_CARPET, micro: 30 },
  { owner: ZoneFaction.LIQUIDATOR, name: 'Центральный двор обходных стрелок', x: 388, y: 238, w: 98, h: 44, type: RoomType.PRODUCTION, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE, micro: 26 },
  { owner: ZoneFaction.LIQUIDATOR, name: 'Центральный двор нижних приводов', x: 522, y: 752, w: 98, h: 44, type: RoomType.PRODUCTION, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE, micro: 26 },
] as const;

export const SWITCHYARD_HQ_SPECS: readonly SwitchyardHqSpec[] = [
  { owner: ZoneFaction.CITIZEN, title: 'граждан', x: 118, y: 92, wallTex: Tex.PANEL, floorTex: Tex.F_LINO, supportWallTex: Tex.PANEL, supportFloorTex: Tex.F_TILE },
  { owner: ZoneFaction.LIQUIDATOR, title: 'ликвидаторов', x: 746, y: 86, wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE, supportWallTex: Tex.METAL, supportFloorTex: Tex.F_CONCRETE, strong: true },
  { owner: ZoneFaction.SCIENTIST, title: 'учёных', x: 104, y: 742, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, supportWallTex: Tex.MARBLE, supportFloorTex: Tex.F_PARQUET },
  { owner: ZoneFaction.WILD, title: 'диких', x: 760, y: 742, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, supportWallTex: Tex.METAL, supportFloorTex: Tex.F_CONCRETE },
  { owner: ZoneFaction.CULTIST, title: 'культистов', x: 430, y: 866, wallTex: Tex.MEAT, floorTex: Tex.F_MEAT, supportWallTex: Tex.DARK, supportFloorTex: Tex.F_GREEN_CARPET },
] as const;

export const SWITCHYARD_MICRO_TYPES: readonly RoomType[] = [
  RoomType.STORAGE,
  RoomType.OFFICE,
  RoomType.BATHROOM,
  RoomType.KITCHEN,
  RoomType.PRODUCTION,
  RoomType.COMMON,
  RoomType.STORAGE,
  RoomType.SMOKING,
] as const;

export const GUIDE_DEF: PlotNpcDef = {
  name: 'Зинаида Кривых Стрелок',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.TRAVELER,
  sprite: Occupation.TRAVELER,
  hp: 115,
  maxHp: 115,
  money: 95,
  speed: 0.88,
  inventory: [
    { defId: 'metro_ticket', count: 2 },
    { defId: 'chalk', count: 2 },
    { defId: 'relay_diagram', count: 1 },
  ],
  talkLines: [
    'Здесь прямой путь всегда врёт. Смотри, какая дуга делает платформу ближе, а не какая вывеска громче.',
    'Платформа с двойной стрелкой не станция. Это рот, нарисованный расписанием.',
    'Синяя семья дуг тихая, красная короче. Красная любит, когда за ней бегут.',
    'Заплатишь билетом - покажу, где карта не складывается в петлю.',
  ],
  talkLinesPost: [
    'Дуга запомнила тебя. Это дешевле карты, но дороже ошибки.',
    'Если панель щёлкнула два раза, не иди на третий звук.',
  ],
};

