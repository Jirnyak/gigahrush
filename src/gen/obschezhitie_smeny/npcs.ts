import {
  AIGoal,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  NpcState,
  Occupation,
  type Entity,
  type Item,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef } from '../../data/plot';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { OBSCHEZHITIE_SMENY_DESIGN_FLOOR_ID, BASE_FLOOR, SLEEPER_TEMPLATE_COUNT, PATROL_TEMPLATE_COUNT, NPC_IDS, NPC_DEFS, DormLayout, DormRooms } from "./meta";
import { placeFeature } from "./geometry";

export function spawnAuthoredDormNpcs(entities: Entity[], nextId: { v: number }, rooms: DormRooms): Record<keyof typeof NPC_IDS, number> {
  return {
    rita: spawnNpc(entities, nextId, NPC_DEFS.obschezhitie_rita_starshaya, NPC_IDS.rita, rooms.shelter.x + 9, rooms.shelter.y + 10),
    gleb: spawnNpc(entities, nextId, NPC_DEFS.obschezhitie_gleb_obhod, NPC_IDS.gleb, rooms.watch.x + 18, rooms.watch.y + 8, 'rubber_club'),
    senya: spawnNpc(entities, nextId, NPC_DEFS.obschezhitie_senya_tikhiy, NPC_IDS.senya, rooms.smoking.x + 8, rooms.smoking.y + 8, 'knife'),
  };
}

export function spawnNpc(
  entities: Entity[],
  nextId: { v: number },
  _npc: PlotNpcDef,
  plotNpcId: string,
  x: number,
  y: number,
  weapon?: string,
): number {
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, x + 0.5, y + 0.5, {
    angle: rng() * Math.PI * 2,
    canGiveQuest: true,
    weapon,
    aiTarget: { x: x + 0.5, y: y + 0.5 },
  });
  return npc.id;
}

export function spawnSleeperTemplates(entities: Entity[], nextId: { v: number }, bunks: readonly Room[]): void {
  for (let i = 0; i < Math.min(SLEEPER_TEMPLATE_COUNT, bunks.length * 3); i++) {
    const room = bunks[i % bunks.length];
    const x = room.x + 3 + (i % 3) * 7;
    const y = room.y + (i % 2 === 0 ? 3 : 8);
    const needs = freshNeeds();
    needs.sleep = 4 + (i % 7);
    entities.push({
      id: nextId.v++,
      type: EntityType.NPC,
      x: x + 0.5,
      y: y + 0.5,
      angle: Math.PI * (i % 2),
      pitch: 0,
      alive: true,
      speed: 0.62,
      sprite: i % 5 === 0 ? Occupation.MECHANIC : i % 4 === 0 ? Occupation.COOK : Occupation.TURNER,
      name: `Спящий сменщик ${i + 1}`,
      needs,
      hp: 78,
      maxHp: 78,
      money: 2 + (i % 9),
      ai: { goal: AIGoal.SLEEP, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 16 + i, npcState: NpcState.SLEEPING },
      inventory: [{ defId: i % 3 === 0 ? 'bread' : i % 3 === 1 ? 'cigs' : 'water_coupon', count: 1 }],
      faction: Faction.CITIZEN,
      occupation: i % 5 === 0 ? Occupation.MECHANIC : i % 4 === 0 ? Occupation.COOK : Occupation.TURNER,
      assignedRoomId: room.id,
      questId: -1,
    });
  }
}

export function spawnNightPatrolTemplates(entities: Entity[], nextId: { v: number }, layout: DormLayout): void {
  for (let i = 0; i < PATROL_TEMPLATE_COUNT; i++) {
    const west = i % 2 === 0;
    const x = west ? layout.leftX + 34 + i * 9 : layout.rightX - 34 - i * 9;
    const y = i < 4 ? layout.northY + 1 : layout.southY + 1;
    entities.push({
      id: nextId.v++,
      type: EntityType.NPC,
      x: x + 0.5,
      y: y + 0.5,
      angle: west ? 0 : Math.PI,
      pitch: 0,
      alive: true,
      speed: 0.86,
      sprite: i % 3 === 0 ? Occupation.HUNTER : Occupation.LOCKSMITH,
      name: `Дежурный тихого обхода ${i + 1}`,
      needs: freshNeeds(),
      hp: 92,
      maxHp: 92,
      money: 8 + i,
      ai: { goal: AIGoal.WANDER, tx: x + (west ? 24 : -24), ty: y, path: [], pi: 0, stuck: 0, timer: i * 2, npcState: NpcState.PATROL },
      inventory: [{ defId: i % 2 === 0 ? 'cigs' : 'note', count: 1 }],
      weapon: i % 3 === 0 ? 'rubber_club' : undefined,
      faction: i % 3 === 0 ? Faction.LIQUIDATOR : Faction.CITIZEN,
      occupation: i % 3 === 0 ? Occupation.HUNTER : Occupation.LOCKSMITH,
      questId: -1,
    });
  }
}

