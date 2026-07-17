import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  RoomType,
  Tex,
  W,
  ZoneFaction,
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
import { PENROSE_LAUNDRY_BASE_FLOOR, PenroseLaundryState, C, LOCK_KEY_ID, IGOR_DEF, LIDIA_DEF, TONYA_DEF } from "./meta";
import { carvePenroseLine, featureForPenroseRoom, setFeature, roomById } from "./geometry";

export function carvePenroseEdgeDrains(world: World): void {
  carvePenroseLine(world, C, C - 8, 0, C - 184, 4, Tex.F_WATER, Tex.TILE_W, ZoneFaction.CITIZEN);
  carvePenroseLine(world, C + 4, C + 8, W - 1, C + 162, 4, Tex.F_CONCRETE, Tex.PIPE, ZoneFaction.LIQUIDATOR);
  carvePenroseLine(world, C - 36, C, C - 210, 0, 3, Tex.F_LINO, Tex.PANEL, ZoneFaction.CITIZEN);
  carvePenroseLine(world, C + 42, C, C + 184, W - 1, 3, Tex.F_GREEN_CARPET, Tex.DARK, ZoneFaction.CULTIST);
}

export function decoratePenroseSupportRoom(world: World, room: Room, seed: number): void {
  setFeature(world, room.x + 3, room.y + 3, featureForPenroseRoom(room.type, false));
  setFeature(world, room.x + room.w - 4, room.y + room.h - 4, featureForPenroseRoom(room.type, true));
  if (room.type === RoomType.BATHROOM) {
    for (let x = room.x + 4; x < room.x + room.w - 4; x += 5) {
      const idx = world.idx(x, room.y + (room.h >> 1));
      if (world.roomMap[idx] === room.id) {
        world.cells[idx] = Cell.WATER;
        world.floorTex[idx] = Tex.F_WATER;
      }
    }
  } else if (room.type === RoomType.PRODUCTION) {
    for (let y = room.y + 4; y < room.y + room.h - 4; y += 5) {
      const idx = world.idx(room.x + (room.w >> 1), y);
      if (world.roomMap[idx] === room.id && ((y + seed) & 1) === 0) world.fog[idx] = 64;
    }
  }
}

export function placePenroseContainers(
  world: World,
  roomsById: Map<string, Room>,
  owners: { marfaId: number; igorId: number; lidiaId: number; tonyaId: number },
): PenroseLaundryState['containerIds'] {
  const lock = addContainer(world, roomById(roomsById, 'laundry_lock'), 4, 4, ContainerKind.TOOL_LOCKER, 'Прачечный замок с чужими насечками', [
    { defId: 'cleaning_kit', count: 1 },
    { defId: 'cloth_roll', count: 2 },
    { defId: 'sealant_tube', count: 1 },
  ], 'locked', ['penrose_laundry', 'laundry_lock', 'breakable', 'decision'], owners.igorId, IGOR_DEF.name, 3);

  const steam = addContainer(world, roomById(roomsById, 'steam_valve'), 5, 4, ContainerKind.METAL_CABINET, 'Шкаф пароотвода П-81', [
    { defId: 'valve_tag', count: 1 },
    { defId: 'asbestos_cord', count: 1 },
    { defId: 'manometer', count: 1 },
  ], 'owner', ['penrose_laundry', 'steam', 'divert_steam', 'repair'], owners.lidiaId, LIDIA_DEF.name);

  addContainer(world, roomById(roomsById, 'first_sun'), 6, 5, ContainerKind.WOODEN_CHEST, 'Корзина метки Солнце', [
    { defId: 'cloth_roll', count: 2 },
    { defId: 'chalk', count: 1 },
  ], 'room', ['penrose_laundry', 'symbol_chain', 'laundry']);

  addContainer(world, roomById(roomsById, 'dry_cache'), 3, 4, ContainerKind.FILING_CABINET, 'Сухая складка ведомостей П-81', [
    { defId: 'water_coupon', count: 2 },
    { defId: 'filter_receipt', count: 1 },
    { defId: 'sealed_complaint', count: 1 },
  ], 'room', ['penrose_laundry', 'dry_cache', 'papers']);

  const hidden = addContainer(world, roomById(roomsById, 'hidden_cache'), 3, 3, ContainerKind.SECRET_STASH, 'Скрытый умывальный кэш П-81', [
    { defId: 'pressure_logbook', count: 1 },
    { defId: 'filtered_water', count: 2 },
    { defId: 'gasmask_filter', count: 1 },
    { defId: LOCK_KEY_ID, count: 1 },
  ], 'secret', ['penrose_laundry', 'hidden_washroom_cache', 'cache', 'symbol_chain'], owners.tonyaId, TONYA_DEF.name, 4);

  return {
    laundryLock: lock.id,
    steamValve: steam.id,
    hiddenWashroomCache: hidden.id,
  };
}

