import { DoorState, ZoneFaction, type GameState, type WorldEvent } from '../../core/types';
import { World } from '../../core/world';
import { designNpcFloorKey } from '../../data/plot';
import { publishEvent } from '../../systems/events';
import type { FloorGeneration } from '../floor_manifest';
import type { ServicePowerZoneId, ServiceLiftMachineState } from './utility_graph';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('service_floor');

export const DESIGN_FLOOR_ID = 'service_floor' as const;
export const SERVICE_FLOOR_Z = -18;
export const SERVICE_FLOOR_BASE_FLOOR = 140;

export const MASTER_SCOPE_TAG = 'service_master_scope';
export const LIFT_MACHINE_ROOM = 'Машинный зал лифтовой группы С-15';
export const BREAKER_ROOM = 'Щитовая служебного этажа С-15';
export const JANITOR_DEPOT = 'Кладовая дежурных ключей С-15';
export const VENT_JUNCTION = 'Вентиляционный узел над шахтой С-15';
export const STAFF_CANTEEN = 'Столовая ремонтной смены С-15';
export const CLERK_OFFICE = 'Запертая диспетчерская рейдов С-15';
export const PUMP_RESCUE_ROOM = 'Насосная ниша западного стояка С-15';
export const DRAINAGE_BASIN_NW = 'Дренажный бассейн северо-западного кабельного фронта С-15';
export const DRAINAGE_BASIN_NE = 'Дренажный бассейн северо-восточного кабельного фронта С-15';
export const DRAINAGE_BASIN_SW = 'Дренажный бассейн юго-западного кабельного фронта С-15';
export const DRAINAGE_BASIN_SE = 'Дренажный бассейн юго-восточного кабельного фронта С-15';

export type ServiceDoorSide = 'north' | 'south' | 'west' | 'east';

export interface ServiceRoomDoorSpec {
  side: ServiceDoorSide;
  targetX: number;
  targetY: number;
  state?: DoorState;
  keyId?: string;
}

export interface ServiceHqCompoundSpec {
  owner: ZoneFaction;
  label: string;
  corridor: readonly [number, number, number, number];
  route: readonly [number, number, number, number];
  core: readonly [number, number, number, number, ServiceDoorSide, string];
  supportPrefix: string;
}

export interface ServiceBayRowSpec {
  label: string;
  owner: ZoneFaction;
  typeSeed: number;
  horizontal: boolean;
  corridor: number;
  start: number;
  end: number;
  side: -1 | 1;
  step: number;
  span: number;
}

export const SERVICE_HQ_COMPOUNDS: readonly ServiceHqCompoundSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    label: 'Гражданский узел бытового обхода С-15',
    corridor: [92, 270, 202, 270],
    route: [202, 270, 244, 270],
    core: [132, 248, 28, 13, 'south', 'Гражданский гермокор бытового обхода С-15'],
    supportPrefix: 'Гражданский обход С-15',
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    label: 'Главный пост ликвидаторов С-15',
    corridor: [566, 228, 744, 228],
    route: [612, 228, 612, 188],
    core: [638, 206, 34, 13, 'south', 'Гермопост ликвидаторов С-15'],
    supportPrefix: 'Пост ликвидаторов С-15',
  },
  {
    owner: ZoneFaction.SCIENTIST,
    label: 'НИИ-служба измерения шахт С-15',
    corridor: [832, 300, 972, 300],
    route: [780, 300, 832, 300],
    core: [884, 278, 28, 13, 'south', 'Гермолаборатория шахт С-15'],
    supportPrefix: 'НИИ шахт С-15',
  },
  {
    owner: ZoneFaction.CULTIST,
    label: 'Скрытый культовый лаз С-15',
    corridor: [86, 742, 214, 742],
    route: [214, 742, 244, 742],
    core: [138, 720, 28, 13, 'south', 'Скрытый культовый гермолаз С-15'],
    supportPrefix: 'Культовый лаз С-15',
  },
  {
    owner: ZoneFaction.WILD,
    label: 'Дикий разборный лагерь С-15',
    corridor: [830, 744, 972, 744],
    route: [780, 744, 830, 744],
    core: [884, 708, 30, 13, 'south', 'Разбитый гермокор диких С-15'],
    supportPrefix: 'Дикий лагерь С-15',
  },
];