export function placeDormContainers(
  world: World,
  containerId: { v: number },
  rooms: DormRooms,
  owners: Record<keyof typeof NPC_IDS, number>,
): void {
  addContainer(world, containerId, rooms.watch, 30, 5, ContainerKind.FILING_CABINET, 'Журнал ночного обхода', [
    { defId: 'samosbor_tally', count: 1 },
    { defId: 'neighbor_complaint', count: 2 },
    { defId: 'cigs', count: 1 },
  ], 'owner', owners.gleb, NPC_DEFS.obschezhitie_gleb_obhod.name, ['patrol', 'witness', 'quiet_passage', 'paper']);

  addContainer(world, containerId, rooms.shelter, 10, 15, ContainerKind.EMERGENCY_BOX, 'Общий ящик у гермодвери', [
    { defId: 'bread', count: 4 },
    { defId: 'water', count: 3 },
    { defId: 'bandage', count: 2 },
    { defId: 'shelter_tally', count: 1 },
  ], 'public', undefined, undefined, ['shelter', 'samosbor', 'resident_relief', 'legal_supply']);

  addContainer(world, containerId, rooms.shelter, 101, 15, ContainerKind.FILING_CABINET, 'Ритина ведомость койко-мест', [
    { defId: 'shelter_tally', count: 1 },
    { defId: 'ration_registry_extract', count: 1 },
    { defId: 'water_coupon', count: 2 },
  ], 'owner', owners.rita, NPC_DEFS.obschezhitie_rita_starshaya.name, ['shelter', 'rollcall', 'paper', 'witness']);

  addContainer(world, containerId, rooms.lockers, 6, 8, ContainerKind.METAL_CABINET, 'Скрипучий шкаф первой бригады', [
    { defId: 'sleeping_pills', count: 1 },
    { defId: 'cigs', count: 3 },
    { defId: 'container_key_label', count: 1 },
  ], 'owner', undefined, 'первая спящая бригада', ['theft', 'quiet_loot', 'shift_locker', 'witness'], 3);

  addContainer(world, containerId, rooms.lockers, 22, 18, ContainerKind.METAL_CABINET, 'Шкаф с сухими робами', [
    { defId: 'cloth_roll', count: 2 },
    { defId: 'cleaning_kit', count: 1 },
    { defId: 'water_coupon', count: 1 },
  ], 'owner', undefined, 'вторая спящая бригада', ['theft', 'quiet_loot', 'shift_locker'], 3);

  addContainer(world, containerId, rooms.kitchen, 20, 16, ContainerKind.FRIDGE, 'Холодильник сменной каши', [
    { defId: 'kasha', count: 4 },
    { defId: 'bread', count: 3 },
    { defId: 'tea', count: 2 },
  ], 'room', undefined, undefined, ['kitchen', 'shared', 'resident_relief']);

  addContainer(world, containerId, rooms.smoking, 25, 12, ContainerKind.SECRET_STASH, 'Тихая банка за батареей', [
    { defId: 'container_key_label', count: 1 },
    { defId: 'cigs', count: 2 },
    { defId: 'neighbor_complaint', count: 1 },
  ], 'secret', undefined, undefined, ['secret', 'quiet_loot', 'rumor', 'witness']);

  for (let i = 0; i < rooms.bunks.length; i += 3) {
    const room = rooms.bunks[i];
    addContainer(world, containerId, room, 17, 6, i % 2 === 0 ? ContainerKind.WOODEN_CHEST : ContainerKind.METAL_CABINET, `${room.name}: тумба у койки`, [
      { defId: i % 2 === 0 ? 'bread' : 'water_coupon', count: 1 },
      { defId: i % 4 === 0 ? 'cigs' : 'note', count: 1 },
    ], 'owner', undefined, 'спящий сменщик', ['theft', 'sleeping_group', 'quiet_loot']);
  }
}

export function addContainer(
  world: World,
  containerId: { v: number },
  room: Room,
  dx: number,
  dy: number,
  kind: ContainerKind,
  name: string,
  inventory: Item[],
  access: WorldContainer['access'],
  ownerNpcId: number | undefined,
  ownerName: string | undefined,
  tags: string[],
  lockDifficulty?: number,
): void {
  const x = world.wrap(room.x + dx);
  const y = world.wrap(room.y + dy);
  const container: WorldContainer = {
    id: containerId.v++,
    x,
    y,
    z: BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots: 10,
    ownerNpcId,
    ownerName,
    faction: ownerNpcId === undefined ? Faction.CITIZEN : undefined,
    access,
    lockDifficulty,
    discovered: access !== 'secret',
    tags: [OBSCHEZHITIE_SMENY_DESIGN_FLOOR_ID, ...tags],
  };
  if (tags.includes('shift_locker')) container.stolenItemIds = ['bread'];
  world.addContainer(container);
  placeFeature(world, x, y, kind === ContainerKind.FRIDGE ? Feature.SINK : Feature.SHELF);
}

