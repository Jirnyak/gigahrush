import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
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
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { rng } from '../../core/rand';
import { CAYLEY_BYURO_ROUTE_ID, CAYLEY_BYURO_Z, CAYLEY_BYURO_BASE_FLOOR, CayleyByuroState, CAYLEY_TAGS } from "./meta";

export function createState(spawnX: number, spawnY: number): CayleyByuroState {
  return {
    routeId: CAYLEY_BYURO_ROUTE_ID,
    anchorZ: CAYLEY_BYURO_Z,
    groupRooms: { e: -1, r: -1, rr: -1, s: -1, sr: -1, srr: -1 },
    generatorDoorIds: [],
    quotientShortcutDoorIds: [],
    decisionContainerIds: [],
    debugEntry: {
      spawnX,
      spawnY,
      summary: 'lobby -> Cayley generator doors -> coset offices -> quotient shortcut or forgery exposure',
    },
  };
}

export function spawnNpc(
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,
  _def: PlotNpcDef,
  room: Room,
  dx: number,
  dy: number,
  weapon?: string,
): number {
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, room.x + dx + 0.5, room.y + dy + 0.5, {
    angle: rng() * Math.PI * 2,
    canGiveQuest: true,
    weapon,
    aiTarget: { x: room.x + dx, y: room.y + dy },
    extra: { isTraveler: false },
  });
  return npc.id;
}

export function spawnMonster(world: World, entities: Entity[], nextId: { v: number }, room: Room, dx: number, dy: number, kind: MonsterKind): void {
  const def = MONSTERS[kind];
  if (!def) return;
  const x = room.x + dx;
  const y = room.y + dy;
  const ci = world.idx(x, y);
  const zoneLevel = world.zones[world.zoneMap[ci]]?.level ?? 3;
  const hp = scaleMonsterHp(def.hp, zoneLevel);
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, zoneLevel),
    sprite: monsterSpr(kind),
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(zoneLevel),
  });
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

export function addContainer(
  world: World,
  state: CayleyByuroState,
  room: Room,
  x: number,
  y: number,
  opts: {
    kind: ContainerKind;
    name: string;
    access: WorldContainer['access'];
    inventory: Item[];
    tags: string[];
    ownerNpcId?: number;
    ownerName?: string;
    faction?: Faction;
    lockDifficulty?: number;
  },
): WorldContainer {
  const container: WorldContainer = {
    id: nextContainerId(world),
    x,
    y,
    z: CAYLEY_BYURO_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind: opts.kind,
    name: opts.name,
    inventory: opts.inventory.map(item => ({ ...item })),
    capacitySlots: Math.max(8, opts.inventory.length + 4),
    access: opts.access,
    ownerNpcId: opts.ownerNpcId,
    ownerName: opts.ownerName,
    faction: opts.faction,
    lockDifficulty: opts.lockDifficulty,
    discovered: true,
    tags: [...CAYLEY_TAGS, ...opts.tags],
  };
  world.addContainer(container);
  state.decisionContainerIds.push(container.id);
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR) world.features[ci] = opts.kind === ContainerKind.CASHBOX ? Feature.DESK : Feature.SHELF;
  return container;
}

