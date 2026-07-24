/* ── Future design z: Хтонический чердак — index ─────────────────── */

import { seededRandom, hashSeed } from '../../core/rand';
import {
  Tex, DoorState, LiftDirection, RoomType, MonsterKind,
  type Entity, type GameState,
} from '../../core/types';
import { World } from '../../core/world';
import { genLog } from '../log';
import { syncZoneMetadataFromTerritory } from '../../systems/territory';
import { generateZones } from '../shared';
import { publishEvent } from '../../systems/events';
import {  applyDesignFloorPopulationField } from '../design_floors/population';

import { ATTIC_BASE_X, ATTIC_BASE_Y, MAIN_Y, ATTIC_CHAMBERS, ATTIC_SPINE, fillBaseTextures, stampRoom, carveCombatLane, carveCrawlRoute, placeDoor, connectRoomToLane, placeExitLift, decorateAttic, stampRootObstacles, retuneAtticZones, buildAtticProtectedMask, carveAtticPathChain, carveAtticRootPath, stampAtticVoidKnot, stampAtticBulbRoom, dressAtticBulbRoom, fogAtticServiceCavities, carveAtticCrawlBypasses, carveAtticStealthCrawlGraph, stampAtticRootStubs, stampAtticChokepoints, stampAtticLowCeilingShells, stampAtticCapillaryCracks, stampAtticExitCues, carveChthonicLabyrinth, nearestAtticAnchorPressure, traceChthonicAtticExitPaths, setDoorState, scorchRoom } from './geometry';
import { ATTIC_NPCS, addAtticContainers, spawnNpc, addItemDrop, spawnMonster, spawnAtticAmbientMonsters, seedAtticShaftCaches } from './npcs';
import { stampAtticServiceIslands } from './islands';
import { applyChthonicAtticTerritory } from './territory';
import { type ChthonicAtticRootChoice, type ChthonicAtticGeneration, type ChthonicAtticLayout, type ChthonicAtticRootState, type ChthonicAtticExit, type ChthonicAtticShelterCost, DESIGN_FLOOR_ID, DESIGN_FLOOR_Z } from './meta';

export * from './meta';
export * from './geometry';
export * from './npcs';
export * from './islands';
export * from './territory';

