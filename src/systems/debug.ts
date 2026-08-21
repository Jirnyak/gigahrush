/* ── Debug menu: commands + overlay rendering ────────────────── */

import {
  W, Cell, Feature, RoomType, Faction, ZoneFaction, LiftDirection, EntityType, MonsterKind, Occupation, AIGoal, ItemType,
  type Entity, type GameState, type ItemDef, type WorldContainer,
  msg } from '../core/types';
import { World } from '../core/world';
import { freshNeeds, randomName, ITEMS } from '../data/catalog';
import { getStack } from '../data/items';
import { PSI_WEAPON_STATS } from '../data/psi';
import { designFloorAtZ } from "../data/design_floors";
import { getPermitDef, type PermitAccessTag } from '../data/permits';
import { FACTION_NAMES } from '../data/relations';
import { MONSTERS, monsterTypeName } from '../entities/monster';
import { monsterSpr, Spr } from '../entities/sprite_index';
import { CRITTERS_POOL, MAX_CRITTERS } from '../render/critters';
import {  randomRPG, getMaxHp } from './rpg';
import { isDebugNoClipEnabled } from './psi';
import {   publishEvent } from './events';
import { summarizeRoomMemoryForRoom } from './room_memory';
import { describeContainer, ensureRoomContainers } from './containers';
import { changeResourceStock, getAdjustedItemPrice, getResourceScarcity, summarizeEconomy } from './economy';
import { controlBindingLabel, menuCloseHint } from './controls';
import { addItem, removeItem } from './inventory';
import { findActorPermit, recordPermitAccess, recordPermitExposure } from './permits';
import { spawnContract, spawnContractById, summarizeContracts } from './contracts';
import { getSamosborDebugLines } from './samosbor';
import { territoryOwnerAtIndex } from './territory';
import { summarizeCarnivorousFungus } from './carnivorous_fungus';
import { summarizeHladonColdPockets } from './hladon';
import { ensureFloorInstanceState, floorInstanceIdentityLine, floorInstanceLabel, summarizeFloorInstances } from './floor_instances';
import {
  currentFloorRunEntry,
  floorRunEntryKind,
  floorRunEntryRouteId,
  resolveFloorRunRoute,
  summarizeFloorRun } from './procedural_floors';
import { summarizeProceduralSmog } from './procedural_anomalies';
import {  summarizeBadAppleWorld } from './procedural_anomalies/bad_apple_world';
import { forceFactionEvent } from './faction_events';
import {  pseudoliftDebugSummary } from './pseudolift';
import { DESIGN_FLOOR_ROUTES, type DesignFloorId } from '../data/design_floors';
import { FLOOR_INSTANCES } from '../data/floor_instances';
import { type FloorAnomalyId } from '../data/procedural_floors';
import { isDebugOnePunchManEnabled } from './debug_cheats';
import { fitText } from '../render/ui_text';
import { getAiStats } from './ai';
import { canSpawnEntityType, entitySpawnSlots } from './entity_limits';
import { isPlayerEntity } from './player_actor';
import { currentAlifeFloorKey } from './alife';
import {
  activeFloorSceneId,
  floorSceneById,
  floorScenesForSave,
  isFloorSceneActive,
  requestFloorScene,
  resetFloorScenes,
  type FloorSceneDef } from './cinematics';
import { rng, mathRng } from '../core/rand';
import { movePlayerToSmokeLift } from './debug_smoke';
import {
  DEBUG_GROUPS,
  debugCommandIndex,
  debugCommands,
  debugPanels,
  makeDebugCtx,
  registerDebugCommand,
  registerDebugPanel,
  runDebugCommand,
  type DebugAction,
  type DebugPanelDef,
  type DebugPanelLine } from './debug_registry';
import { drawNeuroPanel } from '../render/hud_fx';

/* ── Command execution ───────────────────────────────────────── */

export type { DebugAction, DebugAction as DebugCommandAction } from './debug_registry';

const DESIGN_FLOOR_COMMAND_ID_PREFIX = 'teleport_design_z: ';

const DEBUG_SAMOSBOR_WARNING_SECONDS = 12;
const DEBUG_MONSTER_SCAN_CAP = 192;
const DEBUG_CONTAINER_ROUTE_RADIUS = 2;
const EXPEDITION_PROOF_CONTRACT_ID = 'exp_maint_pressure_repair';
const DEBUG_ROUTE_FLOOD_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const DEBUG_VERIFICATION_CONTRACT_IDS = [
  'exp_living_emergency_roster',
  'exp_ministry_safe_override',
  'exp_kvartiry_ration_stamp',
  'exp_maint_pressure_repair',
  'exp_hell_bottled_voice_retrieve',
  'exp_void_archive_warrant',
] as const;
const DEBUG_ECONOMY_PULSES = [
  { resourceId: 'drink_water', itemId: 'water', delta: -90, label: 'вода' },
  { resourceId: 'medicine', itemId: 'bandage', delta: -55, label: 'медицина' },
  { resourceId: 'ammo', itemId: 'ammo_9mm', delta: -65, label: 'патроны' },
] as const;
export const SMOKE_STRESS_HOOK_ID = 'stress_spawn' as const;
export const SMOKE_DEBUG_COMMAND_IDS = {
  teleportLiving: 'teleport_design_z: living',
  teleportMaintenance: 'teleport_design_z: maintenance',
  forceFactionEvent: 'force_faction_event',
  rareSamosbor: 'rare_samosbor',
  expeditionSetup: 'smoke_expedition_setup',
  expeditionProofPrep: 'expedition_proof_prep',
  expeditionProofLiftReady: 'expedition_proof_lift_ready',
  expeditionProofCollectorsArrival: 'expedition_proof_collectors_arrival',
  expeditionProofRisk: 'expedition_proof_risk',
  expeditionProofContainer: 'expedition_proof_container',
  expeditionProofSamosborWarning: 'expedition_proof_samosbor_warning',
  expeditionProofReturn: 'expedition_proof_return' } as const;
const DEBUG_MONSTER_PACKS: Record<string, readonly MonsterKind[]> = {
  ministry: [MonsterKind.PECHATEED, MonsterKind.KONTORSHCHIK, MonsterKind.PARAGRAPH, MonsterKind.PROTOKOLNIK, MonsterKind.SHOVNIK, MonsterKind.LAMPOGLAZ, MonsterKind.KANTSELYARSKIY_IDOL, MonsterKind.LOZHNYY_DUKH, MonsterKind.TONKAYA_TEN, MonsterKind.BLACK_LIQUIDATOR, MonsterKind.HEAD_SLUG, MonsterKind.CHERVIE_AVATAR, MonsterKind.MUKHOZHUK_HOST, MonsterKind.BEZEKHIY, MonsterKind.SPORE_CARPET],
  kvartiry: [MonsterKind.REBAR, MonsterKind.NELYUD, MonsterKind.KRYSNOZHKA, MonsterKind.POMOYNY_ROY, MonsterKind.GREEN_DOG, MonsterKind.PANELNIK, MonsterKind.PAUPSINA, MonsterKind.BLACK_LIQUIDATOR, MonsterKind.OBZHIVALSHCHIK, MonsterKind.ZHORNAYA_TVAR, MonsterKind.DIKIY_MERTVYAK, MonsterKind.HEAD_SLUG, MonsterKind.BEZEKHIY, MonsterKind.TRESKOTNIK, MonsterKind.GNILUSHKA, MonsterKind.SPORE_CARPET],
  living: [MonsterKind.SBORKA, MonsterKind.SHADOW, MonsterKind.NELYUD, MonsterKind.LAMPOGLAZ, MonsterKind.POMOYNY_ROY, MonsterKind.GREEN_DOG, MonsterKind.PANELNIK, MonsterKind.PAUPSINA, MonsterKind.BLACK_LIQUIDATOR, MonsterKind.OBZHIVALSHCHIK, MonsterKind.TUMANNIK, MonsterKind.FOG_SHARK, MonsterKind.ZHORNAYA_TVAR, MonsterKind.SOBRANNYY, MonsterKind.SLIME_WOMAN, MonsterKind.BORSHCHEVIK, MonsterKind.BLOOD_PLANT, MonsterKind.HEAD_SLUG, MonsterKind.LOZHNYY_DUKH, MonsterKind.DIKIY_MERTVYAK, MonsterKind.BEZEKHIY, MonsterKind.TRESKOTNIK, MonsterKind.TONKAYA_TEN, MonsterKind.GNILUSHKA, MonsterKind.SPORE_CARPET],
  maintenance: [MonsterKind.TUBE_EEL, MonsterKind.POLZUN, MonsterKind.KOSTOREZ, MonsterKind.SAFEGUARD, MonsterKind.BETONOED, MonsterKind.POMOYNY_ROY, MonsterKind.SWARM, MonsterKind.GREEN_DOG, MonsterKind.PANELNIK, MonsterKind.PAUPSINA, MonsterKind.SOBRANNYY, MonsterKind.SLIME_WOMAN, MonsterKind.BORSHCHEVIK, MonsterKind.BLOOD_PLANT, MonsterKind.OLGOY, MonsterKind.VODYANOY_KOSHMAR, MonsterKind.ZAKALENNAYA_ARMATURA, MonsterKind.HEAD_SLUG, MonsterKind.CHERVIE_AVATAR, MonsterKind.MUKHOZHUK_HOST, MonsterKind.TRUBNYY_AVTOMAT, MonsterKind.FOG_SHARK, MonsterKind.SPORE_CARPET],
  hell: [MonsterKind.HERALD, MonsterKind.KOSTOREZ, MonsterKind.KHOROVAYA_MATKA, MonsterKind.TVAR, MonsterKind.TUMANNIK, MonsterKind.FOG_SHARK, MonsterKind.ZHORNAYA_TVAR, MonsterKind.SOBRANNYY, MonsterKind.BLOOD_PLANT, MonsterKind.SWARM, MonsterKind.OLGOY, MonsterKind.ZAKALENNAYA_ARMATURA, MonsterKind.TRESKOTNIK, MonsterKind.GLUBINNAYA_TEN, MonsterKind.LISHENNYY],
  void: [MonsterKind.PARAGRAPH, MonsterKind.EYE, MonsterKind.SPIRIT, MonsterKind.SAFEGUARD, MonsterKind.LOZHNYY_DUKH, MonsterKind.TONKAYA_TEN, MonsterKind.CHERVIE_AVATAR, MonsterKind.GLUBINNAYA_TEN, MonsterKind.LISHENNYY] };
