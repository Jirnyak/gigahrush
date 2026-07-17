import {
  AIGoal, Cell, ContainerKind, DoorState, EntityType, Faction, Feature,
  MonsterKind, RoomType,
  Tex, W, ZoneFaction,
  type Entity, type Item, type Room, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { HUMAN_TERRITORY_OWNERS, factionToTerritoryOwner } from '../../data/factions';
import { type PlotNpcDef } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { ensureConnectivity, generateZones } from '../shared';
import { genLog } from '../log';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { UNDERHELL_ROUTE_ID, UNDERHELL_Z, UNDERHELL_FLOOR, SPAWN_X, SPAWN_Y, UNDERHELL_FLAGS, UnderhellRitualState, UnderhellDesignGeneration, UNDERHELL_LATE_WARNINGS, THRESHOLD_MARFUSHA_DEF, DEBT_CULTIST_DEF, WORDLESS_LIQUIDATOR_DEF, FALSE_YAKOV_DEF } from "./meta";
import { scoreUnderhellThresholdChain, tryOpenUnderhellVoidGate, registerUnderhellRouteCues, paintBaseUnderhell, createUnderhellRoom, connectRooms, carveRootTunnel, touchesRoomInterior, markBridgeCandles, decorateEntry, decorateFallbackLedge, decorateRootStair, decorateThreshold, decorateWitnessCell, decorateTollChamber, decorateDebtWell, decorateInvertedChapel, decorateSacrificeGate, decorateVoidGate, measureUnderhellSdfMetrics, isUnderhellWalkableCell, setFeature, retuneUnderhellZones, addItemDrop, addNote } from "./geometry";

export function alignUnderhellAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = underhellTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isUnderhellAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 131 + offset * 457) % list.length];
    entity.x = (cell % W) + 0.5;
    entity.y = ((cell / W) | 0) + 0.5;
    entity.assignedRoomId = world.roomMap[cell] >= 0 ? world.roomMap[cell] : -1;
    if (entity.ai) {
      entity.ai.tx = cell % W;
      entity.ai.ty = (cell / W) | 0;
      entity.ai.path = [];
      entity.ai.pi = 0;
      entity.ai.stuck = 0;
    }
  }
}

export function isUnderhellAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    entity.id === undefined &&
    entity.persistentNpcId === undefined &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined &&
    (entity.name?.startsWith('Нижний пропускник: ветеран ') ?? false);
}

export function underhellTerritorySpawnCells(world: World): Map<ZoneFaction, number[]> {
  const cells = new Map<ZoneFaction, number[]>();
  for (const owner of HUMAN_TERRITORY_OWNERS) cells.set(owner, []);
  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (cell !== Cell.FLOOR && cell !== Cell.WATER && cell !== Cell.DOOR) continue;
    if (world.aptMask[i] || world.containerMap.has(i) || world.features[i] === Feature.LIFT_BUTTON) continue;
    const list = cells.get(world.factionControl[i] as ZoneFaction);
    if (list) list.push(i);
  }
  return cells;
}