export function generateChthonicAtticDesignFloor(
  rootChoice: ChthonicAtticRootChoice = 'cut',
): ChthonicAtticGeneration {
  const world = new World();
  const entities: Entity[] = [];
  let nextRoomId = 0;
  let nextEntityId = 1;

  fillBaseTextures(world);

  const spawn = stampRoom(world, nextRoomId++, RoomType.COMMON, ATTIC_BASE_X + 2, ATTIC_BASE_Y + 48, 18, 18, 'Предчердачный тамбур', Tex.CONCRETE, Tex.F_CONCRETE);
  const rootkeeper = stampRoom(world, nextRoomId++, RoomType.STORAGE, ATTIC_BASE_X + 32, ATTIC_BASE_Y + 30, 18, 12, 'Комната хранительницы корней', Tex.CONCRETE, Tex.F_WOOD);
  const crawlA = stampRoom(world, nextRoomId++, RoomType.CORRIDOR, ATTIC_BASE_X + 42, ATTIC_BASE_Y + 8, 15, 8, 'Низкий кабельный лаз A', Tex.PANEL, Tex.F_CONCRETE);
  const crawlB = stampRoom(world, nextRoomId++, RoomType.CORRIDOR, ATTIC_BASE_X + 88, ATTIC_BASE_Y + 10, 20, 7, 'Низкий кабельный лаз B', Tex.PANEL, Tex.F_CONCRETE);
  const crawlC = stampRoom(world, nextRoomId++, RoomType.CORRIDOR, ATTIC_BASE_X + 138, ATTIC_BASE_Y + 12, 18, 8, 'Низкий кабельный лаз C', Tex.PANEL, Tex.F_CONCRETE);
  const rootNursery = stampRoom(world, nextRoomId++, RoomType.PRODUCTION, ATTIC_BASE_X + 108, ATTIC_BASE_Y + 28, 24, 16, 'Гнездо бетонного корня', Tex.GUT, Tex.F_GUT);
  const deacon = stampRoom(world, nextRoomId++, RoomType.OFFICE, ATTIC_BASE_X + 72, ATTIC_BASE_Y + 72, 22, 14, 'Ниша свидетельских ведомостей', Tex.MARBLE, Tex.F_RED_CARPET);
  const evidence = stampRoom(world, nextRoomId++, RoomType.STORAGE, ATTIC_BASE_X + 112, ATTIC_BASE_Y + 76, 18, 12, 'Запертая кладовая черной ладони', Tex.DARK, Tex.F_CONCRETE);
  const shrine = stampRoom(world, nextRoomId++, RoomType.COMMON, ATTIC_BASE_X + 148, ATTIC_BASE_Y + 74, 20, 14, 'Корневая молельная ниша', Tex.GUT, Tex.F_GUT);
  const masha = stampRoom(world, nextRoomId++, RoomType.HQ, ATTIC_BASE_X + 174, ATTIC_BASE_Y + 30, 22, 13, 'Пост контролируемого прожига', Tex.METAL, Tex.F_CONCRETE);
  const exitRoom = stampRoom(world, nextRoomId++, RoomType.CORRIDOR, ATTIC_BASE_X + 206, ATTIC_BASE_Y + 50, 17, 17, 'Служебная развязка крыши', Tex.METAL, Tex.F_CONCRETE);

  const combatLaneCells = carveCombatLane(world, ATTIC_BASE_X + 20, ATTIC_BASE_X + 206, MAIN_Y);
  const crawlRouteCells = carveCrawlRoute(world, spawn, crawlA, crawlB, crawlC, masha, exitRoom);

  const spawnDoor = placeDoor(world, spawn.x + spawn.w, MAIN_Y, spawn.id, DoorState.OPEN);
  const rootkeeperDoor = connectRoomToLane(world, rootkeeper, rootkeeper.x + 8, 1);
  const rootDoorIdx = connectRoomToLane(world, rootNursery, rootNursery.x + 12, 1);
  const deaconDoor = connectRoomToLane(world, deacon, deacon.x + 11, -1);
  connectRoomToLane(world, evidence, evidence.x + 8, -1);
  const shrineDoorIdx = connectRoomToLane(world, shrine, shrine.x + 10, -1);
  const mashaDoor = connectRoomToLane(world, masha, masha.x + 11, 1);
  const exitDoor = placeDoor(world, exitRoom.x - 1, MAIN_Y, exitRoom.id, DoorState.OPEN);

  const crawlDoorIdxs = [
    placeDoor(world, spawn.x + 9, spawn.y - 1, spawn.id, DoorState.OPEN),
    placeDoor(world, crawlA.x - 1, crawlA.y + 4, crawlA.id, DoorState.CLOSED),
    placeDoor(world, crawlA.x + crawlA.w, crawlA.y + 4, crawlA.id, DoorState.CLOSED),
    placeDoor(world, crawlB.x - 1, crawlB.y + 3, crawlB.id, DoorState.CLOSED),
    placeDoor(world, crawlB.x + crawlB.w, crawlB.y + 3, crawlB.id, DoorState.CLOSED),
    placeDoor(world, crawlC.x - 1, crawlC.y + 4, crawlC.id, DoorState.CLOSED),
    placeDoor(world, crawlC.x + crawlC.w, crawlC.y + 4, crawlC.id, DoorState.CLOSED),
    placeDoor(world, masha.x + 11, masha.y - 1, masha.id, DoorState.CLOSED),
    spawnDoor,
    rootkeeperDoor,
    mashaDoor,
    exitDoor,
  ];

  const exits: ChthonicAtticExit[] = [
    { id: 'ministry_return', idx: placeExitLift(world, spawn.x + 3, spawn.y + 9, LiftDirection.DOWN) },
    { id: 'roof_service', idx: placeExitLift(world, exitRoom.x + exitRoom.w - 3, exitRoom.y + 8, LiftDirection.UP) },
    { id: 'crawl_hatch', idx: placeExitLift(world, crawlC.x + crawlC.w - 3, crawlC.y + 3, LiftDirection.UP) },
  ];

  decorateAttic(world, {
    spawn, rootkeeper, crawlA, crawlB, crawlC, rootNursery, deacon, evidence, shrine, masha, exitRoom,
  });
  stampRootObstacles(world, MAIN_Y);

  generateZones(world);
  retuneAtticZones(world, [rootNursery, deacon, shrine, masha]);

  addAtticContainers(world, rootkeeper, deacon, evidence, shrine, masha, rootChoice);

  nextEntityId = spawnNpc(entities, nextEntityId, 'attic_agrafena_rootkeeper', ATTIC_NPCS.attic_agrafena_rootkeeper, rootkeeper.x + 8.5, rootkeeper.y + 6.5);
  nextEntityId = spawnNpc(entities, nextEntityId, 'attic_deacon_ostap', ATTIC_NPCS.attic_deacon_ostap, deacon.x + 11.5, deacon.y + 7.5);
  nextEntityId = spawnNpc(entities, nextEntityId, 'attic_cable_boy_yura', ATTIC_NPCS.attic_cable_boy_yura, crawlA.x + 4.5, crawlA.y + 4.5);
  nextEntityId = spawnNpc(entities, nextEntityId, 'attic_liquidator_masha', ATTIC_NPCS.attic_liquidator_masha, masha.x + 11.5, masha.y + 6.5);

  nextEntityId = addItemDrop(entities, nextEntityId, 'wire_coil', 1, crawlB.x + 10.5, crawlB.y + 3.5);
  nextEntityId = addItemDrop(entities, nextEntityId, 'denunciation', 1, evidence.x + 9.5, evidence.y + 6.5);
  nextEntityId = addItemDrop(entities, nextEntityId, 'ammo_fuel', 1, masha.x + 16.5, masha.y + 6.5);

  nextEntityId = spawnMonster(entities, nextEntityId, MonsterKind.REBAR, rootNursery.x + 12.5, rootNursery.y + 8.5);
  nextEntityId = spawnMonster(entities, nextEntityId, MonsterKind.SHADOW, shrine.x + 10.5, shrine.y + 7.5);
  nextEntityId = spawnMonster(entities, nextEntityId, MonsterKind.SBORKA, ATTIC_BASE_X + 154.5, MAIN_Y + 0.5);
  nextEntityId = spawnMonster(entities, nextEntityId, MonsterKind.EYE, ATTIC_BASE_X + 188.5, MAIN_Y - 2.5);
  void nextEntityId;

  const layout: ChthonicAtticLayout = {
    routeId: DESIGN_FLOOR_ID,
    z: DESIGN_FLOOR_Z,
    spawnRoomId: spawn.id,
    combatLaneCells,
    crawlRouteCells,
    exitCells: exits,
    npcRoomIds: {
      rootkeeper: rootkeeper.id,
      deacon: deacon.id,
      yura: crawlA.id,
      masha: masha.id,
    },
    rootRoomId: rootNursery.id,
    shrineRoomId: shrine.id,
    shelterRoomId: deacon.id,
    evidenceRoomId: evidence.id,
    rootDoorIdx,
    shrineDoorIdx,
    shelterDoorIdx: deaconDoor,
    crawlDoorIdxs,
  };

  const rootState = applyChthonicAtticRootChoice(world, layout, rootChoice);
  world.bakeLights();

  const spawnX = spawn.x + 9.5;
  const spawnY = spawn.y + 9.5;
  const routeChecks = traceChthonicAtticExitPaths(world, spawnX, spawnY, layout, rootChoice);

  genLog(`[FLOOR02_CHTHONIC_ATTIC] ${DESIGN_FLOOR_ID} z=${DESIGN_FLOOR_Z} choice=${rootChoice} at (${spawn.x}, ${spawn.y})`);

    const generation = {
    world,
    entities,
    spawnX,
    spawnY,
    layout,
    rootState,
    routeChecks,
    debug: {
      routeId: DESIGN_FLOOR_ID,
      z: DESIGN_FLOOR_Z,
      entry: `debug:${DESIGN_FLOOR_ID}:z${DESIGN_FLOOR_Z}:${rootChoice}`,
    },
    isDecentralized: true as const,
  } as ChthonicAtticGeneration;

  const rngFn = seededRandom(hashSeed('design-full:chthonic_attic:46', 46));
  expandChthonicAtticRootNetwork(generation.world, generation.entities, rngFn);
  retuneExpandedChthonicAtticEcology(world);

  applyDesignFloorPopulationField(generation, { id: 'chthonic_attic', z: 46 });
  return generation;
}

