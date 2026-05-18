/* ── Design floor: service_floor — lift machines and staff routes ─ */

import {
  AIGoal,
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Faction,
  Feature,
  FloorLevel,
  LiftDirection,
  MonsterKind,
  Occupation,
  QuestType,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type GameState,
  type Item,
  type Room,
  type WorldContainer,
  type WorldEvent,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { MONSTERS, applyMonsterVariant } from '../../entities/monster';
import { Spr } from '../../render/sprite_index';
import { publishEvent } from '../../systems/events';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { stampRoom } from '../shared';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_FLOOR_ID = 'service_floor' as const;
export const SERVICE_FLOOR_Z = 16;
export const SERVICE_FLOOR_BASE_FLOOR = FloorLevel.MAINTENANCE;

const MASTER_SCOPE_TAG = 'service_master_scope';
const LIFT_MACHINE_ROOM = 'Машинный зал лифтовой группы С-15';
const BREAKER_ROOM = 'Щитовая служебного этажа С-15';
const JANITOR_DEPOT = 'Кладовая дежурных ключей С-15';
const VENT_JUNCTION = 'Вентиляционный узел над шахтой С-15';
const STAFF_CANTEEN = 'Столовая ремонтной смены С-15';
const CLERK_OFFICE = 'Запертая диспетчерская рейдов С-15';

export type ServiceLiftMachineState = 'faulty' | 'repaired';
export type ServicePowerZoneId = 'machine_hall' | 'breaker_room' | 'staff_route' | 'ventilation';

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

export interface ServiceFloorState {
  routeId: typeof DESIGN_FLOOR_ID;
  anchorZ: number;
  baseFloor: FloorLevel;
  liftMachineState: ServiceLiftMachineState;
  masterKeyKnown: boolean;
  powerZones: ServicePowerZoneFlag[];
  rerouteFlags: ServiceRerouteFlags;
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

export const SERVICE_FLOOR_MASTER_SCOPE = {
  tag: MASTER_SCOPE_TAG,
  rooms: [JANITOR_DEPOT, CLERK_OFFICE],
  note: 'Scoped to recorded Service Floor doors and containers only; it does not use the generic key door path.',
} as const;

const BORIS_DEF: PlotNpcDef = {
  name: 'Борис Лифтёр',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.MECHANIC,
  sprite: Occupation.MECHANIC,
  hp: 170, maxHp: 170, money: 95, speed: 1.0,
  inventory: [
    { defId: 'wrench', count: 1 },
    { defId: 'lift_scheme', count: 1 },
    { defId: 'fuse', count: 1 },
  ],
  talkLines: [
    'Машина С-15 тянет кабину честно, а маршрут врёт. Если поменять предохранители, лифт хотя бы перестанет выбирать нижний этаж наугад.',
    'Я чиню не лифт целиком. Только маленькое право доехать туда, куда нажал.',
    'Служебный ключ не открывает мир. Он открывает две двери, за которые я потом отвечаю.',
  ],
  talkLinesPost: [
    'Маршрут держит. Не навсегда, но достаточно, чтобы успеть пожалеть о поездке.',
    'Если кнопка молчит, слушай реле. Реле врёт тише человека.',
  ],
};

const NADYA_DEF: PlotNpcDef = {
  name: 'Надя Ключница',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.STOREKEEPER,
  sprite: Occupation.STOREKEEPER,
  hp: 115, maxHp: 115, money: 65, speed: 0.95,
  inventory: [
    { defId: 'inspection_mirror', count: 1 },
    { defId: 'sealant_tube', count: 1 },
    { defId: 'cigs', count: 1 },
  ],
  talkLines: [
    'Мастер-ключ тут не главный. Главный тот, кто знает, какие две двери в ведомости, а какие придумали жильцы.',
    'Кладовая моя. Возьмёшь без спроса — шум пойдёт по трубам раньше тебя.',
    'Вентиляция ведёт быстро, если не боишься того, что питается светом.',
  ],
  talkLinesPost: [
    'Теперь ты знаешь малый круг. За большой круг людей списывают.',
    'Не показывай допуск в Министерстве. Они спросят, почему он полезный.',
  ],
};

const ROMA_DEF: PlotNpcDef = {
  name: 'Рома Щитовой',
  isFemale: false,
  faction: Faction.SCIENTIST,
  occupation: Occupation.ELECTRICIAN,
  sprite: Occupation.ELECTRICIAN,
  hp: 125, maxHp: 125, money: 80, speed: 1.0,
  inventory: [
    { defId: 'relay_diagram', count: 1 },
    { defId: 'fuse', count: 2 },
    { defId: 'flashlight', count: 1 },
  ],
  talkLines: [
    'Свет можно вернуть на один маршрут. На все нельзя: дом решит, что мы вызываем его наружу.',
    'Ламповый ест яркое. Поэтому я чиню темноту аккуратно.',
    'Если щитовая хлопнет во время самосбора, двери станут мнением.',
  ],
  talkLinesPost: [
    'Один контур горит. Второй пусть стыдится в темноте.',
    'Не стой под новой лампой слишком долго. Она теперь пахнет тобой.',
  ],
};

const CLERK_DEF: PlotNpcDef = {
  name: 'Павел Без Пропуска',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 100, maxHp: 100, money: 40, speed: 0.9,
  inventory: [
    { defId: 'elevator_override_form', count: 1 },
    { defId: 'official_permit_slip', count: 1 },
  ],
  talkLines: [
    'Меня заперли снаружи моего же журнала. Там рейдовая очередь, и она уже почти дошла до рынка.',
    'Переставь форму обхода — рейд пойдёт первым в пустой коридор, а не к людям.',
    'Это не спасение. Это перенос ошибки на адрес, где пока никто не расписался.',
  ],
  talkLinesPost: [
    'Журнал поменял очередь. Теперь он делает вид, что сам так решил.',
    'Если спросят, меня тут не было. Я всё ещё заперт, просто с другой стороны.',
  ],
};

registerSideQuest('service_liftmaster_boris', BORIS_DEF, [
  {
    id: 'service_fix_lift_machine',
    giverNpcId: 'service_liftmaster_boris',
    type: QuestType.FETCH,
    desc: 'Борис: «Три предохранителя в машинный зал С-15. Починим не весь лифт, а маленькое право доехать по кнопке.»',
    targetItem: 'fuse', targetCount: 3,
    rewardItem: 'lift_scheme', rewardCount: 1,
    extraRewards: [{ defId: 'gear', count: 1 }, { defId: 'elevator_override_form', count: 1 }],
    relationDelta: 14, xpReward: 90, moneyReward: 85,
  },
]);

registerSideQuest('service_janitor_nadya', NADYA_DEF, [
  {
    id: 'service_steal_master_key',
    giverNpcId: 'service_janitor_nadya',
    type: QuestType.VISIT,
    desc: 'Надя: «Зайди в кладовую С-15 и посмотри ведомость малого круга. Мастер-ключ тут означает ровно две двери.»',
    targetRoomName: JANITOR_DEPOT,
    rewardItem: 'door_kit', rewardCount: 1,
    extraRewards: [{ defId: 'inspection_mirror', count: 1 }],
    relationDelta: 10, xpReward: 60, moneyReward: 45,
  },
]);

registerSideQuest('service_electrician_roma', ROMA_DEF, [
  {
    id: 'service_restore_lights',
    giverNpcId: 'service_electrician_roma',
    type: QuestType.FETCH,
    desc: 'Рома: «Неси релейную схему. Поднимем свет на одном маршруте, а не устроим ламповым столовую.»',
    targetItem: 'relay_diagram', targetCount: 1,
    rewardItem: 'flashlight', rewardCount: 1,
    extraRewards: [{ defId: 'gasmask_filter', count: 1 }, { defId: 'fuse', count: 1 }],
    relationDelta: 12, xpReward: 75, moneyReward: 70,
  },
]);

registerSideQuest('service_locked_out_clerk', CLERK_DEF, [
  {
    id: 'service_reroute_raid',
    giverNpcId: 'service_locked_out_clerk',
    type: QuestType.FETCH,
    desc: 'Павел: «Бланк обхода в диспетчерскую С-15. Рейдовая очередь пойдёт в пустой коридор, если журнал поверит печати.»',
    targetItem: 'elevator_override_form', targetCount: 1,
    rewardItem: 'official_permit_slip', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 12 }],
    relationDelta: 8, xpReward: 80, moneyReward: 95,
  },
]);