export function generateUnderhellDesignFloorSeeded(seed: number, forceOpenVoidGate: boolean): UnderhellDesignGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };

  paintBaseUnderhell(world);

  const entry = createUnderhellRoom(world, SPAWN_X - 8, SPAWN_Y - 6, 17, 13, RoomType.COMMON, 'Корневой вход', Tex.GUT, Tex.F_MEAT);
  const fallback = createUnderhellRoom(world, SPAWN_X - 64, SPAWN_Y + 8, 17, 11, RoomType.CORRIDOR, 'Обратный уступ', Tex.MEAT, Tex.F_MEAT);
  const rootStair = createUnderhellRoom(world, SPAWN_X + 48, SPAWN_Y + 8, 17, 11, RoomType.CORRIDOR, 'Корневая лестница', Tex.GUT, Tex.F_GUT);
  const threshold = createUnderhellRoom(world, SPAWN_X - 15, SPAWN_Y + 46, 31, 15, RoomType.HQ, 'Пост трех оплат', Tex.GUT, Tex.F_GUT);
  const witnessA = createUnderhellRoom(world, SPAWN_X - 57, SPAWN_Y + 49, 11, 9, RoomType.STORAGE, 'Свидетельская клетка А', Tex.MEAT, Tex.F_MEAT);
  const witnessB = createUnderhellRoom(world, SPAWN_X + 46, SPAWN_Y + 49, 11, 9, RoomType.STORAGE, 'Свидетельская клетка Б', Tex.MEAT, Tex.F_MEAT);
  const toll = createUnderhellRoom(world, SPAWN_X - 15, SPAWN_Y + 103, 31, 13, RoomType.HQ, 'Культовая пошлинная палата', Tex.MEAT, Tex.F_GUT);
  const debt = createUnderhellRoom(world, SPAWN_X - 80, SPAWN_Y + 132, 21, 15, RoomType.PRODUCTION, 'Печь сожженного долга', Tex.GUT, Tex.F_GUT);
  const chapel = createUnderhellRoom(world, SPAWN_X + 59, SPAWN_Y + 132, 27, 19, RoomType.HQ, 'Палата якоря', Tex.MEAT, Tex.F_GUT);
  const sacrifice = createUnderhellRoom(world, SPAWN_X - 14, SPAWN_Y + 188, 29, 17, RoomType.CORRIDOR, 'Списочная створка', Tex.GUT, Tex.F_MEAT);
  const lowerFallback = createUnderhellRoom(world, SPAWN_X - 69, SPAWN_Y + 195, 19, 11, RoomType.CORRIDOR, 'Нижний обратный уступ', Tex.MEAT, Tex.F_MEAT);
  const gate = createUnderhellRoom(world, SPAWN_X - 11, SPAWN_Y + 252, 23, 15, RoomType.CORRIDOR, 'Разрез к Пустоте', Tex.VOID_WALL, Tex.F_VOID);

  connectRooms(world, entry, threshold, 2, DoorState.HERMETIC_OPEN, Tex.F_GUT);
  connectRooms(world, entry, fallback, 1, DoorState.HERMETIC_OPEN, Tex.F_CONCRETE);
  connectRooms(world, fallback, threshold, 1, DoorState.HERMETIC_OPEN, Tex.F_CONCRETE);
  connectRooms(world, entry, rootStair, 2, DoorState.HERMETIC_OPEN, Tex.F_GUT);
  connectRooms(world, rootStair, threshold, 1, DoorState.HERMETIC_OPEN, Tex.F_GUT);
  const witnessDoorA = connectRooms(world, threshold, witnessA, 1, DoorState.HERMETIC_CLOSED, Tex.F_CONCRETE);
  const witnessDoorB = connectRooms(world, threshold, witnessB, 1, DoorState.HERMETIC_CLOSED, Tex.F_CONCRETE);
  connectRooms(world, threshold, toll, 2, DoorState.CLOSED, Tex.F_GUT);
  connectRooms(world, toll, debt, 2, DoorState.CLOSED, Tex.F_CONCRETE);
  connectRooms(world, toll, chapel, 2, DoorState.CLOSED, Tex.F_CONCRETE);
  connectRooms(world, debt, lowerFallback, 1, DoorState.HERMETIC_OPEN, Tex.F_CONCRETE);
  connectRooms(world, lowerFallback, sacrifice, 1, DoorState.HERMETIC_OPEN, Tex.F_CONCRETE);
  connectRooms(world, chapel, sacrifice, 2, DoorState.HERMETIC_OPEN, Tex.F_GUT);
  connectRooms(world, sacrifice, gate, 2, DoorState.HERMETIC_OPEN, Tex.F_GUT);
  connectRooms(world, lowerFallback, gate, 1, DoorState.HERMETIC_OPEN, Tex.F_CONCRETE);
  carveRootTunnel(world, entry.x + (entry.w >> 1), entry.y - 16, entry.x + (entry.w >> 1), entry.y + (entry.h >> 1), 2, Tex.F_MEAT);
  sinkUnderhellAbyss(world);
  markBridgeCandles(world, entry, fallback, 8);
  markBridgeCandles(world, entry, rootStair, 8);
  markBridgeCandles(world, toll, debt, 7);
  markBridgeCandles(world, toll, chapel, 7);
  markBridgeCandles(world, lowerFallback, gate, 9);

  decorateEntry(world, entry);
  decorateFallbackLedge(world, fallback);
  decorateRootStair(world, rootStair);
  decorateThreshold(world, threshold);
  decorateWitnessCell(world, witnessA, true);
  decorateWitnessCell(world, witnessB, false);
  decorateTollChamber(world, toll);
  const debtWellCell = decorateDebtWell(world, debt);
  decorateInvertedChapel(world, chapel);
  decorateSacrificeGate(world, sacrifice);
  decorateFallbackLedge(world, lowerFallback);
  const voidGateCell = decorateVoidGate(world, gate);
  const capillaryCells = measureUnderhellCapillaryCells(world);
  const sdfMetrics = measureUnderhellSdfMetrics(world, entry, fallback, rootStair, threshold, toll, lowerFallback);

  ensureConnectivity(world, SPAWN_X + 0.5, SPAWN_Y + 0.5);
  generateZones(world);
  retuneUnderhellZones(world);

  const marfushaId = spawnUnderhellNpc(world, entities, nextId, threshold, THRESHOLD_MARFUSHA_DEF, 'underhell_threshold_marfusha', 15, 7, Math.PI);
  const debtCultistId = spawnUnderhellNpc(world, entities, nextId, debt, DEBT_CULTIST_DEF, 'underhell_debt_cultist', 5, 7, 0);
  const liquidatorId = spawnUnderhellNpc(world, entities, nextId, witnessA, WORDLESS_LIQUIDATOR_DEF, 'underhell_wordless_liquidator', 4, 4, Math.PI / 2);
  const echoId = spawnUnderhellNpc(world, entities, nextId, chapel, FALSE_YAKOV_DEF, 'underhell_false_yakov_echo', 13, 4, Math.PI);
  void marfushaId;
  void debtCultistId;
  void liquidatorId;
  void echoId;

  addUnderhellContainer(world, debt, debt.x + debt.w - 4, debt.y + 2, 'Коптильный сейф долга', Faction.CULTIST, [
    { defId: 'forged_stamp_sheet', count: 1 },
    { defId: 'fake_pass', count: 1 },
    { defId: 'water_coupon', count: 3 },
  ], ['underhell', 'debt_burn', 'market_88', 'floor_69']);

  addItemDrop(entities, nextId, threshold.x + 3, threshold.y + threshold.h - 3, 'holy_water', 1);
  addItemDrop(entities, nextId, threshold.x + threshold.w - 4, threshold.y + threshold.h - 3, 'passport_stub', 1);
  addItemDrop(entities, nextId, fallback.x + 3, fallback.y + fallback.h - 3, 'bandage', 1);
  addItemDrop(entities, nextId, lowerFallback.x + lowerFallback.w - 4, lowerFallback.y + lowerFallback.h - 3, 'filtered_water', 1);
  addItemDrop(entities, nextId, gate.x + 2, gate.y + gate.h - 3, 'bottled_voice', 1);
  addNote(entities, nextId, entry.x + 3, entry.y + 3, 'Нижний пропускник берет одну явную плату: holy_water, passport_stub или blood_35hp. Обратный уступ и корневая лестница ведут к лифту, пока вы не полезли глубже.');
  addNote(entities, nextId, fallback.x + 2, fallback.y + 2, UNDERHELL_LATE_WARNINGS[2].warning);
  addNote(entities, nextId, threshold.x + 5, threshold.y + 3, `${UNDERHELL_LATE_WARNINGS[0].warning} У поста есть боковой отход к обратному уступу.`);
  addNote(entities, nextId, witnessB.x + 4, witnessB.y + 4, 'Свидетель Б молчит. Клетку можно открыть, но можно и оставить его без показаний.');
  addNote(entities, nextId, lowerFallback.x + 3, lowerFallback.y + 2, UNDERHELL_LATE_WARNINGS[3].warning);
  addNote(entities, nextId, sacrifice.x + 4, sacrifice.y + 4, UNDERHELL_LATE_WARNINGS[1].warning);

  spawnUnderhellMonster(world, entities, nextId, MonsterKind.SHADOW, threshold.x + 5, threshold.y + 3, 'Тень у платы', 4);
  spawnUnderhellMonster(world, entities, nextId, MonsterKind.KOSTOREZ, toll.x + toll.w - 5, toll.y + 6, 'Косторез пошлины', 5);
  spawnUnderhellMonster(world, entities, nextId, MonsterKind.SPIRIT, debt.x + 4, debt.y + 6, 'Дым сожженного долга', 5);
  spawnUnderhellMonster(world, entities, nextId, MonsterKind.REBAR, sacrifice.x + 6, sacrifice.y + 8, 'Костяная арматура створки', 5);
  spawnUnderhellMonster(world, entities, nextId, MonsterKind.EYE, gate.x + gate.w - 4, gate.y + 4, 'Глаз разреза', 5);
  const anchorEntityId = spawnUnderhellMonster(world, entities, nextId, MonsterKind.IDOL, chapel.x + 13, chapel.y + 11, 'Идол-якорь нижнего поста', 7);

  const ritualState: UnderhellRitualState = {
    routeId: UNDERHELL_ROUTE_ID,
    z: UNDERHELL_Z,
    seed,
    flags: forceOpenVoidGate ? UNDERHELL_FLAGS.THRESHOLD_HOLY_WATER | UNDERHELL_FLAGS.VOID_ANCHOR_BROKEN : 0,
    entryRoomId: entry.id,
    fallbackRoomId: fallback.id,
    thresholdRoomId: threshold.id,
    witnessRoomIds: [witnessA.id, witnessB.id],
    witnessDoorCells: [...witnessDoorA, ...witnessDoorB].filter(i => i >= 0),
    lowerFallbackRoomId: lowerFallback.id,
    debtRoomId: debt.id,
    voidGateRoomId: gate.id,
    debtWellCell,
    voidGateCell,
    voidAnchorEntityId: anchorEntityId,
    capillaryCells,
    tributeFrontCells: sdfMetrics.tributeFrontCells,
    shelterCells: sdfMetrics.shelterCells,
    lateWarningIds: UNDERHELL_LATE_WARNINGS.map(warning => warning.id),
  };
  if (forceOpenVoidGate) tryOpenUnderhellVoidGate(world, ritualState);
  registerUnderhellRouteCues(world, ritualState, entry, fallback, threshold, witnessA, toll, lowerFallback, sacrifice, gate);
  const thresholdChain = scoreUnderhellThresholdChain(world, ritualState);

  world.bakeLights();
  genLog(`[FLOOR19_UNDERHELL] generated ${UNDERHELL_ROUTE_ID} seed ${seed} rooms=${world.rooms.length} gate=${voidGateCell} chain=${thresholdChain.score}/${thresholdChain.minScore}`);

  return {
    isDecentralized: true,
    world,
    entities,
    spawnX: SPAWN_X + 0.5,
    spawnY: SPAWN_Y + 0.5,
    ritualState,
    thresholdChain,
  };
}

