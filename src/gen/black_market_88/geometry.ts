/* -- Design z: Черный рынок 88 --------------------------------
 * Standalone future-floor slice. It deliberately does not add a new
 * number; route integration belongs to the floor manifest owner.
 */

import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  Cell,
  DoorState,
  Faction,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { syncZoneMetadataFromTerritory } from '../../systems/territory';
import { stampRoom } from '../shared';
import './living_zone';


import { seedBazaarCaches, seedBazaarExpansionCaches } from './npcs';
export interface MarketRooms {
  publicGate: Room;
  mainLane: Room;
  debtOffice: Room;
  documentGate: Room;
  documentBooth: Room;
  weaponStall: Room;
  medicineLocker: Room;
  serviceHatch: Room;
  courierHideout: Room;
}

export type Market88RoomSide = 'north' | 'south' | 'west' | 'east';

export interface Market88StallPlacement {
  room: Room;
  laneY: number;
  side: -1 | 1;
}

export interface Market88ServiceGutPlacement {
  room: Room;
  side: Market88RoomSide;
  targetX: number;
  targetY: number;
  storage: boolean;
}

export interface Market88BazaarRooms {
  auction: Room | null;
  guardWest: Room | null;
  guardEast: Room | null;
  debtCourt: Room | null;
  documentCheckpoint: Room | null;
  tunnelCacheWest: Room | null;
  tunnelCacheEast: Room | null;
  coldStorage: Room | null;
}

export interface Market88RoomPlacement {
  room: Room;
  side: Market88RoomSide;
  targetX: number;
  targetY: number;
  doorState: DoorState;
  keyId: string;
}

export interface Market88HqClusterSpec {
  owner: ZoneFaction;
  hqName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  side: Market88RoomSide;
  targetX: number;
  targetY: number;
  wallTex: Tex;
  floorTex: Tex;
  support: readonly {
    name: string;
    type: RoomType;
    x: number;
    y: number;
    w: number;
    h: number;
    side: Market88RoomSide;
    targetX: number;
    targetY: number;
    wallTex: Tex;
    floorTex: Tex;
  }[];
}

export interface Market88MidBlockSpec {
  name: string;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  side: Market88RoomSide;
  targetX: number;
  targetY: number;
  wallTex: Tex;
  floorTex: Tex;
  doorState?: DoorState;
}

export const MARKET88_WEST = 136;
export const MARKET88_EAST = W - 136;
export const MARKET88_NORTH = 344;
export const MARKET88_SOUTH = 680;
export const MARKET88_LANE_Y = [376, 424, 472, 500, 548, 596, 644] as const;
export const MARKET88_LANE_X = [184, 280, 376, 472, 568, 664, 760, 856] as const;
export const MARKET88_STALL_NAMES = [
  'Прилавок сухпайка 88',
  'Лоток тихих патронов 88',
  'Палатка фильтров 88',
  'Стол чужих документов 88',
  'Занавес обмена 88',
  'Склад без вывески 88',
] as const;

export const MARKET88_HQ_ROOM_DEF_IDS = {
  citizen: 'Гермокасса гражданского обмена 88',
  liquidator: 'Гермопост рейдового досмотра 88',
  cultist: 'Гермосвечная долгового шепота 88',
  scientist: 'Гермолаборатория ценового шума 88',
  wild: 'Гермобарак диких поставщиков 88',
} as const;