const DEBUG_PERMIT_PACK = [
  'official_permit_slip',
  'forged_permit_slip',
  'raionsovet_floor_pass',
  'forged_raionsovet_pass',
  'bank_debt_paper',
  'forged_bank_debt_paper',
  'debt_settlement_receipt',
  'confiscation_warrant',
  'ministry_clean_stamp',
  'blank_form',
  'ink_bottle',
] as const;
let debugVerificationContractIndex = 0;
let debugEconomyPulseIndex = 0;
let debugFloorInstanceCursor = 0;

function formatDebugZ(z: number): string {
  return z > 0 ? `+${z}` : `${z}`;
}

function currentPlayerZone(world: World, player: Entity): number | undefined {
  const x = world.wrap(Math.floor(player.x));
  const y = world.wrap(Math.floor(player.y));
  const zone = world.zoneMap[world.idx(x, y)];
  return zone >= 0 ? zone : undefined;
}

function currentPlayerRoom(world: World, player: Entity): number | undefined {
  const x = world.wrap(Math.floor(player.x));
  const y = world.wrap(Math.floor(player.y));
  const room = world.roomMap[world.idx(x, y)];
  return room >= 0 ? room : undefined;
}

function routeEntryLine(prefix: string, entry: ReturnType<typeof currentFloorRunEntry> | null): string {
  if (!entry) return `${prefix}: нет остановки`;
  const kind = entry.spec
    ? `proc ${entry.spec.anomalyId} d${entry.spec.danger}`
    : entry.designFloorId
      ? `design ${entry.designFloorId}`
      : `design ${entry.themeTags.join(",")}`;
  return `${prefix}: Z${formatDebugZ(entry.z)} ${kind} ${entry.label}`;
}

function debugRouteWindowLines(state: GameState): string[] {
  return [
    routeEntryLine('now', currentFloorRunEntry(state)),
    routeEntryLine('up', resolveFloorRunRoute(state, LiftDirection.UP)),
    routeEntryLine('down', resolveFloorRunRoute(state, LiftDirection.DOWN)),
  ];
}

interface DebugRouteFloorMetrics {
  passableCells: number;
  reachableCells: number;
  rooms: number;
  reachableRooms: number;
  functionalRooms: number;
  reachableFunctionalRooms: number;
  lifts: number;
  liftsUp: number;
  liftsDown: number;
  reachableLifts: number;
  reachableLiftsUp: number;
  reachableLiftsDown: number;
  playerBad: number;
  entityBad: number;
  containerBad: number;
}

function isDebugPassableCell(cell: number): boolean {
  return cell === Cell.FLOOR || cell === Cell.WATER || cell === Cell.DOOR;
}

function addDebugReachableRoom(world: World, roomSeen: Uint8Array, ci: number): void {
  const roomId = world.roomMap[ci];
  if (roomId >= 0 && roomId < roomSeen.length) roomSeen[roomId] = 1;
}

function countDebugBadPlacements(world: World, player: Entity, entities: Entity[]): Pick<DebugRouteFloorMetrics, 'playerBad' | 'entityBad' | 'containerBad'> {
  const playerBad = world.solid(Math.floor(player.x), Math.floor(player.y)) ? 1 : 0;
  let entityBad = 0;
  for (const e of entities) {
    if (!e.alive || isPlayerEntity(e) || e.type === EntityType.PROJECTILE || e.phasing) continue;
    if (world.solid(Math.floor(e.x), Math.floor(e.y))) entityBad++;
  }
  let containerBad = 0;
  for (const c of world.containers) {
    if (world.solid(c.x, c.y)) containerBad++;
  }
  return { playerBad, entityBad, containerBad };
}

function debugRouteFloorMetrics(world: World, player: Entity, entities: Entity[]): DebugRouteFloorMetrics {
  const reachable = new Uint8Array(W * W);
  const queue = new Int32Array(W * W);
  const roomSeen = new Uint8Array(world.rooms.length);
  let passableCells = 0;
  let lifts = 0;
  let liftsUp = 0;
  let liftsDown = 0;

  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (isDebugPassableCell(cell)) passableCells++;
    if (cell !== Cell.LIFT) continue;
    lifts++;
    if (world.liftDir[i] === LiftDirection.UP) liftsUp++;
    else liftsDown++;
  }

  let head = 0;
  let tail = 0;
  let reachableCells = 0;
  const start = world.idx(Math.floor(player.x), Math.floor(player.y));
  if (isDebugPassableCell(world.cells[start])) {
    reachable[start] = 1;
    queue[tail++] = start;
    reachableCells = 1;
    addDebugReachableRoom(world, roomSeen, start);
  }

  while (head < tail) {
    const ci = queue[head++];
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of DEBUG_ROUTE_FLOOD_DIRS) {
      const ni = world.idx(x + dx, y + dy);
      if (reachable[ni] || !isDebugPassableCell(world.cells[ni])) continue;
      reachable[ni] = 1;
      queue[tail++] = ni;
      reachableCells++;
      addDebugReachableRoom(world, roomSeen, ni);
    }
  }

  let reachableLifts = 0;
  let reachableLiftsUp = 0;
  let reachableLiftsDown = 0;
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] !== Cell.LIFT) continue;
    const x = i % W;
    const y = (i / W) | 0;
    let ok = false;
    for (const [dx, dy] of DEBUG_ROUTE_FLOOD_DIRS) {
      if (reachable[world.idx(x + dx, y + dy)]) {
        ok = true;
        break;
      }
    }
    if (!ok) continue;
    reachableLifts++;
    if (world.liftDir[i] === LiftDirection.UP) reachableLiftsUp++;
    else reachableLiftsDown++;
  }

  let reachableRooms = 0;
  let functionalRooms = 0;
  let reachableFunctionalRooms = 0;
  for (const room of world.rooms) {
    if (!room) continue;
    if (roomSeen[room.id]) reachableRooms++;
    if (room.type === RoomType.CORRIDOR) continue;
    functionalRooms++;
    if (roomSeen[room.id]) reachableFunctionalRooms++;
  }

  return {
    passableCells,
    reachableCells,
    rooms: world.rooms.length,
    reachableRooms,
    functionalRooms,
    reachableFunctionalRooms,
    lifts,
    liftsUp,
    liftsDown,
    reachableLifts,
    reachableLiftsUp,
    reachableLiftsDown,
    ...countDebugBadPlacements(world, player, entities) };
}

function debugRouteFloorSummaryLines(world: World, player: Entity, entities: Entity[], state: GameState): string[] {
  const entry = currentFloorRunEntry(state);
  const metrics = debugRouteFloorMetrics(world, player, entities);
  const badPlacements = metrics.playerBad + metrics.entityBad + metrics.containerBad;
  const story = entry.themeTags.join(",") ?? 'none';
  const design = entry.designFloorId ?? 'none';
  const procedural = entry.spec?.key ?? 'none';
  const anomaly = entry.spec?.anomalyId ?? 'none';
  const out = [
    `identity z=${formatDebugZ(entry.z)} route=${floorRunEntryRouteId(entry)} kind=${floorRunEntryKind(entry)} base=${entry.themeTags.join(",")} story=${story} design=${design} procedural=${procedural}`,
    `label=${entry.label}`,
    floorInstanceIdentityLine(state),
    `reach cells=${metrics.reachableCells}/${metrics.passableCells} rooms=${metrics.reachableRooms}/${metrics.rooms} functional=${metrics.reachableFunctionalRooms}/${metrics.functionalRooms}`,
    `lifts reachable=${metrics.reachableLifts}/${metrics.lifts} up=${metrics.reachableLiftsUp}/${metrics.liftsUp} down=${metrics.reachableLiftsDown}/${metrics.liftsDown}`,
    `anomaly spec=${anomaly} teleports=${world.anomalyTeleports.size} smogCells=${world.anomalySmogCells.length} smogHandled=${world.anomalySmogHandled ? 1 : 0} railTracks=${world.railTracks.length} railTrains=${world.railTrains.length}`,
    `bad placements=${badPlacements} player=${metrics.playerBad} entities=${metrics.entityBad} containers=${metrics.containerBad}`,
  ];
  if (entry.spec) {
    out.push(`procedural geom=${entry.spec.geometryId} faction=${entry.spec.majorityId} danger=${entry.spec.danger} seed=${entry.spec.seed}`);
  }
  for (const line of debugRouteWindowLines(state)) out.push(line);
  for (const line of summarizeFloorRun(state).slice(0, 4)) out.push(`run ${line}`);
  for (const line of summarizeFloorInstances(state).slice(0, 3)) out.push(`lift ${line}`);
  for (const line of summarizeProceduralSmog(world, state).slice(0, 2)) out.push(line);
  for (const line of summarizeCarnivorousFungus(world, 2)) out.push(line);
  for (const line of summarizeHladonColdPockets(world, player, 2)) out.push(line);
  for (const line of summarizeBadAppleWorld(world).slice(0, 2)) out.push(line);
  return out;
}

function spawnDebugVerificationContract(state: GameState): string[] {
  for (let step = 0; step < DEBUG_VERIFICATION_CONTRACT_IDS.length; step++) {
    const idx = (debugVerificationContractIndex + step) % DEBUG_VERIFICATION_CONTRACT_IDS.length;
    const id = DEBUG_VERIFICATION_CONTRACT_IDS[idx];
    if (state.quests.some(q => q.contractId === id)) continue;
    debugVerificationContractIndex = idx + 1;
    const created = spawnContractById(state, id, ['debug_route', 'verification']);
    return [
      created ? `created ${id}` : `failed ${id}`,
      ...summarizeContracts(state, 5),
    ];
  }
  return ['all verification contracts already exist in quest history', ...summarizeContracts(state, 5)];
}

function publishDebugVerificationEvent(world: World, player: Entity, state: GameState): string {
  const event = publishEvent(state, {
    type: 'rumor_observed',
    zoneId: currentPlayerZone(world, player),
    roomId: currentPlayerRoom(world, player),
    x: player.x,
    y: player.y,
    actorId: player.id,
    actorName: player.name ?? 'Вы',
    actorFaction: player.faction,
    targetName: 'debug verification route',
    severity: 4,
    privacy: 'local',
    tags: ['debug', 'verification', 'events', 'rumor_observed'],
    data: {
      source: 'debug_menu',
      routeZ: currentFloorRunEntry(state).z,
      samosborActive: state.samosborActive } });
  return `published ${event.type}#${event.id} sev${event.severity}`;
}