export function sinkUnderhellAbyss(world: World): void {
  const cy = SPAWN_Y + 126;
  for (let y = SPAWN_Y - 46; y <= SPAWN_Y + 284; y++) {
    for (let x = SPAWN_X - 122; x <= SPAWN_X + 122; x++) {
      const dx = world.delta(SPAWN_X, x);
      const dy = world.delta(cy, y);
      const mainBasin = (dx * dx) / (120 * 120) + (dy * dy) / (205 * 205) <= 1;
      const leftBasin = (world.delta(SPAWN_X - 58, x) ** 2) / (74 * 74) + (world.delta(SPAWN_Y + 116, y) ** 2) / (132 * 132) <= 1;
      const rightBasin = (world.delta(SPAWN_X + 58, x) ** 2) / (74 * 74) + (world.delta(SPAWN_Y + 116, y) ** 2) / (132 * 132) <= 1;
      if (!mainBasin && !leftBasin && !rightBasin) continue;
      const ci = world.idx(x, y);
      if (world.cells[ci] !== Cell.WALL || touchesRoomInterior(world, x, y)) continue;
      world.cells[ci] = Cell.ABYSS;
      world.roomMap[ci] = -1;
      world.wallTex[ci] = Tex.DARK;
      world.floorTex[ci] = Tex.F_ABYSS;
      world.features[ci] = Feature.NONE;
    }
  }
}

