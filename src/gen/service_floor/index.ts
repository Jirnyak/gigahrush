/* ── Design z: service_floor — lift machines and staff routes ─ */

import {
  ContainerKind,
  DoorState,
  LiftDirection,
  MonsterKind,
  RoomType,
  Tex,
  W,
  type Entity,
  type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { registerRouteCue } from '../../systems/route_cues';
import { placeLifts } from '../shared';
import { finalizeExpandedFloor} from '../shared';
import { designFloorById } from '../../data/design_floors';
import { hashSeed, seededRandom } from '../../core/rand';
import { applyDesignFloorPopulationField } from '../design_floors/population';


import { expandServiceFloorMachineMaze, placeServiceFloorEmergencyPanels, stampServiceRoom, carveStaffRoute, reinforceServiceFloorAuthoredHqTerritory, connectRoomDown, connectRoomUp, connectRoomLeft, connectRoomRight, dressCorridors, dressLiftMachine, dressBreakerRoom, dressJanitorDepot, dressVentJunction, dressCanteen, dressClerkOffice, generateServiceZones } from './geometry';
import { BORIS_DEF, NADYA_DEF, ROMA_DEF, CLERK_DEF, spawnPlotNpc, addServiceContainer, dropItems, spawnMonsterPack, alignServiceFloorAmbientNpcTerritory } from './npcs';
import { registerServiceBaseUtilityGraph } from './utility_graph';

export { reinforceServiceFloorAuthoredHqTerritory } from './geometry';
export { alignServiceFloorAmbientNpcTerritory } from './npcs';

export * from './meta';
import {
  DESIGN_FLOOR_ID,
  SERVICE_FLOOR_BASE_FLOOR,
  MASTER_SCOPE_TAG,
  JANITOR_DEPOT,
  CLERK_OFFICE,
  LIFT_MACHINE_ROOM,
  BREAKER_ROOM,
  VENT_JUNCTION,
  STAFF_CANTEEN,
  createServiceFloorState,
  type ServiceFloorState,
  type ServiceFloorGeneration,
} from './meta';


export function generateServiceFloorDesignFloor(): ServiceFloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };
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

  placeLifts(world, 16, LiftDirection.UP);
  placeLifts(world, 16, LiftDirection.DOWN);

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

  registerServiceBaseUtilityGraph(world, {
    westLift,
    eastLift,
    machine,
    breaker,
    janitor,
    vent,
    canteen,
    clerk,
  });
  registerServiceRouteCues(world, serviceState, machine, breaker, vent, eastLift);
  placeServiceFloorEmergencyPanels(world);

  const route = designFloorById(DESIGN_FLOOR_ID)!;
  const rng = seededRandom(hashSeed(`design-full:${route.id}:${route.z}`, route.z));

  expandServiceFloorMachineMaze(world, rng, {
    floorTex: Tex.F_CONCRETE,
    wallTex: Tex.METAL,
  }, entities);

  const generation = {
    world,
    entities,
    spawnX: serviceState.debugEntry.spawnX,
    spawnY: serviceState.debugEntry.spawnY,
    serviceState,
    isDecentralized: true,
  };
  
  finalizeExpandedFloor(generation, route, rng);
  placeServiceFloorEmergencyPanels(world);
  applyDesignFloorPopulationField(generation, route);

  reinforceServiceFloorAuthoredHqTerritory(world);
  alignServiceFloorAmbientNpcTerritory(world, entities);

  world.bakeLights();
  return generation;
}