export function applyChthonicAtticRootChoice(
  world: World,
  layout: ChthonicAtticLayout,
  choice: ChthonicAtticRootChoice,
): ChthonicAtticRootState {
  const blockedDoorIdxs: number[] = [];
  const oneWayDoorIdxs: number[] = [];
  const sealedRoomIds: number[] = [];
  const burntRoomIds: number[] = [];
  let shelterCost: ChthonicAtticShelterCost;
  let crossFloorFlag: string;

  setDoorState(world, layout.rootDoorIdx, DoorState.CLOSED);
  setDoorState(world, layout.shrineDoorIdx, DoorState.CLOSED);
  setDoorState(world, layout.shelterDoorIdx, DoorState.CLOSED);
  for (const idx of layout.crawlDoorIdxs) setDoorState(world, idx, DoorState.CLOSED);

  if (choice === 'cut') {
    setDoorState(world, layout.rootDoorIdx, DoorState.OPEN);
    setDoorState(world, layout.shrineDoorIdx, DoorState.HERMETIC_CLOSED);
    blockedDoorIdxs.push(layout.shrineDoorIdx);
    sealedRoomIds.push(layout.shrineRoomId);
    world.rooms[layout.shrineRoomId].sealed = true;
    shelterCost = { kind: 'delay', seconds: 18 };
    crossFloorFlag = 'attic_roots_cut_service_parts';
  } else if (choice === 'feed') {
    setDoorState(world, layout.shrineDoorIdx, DoorState.OPEN);
    setDoorState(world, layout.shelterDoorIdx, DoorState.HERMETIC_OPEN);
    setDoorState(world, layout.rootDoorIdx, DoorState.HERMETIC_CLOSED);
    blockedDoorIdxs.push(layout.rootDoorIdx);
    sealedRoomIds.push(layout.rootRoomId, layout.shelterRoomId);
    world.rooms[layout.rootRoomId].sealed = true;
    world.rooms[layout.shelterRoomId].sealed = true;
    shelterCost = { kind: 'item', itemId: 'meat_rune', count: 1 };
    crossFloorFlag = 'attic_roots_fed_hell_relic';
  } else {
    setDoorState(world, layout.rootDoorIdx, DoorState.OPEN);
    setDoorState(world, layout.shrineDoorIdx, DoorState.OPEN);
    const tighteningDoor = layout.crawlDoorIdxs[4];
    setDoorState(world, tighteningDoor, DoorState.HERMETIC_CLOSED);
    blockedDoorIdxs.push(tighteningDoor);
    oneWayDoorIdxs.push(layout.crawlDoorIdxs[2], layout.crawlDoorIdxs[5]);
    burntRoomIds.push(layout.shrineRoomId);
    scorchRoom(world, world.rooms[layout.shrineRoomId]);
    shelterCost = { kind: 'hp', amount: 12 };
    crossFloorFlag = 'attic_shrine_burned_smoke';
  }

  return {
    choice,
    shelterCost,
    shelterRoomIds: [layout.shelterRoomId],
    sealedRoomIds,
    burntRoomIds,
    blockedDoorIdxs,
    oneWayDoorIdxs,
    crossFloorFlag,
  };
}

