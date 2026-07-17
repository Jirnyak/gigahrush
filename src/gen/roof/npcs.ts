/* -- Design z: Крыша ---------------------------------------
 * Route id roof, z=+50. Self-contained authored generator with a
 * dynamic sky provider consumed through the generic WebGL ceiling slot.
 */

import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  MonsterKind,
  RoomType,
  ZoneFaction,
  type Entity,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr, Spr } from '../../render/sprite_index';
import { rng } from '../../core/rand';

import {
  ROOF_ROUTE_ID,
  ROOF_BASE_FLOOR,
  CX,
  CY} from './index';

export function roofRoomPressureFaction(room: Room): ZoneFaction {
  const name = room.name.toLowerCase();
  if (name.includes('ликвидатор') || name.includes('снайпер')) return ZoneFaction.LIQUIDATOR;
  if (name.includes('культ')) return ZoneFaction.CULTIST;
  if (name.includes('уч') || name.includes('нии') || name.includes('метео') || name.includes('медпост')) return ZoneFaction.SCIENTIST;
  if (name.includes('дик') || name.includes('облак') || name.includes('смол')) return ZoneFaction.WILD;
  if (name.includes('граждан') || name.includes('вод') || name.includes('бак') || name.includes('вентиляц')) return ZoneFaction.CITIZEN;
  if (room.type === RoomType.HQ) return ZoneFaction.LIQUIDATOR;
  if (room.type === RoomType.PRODUCTION) return ZoneFaction.LIQUIDATOR;
  if (room.type === RoomType.OFFICE || room.type === RoomType.MEDICAL) return ZoneFaction.SCIENTIST;
  if (room.type === RoomType.STORAGE && room.id % 5 === 0) return ZoneFaction.WILD;
  return ZoneFaction.CITIZEN;
}

export function paintRoofPressureRoom(world: World, room: Room, faction: ZoneFaction, level: number): void {
  const zid = world.zoneMap[world.idx(room.x + (room.w >> 1), room.y + (room.h >> 1))];
  const zone = world.zones[zid];
  if (zone) {
    zone.faction = faction;
    zone.level = Math.max(zone.level, level);
    zone.fogged = false;
  }
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      world.factionControl[ci] = faction;
    }
  }
}

export function spawnRoofMonsters(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  rooms: Record<string, Room>,
): void {
  spawnRoofMonster(world, entities, nextId, MonsterKind.EYE, rooms.mainSlab.x + 30, rooms.mainSlab.y + 32, 'Глаз снайперской линии');
  spawnRoofMonster(world, entities, nextId, MonsterKind.EYE, rooms.mainSlab.x + 43, rooms.mainSlab.y + 25, 'Глаз повторного облака');
  spawnRoofMonster(world, entities, nextId, MonsterKind.REBAR, rooms.riggerMast.x + 12, rooms.riggerMast.y + 8, 'Арматура мачтовая');
  spawnRoofMonster(world, entities, nextId, MonsterKind.SHADOW, rooms.cloudCamp.x + 9, rooms.cloudCamp.y + 5, 'Тень под облаком');
}

export function spawnRoofMonster(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  name: string,
): void {
  const def = MONSTERS[kind];
  if (!def || world.cells[world.idx(x, y)] !== Cell.FLOOR) return;
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: monsterSpr(kind),
    name,
    hp: def.hp,
    maxHp: def.hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: CX, ty: CY, path: [], pi: 0, stuck: 0, timer: 0 },
  });
}

export function addRoofContainer(
  world: World,
  id: number,
  room: Room,
  dx: number,
  dy: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: WorldContainer['inventory'],
  owner: Entity | undefined,
  tags: string[],
): void {
  const x = room.x + dx;
  const y = room.y + dy;
  world.addContainer({
    id,
    x,
    y,
    z: ROOF_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory,
    capacitySlots: Math.max(8, inventory.length + 4),
    ownerNpcId: owner?.id,
    ownerName: owner?.name,
    faction: owner?.faction,
    access,
    lockDifficulty: access === 'locked' || access === 'owner' ? 4 : undefined,
    discovered: true,
    tags: [ROOF_ROUTE_ID, 'roof', ...tags],
  });
}

export function dropItem(
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  defId: string,
  count: number,
  data?: unknown,
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count, data }],
  });
}