export function createServiceFloorState(): ServiceFloorState {
  return {
    routeId: DESIGN_FLOOR_ID,
    anchorZ: SERVICE_FLOOR_Z,
    baseFloor: SERVICE_FLOOR_BASE_FLOOR,
    liftMachineState: 'faulty',
    masterKeyKnown: false,
    powerZones: [],
    rerouteFlags: {
      lowerStaffRouteOpen: false,
      marketRaidDiverted: false,
      productionBypassArmed: false,
    },
    scopedDoorIds: [],
    scopedContainerIds: [],
    debugEntry: {
      spawnX: 416.5,
      spawnY: 514.5,
      summary: 'service_floor z=16 spawn at west service lift; east lift is reachable through the staff corridor.',
    },
  };
}

export function summarizeServiceFloorFlags(service: ServiceFloorState): string[] {
  const powered = service.powerZones
    .filter(z => z.powered)
    .map(z => z.id)
    .join(',') || 'none';
  return [
    `route=${service.routeId} z=${service.anchorZ} base=${FloorLevel[service.baseFloor]}`,
    `liftMachine=${service.liftMachineState} masterKeyKnown=${service.masterKeyKnown}`,
    `power=${powered}`,
    `reroute lower=${service.rerouteFlags.lowerStaffRouteOpen} marketRaidDiverted=${service.rerouteFlags.marketRaidDiverted} productionBypass=${service.rerouteFlags.productionBypassArmed}`,
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
    floor: game.currentFloor,
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
    floor: game.currentFloor,
    severity: 4,
    privacy: 'local',
    tags: ['service_floor', 'lift_machine', 'repair', 'route_flag'],
    data: {
      routeId: service.routeId,
      anchorZ: service.anchorZ,
      liftMachineState: service.liftMachineState,
      lowerStaffRouteOpen: service.rerouteFlags.lowerStaffRouteOpen,
      productionBypassArmed: service.rerouteFlags.productionBypassArmed,
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
    floor: game.currentFloor,
    severity: 3,
    privacy: 'local',
    tags: ['service_floor', 'power', 'light_route'],
    data: {
      routeId: service.routeId,
      powerZone: zoneId,
      powered: true,
    },
  });
}

