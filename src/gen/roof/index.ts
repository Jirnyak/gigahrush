/* -- Design z: Крыша ---------------------------------------
 * Route id roof, z=+50. Self-contained authored generator with a
 * dynamic sky provider consumed through the generic WebGL ceiling slot.
 */

import {
  W,
  ContainerKind,
  LiftDirection,
  RoomType,
  Tex,
  type Entity,
  type GameState,
  type Room,
  type WorldEvent,
} from '../../core/types';
import { World } from '../../core/world';
import { publishEvent } from '../../systems/events';
import { syncZoneMetadataFromTerritory } from '../../systems/territory';
import {
  connectRoomsMST,
  ensureConnectivity,
  generateZones,
  placeDoor,
  sanitizeDoors,
} from '../shared';
import { genLog } from '../log';
import type { FloorGeneration } from '../floor_manifest';
import { hashSeed, seededRandom } from '../../core/rand';
import { applyDesignFloorPopulationField } from '../design_floors/population';
import { designFloorById } from '../../data/design_floors';
import { finalizeExpandedFloor} from '../shared';

import {
  RoofSkyTextureProvider,
  applyRoofTerritoryField,
  clampSignalQuality,
  wrap01,
  clamp01,
  hash01,
  isRoofLosOpenCell,
  roofVisibleSteps,
  isDeliberateRoofExposure,
  createRoofShelterIndex,
  addRoofShelterCell,
  hasRoofExposureShelterNear,
  placeRoofExposureShelterNear,
  buildRoofKeepMask,
  clearRoofVoid,
  placeRoofMegastructureGrid,
  placeCrashedProbe,
  addRoofIsland,
  connectRoofWalk,
  placeRoofSniperLane,
  placeLargeAntennaCluster,
  placeRoofShedBlock,
  placeRoofSkylightPit,
  placeWaterTankCluster,
  scatterRoofMachinery,
  placeRoofWideDeckNetwork,
  placeRoofFactionHqClusters,
  placeRoofOpenDeckLayer,
  placeRoofMidServiceLayer,
  placeRoofMicroLayer,
  normalizeRoofDoorHardware,
  skyAmbientTint,
  skyFogTint,
  diffuseRoofClouds,
  rebuildRoofSkyPixels,
  stampRoofRooms,
  closeShelterDoors,
  retuneRoofZones,
  decorateRoof,
  applyUniformSkyLight,
  registerRoofWindShelterCue,
  placeFixedLift
} from './geometry';
import {
  spawnRoofMonsters,
  addRoofContainer,
  dropItem
} from './npcs';

export * from './meta';
import {
  CX,
  CY,
  ROOF_ROUTE_ID,
  ROOF_FUTURE_Z,
  ROOF_BASE_FLOOR,
  ROOF_SKY_WIDTH,
  ROOF_SKY_HEIGHT,
  ROOF_LOS_DIRS,
  ROOF_LOS_LONG_STEPS,
  ROOF_LOS_EXPOSURE_THRESHOLD,
  ROOF_LOS_SHELTER_MAX_SPACING,
  ROOF_LOS_SHELTER_CAP,
  CONTAINER_ID_BASE,
  SKY_GRID_W,
  SKY_GRID_H,
  SKY_UPDATE_INTERVAL,
  type RoofWeatherState,
  type RoofWeatherResult,
  type RoofLosExposureSummary,
} from './meta';

export interface RoofGeneration extends FloorGeneration {
  routeId: typeof ROOF_ROUTE_ID;
  z: typeof ROOF_FUTURE_Z;
  weatherState: RoofWeatherState;
  skyProvider: RoofSkyTextureProvider;
  debug: string[];
}

export function createRoofWeatherState(seed = 0, skyTimeOfDay = 0.42): RoofWeatherState {
  return {
    signalQuality: 1 + (Math.abs(seed) % 2),
    antennaRepaired: false,
    falseWeatherExposed: false,
    falseWeatherForged: false,
    sniperLaneDarkened: false,
    cloudFramePrinted: false,
    cleanWaterCollected: false,
    skyTimeOfDay: wrap01(skyTimeOfDay),
    skySeed: seed | 0,
  };
}