function applyDebugEconomyPulse(world: World, player: Entity, state: GameState): string[] {
  const pulse = DEBUG_ECONOMY_PULSES[debugEconomyPulseIndex++ % DEBUG_ECONOMY_PULSES.length];
  const before = getResourceScarcity(state, pulse.resourceId);
  const ok = changeResourceStock(state, pulse.resourceId, pulse.delta);
  const after = getResourceScarcity(state, pulse.resourceId);
  if (ok) {
    publishEvent(state, {
      type: 'room_lacked_resources',
      zoneId: currentPlayerZone(world, player),
      roomId: currentPlayerRoom(world, player),
      x: player.x,
      y: player.y,
      actorId: player.id,
      actorName: player.name ?? 'Вы',
      actorFaction: player.faction,
      itemId: pulse.itemId,
      itemName: ITEMS[pulse.itemId]?.name ?? pulse.itemId,
      severity: 4,
      privacy: 'local',
      tags: ['debug', 'economy', 'shortage', pulse.resourceId],
      data: {
        source: 'debug_menu',
        resourceId: pulse.resourceId,
        stockDelta: pulse.delta,
        scarcityBefore: before,
        scarcityAfter: after } });
  }
  return [
    ok
      ? `${pulse.label}: x${before.toFixed(2)} -> x${after.toFixed(2)} price ${getAdjustedItemPrice(state, pulse.itemId)}`
      : `${pulse.label}: resource missing`,
    ...summarizeEconomy(state, 5),
  ];
}

function passableDebugCell(world: World, x: number, y: number): boolean {
  const ci = world.idx(x, y);
  return (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) && !world.solid(x, y);
}

function entityBlocksDebugSpawn(world: World, entities: Entity[], x: number, y: number): boolean {
  let scanned = 0;
  for (const e of entities) {
    if (++scanned > DEBUG_MONSTER_SCAN_CAP) break;
    if (!e.alive || e.type === EntityType.ITEM_DROP || e.type === EntityType.PROJECTILE) continue;
    if (world.dist2(x + 0.5, y + 0.5, e.x, e.y) < 1.2) return true;
  }
  return false;
}

function findDebugMonsterSpot(
  world: World,
  player: Entity,
  entities: Entity[],
  index: number,
  total: number,
): { x: number; y: number } | null {
  const spread = Math.max(0.35, Math.min(0.9, Math.PI / Math.max(3, total)));
  const base = player.angle + (index - (total - 1) / 2) * spread;
  for (const dist of [3.2, 4.4, 5.8, 7.0]) {
    for (const offset of [0, 0.45, -0.45, 0.9, -0.9]) {
      const x = world.wrap(Math.floor(player.x + Math.cos(base + offset) * dist));
      const y = world.wrap(Math.floor(player.y + Math.sin(base + offset) * dist));
      if (!passableDebugCell(world, x, y)) continue;
      if (entityBlocksDebugSpawn(world, entities, x, y)) continue;
      return { x: x + 0.5, y: y + 0.5 };
    }
  }
  return null;
}

const DEBUG_FOG_SHARK_FOG_CAP = 40;

function seedDebugFogSharkPatch(world: World, kind: MonsterKind, x: number, y: number): number {
  if (kind !== MonsterKind.FOG_SHARK) return 0;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let cells = 0;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (cells >= DEBUG_FOG_SHARK_FOG_CAP) break;
      if (dx * dx + dy * dy > 18) continue;
      const px = world.wrap(cx + dx);
      const py = world.wrap(cy + dy);
      if (world.solid(px, py)) continue;
      const ci = world.idx(px, py);
      world.fog[ci] = Math.max(world.fog[ci], 88);
      cells++;
    }
  }
  if (cells > 0) world.markFogDirty();
  return cells;
}

function seedDebugLishennyyLight(world: World, player: Entity, kind: MonsterKind): number {
  if (kind !== MonsterKind.LISHENNYY) return 0;
  for (const dist of [2, 3, 4]) {
    const x = world.wrap(Math.floor(player.x + Math.cos(player.angle) * dist));
    const y = world.wrap(Math.floor(player.y + Math.sin(player.angle) * dist));
    if (!passableDebugCell(world, x, y)) continue;
    world.setFeatureAt(world.idx(x, y), Feature.LAMP);
    return 1;
  }
  return 0;
}

function spawnDebugMonsterPack(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  nextEntityId: { v: number },
): string[] {
  const designFloor = designFloorAtZ(state.currentZ);
  const tags = designFloor?.themeTags ? designFloor.themeTags : ['living'];
  const themeClass = ['ministry', 'kvartiry', 'living', 'maintenance', 'hell', 'void'].find(t => tags.includes(t)) || 'living';
  const kinds = DEBUG_MONSTER_PACKS[themeClass] || DEBUG_MONSTER_PACKS['living'];
  const slots = entitySpawnSlots(entities, EntityType.MONSTER, kinds.length);
  let spawned = 0;
  const names: string[] = [];
  for (let i = 0; i < kinds.length && spawned < slots; i++) {
    const kind = kinds[i];
    const def = MONSTERS[kind];
    const spot = findDebugMonsterSpot(world, player, entities, i, kinds.length);
    if (!def || !spot) continue;
    const monster: Entity = {
      id: nextEntityId.v++,
      type: EntityType.MONSTER,
      x: spot.x,
      y: spot.y,
      angle: Math.atan2(player.y - spot.y, player.x - spot.x),
      pitch: 0,
      alive: true,
      speed: def.speed,
      sprite: def.sprite,
      hp: def.hp,
      maxHp: def.hp,
      monsterKind: kind,
      attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: spot.x, ty: spot.y, path: [], pi: 0, stuck: 0, timer: 0 },
      rpg: randomRPG(player.rpg?.level ?? 1),
      phasing: kind === MonsterKind.SPIRIT };
    entities.push(monster);
    const debugFogCells = seedDebugFogSharkPatch(world, kind, spot.x, spot.y);
    const debugLightCells = seedDebugLishennyyLight(world, player, kind);
    spawned++;
    names.push(debugLightCells > 0 ? `${monsterTypeName(kind)}+light` : debugFogCells > 0 ? `${monsterTypeName(kind)}+fog` : monsterTypeName(kind));
    publishEvent(state, {
      type: 'monster_sighted',
      zoneId: currentPlayerZone(world, player),
      x: spot.x,
      y: spot.y,
      targetId: monster.id,
      targetName: monsterTypeName(kind),
      monsterKind: kind,
      severity: 3,
      privacy: 'local',
      tags: ['debug', 'monster', 'verification', 'counterplay'],
      data: {
        source: 'debug_menu',
        counterplay: def.counterplay,
        debugFogCells,
        debugLightCells } });
  }
  return spawned > 0
    ? [`spawned ${spawned}: ${names.join(', ')}`]
    : ['no passable spawn cells in front of player'];
}

function spawnDebugFalseCleanupPatrol(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  nextEntityId: { v: number },
): string[] {
  const kind = MonsterKind.BLACK_LIQUIDATOR;
  const def = MONSTERS[kind];
  const target = 3;
  const slots = entitySpawnSlots(entities, EntityType.MONSTER, target);
  let spawned = 0;
  for (let i = 0; i < slots; i++) {
    const spot = findDebugMonsterSpot(world, player, entities, i, target);
    if (!spot) continue;
    entities.push({
      id: nextEntityId.v++,
      type: EntityType.MONSTER,
      x: spot.x,
      y: spot.y,
      angle: Math.atan2(player.y - spot.y, player.x - spot.x),
      pitch: 0,
      alive: true,
      speed: def.speed,
      sprite: def.sprite,
      hp: def.hp,
      maxHp: def.hp,
      monsterKind: kind,
      attackCd: def.attackRate,
      ai: { goal: AIGoal.WANDER, tx: spot.x, ty: spot.y, path: [], pi: 0, stuck: 0, timer: 0 },
      rpg: randomRPG(player.rpg?.level ?? 1),
      spriteSeed: (nextEntityId.v * 2654435761) >>> 0 });
    spawned++;
  }
  if (spawned > 0) {
    state.samosborCount = Math.max(state.samosborCount, 3);
    publishEvent(state, {
      type: 'false_liquidator_knock',
      zoneId: currentPlayerZone(world, player),
      x: player.x,
      y: player.y,
      targetName: 'debug false cleanup patrol',
      monsterKind: kind,
      severity: 3,
      privacy: 'local',
      tags: ['debug', 'monster', 'black_liquidator', 'false_cleanup'],
      data: { source: 'debug_menu', monsterCount: spawned } });
  }
  return spawned > 0
    ? [`fake cleanup patrol spawned: ${spawned}`]
    : ['no passable spawn cells for fake cleanup patrol'];
}

function nearestDebugMukhozhukNpc(world: World, player: Entity, entities: Entity[]): Entity | null {
  let best: Entity | null = null;
  let bestD2 = 9 * 9;
  for (const e of entities) {
    if (!e.alive || e.type !== EntityType.NPC || !e.ai || e.id !== undefined) continue;
    const d2 = world.dist2(player.x, player.y, e.x, e.y);
    if (d2 >= bestD2) continue;
    best = e;
    bestD2 = d2;
  }
  return best;
}

function turnNpcIntoDebugMukhozhuk(npc: Entity, player: Entity): void {
  const def = MONSTERS[MonsterKind.MUKHOZHUK_HOST];
  npc.type = EntityType.MONSTER;
  npc.monsterKind = MonsterKind.MUKHOZHUK_HOST;
  npc.name = `${npc.name ?? 'Носитель'}: мухожук`;
  npc.speed = def.speed;
  npc.sprite = def.sprite;
  npc.hp = Math.max(npc.hp ?? 1, Math.round(def.hp * 0.78));
  npc.maxHp = Math.max(npc.maxHp ?? 1, def.hp);
  npc.attackCd = 0;
  npc.ai = { goal: AIGoal.HUNT, tx: Math.floor(player.x), ty: Math.floor(player.y), path: [], pi: 0, stuck: 0, timer: 0, combatTargetId: player.id };
  npc.inventory = [
    ...(npc.inventory ?? []),
    { defId: 'quarantine_medcard', count: 1 },
  ].slice(0, 12);
}

