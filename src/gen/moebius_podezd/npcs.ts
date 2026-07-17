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
import { freshNeeds } from '../../data/catalog';
import { HUMAN_TERRITORY_OWNERS, factionToTerritoryOwner } from '../../data/factions';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { randomRPG } from '../../systems/rpg';
import { rng } from '../../core/rand';
import { MOEBIUS_PODEZD_BASE_FLOOR, SHORTCUT_X, SEAM_KEY_ID } from "./meta";
import { MoebiusRooms, NextId, setFeature } from "./geometry";

export function alignMoebiusPodezdAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = moebiusTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isMoebiusAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 109 + offset * 397) % list.length];
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

export function isMoebiusAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    entity.name?.startsWith('Мёбиус-подъезд:') === true &&
    entity.id === undefined &&
    entity.persistentNpcId === undefined &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

export function moebiusTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
  const cells = new Map<TerritoryOwner, number[]>();
  for (const owner of HUMAN_TERRITORY_OWNERS) cells.set(owner, []);
  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (cell !== Cell.FLOOR && cell !== Cell.WATER) continue;
    if (world.aptMask[i] || world.hermoWall[i] || world.containerMap.has(i) || world.features[i] === Feature.LIFT_BUTTON) continue;
    const owner = world.factionControl[i] as TerritoryOwner;
    const list = cells.get(owner);
    if (list) list.push(i);
  }
  return cells;
}

export function placeDecisionContainers(world: World, rooms: MoebiusRooms): void {
  addContainer(world, rooms.seamNorth, rooms.seamNorth.x + 8, rooms.seamNorth.y + 10, ContainerKind.FILING_CABINET, 'Журнал прямой стороны подъезда', 'public', [
    { defId: 'chalk', count: 1 },
    { defId: 'neighbor_complaint', count: 1 },
  ], ['moebius_podezd', 'mirror_tell', 'public_loop', 'choose_corridor']);
  addContainer(world, rooms.seamSouth, rooms.seamSouth.x + rooms.seamSouth.w - 9, rooms.seamSouth.y + 10, ContainerKind.FILING_CABINET, 'Журнал обратной стороны подъезда', 'public', [
    { defId: 'chalk', count: 1 },
    { defId: 'sealed_complaint', count: 1 },
  ], ['moebius_podezd', 'mirror_tell', 'orientation_flip', 'choose_corridor']);
  addContainer(world, rooms.lostMarker, rooms.lostMarker.x + 12, rooms.lostMarker.y + 9, ContainerKind.SECRET_STASH, 'Коробка с потерянной меткой маршрута', 'secret', [
    { defId: 'chalk', count: 2 },
    { defId: 'elevator_access_order', count: 1 },
    { defId: 'container_key_label', count: 1 },
  ], ['moebius_podezd', 'route_marker', 'recover', 'secret', 'mirror_tell']);
  addContainer(world, rooms.shortcut, SHORTCUT_X + 3, 510, ContainerKind.TOOL_LOCKER, 'Щиток паритетного замка', 'locked', [
    { defId: SEAM_KEY_ID, count: 1 },
    { defId: 'wire_coil', count: 1 },
    { defId: 'fuse', count: 1 },
  ], ['moebius_podezd', 'seam_lock', 'break', 'shortcut']);
  for (const [i, room] of rooms.mirroredFlats.entries()) {
    if (i % 5 !== 0) continue;
    addContainer(world, room, room.x + room.w - 7, room.y + 6, ContainerKind.WOODEN_CHEST, `Зеркальная тумба ${i + 1}`, 'room', [
      { defId: i % 2 === 0 ? 'bread' : 'water_coupon', count: 1 },
      { defId: i % 2 === 0 ? 'felt_door_pad' : 'rubber_door_wedge', count: 1 },
    ], ['moebius_podezd', 'mirror_tell', 'flat_pair', i % 2 === 0 ? 'safe_side' : 'reverse_side']);
  }
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
  tags: string[],
): WorldContainer {
  const container: WorldContainer = {
    id: nextContainerId(world),
    x: world.wrap(x),
    y: world.wrap(y),
    z: MOEBIUS_PODEZD_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots: Math.max(8, inventory.length + 4),
    access,
    lockDifficulty: access === 'locked' ? 3 : undefined,
    discovered: access !== 'secret',
    tags,
  };
  world.addContainer(container);
  setFeature(world, x, y, kind === ContainerKind.TOOL_LOCKER ? Feature.APPARATUS : Feature.SHELF);
  return container;
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

export function spawnReversedPatrols(entities: Entity[], nextId: NextId): void {
  spawnPatrolNpc(entities, nextId, 'Ликвидатор обратного обхода север', 746, 405, 274, 405, Math.PI);
  spawnPatrolNpc(entities, nextId, 'Ликвидатор обратного обхода юг', 274, 619, 746, 619, 0);
  spawnPatrolNpc(entities, nextId, 'Свидетель обратного обхода А', 332, 405, 332, 619, Math.PI / 2, Faction.CITIZEN, Occupation.TRAVELER);
  spawnPatrolNpc(entities, nextId, 'Свидетель обратного обхода Б', 690, 619, 690, 405, -Math.PI / 2, Faction.CITIZEN, Occupation.HOUSEWIFE);
}

export function spawnPatrolNpc(
  entities: Entity[],
  nextId: NextId,
  name: string,
  x: number,
  y: number,
  tx: number,
  ty: number,
  angle: number,
  faction = Faction.LIQUIDATOR,
  occupation = Occupation.HUNTER,
): void {
  const liquidator = faction === Faction.LIQUIDATOR;
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle,
    pitch: 0,
    alive: true,
    speed: liquidator ? 0.92 : 0.76,
    sprite: occupation,
    name,
    needs: freshNeeds(),
    hp: liquidator ? 145 : 88,
    maxHp: liquidator ? 145 : 88,
    money: liquidator ? 36 : 9,
    ai: { goal: AIGoal.GOTO, tx: tx + 0.5, ty: ty + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: liquidator
      ? [{ defId: 'rubber_club', count: 1 }, { defId: 'ammo_9mm', count: 8 }]
      : [{ defId: 'bread', count: 1 }, { defId: 'chalk', count: 1 }],
    weapon: liquidator ? 'rubber_club' : undefined,
    faction,
    occupation,
    questId: -1,
    rpg: randomRPG(liquidator ? 3 : 1),
  });
}

export function spawnSeamThreats(world: World, entities: Entity[], nextId: NextId): void {
  spawnMonster(world, entities, nextId, MonsterKind.SHOVNIK, 512, 510, 3, 'Шовник на паритетном замке');
  spawnMonster(world, entities, nextId, MonsterKind.NELYUD, 640, 638, 2, 'Нелюдь из обратной квартиры');
}

export function spawnMonster(
  world: World,
  entities: Entity[],
  nextId: NextId,
  kind: MonsterKind,
  x: number,
  y: number,
  level: number,
  name: string,
): void {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) return;
  const def = MONSTERS[kind];
  if (!def) return;
  const hp = Math.round(def.hp * (0.9 + level * 0.16));
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed * (0.95 + level * 0.035),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
  });
}