export function repairRoofSignal(state: RoofWeatherState): RoofWeatherResult {
  state.antennaRepaired = true;
  state.signalQuality = clampSignalQuality(state.signalQuality + 3);
  return {
    action: 'repair_signal',
    label: 'Мачта починена',
    logLine: 'Крыша дала чистую частоту: слухи о погоде и верхних этажах стали надежнее.',
    signalQuality: state.signalQuality,
    tags: ['repair', 'signal', 'antenna'],
  };
}

export function exposeRoofFalseWeather(state: RoofWeatherState, forged = false): RoofWeatherResult {
  state.falseWeatherExposed = !forged;
  state.falseWeatherForged = forged;
  state.signalQuality = clampSignalQuality(state.signalQuality + (forged ? 0 : 1));
  return {
    action: forged ? 'false_weather_forged' : 'false_weather_exposed',
    label: forged ? 'Ложная сводка подписана' : 'Ложная погода раскрыта',
    logLine: forged
      ? 'Метеосводка ушла в Министерство: небо осталось прежним, бумага стала опаснее.'
      : 'Жильцы узнали, что прогноз был приказом, а не погодой.',
    signalQuality: state.signalQuality,
    tags: ['weather', forged ? 'ministry' : 'citizens', 'report'],
  };
}

export function darkenRoofSniperLane(state: RoofWeatherState): RoofWeatherResult {
  state.sniperLaneDarkened = true;
  return {
    action: 'sniper_lane_darkened',
    label: 'Снайперская линия погашена',
    logLine: 'Открытый проход под мачтами стал короче: гнездо Кадыра больше не держит всю плиту.',
    signalQuality: state.signalQuality,
    tags: ['sniper', 'route', 'stealth'],
  };
}

export function printRoofCloudFrame(state: RoofWeatherState): RoofWeatherResult {
  state.cloudFramePrinted = true;
  return {
    action: 'cloud_frame_printed',
    label: 'Облачный кадр распечатан',
    logLine: 'Кадр неба зафиксировал повтор: это улика для Якова и приманка для тех, кто скупает закрытые записи.',
    signalQuality: state.signalQuality,
    tags: ['sky', 'cloud', 'yakov'],
  };
}

export function collectRoofCleanWater(state: RoofWeatherState): RoofWeatherResult {
  state.cleanWaterCollected = true;
  return {
    action: 'clean_water_collected',
    label: 'Чистая вода собрана',
    logLine: 'После верхнего самосбора на крыше осталась редкая чистая вода.',
    signalQuality: state.signalQuality,
    tags: ['water', 'aftermath', 'samosbor'],
  };
}

export function publishRoofWeatherEvent(
  game: GameState,
  state: RoofWeatherState,
  result: RoofWeatherResult,
  room?: Room,
): WorldEvent {
  return publishEvent(game, {
    type: 'rumor_observed',
    z: game.currentZ,
    roomId: room?.id,
    x: room ? room.x + (room.w >> 1) : undefined,
    y: room ? room.y + (room.h >> 1) : undefined,
    severity: result.action === 'repair_signal' || result.action === 'false_weather_exposed' ? 4 : 3,
    privacy: result.action === 'false_weather_forged' ? 'secret' : 'local',
    targetName: result.label,
    tags: [ROOF_ROUTE_ID, 'roof_weather', ...result.tags],
    data: {
      routeId: ROOF_ROUTE_ID,
      z: ROOF_FUTURE_Z,
      action: result.action,
      signalQuality: state.signalQuality,
      antennaRepaired: state.antennaRepaired,
      falseWeatherExposed: state.falseWeatherExposed,
      falseWeatherForged: state.falseWeatherForged,
      sniperLaneDarkened: state.sniperLaneDarkened,
      cloudFramePrinted: state.cloudFramePrinted,
      cleanWaterCollected: state.cleanWaterCollected,
      skyTimeOfDay: state.skyTimeOfDay,
      logLine: result.logLine,
    },
  });
}