function spawnDebugMukhozhukHost(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  nextEntityId: { v: number },
): string[] {
  const existingNpc = nearestDebugMukhozhukNpc(world, player, entities);
  let host: Entity;
  let mode = 'spawned';
  if (existingNpc) {
    turnNpcIntoDebugMukhozhuk(existingNpc, player);
    host = existingNpc;
    mode = 'infected_nearest_npc';
  } else {
    if (!canSpawnEntityType(entities, EntityType.MONSTER)) return ['monster entity limit reached'];
    const spot = findDebugMonsterSpot(world, player, entities, 0, 1);
    if (!spot) return ['no passable spawn cell in front of player'];
    const def = MONSTERS[MonsterKind.MUKHOZHUK_HOST];
    host = {
      id: nextEntityId.v++,
      type: EntityType.MONSTER,
      x: spot.x,
      y: spot.y,
      angle: Math.atan2(player.y - spot.y, player.x - spot.x),
      pitch: 0,
      alive: true,
      speed: def.speed,
      sprite: def.sprite,
      hp: def.hp,
      maxHp: def.hp,
      name: 'Ревизор-носитель: мухожук',
      monsterKind: MonsterKind.MUKHOZHUK_HOST,
      attackCd: 0,
      ai: { goal: AIGoal.HUNT, tx: Math.floor(player.x), ty: Math.floor(player.y), path: [], pi: 0, stuck: 0, timer: 0, combatTargetId: player.id },
      rpg: randomRPG(player.rpg?.level ?? 1),
      faction: Faction.LIQUIDATOR,
      occupation: Occupation.DIRECTOR,
      inventory: [{ defId: 'quarantine_medcard', count: 1 }] };
    entities.push(host);
  }

  publishEvent(state, {
    type: 'mukhozhuk_exposed',
    zoneId: currentPlayerZone(world, player),
    roomId: currentPlayerRoom(world, player),
    x: host.x,
    y: host.y,
    actorId: host.id,
    actorName: host.name,
    actorFaction: host.faction,
    targetId: player.id,
    targetName: player.name ?? 'Вы',
    targetFaction: player.faction,
    monsterKind: MonsterKind.MUKHOZHUK_HOST,
    severity: 4,
    privacy: 'local',
    tags: ['debug', 'monster', 'mukhozhuk', 'parasite_leader', mode],
    data: {
      source: 'debug_menu',
      mode,
      counterplay: MONSTERS[MonsterKind.MUKHOZHUK_HOST]?.counterplay,
      rumorIds: ['monster_mukhozhuk_host_command', 'ecology_mukhozhuk_quarantine'] } });
  return [`${mode}: ${host.name ?? monsterTypeName(MonsterKind.MUKHOZHUK_HOST)} #${host.id}`];
}

function placeDebugChervieFeature(world: World, x: number, y: number, feature: Feature): boolean {
  const wx = world.wrap(x);
  const wy = world.wrap(y);
  if (!passableDebugCell(world, wx, wy)) return false;
  world.setFeatureAt(world.idx(wx, wy), feature);
  return true;
}

function spawnDebugChervieSite(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  nextEntityId: { v: number },
): string[] {
  if (!canSpawnEntityType(entities, EntityType.MONSTER)) return ['monster entity limit reached'];
  const spot = findDebugMonsterSpot(world, player, entities, 0, 1);
  if (!spot) return ['no passable spawn cell in front of player'];
  const kind = MonsterKind.CHERVIE_AVATAR;
  const def = MONSTERS[kind];
  const mx = Math.floor(spot.x);
  const my = Math.floor(spot.y);
  let apparatus = false;
  let screen = false;
  const sourceOffsets = [
    { dx: 1, dy: 0, feature: Feature.APPARATUS },
    { dx: -1, dy: 0, feature: Feature.SCREEN },
    { dx: 0, dy: 1, feature: Feature.APPARATUS },
    { dx: 0, dy: -1, feature: Feature.SCREEN },
    { dx: 2, dy: 1, feature: Feature.SCREEN },
    { dx: -2, dy: -1, feature: Feature.APPARATUS },
  ] as const;
  for (const source of sourceOffsets) {
    const placed = placeDebugChervieFeature(world, mx + source.dx, my + source.dy, source.feature);
    if (!placed) continue;
    if (source.feature === Feature.APPARATUS) apparatus = true;
    if (source.feature === Feature.SCREEN) screen = true;
  }

  const monster: Entity = {
    id: nextEntityId.v++,
    type: EntityType.MONSTER,
    x: spot.x,
    y: spot.y,
    angle: Math.atan2(player.y - spot.y, player.x - spot.x),
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: monsterSpr(kind),
    hp: def.hp,
    maxHp: def.hp,
    name: 'Червие отладочного экрана',
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.HUNT, tx: Math.floor(player.x), ty: Math.floor(player.y), path: [], pi: 0, stuck: 0, timer: 0, combatTargetId: player.id },
    rpg: randomRPG(player.rpg?.level ?? 1) };
  entities.push(monster);
  publishEvent(state, {
    type: 'chervie_signal',
    zoneId: currentPlayerZone(world, player),
    roomId: currentPlayerRoom(world, player),
    x: monster.x,
    y: monster.y,
    actorId: monster.id,
    actorName: monster.name,
    actorFaction: monster.faction,
    targetId: player.id,
    targetName: player.name ?? 'Вы',
    targetFaction: player.faction,
    monsterKind: kind,
    severity: 4,
    privacy: 'local',
    tags: ['debug', 'monster', 'chervie', 'net', 'screen', 'apparatus'],
    data: {
      source: 'debug_menu',
      apparatus,
      screen,
      counterplay: def.counterplay,
      rumorIds: ['monster_chervie_avatar_screen', 'ecology_chervie_avatar_disconnect'] } });
  return [`chervie site: avatar #${monster.id}, apparatus=${apparatus ? 1 : 0}, screen=${screen ? 1 : 0}`];
}

function adjacentContainerRouteSpot(world: World, container: WorldContainer): { x: number; y: number } | null {
  for (let r = 1; r <= DEBUG_CONTAINER_ROUTE_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = world.wrap(container.x + dx);
        const y = world.wrap(container.y + dy);
        if (passableDebugCell(world, x, y)) return { x, y };
      }
    }
  }
  return null;
}

function routePlayerToNearestContainer(world: World, player: Entity, state: GameState): string[] {
  const created = ensureRoomContainers(world, state.currentZ);
  let best: WorldContainer | null = null;
  let bestScore = Infinity;
  for (const c of world.containers) {
    if (c.z !== state.currentZ) continue;
    const route = adjacentContainerRouteSpot(world, c);
    if (!route) continue;
    const theftBias = c.access === 'faction' || c.access === 'owner' ? -500 : 0;
    const lootBias = c.inventory.length > 0 ? -250 : 0;
    const score = world.dist2(player.x, player.y, c.x + 0.5, c.y + 0.5) + theftBias + lootBias;
    if (score >= bestScore) continue;
    best = c;
    bestScore = score;
  }
  if (!best) return [`created=${created}; no routeable containers on floor`];
  const spot = adjacentContainerRouteSpot(world, best);
  if (!spot) return [`created=${created}; nearest container has no adjacent cell`];
  player.x = spot.x + 0.5;
  player.y = spot.y + 0.5;
  player.angle = Math.atan2((best.y + 0.5) - player.y, (best.x + 0.5) - player.x);
  player.pitch = 0;
  return [`created=${created}; routed to ${describeContainer(best)}`];
}

function armLocalFloorInstance(world: World, player: Entity, state: GameState): string[] {
  const tags = currentFloorRunEntry(state).themeTags;
  const candidates = FLOOR_INSTANCES.filter(def => def.themeTags.some(t => tags.includes(t)));
  if (candidates.length === 0) return [`no numbered loop uses ${tags.join(',')} as base; teleport to another story floor first`];
  const def = candidates[debugFloorInstanceCursor++ % candidates.length];
  const store = ensureFloorInstanceState(state, state.currentZ);
  const instance = {
    id: def.id,
    displayNumber: def.displayNumber,
    title: def.title,
    
    seed: Math.floor(rng() * 0x7fffffff),
    seedTag: def.seedTag,
    risk: def.risk,
    enteredAt: state.time,
    fromFloor: state.currentZ,
    intendedFloor: state.currentZ,
    direction: LiftDirection.DOWN,
    returnFloor: state.currentZ };
  // @ts-ignore
  store.current = instance;
  store.discovered[def.id] = true;
  store.anomalyCount++;
  store.lastAnomalyAt = state.time;
  store.lastRoll = 0;
  publishEvent(state, {
    type: 'elevator_anomaly',
    
    zoneId: currentPlayerZone(world, player),
    x: player.x,
    y: player.y,
    actorId: player.id,
    actorName: player.name ?? 'Вы',
    actorFaction: player.faction,
    severity: 4,
    privacy: 'local',
    tags: ['debug', 'elevator', 'floor_instance', def.id, 'wrong_route'],
    data: {
      source: 'debug_menu',
      displayNumber: def.displayNumber,
      title: def.title,
      seed: instance.seed,
      seedTag: instance.seedTag,
      risk: instance.risk,
      fromFloor: instance.fromFloor,
      intendedFloor: instance.intendedFloor,
      returnFloor: instance.returnFloor } });
  return [
    // @ts-ignore
    `armed ${floorInstanceLabel(instance)}`,
    'use any lift once to publish loop exit and return to stable route',
  ];
}

function setSamosborWarningWindow(state: GameState): string {
  if (state.samosborActive) {
    state.samosborTimer = Math.min(state.samosborTimer, DEBUG_SAMOSBOR_WARNING_SECONDS);
    return `active samosbor ends in <=${DEBUG_SAMOSBOR_WARNING_SECONDS}s`;
  }
  state.samosborTimer = DEBUG_SAMOSBOR_WARNING_SECONDS;
  return `warning window set to ${DEBUG_SAMOSBOR_WARNING_SECONDS}s`;
}

function spawnSmokeTarget(world: World, player: Entity, entities: Entity[], nextEntityId: { v: number }): boolean {
  if (!canSpawnEntityType(entities, EntityType.MONSTER)) return false;
  const def = MONSTERS[MonsterKind.SBORKA];
  const baseAngles = [player.angle, player.angle + 0.45, player.angle - 0.45, player.angle + Math.PI];
  for (const angle of baseAngles) {
    for (const dist of [3.5, 2.5, 4.5]) {
      const x = player.x + Math.cos(angle) * dist;
      const y = player.y + Math.sin(angle) * dist;
      if (world.solid(Math.floor(x), Math.floor(y))) continue;
      const monster: Entity = {
        id: nextEntityId.v++, type: EntityType.MONSTER,
        x, y,
        angle: angle + Math.PI, pitch: 0, alive: true,
        speed: def.speed, sprite: def.sprite,
        hp: Math.min(def.hp, 18), maxHp: Math.min(def.hp, 18),
        monsterKind: MonsterKind.SBORKA, attackCd: 0,
        ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
        rpg: randomRPG(player.rpg?.level ?? 1) };
      entities.push(monster);
      return true;
    }
  }
  return false;
}

function grantDebugPermitPack(player: Entity): string[] {
  const granted: string[] = [];
  for (const id of DEBUG_PERMIT_PACK) {
    if (addItem(player, id, 1)) granted.push(ITEMS[id]?.name ?? id);
  }
  return granted.length > 0
    ? [`выдано: ${granted.slice(0, 6).join(', ')}${granted.length > 6 ? ` +${granted.length - 6}` : ''}`]
    : ['нет места под документы'];
}

function debugPermitTagForFloor(z: number): PermitAccessTag {
  if (z === 30) return 'ministry_n3';
  if (z === 14) return 'quarantine';
  return 'general_admin';
}