export function rerouteServiceRaid(game: GameState, service: ServiceFloorState): WorldEvent {
  service.rerouteFlags.marketRaidDiverted = true;
  return publishEvent(game, {
    type: 'faction_patrol_clash',
    floor: game.currentFloor,
    severity: 4,
    privacy: 'local',
    tags: ['service_floor', 'raid', 'reroute_flag'],
    data: {
      routeId: service.routeId,
      marketRaidDiverted: service.rerouteFlags.marketRaidDiverted,
    },
  });
}

export function generateServiceFloorDesignFloor(): ServiceFloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 1 };
  const serviceState = createServiceFloorState();

  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.METAL;
    world.floorTex[i] = Tex.F_CONCRETE;
  }

  carveStaffRoute(world, 430, 512, 190, 5);
  carveStaffRoute(world, 520, 478, 5, 82);
  carveStaffRoute(world, 458, 504, 112, 3);
  carveStaffRoute(world, 478, 538, 84, 3);

  const westLift = stampServiceRoom(world, RoomType.CORRIDOR, 410, 508, 15, 12, 'Западный служебный лифт С-15', Tex.LIFT_DOOR, Tex.F_CONCRETE);
  const eastLift = stampServiceRoom(world, RoomType.CORRIDOR, 625, 508, 15, 12, 'Восточный служебный лифт С-15', Tex.LIFT_DOOR, Tex.F_CONCRETE);
  const machine = stampServiceRoom(world, RoomType.PRODUCTION, 488, 486, 30, 19, LIFT_MACHINE_ROOM, Tex.PIPE, Tex.F_CONCRETE);
  const breaker = stampServiceRoom(world, RoomType.PRODUCTION, 470, 526, 22, 15, BREAKER_ROOM, Tex.METAL, Tex.F_TILE);
  const janitor = stampServiceRoom(world, RoomType.STORAGE, 438, 526, 20, 13, JANITOR_DEPOT, Tex.PANEL, Tex.F_LINO);
  const vent = stampServiceRoom(world, RoomType.CORRIDOR, 536, 486, 24, 17, VENT_JUNCTION, Tex.DARK, Tex.F_CONCRETE);
  const canteen = stampServiceRoom(world, RoomType.KITCHEN, 548, 526, 28, 16, STAFF_CANTEEN, Tex.TILE_W, Tex.F_TILE);
  const clerk = stampServiceRoom(world, RoomType.OFFICE, 584, 494, 22, 13, CLERK_OFFICE, Tex.MARBLE, Tex.F_PARQUET);

  connectRoomRight(world, westLift, 430, 514, DoorState.CLOSED);
  connectRoomLeft(world, eastLift, 619, 514, DoorState.CLOSED);
  connectRoomDown(world, machine, 503, 512, DoorState.CLOSED);
  connectRoomUp(world, breaker, 482, 516, DoorState.CLOSED);
  const janitorDoor = connectRoomUp(world, janitor, 448, 516, DoorState.LOCKED);
  connectRoomDown(world, vent, 548, 512, DoorState.CLOSED);
  connectRoomUp(world, canteen, 562, 516, DoorState.CLOSED);
  const clerkDoor = connectRoomDown(world, clerk, 595, 512, DoorState.LOCKED);
  serviceState.scopedDoorIds.push(janitorDoor, clerkDoor);

  placeLift(world, westLift.x + 4, westLift.y + 6, LiftDirection.UP);
  placeLift(world, eastLift.x + eastLift.w - 5, eastLift.y + 6, LiftDirection.DOWN);

  dressCorridors(world);
  dressLiftMachine(world, machine);
  dressBreakerRoom(world, breaker);
  dressJanitorDepot(world, janitor);
  dressVentJunction(world, vent);
  dressCanteen(world, canteen);
  dressClerkOffice(world, clerk);

  generateServiceZones(world, [westLift, eastLift, machine, breaker, janitor, vent, canteen, clerk]);

  const borisId = spawnPlotNpc(entities, nextId, 'service_liftmaster_boris', BORIS_DEF, machine.x + 6, machine.y + 12, Math.PI);
  const romaId = spawnPlotNpc(entities, nextId, 'service_electrician_roma', ROMA_DEF, breaker.x + 5, breaker.y + 8, Math.PI / 2);
  const nadyaId = spawnPlotNpc(entities, nextId, 'service_janitor_nadya', NADYA_DEF, canteen.x + 5, canteen.y + 10, 0);
  spawnPlotNpc(entities, nextId, 'service_locked_out_clerk', CLERK_DEF, clerk.x - 3, 514, 0);

  addServiceContainer(world, machine, machine.x + machine.w - 3, machine.y + 3, ContainerKind.TOOL_LOCKER, 'Шкаф Бориса у лифтовой машины', 'owner', [
    { defId: 'fuse', count: 2 },
    { defId: 'gear', count: 1 },
    { defId: 'lift_scheme', count: 1 },
    { defId: 'wrench', count: 1 },
  ], borisId, BORIS_DEF.name, ['service_floor', 'lift_machine', 'repair']);

  addServiceContainer(world, breaker, breaker.x + breaker.w - 4, breaker.y + 3, ContainerKind.METAL_CABINET, 'Щитовой шкаф Ромы', 'owner', [
    { defId: 'relay_diagram', count: 1 },
    { defId: 'fuse', count: 2 },
    { defId: 'circuit_board', count: 1 },
  ], romaId, ROMA_DEF.name, ['service_floor', 'power']);

  const janitorContainer = addServiceContainer(world, janitor, janitor.x + 3, janitor.y + 3, ContainerKind.TOOL_LOCKER, 'Ведомость малого круга ключей', 'owner', [
    { defId: 'door_kit', count: 1 },
    { defId: 'inspection_mirror', count: 1 },
    { defId: 'sealant_tube', count: 2 },
    { defId: 'flashlight', count: 1 },
  ], nadyaId, NADYA_DEF.name, ['service_floor', MASTER_SCOPE_TAG, 'janitor']);

  const clerkContainer = addServiceContainer(world, clerk, clerk.x + clerk.w - 3, clerk.y + 3, ContainerKind.FILING_CABINET, 'Рейдовый журнал С-15', 'locked', [
    { defId: 'elevator_override_form', count: 1 },
    { defId: 'official_permit_slip', count: 2 },
    { defId: 'ration_registry_extract', count: 1 },
  ], undefined, undefined, ['service_floor', MASTER_SCOPE_TAG, 'raid']);

  serviceState.scopedContainerIds.push(janitorContainer.id, clerkContainer.id);

  addServiceContainer(world, canteen, canteen.x + canteen.w - 4, canteen.y + 4, ContainerKind.FRIDGE, 'Холодильник ремонтной смены', 'room', [
    { defId: 'water', count: 2 },
    { defId: 'bread', count: 1 },
    { defId: 'canned', count: 1 },
  ], undefined, undefined, ['service_floor', 'food']);

  dropItems(world, entities, nextId, machine, ['fuse', 'gear', 'sealant_tube']);
  dropItems(world, entities, nextId, breaker, ['fuse', 'relay_diagram']);
  dropItems(world, entities, nextId, vent, ['gasmask_filter', 'ammo_energy']);
  dropItems(world, entities, nextId, canteen, ['water', 'bread']);

  spawnMonsterPack(world, entities, nextId, vent.x + 12, vent.y + 8, [MonsterKind.LAMPOVY, MonsterKind.ROBOT, MonsterKind.REBAR]);
  spawnMonsterPack(world, entities, nextId, eastLift.x + 4, eastLift.y + 6, [MonsterKind.ROBOT, MonsterKind.SBORKA]);

  serviceState.powerZones = [
    { id: 'machine_hall', name: LIFT_MACHINE_ROOM, powered: true, roomId: machine.id },
    { id: 'breaker_room', name: BREAKER_ROOM, powered: false, roomId: breaker.id },
    { id: 'staff_route', name: 'Служебный коридор С-15', powered: true, roomId: -1 },
    { id: 'ventilation', name: VENT_JUNCTION, powered: false, roomId: vent.id },
  ];

  world.bakeLights();
  return {
    world,
    entities,
    spawnX: serviceState.debugEntry.spawnX,
    spawnY: serviceState.debugEntry.spawnY,
    serviceState,
  };
}

function stampServiceRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = wallTex;
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) world.floorTex[ci] = floorTex;
    }
  }
  return room;
}

function carveStaffRoute(world: World, x: number, y: number, w: number, h: number): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (dx < 0 || dx >= w || dy < 0 || dy >= h) {
        if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = Tex.METAL;
      } else {
        world.cells[ci] = Cell.FLOOR;
        world.roomMap[ci] = -1;
        world.floorTex[ci] = Tex.F_CONCRETE;
      }
    }
  }
}

function openRouteTile(world: World, x: number, y: number, floorTex = Tex.F_CONCRETE): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.LIFT) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = -1;
  world.floorTex[ci] = floorTex;
}

function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.WALL || world.cells[ci] === Cell.LIFT) return;
  world.features[ci] = feature;
}

function addDoor(world: World, room: Room, x: number, y: number, state: DoorState): number {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.DOOR;
  world.wallTex[ci] = room.wallTex;
  world.doors.set(ci, { idx: ci, state, roomA: room.id, roomB: -1, keyId: '', timer: 0 });
  room.doors.push(ci);
  return ci;
}

function connectRoomDown(world: World, room: Room, x: number, targetY: number, state: DoorState): number {
  const doorY = room.y + room.h;
  const doorId = addDoor(world, room, x, doorY, state);
  for (let y = doorY + 1; y <= targetY; y++) openRouteTile(world, x, y, room.floorTex);
  return doorId;
}