export const SERVICE_BAY_ROWS: readonly ServiceBayRowSpec[] = [
  { label: 'Северная кабельная кассета', owner: ZoneFaction.LIQUIDATOR, typeSeed: 0, horizontal: true, corridor: 188, start: 268, end: 424, side: -1, step: 27, span: 12 },
  { label: 'Северный ремонтный шкаф', owner: ZoneFaction.SCIENTIST, typeSeed: 3, horizontal: true, corridor: 188, start: 270, end: 420, side: 1, step: 26, span: 13 },
  { label: 'Северо-восточная кабельная кассета', owner: ZoneFaction.LIQUIDATOR, typeSeed: 5, horizontal: true, corridor: 188, start: 604, end: 744, side: -1, step: 26, span: 12 },
  { label: 'Верхняя венткамера', owner: ZoneFaction.SCIENTIST, typeSeed: 7, horizontal: true, corridor: 324, start: 270, end: 490, side: -1, step: 25, span: 12 },
  { label: 'Пультовая верхнего пролёта', owner: ZoneFaction.LIQUIDATOR, typeSeed: 11, horizontal: true, corridor: 324, start: 542, end: 760, side: -1, step: 25, span: 12 },
  { label: 'Нижняя венткамера', owner: ZoneFaction.WILD, typeSeed: 13, horizontal: true, corridor: 324, start: 270, end: 488, side: 1, step: 28, span: 13 },
  { label: 'Запасной щиток пролёта', owner: ZoneFaction.LIQUIDATOR, typeSeed: 17, horizontal: true, corridor: 324, start: 544, end: 760, side: 1, step: 28, span: 13 },
  { label: 'Западная насосная гряда', owner: ZoneFaction.WILD, typeSeed: 19, horizontal: true, corridor: 700, start: 270, end: 488, side: 1, step: 27, span: 13 },
  { label: 'Восточная насосная гряда', owner: ZoneFaction.LIQUIDATOR, typeSeed: 23, horizontal: true, corridor: 700, start: 544, end: 760, side: 1, step: 27, span: 13 },
  { label: 'Южная кабельная кассета', owner: ZoneFaction.LIQUIDATOR, typeSeed: 29, horizontal: true, corridor: 836, start: 270, end: 424, side: -1, step: 27, span: 12 },
  { label: 'Южный ремонтный шкаф', owner: ZoneFaction.CULTIST, typeSeed: 31, horizontal: true, corridor: 836, start: 270, end: 424, side: 1, step: 27, span: 12 },
  { label: 'Юго-восточная кабельная кассета', owner: ZoneFaction.LIQUIDATOR, typeSeed: 37, horizontal: true, corridor: 836, start: 604, end: 744, side: -1, step: 26, span: 12 },
  { label: 'Южный склад обратного хода', owner: ZoneFaction.WILD, typeSeed: 41, horizontal: true, corridor: 836, start: 604, end: 744, side: 1, step: 26, span: 12 },
  { label: 'Западный вертикальный обход', owner: ZoneFaction.CITIZEN, typeSeed: 43, horizontal: false, corridor: 244, start: 220, end: 804, side: -1, step: 31, span: 22 },
  { label: 'Западная внутренняя полка', owner: ZoneFaction.LIQUIDATOR, typeSeed: 47, horizontal: false, corridor: 244, start: 220, end: 804, side: 1, step: 31, span: 22 },
  { label: 'Центральная левая полка', owner: ZoneFaction.LIQUIDATOR, typeSeed: 53, horizontal: false, corridor: 520, start: 214, end: 806, side: -1, step: 29, span: 19 },
  { label: 'Центральная правая полка', owner: ZoneFaction.SCIENTIST, typeSeed: 59, horizontal: false, corridor: 520, start: 214, end: 806, side: 1, step: 29, span: 19 },
  { label: 'Восточная внутренняя полка', owner: ZoneFaction.LIQUIDATOR, typeSeed: 61, horizontal: false, corridor: 780, start: 220, end: 804, side: -1, step: 31, span: 22 },
  { label: 'Восточный вертикальный обход', owner: ZoneFaction.WILD, typeSeed: 67, horizontal: false, corridor: 780, start: 220, end: 804, side: 1, step: 31, span: 22 },
];

export const SERVICE_LIQUIDATOR_OUTPOST_NAMES = [
  'Пост ликвидаторов у западной перемычки С-15',
  'Пост ликвидаторов у восточной перемычки С-15',
  'Караульная нижнего машинного кольца С-15',
] as const;