export function measureUnderhellCapillaryCells(world: World): number {
  let count = 0;
  for (let y = SPAWN_Y - 52; y <= SPAWN_Y + 284; y++) {
    for (let x = SPAWN_X - 132; x <= SPAWN_X + 132; x++) {
      const ci = world.idx(x, y);
      if (!isUnderhellWalkableCell(world, ci) || world.roomMap[ci] >= 0) continue;
      const floorTex = world.floorTex[ci];
      if (floorTex === Tex.F_GUT || floorTex === Tex.F_MEAT || floorTex === Tex.F_CONCRETE || floorTex === Tex.F_VOID) {
        count++;
      }
    }
  }
  return count;
}

export function spawnUnderhellNpc(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  room: Room,
  _def: PlotNpcDef,
  plotNpcId: string,
  dx: number,
  dy: number,
  angle: number,
): number {
  const x = world.wrap(room.x + dx);
  const y = world.wrap(room.y + dy);
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, x + 0.5, y + 0.5, {
    angle,
    canGiveQuest: true,
    aiTarget: { x: x + 0.5, y: y + 0.5 },
    extra: {
      rpg: { level: 12, xp: 0, attrPoints: 0, str: 5, agi: 4, int: 5, psi: 20, maxPsi: 20 },
    },
  });
  return npc.id;
}