export const MARKET88_HQ_CLUSTERS: readonly Market88HqClusterSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    hqName: MARKET88_HQ_ROOM_DEF_IDS.citizen,
    x: 224, y: 214, w: 24, h: 14,
    side: 'south', targetX: 236, targetY: 280,
    wallTex: Tex.HERMO_WALL, floorTex: Tex.F_LINO,
    support: [
      { name: 'Кухня гражданской очереди 88', type: RoomType.KITCHEN, x: 192, y: 238, w: 22, h: 12, side: 'east', targetX: 224, targetY: 260, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Общая комната обменщиков 88', type: RoomType.COMMON, x: 256, y: 238, w: 26, h: 12, side: 'west', targetX: 248, targetY: 260, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
      { name: 'Санузел входной кассы 88', type: RoomType.BATHROOM, x: 196, y: 196, w: 16, h: 10, side: 'south', targetX: 224, targetY: 238, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Склад честных талонов 88', type: RoomType.STORAGE, x: 288, y: 214, w: 22, h: 10, side: 'west', targetX: 282, targetY: 238, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    ],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    hqName: MARKET88_HQ_ROOM_DEF_IDS.liquidator,
    x: 764, y: 214, w: 26, h: 14,
    side: 'south', targetX: 778, targetY: 280,
    wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE,
    support: [
      { name: 'Оружейная рейдового досмотра 88', type: RoomType.STORAGE, x: 724, y: 236, w: 28, h: 12, side: 'east', targetX: 764, targetY: 260, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
      { name: 'Комната протокола задвижек 88', type: RoomType.OFFICE, x: 804, y: 236, w: 28, h: 12, side: 'west', targetX: 790, targetY: 260, wallTex: Tex.MARBLE, floorTex: Tex.F_GREEN_CARPET },
      { name: 'Медшкаф рейдовой смены 88', type: RoomType.MEDICAL, x: 724, y: 194, w: 22, h: 10, side: 'south', targetX: 764, targetY: 238, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Санузел поста досмотра 88', type: RoomType.BATHROOM, x: 806, y: 194, w: 18, h: 10, side: 'south', targetX: 790, targetY: 238, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
    ],
  },
  {
    owner: ZoneFaction.CULTIST,
    hqName: MARKET88_HQ_ROOM_DEF_IDS.cultist,
    x: 196, y: 798, w: 24, h: 14,
    side: 'north', targetX: 208, targetY: 760,
    wallTex: Tex.HERMO_WALL, floorTex: Tex.F_RED_CARPET,
    support: [
      { name: 'Свечная кухня долгов 88', type: RoomType.KITCHEN, x: 160, y: 824, w: 24, h: 12, side: 'east', targetX: 196, targetY: 814, wallTex: Tex.DARK, floorTex: Tex.F_GREEN_CARPET },
      { name: 'Исповедальня чужой сдачи 88', type: RoomType.COMMON, x: 232, y: 824, w: 26, h: 12, side: 'west', targetX: 220, targetY: 814, wallTex: Tex.DARK, floorTex: Tex.F_RED_CARPET },
      { name: 'Склад копченых расписок 88', type: RoomType.STORAGE, x: 158, y: 782, w: 24, h: 10, side: 'east', targetX: 196, targetY: 798, wallTex: Tex.ROTTEN, floorTex: Tex.F_CONCRETE },
      { name: 'Санузел свечной очереди 88', type: RoomType.BATHROOM, x: 236, y: 782, w: 18, h: 10, side: 'west', targetX: 220, targetY: 798, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
    ],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    hqName: MARKET88_HQ_ROOM_DEF_IDS.scientist,
    x: 764, y: 798, w: 26, h: 14,
    side: 'north', targetX: 778, targetY: 760,
    wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE,
    support: [
      { name: 'Лаборатория серого спроса 88', type: RoomType.PRODUCTION, x: 724, y: 824, w: 30, h: 12, side: 'east', targetX: 764, targetY: 814, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
      { name: 'Медкабинет ценового шума 88', type: RoomType.MEDICAL, x: 804, y: 824, w: 28, h: 12, side: 'west', targetX: 790, targetY: 814, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Кабинет измерения дефицита 88', type: RoomType.OFFICE, x: 724, y: 782, w: 28, h: 10, side: 'east', targetX: 764, targetY: 798, wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET },
      { name: 'Склад мерных фильтров 88', type: RoomType.STORAGE, x: 806, y: 782, w: 24, h: 10, side: 'west', targetX: 790, targetY: 798, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    ],
  },
  {
    owner: ZoneFaction.WILD,
    hqName: MARKET88_HQ_ROOM_DEF_IDS.wild,
    x: 486, y: 802, w: 34, h: 18,
    side: 'north', targetX: 504, targetY: 760,
    wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE,
    support: [
      { name: 'Кухня диких поставщиков 88', type: RoomType.KITCHEN, x: 448, y: 830, w: 28, h: 14, side: 'east', targetX: 486, targetY: 820, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Общак ночной выдачи 88', type: RoomType.COMMON, x: 532, y: 830, w: 30, h: 14, side: 'west', targetX: 520, targetY: 820, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
      { name: 'Западный герморазвал диких 88', type: RoomType.HQ, x: 88, y: 736, w: 22, h: 12, side: 'east', targetX: 136, targetY: 744, wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE },
      { name: 'Восточный герморазвал диких 88', type: RoomType.HQ, x: 920, y: 736, w: 22, h: 12, side: 'west', targetX: MARKET88_EAST, targetY: 744, wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE },
      { name: 'Склад грязной партии 88', type: RoomType.STORAGE, x: 448, y: 782, w: 30, h: 12, side: 'east', targetX: 486, targetY: 802, wallTex: Tex.BRICK, floorTex: Tex.F_CONCRETE },
      { name: 'Санузел барака поставщиков 88', type: RoomType.BATHROOM, x: 536, y: 782, w: 18, h: 10, side: 'west', targetX: 520, targetY: 802, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
    ],
  },
] as const;

export const MARKET88_MID_BLOCKS: readonly Market88MidBlockSpec[] = [
  { name: 'Северная биржа краденых тюков 88', type: RoomType.COMMON, x: 344, y: 222, w: 46, h: 24, side: 'south', targetX: 368, targetY: 280, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, doorState: DoorState.OPEN },
  { name: 'Северный зал поддельной гарантии 88', type: RoomType.OFFICE, x: 594, y: 222, w: 44, h: 24, side: 'south', targetX: 616, targetY: 280, wallTex: Tex.MARBLE, floorTex: Tex.F_GREEN_CARPET, doorState: DoorState.CLOSED },
  { name: 'Южная биржа мокрых фильтров 88', type: RoomType.COMMON, x: 316, y: 830, w: 46, h: 22, side: 'north', targetX: 338, targetY: 760, wallTex: Tex.BRICK, floorTex: Tex.F_LINO, doorState: DoorState.OPEN },
  { name: 'Южный архив без накладных 88', type: RoomType.STORAGE, x: 628, y: 830, w: 44, h: 22, side: 'north', targetX: 650, targetY: 760, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, doorState: DoorState.CLOSED },
  { name: 'Западный двор шепотной приемки 88', type: RoomType.COMMON, x: 34, y: 424, w: 34, h: 30, side: 'east', targetX: 56, targetY: 438, wallTex: Tex.PANEL, floorTex: Tex.F_LINO, doorState: DoorState.OPEN },
  { name: 'Восточный двор сухих имен 88', type: RoomType.COMMON, x: 956, y: 424, w: 28, h: 30, side: 'west', targetX: 968, targetY: 438, wallTex: Tex.PANEL, floorTex: Tex.F_LINO, doorState: DoorState.OPEN },
  { name: 'Западная станция чужого веса 88', type: RoomType.PRODUCTION, x: 34, y: 560, w: 34, h: 28, side: 'east', targetX: 56, targetY: 574, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE, doorState: DoorState.CLOSED },
  { name: 'Восточная станция рейдовой тишины 88', type: RoomType.PRODUCTION, x: 956, y: 560, w: 28, h: 28, side: 'west', targetX: 968, targetY: 574, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE, doorState: DoorState.CLOSED },
] as const;

export const MARKET88_HUB_DEGREE_CAP = 5;

export const MARKET88_GEOMETRY_HUBS = [
  { id: 'entry_gate', x: 392, y: 500, label: 'входная касса' },
  { id: 'auction_pit', x: 514, y: 540, label: 'аукционная яма' },
  { id: 'debt_court', x: 474, y: 574, label: 'долговой суд' },
  { id: 'document_choke', x: 620, y: 444, label: 'документальный кордон' },
  { id: 'west_smuggling', x: MARKET88_WEST + 28, y: 632, label: 'западный контрабандный ход' },
  { id: 'east_smuggling', x: MARKET88_EAST, y: 628, label: 'восточный контрабандный ход' },
  { id: 'cold_storage', x: 704, y: 376, label: 'холодный склад' },
  { id: 'west_service', x: MARKET88_WEST, y: 500, label: 'западная служебная кишка' },
  { id: 'east_service', x: MARKET88_EAST, y: 500, label: 'восточная служебная кишка' },
] as const;

export type Market88GeometryHubId = typeof MARKET88_GEOMETRY_HUBS[number]['id'];

export const MARKET88_SMALL_WORLD_CHORDS: readonly {
  from: Market88GeometryHubId;
  to: Market88GeometryHubId;
  floorTex: Tex;
  width: 1 | 2;
  hidden: boolean;
}[] = [
  { from: 'auction_pit', to: 'entry_gate', floorTex: Tex.F_CONCRETE, width: 2, hidden: false },
  { from: 'auction_pit', to: 'debt_court', floorTex: Tex.F_CONCRETE, width: 2, hidden: false },
  { from: 'auction_pit', to: 'document_choke', floorTex: Tex.F_CONCRETE, width: 2, hidden: false },
  { from: 'auction_pit', to: 'west_smuggling', floorTex: Tex.F_LINO, width: 1, hidden: true },
  { from: 'auction_pit', to: 'east_smuggling', floorTex: Tex.F_LINO, width: 1, hidden: true },
  { from: 'document_choke', to: 'cold_storage', floorTex: Tex.F_TILE, width: 1, hidden: true },
  { from: 'document_choke', to: 'east_service', floorTex: Tex.F_LINO, width: 1, hidden: true },
  { from: 'debt_court', to: 'west_service', floorTex: Tex.F_LINO, width: 1, hidden: true },
  { from: 'west_smuggling', to: 'west_service', floorTex: Tex.F_LINO, width: 1, hidden: true },
  { from: 'east_smuggling', to: 'east_service', floorTex: Tex.F_LINO, width: 1, hidden: true },
] as const;

export const MARKET88_RAID_SHUTTER_GATES = [
  { x: 392, y: 500, axis: 'east_west', bypass: { ax: 382, ay: 488, bx: 404, by: 512 } },
  { x: 622, y: 548, axis: 'east_west', bypass: { ax: 610, ay: 536, bx: 638, by: 564 } },
  { x: 568, y: 424, axis: 'north_south', bypass: { ax: 552, ay: 414, bx: 584, by: 438 } },
  { x: MARKET88_WEST + 28, y: 632, axis: 'east_west', bypass: { ax: MARKET88_WEST + 18, ay: 620, bx: MARKET88_WEST + 48, by: 644 } },
  { x: MARKET88_EAST, y: 628, axis: 'east_west', bypass: { ax: MARKET88_EAST - 18, ay: 616, bx: MARKET88_EAST + 14, by: 640 } },
] as const;

export function expandBlackMarket88Bazaar(world: World, rng: () => number): void {
  const rooms = addBazaarLandmarks(world);
  const serviceGuts = addBazaarServiceGuts(world, rng);
  const hqRooms = addBazaarHqCompounds(world);
  const midBlocks = addBazaarMidBlocks(world, rng);
  const microRooms = addBazaarMicroRooms(world, rng);
  const stalls = addBazaarStallRooms(world, rng);

  carveBazaarAlleys(world);
  carveBazaarOuterRings(world);
  carveBazaarHubChords(world);
  connectBazaarLandmarks(world, rooms);
  connectBazaarServiceGuts(world, serviceGuts);
  connectBazaarRoomPlacements(world, hqRooms);
  connectBazaarRoomPlacements(world, midBlocks);
  connectBazaarRoomPlacements(world, microRooms);
  connectStallsToAlleys(world, stalls);
  addRaidShutters(world);
  decorateBazaarLandmarks(world, rooms);
  decorateBazaarHubChords(world);
  decorateBazaarServiceGuts(world, serviceGuts, rng);
  decorateSmugglingTunnels(world);
  seedBazaarCaches(world, rooms, serviceGuts);
  seedBazaarExpansionCaches(world);
}

export function addBazaarLandmarks(world: World): Market88BazaarRooms {
  return {
    auction: tryBazaarRoom(world, RoomType.COMMON, 494, 526, 40, 28, 'Аукционная яма 88', Tex.METAL, Tex.F_CONCRETE),
    guardWest: tryBazaarRoom(world, RoomType.HQ, 438, 486, 12, 9, 'Будка западной задвижки 88', Tex.METAL, Tex.F_CONCRETE),
    guardEast: tryBazaarRoom(world, RoomType.HQ, 574, 538, 12, 9, 'Будка рейдовой задвижки 88', Tex.METAL, Tex.F_CONCRETE),
    debtCourt: tryBazaarRoom(world, RoomType.OFFICE, 462, 568, 24, 14, 'Долговой суд 88', Tex.MARBLE, Tex.F_GREEN_CARPET),
    documentCheckpoint: tryBazaarRoom(world, RoomType.OFFICE, 604, 438, 26, 12, 'Документальный кордон 88', Tex.MARBLE, Tex.F_MARBLE_TILE),
    tunnelCacheWest: tryBazaarRoom(world, RoomType.STORAGE, 168, 626, 18, 10, 'Западный тайник контрабанды 88', Tex.BRICK, Tex.F_LINO),
    tunnelCacheEast: tryBazaarRoom(world, RoomType.STORAGE, 858, 622, 18, 10, 'Восточный тайник контрабанды 88', Tex.PIPE, Tex.F_CONCRETE),
    coldStorage: tryBazaarRoom(world, RoomType.STORAGE, 684, 364, 20, 12, 'Холодный склад без накладной 88', Tex.TILE_W, Tex.F_TILE),
  };
}

export function addBazaarServiceGuts(world: World, rng: () => number): Market88ServiceGutPlacement[] {
  const specs: readonly {
    type: RoomType;
    x: number;
    y: number;
    w: number;
    h: number;
    name: string;
    side: Market88RoomSide;
    targetX: number;
    targetY: number;
    wallTex: Tex;
    floorTex: Tex;
  }[] = [
    { type: RoomType.STORAGE, x: 198, y: 306, w: 28, h: 13, name: 'Северный склад краденых тюков 88', side: 'south', targetX: 208, targetY: MARKET88_NORTH, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    { type: RoomType.PRODUCTION, x: 330, y: 304, w: 32, h: 15, name: 'Сервисная кишка под весами 88', side: 'south', targetX: 344, targetY: MARKET88_NORTH, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
    { type: RoomType.STORAGE, x: 652, y: 306, w: 30, h: 13, name: 'Склад чужой медицины 88', side: 'south', targetX: 664, targetY: MARKET88_NORTH, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
    { type: RoomType.PRODUCTION, x: 790, y: 306, w: 32, h: 15, name: 'Закрытый перегон поставщика 88', side: 'south', targetX: 792, targetY: MARKET88_NORTH, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
    { type: RoomType.STORAGE, x: 202, y: 704, w: 28, h: 13, name: 'Южный склад мокрой партии 88', side: 'north', targetX: 216, targetY: MARKET88_SOUTH, wallTex: Tex.BRICK, floorTex: Tex.F_LINO },
    { type: RoomType.PRODUCTION, x: 382, y: 704, w: 32, h: 15, name: 'Задняя мастерская пломб 88', side: 'north', targetX: 392, targetY: MARKET88_SOUTH, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    { type: RoomType.STORAGE, x: 610, y: 704, w: 30, h: 14, name: 'Темный ряд долговых ящиков 88', side: 'north', targetX: 624, targetY: MARKET88_SOUTH, wallTex: Tex.MARBLE, floorTex: Tex.F_GREEN_CARPET },
    { type: RoomType.PRODUCTION, x: 790, y: 704, w: 34, h: 15, name: 'Мясной протек склада 88', side: 'north', targetX: 808, targetY: MARKET88_SOUTH, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
    { type: RoomType.PRODUCTION, x: 86, y: 374, w: 26, h: 18, name: 'Западная служебная утроба 88', side: 'east', targetX: MARKET88_WEST, targetY: 384, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
    { type: RoomType.STORAGE, x: 88, y: 500, w: 24, h: 18, name: 'Клетка должников за занавесом 88', side: 'east', targetX: MARKET88_WEST, targetY: 500, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    { type: RoomType.PRODUCTION, x: 88, y: 610, w: 26, h: 18, name: 'Западный люк грязного товара 88', side: 'east', targetX: MARKET88_WEST, targetY: 628, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
    { type: RoomType.STORAGE, x: 912, y: 376, w: 26, h: 18, name: 'Восточная кладовая сухих имен 88', side: 'west', targetX: MARKET88_EAST, targetY: 384, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    { type: RoomType.PRODUCTION, x: 912, y: 496, w: 28, h: 18, name: 'Восточный сервис рейдовых задвижек 88', side: 'west', targetX: MARKET88_EAST, targetY: 500, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
    { type: RoomType.STORAGE, x: 912, y: 612, w: 26, h: 18, name: 'Восточный склад черного маршрута 88', side: 'west', targetX: MARKET88_EAST, targetY: 628, wallTex: Tex.BRICK, floorTex: Tex.F_LINO },
  ];
  const placements: Market88ServiceGutPlacement[] = [];
  for (const spec of specs) {
    const room = tryBazaarRoom(
      world,
      spec.type,
      spec.x + Math.floor(rng() * 3) - 1,
      spec.y + Math.floor(rng() * 3) - 1,
      spec.w,
      spec.h,
      spec.name,
      spec.wallTex,
      spec.floorTex,
    );
    if (!room) continue;
    placements.push({ room, side: spec.side, targetX: spec.targetX, targetY: spec.targetY, storage: spec.type === RoomType.STORAGE });
  }
  return placements;
}

export function addBazaarHqCompounds(world: World): Market88RoomPlacement[] {
  const placements: Market88RoomPlacement[] = [];
  for (const spec of MARKET88_HQ_CLUSTERS) {
    const hq = tryBazaarRoom(world, RoomType.HQ, spec.x, spec.y, spec.w, spec.h, spec.hqName, spec.wallTex, spec.floorTex);
    if (hq) {
      hq.sealed = true;
      paintBazaarRoomOwner(world, hq, spec.owner);
      paintBazaarOwnerPatch(world, hq.x + (hq.w >> 1), hq.y + (hq.h >> 1), spec.owner, spec.owner === ZoneFaction.WILD ? 32 : 24);
      decorateBazaarOwnedRoom(world, hq, spec.owner, hq.id);
      placements.push({ room: hq, side: spec.side, targetX: spec.targetX, targetY: spec.targetY, doorState: DoorState.HERMETIC_OPEN, keyId: '' });
    }
    for (const support of spec.support) {
      const room = tryBazaarRoom(world, support.type, support.x, support.y, support.w, support.h, support.name, support.wallTex, support.floorTex);
      if (!room) continue;
      if (support.type === RoomType.HQ) room.sealed = true;
      paintBazaarRoomOwner(world, room, spec.owner);
      decorateBazaarOwnedRoom(world, room, spec.owner, room.id);
      placements.push({
        room,
        side: support.side,
        targetX: support.targetX,
        targetY: support.targetY,
        doorState: support.type === RoomType.HQ ? DoorState.HERMETIC_OPEN : support.type === RoomType.STORAGE ? DoorState.CLOSED : DoorState.OPEN,
        keyId: '',
      });
    }
  }
  return placements;
}

export function addBazaarMidBlocks(world: World, rng: () => number): Market88RoomPlacement[] {
  const placements: Market88RoomPlacement[] = [];
  for (const spec of MARKET88_MID_BLOCKS) {
    const room = tryBazaarRoom(world, spec.type, spec.x, spec.y, spec.w, spec.h, spec.name, spec.wallTex, spec.floorTex);
    if (!room) continue;
    decorateStallRoom(world, room, rng, spec.type === RoomType.STORAGE || spec.type === RoomType.PRODUCTION);
    placements.push({
      room,
      side: spec.side,
      targetX: spec.targetX,
      targetY: spec.targetY,
      doorState: spec.doorState ?? DoorState.CLOSED,
      keyId: '',
    });
  }
  return placements;
}

export function addBazaarMicroRooms(world: World, rng: () => number): Market88RoomPlacement[] {
  const placements: Market88RoomPlacement[] = [];
  let serial = 1;
  const addMicro = (
    prefix: string,
    type: RoomType,
    x: number,
    y: number,
    w: number,
    h: number,
    side: Market88RoomSide,
    targetX: number,
    targetY: number,
    wallTex: Tex,
    floorTex: Tex,
  ): void => {
    const room = tryBazaarRoom(world, type, x, y, w, h, `${prefix} ${serial++}`, wallTex, floorTex);
    if (!room) return;
    decorateStallRoom(world, room, rng, type === RoomType.STORAGE);
    placements.push({
      room,
      side,
      targetX,
      targetY,
      doorState: type === RoomType.STORAGE ? DoorState.CLOSED : DoorState.OPEN,
      keyId: '',
    });
  };

  for (let x = 148; x <= 870; x += 26) {
    const upperType = serial % 6 === 0 ? RoomType.STORAGE : RoomType.COMMON;
    const lowerType = serial % 7 === 0 ? RoomType.STORAGE : RoomType.COMMON;
    addMicro('Микролавка северной верхней дуги 88', upperType, x + Math.floor(rng() * 3), 252 + Math.floor(rng() * 2), 6 + (serial % 3), 5 + (serial % 2), 'south', x + 4, 280, Tex.PANEL, upperType === RoomType.STORAGE ? Tex.F_CONCRETE : Tex.F_LINO);
    addMicro('Микросклад северной нижней дуги 88', lowerType, x + 11 + Math.floor(rng() * 3), 292 + Math.floor(rng() * 2), 6 + (serial % 3), 5 + (serial % 2), 'north', x + 14, 280, Tex.METAL, lowerType === RoomType.STORAGE ? Tex.F_CONCRETE : Tex.F_LINO);
  }

  for (let x = 148; x <= 870; x += 26) {
    const upperType = serial % 5 === 0 ? RoomType.STORAGE : RoomType.COMMON;
    const lowerType = serial % 8 === 0 ? RoomType.STORAGE : RoomType.COMMON;
    addMicro('Микролавка южной верхней дуги 88', upperType, x + Math.floor(rng() * 3), 724 + Math.floor(rng() * 2), 6 + (serial % 3), 5 + (serial % 2), 'south', x + 4, 760, Tex.PANEL, upperType === RoomType.STORAGE ? Tex.F_CONCRETE : Tex.F_LINO);
    addMicro('Микросклад южной нижней дуги 88', lowerType, x + 11 + Math.floor(rng() * 3), 776 + Math.floor(rng() * 2), 6 + (serial % 3), 5 + (serial % 2), 'north', x + 14, 760, Tex.BRICK, lowerType === RoomType.STORAGE ? Tex.F_CONCRETE : Tex.F_LINO);
  }

  for (let y = 344; y <= 694; y += 28) {
    const westType = serial % 5 === 0 ? RoomType.STORAGE : RoomType.COMMON;
    const eastType = serial % 6 === 0 ? RoomType.STORAGE : RoomType.COMMON;
    addMicro('Западная микронить приемки 88', westType, 14 + Math.floor(rng() * 2), y + Math.floor(rng() * 3), 7, 6, 'east', 56, y + 3, Tex.PANEL, westType === RoomType.STORAGE ? Tex.F_CONCRETE : Tex.F_LINO);
    addMicro('Западная внутренняя микроклетка 88', RoomType.COMMON, 72 + Math.floor(rng() * 2), y + 10 + Math.floor(rng() * 3), 7, 6, 'west', 56, y + 12, Tex.METAL, Tex.F_CONCRETE);
    addMicro('Восточная внутренняя микроклетка 88', RoomType.COMMON, 944 + Math.floor(rng() * 2), y + 10 + Math.floor(rng() * 3), 7, 6, 'east', 968, y + 12, Tex.METAL, Tex.F_CONCRETE);
    addMicro('Восточная микронить приемки 88', eastType, 986 + Math.floor(rng() * 2), y + Math.floor(rng() * 3), 7, 6, 'west', 968, y + 3, Tex.PANEL, eastType === RoomType.STORAGE ? Tex.F_CONCRETE : Tex.F_LINO);
  }

  return placements;
}

export function addBazaarStallRooms(world: World, rng: () => number): Market88StallPlacement[] {
  const placements: Market88StallPlacement[] = [];
  for (let row = 0; row < MARKET88_LANE_Y.length; row++) {
    const laneY = MARKET88_LANE_Y[row];
    for (let col = 0, x = 154; x <= 840; col++, x += 42) {
      const side: -1 | 1 = ((row + col) & 1) === 0 ? -1 : 1;
      const w = 12 + ((row + col) % 4) * 2 + Math.floor(rng() * 2);
      const h = 6 + Math.floor(rng() * 3);
      const rx = x + Math.floor(rng() * 7);
      const ry = side < 0 ? laneY - h - 6 : laneY + 6;
      if (inMarket88CoreKeepout(world, rx, ry, w, h)) continue;
      const name = MARKET88_STALL_NAMES[(row + col) % MARKET88_STALL_NAMES.length];
      const type = col % 5 === 0 ? RoomType.STORAGE : RoomType.COMMON;
      const room = tryBazaarRoom(world, type, rx, ry, w, h, name, Tex.METAL, col % 3 === 0 ? Tex.F_LINO : Tex.F_CONCRETE);
      if (!room) continue;
      decorateStallRoom(world, room, rng, col % 5 === 0);
      placements.push({ room, laneY, side });
    }
  }
  return placements;
}

export function carveBazaarAlleys(world: World): void {
  carveMarketLine(world, MARKET88_WEST, MARKET88_NORTH, MARKET88_EAST, MARKET88_NORTH, 2, Tex.F_CONCRETE);
  carveMarketLine(world, MARKET88_WEST, MARKET88_SOUTH, MARKET88_EAST, MARKET88_SOUTH, 2, Tex.F_CONCRETE);
  carveMarketLine(world, MARKET88_WEST, MARKET88_NORTH, MARKET88_WEST, MARKET88_SOUTH, 2, Tex.F_CONCRETE);
  carveMarketLine(world, MARKET88_EAST, MARKET88_NORTH, MARKET88_EAST, MARKET88_SOUTH, 2, Tex.F_CONCRETE);

  for (const y of MARKET88_LANE_Y) carveMarketLine(world, MARKET88_WEST, y, MARKET88_EAST, y, 2, Tex.F_CONCRETE);
  for (const x of MARKET88_LANE_X) carveMarketLine(world, x, MARKET88_NORTH, x, MARKET88_SOUTH, 2, Tex.F_CONCRETE);

  carveMarketLine(world, 484, 500, MARKET88_WEST, 500, 2, Tex.F_CONCRETE);
  carveMarketLine(world, 536, 500, MARKET88_EAST, 500, 2, Tex.F_CONCRETE);
  carveMarketLine(world, 514, 508, 514, 526, 2, Tex.F_CONCRETE);

  carveMarketLine(world, 518, 474, 518, MARKET88_NORTH, 1, Tex.F_LINO);
  carveMarketLine(world, 535, 508, MARKET88_EAST, 628, 1, Tex.F_LINO);
  carveMarketLine(world, 484, 504, MARKET88_WEST + 28, 632, 1, Tex.F_LINO);
  carveMarketLine(world, 620, 444, 724, MARKET88_NORTH, 1, Tex.F_LINO);
}

export function carveBazaarOuterRings(world: World): void {
  carveMarketLine(world, 144, 280, 888, 280, 2, Tex.F_CONCRETE);
  carveMarketLine(world, 144, 760, 888, 760, 2, Tex.F_CONCRETE);
  carveMarketLine(world, 56, 344, 56, 720, 2, Tex.F_LINO);
  carveMarketLine(world, 968, 344, 968, 720, 2, Tex.F_LINO);

  for (const x of [184, 280, 376, 472, 568, 664, 760, 856]) {
    carveMarketLine(world, x, 280, x, MARKET88_NORTH, 1, Tex.F_CONCRETE);
    carveMarketLine(world, x, MARKET88_SOUTH, x, 760, 1, Tex.F_CONCRETE);
  }
  for (const y of [384, 500, 628]) {
    carveMarketLine(world, 56, y, MARKET88_WEST, y, 1, Tex.F_LINO);
    carveMarketLine(world, MARKET88_EAST, y, 968, y, 1, Tex.F_LINO);
  }
}

export function carveBazaarHubChords(world: World): void {
  for (const hub of MARKET88_GEOMETRY_HUBS) {
    carveMarketDisc(world, hub.x, hub.y, hub.id === 'auction_pit' ? 4 : 3, hub.id.includes('smuggling') ? Tex.F_LINO : Tex.F_CONCRETE);
  }

  for (const chord of MARKET88_SMALL_WORLD_CHORDS) {
    const from = market88Hub(chord.from);
    const to = market88Hub(chord.to);
    carveMarketLine(world, from.x, from.y, to.x, to.y, chord.width, chord.floorTex);
  }
}

export function decorateBazaarHubChords(world: World): void {
  for (const hub of MARKET88_GEOMETRY_HUBS) {
    const feature = hub.id === 'auction_pit'
      ? Feature.SCREEN
      : hub.id.includes('smuggling')
        ? Feature.CANDLE
        : hub.id.includes('service')
          ? Feature.MACHINE
          : Feature.TABLE;
    setMarketFeature(world, hub.x, hub.y, feature);
    setMarketFeature(world, hub.x + 2, hub.y, hub.id.includes('smuggling') ? Feature.SHELF : Feature.LAMP);
  }

  for (const chord of MARKET88_SMALL_WORLD_CHORDS) {
    if (!chord.hidden) continue;
    const from = market88Hub(chord.from);
    const to = market88Hub(chord.to);
    const mx = world.wrap(Math.round(from.x + world.delta(from.x, to.x) * 0.5));
    const my = world.wrap(Math.round(from.y + world.delta(from.y, to.y) * 0.5));
    setMarketFeature(world, mx, my, Feature.CANDLE);
  }
}

export function market88Hub(id: Market88GeometryHubId): (typeof MARKET88_GEOMETRY_HUBS)[number] {
  const hub = MARKET88_GEOMETRY_HUBS.find(candidate => candidate.id === id);
  if (!hub) throw new Error(`Missing black market 88 hub: ${id}`);
  return hub;
}

export function connectBazaarLandmarks(world: World, rooms: Market88BazaarRooms): void {
  if (rooms.auction) {
    connectRoomToPoint(world, rooms.auction, 'north', rooms.auction.x + (rooms.auction.w >> 1), 500, DoorState.CLOSED, '');
    connectRoomToPoint(world, rooms.auction, 'west', 472, rooms.auction.y + (rooms.auction.h >> 1), DoorState.CLOSED, '');
    connectRoomToPoint(world, rooms.auction, 'east', 568, rooms.auction.y + (rooms.auction.h >> 1), DoorState.CLOSED, '');
    connectRoomToPoint(world, rooms.auction, 'south', rooms.auction.x + (rooms.auction.w >> 1), 596, DoorState.CLOSED, '');
  }
  if (rooms.guardWest) connectRoomToPoint(world, rooms.guardWest, 'east', 472, 500, DoorState.CLOSED, '');
  if (rooms.guardEast) connectRoomToPoint(world, rooms.guardEast, 'west', 568, 548, DoorState.CLOSED, '');
  if (rooms.debtCourt) connectRoomToPoint(world, rooms.debtCourt, 'north', 472, 548, DoorState.LOCKED, 'key');
  if (rooms.documentCheckpoint) connectRoomToPoint(world, rooms.documentCheckpoint, 'south', 608, 472, DoorState.LOCKED, 'key');
  if (rooms.tunnelCacheWest) connectRoomToPoint(world, rooms.tunnelCacheWest, 'north', MARKET88_WEST + 28, 632, DoorState.HERMETIC_CLOSED, '');
  if (rooms.tunnelCacheEast) connectRoomToPoint(world, rooms.tunnelCacheEast, 'west', MARKET88_EAST, 628, DoorState.HERMETIC_CLOSED, '');
  if (rooms.coldStorage) connectRoomToPoint(world, rooms.coldStorage, 'south', 704, 376, DoorState.LOCKED, 'key');
}

export function connectBazaarServiceGuts(world: World, placements: Market88ServiceGutPlacement[]): void {
  for (const placement of placements) {
    connectRoomToPoint(
      world,
      placement.room,
      placement.side,
      placement.targetX,
      placement.targetY,
      placement.storage ? DoorState.LOCKED : DoorState.HERMETIC_CLOSED,
      placement.storage ? 'key' : '',
    );
  }
}

export function connectBazaarRoomPlacements(world: World, placements: readonly Market88RoomPlacement[]): void {
  for (const placement of placements) {
    connectRoomToPoint(world, placement.room, placement.side, placement.targetX, placement.targetY, placement.doorState, placement.keyId);
  }
}

export function connectStallsToAlleys(world: World, placements: Market88StallPlacement[]): void {
  for (const placement of placements) {
    const side: Market88RoomSide = placement.side < 0 ? 'south' : 'north';
    connectRoomToPoint(
      world,
      placement.room,
      side,
      placement.room.x + (placement.room.w >> 1),
      placement.laneY,
      placement.room.type === RoomType.STORAGE ? DoorState.CLOSED : DoorState.OPEN,
      '',
    );
  }
}

export function addRaidShutters(world: World): void {
  for (const gate of MARKET88_RAID_SHUTTER_GATES) {
    addShutterGate(world, gate.x, gate.y, gate.axis);
    addShutterBypass(world, gate.bypass.ax, gate.bypass.ay, gate.bypass.bx, gate.bypass.by);
  }
}

export function addShutterBypass(world: World, ax: number, ay: number, bx: number, by: number): void {
  carveMarketLine(world, ax, ay, bx, ay, 1, Tex.F_LINO);
  carveMarketLine(world, bx, ay, bx, by, 1, Tex.F_LINO);
  setMarketFeature(world, ax, ay, Feature.CANDLE);
  setMarketFeature(world, bx, by, Feature.SHELF);
}

export function decorateBazaarLandmarks(world: World, rooms: Market88BazaarRooms): void {
  if (rooms.auction) {
    const room = rooms.auction;
    const cx = room.x + (room.w >> 1);
    const cy = room.y + (room.h >> 1);
    stampSurfaceSplat(world, cx, cy, 0.5, 0.5, 12, 0.18, 88013, 74, 58, 30, false);
    for (let dx = 6; dx < room.w - 5; dx += 5) {
      setMarketFeature(world, room.x + dx, room.y + 4, Feature.TABLE);
      setMarketFeature(world, room.x + dx, room.y + room.h - 5, Feature.DESK);
    }
    for (let dy = 6; dy < room.h - 5; dy += 5) {
      setMarketFeature(world, room.x + 4, room.y + dy, Feature.CHAIR);
      setMarketFeature(world, room.x + room.w - 5, room.y + dy, Feature.SHELF);
    }
    setMarketFeature(world, cx, cy, Feature.SCREEN);
    setMarketFeature(world, cx - 6, cy, Feature.LAMP);
    setMarketFeature(world, cx + 6, cy, Feature.LAMP);
  }

  for (const room of [rooms.guardWest, rooms.guardEast]) {
    if (!room) continue;
    setMarketFeature(world, room.x + 2, room.y + 2, Feature.DESK);
    setMarketFeature(world, room.x + room.w - 3, room.y + 2, Feature.SCREEN);
    setMarketFeature(world, room.x + 2, room.y + room.h - 3, Feature.SHELF);
    setMarketFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.LAMP);
  }

  for (const room of [rooms.debtCourt, rooms.documentCheckpoint]) {
    if (!room) continue;
    for (let dx = 3; dx < room.w - 2; dx += 5) setMarketFeature(world, room.x + dx, room.y + 2, Feature.DESK);
    setMarketFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.SHELF);
    setMarketFeature(world, room.x + 3, room.y + room.h - 3, Feature.LAMP);
  }

  for (const room of [rooms.tunnelCacheWest, rooms.tunnelCacheEast, rooms.coldStorage]) {
    if (!room) continue;
    decorateStallRoom(world, room, () => 0.35, true);
  }
}

export function decorateBazaarServiceGuts(world: World, placements: Market88ServiceGutPlacement[], rng: () => number): void {
  for (let i = 0; i < placements.length; i++) {
    const room = placements[i].room;
    decorateStallRoom(world, room, rng, placements[i].storage);
    const cx = room.x + (room.w >> 1);
    const cy = room.y + (room.h >> 1);
    setMarketFeature(world, cx, cy, placements[i].storage ? Feature.SHELF : Feature.MACHINE);
    if (!placements[i].storage && room.w > 10) setMarketFeature(world, room.x + room.w - 4, room.y + room.h - 4, Feature.APPARATUS);
    if (i % 3 === 0) setMarketFeature(world, room.x + 3, room.y + room.h - 3, Feature.CANDLE);
  }
}

export function decorateBazaarOwnedRoom(world: World, room: Room, owner: ZoneFaction, salt: number): void {
  if (room.type === RoomType.BATHROOM) {
    setMarketFeature(world, room.x + 2, room.y + 2, Feature.SINK);
    setMarketFeature(world, room.x + Math.max(3, room.w - 3), room.y + Math.max(3, room.h - 3), Feature.TOILET);
    return;
  }
  if (room.type === RoomType.KITCHEN) {
    setMarketFeature(world, room.x + 2, room.y + 2, Feature.SINK);
    setMarketFeature(world, room.x + Math.max(3, room.w - 4), room.y + 2, Feature.TABLE);
    setMarketFeature(world, room.x + (room.w >> 1), room.y + Math.max(3, room.h - 3), Feature.SHELF);
    return;
  }
  if (room.type === RoomType.MEDICAL) {
    setMarketFeature(world, room.x + 2, room.y + 2, Feature.APPARATUS);
    setMarketFeature(world, room.x + Math.max(3, room.w - 4), room.y + 2, Feature.SHELF);
    setMarketFeature(world, room.x + (room.w >> 1), room.y + Math.max(3, room.h - 3), Feature.LAMP);
    return;
  }
  if (room.type === RoomType.PRODUCTION) {
    setMarketFeature(world, room.x + 2, room.y + 2, Feature.MACHINE);
    setMarketFeature(world, room.x + Math.max(3, room.w - 4), room.y + Math.max(3, room.h - 3), Feature.APPARATUS);
    return;
  }
  if (room.type === RoomType.STORAGE) {
    decorateStallRoom(world, room, () => ((salt * 37) % 100) / 100, true);
    return;
  }
  if (room.type === RoomType.HQ) {
    setMarketFeature(world, room.x + 3, room.y + 2, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.SCREEN);
    setMarketFeature(world, room.x + Math.max(4, room.w - 4), room.y + 2, Feature.DESK);
    setMarketFeature(world, room.x + (room.w >> 1), room.y + Math.max(4, room.h - 4), owner === ZoneFaction.WILD ? Feature.SHELF : Feature.LAMP);
    if (owner === ZoneFaction.CULTIST) {
      stampSurfaceSplat(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 0.5, 0.5, 3, 0.2, 88200 + salt, 118, 42, 164, true);
    }
    return;
  }
  setMarketFeature(world, room.x + 2, room.y + 2, Feature.TABLE);
  setMarketFeature(world, room.x + Math.max(3, room.w - 4), room.y + 2, Feature.SHELF);
  setMarketFeature(world, room.x + (room.w >> 1), room.y + Math.max(3, room.h - 3), owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.LAMP);
}

export function decorateSmugglingTunnels(world: World): void {
  for (let x = MARKET88_WEST + 28; x < 484; x += 34) {
    setMarketFeature(world, x, 632, x % 68 === 0 ? Feature.CANDLE : Feature.SHELF);
  }
  for (let x = 552; x < MARKET88_EAST; x += 38) {
    setMarketFeature(world, x, 628, x % 76 === 0 ? Feature.CANDLE : Feature.MACHINE);
  }
  for (let y = MARKET88_NORTH + 12; y < 472; y += 28) {
    setMarketFeature(world, 518, y, y % 56 === 0 ? Feature.CANDLE : Feature.SHELF);
  }
}

export function market88OwnerFaction(owner: ZoneFaction): Faction {
  switch (owner) {
    case ZoneFaction.LIQUIDATOR: return Faction.LIQUIDATOR;
    case ZoneFaction.CULTIST: return Faction.CULTIST;
    case ZoneFaction.SCIENTIST: return Faction.SCIENTIST;
    case ZoneFaction.WILD: return Faction.WILD;
    case ZoneFaction.CITIZEN:
    default:
      return Faction.CITIZEN;
  }
}

export function market88AuthoredRoomOwner(room: Room): ZoneFaction | undefined {
  for (const spec of MARKET88_HQ_CLUSTERS) {
    if (room.name === spec.hqName) return spec.owner;
    for (const support of spec.support) {
      if (room.name === support.name) return spec.owner;
    }
  }
  return undefined;
}

export function market88AuthoredConnection(room: Room): Market88RoomPlacement | undefined {
  for (const spec of MARKET88_HQ_CLUSTERS) {
    if (room.name === spec.hqName) {
      return { room, side: spec.side, targetX: spec.targetX, targetY: spec.targetY, doorState: DoorState.HERMETIC_OPEN, keyId: '' };
    }
    for (const support of spec.support) {
      if (room.name !== support.name) continue;
      return {
        room,
        side: support.side,
        targetX: support.targetX,
        targetY: support.targetY,
        doorState: support.type === RoomType.HQ ? DoorState.HERMETIC_OPEN : support.type === RoomType.STORAGE ? DoorState.CLOSED : DoorState.OPEN,
        keyId: '',
      };
    }
  }
  return undefined;
}

export function restoreBlackMarket88FallbackRoomType(room: Room): void {
  if (market88AuthoredRoomOwner(room) !== undefined) return;
  if (room.type !== RoomType.HQ) return;
  if (room.name === 'Рыночные ряды 88') room.type = RoomType.COMMON;
  else if (room.name === 'Служебный люк 88') room.type = RoomType.PRODUCTION;
  else if (room.name === 'Долговой суд 88' || room.name === 'Документальный кордон 88') room.type = RoomType.OFFICE;
  else if (room.name.startsWith('Будка ')) room.type = RoomType.OFFICE;
}

export function hasHermeticOpenDoor(world: World, room: Room): boolean {
  return room.doors.some(doorIdx => world.doors.get(doorIdx)?.state === DoorState.HERMETIC_OPEN);
}

export function reinforceBlackMarket88AuthoredHqTerritory(world: World): void {
  for (const room of world.rooms) {
    if (room) restoreBlackMarket88FallbackRoomType(room);
  }
  for (const room of world.rooms) {
    if (!room) continue;
    const owner = market88AuthoredRoomOwner(room);
    if (owner === undefined) continue;
    const isCore = room.name === MARKET88_HQ_ROOM_DEF_IDS.citizen ||
      room.name === MARKET88_HQ_ROOM_DEF_IDS.liquidator ||
      room.name === MARKET88_HQ_ROOM_DEF_IDS.cultist ||
      room.name === MARKET88_HQ_ROOM_DEF_IDS.scientist ||
      room.name === MARKET88_HQ_ROOM_DEF_IDS.wild ||
      room.name === 'Западный герморазвал диких 88' ||
      room.name === 'Восточный герморазвал диких 88';
    if (isCore) {
      room.type = RoomType.HQ;
      room.sealed = true;
      room.wallTex = Tex.HERMO_WALL;
      if (!hasHermeticOpenDoor(world, room)) {
        const connection = market88AuthoredConnection(room);
        if (connection) connectRoomToPoint(world, room, connection.side, connection.targetX, connection.targetY, DoorState.HERMETIC_OPEN, '');
      }
      for (let dy = -1; dy <= room.h; dy++) {
        for (let dx = -1; dx <= room.w; dx++) {
          const idx = world.idx(room.x + dx, room.y + dy);
          const inside = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
          if (!inside && world.cells[idx] === Cell.WALL && !world.aptMask[idx]) {
            world.hermoWall[idx] = 1;
            world.wallTex[idx] = Tex.HERMO_WALL;
          }
        }
      }
      paintBazaarOwnerPatch(world, room.x + (room.w >> 1), room.y + (room.h >> 1), owner, owner === ZoneFaction.WILD ? 36 : 26);
    }
    paintBazaarRoomOwner(world, room, owner);
  }
  addRaidShutters(world);
  syncZoneMetadataFromTerritory(world);
  markBlackMarket88ServiceGutZonesHostile(world);
  world.markWallTexDirty();
}

export function markBlackMarket88ServiceGutZonesHostile(world: World): void {
  for (const zone of world.zones) {
    const northSouthGuts = zone.cx >= 180 && zone.cx <= 844 &&
      ((zone.cy >= 286 && zone.cy <= 356) || (zone.cy >= 676 && zone.cy <= 736));
    const westEastGuts = zone.cy >= 344 && zone.cy <= 660 &&
      (zone.cx <= 180 || zone.cx >= 844);
    if (!northSouthGuts && !westEastGuts) continue;
    zone.faction = zone.id % 5 === 0 ? ZoneFaction.SAMOSBOR : ZoneFaction.WILD;
    zone.level = Math.max(zone.level, 4);
    zone.fogged = false;
  }
}

export function tryBazaarRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room | null {
  if (!canFitBazaarRoom(world, x, y, w, h)) return null;
  return makeRoom(world, world.rooms.length, type, x, y, w, h, name, wallTex, floorTex);
}

export function paintBazaarRoomOwner(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id && !world.aptMask[idx]) world.factionControl[idx] = owner;
    }
  }
  for (const idx of room.doors) {
    if (!world.aptMask[idx]) world.factionControl[idx] = owner;
  }
}

export function paintBazaarOwnerPatch(world: World, cx: number, cy: number, owner: TerritoryOwner, radius: number): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const idx = world.idx(cx + dx, cy + dy);
      if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.ABYSS) continue;
      world.factionControl[idx] = owner;
    }
  }
}

export function canFitBazaarRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  for (const room of world.rooms) {
    if (rectsOverlap(x - 1, y - 1, w + 2, h + 2, room.x - 1, room.y - 1, room.w + 2, room.h + 2)) return false;
  }
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(x + dx, y + dy);
      if (world.cells[i] !== Cell.WALL || world.doors.has(i)) return false;
    }
  }
  return true;
}

export function rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function inMarket88CoreKeepout(world: World, x: number, y: number, w: number, h: number): boolean {
  const cx = x + (w >> 1);
  const cy = y + (h >> 1);
  return Math.abs(world.delta(cx, 512)) < 92 && Math.abs(world.delta(cy, 512)) < 96;
}

export function connectRoomToPoint(
  world: World,
  room: Room,
  side: Market88RoomSide,
  targetX: number,
  targetY: number,
  state: DoorState,
  keyId: string,
): void {
  const offset = side === 'north' || side === 'south'
    ? Math.max(2, Math.min(room.w - 3, room.w >> 1))
    : Math.max(2, Math.min(room.h - 3, room.h >> 1));
  const door = addRoomDoor(world, room, side, offset, state, keyId);
  if (!door) return;
  const sx = side === 'west' ? door.x - 1 : side === 'east' ? door.x + 1 : door.x;
  const sy = side === 'north' ? door.y - 1 : side === 'south' ? door.y + 1 : door.y;
  carveMarketLine(world, sx, sy, targetX, targetY, 1, Tex.F_CONCRETE);
}

export function addRoomDoor(
  world: World,
  room: Room,
  side: Market88RoomSide,
  offset: number,
  state: DoorState,
  keyId: string,
): { x: number; y: number } | null {
  const x = side === 'west' ? room.x - 1 : side === 'east' ? room.x + room.w : room.x + offset;
  const y = side === 'north' ? room.y - 1 : side === 'south' ? room.y + room.h : room.y + offset;
  addDoorCell(world, x, y, state, room.id, -1, keyId);
  return { x, y };
}

export function addShutterGate(world: World, x: number, y: number, axis: 'east_west' | 'north_south'): void {
  if (axis === 'east_west') {
    carveMarketCell(world, x - 1, y, Tex.F_CONCRETE);
    carveMarketCell(world, x + 1, y, Tex.F_CONCRETE);
    setMarketWall(world, x, y - 1, Tex.METAL);
    setMarketWall(world, x, y + 1, Tex.METAL);
  } else {
    carveMarketCell(world, x, y - 1, Tex.F_CONCRETE);
    carveMarketCell(world, x, y + 1, Tex.F_CONCRETE);
    setMarketWall(world, x - 1, y, Tex.METAL);
    setMarketWall(world, x + 1, y, Tex.METAL);
  }
  addDoorCell(world, x, y, DoorState.HERMETIC_CLOSED, -1, -1, '');
  stampSurfaceSplat(world, x, y, 0.5, 0.5, 2, 0.35, 88100 + x + y, 112, 88, 38, true);
}

export function addDoorCell(world: World, x: number, y: number, state: DoorState, roomA: number, roomB: number, keyId: string): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.LIFT) return;
  world.cells[i] = Cell.DOOR;
  world.roomMap[i] = -1;
  world.wallTex[i] = Tex.DOOR_METAL;
  world.floorTex[i] = Tex.F_CONCRETE;
  world.doors.set(i, { idx: i, state, roomA, roomB, keyId, timer: 0 });
  const a = world.rooms[roomA];
  if (a && !a.doors.includes(i)) a.doors.push(i);
  const b = world.rooms[roomB];
  if (b && !b.doors.includes(i)) b.doors.push(i);
}

export function carveMarketLine(world: World, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex): void {
  let x = world.wrap(ax);
  let y = world.wrap(ay);
  const tx = world.wrap(bx);
  const ty = world.wrap(by);
  const sx = tx === x ? 0 : world.delta(x, tx) > 0 ? 1 : -1;
  const sy = ty === y ? 0 : world.delta(y, ty) > 0 ? 1 : -1;
  let guard = 0;
  while (x !== tx && guard++ < W) {
    carveMarketDisc(world, x, y, width, floorTex);
    x = world.wrap(x + sx);
  }
  guard = 0;
  while (y !== ty && guard++ < W) {
    carveMarketDisc(world, x, y, width, floorTex);
    y = world.wrap(y + sy);
  }
  carveMarketDisc(world, x, y, width, floorTex);
}

export function carveMarketDisc(world: World, cx: number, cy: number, r: number, floorTex: Tex): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      carveMarketCell(world, cx + dx, cy + dy, floorTex);
    }
  }
}

export function carveMarketCell(world: World, x: number, y: number, floorTex: Tex): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.LIFT || world.cells[i] === Cell.DOOR) return;
  world.cells[i] = Cell.FLOOR;
  if (world.roomMap[i] < 0) world.roomMap[i] = -1;
  world.floorTex[i] = floorTex;
}

export function setMarketWall(world: World, x: number, y: number, wallTex: Tex): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.LIFT || world.roomMap[i] >= 0 || world.containerMap.has(i)) return;
  world.cells[i] = Cell.WALL;
  world.roomMap[i] = -1;
  world.features[i] = Feature.NONE;
  world.wallTex[i] = wallTex;
}

