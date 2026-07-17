import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  W, Cell, ContainerKind, 
  RoomType, ZoneFaction,
  type Entity, EntityType, AIGoal, QuestType, MonsterKind,
  type Room, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { registerFloorSideQuest } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { setTerritoryOwnerAtIndex } from '../../systems/territory';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { rng } from '../../core/rand';
import { DESIGN_NPC_HOME_FLOOR_KEY, DESIGN_FLOOR_ID, ANTENNA_COURT_BASE_FLOOR, CX, CY, TARGET_SHARE_BY_FACTION, NPC_DEFS } from "./meta";
import { AntennaCourtSignalState, antennaRoomOwnerOverride, antennaOwnerTerritoryWeight } from "./geometry";

export interface AntennaTerritorySeed {
  owner: ZoneFaction;
  x: number;
  y: number;
  weight: number;
  scaleSqInv?: number;
}

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'antenna_pasha_grown', NPC_DEFS.antenna_pasha_grown, [
  {
    id: 'antenna_tune_floor',
    giverId: getPlotNpcNumericId('antenna_pasha_grown')!,
    type: QuestType.VISIT,
    desc: 'Паша Выросший: «Дойди до Релейной будки и настрой школьную частоту. Награда - зацепка, не карта.»',
    targetRoomDefId: 'Релейная будка',
    rewardItem: 'relay_diagram', rewardCount: 1,
    extraRewards: [{ defId: 'caravan_route', count: 1 }],
    relationDelta: 12, xpReward: 45, moneyReward: 30,
  },
  {
    id: 'antenna_repair_signal',
    giverId: getPlotNpcNumericId('antenna_pasha_grown')!,
    type: QuestType.FETCH,
    desc: 'Паша Выросший: «Нужна целая плата реле. Починим мачту - частота даст маршрутную зацепку без министерского акта.»',
    targetItem: 'circuit_board', targetCount: 1,
    rewardItem: 'radio', rewardCount: 1,
    extraRewards: [{ defId: 'relay_diagram', count: 1 }],
    relationDelta: 14, xpReward: 60, moneyReward: 35,
  },
  {
    id: 'antenna_tell_echo',
    giverId: getPlotNpcNumericId('antenna_pasha_grown')!,
    type: QuestType.TALK,
    desc: 'Паша Выросший: «Сверься с Эхо Женей. Он повторяет этажи, когда приборы начинают льстить.»',
    targetNpcId: getPlotNpcNumericId('antenna_echo_zhenya')!,
    rewardItem: 'radio', rewardCount: 1,
    relationDelta: 8, xpReward: 30, moneyReward: 20,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'antenna_mirra_jammer', NPC_DEFS.antenna_mirra_jammer, [
  {
    id: 'antenna_jam_raid',
    giverId: getPlotNpcNumericId('antenna_mirra_jammer')!,
    type: QuestType.FETCH,
    desc: 'Мирра Глушилка: «Принеси два предохранителя. Я дам короткую заглушку для рейда 88, но инспектор потом услышит пустое место.»',
    targetItem: 'fuse', targetCount: 2,
    rewardItem: 'metro_ticket', rewardCount: 1,
    extraRewards: [{ defId: 'wire_coil', count: 1 }],
    relationDelta: 10, xpReward: 50, moneyReward: 90,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'antenna_captain_krug', NPC_DEFS.antenna_captain_krug, [
  {
    id: 'antenna_battery_theft',
    giverId: getPlotNpcNumericId('antenna_captain_krug')!,
    type: QuestType.FETCH,
    desc: 'Капитан Круг: «Нужны две энергоячейки из батарейного шкафа. Получишь разрешение, если не заставишь меня писать слово "кража".»',
    targetItem: 'ammo_energy', targetCount: 2,
    rewardItem: 'official_permit_slip', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 8 }],
    relationDelta: 12, xpReward: 60, moneyReward: 50,
  },
  {
    id: 'antenna_expose_signal_log',
    giverId: getPlotNpcNumericId('antenna_captain_krug')!,
    type: QuestType.FETCH,
    desc: 'Капитан Круг: «Акт о пропавшей записи превратит закрытый шёпот в министерский след. За бумагу дам законный корешок.»',
    targetItem: 'record_exposure_notice', targetCount: 1,
    rewardItem: 'official_permit_slip', rewardCount: 1,
    extraRewards: [{ defId: 'denunciation', count: 1 }],
    relationDelta: 10, xpReward: 65, moneyReward: 45,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'antenna_guard_frequency_sergeant', NPC_DEFS.antenna_guard_frequency_sergeant, [], ['antenna_court', 'guard']);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'antenna_guard_hz_watch', NPC_DEFS.antenna_guard_hz_watch, [], ['antenna_court', 'guard']);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'antenna_echo_zhenya', NPC_DEFS.antenna_echo_zhenya, [
  {
    id: 'antenna_record_void',
    giverId: getPlotNpcNumericId('antenna_echo_zhenya')!,
    type: QuestType.FETCH,
    desc: 'Эхо Женя: «Запиши голосовую аномалию в банку и реши: продать ее рынку или отдать тому, кто умеет читать записи.»',
    targetItem: 'bottled_voice', targetCount: 1,
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 1 }],
    relationDelta: 10, xpReward: 70, moneyReward: 180,
  },
]);