export function publishChthonicAtticRootChoice(
  state: GameState,
  rootState: ChthonicAtticRootState,
  roomId?: number,
  actorId?: number,
): void {
  publishEvent(state, {
    type: 'room_regrown',
    roomId,
    actorId,
    severity: 4,
    privacy: 'local',
    tags: [
      'design_floor',
      DESIGN_FLOOR_ID,
      `attic_${rootState.choice}`,
      rootState.crossFloorFlag,
    ],
    data: {
      routeId: DESIGN_FLOOR_ID,
      z: DESIGN_FLOOR_Z,
      choice: rootState.choice,
      crossFloorFlag: rootState.crossFloorFlag,
      sealedRoomIds: rootState.sealedRoomIds,
      burntRoomIds: rootState.burntRoomIds,
      shelterCost: rootState.shelterCost,
    },
  });
}

export function expandChthonicAtticRootNetwork(
  world: World,
  entities: Entity[],
  rng: () => number,
): void {
  const protectedMask = buildAtticProtectedMask(world);

  carveAtticPathChain(world, ATTIC_SPINE, 3, Tex.F_GUT, protectedMask);
  carveAtticRootPath(world, { x: 514, y: 82 }, { x: 514, y: 986 }, 1, Tex.F_CONCRETE, protectedMask);
  carveAtticRootPath(world, { x: 410, y: 918 }, { x: 286, y: 548 }, 1, Tex.F_GUT, protectedMask);

  stampAtticVoidKnot(world, 638, 482, 19, protectedMask);
  stampAtticVoidKnot(world, 52, 538, 15, protectedMask);
  stampAtticVoidKnot(world, 524, 930, 17, protectedMask);

  const chambers = ATTIC_CHAMBERS.map(plan => stampAtticBulbRoom(world, plan));
  for (let i = 0; i < ATTIC_CHAMBERS.length; i++) {
    const plan = ATTIC_CHAMBERS[i];
    const room = chambers[i];
    carveAtticRootPath(world, plan.anchor, { x: plan.cx, y: plan.cy }, plan.type === RoomType.CORRIDOR ? 1 : 2, plan.floorTex, protectedMask);
    dressAtticBulbRoom(world, room, plan, rng);
  }
  fogAtticServiceCavities(world, chambers);
  seedAtticShaftCaches(world, chambers, rng);

  carveAtticCrawlBypasses(world, protectedMask);
  carveAtticStealthCrawlGraph(world, protectedMask);
  stampAtticRootStubs(world, protectedMask);
  stampAtticChokepoints(world, protectedMask);
  stampAtticLowCeilingShells(world);
  stampAtticCapillaryCracks(world, protectedMask, rng);
  stampAtticServiceIslands(world, protectedMask, rng);
  stampAtticExitCues(world);

  carveChthonicLabyrinth(world, protectedMask, rng);

  spawnAtticAmbientMonsters(world, entities, rng, 28);

  world.markCellsDirty();
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty();
  world.markFogDirty();
}

export function retuneExpandedChthonicAtticEcology(world: World): void {
  for (const zone of world.zones) {
    const rootPressure = nearestAtticAnchorPressure(world, zone.cx, zone.cy, 190);
    const shaftPressure = nearestAtticAnchorPressure(world, zone.cx, zone.cy, 118);
    zone.level = rootPressure > 0.35 ? 5 : 4;
    zone.fogged = shaftPressure > 0.25;
  }

  applyChthonicAtticTerritory(world);
  syncZoneMetadataFromTerritory(world);
}

