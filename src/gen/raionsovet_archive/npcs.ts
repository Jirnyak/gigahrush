import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  ContainerKind, 
  EntityType, AIGoal, Faction, Occupation, QuestType, MonsterKind, 
  type Entity, type Room, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { rng } from '../../core/rand';
import { DESIGN_NPC_HOME_FLOOR_KEY, RAIONSOVET_ARCHIVE_ROUTE_ID, LIDA_DEF, GRANDFATHER_DEF, FIRE_LIQUIDATOR_DEF, FALSE_HEIR_DEF } from "./meta";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'archive_lida_index', LIDA_DEF, [
  {
    id: 'archive_get_floor_permit',
    giverId: getPlotNpcNumericId('archive_lida_index')!,
    type: QuestType.FETCH,
    desc: 'Лида Индексная: «Два пустых бланка - и дам допуск к закрытой картотеке и маршрутный ордер. Подписывать их будете не здесь.»',
    targetItem: 'blank_form',
    targetCount: 2,
    rewardItem: 'archive_access_permit',
    rewardCount: 1,
    extraRewards: [{ defId: 'elevator_access_order', count: 1 }],
    relationDelta: 10,
    xpReward: 70,
    moneyReward: 50,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'archive_paper_grandfather', GRANDFATHER_DEF, [
  {
    id: 'archive_swap_card',
    giverId: getPlotNpcNumericId('archive_paper_grandfather')!,
    type: QuestType.FETCH,
    desc: 'Дед Бумажный: «Принесите краденую карточку. Я покажу, кому теперь числится комната, и кто останется без строки.»',
    targetItem: 'stolen_archive_card',
    targetCount: 1,
    rewardItem: 'personal_file_copy',
    rewardCount: 1,
    extraRewards: [{ defId: 'passport_stub', count: 1 }],
    relationDelta: 12,
    xpReward: 80,
    moneyReward: 60,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'archive_fire_liquidator', FIRE_LIQUIDATOR_DEF, [
  {
    id: 'archive_save_or_burn',
    giverId: getPlotNpcNumericId('archive_fire_liquidator')!,
    type: QuestType.FETCH,
    desc: 'Инна Огневая: «Принесите пропавшее дело. Сохраним запись или сожжем зараженную полку по акту. Оба варианта вредят разным людям.»',
    targetItem: 'missing_record_file',
    targetCount: 1,
    rewardItem: 'record_exposure_notice',
    rewardCount: 1,
    extraRewards: [{ defId: 'siren_instruction', count: 1 }],
    relationDelta: 8,
    xpReward: 85,
    moneyReward: 100,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'archive_false_heir', FALSE_HEIR_DEF, [
  {
    id: 'archive_market_license',
    giverId: getPlotNpcNumericId('archive_false_heir')!,
    type: QuestType.FETCH,
    desc: 'Гера Наследник: «Лист с поддельной печатью превратим в лицензию для рынка 88. Почти чистую.»',
    targetItem: 'forged_stamp_sheet',
    targetCount: 1,
    rewardItem: 'official_permit_slip',
    rewardCount: 1,
    extraRewards: [{ defId: 'fake_pass', count: 1 }],
    relationDelta: 6,
    xpReward: 75,
    moneyReward: 130,
  },
]);

export function nextArchiveContainerId(world: World): { v: number } {
  return { v: world.containers.reduce((max, container) => Math.max(max, container.id), 0) + 1 };
}

export function spawnArchiveNpc(
  entities: Entity[],
  nextId: { v: number },
  _def: PlotNpcDef,
  plotNpcId: string,
  x: number,
  y: number,
  weapon?: string,
): void {
  requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, x + 0.5, y + 0.5, {
    angle: Math.PI,
    weapon,
    canGiveQuest: true,
    aiTarget: { x: x + 0.5, y: y + 0.5 },
  });
}

export function spawnArchiveGuard(entities: Entity[], nextId: { v: number }, x: number, y: number): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle: Math.PI / 2,
    pitch: 0,
    alive: true,
    speed: 0.95,
    sprite: Occupation.HUNTER,
    name: 'Кислов Проверяющий',
    isFemale: false,
    needs: freshNeeds(),
    hp: 220,
    maxHp: 220,
    money: 45,
    ai: { goal: AIGoal.IDLE, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 10 },
      { defId: 'denunciation', count: 1 },
    ],
    weapon: 'makarov',
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    questId: -1,
  });
}

export function spawnArchiveMonster(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  kind: MonsterKind,
): void {
  const def = MONSTERS[kind];
  if (!def) return;
  const ci = world.idx(x, y);
  const zoneId = world.zoneMap[ci];
  const zoneLevel = world.zones[zoneId]?.level ?? 1;
  const hp = scaleMonsterHp(def.hp, zoneLevel);
  const monster: Entity = {
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, zoneLevel),
    sprite: monsterSpr(kind),
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(zoneLevel),
  };
  entities.push(monster);
}

export function addArchiveContainer(
  world: World,
  nextContainerId: { v: number },
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: WorldContainer['inventory'],
  tags: string[],
  faction?: Faction,
): void {
  world.addContainer({
    id: nextContainerId.v++,
    x,
    y,
    z: 30,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory,
    capacitySlots: 8,
    faction,
    access,
    lockDifficulty: access === 'locked' ? 5 : undefined,
    discovered: true,
    tags: [RAIONSOVET_ARCHIVE_ROUTE_ID, ...tags],
  });
}