export type ServiceUtilityDomain = 'lift' | 'power' | 'water' | 'vent';
export type ServiceUtilityFront = 'staff_safe' | 'machine_maze' | 'pressure_basin' | 'route_transfer';
export type ServiceUtilityEdgeKind = 'lift_cable' | 'power_cable' | 'water_pipe' | 'duct';

export interface ServicePowerZoneFlag {
  id: ServicePowerZoneId;
  name: string;
  powered: boolean;
  roomId: number;
}

export interface ServiceRerouteFlags {
  lowerStaffRouteOpen: boolean;
  marketRaidDiverted: boolean;
  productionBypassArmed: boolean;
}

export type ServiceTransferRouteId =
  | 'service_to_production_belt_feed'
  | 'service_to_dark_metro_signal'
  | 'service_to_darkness_light_reserve';

export interface ServiceTransferRoute {
  id: ServiceTransferRouteId;
  label: string;
  sourceRoomName: string;
  targetRouteId: 'production_belt' | 'dark_metro' | 'darkness';
  requiresZone: ServicePowerZoneId;
  routeFlag: keyof ServiceRerouteFlags | 'power';
  clue: string;
}

export interface ServiceFloorState {
  routeId: typeof DESIGN_FLOOR_ID;
  anchorZ: number;
  themeTags: readonly string[];
  liftMachineState: ServiceLiftMachineState;
  masterKeyKnown: boolean;
  powerZones: ServicePowerZoneFlag[];
  rerouteFlags: ServiceRerouteFlags;
  transferRoutes: ServiceTransferRoute[];
  scopedDoorIds: number[];
  scopedContainerIds: number[];
  debugEntry: {
    spawnX: number;
    spawnY: number;
    summary: string;
  };
}

export interface ServiceFloorGeneration extends FloorGeneration {
  serviceState: ServiceFloorState;
}

export interface ServiceFloorExpansionStyle {
  wallTex: DoorState | number;
  floorTex: DoorState | number;
}

export const SERVICE_FLOOR_MASTER_SCOPE = {
  tag: MASTER_SCOPE_TAG,
  rooms: [JANITOR_DEPOT, CLERK_OFFICE],
  note: 'Scoped to recorded Service Floor doors and containers only; it does not use the generic key door path.',
} as const;

export const SERVICE_TRANSFER_ROUTES: readonly ServiceTransferRoute[] = [
  {
    id: 'service_to_production_belt_feed',
    label: 'Обход питания к Производственному поясу',
    sourceRoomName: LIFT_MACHINE_ROOM,
    targetRouteId: 'production_belt',
    requiresZone: 'machine_hall',
    routeFlag: 'productionBypassArmed',
    clue: 'После ремонта С-15 нижний персональный коридор принимает дверь-комплекты и энергоячейки с Пояса.',
  },
  {
    id: 'service_to_dark_metro_signal',
    label: 'Сигнальный лаз в Темную пересадку',
    sourceRoomName: VENT_JUNCTION,
    targetRouteId: 'dark_metro',
    requiresZone: 'ventilation',
    routeFlag: 'power',
    clue: 'Запитанная вентиляция дает короткий путь к стрелочной будке метро, но зовет ламповых.',
  },
  {
    id: 'service_to_darkness_light_reserve',
    label: 'Резерв аварийного света для позднего маршрута',
    sourceRoomName: BREAKER_ROOM,
    targetRouteId: 'darkness',
    requiresZone: 'breaker_room',
    routeFlag: 'power',
    clue: 'Релейная схема может уйти в поздний световой карман вместо местного комфорта.',
  },
];

export function createServiceFloorState(): ServiceFloorState {
  return {
    routeId: DESIGN_FLOOR_ID,
    anchorZ: SERVICE_FLOOR_Z,
    themeTags: ['maintenance_service', 'engineering'],

    liftMachineState: 'faulty',
    masterKeyKnown: false,
    powerZones: [],
    rerouteFlags: {
      lowerStaffRouteOpen: false,
      marketRaidDiverted: false,
      productionBypassArmed: false,
    },
    transferRoutes: SERVICE_TRANSFER_ROUTES.map(route => ({ ...route })),
    scopedDoorIds: [],
    scopedContainerIds: [],
    debugEntry: {
      spawnX: 416.5,
      spawnY: 514.5,
      summary: 'service_floor z=-18 spawn at west service lift; east lift is reachable through the staff corridor.',
    },
  };
}