export function registerServiceRouteCues(
  world: World,
  service: ServiceFloorState,
  machine: Room,
  breaker: Room,
  vent: Room,
  eastLift: Room,
): void {
  const productionRoute = service.transferRoutes.find(route => route.id === 'service_to_production_belt_feed');
  if (productionRoute) {
    const markerX = machine.x + 5.5;
    const markerY = machine.y + 5.5;
    const targetX = eastLift.x + eastLift.w - 5 + 0.5;
    const targetY = eastLift.y + 6.5;
    const markerCell = world.idx(Math.floor(markerX), Math.floor(markerY));
    registerRouteCue(world, {
      id: productionRoute.id,
      x: markerX,
      y: markerY,
      targetX,
      targetY,
      z: SERVICE_FLOOR_BASE_FLOOR,
      roomId: machine.id,
      targetRoomId: eastLift.id,
      zoneId: world.zoneMap[markerCell],
      label: 'производственный обход',
      hint: 'лебедка С-15 тянет к восточному служебному лифту',
      targetName: productionRoute.label,
      color: '#8cf',
      tags: ['service_floor', 'production_belt', 'shortcut', 'repair'],
      toneSeed: machine.id * 811 + eastLift.id,
      radius: 9,
      targetRadius: 3,
      cooldownSec: 34,
      heardText: 'Лебедка С-15 стучит в сторону Производственного пояса. Ремонт открывает короткий персональный ход.',
      followedText: 'Восточный служебный лифт найден. После ремонта он станет обходом к производственной выдаче.',
      ignoredText: 'Лебедка С-15 стихла за спиной. Производственный обход остался не проверен.',
    });
  }

  const metroRoute = service.transferRoutes.find(route => route.id === 'service_to_dark_metro_signal');
  if (metroRoute) {
    const markerX = vent.x + vent.w - 4 + 0.5;
    const markerY = vent.y + 2.5;
    const targetX = vent.x + 3.5;
    const targetY = vent.y + vent.h - 4 + 0.5;
    const markerCell = world.idx(Math.floor(markerX), Math.floor(markerY));
    registerRouteCue(world, {
      id: metroRoute.id,
      x: markerX,
      y: markerY,
      targetX,
      targetY,
      z: SERVICE_FLOOR_BASE_FLOOR,
      roomId: vent.id,
      targetRoomId: vent.id,
      zoneId: world.zoneMap[markerCell],
      label: 'метро-сигнал',
      hint: 'темный воздух ведет к стрелочной будке',
      targetName: metroRoute.label,
      color: '#79f',
      tags: ['service_floor', 'dark_metro', 'transfer', 'warning'],
      toneSeed: vent.id * 823 + breaker.id,
      radius: 8,
      targetRadius: 3,
      cooldownSec: 38,
      heardText: 'Вентиляция отвечает метро-сигналом: короткий путь возможен, если вернуть питание контуру.',
      followedText: 'Вентиляционный лаз найден. Он обещает Темную пересадку и предупреждает о ламповых.',
      ignoredText: 'Метро-сигнал ушел в вентиляцию. Короткий лаз остался темным.',
    });
  }

  const darknessRoute = service.transferRoutes.find(route => route.id === 'service_to_darkness_light_reserve');
  if (darknessRoute) {
    const markerX = breaker.x + breaker.w - 4 + 0.5;
    const markerY = breaker.y + 5.5;
    const targetX = breaker.x + 3.5;
    const targetY = breaker.y + breaker.h - 3 + 0.5;
    const markerCell = world.idx(Math.floor(markerX), Math.floor(markerY));
    registerRouteCue(world, {
      id: darknessRoute.id,
      x: markerX,
      y: markerY,
      targetX,
      targetY,
      z: SERVICE_FLOOR_BASE_FLOOR,
      roomId: breaker.id,
      targetRoomId: breaker.id,
      zoneId: world.zoneMap[markerCell],
      label: 'резерв света',
      hint: 'щитовая держит поздний световой запас',
      targetName: darknessRoute.label,
      color: '#bbf',
      tags: ['service_floor', 'darkness', 'transfer', 'light'],
      toneSeed: breaker.id * 829 + vent.id,
      radius: 8,
      targetRadius: 2.8,
      cooldownSec: 42,
      heardText: 'Щитовая щелкает поздним резервом: схему можно потратить здесь или оставить для нижнего маршрута.',
      followedText: 'Релейный резерв найден. Это будущий световой карман, если не израсходовать его на месте.',
      ignoredText: 'Резерв света остался в щитовой. Поздний маршрут будет темнее.',
    });
  }
}