export function setMarketFeature(world: World, x: number, y: number, feature: Feature): void {
  const i = world.idx(x, y);
  if (world.cells[i] !== Cell.FLOOR || world.features[i] !== Feature.NONE || world.containerMap.has(i)) return;
  world.features[i] = feature;
}

export function decorateStallRoom(world: World, room: Room, rng: () => number, storage: boolean): void {
  for (let dx = 2; dx < room.w - 2; dx += 4) {
    setMarketFeature(world, room.x + dx, room.y + 2, storage ? Feature.SHELF : Feature.DESK);
  }
  if (room.h > 6) {
    setMarketFeature(world, room.x + 2, room.y + room.h - 3, storage ? Feature.MACHINE : Feature.TABLE);
    setMarketFeature(world, room.x + room.w - 3, room.y + room.h - 3, rng() < 0.5 ? Feature.CANDLE : Feature.LAMP);
  }
}

export function buildMarketRooms(world: World): MarketRooms {
  const x = 492;
  const y = 492;
  return {
    publicGate: makeRoom(world, 0, RoomType.CORRIDOR, x - 11, y + 5, 10, 6, 'Парольный вход 88', Tex.METAL, Tex.F_CONCRETE),
    mainLane: makeRoom(world, 1, RoomType.COMMON, x, y, 36, 16, 'Рыночные ряды 88', Tex.METAL, Tex.F_CONCRETE),
    debtOffice: makeRoom(world, 2, RoomType.OFFICE, x + 3, y - 11, 12, 10, 'Долговая контора 88', Tex.METAL, Tex.F_GREEN_CARPET),
    documentGate: makeRoom(world, 3, RoomType.CORRIDOR, x + 20, y - 18, 12, 6, 'Документальный вход 88', Tex.MARBLE, Tex.F_MARBLE_TILE),
    documentBooth: makeRoom(world, 4, RoomType.OFFICE, x + 20, y - 11, 12, 10, 'Бумажная будка 88', Tex.MARBLE, Tex.F_RED_CARPET),
    weaponStall: makeRoom(world, 5, RoomType.STORAGE, x + 3, y + 17, 13, 9, 'Оружейный ряд 88', Tex.METAL, Tex.F_CONCRETE),
    medicineLocker: makeRoom(world, 6, RoomType.MEDICAL, x + 20, y + 17, 13, 9, 'Лекарственный шкаф 88', Tex.TILE_W, Tex.F_TILE),
    serviceHatch: makeRoom(world, 7, RoomType.PRODUCTION, x + 37, y + 5, 10, 6, 'Служебный люк 88', Tex.PIPE, Tex.F_CONCRETE),
    courierHideout: makeRoom(world, 8, RoomType.SMOKING, x + 37, y + 13, 10, 8, 'Курьерская щель 88', Tex.BRICK, Tex.F_LINO),
  };
}