export function summarizeServiceFloorFlags(service: ServiceFloorState): string[] {
  const powered = service.powerZones
    .filter(z => z.powered)
    .map(z => z.id)
    .join(',') || 'none';
  return [
    `route=${service.routeId} z=${service.anchorZ} base=${service.themeTags[0] ?? 'none'}`,
    `liftMachine=${service.liftMachineState} masterKeyKnown=${service.masterKeyKnown}`,
    `power=${powered}`,
    `reroute lower=${service.rerouteFlags.lowerStaffRouteOpen} marketRaidDiverted=${service.rerouteFlags.marketRaidDiverted} productionBypass=${service.rerouteFlags.productionBypassArmed}`,
    `transfers=${service.transferRoutes.map(route => `${route.id}:${route.targetRouteId}`).join(',') || 'none'}`,
    `scope doors=${service.scopedDoorIds.length} containers=${service.scopedContainerIds.length}`,
  ];
}

export function applyServiceMasterKeyScope(world: World, service: ServiceFloorState): { doors: number; containers: number } {
  let doors = 0;
  let containers = 0;
  for (const id of service.scopedDoorIds) {
    const door = world.doors.get(id);
    if (!door || door.state !== DoorState.LOCKED) continue;
    door.state = DoorState.CLOSED;
    door.keyId = '';
    doors++;
  }
  for (const id of service.scopedContainerIds) {
    const container = world.containerById.get(id);
    if (!container || !container.tags.includes(MASTER_SCOPE_TAG)) continue;
    if (container.access !== 'room') {
      container.access = 'room';
      container.discovered = true;
      containers++;
    }
  }
  return { doors, containers };
}

export function learnServiceMasterKey(game: GameState, world: World, service: ServiceFloorState): WorldEvent {
  service.masterKeyKnown = true;
  const changed = applyServiceMasterKeyScope(world, service);
  return publishEvent(game, {
    type: 'door_opened',
    z: game.currentZ,
    severity: 3,
    privacy: 'local',
    tags: ['service_floor', 'master_key_scope', 'access_flag'],
    data: {
      routeId: service.routeId,
      scopeTag: MASTER_SCOPE_TAG,
      changedDoors: changed.doors,
      changedContainers: changed.containers,
    },
  });
}

export function repairServiceLiftMachine(game: GameState, service: ServiceFloorState): WorldEvent {
  service.liftMachineState = 'repaired';
  service.rerouteFlags.lowerStaffRouteOpen = true;
  service.rerouteFlags.productionBypassArmed = true;
  return publishEvent(game, {
    type: 'elevator_loop_exit',
    z: game.currentZ,
    severity: 4,
    privacy: 'local',
    tags: ['service_floor', 'lift_machine', 'repair', 'route_flag'],
    data: {
      routeId: service.routeId,
      anchorZ: service.anchorZ,
      liftMachineState: service.liftMachineState,
      lowerStaffRouteOpen: service.rerouteFlags.lowerStaffRouteOpen,
      productionBypassArmed: service.rerouteFlags.productionBypassArmed,
      transferRoutes: service.transferRoutes
        .filter(route => route.targetRouteId === 'production_belt')
        .map(route => route.id),
    },
  });
}

export function restoreServicePowerZone(
  game: GameState,
  service: ServiceFloorState,
  zoneId: ServicePowerZoneId,
): WorldEvent {
  for (const zone of service.powerZones) {
    if (zone.id === zoneId) zone.powered = true;
  }
  return publishEvent(game, {
    type: 'room_produced_items',
    z: game.currentZ,
    severity: 3,
    privacy: 'local',
    tags: ['service_floor', 'power', 'light_route'],
    data: {
      routeId: service.routeId,
      powerZone: zoneId,
      powered: true,
      transferRoutes: service.transferRoutes
        .filter(route => route.requiresZone === zoneId)
        .map(route => route.id),
    },
  });
}

export function rerouteServiceRaid(game: GameState, service: ServiceFloorState): WorldEvent {
  service.rerouteFlags.marketRaidDiverted = true;
  return publishEvent(game, {
    type: 'faction_patrol_clash',
    z: game.currentZ,
    severity: 4,
    privacy: 'local',
    tags: ['service_floor', 'raid', 'reroute_flag'],
    data: {
      routeId: service.routeId,
      marketRaidDiverted: service.rerouteFlags.marketRaidDiverted,
    },
  });
}