export function roofDebugLines(state: RoofWeatherState): string[] {
  return [
    `route=${ROOF_ROUTE_ID}`,
    `z=${ROOF_FUTURE_Z}`,
    `baseFloor=${ROOF_BASE_FLOOR}`,
    `signal=${state.signalQuality}/5`,
    `skyTime=${state.skyTimeOfDay.toFixed(2)}`,
    `antenna=${state.antennaRepaired ? 'repaired' : 'broken'}`,
    `weather=${state.falseWeatherExposed ? 'exposed' : state.falseWeatherForged ? 'forged' : 'unresolved'}`,
    `sniper=${state.sniperLaneDarkened ? 'darkened' : 'active'}`,
  ];
}

export function createRoofSkyTextureProvider(seed = 0, timeOfDay = 0.42): RoofSkyTextureProvider {
  const pixels = new Uint32Array(ROOF_SKY_WIDTH * ROOF_SKY_HEIGHT);
  const cloud = new Float32Array(SKY_GRID_W * SKY_GRID_H);
  const scratch = new Float32Array(cloud.length);
  let phase = 0;
  let accum = 0;

  for (let y = 0; y < SKY_GRID_H; y++) {
    for (let x = 0; x < SKY_GRID_W; x++) {
      const n = hash01(x, y, seed);
      const band = Math.sin((x + seed * 0.01) * 0.055) * 0.18 + Math.sin((y - seed * 0.02) * 0.09) * 0.12;
      cloud[y * SKY_GRID_W + x] = clamp01(n * 0.72 + band + 0.18);
    }
  }

  const provider: RoofSkyTextureProvider = {
    width: ROOF_SKY_WIDTH,
    height: ROOF_SKY_HEIGHT,
    pixels,
    updateInterval: SKY_UPDATE_INTERVAL,
    dirty: true,
    timeOfDay: wrap01(timeOfDay),
    ambientTint: skyAmbientTint(timeOfDay),
    fogTint: skyFogTint(timeOfDay),
    update(deltaSeconds: number): boolean {
      accum += Math.max(0, deltaSeconds);
      if (accum < SKY_UPDATE_INTERVAL) return false;
      accum = 0;
      phase += 1;
      diffuseRoofClouds(cloud, scratch, seed + phase * 17);
      rebuildRoofSkyPixels(provider, cloud, seed + phase * 31);
      provider.dirty = true;
      return true;
    },
    cycleTime(hours: number): void {
      provider.timeOfDay = wrap01(provider.timeOfDay + hours / 24);
      provider.ambientTint = skyAmbientTint(provider.timeOfDay);
      provider.fogTint = skyFogTint(provider.timeOfDay);
      rebuildRoofSkyPixels(provider, cloud, seed + phase * 31);
      provider.dirty = true;
    },
  };

  rebuildRoofSkyPixels(provider, cloud, seed);
  return provider;
}

export function paintRoofSkyToCanvas(provider: RoofSkyTextureProvider, canvas: HTMLCanvasElement): void {
  canvas.width = provider.width;
  canvas.height = provider.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = ctx.createImageData(provider.width, provider.height);
  new Uint32Array(image.data.buffer).set(provider.pixels);
  ctx.putImageData(image, 0, 0);
  provider.dirty = false;
}