export function addContainer(
  world: World,
  room: Room,
  dx: number,
  dy: number,
  kind: ContainerKind,
  name: string,
  inventory: Item[],
  access: WorldContainer['access'],
  tags: string[],
  ownerNpcId?: number,
  ownerName?: string,
  lockDifficulty?: number,
): WorldContainer {
  const x = room.x + dx;
  const y = room.y + dy;
  const container: WorldContainer = {
    id: nextContainerId(world),
    x,
    y,
    z: PENROSE_LAUNDRY_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots: Math.max(8, inventory.length + 4),
    ownerNpcId,
    ownerName,
    faction: ownerNpcId === undefined ? Faction.CITIZEN : undefined,
    access,
    lockDifficulty,
    discovered: access !== 'secret',
    tags,
  };
  world.addContainer(container);
  setFeature(world, x, y, kind === ContainerKind.SECRET_STASH ? Feature.SHELF : Feature.MACHINE);
  return container;
}

export function spawnPenroseThreats(world: World, entities: Entity[], nextId: { v: number }, roomsById: Map<string, Room>): void {
  spawnMonster(entities, nextId, MonsterKind.TUBE_EEL, roomById(roomsById, 'rinse_line'), 10, 7);
  spawnMonster(entities, nextId, MonsterKind.VODYANOY_KOSHMAR, roomById(roomsById, 'drain_tail'), 8, 7);
  spawnMonster(entities, nextId, MonsterKind.KRYSNOZHKA, roomById(roomsById, 'laundry_lock'), 18, 10);
  spawnMonster(entities, nextId, MonsterKind.POLZUN, roomById(roomsById, 'hidden_cache'), 12, 8);
  for (const room of [roomById(roomsById, 'rinse_line'), roomById(roomsById, 'steam_valve')]) {
    const ci = world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2));
    if (world.cells[ci] === Cell.FLOOR) world.fog[ci] = Math.max(world.fog[ci], 110);
  }
}

export function spawnPlotNpc(
  entities: Entity[],
  nextId: { v: number },
  npcId: string,
  _def: PlotNpcDef,
  room: Room,
  dx: number,
  dy: number,
  angle: number,
): number {
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, room.x + dx + 0.5, room.y + dy + 0.5, {
    angle,
  });
  return npc.id;
}

export function spawnMonster(entities: Entity[], nextId: { v: number }, kind: MonsterKind, room: Room, dx: number, dy: number): void {
  const def = MONSTERS[kind];
  if (!def) return;
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: room.x + Math.min(room.w - 2, dx) + 0.5,
    y: room.y + Math.min(room.h - 2, dy) + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: def.speed * 0.9,
    sprite: monsterSpr(kind),
    hp: Math.max(1, Math.round(def.hp * 0.85)),
    maxHp: Math.max(1, Math.round(def.hp * 0.85)),
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    monsterKind: kind,
  });
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

