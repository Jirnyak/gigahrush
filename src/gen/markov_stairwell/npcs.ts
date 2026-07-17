import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Feature,
  MonsterKind,
  type Entity,
  type Item,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { rng } from '../../core/rand';
import { MARKOV_STAIRWELL_BYPASS_KEY, BASE_FLOOR, ChainRoom } from "./meta";
import { setFeature } from "./geometry";

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
  lockDifficulty?: number,
): WorldContainer {
  const id = nextContainerId(world);
  const container: WorldContainer = {
    id,
    x,
    y,
    z: BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)] ?? 0,
    kind,
    name,
    inventory,
    capacitySlots: Math.max(8, inventory.length + 4),
    access,
    lockDifficulty,
    discovered: access !== 'secret',
    tags,
  };
  world.addContainer(container);
  setFeature(world, x, y, kind === ContainerKind.SAFE ? Feature.DESK : Feature.SHELF);
  return container;
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

export function spawnPlotNpc(
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,
  _def: PlotNpcDef,
  x: number,
  y: number,
  angle: number,
): number {
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, x + 0.5, y + 0.5, {
    angle,
    aiTarget: { x, y },
  });
  return npc.id;
}

export function spawnMonster(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  level: number,
  name: string,
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
  const def = MONSTERS[kind];
  if (!def) return;
  const hp = Math.round(def.hp * (1 + level * 0.2));
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed * (1 + level * 0.04),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    phasing: kind === MonsterKind.SPIRIT,
  });
}

export function spawnThreats(world: World, entities: Entity[], nextId: { v: number }, chain: readonly ChainRoom[]): void {
  let spawned = 0;
  for (const entry of chain) {
    if (entry.state !== 'hunting' || spawned >= 5) continue;
    const room = entry.room;
    const kind = spawned % 2 === 0 ? MonsterKind.BEZEKHIY : MonsterKind.SHADOW;
    spawnMonster(world, entities, nextId, kind, room.x + room.w - 8, room.y + (room.h >> 1), 3, `Срыв цепи ${entry.step}`);
    spawned++;
  }
  const rare = chain.find(entry => entry.state === 'rare');
  if (rare) spawnMonster(world, entities, nextId, MonsterKind.PARAGRAPH, rare.room.x + rare.room.w - 10, rare.room.y + 7, 3, 'Параграф редкого состояния');
}

export function placeContainers(world: World, patternRoom: Room, rareRoom: Room, watcherRoom: Room): void {
  addContainer(world, watcherRoom, watcherRoom.x + watcherRoom.w - 8, watcherRoom.y + 7, ContainerKind.FILING_CABINET, 'Картотека переходов Маркова', 'owner', [
    { defId: 'note', count: 2 },
    { defId: 'chalk', count: 1 },
    { defId: MARKOV_STAIRWELL_BYPASS_KEY, count: 1 },
  ], ['markov_stairwell', 'sequence_tell', 'service_bypass']);

  addContainer(world, patternRoom, patternRoom.x + 7, patternRoom.y + patternRoom.h - 7, ContainerKind.SECRET_STASH, 'Шкаф после связки кухня-мокрая-кладовая', 'secret', [
    { defId: 'lift_scheme', count: 1 },
    { defId: 'chalk', count: 1 },
    { defId: 'water_coupon', count: 1 },
  ], ['markov_stairwell', 'pattern_stash', 'sequence_reward']);

  addContainer(world, rareRoom, rareRoom.x + rareRoom.w - 9, rareRoom.y + rareRoom.h - 8, ContainerKind.SAFE, 'Сейф редкого состояния М', 'locked', [
    { defId: 'elevator_access_order', count: 1 },
    { defId: 'personal_file_copy', count: 1 },
    { defId: 'container_key_label', count: 1 },
  ], ['markov_stairwell', 'rare_state', 'exploit'], 4);
}