export function expandRoofArchipelago(world: World, rng: () => number): void {
  const keep = buildRoofKeepMask(world);
  clearRoofVoid(world, keep);

  const entryDeck = addRoofIsland(world, keep, RoomType.CORRIDOR, CX - 22, CY + 20, 54, 54, 'Крыша: лифтовая палуба', Tex.CONCRETE, Tex.F_CONCRETE);
  const centralSlab = addRoofIsland(world, keep, RoomType.COMMON, CX - 63, CY - 39, 92, 68, 'Крыша: центральная плита', Tex.CONCRETE, Tex.F_CONCRETE);
  const westHatch = addRoofIsland(world, keep, RoomType.CORRIDOR, CX - 72, CY + 8, 48, 55, 'Крыша: сервисный карниз', Tex.CONCRETE, Tex.F_CONCRETE);
  const eastMasts = addRoofIsland(world, keep, RoomType.PRODUCTION, CX + 25, CY - 33, 58, 64, 'Крыша: мачтовая плита', Tex.METAL, Tex.F_CONCRETE);
  const northField = addRoofIsland(world, keep, RoomType.PRODUCTION, CX - 28, CY - 128, 96, 54, 'Крыша: антенное поле', Tex.METAL, Tex.F_CONCRETE);
  const northWestPits = addRoofIsland(world, keep, RoomType.COMMON, CX - 188, CY - 82, 92, 52, 'Крыша: стекольные провалы', Tex.CONCRETE, Tex.F_CONCRETE);
  const eastLane = addRoofIsland(world, keep, RoomType.HQ, CX + 120, CY - 54, 118, 36, 'Крыша: снайперская полоса', Tex.METAL, Tex.F_CONCRETE);
  const signalOutpost = addRoofIsland(world, keep, RoomType.PRODUCTION, CX + 238, CY + 12, 82, 44, 'Крыша: дальний репитер', Tex.METAL, Tex.F_CONCRETE);
  const southShelters = addRoofIsland(world, keep, RoomType.STORAGE, CX - 64, CY + 122, 92, 50, 'Крыша: ряд вентиляций', Tex.PIPE, Tex.F_CONCRETE);
  const waterDeck = addRoofIsland(world, keep, RoomType.STORAGE, CX + 88, CY + 104, 78, 58, 'Крыша: баки дождевой воды', Tex.PIPE, Tex.F_WATER);
  const tarPocket = addRoofIsland(world, keep, RoomType.COMMON, CX - 210, CY + 86, 78, 42, 'Крыша: смоляной карман', Tex.CONCRETE, Tex.F_CONCRETE);
  const routeRooms = [
    entryDeck.room,
    centralSlab.room,
    westHatch.room,
    eastMasts.room,
    northField.room,
    northWestPits.room,
    eastLane.room,
    signalOutpost.room,
    southShelters.room,
    waterDeck.room,
    tarPocket.room,
  ];

  connectRoofWalk(world, keep, entryDeck, centralSlab, 3, false);
  connectRoofWalk(world, keep, entryDeck, westHatch, 2, true);
  connectRoofWalk(world, keep, centralSlab, westHatch, 2, false);
  connectRoofWalk(world, keep, centralSlab, eastMasts, 3, true);
  connectRoofWalk(world, keep, centralSlab, northField, 2, false);
  connectRoofWalk(world, keep, centralSlab, northWestPits, 2, true);
  connectRoofWalk(world, keep, northWestPits, tarPocket, 2, false);
  connectRoofWalk(world, keep, tarPocket, westHatch, 2, true);
  connectRoofWalk(world, keep, entryDeck, southShelters, 2, false);
  connectRoofWalk(world, keep, southShelters, waterDeck, 2, true);
  connectRoofWalk(world, keep, waterDeck, eastMasts, 2, false);
  connectRoofWalk(world, keep, eastMasts, eastLane, 2, true);
  connectRoofWalk(world, keep, eastLane, signalOutpost, 2, false);
  connectRoofWalk(world, keep, signalOutpost, waterDeck, 2, true);

  placeRoofWideDeckNetwork(world, keep, rng);
  placeRoofMegastructureGrid(world, keep, rng);
  const hqRooms = placeRoofFactionHqClusters(world, keep, rng);
  const deckRooms = placeRoofOpenDeckLayer(world, keep, rng);
  const midRooms = placeRoofMidServiceLayer(world, keep, rng);
  const microRooms = placeRoofMicroLayer(world, keep, rng);
  placeCrashedProbe(world, keep, rng, routeRooms);
  connectRoomsMST(world, routeRooms.concat(deckRooms, hqRooms, midRooms, microRooms));
  normalizeRoofDoorHardware(world);

  placeRoofSniperLane(world, keep, entryDeck.cx + 12, entryDeck.cy - 3, eastLane.cx - 8, eastLane.cy + 2);
  placeLargeAntennaCluster(world, northField.cx, northField.cy);
  placeLargeAntennaCluster(world, eastMasts.cx + 8, eastMasts.cy - 6);
  placeRoofShedBlock(world, keep, entryDeck.cx - 12, entryDeck.cy - 12, 12, 8, Tex.PIPE);
  placeRoofShedBlock(world, keep, southShelters.cx - 20, southShelters.cy - 5, 17, 10, Tex.HERMO_WALL);
  placeRoofShedBlock(world, keep, southShelters.cx + 10, southShelters.cy - 2, 18, 9, Tex.PIPE);
  placeRoofShedBlock(world, keep, signalOutpost.cx - 18, signalOutpost.cy - 7, 15, 8, Tex.METAL);

  placeRoofSkylightPit(world, keep, centralSlab.cx - 28, centralSlab.cy + 8, 8, 5);
  placeRoofSkylightPit(world, keep, northWestPits.cx - 22, northWestPits.cy - 6, 12, 6);
  placeRoofSkylightPit(world, keep, northWestPits.cx + 18, northWestPits.cy + 7, 10, 7);
  placeRoofSkylightPit(world, keep, eastLane.cx - 34, eastLane.cy - 4, 7, 5);
  placeRoofSkylightPit(world, keep, tarPocket.cx + 18, tarPocket.cy - 5, 9, 5);

  placeWaterTankCluster(world, keep, waterDeck.cx - 18, waterDeck.cy - 4);
  placeWaterTankCluster(world, keep, waterDeck.cx + 14, waterDeck.cy + 8);
  scatterRoofMachinery(world, keep, rng, [
    entryDeck, centralSlab, westHatch, eastMasts, northField, northWestPits,
    eastLane, signalOutpost, southShelters, waterDeck, tarPocket,
  ]);
  applyUniformSkyLight(world);
}

