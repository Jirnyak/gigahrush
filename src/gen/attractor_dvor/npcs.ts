import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  Occupation,
  RoomType,
  Tex,
  W,
  type Entity,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { HUMAN_TERRITORY_OWNERS, factionToTerritoryOwner } from '../../data/factions';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { ATTRACTOR_DVOR_ROUTE_ID, ATTRACTOR_DVOR_BASE_FLOOR, DEAD_FLOOR, Point, AttractorRooms, ATTRACTOR_HQ_COMPOUNDS } from "./meta";
import { paintAttractorRoomOwner, roomByName } from "./geometry";

export function paintAttractorAuthoredHqOwners(world: World): void {
  const seeds: { name: string; owner: TerritoryOwner }[] =
    ATTRACTOR_HQ_COMPOUNDS.map(spec => ({ name: spec.name, owner: spec.owner }));
  for (const seed of seeds) {
    const room = roomByName(world, seed.name);
    if (!room) continue;
    room.type = RoomType.HQ;
    room.sealed = true;
    paintAttractorRoomOwner(world, room, seed.owner);
  }
}

export function placeContainers(world: World, rooms: AttractorRooms): void {
  addContainer(world, rooms.entry, rooms.entry.x + 16, rooms.entry.y + 14, ContainerKind.TOOL_LOCKER, 'Шкаф входной струи', 'public', [
    { defId: 'fuse', count: 1 },
    { defId: 'wire_coil', count: 1 },
    { defId: 'water', count: 1 },
  ], ['entry', 'flow', 'repair']);
  addContainer(world, rooms.deadZone, rooms.deadZone.x + 16, rooms.deadZone.y + 16, ContainerKind.SECRET_STASH, 'Сухой ящик в мертвой зоне', 'secret', [
    { defId: 'relay_diagram', count: 1 },
    { defId: 'door_kit', count: 1 },
    { defId: 'gasmask_filter', count: 1 },
  ], ['dead_zone', 'shortcut', 'risk']);
  addContainer(world, rooms.transitCache, rooms.transitCache.x + 13, rooms.transitCache.y + 13, ContainerKind.METAL_CABINET, 'Запертый ящик обходного течения', 'locked', [
    { defId: 'hermo_gasket', count: 1 },
    { defId: 'sealant_tube', count: 1 },
    { defId: 'ammo_9mm', count: 10 },
  ], ['transit_cache', 'switch_reward', 'locked']);
}

export function spawnActors(world: World, entities: Entity[], nextId: { v: number }, rooms: AttractorRooms): void {
  spawnNpc(entities, nextId, 'Ликвидатор внешней петли', Faction.LIQUIDATOR, Occupation.HUNTER, rooms.southSpine.x + 42, rooms.southSpine.y + 15, Math.PI / 2, 'makarov');
  spawnNpc(entities, nextId, 'Ликвидатор внешней петли', Faction.LIQUIDATOR, Occupation.HUNTER, rooms.westSpine.x + 15, rooms.westSpine.y + 72, 0, 'makarov');
  spawnNpc(entities, nextId, 'Ликвидатор внешней петли', Faction.LIQUIDATOR, Occupation.HUNTER, rooms.northSpine.x + 230, rooms.northSpine.y + 14, -Math.PI / 2, 'makarov');
  spawnNpc(entities, nextId, 'Ликвидатор внешней петли', Faction.LIQUIDATOR, Occupation.HUNTER, rooms.eastSpine.x + 15, rooms.eastSpine.y + 184, Math.PI, 'makarov');
  spawnNpc(entities, nextId, 'Инженер параметров двора', Faction.SCIENTIST, Occupation.ELECTRICIAN, rooms.pumpCore.x + 20, rooms.pumpCore.y + 40, Math.PI);

  spawnMonster(world, entities, nextId, MonsterKind.TUBE_EEL, rooms.deadZone.x + 72, rooms.deadZone.y + 28, 4, 'Трубный угорь мертвой зоны');
  spawnMonster(world, entities, nextId, MonsterKind.TRUBNYY_AVTOMAT, rooms.transitCache.x + 34, rooms.transitCache.y + 28, 4, 'Трубный автомат обходного течения');
  spawnMonster(world, entities, nextId, MonsterKind.RZHAVNIK, rooms.westSpine.x + 14, rooms.westSpine.y + 180, 3, 'Ржавник желтой петли');
  void world;
}

export function isAttractorAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    entity.id === undefined &&
    entity.persistentNpcId === undefined &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

export function attractorTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
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

export function alignAttractorDvorAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = attractorTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isAttractorAmbientNpc(entity) || entity.faction === undefined) continue;
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

export function carvePolyline(world: World, points: readonly Point[], radius: number, floorTex: Tex, seed: number, tint: readonly [number, number, number]): number {
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    count += carveLineWidth(world, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, radius, floorTex, seed + i * 47, tint);
  }
  return count;
}

export function carveLineWidth(
  world: World,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  floorTex: Tex,
  seed: number,
  tint: readonly [number, number, number],
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  let changed = 0;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = Math.round(x0 + dx * t);
    const y = Math.round(y0 + dy * t);
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        if (ox * ox + oy * oy > radius * radius + 1) continue;
        const idx = world.idx(x + ox, y + oy);
        if (world.cells[idx] === Cell.LIFT) continue;
        if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) changed++;
        world.cells[idx] = floorTex === DEAD_FLOOR && (step + ox + oy) % 7 === 0 ? Cell.WATER : Cell.FLOOR;
        world.floorTex[idx] = floorTex;
        if (world.roomMap[idx] < 0) world.fog[idx] = floorTex === DEAD_FLOOR ? 32 : Math.min(world.fog[idx], 8);
      }
    }
    if (step % 19 === 0) {
      stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.2, 0.38, seed + step, tint[0], tint[1], tint[2], false);
    }
  }
  return changed;
}

export function addContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: WorldContainer['inventory'],
  tags: string[],
): void {
  world.addContainer({
    id: world.containers.length + 1,
    x: world.wrap(x),
    y: world.wrap(y),
    z: ATTRACTOR_DVOR_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)] ?? 0,
    kind,
    name,
    inventory,
    capacitySlots: Math.max(6, inventory.length + 3),
    access,
    lockDifficulty: access === 'locked' ? 3 : undefined,
    discovered: access !== 'secret',
    tags: [ATTRACTOR_DVOR_ROUTE_ID, ...tags],
  });
}

export function spawnNpc(
  entities: Entity[],
  nextId: { v: number },
  name: string,
  faction: Faction,
  occupation: Occupation,
  x: number,
  y: number,
  angle: number,
  weapon?: string,
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle,
    pitch: 0,
    alive: true,
    speed: 0.88,
    sprite: occupation,
    name,
    isFemale: false,
    needs: freshNeeds(),
    hp: 145,
    maxHp: 145,
    money: 34,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: weapon ? [{ defId: 'ammo_9mm', count: 8 }] : [{ defId: 'bread', count: 1 }],
    weapon,
    faction,
    occupation,
    questId: -1,
    rpg: randomRPG(3),
  });
}

export function spawnMonster(
  _world: World,
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  level: number,
  name?: string,
): void {
  const def = MONSTERS[kind];
  if (!def) return;
  const hp = scaleMonsterHp(def.hp, level);
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, level),
    sprite: monsterSpr(kind),
    name: name ?? def.name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    attackCd: 0,
    rpg: randomRPG(level),
  });
}