function connectRoomUp(world: World, room: Room, x: number, targetY: number, state: DoorState): number {
  const doorY = room.y - 1;
  const doorId = addDoor(world, room, x, doorY, state);
  for (let y = doorY - 1; y >= targetY; y--) openRouteTile(world, x, y, room.floorTex);
  return doorId;
}

function connectRoomLeft(world: World, room: Room, targetX: number, y: number, state: DoorState): number {
  const doorX = room.x - 1;
  const doorId = addDoor(world, room, doorX, y, state);
  for (let x = doorX - 1; x >= targetX; x--) openRouteTile(world, x, y, room.floorTex);
  return doorId;
}

function connectRoomRight(world: World, room: Room, targetX: number, y: number, state: DoorState): number {
  const doorX = room.x + room.w;
  const doorId = addDoor(world, room, doorX, y, state);
  for (let x = doorX + 1; x <= targetX; x++) openRouteTile(world, x, y, room.floorTex);
  return doorId;
}

function placeLift(world: World, x: number, y: number, direction: LiftDirection): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.liftDir[ci] = direction;
  setFeature(world, x + 1, y, Feature.LIFT_BUTTON);
  world.liftDir[world.idx(x + 1, y)] = direction;
}

function dressCorridors(world: World): void {
  for (let x = 438; x < 612; x += 12) {
    setFeature(world, x, 514, x % 24 === 0 ? Feature.SCREEN : Feature.LAMP);
  }
  for (let y = 484; y < 556; y += 10) {
    setFeature(world, 522, y, y % 20 === 0 ? Feature.APPARATUS : Feature.LAMP);
  }
  for (let x = 458; x < 570; x += 16) {
    setFeature(world, x, 505, Feature.APPARATUS);
  }
  for (let x = 480; x < 562; x += 14) {
    setFeature(world, x, 539, Feature.SHELF);
  }
}