export function retuneRoofPressureZones(world: World): void {
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, CX, CY);
    zone.level = d > 300 ? 5 : d > 150 ? 4 : 3;
    zone.fogged = false;
  }

  applyRoofTerritoryField(world);
  syncZoneMetadataFromTerritory(world);
}

export function buildRoofLosExposureHeatmap(world: World): Uint8Array {
  const heat = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const ci = world.idx(x, y);
      if (!isRoofLosOpenCell(world, ci)) continue;
      let total = 0;
      let longest = 0;
      let longDirections = 0;
      for (const [dx, dy] of ROOF_LOS_DIRS) {
        const steps = roofVisibleSteps(world, x, y, dx, dy);
        total += steps;
        if (steps > longest) longest = steps;
        if (steps >= ROOF_LOS_LONG_STEPS) longDirections++;
      }
      if (longest < ROOF_LOS_LONG_STEPS) continue;
      heat[ci] = Math.min(255, longDirections * 34 + longest * 2 + Math.floor(total / 5));
    }
  }
  return heat;
}

export function summarizeRoofLosExposure(
  world: World,
  heat = buildRoofLosExposureHeatmap(world),
): RoofLosExposureSummary {
  const shelterIndex = createRoofShelterIndex(world, ROOF_LOS_SHELTER_MAX_SPACING);
  let exposedCells = 0;
  let deliberateExposedCells = 0;
  let unshelteredExposedCells = 0;
  let maxScore = 0;

  for (let i = 0; i < heat.length; i++) {
    const score = heat[i];
    if (score > maxScore) maxScore = score;
    if (score < ROOF_LOS_EXPOSURE_THRESHOLD) continue;
    exposedCells++;
    const x = i % W;
    const y = (i / W) | 0;
    if (isDeliberateRoofExposure(world, i)) {
      deliberateExposedCells++;
    } else if (!hasRoofExposureShelterNear(world, shelterIndex, x, y)) {
      unshelteredExposedCells++;
    }
  }

  return {
    exposedCells,
    deliberateExposedCells,
    unshelteredExposedCells,
    shelterCells: shelterIndex.shelterCells,
    maxScore,
  };
}

