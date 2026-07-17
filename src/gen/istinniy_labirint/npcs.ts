import {
  AIGoal,
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  MonsterKind,
  RoomType,
  Tex,
  type Entity,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { SURFACE_FLAG_CHALK_MAP, World } from '../../core/world';
import { type PlotNpcDef } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { stampSurfaceSplat } from '../../systems/surface_marks';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { rng } from '../../core/rand';
import { BASE_FLOOR, MAZE_WALL, MAZE_FLOOR, THREAD_FLOOR, DOCUMENT_STASH_ROOM, MazeGraph, CellPoint, LabyrinthOwnedRoom } from "./meta";
import { centerOf, addDoorToRoomState, deepestDeadEnds, paintRoomTerritory, ownerForLabyrinthRoomName } from "./geometry";

export function carveThinLine(world: World, a: CellPoint, b: CellPoint, floorTex: Tex, markSeed = 0): number[] {
  const touched: number[] = [];
  let x = world.wrap(a.x);
  let y = world.wrap(a.y);
  const ddx = world.delta(x, b.x);
  const ddy = world.delta(y, b.y);
  const sx = ddx === 0 ? 0 : ddx > 0 ? 1 : -1;
  const sy = ddy === 0 ? 0 : ddy > 0 ? 1 : -1;

  function carveOne(serial: number): void {
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.LIFT && world.cells[ci] !== Cell.DOOR && world.roomMap[ci] < 0) {
      world.cells[ci] = Cell.FLOOR;
      world.floorTex[ci] = floorTex;
      world.wallTex[ci] = MAZE_WALL;
      touched.push(ci);
      if (markSeed > 0 && serial % 9 === 0) markAriadneCue(world, x, y, markSeed + serial, 206, 198, 142);
    }
  }

  for (let i = 0; i <= Math.abs(ddx); i++) {
    carveOne(i);
    if (i < Math.abs(ddx)) x = world.wrap(x + sx);
  }
  for (let i = 0; i <= Math.abs(ddy); i++) {
    carveOne(i + 400);
    if (i < Math.abs(ddy)) y = world.wrap(y + sy);
  }
  return touched;
}

export function markAriadneCue(world: World, x: number, y: number, seed: number, r: number, g: number, b: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.DOOR) return;
  stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.9, 0.6, seed, r, g, b, false);
  world.surfaceFlags[ci] |= SURFACE_FLAG_CHALK_MAP;
}

export function connectRoomToPoint(
  world: World,
  room: Room,
  targetX: number,
  targetY: number,
  state: DoorState,
  markSeed: number,
): void {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  const dx = world.delta(cx, targetX);
  const dy = world.delta(cy, targetY);
  let wx = cx;
  let wy = cy;
  let ox = cx;
  let oy = cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    wx = dx >= 0 ? room.x + room.w : room.x - 1;
    wy = Math.max(room.y, Math.min(room.y + room.h - 1, targetY));
    ox = wx + (dx >= 0 ? 1 : -1);
    oy = wy;
  } else {
    wx = Math.max(room.x, Math.min(room.x + room.w - 1, targetX));
    wy = dy >= 0 ? room.y + room.h : room.y - 1;
    ox = wx;
    oy = wy + (dy >= 0 ? 1 : -1);
  }
  addDoorToRoomState(world, room, wx, wy, state);
  carveThinLine(world, { x: ox, y: oy }, { x: targetX, y: targetY }, state === DoorState.HERMETIC_OPEN ? THREAD_FLOOR : MAZE_FLOOR, markSeed);
  markAriadneCue(world, ox, oy, markSeed, 206, 198, 142);
}

export function paintLabyrinthTerritorySeeds(world: World, ownedRooms: readonly LabyrinthOwnedRoom[]): void {
  for (const item of ownedRooms) paintRoomTerritory(world, item.room, item.owner);
}