export function createAntennaCourtSignalState(seed = 0): AntennaCourtSignalState {
  return {
    signalQuality: 3 + (Math.abs(seed) % 2),
    jamUntilHour: -1,
    lastTunedRouteId: '',
    recordedAnomalyFlags: 0,
  };
}

export function applyAntennaCourtTerritory(world: World): void {
  const seeds = antennaTerritorySeeds(world);
  for (const seed of seeds) {
    const ownerTarget = TARGET_SHARE_BY_FACTION[seed.owner] ?? 0.1;
    const ownerScale = 0.72 + ownerTarget * 2.2;
    const scale = Math.max(0.1, seed.weight * ownerScale);
    seed.scaleSqInv = 1 / (scale * scale);
  }

  for (let i = 0; i < W * W; i++) {
    const x = i % W;
    const y = (i / W) | 0;
    setTerritoryOwnerAtIndex(world, i, nearestAntennaTerritoryOwner(world, x, y, seeds));
  }
}

export function antennaTerritorySeeds(world: World): AntennaTerritorySeed[] {
  const seeds: AntennaTerritorySeed[] = [
    { owner: ZoneFaction.LIQUIDATOR, x: CX + 48, y: CY - 12, weight: 1.38 },
    { owner: ZoneFaction.LIQUIDATOR, x: 760, y: 254, weight: 1.22 },
    { owner: ZoneFaction.LIQUIDATOR, x: 870, y: CY, weight: 1.2 },
    { owner: ZoneFaction.SCIENTIST, x: CX, y: 154, weight: 1.28 },
    { owner: ZoneFaction.SCIENTIST, x: 360, y: 360, weight: 1.08 },
    { owner: ZoneFaction.CITIZEN, x: 154, y: CY, weight: 1.12 },
    { owner: ZoneFaction.CITIZEN, x: CX, y: 870, weight: 1.04 },
    { owner: ZoneFaction.WILD, x: 770, y: 770, weight: 1.08 },
    { owner: ZoneFaction.WILD, x: 254, y: 770, weight: 0.98 },
    { owner: ZoneFaction.CULTIST, x: 254, y: 254, weight: 0.92 },
  ];
  for (const room of world.rooms) {
    const owner = antennaRoomOwnerOverride(room);
    if (owner === undefined) continue;
    seeds.push({
      owner,
      x: room.x + (room.w >> 1),
      y: room.y + (room.h >> 1),
      weight: room.type === RoomType.HQ ? antennaOwnerTerritoryWeight(owner) : 0.78,
    });
  }
  return seeds;
}

export function nearestAntennaTerritoryOwner(world: World, x: number, y: number, seeds: readonly AntennaTerritorySeed[]): ZoneFaction {
  let best = ZoneFaction.LIQUIDATOR;
  let bestScore = Infinity;
  for (const seed of seeds) {
    const d2 = world.dist2(x, y, seed.x, seed.y);
    const wave = Math.sin((x + seed.owner * 31) * 0.019) + Math.cos((y - seed.owner * 17) * 0.017);
    const score = d2 * (seed.scaleSqInv ?? 1) - wave * 520;
    if (score < bestScore) {
      bestScore = score;
      best = seed.owner;
    }
  }
  return best;
}

export function spawnPlotNpc(
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,
  room: Room,
  dx: number,
  dy: number,
  angle: number,
  extra?: Partial<Entity>,
): Entity {
  return requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, room.x + dx + 0.5, room.y + dy + 0.5, {
    angle,
    extra,
  });
}

export function spawnSignalMonsters(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  rooms: Record<string, Room>,
): void {
  spawnMonster(world, entities, nextId, MonsterKind.EYE, rooms.courtyard.x + 21, rooms.courtyard.y + 8);
  spawnMonster(world, entities, nextId, MonsterKind.EYE, rooms.courtyard.x + 29, rooms.courtyard.y + 22);
  spawnMonster(world, entities, nextId, MonsterKind.REBAR, rooms.relay.x + 3, rooms.relay.y + 7);
  spawnMonster(world, entities, nextId, MonsterKind.SHADOW, rooms.archive.x + 16, rooms.archive.y + 6);
}

export function spawnMonster(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
): void {
  const def = MONSTERS[kind];
  if (!def) return;
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    hp: def.hp,
    maxHp: def.hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: CX, ty: CY, path: [], pi: 0, stuck: 0, timer: 0 },
  });
}

export function addContainer(
  world: World,
  id: number,
  room: Room,
  dx: number,
  dy: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: WorldContainer['inventory'],
  owner?: Entity,
): void {
  const x = room.x + dx;
  const y = room.y + dy;
  const ci = world.idx(x, y);
  world.addContainer({
    id,
    x,
    y,
    z: ANTENNA_COURT_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[ci],
    kind,
    name,
    inventory,
    capacitySlots: 10,
    ownerNpcId: owner?.id,
    ownerName: owner?.name,
    faction: owner?.faction,
    access,
    lockDifficulty: access === 'locked' || access === 'owner' ? 3 : undefined,
    discovered: true,
    tags: [DESIGN_FLOOR_ID, 'signal', 'radio', access === 'owner' ? 'theft' : 'loot'],
  });
}

