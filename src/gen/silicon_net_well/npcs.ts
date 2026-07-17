import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  Occupation,
  W,
  type Entity,
  type Item,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { freshNeeds } from '../../data/catalog';
import { HUMAN_TERRITORY_OWNERS, factionToTerritoryOwner } from '../../data/factions';
import { type PlotNpcDef, type SideQuestStep, registerFloorSideQuest } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { DESIGN_NPC_HOME_FLOOR_KEY, SILICON_NET_WELL_BASE_FLOOR, SiliconNpcId, SiliconRooms, NPC_DEFS, SIDE_QUESTS } from "./meta";
import { setFeature } from "./geometry";

export let contentRegistered = false;

export function registerSiliconNetWellContent(): void {
  if (contentRegistered) return;

  const questsByGiver: Record<string, SideQuestStep[]> = {};
  for (const q of SIDE_QUESTS) {
    if (!q.giverId) continue;
    if (!questsByGiver[q.giverId]) {
      questsByGiver[q.giverId] = [];
    }
    questsByGiver[q.giverId].push(q);
  }

  for (const npcId of Object.keys(NPC_DEFS) as SiliconNpcId[]) {
    registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, npcId, NPC_DEFS[npcId], questsByGiver[npcId] ?? []);
  }
  contentRegistered = true;
}

export function isSiliconAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    entity.id === undefined &&
    entity.persistentNpcId === undefined &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

export function siliconTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
  const cells = new Map<TerritoryOwner, number[]>();
  for (const owner of HUMAN_TERRITORY_OWNERS) cells.set(owner, []);
  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (cell !== Cell.FLOOR && cell !== Cell.WATER) continue;
    if (world.aptMask[i] || world.hermoWall[i] || world.containerMap.has(i) || world.features[i] === Feature.LIFT_BUTTON) continue;
    const list = cells.get(world.factionControl[i] as TerritoryOwner);
    if (list) list.push(i);
  }
  return cells;
}

export function alignSiliconNetWellAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = siliconTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isSiliconAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 109 + offset * 401) % list.length];
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

export function spawnNpcs(
  entities: Entity[],
  nextId: { v: number },
  rooms: SiliconRooms,
): Record<SiliconNpcId, number> {
  return {
    silicon_cibo: spawnPlotNpc(entities, nextId, 'silicon_cibo', NPC_DEFS.silicon_cibo, rooms.cibo.x + 18, rooms.cibo.y + 18, 0),
    silicon_cyborg_scientist: spawnPlotNpc(entities, nextId, 'silicon_cyborg_scientist', NPC_DEFS.silicon_cyborg_scientist, rooms.lab.x + 18, rooms.lab.y + 18, Math.PI),
    silicon_admin_checker: spawnPlotNpc(entities, nextId, 'silicon_admin_checker', NPC_DEFS.silicon_admin_checker, rooms.checkpoint.x + 18, rooms.checkpoint.y + 20, 0, 'tt_pistol'),
  };
}

export function spawnAmbientNpcs(entities: Entity[], nextId: { v: number }, rooms: SiliconRooms): void {
  spawnAmbientNpc(entities, nextId, 'Администратор у экрана допуска', Faction.LIQUIDATOR, Occupation.SECRETARY, rooms.terminal.x + 18, rooms.terminal.y + 30, [
    { defId: 'official_permit_slip', count: 1 },
    { defId: 'ammo_762tt', count: 6 },
  ], 'tt_pistol');
  spawnAmbientNpc(entities, nextId, 'Техник кремниевого лаза', Faction.SCIENTIST, Occupation.MECHANIC, rooms.well.x + 22, rooms.well.y + 20, [
    { defId: 'wire_coil', count: 1 },
    { defId: 'circuit_board', count: 1 },
  ]);
  spawnAmbientNpc(entities, nextId, 'Проверяющий нижней кабины', Faction.LIQUIDATOR, Occupation.HUNTER, rooms.lowerLift.x + 12, rooms.lowerLift.y + 12, [
    { defId: 'ammo_9mm', count: 8 },
  ], 'makarov');
}