export function spawnUnderhellMonster(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  name: string,
  bonusLevel: number,
): number {
  const def = MONSTERS[kind];
  const zoneLevel = world.zones[world.zoneMap[world.idx(x, y)]]?.level ?? 12;
  const level = zoneLevel + bonusLevel;
  const hp = Math.round(scaleMonsterHp(def.hp, level));
  const id = nextId.v++;
  entities.push({
    id,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: kind === MonsterKind.IDOL ? 0 : scaleMonsterSpeed(def.speed, level),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
    phasing: kind === MonsterKind.SPIRIT,
    spriteScale: kind === MonsterKind.IDOL ? 1.25 : undefined,
  });
  return id;
}

export function addUnderhellContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  name: string,
  faction: Faction,
  inventory: Item[],
  tags: string[],
): void {
  const id = world.containers.reduce((mx, c) => Math.max(mx, c.id), 0) + 1;
  const container: WorldContainer = {
    id,
    x,
    y,
    z: UNDERHELL_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind: ContainerKind.SAFE,
    name,
    inventory,
    capacitySlots: 6,
    faction,
    access: 'faction',
    lockDifficulty: 4,
    discovered: true,
    tags,
  };
  world.addContainer(container);
  setFeature(world, x, y, Feature.SHELF);
}