function checkDebugPermitAccess(world: World, player: Entity, state: GameState): string[] {
  const preferred = debugPermitTagForFloor(state.currentZ);
  const permit = findActorPermit(player, [preferred, 'general_admin', 'archive', 'bank_debt', 'bank_vault']);
  if (!permit) return ['нет пропуска с подходящим access tag'];
  const tag = permit.accessTags.includes(preferred) ? preferred : permit.accessTags[0];
  recordPermitAccess(state, player, world, permit, `debug:${tag}`, tag);
  return [`${ITEMS[permit.itemId]?.name ?? permit.itemId}: ${tag}`];
}

function spoilDebugPermit(world: World, player: Entity, state: GameState): string[] {
  for (const slot of player.inventory ?? []) {
    const permit = getPermitDef(slot.defId);
    if (!permit || slot.count <= 0) continue;
    removeItem(player, slot.defId, 1);
    addItem(player, 'bleached_document', 1);
    recordPermitExposure(state, player, world, permit, 'debug:spoiled_permit', 'debug_spoil');
    return [`испорчен: ${ITEMS[permit.itemId]?.name ?? permit.itemId}`];
  }
  return ['нет пропуска для порчи'];
}

/* ── Сцены этажа ─────────────────────────────────────────────── */

// Реестр сцен не отдаёт перечисление наружу, поэтому отладка помнит только те
// id, что уже видела: сыгранные за прогон, играющую сейчас и введённые руками.
const debugSeenSceneIds: string[] = [];
let debugLastSceneId = '';

function rememberDebugSceneId(id: string): void {
  if (!id || debugSeenSceneIds.includes(id)) return;
  if (debugSeenSceneIds.length >= 16) debugSeenSceneIds.shift();
  debugSeenSceneIds.push(id);
}

function knownDebugSceneIds(): readonly string[] {
  for (const id of floorScenesForSave()) rememberDebugSceneId(id);
  const playing = activeFloorSceneId();
  if (playing) rememberDebugSceneId(playing);
  return debugSeenSceneIds;
}

function debugSceneTriggerLabel(def: FloorSceneDef): string {
  if (def.trigger.kind !== 'event') return def.trigger.kind;
  return `event ${def.trigger.eventType}${def.trigger.tag ? `:${def.trigger.tag}` : ''}`;
}

function debugFloorSceneLines(state: GameState): string[] {
  const playing = activeFloorSceneId();
  const out = [`этаж ${currentAlifeFloorKey(state)}, играет: ${playing ?? 'нет'}`];
  const ids = knownDebugSceneIds();
  if (ids.length === 0) {
    out.push('известных сцен нет: реестр списка не отдаёт, запусти сцену по id');
    return out;
  }
  for (const id of ids.slice(0, 12)) {
    const def = floorSceneById(id);
    if (!def) {
      out.push(`${id}: не зарегистрирована`);
      continue;
    }
    out.push(`${id === playing ? '▸' : ' '} ${def.id}: ${def.floorKey}, ${debugSceneTriggerLabel(def)}, тактов ${def.beats.length}`);
  }
  return out;
}

function playDebugFloorScene(state: GameState): string[] {
  // Сброс сыгранного обнуляет и активную сцену без разбора кадра, поэтому
  // играющую сцену не трогаем: иначе актёры и sceneLock останутся висеть.
  if (isFloorSceneActive()) return [`уже играет ${activeFloorSceneId()}, дождись конца`];
  const entered = typeof window !== 'undefined' ? window.prompt('id сцены этажа', debugLastSceneId) : null;
  const id = entered?.trim() ?? '';
  if (!id) return ['id сцены не введён'];
  const def = floorSceneById(id);
  if (!def) return [`${id}: сцена не найдена`];
  debugLastSceneId = id;
  rememberDebugSceneId(id);
  // Отладка: забываем сыгранное, иначе одну сцену не посмотреть дважды.
  resetFloorScenes();
  if (!requestFloorScene(id)) return [`${id}: запуск отклонён`];
  const floorKey = currentAlifeFloorKey(state);
  return floorKey === def.floorKey
    ? [`${id}: запущена, тактов ${def.beats.length}, потолок ${def.maxSeconds}с`]
    : [`${id}: в очереди, но сцене нужен этаж ${def.floorKey}, а сейчас ${floorKey}`];
}

const DEBUG_PSI_CLOT_IDS = new Set(Object.keys(PSI_WEAPON_STATS));

function isDebugPsiClot(id: string): boolean {
  return DEBUG_PSI_CLOT_IDS.has(id);
}

function debugItemDrop(def: ItemDef): { defId: string; count: number } {
  return { defId: def.id, count: getStack(def) };
}

function debugWeaponAndAmmoDrops(): { defId: string; count: number }[] {
  const weapons: { defId: string; count: number }[] = [];
  const ammo: { defId: string; count: number }[] = [];
  for (const def of Object.values(ITEMS)) {
    if (def.type === ItemType.WEAPON && !isDebugPsiClot(def.id)) weapons.push(debugItemDrop(def));
    else if (def.type === ItemType.AMMO) ammo.push(debugItemDrop(def));
  }
  return [...weapons, ...ammo];
}

function debugPsiClotDrops(): { defId: string; count: number }[] {
  const out: { defId: string; count: number }[] = [];
  for (const id of Object.keys(PSI_WEAPON_STATS)) {
    const def = ITEMS[id];
    if (def) out.push(debugItemDrop(def));
  }
  return out;
}

function debugToolDrops(): { defId: string; count: number }[] {
  return Object.values(ITEMS)
    .filter(def => def.type === ItemType.TOOL)
    .map(debugItemDrop);
}

function debugOtherItemDrops(): { defId: string; count: number }[] {
  return Object.values(ITEMS)
    .filter(def => (
      def.type !== ItemType.WEAPON
      && def.type !== ItemType.AMMO
      && def.type !== ItemType.TOOL
      && !isDebugPsiClot(def.id)
    ))
    .map(debugItemDrop);
}

function debugItemDropSpot(world: World, player: Entity, index: number): { x: number; y: number } {
  const angle = player.angle + index * Math.PI * 2;
  const radius = 2;
  return {
    x: world.wrap(player.x + Math.cos(angle) * radius),
    y: world.wrap(player.y + Math.sin(angle) * radius) };
}

function spawnDebugItemDropsAroundPlayer(
  world: World,
  player: Entity,
  entities: Entity[],
  nextEntityId: { v: number },
  items: readonly { defId: string; count: number }[],
  label: string,
): string {
  const slots = entitySpawnSlots(entities, EntityType.ITEM_DROP, items.length);
  for (let i = 0; i < slots; i++) {
    const spot = debugItemDropSpot(world, player, i / Math.max(1, slots));
    entities.push({
      id: nextEntityId.v++,
      type: EntityType.ITEM_DROP,
      x: spot.x,
      y: spot.y,
      angle: 0,
      pitch: 0,
      alive: true,
      speed: 0,
      sprite: Spr.ITEM_DROP,
      inventory: [items[i]] });
  }
  if (slots >= items.length) return `${label}: разложено ${slots}`;
  return `${label}: разложено ${slots}/${items.length}, лимит предметов`;
}

/* ── Команды ──────────────────────────────────────────────────
 *
 * Одна команда — одна запись. Ни номера, ни параллельного списка порядка:
 * место в меню задают группа и данные, исполнение — собственная функция.
 * Чтобы добавить команду, допишите ещё один `registerDebugCommand` — здесь
 * или, что правильнее, рядом со своей системой.
 */

/** Телепорт на дизайн-этаж по строковому id: цель берётся из маршрутных
 *  данных, а не переписывается в отладке. */
function designFloorTeleport(id: DesignFloorId): DebugAction | undefined {
  const def = DESIGN_FLOOR_ROUTES.find(route => route.id === id);
  if (!def) return undefined;
  return {
    type: 'teleport_design_floor',
    id: def.id,
    themeTags: def.themeTags ?? [],
    z: def.z,
    label: def.displayName,
    color: def.color };
}

/* Этажи маршрута — тоже данные: список берётся из DESIGN_FLOOR_ROUTES и
 * выстраивается по высоте сверху вниз, от +50 до -50. Новый этаж появляется
 * в меню сам и на своём месте, а высота стоит первой колонкой, чтобы список
 * читался глазом, а не перебором. */
for (const floor of DESIGN_FLOOR_ROUTES) {
  registerDebugCommand({
    id: `${DESIGN_FLOOR_COMMAND_ID_PREFIX}${floor.id}`,
    group: 'teleport',
    sort: -floor.z,
    label: `${formatDebugZ(floor.z).padStart(3, ' ')}  ${floor.displayName}`,
    run: () => designFloorTeleport(floor.id) });
}

registerDebugCommand({
  /* All physical weapons + ammo — spawn as drops around player */
  id: 'spawn_all_weapons',
  group: 'spawn',
  label: 'Всё оружие + патроны',
  run: ({ world, player, entities, state, nextEntityId }) => {
    state.msgs.push(msg(`[DEBUG] ${spawnDebugItemDropsAroundPlayer(world, player, entities, nextEntityId, debugWeaponAndAmmoDrops(), 'оружие+патроны')}`, state.time, '#ff0'));
  } });

registerDebugCommand({
  /* Spawn one of each monster nearby */
  id: 'spawn_monsters',
  group: 'spawn',
  label: 'Спавн монстров',
  run: ({ world, player, entities, state, nextEntityId }) => {
    const kinds = Object.values(MonsterKind).filter((v): v is MonsterKind => typeof v === 'number');
    const slots = entitySpawnSlots(entities, EntityType.MONSTER, kinds.length);
    for (let i = 0; i < slots; i++) {
      const k = kinds[i];
      const def = MONSTERS[k];
      const ang = (i / kinds.length) * Math.PI * 2;
      const monster: Entity = {
        id: nextEntityId.v++, type: EntityType.MONSTER,
        x: player.x + Math.cos(ang) * 4,
        y: player.y + Math.sin(ang) * 4,
        angle: ang + Math.PI, pitch: 0, alive: true,
        speed: def.speed, sprite: def.sprite,
        hp: def.hp, maxHp: def.hp,
        monsterKind: k, attackCd: 0,
        ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
        rpg: randomRPG(player.rpg?.level ?? 1),
        phasing: k === MonsterKind.SPIRIT };
      entities.push(monster);
      seedDebugFogSharkPatch(world, k, monster.x, monster.y);
    }
    state.msgs.push(msg('Все монстры заспавнены', state.time, '#ff0'));
  } });

