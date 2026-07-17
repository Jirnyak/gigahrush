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
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { HUMAN_TERRITORY_OWNERS, factionToTerritoryOwner } from '../../data/factions';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { randomRPG } from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { HYPERBOLIC_SWITCHYARD_BASE_FLOOR, GUIDE_NPC_ID, SwitchyardRooms } from "./meta";

export function spawnGuide(entities: Entity[], nextId: { v: number }, room: Room): void {
  requireSpawnedPlotNpcFromPackage(entities, nextId, GUIDE_NPC_ID, room.x + 8.5, room.y + room.h - 6.5, {
    angle: Math.PI / 2,
    isTraveler: true,
    canGiveQuest: true,
    aiTarget: { x: room.x + 8, y: room.y + room.h - 6 },
    extra: {
      assignedRoomId: room.id,
      rpg: randomRPG(5),
    },
  });
}

export function spawnShortcutMonsters(world: World, entities: Entity[], nextId: { v: number }, cells: readonly number[]): void {
  const kinds: readonly MonsterKind[] = [
    MonsterKind.PSEUDOLIFT,
    MonsterKind.TUBE_EEL,
    MonsterKind.RZHAVNIK,
    MonsterKind.TRUBNYY_AVTOMAT,
    MonsterKind.SHADOW,
    MonsterKind.TONKAYA_TEN,
  ];
  const stride = Math.max(1, Math.floor(cells.length / 18));
  for (let i = 0; i < 18; i++) {
    const cell = cells[(i * stride + 17) % cells.length];
    if (world.cells[cell] !== Cell.FLOOR) continue;
    const kind = kinds[i % kinds.length];
    const def = MONSTERS[kind];
    if (!def) continue;
    const x = cell % W;
    const y = (cell / W) | 0;
    const hp = Math.round(def.hp * 1.45);
    entities.push({
      id: nextId.v++,
      type: EntityType.MONSTER,
      x: x + 0.5,
      y: y + 0.5,
      angle: (i / 18) * Math.PI * 2,
      pitch: 0,
      alive: true,
      speed: def.speed * 1.05,
      sprite: monsterSpr(kind),
      hp,
      maxHp: hp,
      monsterKind: kind,
      attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
      rpg: randomRPG(7),
      phasing: kind === MonsterKind.SHADOW || kind === MonsterKind.TONKAYA_TEN,
    });
  }
}

export function placeSwitchyardContainers(world: World, nextId: { v: number }, rooms: SwitchyardRooms): void {
  addContainer(world, nextId, rooms.guide, rooms.guide.x + 32, rooms.guide.y + 5, ContainerKind.CASHBOX, 'Касса проводника стрелочной', [
    { defId: 'metro_ticket', count: 2 },
    { defId: 'chalk', count: 2 },
  ], ['hyperbolic_switchyard', 'pay_guide', 'trade', 'route_map'], 'public');
  addContainer(world, nextId, rooms.blueSwitch, rooms.blueSwitch.x + 6, rooms.blueSwitch.y + 20, ContainerKind.TOOL_LOCKER, 'Шкаф синего семейства дуг', [
    { defId: 'fuse', count: 1 },
    { defId: 'wire_coil', count: 1 },
  ], ['hyperbolic_switchyard', 'switch_family', 'repair'], 'room');
  addContainer(world, nextId, rooms.redSwitch, rooms.redSwitch.x + 25, rooms.redSwitch.y + 20, ContainerKind.TOOL_LOCKER, 'Шкаф красного семейства дуг', [
    { defId: 'door_kit', count: 1 },
    { defId: 'relay_diagram', count: 1 },
  ], ['hyperbolic_switchyard', 'switch_family', 'shortcut'], 'locked', 3);
  addContainer(world, nextId, rooms.shortcut, rooms.shortcut.x + 10, rooms.shortcut.y + 20, ContainerKind.METAL_CABINET, 'Аварийный ящик геодезического хода', [
    { defId: 'ammo_9mm', count: 18 },
    { defId: 'bandage', count: 2 },
    { defId: 'fuse', count: 1 },
  ], ['hyperbolic_switchyard', 'geodesic_shortcut', 'monster_heavy'], 'public');
  addContainer(world, nextId, rooms.falsePlatform, rooms.falsePlatform.x + 42, rooms.falsePlatform.y + 19, ContainerKind.SECRET_STASH, 'Пломба ложной платформы', [
    { defId: 'relay_diagram', count: 1 },
    { defId: 'metro_ticket', count: 1 },
    { defId: 'lamp_bulb', count: 1 },
  ], ['hyperbolic_switchyard', 'false_platform', 'sabotage'], 'secret', 5);
}

export function addContainer(
  world: World,
  nextId: { v: number },
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  inventory: WorldContainer['inventory'],
  tags: string[],
  access: WorldContainer['access'],
  lockDifficulty?: number,
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.addContainer({
    id: nextId.v++,
    x,
    y,
    z: HYPERBOLIC_SWITCHYARD_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[ci],
    kind,
    name,
    inventory,
    capacitySlots: 8,
    faction: Faction.LIQUIDATOR,
    access,
    lockDifficulty,
    discovered: access !== 'secret',
    tags,
  });
  if (world.features[ci] === Feature.NONE) world.features[ci] = Feature.SHELF;
}

export function isHyperbolicSwitchyardAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    !entity.id &&
    !entity.persistentNpcId &&
    entity.alifeId === undefined &&
    entity.questId === -1;
}

export function hyperbolicSwitchyardTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
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

export function alignHyperbolicSwitchyardAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = hyperbolicSwitchyardTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isHyperbolicSwitchyardAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 127 + offset * 421) % list.length];
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