export function applyRoofLosShelterPockets(world: World, rng: () => number): RoofLosExposureSummary {
  const heat = buildRoofLosExposureHeatmap(world);
  const shelterIndex = createRoofShelterIndex(world, ROOF_LOS_SHELTER_MAX_SPACING);
  let placed = 0;
  const phaseX = Math.floor(rng() * 17);
  const phaseY = Math.floor(rng() * 19);

  for (const threshold of [174, 142, ROOF_LOS_EXPOSURE_THRESHOLD]) {
    for (let y = phaseY; y < W + phaseY && placed < ROOF_LOS_SHELTER_CAP; y++) {
      const wy = y & (W - 1);
      for (let x = phaseX; x < W + phaseX && placed < ROOF_LOS_SHELTER_CAP; x++) {
        const wx = x & (W - 1);
        const ci = world.idx(wx, wy);
        if (heat[ci] < threshold) continue;
        if (isDeliberateRoofExposure(world, ci)) continue;
        if (hasRoofExposureShelterNear(world, shelterIndex, wx, wy)) continue;
        const cells = placeRoofExposureShelterNear(world, wx, wy, rng);
        if (!cells) continue;
        for (const cell of cells) addRoofShelterCell(shelterIndex, cell % W, (cell / W) | 0);
        placed++;
      }
    }
  }

  if (placed > 0) {
    world.markCellsDirty();
    world.markWallTexDirty();
    world.markFeaturesDirty();
    world.markSurfaceDirty();
  }
  return summarizeRoofLosExposure(world, heat);
}



