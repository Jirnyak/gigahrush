import {  applyDesignFloorPopulationField } from '../design_floors/population';
import { seededRandom, hashSeed } from '../../core/rand';
/* ── Design z: antenna_court / Антенный двор ─────────────── */

import {
  ContainerKind, LiftDirection,
  Tex, 
  type Entity
  ,
} from '../../core/types';
import { World } from '../../core/world';
import {
  connectRoomsMST,
  ensureConnectivity,
  generateZones,
  placeDoor,
} from '../shared';
import { placeProceduralScreens } from '../procedural_screens';
import { DESIGN_FLOOR_ID, ANTENNA_COURT_ROUTE_Z, ANTENNA_COURT_BASE_FLOOR, CONTAINER_ID_BASE } from "./meta";
import { AntennaCourtGeneration, antennaCourtDebugLines, expandAntennaCourtRouteGeometry, retuneAntennaCourtRouteZones, stampAntennaCourtRooms, retuneAntennaZones, decorateAntennaCourt, placeAuthoredSignalScreens, dropItem, dropDesk, placeFixedLift } from "./geometry";
import { createAntennaCourtSignalState, spawnPlotNpc, spawnSignalMonsters, addContainer } from "./npcs";

export function generateAntennaCourtDesignFloor(seed = 0): AntennaCourtGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };
  let nextContainerId = CONTAINER_ID_BASE;

  world.wallTex.fill(Tex.CONCRETE);
  world.floorTex.fill(Tex.F_CONCRETE);

  const rooms = stampAntennaCourtRooms(world);
  connectRoomsMST(world, [
    rooms.courtyard,
    rooms.radioClub,
    rooms.relay,
    rooms.archive,
    rooms.battery,
    rooms.dorm,
    rooms.jammer,
    rooms.inspection,
    rooms.entry,
    rooms.exit,
  ]);
  placeDoor(world, rooms.courtyard, rooms.radioClub, '', false);
  placeDoor(world, rooms.courtyard, rooms.relay, '', false);
  placeDoor(world, rooms.archive, rooms.battery, 'key', false);

  generateZones(world);
  retuneAntennaZones(world, rooms);
  decorateAntennaCourt(world, rooms);
  placeProceduralScreens(world, ANTENNA_COURT_BASE_FLOOR);
  placeAuthoredSignalScreens(world, rooms);

  const pasha = spawnPlotNpc(entities, nextId, 'antenna_pasha_grown', rooms.radioClub, 4, 4, 0);
  const mirra = spawnPlotNpc(entities, nextId, 'antenna_mirra_jammer', rooms.jammer, 4, 4, Math.PI / 2);
  const captain = spawnPlotNpc(entities, nextId, 'antenna_captain_krug', rooms.inspection, 5, 5, Math.PI, { weapon: 'makarov' });
  spawnPlotNpc(entities, nextId, 'antenna_echo_zhenya', rooms.dorm, 3, 3, -Math.PI / 2, { spriteScale: 0.72 });

  spawnPlotNpc(entities, nextId, 'antenna_guard_frequency_sergeant', rooms.battery, 2, 7, Math.PI / 2, { canGiveQuest: false });
  spawnPlotNpc(entities, nextId, 'antenna_guard_hz_watch', rooms.inspection, 8, 2, Math.PI / 2, { canGiveQuest: false });
  spawnSignalMonsters(world, entities, nextId, rooms);

  addContainer(world, nextContainerId++, rooms.battery, 4, 4, ContainerKind.TOOL_LOCKER, 'Батарейный шкаф антенн', 'owner', [
    { defId: 'ammo_energy', count: 3 },
    { defId: 'fuse', count: 2 },
    { defId: 'wire_coil', count: 2 },
  ], captain);
  addContainer(world, nextContainerId++, rooms.archive, 4, 4, ContainerKind.FILING_CABINET, 'Архив записанных частот', 'locked', [
    { defId: 'bottled_voice', count: 1 },
    { defId: 'note', count: 3 },
    { defId: 'record_exposure_notice', count: 1 },
  ]);
  addContainer(world, nextContainerId++, rooms.relay, 7, 4, ContainerKind.METAL_CABINET, 'Ящик релейных схем', 'room', [
    { defId: 'relay_diagram', count: 2 },
    { defId: 'circuit_board', count: 1 },
    { defId: 'lamp_bulb', count: 2 },
  ], pasha);
  addContainer(world, nextContainerId++, rooms.relay, 3, 8, ContainerKind.TOOL_LOCKER, 'Шкаф ремонта верхней мачты', 'room', [
    { defId: 'circuit_board', count: 1 },
    { defId: 'fuse', count: 2 },
    { defId: 'wire_coil', count: 1 },
  ], pasha);
  addContainer(world, nextContainerId++, rooms.inspection, 3, 8, ContainerKind.SAFE, 'Сейф экспозиции сигнала', 'faction', [
    { defId: 'record_exposure_notice', count: 1 },
    { defId: 'official_permit_slip', count: 1 },
    { defId: 'denunciation', count: 1 },
  ], captain);
  addContainer(world, nextContainerId++, rooms.jammer, 8, 3, ContainerKind.CASHBOX, 'Касса короткой тишины', 'owner', [
    { defId: 'metro_ticket', count: 1 },
    { defId: 'cigs', count: 2 },
    { defId: 'denunciation', count: 1 },
  ], mirra);

  dropItem(entities, nextId, rooms.entry.x + 3, rooms.entry.y + 4, 'radio', 1);
  dropItem(entities, nextId, rooms.courtyard.x + 22, rooms.courtyard.y + 25, 'wire_coil', 1);
  dropDesk(entities, nextId, rooms.radioClub.x + 6, rooms.radioClub.y + 5);
  dropDesk(entities, nextId, rooms.archive.x + 12, rooms.archive.y + 5);

  placeFixedLift(world, rooms.entry.x + 2, rooms.entry.y + 2, LiftDirection.DOWN);
  placeFixedLift(world, rooms.exit.x + rooms.exit.w - 3, rooms.exit.y + 2, LiftDirection.UP);

  const spawnX = rooms.entry.x + 5.5;
  const spawnY = rooms.entry.y + 5.5;
  ensureConnectivity(world, spawnX, spawnY);
  world.bakeLights();

  const signalState = createAntennaCourtSignalState(seed);
    const generation = { isDecentralized: true as const,
    world,
    entities,
    spawnX,
    spawnY,
    routeId: DESIGN_FLOOR_ID,
    z: ANTENNA_COURT_ROUTE_Z,
    signalState,
    debug: antennaCourtDebugLines(signalState),
  };

  const rngFn = seededRandom(hashSeed('design-full:antenna_court:42', 42));
  expandAntennaCourtRouteGeometry(world, rngFn);
  retuneAntennaCourtRouteZones(world);

  applyDesignFloorPopulationField(generation, { id: 'antenna_court', z: 42 });
  return { ...generation, isDecentralized: true as const };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
