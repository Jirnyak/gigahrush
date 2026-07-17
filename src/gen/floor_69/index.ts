import { rng, withSeededRandom } from '../../core/rand';
import { applyDesignFloorPopulationField } from '../design_floors/population';
/* -- Design floor 69: adult vice, debt, blackmail and refuge ---- */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  AIGoal, Cell, ContainerKind, DoorState, EntityType, Faction, Feature,
  LiftDirection, Occupation, QuestType, RoomType, Tex, ZoneFaction,
  W, type ContainerAccess, type Entity, type Room, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { designFloorProfile, FLOOR_69_WORKER_ROLE_ID } from '../../data/design_floor_profiles';
import { designNpcFloorKey, type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { NPC_VISUAL_FLOOR69_FEMALE } from '../../entities/npc_visuals';
import { Spr } from '../../render/sprite_index';
import { registerRouteCue } from '../../systems/route_cues';
import { calcZoneLevel } from '../../systems/rpg';
import {
  carveCorridor,
  ensureConnectivity,
  generateZones,
  placeDoor,
  protectRoom,
  sanitizeDoors,
  stampRoom,
} from '../shared';
import { genLog } from '../log';
import type { FloorGeneration } from '../floor_manifest';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';


import { bounded, hashFloor69Entity, floor69FemaleSprite, isFloor69GeneratedVisitor, shouldPromoteFloor69Worker, isFloor69Worker, promoteFloor69Worker, floor69RoomFaction, floor69ControlAt, Floor69Rooms, applyRoomTextures, addRoom, connect, setFeature, addScreenWall, addPosterWall, addLift, Floor69MacroCounts, canCarveFloor69Route, carveRouteCell, carveRouteDisc, carveRouteLine, doorWalkable, doorHasStableJamb, placeRoomDoor, openRoomToNearestRoute, addRouteGate, pickRouteRoomType, decorateRouteRoom, addRouteRoom, canPlaceFloor69Room, floor69OwnerWallTex, floor69OwnerFloorTex, assignFloor69RoomOwner, decorateOwnedSupportRoom, tryAddOwnedRoom, tryAddRouteRoom, addHorizontalRooms, addHorizontalOwnedRooms, addVerticalOwnedRooms, supportRoomType, buildFloor69MiniHq, buildFloor69DenseBlock, buildFloor69MidMicroLayer, decorateRouteLine, buildLayout, decorateRooms, placeNonExplicitRouteSignals, roomMidX, roomMidY, registerFloor69RouteCues, applyZones } from './geometry';
import { NPC_DEFS, registerFloorSideQuest, addItemDrop, nextContainerId, addContainer, seedContainers, spawnNpc, spawnAmbientAdult, spawnFloor69Npcs, spawnCheckpointCrowd, seedLooseItems, applyFloor69OwnershipVisibilityHeatmap, applyFloor69AmbientSpriteTemplates } from './npcs';
import { expandFloor69FullFloor, buildFloor69NorthShadowDistrict, buildFloor69WestWaitingQuarter, buildFloor69DeepMidWestLabyrinth, buildFloor69EastDebtSector, buildFloor69SouthRefugeSector, buildFloor69FarOuterPockets, buildFloor69GlobalPerimeterRing, buildFloor69NorthDeepSector, buildFloor69SouthDeepSector, buildFloor69WestEastDeepSectors, buildFloor69InnerMonolithGrid, buildFloor69BeyondPerimeterTunnels, buildFloor69ExperimentalHydroponics, buildFloor69UndergroundMarketAndCinema, buildFloor69SubMonolithLotto, buildFloor69TrueInterconnectedGridAndAlleys } from './districts';
import { buildFloor69PublicRoutes, buildFloor69HotelWings, buildFloor69BackstageLoop, buildFloor69DebtBlock, buildFloor69RefugeClosets, buildFloor69SecurityChokes } from './routes';
export const DESIGN_FLOOR_ID = 'floor_69' as const;
export const DESIGN_FLOOR_Z = -4;
export const FLOOR_69_DEFAULT_SEED = 690004;
export const HOME_FLOOR_KEY = designNpcFloorKey(DESIGN_FLOOR_ID);
export const FLOOR_69_RAID_SHUTTER_KEY = 'f69_raid_shutter';

export const FLOOR_69_RAID_SHUTTER_GATES = [
  { x: 620, y1: 505, y2: 519, doorY: 512, bypass: { ax: 604, ay: 552, bx: 656, by: 552 } },
  { x: 760, y1: 505, y2: 519, doorY: 512, bypass: { ax: 736, ay: 552, bx: 904, by: 552 } },
] as const;

// Current core state still requires a number. Future route integration should
// adapt this string-route floor instead of adding a casual enum here.
export const FLOOR_69_BASE_FLOOR = 140;
export const FLOOR_69_MAX_FLAGS = 8;
export const FLOOR_69_CHECKPOINT_CROWD_CAP = 12;
export const FLOOR_69_FEMALE_SPRITE_COUNT = Spr.F69_FEMALE_NPC_7 - Spr.F69_FEMALE_NPC_BASE + 1;
export const FLOOR_69_PROFILE = designFloorProfile(DESIGN_FLOOR_ID);
export const FLOOR_69_WORKER_ROLE = FLOOR_69_PROFILE?.localRoles?.find(role => role.id === FLOOR_69_WORKER_ROLE_ID);
export const FLOOR_69_WORKER_CANDIDATE_OCCUPATIONS = new Set<Occupation>(
  FLOOR_69_WORKER_ROLE?.candidateOccupations ?? FLOOR_69_WORKER_ROLE?.baseOccupations ?? [],
);

export const FLOOR_69_CONTROL_ANCHORS: readonly {
  x: number;
  y: number;
  radius: number;
  faction: ZoneFaction;
  weight: number;
  visibility: number;
  danger: number;
}[] = [
  { x: 482, y: 502, radius: 82, faction: ZoneFaction.LIQUIDATOR, weight: 2.35, visibility: 1.0, danger: 2 },
  { x: 690, y: 512, radius: 190, faction: ZoneFaction.LIQUIDATOR, weight: 2.1, visibility: 0.95, danger: 2 },
  { x: 740, y: 584, radius: 176, faction: ZoneFaction.LIQUIDATOR, weight: 1.85, visibility: 0.78, danger: 2 },
  { x: 538, y: 501, radius: 76, faction: ZoneFaction.CITIZEN, weight: 1.35, visibility: 0.68, danger: 0 },
  { x: 538, y: 501, radius: 48, faction: ZoneFaction.CITIZEN, weight: 0.85, visibility: 0.34, danger: 0 },
  { x: 506, y: 520, radius: 70, faction: ZoneFaction.CITIZEN, weight: 2.25, visibility: 0.24, danger: 0 },
  { x: 512, y: 512, radius: 148, faction: ZoneFaction.CITIZEN, weight: 1.45, visibility: 0.72, danger: 1 },
  { x: 510, y: 536, radius: 118, faction: ZoneFaction.WILD, weight: 0.92, visibility: 0.18, danger: 1 },
  { x: 736, y: 812, radius: 144, faction: ZoneFaction.WILD, weight: 1.15, visibility: 0.34, danger: 1 },
  { x: 304, y: 300, radius: 132, faction: ZoneFaction.SCIENTIST, weight: 1.7, visibility: 0.56, danger: 2 },
  { x: 304, y: 744, radius: 142, faction: ZoneFaction.CULTIST, weight: 1.55, visibility: 0.28, danger: 2 },
  { x: 836, y: 448, radius: 126, faction: ZoneFaction.LIQUIDATOR, weight: 1.6, visibility: 0.82, danger: 2 },
];

export const IRA_WORKER_LINES = [
  'Милый, смотреть можно на ценник. На дверь тоже смотри: рейд ходит тише клиентов.',
  'Я взрослая и работаю здесь по своим правилам. Первое правило: не при всех и не бесплатно.',
  'Долг тут липнет хуже слизи. Слизь хоть видно.',
  'Запись не продавай первому чиновнику. Второй даст больше и меньше вопросов.',
  'Если сирена начнется, комнату закрою. Бесплатно я только воздухом делюсь, и то не всегда.',
  'Мне не спасатель нужен. Мне нужен человек, который умеет молчать у нужной двери.',
  'Охрана улыбается, когда считает чужие деньги. Когда считает чужие имена, уже поздно.',
  'Клиника за стеной не добрая, зато там моют руки до журнала.',
  'Не говори за меня с Розой. Скажешь лишнее - долг перепишут на мой голос.',
  'Клиент уходит, расписка остается. Вот почему я запоминаю двери, а не лица.',
  'У нас границы простые: дверь, цена, слово нет. Кто не понял, разговаривает с Веней.',
  'Рейд любит шумных героев. Тихие люди уходят через служебный ход.',
  'Черная запись в сейфе не про любовь. Она про власть, которая боится свидетелей.',
  'Наличные кончаются. Бумаги нет. Поэтому долг тут живучее человека.',
  'Если принесешь антибиотик Симе, половина этажа перестанет кашлять на чужие секреты.',
  'Я не прошу жалости. Жалость быстро дешевеет, а ключ держит цену.',
  'Хочешь помочь - найди список рейда раньше рейда.',
  'Хочешь заработать - не делай вид, что это доброта.',
  'Хочешь выйти чистым - не бери бумагу, которую не готов прочесть вслух.',
  'У этой комнаты есть замок. У меня есть память. Оба работают лучше угроз.',
  'Если должника прячут, дверь закрывают изнутри. Если продают, снаружи.',
  'Сима спросит пульс, Роза спросит срок, Нил спросит подпись. Я спрошу, кто тебя видел.',
  'Не трогай жалобу под сургучом без плана. Сургуч иногда держит не бумагу, а человека.',
  'Когда самосбор за стеной, самая дорогая вещь - не койка. Самая дорогая вещь - не быть в списке.',
];

export const IRA_WORKER_POST_LINES = [
  'Тихая комната открыта. Это не конец долга, но уже не клетка.',
  'Бумага сгорела. Пахнет лучше, чем страх.',
  'Сима держит дверь. Значит, есть еще место, где не торгуют человеком.',
  'Сегодня я знаю, кто молчал правильно. Это дороже охраны.',
  'Если спросит Роза, я работаю. Если спросит рейд, меня здесь не было.',
  'Не путай благодарность с приглашением. Граница осталась, просто дверь стала нашей.',
];

export interface Floor69State {
  heat: number;
  trust: number;
  raidUntilHour: number;
  debtFlags: string[];
  blackmailFlags: string[];
}

export interface Floor69Generation extends FloorGeneration {
  routeId: typeof DESIGN_FLOOR_ID;
  z: typeof DESIGN_FLOOR_Z;
  seed: number;
  state: Floor69State;
  debugLines: string[];
  isDecentralized?: boolean;
  onAfterTerritory?: (world: World, entities: Entity[]) => void;
}

export function createFloor69State(state: Partial<Floor69State> = {}): Floor69State {
  return {
    heat: bounded(state.heat ?? 34, 0, 100),
    trust: bounded(state.trust ?? 0, -5, 5),
    raidUntilHour: Math.max(-1, state.raidUntilHour ?? -1),
    debtFlags: (state.debtFlags ?? ['f69_roza_ledger_live', 'f69_market_88_debt_link'])
      .slice(0, FLOOR_69_MAX_FLAGS),
    blackmailFlags: (state.blackmailFlags ?? ['f69_official_denunciation_live'])
      .slice(0, FLOOR_69_MAX_FLAGS),
  };
}

export function floor69DebugLines(state: Floor69State, seed = FLOOR_69_DEFAULT_SEED): string[] {
  const s = createFloor69State(state);
  return [
    `route=${DESIGN_FLOOR_ID} z=${DESIGN_FLOOR_Z} seed=${seed}`,
    `heat=${s.heat}/100 trust=${s.trust}/5 raidUntilHour=${s.raidUntilHour}`,
    `debt=${s.debtFlags.join(',') || 'none'}`,
    `blackmail=${s.blackmailFlags.join(',') || 'none'}`,
    'debugEntry=generateFloor69DesignFloor(seed)',
  ];
}

export function floor69EventTags(...tags: string[]): string[] {
  return ['floor_69', 'route_risk', 'route_reward', 'adult_only', ...tags];
}

export function floor69RouteEventData(choice: string, risk: string, reward: string): Record<string, unknown> {
  return { routeId: DESIGN_FLOOR_ID, z: DESIGN_FLOOR_Z, choice, risk, reward };
}

export function generateFloor69DesignFloor(seed = FLOOR_69_DEFAULT_SEED): Floor69Generation {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };
    const state = createFloor69State();

    const rooms = buildLayout(world);
    decorateRooms(world, rooms, seed);
    applyZones(world);
    applyFloor69OwnershipVisibilityHeatmap(world);
    seedContainers(world, rooms);
    spawnFloor69Npcs(world, entities, nextId, rooms);
    applyFloor69AmbientSpriteTemplates(entities);
    seedLooseItems(entities, nextId, rooms);
    registerFloor69RouteCues(world, rooms);

    const spawnX = rooms.publicCorridor.x + 8.5;
    const spawnY = rooms.publicCorridor.y + 3.5;
    ensureConnectivity(world, spawnX, spawnY);
    sanitizeDoors(world);
    world.bakeLights();

    const route = { id: DESIGN_FLOOR_ID, z: DESIGN_FLOOR_Z };
    const generation = { world, entities };
    applyDesignFloorPopulationField(generation as any, route as any);

    genLog(`[F69] design floor seed=${seed} rooms=${world.rooms.length} spawn=(${spawnX.toFixed(1)}, ${spawnY.toFixed(1)})`);
    return {
      world,
      entities,
      spawnX,
      spawnY,
      routeId: DESIGN_FLOOR_ID,
      z: DESIGN_FLOOR_Z,
      seed,
      state,
      debugLines: floor69DebugLines(state, seed),
      isDecentralized: true,
    };
  });
}

