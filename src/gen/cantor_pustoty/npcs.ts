import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Feature,
  LiftDirection,
  MonsterKind,
  W,
  type Entity,
  type Item,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World, auditReachability } from '../../core/world';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { CantorRooms } from "./meta";
import { dropItem } from "./geometry";

export function paintRoomTerritorySeed(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id) world.factionControl[idx] = owner;
    }
  }
  for (const doorIdx of room.doors) world.factionControl[doorIdx] = owner;
}

export function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(container => container.id === id)) id++;
  return id;
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
): void {
  const ci = world.idx(x, y);
  world.addContainer({
    id: nextContainerId(world),
    x: world.wrap(x),
    y: world.wrap(y),
    z: 200,
    roomId: room.id,
    zoneId: world.zoneMap[ci],
    kind,
    name,
    inventory,
    capacitySlots: 7,
    access,
    lockDifficulty: access === 'locked' ? 6 : undefined,
    discovered: access !== 'secret',
    tags,
  });
  if (world.cells[ci] === Cell.FLOOR) world.features[ci] = kind === ContainerKind.TOOL_LOCKER ? Feature.SHELF : Feature.DESK;
}

export function placeContainers(world: World, rooms: CantorRooms): void {
  addContainer(world, rooms.entry, rooms.entry.x + 5, rooms.entry.y + 5, ContainerKind.EMERGENCY_BOX, 'Ящик досок входного острова', 'public', [
    { defId: 'duct_tape', count: 2 },
    { defId: 'chalk', count: 1 },
    { defId: 'water', count: 1 },
  ], ['cantor_pustoty', 'entry', 'bridge_supply']);

  addContainer(world, rooms.repair, rooms.repair.x + rooms.repair.w - 6, rooms.repair.y + 6, ContainerKind.TOOL_LOCKER, 'Шкаф ремонта канторова моста', 'public', [
    { defId: 'metal_sheet', count: 2 },
    { defId: 'sealant_tube', count: 1 },
    { defId: 'wrench', count: 1 },
  ], ['cantor_pustoty', 'repair', 'gap_bridge', 'tools']);

  addContainer(world, rooms.dust, rooms.dust.x + 7, rooms.dust.y + 6, ContainerKind.SECRET_STASH, 'Пыльный островной тайник', 'secret', [
    { defId: 'psi_dust', count: 2 },
    { defId: 'breach_charge', count: 1 },
    { defId: 'gasmask_filter', count: 1 },
  ], ['cantor_pustoty', 'dust_island', 'stash_island', 'risk_bridge']);

  addContainer(world, rooms.hidden, rooms.hidden.x + rooms.hidden.w - 7, rooms.hidden.y + 5, ContainerKind.SECRET_STASH, 'Тайник острова без обратного шага', 'secret', [
    { defId: 'psi_stabilizer', count: 1 },
    { defId: 'chalk', count: 1 },
    { defId: 'metal_sheet', count: 1 },
  ], ['cantor_pustoty', 'stash_island', 'one_way_dust']);
}

export function cantorMonsterPhases(kind: MonsterKind): boolean {
  return kind === MonsterKind.SHADOW ||
    kind === MonsterKind.TONKAYA_TEN ||
    kind === MonsterKind.GLUBINNAYA_TEN ||
    kind === MonsterKind.LISHENNYY ||
    kind === MonsterKind.SPIRIT;
}

export function spawnMonster(entities: Entity[], nextId: { v: number }, kind: MonsterKind, x: number, y: number, level: number, name: string): void {
  const def = MONSTERS[kind];
  const hp = Math.round(scaleMonsterHp(def.hp, level));
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: ((x * 31 + y * 17) % 360) * Math.PI / 180,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, level),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
    phasing: cantorMonsterPhases(kind),
  });
}

export function placeEntities(world: World, entities: Entity[], nextId: { v: number }, rooms: CantorRooms): void {
  spawnMonster(entities, nextId, MonsterKind.TONKAYA_TEN, rooms.dust.x + 5, rooms.dust.y + 5, 10, 'Тонкая тень пыльного острова');
  spawnMonster(entities, nextId, MonsterKind.LISHENNYY, rooms.hidden.x + 4, rooms.hidden.y + 5, 11, 'Лишенный обратного шага');
  spawnMonster(entities, nextId, MonsterKind.SHADOW, rooms.repair.x + rooms.repair.w - 7, rooms.repair.y + rooms.repair.h - 6, 9, 'Тень ремонтной полки');
  spawnMonster(entities, nextId, MonsterKind.GLUBINNAYA_TEN, rooms.downLift.x + 5, rooms.downLift.y + 7, 11, 'Глубинная тень нижней кабины');
  dropItem(entities, nextId, rooms.entry.x + rooms.entry.w - 6, rooms.entry.y + 4, 'chalk', 1);
  void world;
}

export function reachableLifts(world: World, spawnX: number, spawnY: number): { up: boolean; down: boolean } {
  const audit = auditReachability(world, world.idx(Math.floor(spawnX), Math.floor(spawnY)));
  let up = false;
  let down = false;
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] !== Cell.LIFT) continue;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      if (!audit.reachable[world.idx(x + dx, y + dy)]) continue;
      if (world.liftDir[i] === LiftDirection.UP) up = true;
      if (world.liftDir[i] === LiftDirection.DOWN) down = true;
    }
  }
  return { up, down };
}

export function reachableStashContainers(world: World, spawnX: number, spawnY: number): number {
  const audit = auditReachability(world, world.idx(Math.floor(spawnX), Math.floor(spawnY)));
  let count = 0;
  for (const container of world.containers) {
    if (!container.tags.includes('stash_island')) continue;
    if (audit.reachable[world.idx(container.x, container.y)]) count++;
  }
  return count;
}