export function placeContainers(world: World, rooms: SiliconRooms, owners: Record<SiliconNpcId, number>): void {
  addContainer(world, rooms.cibo, rooms.cibo.x + rooms.cibo.w - 6, rooms.cibo.y + 8, ContainerKind.TOOL_LOCKER, 'Ящик Сибо с НЕТ-переходниками', 'owner', [
    { defId: 'circuit_board', count: 2 },
    { defId: 'wire_coil', count: 2 },
    { defId: 'ammo_energy', count: 1 },
  ], owners.silicon_cibo, NPC_DEFS.silicon_cibo.name, ['silicon_net_well', 'net', 'cibo']);

  addContainer(world, rooms.lab, rooms.lab.x + rooms.lab.w - 6, rooms.lab.y + rooms.lab.h - 8, ContainerKind.METAL_CABINET, 'Шкаф киборга с предупреждениями GBE', 'owner', [
    { defId: 'relay_diagram', count: 1 },
    { defId: 'ammo_energy', count: 1 },
    { defId: 'pills', count: 1 },
  ], owners.silicon_cyborg_scientist, NPC_DEFS.silicon_cyborg_scientist.name, ['silicon_net_well', 'scientist', 'gbe']);

  addContainer(world, rooms.checkpoint, rooms.checkpoint.x + rooms.checkpoint.w - 7, rooms.checkpoint.y + 10, ContainerKind.FILING_CABINET, 'Картотека администраторов НЕТ-ветки', 'faction', [
    { defId: 'official_permit_slip', count: 1 },
    { defId: 'blank_form', count: 2 },
    { defId: 'liquidator_token', count: 1 },
  ], owners.silicon_admin_checker, NPC_DEFS.silicon_admin_checker.name, ['silicon_net_well', 'admin', 'documents']);

  addContainer(world, rooms.vault, rooms.vault.x + rooms.vault.w - 9, rooms.vault.y + 18, ContainerKind.WEAPON_CRATE, 'Запертый ложемент гравиоружия', 'locked', [
    { defId: 'gravity_beam_emitter', count: 1 },
    { defId: 'grn420_gravizhernov', count: 1 },
    { defId: 'ammo_energy', count: 3 },
  ], undefined, undefined, ['silicon_net_well', 'gbe', 'grn420', 'rare_weapon']);
}

export function spawnThreats(world: World, entities: Entity[], nextId: { v: number }, rooms: SiliconRooms): void {
  spawnMonster(world, entities, nextId, MonsterKind.ROBOT, rooms.terminal.x + rooms.terminal.w - 18, rooms.terminal.y + 28, 4, 'Кремниевый страж');
  spawnMonster(world, entities, nextId, MonsterKind.CHERVIE_AVATAR, rooms.terminal.x + 52, rooms.terminal.y + 19, 5, 'Червие НЕТ-ветки');
  spawnMonster(world, entities, nextId, MonsterKind.SAFEGUARD, rooms.terminal.x + rooms.terminal.w - 36, rooms.terminal.y + 30, 5, 'Сейфгард НЕТ-колодца');
  spawnMonster(world, entities, nextId, MonsterKind.PARAGRAPH, rooms.checkpoint.x + rooms.checkpoint.w + 10, rooms.checkpoint.y + 18, 4, 'Параграф допуска');
  spawnMonster(world, entities, nextId, MonsterKind.SPIRIT, rooms.well.x + 28, rooms.well.y + 82, 4, 'Кремниевая тень');
  spawnMonster(world, entities, nextId, MonsterKind.SAFEGUARD, rooms.vault.x + 16, rooms.vault.y + 20, 5, 'Сейфгард ложемента');
}

export function spawnPlotNpc(
  entities: Entity[],
  nextId: { v: number },
  npcId: SiliconNpcId,
  _def: PlotNpcDef,
  x: number,
  y: number,
  angle: number,
  weapon?: string,
): number {
  const px = x + 0.5;
  const py = y + 0.5;
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, px, py, {
    angle,
    weapon,
    aiTarget: { x: px, y: py },
  });
  return npc.id;
}

export function spawnAmbientNpc(
  entities: Entity[],
  nextId: { v: number },
  name: string,
  faction: Faction,
  occupation: Occupation,
  x: number,
  y: number,
  inventory: Item[],
  weapon?: string,
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: faction === Faction.LIQUIDATOR ? 0.9 : 0.78,
    sprite: occupation,
    name,
    needs: freshNeeds(),
    hp: faction === Faction.LIQUIDATOR ? 140 : 90,
    maxHp: faction === Faction.LIQUIDATOR ? 140 : 90,
    money: 18 + Math.floor(rng() * 45),
    ai: { goal: AIGoal.IDLE, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: inventory.map(item => ({ ...item })),
    weapon,
    faction,
    occupation,
    questId: -1,
  });
}

export function addContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: Item[],
  ownerNpcId: number | undefined,
  ownerName: string | undefined,
  tags: string[],
): WorldContainer {
  const container: WorldContainer = {
    id: nextContainerId(world),
    x: world.wrap(x),
    y: world.wrap(y),
    z: SILICON_NET_WELL_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots: Math.max(8, inventory.length + 4),
    ownerNpcId,
    ownerName,
    faction: access === 'faction' ? Faction.LIQUIDATOR : undefined,
    access,
    lockDifficulty: access === 'locked' ? 5 : undefined,
    discovered: access !== 'secret',
    tags,
  };
  world.addContainer(container);
  setFeature(world, x, y, Feature.SHELF);
  return container;
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

export function spawnMonster(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  level: number,
  name?: string,
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
  const def = MONSTERS[kind];
  if (!def) return;
  const hp = Math.round(def.hp * (1 + level * 0.22));
  const monster: Entity = {
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed * (1 + level * 0.05),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    phasing: kind === MonsterKind.SPIRIT,
  };
  entities.push(monster);
}