registerDebugCommand({
  /* Spawn random NPC nearby */
  id: 'spawn_npc',
  group: 'spawn',
  label: 'Спавн NPC',
  run: ({ player, entities, state, nextEntityId }) => {
    if (!canSpawnEntityType(entities, EntityType.NPC)) {
      state.msgs.push(msg('Лимит NPC достигнут', state.time, '#f88'));
      return;
    }
    const nm = randomName();
    const rpg = randomRPG(player.rpg?.level ?? 1);
    const maxHp = getMaxHp(rpg);
    const factions = [Faction.CITIZEN, Faction.LIQUIDATOR, Faction.CULTIST, Faction.WILD];
    const faction = factions[Math.floor(rng() * factions.length)];
    entities.push({
      id: nextEntityId.v++, type: EntityType.NPC,
      x: player.x + Math.cos(player.angle) * 2,
      y: player.y + Math.sin(player.angle) * 2,
      angle: player.angle + Math.PI, pitch: 0, alive: true,
      speed: 1.2, sprite: Occupation.TRAVELER,
      name: nm.name, firstName: nm.firstName, lastName: nm.lastName, isFemale: nm.female,
      needs: freshNeeds(), hp: maxHp, maxHp,
      ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
      inventory: [], faction, occupation: Occupation.TRAVELER, isTraveler: true,
      rpg, money: 20 + Math.floor(rng() * 80) });
    state.msgs.push(msg(`NPC ${nm.name} заспавнен`, state.time, '#ff0'));
  } });

registerDebugCommand({
  /* Spawn all non-weapon/non-ammo/non-tool items nearby */
  id: 'spawn_items',
  group: 'spawn',
  label: 'Все остальные предметы',
  run: ({ world, player, entities, state, nextEntityId }) => {
    state.msgs.push(msg(`[DEBUG] ${spawnDebugItemDropsAroundPlayer(world, player, entities, nextEntityId, debugOtherItemDrops(), 'остальные предметы')}`, state.time, '#ff0'));
  } });

registerDebugCommand({
  id: 'teleport_random_procedural',
  group: 'anomaly',
  label: 'случайный процедурный',
  run: () => ({ type: 'teleport_random_procedural_floor' }) });

registerDebugCommand({
  /* Smoke expedition setup */
  id: 'smoke_expedition_setup',
  group: 'verify',
  label: 'Smoke: expedition setup',
  sort: 0,
  run: ({ world, player, entities, state, nextEntityId }) => {
    addItem(player, 'makarov', 1);
    addItem(player, 'ammo_9mm', 30);
    player.weapon = 'makarov';
    const moved = movePlayerToSmokeLift(world, player, entities);
    const target = spawnSmokeTarget(world, player, entities, nextEntityId);
    const contract = spawnContract(state);
    state.msgs.push(msg(
      `[SMOKE] kit=${player.weapon} lift=${moved ? 'ready' : 'missing'} target=${target ? 'spawned' : 'skipped'} contract=${contract ? 'created' : 'skipped'}`,
      state.time,
      moved && contract ? '#4f4' : '#f84',
    ));
  } });

registerDebugCommand({
  /* Verification contract route */
  id: 'verification_contract_route',
  group: 'economy',
  label: 'VERIFY: контрактный маршрут',
  run: ({ state }) => {
    for (const line of spawnDebugVerificationContract(state)) state.msgs.push(msg(`[CONTRACT-DEBUG] ${line}`, state.time, '#6cf'));
  } });

registerDebugCommand({
  /* Publish verification event */
  id: 'publish_verification_event',
  group: 'world',
  label: 'VERIFY: событие в лог/слух',
  run: ({ world, player, state }) => {
    state.msgs.push(msg(`[EVENTS-DEBUG] ${publishDebugVerificationEvent(world, player, state)}`, state.time, '#ff0'));
  } });

registerDebugCommand({
  /* Route floor summary */
  id: 'route_floor_summary',
  group: 'route',
  label: 'ROUTE: floor summary',
  run: ({ world, player, entities, state }) => {
    for (const line of debugRouteFloorSummaryLines(world, player, entities, state)) state.msgs.push(msg(`[ROUTE] ${line}`, state.time, '#8cf'));
  } });

registerDebugCommand({
  /* Arm current-floor numbered lift anomaly */
  id: 'arm_floor_instance',
  group: 'route',
  label: 'VERIFY: номерная петля лифта',
  run: ({ world, player, state }) => {
    for (const line of armLocalFloorInstance(world, player, state)) state.msgs.push(msg(`[LIFT-DEBUG] ${line}`, state.time, '#f4a'));
  } });

registerDebugCommand({
  /* Samosbor warning window */
  id: 'samosbor_warning_window',
  group: 'samosbor',
  label: 'VERIFY: окно предупреждения самосбора',
  run: ({ state }) => {
    state.msgs.push(msg(`[SAMOSBOR-DEBUG] ${setSamosborWarningWindow(state)}`, state.time, '#fa4'));
  } });

registerDebugCommand({
  /* Economy scarcity pulse */
  id: 'economy_scarcity_pulse',
  group: 'economy',
  label: 'VERIFY: дефицит экономики',
  run: ({ world, player, state }) => {
    for (const line of applyDebugEconomyPulse(world, player, state)) state.msgs.push(msg(`[ECON-DEBUG] ${line}`, state.time, '#ccf'));
  } });

registerDebugCommand({
  /* Floor-specific monster counterplay pack */
  id: 'floor_monster_pack',
  group: 'spawn',
  label: 'VERIFY: монстры этажа',
  run: ({ world, player, entities, state, nextEntityId }) => {
    for (const line of spawnDebugMonsterPack(world, player, entities, state, nextEntityId)) {
      state.msgs.push(msg(`[MON-DEBUG] ${line}`, state.time, '#f88'));
    }
  } });

registerDebugCommand({
  /* Route to nearest useful container */
  id: 'route_to_container',
  group: 'economy',
  label: 'VERIFY: маршрут к контейнеру',
  run: ({ world, player, state }) => {
    for (const line of routePlayerToNearestContainer(world, player, state)) state.msgs.push(msg(`[CONT-DEBUG] ${line}`, state.time, '#ccf'));
  } });

registerDebugCommand({
  /* Expedition proof prep */
  id: 'expedition_proof_prep',
  group: 'verify',
  label: 'EXPEDITION: подготовка',
  sort: 1,
  run: ({ player, state }) => {
    addItem(player, 'makarov', 1);
    addItem(player, 'ammo_9mm', 40);
    addItem(player, 'water', 2);
    addItem(player, 'bread', 2);
    addItem(player, 'bandage', 2);
    player.weapon = 'makarov';
    const created = spawnContractById(state, EXPEDITION_PROOF_CONTRACT_ID, ['debug_route', 'expedition_proof']);
    state.msgs.push(msg(`[EXPEDITION] prep kit=${player.weapon} contract=${created ? 'created' : 'existing'}`, state.time, '#6cf'));
  } });

registerDebugCommand({
  /* Expedition proof lift ready */
  id: 'expedition_proof_lift_ready',
  group: 'verify',
  label: 'EXPEDITION: лифт готов',
  sort: 2,
  run: ({ world, player, entities, state }) => {
    const moved = movePlayerToSmokeLift(world, player, entities);
    state.msgs.push(msg(`[EXPEDITION] lift=${moved ? 'ready' : 'missing'}`, state.time, moved ? '#4f4' : '#f84'));
  } });

registerDebugCommand({
  id: 'expedition_proof_collectors_arrival',
  group: 'verify',
  sort: 3,
  label: 'EXPEDITION: прибытие в Коллекторы',
  run: ({ state }) => {
    state.msgs.push(msg('[EXPEDITION] прибытие: Коллекторы', state.time, '#8cf'));
    return designFloorTeleport('maintenance');
  } });

registerDebugCommand({
  id: 'expedition_proof_risk',
  group: 'verify',
  label: 'EXPEDITION: риск маршрута',
  sort: 4,
  run: ({ world, player, entities, state, nextEntityId }) => {
    state.msgs.push(msg(forceFactionEvent(state, world, player, entities, nextEntityId), state.time, '#ff0'));
  } });

registerDebugCommand({
  id: 'expedition_proof_container',
  group: 'verify',
  label: 'EXPEDITION: контейнер маршрута',
  sort: 5,
  run: ({ world, player, state }) => {
    for (const line of routePlayerToNearestContainer(world, player, state)) state.msgs.push(msg(`[EXPEDITION] ${line}`, state.time, '#ccf'));
  } });

registerDebugCommand({
  id: 'expedition_proof_samosbor_warning',
  group: 'verify',
  label: 'EXPEDITION: предупреждение самосбора',
  sort: 6,
  run: ({ state }) => {
    state.msgs.push(msg(`[EXPEDITION] ${setSamosborWarningWindow(state)}`, state.time, '#fa4'));
  } });

registerDebugCommand({
  id: 'expedition_proof_return',
  group: 'verify',
  sort: 7,
  label: 'EXPEDITION: возврат домой',
  run: ({ state }) => {
    state.msgs.push(msg('[EXPEDITION] возврат: жилой этаж', state.time, '#8cf'));
    return designFloorTeleport('living');
  } });

registerDebugCommand({
  id: 'grant_permit_pack',
  group: 'cheat',
  label: 'PERMIT: выдать пакет',
  run: ({ player, state }) => {
    for (const line of grantDebugPermitPack(player)) state.msgs.push(msg(`[PERMIT] ${line}`, state.time, '#fc6'));
  } });

registerDebugCommand({
  id: 'check_permit_access',
  group: 'cheat',
  label: 'PERMIT: проверить доступ',
  run: ({ world, player, state }) => {
    for (const line of checkDebugPermitAccess(world, player, state)) state.msgs.push(msg(`[PERMIT] ${line}`, state.time, '#fc6'));
  } });

registerDebugCommand({
  id: 'spoil_permit',
  group: 'cheat',
  label: 'PERMIT: испортить пропуск',
  run: ({ world, player, state }) => {
    for (const line of spoilDebugPermit(world, player, state)) state.msgs.push(msg(`[PERMIT] ${line}`, state.time, '#f84'));
  } });

registerDebugCommand({
  id: 'debug_false_cleanup_patrol',
  group: 'spawn',
  label: 'SAMOSBOR: ложная зачистка',
  run: ({ world, player, entities, state, nextEntityId }) => {
    for (const line of spawnDebugFalseCleanupPatrol(world, player, entities, state, nextEntityId)) {
      state.msgs.push(msg(`[FALSE-CLEANUP] ${line}`, state.time, '#f84'));
    }
    return { type: 'refresh_world_data' };
  } });