export function generateRoofDesignFloor(seed = 0): RoofGeneration {
  const world = new World();
  world.globalCeilingTier = 14; // Force fixed high ceiling (tier 14 -> height 8) to act as sky over the abyss

  const entities: Entity[] = [];
  const nextId = { v: 10000 };
  let nextContainerId = CONTAINER_ID_BASE;

  world.wallTex.fill(Tex.CONCRETE);
  world.floorTex.fill(Tex.F_CONCRETE);

  const rooms = stampRoofRooms(world);
  connectRoomsMST(world, [
    rooms.entry,
    rooms.mainSlab,
    rooms.meteorology,
    rooms.riggerMast,
    rooms.ventShelter,
    rooms.waterTanks,
    rooms.sniperNest,
    rooms.cloudCamp,
    rooms.maintenanceHatch,
  ]);
  placeDoor(world, rooms.mainSlab, rooms.meteorology, '', false);
  placeDoor(world, rooms.mainSlab, rooms.ventShelter, '', true);
  placeDoor(world, rooms.riggerMast, rooms.waterTanks, '', false);
  sanitizeDoors(world);
  closeShelterDoors(world, rooms.ventShelter);

  generateZones(world);
  retuneRoofZones(world, rooms);
  decorateRoof(world, rooms);

  spawnRoofMonsters(world, entities, nextId, rooms);

  addRoofContainer(world, nextContainerId++, rooms.meteorology, 3, 2, ContainerKind.FILING_CABINET, 'Запертый шкаф ложных прогнозов', 'locked', [
    { defId: 'blank_form', count: 2 },
    { defId: 'siren_instruction', count: 1 },
    { defId: 'note', count: 1, data: 'Варвара: прогноз N-40 отправлен пустым каналом. Ясно, пока Министерству выгодно видеть далеко.' },
  ], undefined, ['weather', 'ministry_report', 'evacuated']);
  addRoofContainer(world, nextContainerId++, rooms.riggerMast, 3, 3, ContainerKind.TOOL_LOCKER, 'Сорванный ящик верхолаза', 'locked', [
    { defId: 'wire_coil', count: 2 },
    { defId: 'fuse', count: 1 },
    { defId: 'relay_diagram', count: 1 },
    { defId: 'note', count: 1, data: 'Сеня: мачта держится на проволоке, молитве и чужих ошибках. Проволока закончилась первой.' },
  ], undefined, ['repair', 'antenna', 'evacuated']);
  addRoofContainer(world, nextContainerId++, rooms.sniperNest, 4, 2, ContainerKind.WEAPON_CRATE, 'Сухой ящик пустого гнезда', 'locked', [
    { defId: 'ammo_energy', count: 1 },
    { defId: 'ammo_762', count: 8 },
    { defId: 'note', count: 1, data: 'Кадыр: открытая крыша принадлежит тому, кто раньше увидел движение. Я ушел ниже, пока движение смотрит вверх.' },
  ], undefined, ['sniper', 'liquidator_trace']);
  addRoofContainer(world, nextContainerId++, rooms.waterTanks, 6, 4, ContainerKind.EMERGENCY_BOX, 'Сборник чистой воды', 'locked', [
    { defId: 'filtered_water', count: 2 },
    { defId: 'gasmask_filter', count: 1 },
  ], undefined, ['water', 'aftermath']);
  addRoofContainer(world, nextContainerId++, rooms.cloudCamp, 4, 3, ContainerKind.FILING_CABINET, 'Полевой журнал повторного облака', 'secret', [
    { defId: 'overexposed_photo', count: 1 },
    { defId: 'bottled_voice', count: 1 },
    { defId: 'note', count: 1, data: 'Тихон: я видел, как одно облако прошло дважды. Второй раз оно знало, где я стою.' },
  ], undefined, ['sky', 'cloud', 'witness_trace']);

  dropItem(entities, nextId, rooms.entry.x + 4, rooms.entry.y + 5, 'siren_instruction', 1);
  dropItem(entities, nextId, rooms.mainSlab.x + 12, rooms.mainSlab.y + 8, 'wire_coil', 1);
  dropItem(entities, nextId, rooms.meteorology.x + 9, rooms.meteorology.y + 6, 'note', 1, 'Распечатка облачного кадра: облако повторилось, но тень под ним сместилась.');
  dropItem(entities, nextId, rooms.cloudCamp.x + 5, rooms.cloudCamp.y + 3, 'note', 1, 'Тихон считал не облака, а секунды между одинаковыми облаками. Последняя строка оборвана словом "смотрит".');

  placeFixedLift(world, rooms.entry.x + 2, rooms.entry.y + 2, LiftDirection.DOWN);
  placeFixedLift(world, rooms.maintenanceHatch.x + rooms.maintenanceHatch.w - 3, rooms.maintenanceHatch.y + 2, LiftDirection.DOWN);
  registerRoofWindShelterCue(world, rooms);

  const spawnX = rooms.entry.x + 5.5;
  const spawnY = rooms.entry.y + 7.5;
  ensureConnectivity(world, spawnX, spawnY);
  applyUniformSkyLight(world);

  const weatherState = createRoofWeatherState(seed);
  const skyProvider = createRoofSkyTextureProvider(seed, weatherState.skyTimeOfDay);
  genLog(`[DESIGN_FLOOR] ${ROOF_ROUTE_ID} z=${ROOF_FUTURE_Z} rooms=${Object.keys(rooms).length} seed=${seed}`);
  const generation = {
    world,
    entities,
    spawnX,
    spawnY,
    routeId: ROOF_ROUTE_ID,
    z: ROOF_FUTURE_Z,
    weatherState,
    skyProvider,
    debug: roofDebugLines(weatherState),
    isDecentralized: true,
  };

  const route = designFloorById(ROOF_ROUTE_ID)!;
  const rngFn = seededRandom(hashSeed(`design-full:${route.id}:${route.z}`, route.z));

  expandRoofArchipelago(world, rngFn);
  applyRoofLosShelterPockets(world, rngFn);
  finalizeExpandedFloor(generation, route, rngFn);
  applyDesignFloorPopulationField(generation, route);

  return generation;
}