export function makeRoom(
  world: World,
  id: number,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, id, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.WALL) world.wallTex[i] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) world.floorTex[world.idx(room.x + dx, room.y + dy)] = floorTex;
  }
  return room;
}

export function linkMarketRooms(world: World, rooms: MarketRooms): void {
  placeSharedDoor(world, rooms.publicGate, rooms.mainLane, DoorState.CLOSED, '');
  placeSharedDoor(world, rooms.mainLane, rooms.debtOffice, DoorState.CLOSED, '');
  placeSharedDoor(world, rooms.mainLane, rooms.documentBooth, DoorState.LOCKED, 'key');
  placeSharedDoor(world, rooms.documentGate, rooms.documentBooth, DoorState.LOCKED, 'key');
  placeSharedDoor(world, rooms.mainLane, rooms.weaponStall, DoorState.CLOSED, '');
  placeSharedDoor(world, rooms.mainLane, rooms.medicineLocker, DoorState.CLOSED, '');
  placeSharedDoor(world, rooms.mainLane, rooms.serviceHatch, DoorState.LOCKED, 'key');
  placeSharedDoor(world, rooms.serviceHatch, rooms.courierHideout, DoorState.HERMETIC_CLOSED, '');
}

export function placeSharedDoor(world: World, a: Room, b: Room, state: DoorState, keyId: string): void {
  const candidates: number[] = [];
  for (let dy = -1; dy <= a.h; dy++) {
    for (let dx = -1; dx <= a.w; dx++) {
      if (dx >= 0 && dx < a.w && dy >= 0 && dy < a.h) continue;
      const wx = world.wrap(a.x + dx);
      const wy = world.wrap(a.y + dy);
      const i = world.idx(wx, wy);
      if (world.cells[i] !== Cell.WALL) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (world.roomMap[world.idx(wx + ox, wy + oy)] === b.id && world.roomMap[world.idx(wx - ox, wy - oy)] === a.id) {
          candidates.push(i);
          break;
        }
      }
    }
  }
  if (candidates.length === 0) return;
  const doorIdx = candidates[Math.floor(candidates.length / 2)];
  world.cells[doorIdx] = Cell.DOOR;
  world.doors.set(doorIdx, { idx: doorIdx, state, roomA: a.id, roomB: b.id, keyId, timer: 0 });
  a.doors.push(doorIdx);
  b.doors.push(doorIdx);
}