registerDebugCommand({
  id: 'debug_mukhozhuk_host',
  group: 'spawn',
  label: 'MUKHOZHUK: носитель у игрока',
  run: ({ world, player, entities, state, nextEntityId }) => {
    for (const line of spawnDebugMukhozhukHost(world, player, entities, state, nextEntityId)) {
      state.msgs.push(msg(`[MUKHOZHUK] ${line}`, state.time, '#ce8'));
    }
    return { type: 'refresh_world_data' };
  } });

registerDebugCommand({
  id: 'debug_chervie_site',
  group: 'spawn',
  label: 'CHERVIE: экранный узел',
  run: ({ world, player, entities, state, nextEntityId }) => {
    for (const line of spawnDebugChervieSite(world, player, entities, state, nextEntityId)) {
      state.msgs.push(msg(`[CHERVIE] ${line}`, state.time, '#6f8'));
    }
    return { type: 'refresh_world_data' };
  } });

registerDebugCommand({
  id: 'spawn_all_psi',
  group: 'spawn',
  label: 'Все ПСИ-сгустки',
  run: ({ world, player, entities, state, nextEntityId }) => {
    state.msgs.push(msg(`[DEBUG] ${spawnDebugItemDropsAroundPlayer(world, player, entities, nextEntityId, debugPsiClotDrops(), 'ПСИ-сгустки')}`, state.time, '#ff0'));
  } });

registerDebugCommand({
  id: 'spawn_all_tools',
  group: 'spawn',
  label: 'Все инструменты',
  run: ({ world, player, entities, state, nextEntityId }) => {
    state.msgs.push(msg(`[DEBUG] ${spawnDebugItemDropsAroundPlayer(world, player, entities, nextEntityId, debugToolDrops(), 'инструменты')}`, state.time, '#ff0'));
  } });

registerDebugCommand({
  id: 'spawn_sculpture',
  group: 'spawn',
  label: 'Спавн Скульптуры',
  run: ({ player, entities, state, nextEntityId }) => {
    const def = MONSTERS[MonsterKind.SCULPTURE];
    const ang = player.angle;
    entities.push({
      id: nextEntityId.v++, type: EntityType.MONSTER,
      x: player.x + Math.cos(ang) * 4,
      y: player.y + Math.sin(ang) * 4,
      angle: ang + Math.PI, pitch: 0, alive: true,
      speed: def.speed, sprite: def.sprite,
      hp: def.hp, maxHp: def.hp,
      monsterKind: MonsterKind.SCULPTURE, attackCd: 0,
      ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
      rpg: randomRPG(player.rpg?.level ?? 1),
      phasing: false });
    state.msgs.push(msg('[DEBUG] Скульптура заспавнена перед игроком', state.time, '#ff0'));
  } });

registerDebugCommand({
  id: 'spawn_critters',
  group: 'spawn',
  label: 'спавн криттеров',
  run: ({ world, player, state }) => {
    let spawned = 0;
    for (let i = 0; i < MAX_CRITTERS && spawned < 10; i++) {
      const c = CRITTERS_POOL[i];
      if (!c.active) {
        const angle = mathRng() * Math.PI * 2;
        const dist = 1 + mathRng() * 3;
        const sx = Math.round(player.x + Math.cos(angle) * dist);
        const sy = Math.round(player.y + Math.sin(angle) * dist);
        if (world.get(sx, sy) === Cell.FLOOR) {
          c.active = true;
          const r = mathRng();
          c.defId = r < 0.4 ? 'roach' : (r < 0.8 ? 'rat' : 'fly');
          c.x = sx;
          c.y = sy;
          c.z = 0;
          c.targetX = sx;
          c.targetY = sy;
          spawned++;
        }
      }
    }
    state.msgs.push(msg(`[DEBUG] Заспавнено криттеров: ${spawned}`, state.time, '#ff0'));
  } });

registerDebugCommand({
  /* Запустить сцену этажа по введённому id */
  id: 'play_floor_scene',
  group: 'tools',
  label: 'СЦЕНА: запустить по id',
  run: ({ state }) => {
    for (const line of playDebugFloorScene(state)) state.msgs.push(msg(`[SCENE] ${line}`, state.time, '#dfe6e0'));
  } });

registerDebugCommand({
  /* Известные сцены этажа */
  id: 'floor_scene_list',
  group: 'tools',
  label: 'СЦЕНЫ: список',
  run: ({ state }) => {
    for (const line of debugFloorSceneLines(state)) state.msgs.push(msg(`[SCENE] ${line}`, state.time, '#9ab'));
  } });

/* Процедурные аномалии — данные, а не команды: id выводится из имени аномалии,
 * поэтому новая аномалия попадает в меню одной строкой и без правки switch. */
const ANOMALY_TELEPORTS: readonly { anomalyId: FloorAnomalyId; label: string }[] = [
  { anomalyId: 'smog', label: 'говнячный смог' },
  { anomalyId: 'false_safe_block', label: 'тихий блок' },
  { anomalyId: 'hladon', label: 'хладон' },
  { anomalyId: 'fractal_floor', label: 'фрактал' },
  { anomalyId: 'mirror_run', label: 'зеркало' },
  { anomalyId: 'radio_chess', label: 'радио-шахматы' },
  { anomalyId: 'cement_memory', label: 'цементная память' },
  { anomalyId: 'conveyor_sorter', label: 'конвейер' },
  { anomalyId: 'wall_snake', label: 'змейка' },
  { anomalyId: 'section_shift', label: 'секционный сдвиг' },
  { anomalyId: 'conway_life', label: 'игра жизнь' },
  { anomalyId: 'rail_trains', label: 'поезда' },
  { anomalyId: 'zombie_apocalypse', label: 'зомби-апокалипсис' },
];

for (const anomaly of ANOMALY_TELEPORTS) {
  registerDebugCommand({
    id: `teleport_${anomaly.anomalyId}`,
    group: 'anomaly',
    label: anomaly.label,
    run: () => ({ type: 'teleport_procedural_anomaly', anomalyId: anomaly.anomalyId }) });
}

/* ── Внешний вход ─────────────────────────────────────────────
 * Индекс — это позиция в плоском списке команд; по нему ходят меню и smoke. */

export function execDebugCommand(
  idx: number,
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  nextEntityId: { v: number },
): DebugAction | null {
  return runDebugCommand(idx, makeDebugCtx(world, player, entities, state, nextEntityId));
}

/* ── Debug overlay rendering (fullscreen two-column) ─────────── */

const ZONE_FACTION_NAMES: Record<ZoneFaction, string> = {
  [ZoneFaction.CITIZEN]: 'Граждане',
  [ZoneFaction.LIQUIDATOR]: 'Ликвидаторы',
  [ZoneFaction.CULTIST]: 'Культисты',
  [ZoneFaction.SAMOSBOR]: 'Самосбор',
  [ZoneFaction.WILD]: 'Дикие',
  [ZoneFaction.SCIENTIST]: 'Учёные' };

export type DebugCommandId = string;

export function getDebugCommandIds(): readonly DebugCommandId[] {
  return debugCommands().map(def => def.id);
}

export function getDebugCommandIndex(id: DebugCommandId): number {
  return debugCommandIndex(id);
}

/** Счётчик — функция, а не константа: команды регистрируют сами системы, и на
 *  момент вычисления константы часть модулей ещё не импортирована. */
export function debugCommandCount(): number {
  return debugCommands().length;
}

declare global {
  interface Window {
    __gigahrushDebugCommandIndex?: (id: DebugCommandId) => number;
    __gigahrushDebugCommandIds?: () => readonly DebugCommandId[];
  }
}

if (typeof window !== 'undefined') {
  window.__gigahrushDebugCommandIndex = getDebugCommandIndex;
  window.__gigahrushDebugCommandIds = getDebugCommandIds;
}

/* ── Панели: то, что раньше было левым столбцом ────────────────
 *
 * Столбец делил экран пополам и обеим половинам было тесно. Теперь это
 * отдельные страницы, а страница — такая же запись реестра, как команда:
 * своя система может добавить собственную диагностику, не трогая отладку.
 */

registerDebugPanel({
  id: 'world',
  title: 'МИР',
  sort: 0,
  lines: ({ world, entities, state }) => {
    const out: DebugPanelLine[] = [];
    let alive = 0;
    let items = 0;
    let monsters = 0;
    for (const e of entities) {
      if (!e.alive) continue;
      if (e.type === EntityType.NPC) alive++;
      else if (e.type === EntityType.MONSTER) { alive++; monsters++; }
      else if (e.type === EntityType.ITEM_DROP) items++;
    }
    let funcRooms = 0;
    for (const r of world.rooms) if (r && r.type !== RoomType.CORRIDOR) funcRooms++;
    let lifts = 0;
    let liftsUp = 0;
    for (let i = 0; i < W * W; i++) {
      if (world.cells[i] !== Cell.LIFT) continue;
      lifts++;
      if (world.liftDir[i] === LiftDirection.UP) liftsUp++;
    }
    out.push({ text: `Люди: ${alive - monsters}  Монстры: ${monsters}  Предметы: ${items}`, color: '#aaa' });
    out.push({ text: `Комнаты: ${funcRooms}  Лифты: ${lifts} (↑${liftsUp} ↓${lifts - liftsUp})`, color: '#aaa' });
    out.push({ text: `Noclip: ${isDebugNoClipEnabled() ? 'ВКЛ' : 'выкл'}`, color: isDebugNoClipEnabled() ? '#ff0' : '#666' });
    out.push({ text: `ONEPUNCHMAN: ${isDebugOnePunchManEnabled() ? 'ВКЛ' : 'выкл'}`, color: isDebugOnePunchManEnabled() ? '#ff0' : '#666' });
    const ai = getAiStats();
    out.push({ text: '', color: '#000' });
    out.push({ text: 'ИИ', color: '#ff0' });
    out.push({ text: `  живых ${ai.liveAi}  обновлено ${ai.updated} (npc ${ai.updatedNpc} / мобы ${ai.updatedMonster})  пропущено ${ai.skipped}`, color: '#9cf' });
    out.push({ text: `  сюжетных ${ai.plot}  боссов ${ai.bosses}  в бою ${ai.activeAttackers}  снаряды ${ai.projectileOwners}/${ai.projectiles}`, color: '#9cf' });
    const player = entities.find(e => isPlayerEntity(e));
    const memory = summarizeRoomMemoryForRoom(state.currentZ, player ? currentPlayerRoom(world, player) : undefined);
    if (memory.length) {
      out.push({ text: '', color: '#000' });
      out.push({ text: 'ПАМЯТЬ КОМНАТЫ', color: '#ff0' });
      for (const line of memory) out.push({ text: `  ${line}`, color: '#dc9' });
    }
    return out;
  } });

