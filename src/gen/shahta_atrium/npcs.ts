import {
  AIGoal,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  type Entity,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { ITEMS } from '../../data/catalog';
import { MONSTERS } from '../../entities/monster';
import { randomRPG } from '../../systems/rpg';
import { rng } from '../../core/rand';
import { SHAHTA_ATRIUM_BASE_FLOOR } from "./meta";
import { setFeature } from "./geometry";

export function addContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  inventory: readonly { defId: string; count: number }[],
  tags: readonly string[],
  access: WorldContainer['access'] = 'room',
): WorldContainer {
  const cleanInventory = inventory.filter(item => ITEMS[item.defId]).map(item => ({ defId: item.defId, count: item.count }));
  const id = world.containers.length + 1;
  const ci = world.idx(x, y);
  const container: WorldContainer = {
    id,
    x: world.wrap(x),
    y: world.wrap(y),
    z: SHAHTA_ATRIUM_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[ci],
    kind,
    name,
    inventory: cleanInventory,
    capacitySlots: Math.max(8, cleanInventory.length + 4),
    faction: access === 'public' ? undefined : Faction.LIQUIDATOR,
    access,
    lockDifficulty: access === 'locked' ? 3 : undefined,
    discovered: true,
    tags: ['shahta_atrium', ...tags],
  };
  world.addContainer(container);
  setFeature(world, x, y, kind === ContainerKind.TOOL_LOCKER ? Feature.MACHINE : Feature.SHELF);
  return container;
}

export function spawnMonster(entities: Entity[], nextId: { v: number }, kind: MonsterKind, x: number, y: number, level: number): void {
  const def = MONSTERS[kind];
  const hp = Math.round(def.hp * (1 + Math.max(0, level - 1) * 0.18));
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
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
    phasing: kind === MonsterKind.SPIRIT,
  });
}