export function decorateMarketRooms(world: World, rooms: MarketRooms): void {
  for (let dx = 3; dx < rooms.mainLane.w - 3; dx += 4) {
    world.features[world.idx(rooms.mainLane.x + dx, rooms.mainLane.y + 4)] = Feature.DESK;
    world.features[world.idx(rooms.mainLane.x + dx, rooms.mainLane.y + 11)] = Feature.SHELF;
  }
  for (let dx = 4; dx < rooms.mainLane.w - 4; dx += 8) {
    world.features[world.idx(rooms.mainLane.x + dx, rooms.mainLane.y + 2)] = Feature.LAMP;
  }
  world.features[world.idx(rooms.debtOffice.x + 3, rooms.debtOffice.y + 3)] = Feature.DESK;
  world.features[world.idx(rooms.debtOffice.x + 8, rooms.debtOffice.y + 2)] = Feature.SHELF;
  world.features[world.idx(rooms.debtOffice.x + 6, rooms.debtOffice.y + 7)] = Feature.LAMP;

  world.features[world.idx(rooms.documentBooth.x + 2, rooms.documentBooth.y + 2)] = Feature.DESK;
  world.features[world.idx(rooms.documentBooth.x + 7, rooms.documentBooth.y + 2)] = Feature.SHELF;
  world.features[world.idx(rooms.documentBooth.x + 9, rooms.documentBooth.y + 7)] = Feature.LAMP;

  for (let dx = 2; dx < rooms.weaponStall.w - 1; dx += 3) {
    world.features[world.idx(rooms.weaponStall.x + dx, rooms.weaponStall.y + 2)] = Feature.SHELF;
  }
  world.features[world.idx(rooms.weaponStall.x + 7, rooms.weaponStall.y + 6)] = Feature.MACHINE;

  for (let dx = 2; dx < rooms.medicineLocker.w - 1; dx += 3) {
    world.features[world.idx(rooms.medicineLocker.x + dx, rooms.medicineLocker.y + 2)] = Feature.SHELF;
  }
  world.features[world.idx(rooms.medicineLocker.x + 7, rooms.medicineLocker.y + 6)] = Feature.APPARATUS;

  world.features[world.idx(rooms.serviceHatch.x + 4, rooms.serviceHatch.y + 3)] = Feature.MACHINE;
  world.features[world.idx(rooms.courierHideout.x + 3, rooms.courierHideout.y + 3)] = Feature.CHAIR;
  world.features[world.idx(rooms.courierHideout.x + 7, rooms.courierHideout.y + 4)] = Feature.CANDLE;
}

