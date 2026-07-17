import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  W,
  type Entity,
  type Item,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { ITEMS } from '../../data/catalog';
import { HUMAN_TERRITORY_OWNERS, factionToTerritoryOwner } from '../../data/factions';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { territoryOwnerAtIndex } from '../../systems/territory';
import { HILBERT_DEPOT_BASE_FLOOR, Point, DEPOT_HQ_SPECS } from "./meta";
import { paintDepotRoomOwner, hardenDepotHqRoom, setFeature, roomCell, uniqueTags } from "./geometry";

export function applyHilbertDepotTerritorySeeds(world: World): void {
  for (const spec of DEPOT_HQ_SPECS) {
    const hq = world.rooms.find(room => room.name === spec.name);
    if (hq) {
      hardenDepotHqRoom(world, hq, spec.owner);
      paintDepotRoomOwner(world, hq, spec.owner);
    }
    for (const room of world.rooms) {
      if (room.name.startsWith(`${spec.name}:`)) paintDepotRoomOwner(world, room, spec.owner);
    }
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
}

export function alignHilbertDepotAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = depotTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isHilbertDepotAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 157 + offset * 409) % list.length];
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

export function addDepotPressure(entities: Entity[], nextId: { v: number }, points: readonly Point[]): void {
  const spawns: Array<{ index: number; kind: MonsterKind; name: string }> = [
    { index: 54, kind: MonsterKind.ROBOT, name: 'Счетчик Г-054' },
    { index: 121, kind: MonsterKind.RZHAVNIK, name: 'Ржавый сторож Г-121' },
    { index: 149, kind: MonsterKind.TRUBNYY_AVTOMAT, name: 'Трубный автомат Г-149' },
    { index: 198, kind: MonsterKind.REBAR, name: 'Арматурный стеллаж Г-198' },
    { index: 233, kind: MonsterKind.SAFEGUARD, name: 'Сейфгард накладной Г-233' },
  ];
  for (const spawn of spawns) {
    const point = points[spawn.index];
    spawnMonster(entities, nextId, spawn.kind, point.x + 0.5, point.y + 0.5, spawn.name);
  }
}

export function spawnMonster(
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  name: string,
): void {
  const def = MONSTERS[kind];
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite >= 0 ? def.sprite : monsterSpr(kind),
    name,
    monsterKind: kind,
    hp: Math.round(def.hp * 1.12),
    maxHp: Math.round(def.hp * 1.12),
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    faction: Faction.WILD,
  });
}

export function cargoInventory(order: number): Item[] {
  const pools = order < 80
    ? ['wire_coil', 'fuse', 'relay_diagram', 'container_key_label']
    : order < 168
      ? ['gear', 'sealant_tube', 'wrench', 'track_diagram_scrap']
      : ['circuit_board', 'ammo_energy', 'rail_signal_lamp', 'rail_switch_handle'];
  const out: Item[] = [];
  for (let i = 0; i < pools.length; i++) {
    const defId = pools[(order + i * 3) % pools.length];
    if (ITEMS[defId]) out.push({ defId, count: i === 0 && order % 6 === 0 ? 2 : 1 });
  }
  return out.length > 0 ? out : [{ defId: 'container_key_label', count: 1 }];
}

export function addContainer(
  world: World,
  room: Room,
  salt: number,
  kind: ContainerKind,
  name: string,
  inventory: readonly Item[],
  access: WorldContainer['access'],
  tags: readonly string[],
): WorldContainer {
  const pos = roomCell(room, salt);
  setFeature(world, pos.x, pos.y, kind === ContainerKind.SAFE ? Feature.DESK : Feature.SHELF);
  const container: WorldContainer = {
    id: nextContainerId(world),
    x: pos.x,
    y: pos.y,
    z: HILBERT_DEPOT_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(pos.x, pos.y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots: Math.max(8, inventory.length + 4),
    access,
    lockDifficulty: access === 'locked' ? 4 : undefined,
    discovered: true,
    faction: access === 'owner' || access === 'locked' ? Faction.LIQUIDATOR : undefined,
    ownerName: access === 'owner' ? 'Складская смена Гильберта' : undefined,
    tags: uniqueTags(tags),
  };
  world.addContainer(container);
  return container;
}

export function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(c => c.id === id)) id++;
  return id;
}

export function refreshContainerZones(world: World): void {
  for (const container of world.containers) {
    container.zoneId = world.zoneMap[world.idx(container.x, container.y)];
  }
}

export function isHilbertDepotAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    entity.name?.startsWith('Склад Гильберта:') === true &&
    entity.id === undefined &&
    entity.persistentNpcId === undefined &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

export function depotTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
  const cells = new Map<TerritoryOwner, number[]>();
  for (const owner of HUMAN_TERRITORY_OWNERS) cells.set(owner, []);
  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (cell !== Cell.FLOOR && cell !== Cell.WATER) continue;
    if (world.aptMask[i] || world.hermoWall[i] || world.containerMap.has(i) || world.features[i] === Feature.LIFT_BUTTON) continue;
    const owner = territoryOwnerAtIndex(world, i);
    const list = cells.get(owner);
    if (list) list.push(i);
  }
  return cells;
}