export function reinforceIstinniyLabirintTerritorySeeds(world: World): void {
  for (const room of world.rooms) {
    const owner = ownerForLabyrinthRoomName(room.name);
    if (owner === undefined) continue;
    if (room.name.endsWith(': гермоядро') || room.name === 'Лабиринт: нулевая катушка Ариадны' || room.name === 'Лабиринт: дальняя лифтовая спина') {
      room.type = RoomType.HQ;
      room.sealed = true;
      room.wallTex = Tex.HERMO_WALL;
      for (let dy = -1; dy <= room.h; dy++) {
        for (let dx = -1; dx <= room.w; dx++) {
          const idx = world.idx(room.x + dx, room.y + dy);
          if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
          if (world.cells[idx] === Cell.WALL) {
            world.hermoWall[idx] = 1;
            world.wallTex[idx] = Tex.HERMO_WALL;
          }
        }
      }
    }
    paintRoomTerritory(world, room, owner);
  }
}

export function addContainer(world: World, nextContainerId: { v: number }, x: number, y: number, roomId: number, kind: ContainerKind, name: string, inventory: WorldContainer['inventory'], tags: string[], access: WorldContainer['access'] = 'public'): void {
  world.addContainer({
    id: nextContainerId.v++,
    x: world.wrap(x),
    y: world.wrap(y),
    z: BASE_FLOOR,
    roomId,
    zoneId: world.zoneMap[world.idx(x, y)] ?? 0,
    kind,
    name,
    inventory,
    capacitySlots: Math.max(6, inventory.length + 3),
    access,
    lockDifficulty: access === 'locked' ? 3 : undefined,
    discovered: access !== 'secret',
    tags: ['istinniy_labirint', ...tags],
  });
}

export function placeRewardStashes(world: World, graph: MazeGraph, nextContainerId: { v: number }, roomsByName: Map<string, Room>): void {
  const excluded = new Set(graph.mainPath);
  const deadEnds = deepestDeadEnds(graph, 7, excluded);
  const docRoom = roomsByName.get(DOCUMENT_STASH_ROOM);
  if (docRoom) {
    addContainer(world, nextContainerId, docRoom.x + Math.floor(docRoom.w / 2), docRoom.y + Math.floor(docRoom.h / 2), docRoom.id, ContainerKind.FILING_CABINET, 'Документный ящик без обратной стрелки', [
      { defId: 'note', count: 1, data: 'Записка: белая стена ведет назад, красная хорда ведет быстро, но не всех.' },
      { defId: 'elevator_access_order', count: 1 },
      { defId: 'personal_file_copy', count: 1 },
    ], ['document_stash', 'dead_end', 'reward'], 'secret');
  }

  for (let i = 0; i < deadEnds.length; i++) {
    const p = centerOf(deadEnds[i]);
    addContainer(world, nextContainerId, p.x, p.y, -1, i % 2 === 0 ? ContainerKind.SECRET_STASH : ContainerKind.METAL_CABINET, `Тупиковый тайник нити ${i + 1}`, [
      { defId: i % 2 === 0 ? 'chalk' : 'water', count: 1 },
      { defId: i % 3 === 0 ? 'bandage' : 'bread', count: 1 },
      ...(i === 0 ? [{ defId: 'key', count: 1 }] : []),
    ], ['dead_end', 'reward', i === 0 ? 'chord_key' : 'supply'], i === 0 ? 'locked' : 'secret');
    markAriadneCue(world, p.x, p.y, 1500 + i, 232, 220, 158);
  }
}

export function spawnPlotNpc(
  entities: Entity[],
  nextId: { v: number },
  npcId: string,
  _def: PlotNpcDef,
  x: number,
  y: number,
  angle = 0,
): number {
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, x + 0.5, y + 0.5, {
    angle,
    aiTarget: { x, y },
    extra: { rpg: randomRPG(3) },
  });
  return npc.id;
}

export function spawnMonster(
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  level: number,
): void {
  const def = MONSTERS[kind];
  if (!def) return;
  const hp = scaleMonsterHp(def.hp, level);
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, level),
    sprite: monsterSpr(kind),
    name: def.name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    attackCd: rng(),
    rpg: randomRPG(level),
  });
}