registerDebugPanel({
  id: 'factions',
  title: 'ФРАКЦИИ И ТЕРРИТОРИЯ',
  sort: 1,
  lines: ({ world, entities }) => {
    const out: DebugPanelLine[] = [];
    const byFaction: Record<number, number> = {};
    let monsters = 0;
    for (const e of entities) {
      if (!e.alive) continue;
      if (e.type === EntityType.NPC) byFaction[e.faction ?? -1] = (byFaction[e.faction ?? -1] ?? 0) + 1;
      else if (e.type === EntityType.MONSTER) monsters++;
    }
    out.push({ text: 'ЖИВЫЕ ПО ФРАКЦИЯМ', color: '#ff0' });
    for (let f = 0; f <= 4; f++) {
      out.push({ text: `  ${FACTION_NAMES[f as Faction] ?? `#${f}`}: ${byFaction[f] ?? 0}`, color: '#bbb' });
    }
    out.push({ text: `  Монстры: ${monsters}`, color: '#c66' });

    const cells: Record<number, number> = {};
    for (let i = 0; i < W * W; i++) {
      const owner = territoryOwnerAtIndex(world, i);
      cells[owner] = (cells[owner] ?? 0) + 1;
    }
    out.push({ text: '', color: '#000' });
    out.push({ text: 'КЛЕТКИ ТЕРРИТОРИИ', color: '#ff0' });
    for (const zf of [ZoneFaction.CITIZEN, ZoneFaction.LIQUIDATOR, ZoneFaction.CULTIST, ZoneFaction.SCIENTIST, ZoneFaction.WILD, ZoneFaction.SAMOSBOR]) {
      out.push({ text: `  ${ZONE_FACTION_NAMES[zf]}: ${cells[zf] ?? 0}`, color: '#bbb' });
    }
    return out;
  } });

registerDebugPanel({
  id: 'route',
  title: 'ЭТАЖ, МАРШРУТ, АНОМАЛИИ',
  sort: 2,
  lines: ({ world, state }) => {
    const out: DebugPanelLine[] = [];
    const section = (title: string, lines: readonly string[], color: string) => {
      if (!lines.length) return;
      out.push({ text: title, color: '#ff0' });
      for (const line of lines) out.push({ text: `  ${line}`, color });
      out.push({ text: '', color: '#000' });
    };
    section('МАРШРУТ ЗАБЕГА', summarizeFloorRun(state).slice(0, 6), '#8cf');
    section('ЛИФТОВЫЕ ИНСТАНСЫ', summarizeFloorInstances(state).slice(0, 4), '#f4a');
    section('ПСЕВДОЛИФТ', pseudoliftDebugSummary(state).slice(0, 3), '#fc4');
    section('САМОСБОР', getSamosborDebugLines(), '#9cf');
    section('СМОГ', summarizeProceduralSmog(world, state).slice(0, 3), '#b98');
    section('BAD APPLE', summarizeBadAppleWorld(world).slice(0, 3), '#eee');
    return out;
  } });

/* ── Постраничный экран ────────────────────────────────────────
 *
 * Страница 0 — команды во всю ширину, столько колонок, сколько влезает.
 * Дальше — по странице на панель. Влево/вправо листает страницы, вверх/вниз
 * двигает выбор или прокручивает панель.
 */

const DEBUG_PAGE_COMMANDS = 0;
const DEBUG_LABEL_CHARS = 44;

let debugPage = DEBUG_PAGE_COMMANDS;
let debugPanelScroll = 0;

export function debugPageCount(): number {
  return 1 + debugPanels().length;
}

export function isDebugCommandPage(): boolean {
  return debugPage === DEBUG_PAGE_COMMANDS;
}

export function moveDebugPage(delta: number): void {
  const count = debugPageCount();
  debugPage = ((debugPage + delta) % count + count) % count;
  debugPanelScroll = 0;
}

export function scrollDebugPanel(delta: number): void {
  debugPanelScroll = Math.max(0, debugPanelScroll + delta);
}

export function resetDebugPage(): void {
  debugPage = DEBUG_PAGE_COMMANDS;
  debugPanelScroll = 0;
}

interface DebugMenuRow {
  text: string;
  /** Индекс команды в плоском списке, или -1 у заголовка группы. */
  command: number;
}

/** Строки меню: заголовок группы + её команды. Заголовки не выбираются,
 *  поэтому индекс команды и номер строки — разные вещи. */
function debugMenuRows(): DebugMenuRow[] {
  const rows: DebugMenuRow[] = [];
  let group = '';
  debugCommands().forEach((def, index) => {
    if (def.group !== group) {
      group = def.group;
      const title = DEBUG_GROUPS.find(g => g.id === def.group)?.title ?? def.group;
      if (rows.length) rows.push({ text: '', command: -1 });
      rows.push({ text: `── ${title} ${'─'.repeat(Math.max(2, DEBUG_LABEL_CHARS - title.length - 4))}`, command: -1 });
    }
    rows.push({ text: def.label, command: index });
  });
  return rows;
}

function drawDebugCommandPage(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  charW: number, lh: number, sx: number, sy: number,
  debugSel: number,
): string {
  const rows = debugMenuRows();
  const perColumn = Math.max(1, Math.floor(h / lh));
  const columnW = Math.min(w, (DEBUG_LABEL_CHARS + 3) * charW);
  const columns = Math.max(1, Math.min(Math.floor(w / columnW), Math.ceil(rows.length / perColumn)));
  const capacity = perColumn * columns;

  let start = 0;
  if (rows.length > capacity) {
    const selRow = Math.max(0, rows.findIndex(r => r.command === debugSel));
    const selColumn = Math.floor(selRow / perColumn);
    const lastColumn = Math.max(0, Math.ceil(rows.length / perColumn) - columns);
    start = Math.min(lastColumn, Math.max(0, selColumn - columns + 1)) * perColumn;
  }

  const end = Math.min(rows.length, start + capacity);
  for (let i = start; i < end; i++) {
    const row = rows[i];
    if (!row.text) continue;
    const slot = i - start;
    const rx = x + Math.floor(slot / perColumn) * columnW;
    const ry = y + (slot % perColumn) * lh;
    if (row.command < 0) {
      ctx.fillStyle = '#775';
      ctx.fillText(fitText(ctx, row.text, columnW - charW), rx, ry);
      continue;
    }
    const selected = row.command === debugSel;
    if (selected) {
      ctx.fillStyle = 'rgba(255,255,0,0.14)';
      ctx.fillRect(rx - charW * 0.4, ry - 1 * sy, columnW - charW * 0.6, lh);
    }
    ctx.fillStyle = selected ? '#ff0' : '#ccc';
    ctx.fillText(fitText(ctx, `${selected ? '▸' : ' '} ${row.text}`, columnW - charW), rx, ry);
  }

  void sx;
  return rows.length > capacity ? `${start + 1}-${end}/${rows.length}` : `${rows.length}`;
}

function drawDebugPanelPage(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  charW: number, lh: number,
  panel: DebugPanelDef,
  world: World, entities: Entity[], state: GameState,
): string {
  const lines = panel.lines({ world, entities, state });
  const perColumn = Math.max(1, Math.floor(h / lh));
  const columnW = Math.min(w, Math.max(60 * charW, w / 2));
  const columns = Math.max(1, Math.min(Math.floor(w / columnW), Math.ceil(lines.length / perColumn)));
  const capacity = perColumn * columns;
  const maxScroll = Math.max(0, Math.ceil((lines.length - capacity) / perColumn));
  const scroll = Math.min(debugPanelScroll, maxScroll);
  const start = scroll * perColumn;
  const end = Math.min(lines.length, start + capacity);

  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (!line.text) continue;
    const slot = i - start;
    ctx.fillStyle = line.color ?? '#bbb';
    ctx.fillText(
      fitText(ctx, line.text, columnW - charW),
      x + Math.floor(slot / perColumn) * columnW,
      y + (slot % perColumn) * lh,
    );
  }
  return lines.length > capacity ? `${start + 1}-${end}/${lines.length}` : `${lines.length}`;
}

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  w: number, h: number,
  world: World,
  entities: Entity[],
  state: GameState,
  debugSel: number,
): void {
  const uiScale = Math.max(0.8, Math.min(4.2, Math.min(sx, sy)));
  sx = uiScale;
  sy = uiScale;

  const fs = Math.round(7 * sy);
  const lh = Math.round(10 * sy);
  const pad = 12 * sx;
  const margin = 6 * sx;

  drawNeuroPanel(ctx, 0, 0, w, h, performance.now() / 1000, 150);
  ctx.strokeStyle = '#ff0';
  ctx.lineWidth = 1 * sx;
  ctx.strokeRect(margin, margin, w - margin * 2, h - margin * 2);

  ctx.font = `${fs}px "Press Start 2P", monospace`;
  ctx.textBaseline = 'top';
  const charW = Math.max(1, ctx.measureText('0').width);

  const pages = debugPageCount();
  const panel = debugPage === DEBUG_PAGE_COMMANDS ? undefined : debugPanels()[debugPage - 1];
  const title = panel ? panel.title : 'КОМАНДЫ';

  const x = margin + pad;
  const top = margin + pad;
  const bodyTop = top + lh * 2;
  const hintY = h - margin - pad - lh;
  const bodyH = Math.max(lh, hintY - bodyTop - lh * 0.5);
  const bodyW = Math.max(charW * 10, w - margin * 2 - pad * 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(margin + 1 * sx, bodyTop - sy, w - margin * 2 - 2 * sx, bodyH + lh * 0.5);
  ctx.clip();
  const range = panel
    ? drawDebugPanelPage(ctx, x, bodyTop, bodyW, bodyH, charW, lh, panel, world, entities, state)
    : drawDebugCommandPage(ctx, x, bodyTop, bodyW, bodyH, charW, lh, sx, sy, debugSel);
  ctx.restore();

  ctx.fillStyle = '#ff0';
  ctx.fillText(fitText(ctx, `[${debugPage + 1}/${pages}] ${title}  ·  ${range}`, bodyW), x, top);
  ctx.strokeStyle = 'rgba(255,255,0,0.25)';
  ctx.beginPath();
  ctx.moveTo(x, top + lh * 1.4);
  ctx.lineTo(w - margin - pad, top + lh * 1.4);
  ctx.stroke();

  const nav = panel ? 'прокрутка' : 'выбор';
  ctx.fillStyle = '#666';
  ctx.fillText(
    fitText(
      ctx,
      `${controlBindingLabel('menuLeft')}/${controlBindingLabel('menuRight')} страница  ${controlBindingLabel('menuUp')}/${controlBindingLabel('menuDown')} ${nav}  ${controlBindingLabel('gameMenu')} выполнить  ${controlBindingLabel('debug')}/${menuCloseHint()} закрыть`,
      bodyW,
    ),
    x,
    hintY,
  );
}