export function addAccessLifts(world: World, rooms: MarketRooms): void {
  addLiftGate(world, rooms.publicGate, rooms.publicGate.x - 1, rooms.publicGate.y + 3, rooms.publicGate.x, rooms.publicGate.y + 3, LiftDirection.UP);
  addLiftGate(world, rooms.serviceHatch, rooms.serviceHatch.x + rooms.serviceHatch.w, rooms.serviceHatch.y + 3, rooms.serviceHatch.x + rooms.serviceHatch.w - 1, rooms.serviceHatch.y + 3, LiftDirection.DOWN);
  addLiftGate(world, rooms.documentGate, rooms.documentGate.x + 6, rooms.documentGate.y - 1, rooms.documentGate.x + 6, rooms.documentGate.y, LiftDirection.UP);
}

export function addLiftGate(world: World, room: Room, liftX: number, liftY: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const i = world.idx(liftX, liftY);
  world.cells[i] = Cell.LIFT;
  world.roomMap[i] = -1;
  world.wallTex[i] = Tex.LIFT_DOOR;
  world.floorTex[i] = Tex.F_CONCRETE;
  world.liftDir[i] = direction;
  const bi = world.idx(buttonX, buttonY);
  world.features[bi] = Feature.LIFT_BUTTON;
  world.liftDir[bi] = direction;
  void room;
}

export function tuneMarketZones(world: World): void {
  for (const zone of world.zones) {
    zone.level = 3;
    zone.fogged = false;
    zone.faction = zone.id % 5 === 0 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
    zone.hasLift = false;
  }
}