function dressLiftMachine(world: World, room: Room): void {
  for (let y = room.y + 2; y < room.y + room.h - 2; y += 3) {
    setFeature(world, room.x + 2, y, Feature.MACHINE);
    setFeature(world, room.x + room.w - 3, y, Feature.APPARATUS);
  }
  for (let x = room.x + 6; x < room.x + room.w - 4; x += 5) {
    setFeature(world, x, room.y + 2, Feature.SCREEN);
    setFeature(world, x, room.y + room.h - 3, Feature.LAMP);
    world.stamp(x, room.y + 9, 0.5, 0.5, 0.18, 70, room.id * 53 + x, 30, 30, 35);
  }
  setFeature(world, room.x + 5, room.y + 5, Feature.LIFT_BUTTON);
}

function dressBreakerRoom(world: World, room: Room): void {
  for (let x = room.x + 2; x < room.x + room.w - 2; x += 3) {
    setFeature(world, x, room.y + 2, Feature.APPARATUS);
    setFeature(world, x, room.y + 5, Feature.SCREEN);
  }
  setFeature(world, room.x + 3, room.y + room.h - 3, Feature.DESK);
  setFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.LAMP);
}

function dressJanitorDepot(world: World, room: Room): void {
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    setFeature(world, room.x + 1, y, Feature.SHELF);
    if (y % 3 === 0) setFeature(world, room.x + room.w - 2, y, Feature.SINK);
  }
  setFeature(world, room.x + 5, room.y + 3, Feature.DESK);
  setFeature(world, room.x + 6, room.y + room.h - 3, Feature.LAMP);
}

function dressVentJunction(world: World, room: Room): void {
  for (let x = room.x + 3; x < room.x + room.w - 3; x += 4) {
    for (let y = room.y + 3; y < room.y + room.h - 3; y += 4) {
      setFeature(world, x, y, Feature.APPARATUS);
      world.stamp(x, y, 0.5, 0.5, 0.22, 90, room.id * 97 + x + y, 20, 22, 25);
    }
  }
  setFeature(world, room.x + room.w - 4, room.y + 2, Feature.LAMP);
}

function dressCanteen(world: World, room: Room): void {
  for (let x = room.x + 4; x < room.x + room.w - 4; x += 7) {
    setFeature(world, x, room.y + 5, Feature.TABLE);
    setFeature(world, x - 1, room.y + 5, Feature.CHAIR);
    setFeature(world, x + 1, room.y + 5, Feature.CHAIR);
  }
  setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
  setFeature(world, room.x + 5, room.y + 2, Feature.SINK);
  setFeature(world, room.x + room.w - 4, room.y + room.h - 4, Feature.LAMP);
}

function dressClerkOffice(world: World, room: Room): void {
  for (let y = room.y + 2; y < room.y + room.h - 2; y += 3) {
    setFeature(world, room.x + 2, y, Feature.SHELF);
    setFeature(world, room.x + room.w - 3, y, Feature.SCREEN);
  }
  setFeature(world, room.x + 7, room.y + 6, Feature.DESK);
  setFeature(world, room.x + 9, room.y + 6, Feature.CHAIR);
  setFeature(world, room.x + 4, room.y + 2, Feature.LAMP);
}

function generateServiceZones(world: World, rooms: Room[]): void {
  const zoneSize = W / 8;
  world.zones = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const id = y * 8 + x;
      world.zones.push({
        id,
        cx: Math.floor(x * zoneSize + zoneSize / 2),
        cy: Math.floor(y * zoneSize + zoneSize / 2),
        faction: ZoneFaction.LIQUIDATOR,
        hasLift: false,
        fogged: false,
        level: 3,
        hqRoomId: -1,
      });
    }
  }
  for (let y = 0; y < W; y++) {
    const zy = Math.min(7, Math.floor(y / zoneSize));
    for (let x = 0; x < W; x++) {
      const zx = Math.min(7, Math.floor(x / zoneSize));
      world.zoneMap[y * W + x] = zy * 8 + zx;
      world.factionControl[y * W + x] = ZoneFaction.LIQUIDATOR;
    }
  }
  for (const room of rooms) {
    const zi = world.zoneMap[world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2))];
    const zone = world.zones[zi];
    if (!zone) continue;
    zone.hasLift = zone.hasLift || room.name.includes('лифт');
    zone.level = Math.max(zone.level, room.name === VENT_JUNCTION ? 4 : 3);
  }
}

function spawnPlotNpc(
  entities: Entity[],
  nextId: { v: number },
  npcId: string,
  def: PlotNpcDef,
  x: number,
  y: number,
  angle: number,
): number {
  const id = nextId.v++;
  entities.push({
    id, type: EntityType.NPC,
    x: x + 0.5, y: y + 0.5, angle, pitch: 0,
    alive: true, speed: def.speed, sprite: def.sprite,
    name: def.name, isFemale: def.isFemale,
    needs: freshNeeds(), hp: def.hp, maxHp: def.maxHp, money: def.money,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: def.inventory.map(i => ({ ...i })),
    faction: def.faction, occupation: def.occupation,
    plotNpcId: npcId, canGiveQuest: true, questId: -1,
  });
  return id;
}

function addServiceContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: Item[],
  ownerNpcId: number | undefined,
  ownerName: string | undefined,
  tags: string[],
): WorldContainer {
  const container: WorldContainer = {
    id: nextContainerId(world),
    x,
    y,
    floor: SERVICE_FLOOR_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(i => ({ ...i })),
    capacitySlots: Math.max(8, inventory.length + 4),
    ownerNpcId,
    ownerName,
    access,
    discovered: access !== 'secret',
    tags,
  };
  world.addContainer(container);
  setFeature(world, x, y, kind === ContainerKind.FRIDGE ? Feature.SINK : Feature.SHELF);
  return container;
}

function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

function dropItems(world: World, entities: Entity[], nextId: { v: number }, room: Room, itemIds: string[]): void {
  for (let n = 0; n < itemIds.length; n++) {
    const x = room.x + 2 + ((n * 5) % Math.max(1, room.w - 4));
    const y = room.y + 2 + ((n * 3) % Math.max(1, room.h - 4));
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    entities.push({
      id: nextId.v++, type: EntityType.ITEM_DROP,
      x: x + 0.5, y: y + 0.5, angle: 0, pitch: 0,
      alive: true, speed: 0, sprite: Spr.ITEM_DROP,
      inventory: [{ defId: itemIds[n], count: 1 }],
    });
  }
}

function spawnMonsterPack(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  kinds: MonsterKind[],
): void {
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const def = MONSTERS[kind];
    if (!def) continue;
    const mx = x + (i % 2) * 3 - 1;
    const my = y + Math.floor(i / 2) * 3 - 1;
    const ci = world.idx(mx, my);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    const zone = world.zones[world.zoneMap[ci]];
    const zoneLevel = zone?.level ?? 3;
    const hp = scaleMonsterHp(def.hp, zoneLevel);
    const monster: Entity = {
      id: nextId.v++, type: EntityType.MONSTER,
      x: mx + 0.5, y: my + 0.5,
      angle: 0, pitch: 0,
      alive: true,
      speed: scaleMonsterSpeed(def.speed, zoneLevel),
      sprite: def.sprite,
      hp, maxHp: hp,
      monsterKind: kind, attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
      rpg: randomRPG(zoneLevel),
    };
    applyMonsterVariant(monster, SERVICE_FLOOR_BASE_FLOOR, true);
    entities.push(monster);
  }
}
