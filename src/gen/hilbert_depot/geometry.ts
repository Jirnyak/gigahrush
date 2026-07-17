import {
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { ITEMS } from '../../data/catalog';
import { Spr } from '../../render/sprite_index';
import { registerRouteCue } from '../../systems/route_cues';
import { setTerritoryOwnerAtIndex } from '../../systems/territory';
import {
  stampRoom,
} from '../shared';
import { HILBERT_DEPOT_BASE_FLOOR, HILBERT_DEPOT_CARGO_TAG, HILBERT_DEPOT_CHORD_TAG, CURVE_X, CURVE_Y, CONTENT_TAG, SAFE_AISLE_RADIUS, BAY_FIRST_INDEX, ROUTE_GRAPH_ORDER, ROUTE_GRAPH_X, ROUTE_GRAPH_Y, ROUTE_GRAPH_STEP, BLOCK_GRAPH_ORDER, BLOCK_GRAPH_X, BLOCK_GRAPH_Y, BLOCK_GRAPH_STEP, Point, DEPOT_OWNER_SEQUENCE, DEPOT_HQ_SPECS, HilbertDepotState } from "./meta";
import { cargoInventory, addContainer } from "./npcs";

export function expandHilbertDepotRouteGeometry(world: World, rng: () => number): void {
  carveDepotRouteGraph(world);
  buildDepotHqCompounds(world);
  buildDepotIndexBlocks(world, rng);
  repairDepotDoorFrames(world);
  world.markCellsDirty();
  world.markFloorTexDirty();
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
  world.markFogDirty();
}

export function carveSafeCurve(world: World, points: readonly Point[]): void {
  for (let i = 1; i < points.length; i++) {
    carveLine(world, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, SAFE_AISLE_RADIUS, Tex.F_CONCRETE);
  }
}

export function decorateSafeCurve(world: World, points: readonly Point[]): void {
  for (let i = 0; i < points.length; i += 4) {
    const point = points[i];
    const feature =
      i % 32 === 0 ? Feature.SCREEN :
      i % 16 === 0 ? Feature.APPARATUS :
      i % 8 === 0 ? Feature.LAMP :
      Feature.SHELF;
    setFeature(world, point.x, point.y, feature);
  }
}

export function carveDepotRouteGraph(world: World): void {
  const fine = hilbertTracePoints(ROUTE_GRAPH_ORDER, ROUTE_GRAPH_X, ROUTE_GRAPH_Y, ROUTE_GRAPH_STEP);
  for (let i = 1; i < fine.length; i++) {
    const owner = DEPOT_OWNER_SEQUENCE[(i >> 6) % DEPOT_OWNER_SEQUENCE.length];
    carveOwnedLine(world, fine[i - 1].x, fine[i - 1].y, fine[i].x, fine[i].y, 2, depotOwnerFloor(owner, i), owner);
  }

  const coarse = hilbertTracePoints(BLOCK_GRAPH_ORDER, BLOCK_GRAPH_X, BLOCK_GRAPH_Y, BLOCK_GRAPH_STEP);
  for (let i = 1; i < coarse.length; i++) {
    const owner = DEPOT_OWNER_SEQUENCE[i % DEPOT_OWNER_SEQUENCE.length];
    carveOwnedLine(world, coarse[i - 1].x, coarse[i - 1].y, coarse[i].x, coarse[i].y, 4, depotOwnerFloor(owner, i), owner);
  }

  const first = fine[0];
  const last = fine[fine.length - 1];
  carveOwnedLine(world, 0, first.y, first.x, first.y, 3, Tex.F_CONCRETE, ZoneFaction.LIQUIDATOR);
  carveOwnedLine(world, last.x, last.y, W - 1, last.y, 3, Tex.F_CONCRETE, ZoneFaction.LIQUIDATOR);
  carveOwnedLine(world, CURVE_X, CURVE_Y, first.x, first.y, 2, Tex.F_CONCRETE, ZoneFaction.LIQUIDATOR);
  carveOwnedLine(world, last.x, last.y, W - 18, W - 18, 2, Tex.F_CONCRETE, ZoneFaction.WILD);
}

export function buildDepotIndexBlocks(world: World, rng: () => number): void {
  const nodes = hilbertTracePoints(BLOCK_GRAPH_ORDER, BLOCK_GRAPH_X, BLOCK_GRAPH_Y, BLOCK_GRAPH_STEP);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const owner = DEPOT_OWNER_SEQUENCE[(i + ((node.x + node.y) >> 7)) % DEPOT_OWNER_SEQUENCE.length];
    carveOwnedLine(world, node.x - 38, node.y, node.x + 38, node.y, 2, depotOwnerFloor(owner, i), owner);
    carveOwnedLine(world, node.x, node.y - 28, node.x, node.y + 28, 1, depotOwnerFloor(owner, i + 11), owner);
    buildDepotBlockRooms(world, node, owner, i, rng);
  }
}

export function buildDepotBlockRooms(world: World, node: Point, owner: TerritoryOwner, serial: number, rng: () => number): void {
  const skew = Math.round((rng() - 0.5) * 6);
  const label = serial.toString().padStart(2, '0');
  const specs = [
    { type: RoomType.STORAGE, x: node.x - 30, y: node.y - 42 + skew, w: 24, h: 12, name: `Склад Гильберта: верхняя секция Г-${label}`, salt: 1 },
    { type: serial % 5 === 0 ? RoomType.PRODUCTION : RoomType.STORAGE, x: node.x + 4, y: node.y - 42 - skew, w: 24, h: 12, name: `Склад Гильберта: верхний шкаф Г-${label}`, salt: 2 },
    { type: serial % 4 === 0 ? RoomType.OFFICE : RoomType.STORAGE, x: node.x - 30, y: node.y + 30 - skew, w: 24, h: 12, name: `Склад Гильберта: нижняя секция Г-${label}`, salt: 3 },
    { type: serial % 7 === 0 ? RoomType.MEDICAL : RoomType.STORAGE, x: node.x + 4, y: node.y + 30 + skew, w: 24, h: 12, name: `Склад Гильберта: нижний шкаф Г-${label}`, salt: 4 },
    { type: serial % 6 === 0 ? RoomType.COMMON : RoomType.OFFICE, x: node.x - 58, y: node.y - 8, w: 22, h: 13, name: `Склад Гильберта: левая будка Г-${label}`, salt: 5 },
    { type: serial % 8 === 0 ? RoomType.BATHROOM : RoomType.STORAGE, x: node.x + 36, y: node.y - 8, w: 22, h: 13, name: `Склад Гильберта: правая будка Г-${label}`, salt: 6 },
  ] as const;

  for (const spec of specs) {
    const room = tryAddDepotRoom(world, spec.type, spec.x, spec.y, spec.w, spec.h, spec.name, depotOwnerWall(owner), depotOwnerFloor(owner, serial + spec.salt), owner);
    if (!room) continue;
    connectRoomToPoint(world, room, node.x, node.y, DoorState.CLOSED);
    paintDepotRoomOwner(world, room, owner);
    decorateDepotRoom(world, room, serial + spec.salt, owner);
  }
}

export function buildDepotHqCompounds(world: World): void {
  for (const spec of DEPOT_HQ_SPECS) {
    const floorTex = depotOwnerFloor(spec.owner, spec.x + spec.y);
    const center = { x: spec.x + (spec.w >> 1), y: spec.y + spec.h + 25 };
    carveOwnedLine(world, center.x - 58, center.y, center.x + 72, center.y, 3, floorTex, spec.owner);
    carveOwnedLine(world, center.x, center.y - 20, center.x, center.y + 38, 2, floorTex, spec.owner);

    const hq = tryAddDepotRoom(world, RoomType.HQ, spec.x, spec.y, spec.w, spec.h, spec.name, Tex.HERMO_WALL, floorTex, spec.owner);
    if (hq) {
      connectRoomToPoint(world, hq, center.x, center.y, DoorState.HERMETIC_OPEN);
      hardenDepotHqRoom(world, hq, spec.owner);
      paintDepotRoomOwner(world, hq, spec.owner);
      decorateDepotRoom(world, hq, spec.x + spec.y, spec.owner);
    }

    for (let i = 0; i < spec.support.length; i++) {
      const support = spec.support[i];
      const room = tryAddDepotRoom(
        world,
        support.type,
        spec.x + support.dx,
        spec.y + support.dy,
        support.w,
        support.h,
        `${spec.name}: ${support.name}`,
        depotOwnerWall(spec.owner),
        depotOwnerFloor(spec.owner, i + spec.x),
        spec.owner,
      );
      if (!room) continue;
      connectRoomToPoint(world, room, center.x, center.y, DoorState.CLOSED);
      paintDepotRoomOwner(world, room, spec.owner);
      decorateDepotRoom(world, room, i + spec.y, spec.owner);
    }
  }
}

export function addCargoBay(
  world: World,
  state: HilbertDepotState,
  points: readonly Point[],
  order: number,
): void {
  const point = points[order];
  const prev = points[Math.max(0, order - 1)];
  const next = points[Math.min(points.length - 1, order + 1)];
  const dx = Math.sign(next.x - prev.x);
  const normals = dx !== 0
    ? [{ x: 0, y: order % 16 === 0 ? -1 : 1 }, { x: 0, y: order % 16 === 0 ? 1 : -1 }]
    : [{ x: order % 16 === 0 ? 1 : -1, y: 0 }, { x: order % 16 === 0 ? -1 : 1, y: 0 }];
  const w = 12 + ((order >> 3) % 3) * 2;
  const h = 8 + ((order >> 4) % 2) * 2;

  for (const normal of normals) {
    const x = Math.round(point.x + normal.x * 18 - w / 2);
    const y = Math.round(point.y + normal.y * 18 - h / 2);
    if (!canStampRoom(world, x, y, w, h)) continue;
    const label = cargoLabel(order);
    const room = addNamedRoom(world, RoomType.STORAGE, x, y, w, h, `Индексная секция ${label}`, Tex.METAL, Tex.F_CONCRETE);
    connectRoomToPoint(world, room, point.x, point.y, DoorState.CLOSED);
    decorateCargoRoom(world, room, order);
    const container = addContainer(
      world,
      room,
      order,
      order % 5 === 0 ? ContainerKind.SAFE : order % 3 === 0 ? ContainerKind.METAL_CABINET : ContainerKind.TOOL_LOCKER,
      `Индексный груз ${label}`,
      cargoInventory(order),
      order % 5 === 0 ? 'locked' : order % 3 === 0 ? 'owner' : 'room',
      [
        CONTENT_TAG,
        HILBERT_DEPOT_CARGO_TAG,
        'safe_curve_order',
        `hilbert_order_${order.toString().padStart(3, '0')}`,
        order < 80 ? 'cargo_index_low' : order < 168 ? 'cargo_index_mid' : 'cargo_index_high',
      ],
    );
    state.cargoContainerIds.push(container.id);
    state.cargoOrders.push(order);
    return;
  }
}

export function decorateCargoRoom(world: World, room: Room, order: number): void {
  for (let x = room.x + 2; x < room.x + room.w - 1; x += 3) {
    setFeature(world, x, room.y + 1, Feature.SHELF);
  }
  for (let y = room.y + 3; y < room.y + room.h - 1; y += 3) {
    setFeature(world, room.x + room.w - 2, y, order % 5 === 0 ? Feature.SCREEN : Feature.SHELF);
  }
  if (order % 4 === 0) setFeature(world, room.x + 2, room.y + room.h - 2, Feature.LAMP);
}

export function addDepotChords(world: World, state: HilbertDepotState, points: readonly Point[]): void {
  for (const pair of selectChordPairs(points, 6)) {
    const cells = carveChord(world, points[pair.fromIndex], points[pair.toIndex]);
    const doors = placeChordDoors(world, cells);
    if (doors.length === 0) continue;
    state.lockedChordDoorCells.push(...doors);
    state.chords.push({ ...pair, doorCells: doors });
    const mid = cells[(cells.length / 2) | 0];
    if (mid !== undefined) {
      const x = mid % W;
      const y = (mid / W) | 0;
      setFeature(world, x, y, Feature.SCREEN);
    }
  }
}

export function selectChordPairs(points: readonly Point[], count: number): { fromIndex: number; toIndex: number }[] {
  const out: { fromIndex: number; toIndex: number }[] = [];
  const used = new Set<number>();
  const nearUsed = (idx: number): boolean => {
    for (let i = idx - 7; i <= idx + 7; i++) if (used.has(i)) return true;
    return false;
  };
  for (let fromIndex = 6; fromIndex < points.length - 6 && out.length < count; fromIndex += 3) {
    if (nearUsed(fromIndex)) continue;
    for (let toIndex = fromIndex + 31; toIndex < points.length - 6; toIndex++) {
      if (nearUsed(toIndex)) continue;
      const dist = Math.abs(points[fromIndex].x - points[toIndex].x) + Math.abs(points[fromIndex].y - points[toIndex].y);
      if (dist < 48 || dist > 96) continue;
      out.push({ fromIndex, toIndex });
      for (let i = fromIndex - 7; i <= fromIndex + 7; i++) used.add(i);
      for (let i = toIndex - 7; i <= toIndex + 7; i++) used.add(i);
      break;
    }
  }
  return out;
}

export function carveChord(world: World, a: Point, b: Point): number[] {
  const cells: number[] = [];
  const push = (x: number, y: number): void => {
    openCell(world, x, y, Tex.F_TILE);
    const ci = world.idx(x, y);
    if (cells[cells.length - 1] !== ci) cells.push(ci);
  };
  let x = a.x;
  let y = a.y;
  push(x, y);
  const dx = Math.sign(b.x - a.x);
  while (x !== b.x) {
    x += dx;
    push(x, y);
  }
  const dy = Math.sign(b.y - a.y);
  while (y !== b.y) {
    y += dy;
    push(x, y);
  }
  return cells;
}

export function placeChordDoors(world: World, cells: readonly number[]): number[] {
  const doors: number[] = [];
  const startDoor = findChordDoorCell(world, cells, false);
  const endDoor = findChordDoorCell(world, cells, true);
  if (startDoor >= 0) doors.push(setLockedChordDoor(world, startDoor));
  if (endDoor >= 0 && endDoor !== startDoor) doors.push(setLockedChordDoor(world, endDoor));
  return doors;
}

export function findChordDoorCell(world: World, cells: readonly number[], reverse: boolean): number {
  const start = reverse ? cells.length - 4 : 3;
  const end = reverse ? 2 : cells.length - 3;
  const step = reverse ? -1 : 1;
  for (let k = start; reverse ? k >= end : k <= end; k += step) {
    const prev = cells[k - 1];
    const cur = cells[k];
    const next = cells[k + 1];
    if (prev === undefined || cur === undefined || next === undefined) continue;
    const px = prev % W;
    const py = (prev / W) | 0;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    const nx = next % W;
    const ny = (next / W) | 0;
    if (!((px === cx && cx === nx) || (py === cy && cy === ny))) continue;
    const horizontal = py === cy && cy === ny;
    const sideA = horizontal ? world.idx(cx, cy - 1) : world.idx(cx - 1, cy);
    const sideB = horizontal ? world.idx(cx, cy + 1) : world.idx(cx + 1, cy);
    if (world.cells[sideA] === Cell.WALL && world.cells[sideB] === Cell.WALL) return cur;
  }
  return -1;
}

export function setLockedChordDoor(world: World, idx: number): number {
  world.cells[idx] = Cell.DOOR;
  world.wallTex[idx] = Tex.DOOR_METAL;
  world.doors.set(idx, {
    idx,
    state: DoorState.LOCKED,
    roomA: -1,
    roomB: -1,
    keyId: 'key',
    timer: 0,
  });
  return idx;
}

export function registerHilbertDepotRouteCues(
  world: World,
  state: HilbertDepotState,
  points: readonly Point[],
  entry: Room,
  exit: Room,
): void {
  const firstCargoOrder = state.cargoOrders[0] ?? BAY_FIRST_INDEX;
  const firstCargo = points[firstCargoOrder];
  registerRouteCue(world, {
    id: 'hilbert_depot_safe_curve_order',
    x: entry.x + entry.w - 3.5,
    y: entry.y + 7.5,
    targetX: firstCargo.x + 0.5,
    targetY: firstCargo.y + 0.5,
    z: HILBERT_DEPOT_BASE_FLOOR,
    roomId: entry.id,
    targetRoomId: world.roomMap[world.idx(firstCargo.x, firstCargo.y)],
    zoneId: world.zoneMap[world.idx(entry.x + entry.w - 3, entry.y + 7)],
    label: 'индексная кривая',
    hint: 'безопасный проход идет по росту номера Г, а не по ближайшей двери',
    targetName: 'первый индексный груз',
    color: '#b7f08a',
    tags: [CONTENT_TAG, 'hilbert_order', 'safe_curve', 'route_teach'],
    toneSeed: 76001,
    radius: 11,
    targetRadius: 5,
    cooldownSec: 38,
    heardText: 'Склад шепчет номером: Г-000, Г-008, Г-016. Ближайший ящик может быть поздним.',
    followedText: 'Первый индекс найден. Дальше безопаснее идти по росту Г-номера.',
    ignoredText: 'Вы ушли от индексной кривой: хорды короче глазами, но длиннее по складу.',
  });

  const chord = state.chords[0];
  if (chord) {
    const from = points[chord.fromIndex];
    const to = points[chord.toIndex];
    registerRouteCue(world, {
      id: 'hilbert_depot_locked_chord_cut',
      x: from.x + 0.5,
      y: from.y + 0.5,
      targetX: to.x + 0.5,
      targetY: to.y + 0.5,
      z: HILBERT_DEPOT_BASE_FLOOR,
      zoneId: world.zoneMap[world.idx(from.x, from.y)],
      label: 'запертая хорда',
      hint: 'решетка режет десятки индексов, но открывает чужой учет и охрану',
      targetName: 'дальний номер без обхода',
      color: '#ffd35f',
      tags: [CONTENT_TAG, HILBERT_DEPOT_CHORD_TAG, 'shortcut', 'theft'],
      toneSeed: 76077,
      radius: 9,
      targetRadius: 5,
      cooldownSec: 44,
      heardText: 'За решеткой хорда: короткий металл к дальнему номеру, но замок числит это кражей маршрута.',
      followedText: 'Хорда срезала индексный путь. Склад стал быстрее и злее.',
      ignoredText: 'Запертая хорда осталась рядом. Без нее придется идти по честной кривой.',
    });
  }

  registerRouteCue(world, {
    id: 'hilbert_depot_exit_index_tail',
    x: points[points.length - 9].x + 0.5,
    y: points[points.length - 9].y + 0.5,
    targetX: exit.x + 2.5,
    targetY: exit.y + 7.5,
    z: HILBERT_DEPOT_BASE_FLOOR,
    roomId: exit.id,
    targetRoomId: exit.id,
    zoneId: world.zoneMap[world.idx(exit.x + 2, exit.y + 7)],
    label: 'конец индекса',
    hint: 'последние Г-номера выводят к дальней приемке и нижнему лифту',
    targetName: 'дальний лифт склада',
    color: '#8cf',
    tags: [CONTENT_TAG, 'hilbert_order', 'exit', 'lift'],
    toneSeed: 76131,
    radius: 10,
    targetRadius: 4,
    cooldownSec: 40,
    heardText: 'Хвост индекса ведет к дальней приемке. Тут выход ниже, если не резать новую хорду.',
    followedText: 'Дальняя приемка найдена. Нижний лифт рядом с последними Г-номерами.',
    ignoredText: 'Конец индекса остался за спиной, а склад снова считает из начала.',
  });
}

export function addItemDrop(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  defId: string,
  count = 1,
  data?: unknown,
): void {
  if (!ITEMS[defId]) return;
  openCell(world, x, y, Tex.F_CONCRETE);
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

export function addNamedRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      world.wallTex[ci] = wallTex;
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) world.floorTex[ci] = floorTex;
    }
  }
  return room;
}

export function tryAddDepotRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  owner: TerritoryOwner,
): Room | null {
  if (!canStampDepotRoom(world, x, y, w, h)) return null;
  const room = addNamedRoom(world, type, x, y, w, h, name, wallTex, floorTex);
  paintDepotRoomOwner(world, room, owner);
  return room;
}

export function canStampDepotRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  if (x < 4 || y < 4 || x + w >= W - 4 || y + h >= W - 4) return false;
  for (const room of world.rooms) {
    if (!room) continue;
    if (x + w < room.x - 2 || room.x + room.w + 2 < x || y + h < room.y - 2 || room.y + room.h + 2 < y) continue;
    return false;
  }
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR || world.hermoWall[idx]) return false;
      if (world.containerMap.has(idx)) return false;
    }
  }
  return true;
}

export function paintDepotRoomOwner(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id) setTerritoryOwnerAtIndex(world, idx, owner);
    }
  }
  for (const idx of room.doors) setTerritoryOwnerAtIndex(world, idx, owner);
}

export function hardenDepotHqRoom(world: World, room: Room, owner: TerritoryOwner): void {
  room.type = RoomType.HQ;
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) {
        if (world.roomMap[idx] === room.id) {
          world.floorTex[idx] = room.floorTex;
          setTerritoryOwnerAtIndex(world, idx, owner);
        }
        continue;
      }
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
      setTerritoryOwnerAtIndex(world, idx, owner);
    }
  }
  for (const idx of room.doors) {
    const door = world.doors.get(idx);
    if (!door) continue;
    door.state = DoorState.HERMETIC_OPEN;
    world.wallTex[idx] = Tex.HERMO_WALL;
    world.hermoWall[idx] = 1;
    setTerritoryOwnerAtIndex(world, idx, owner);
  }
  if (!room.doors.some(idx => world.doors.get(idx)?.state === DoorState.HERMETIC_OPEN)) {
    ensureDepotHqDoor(world, room, owner);
  }
}

export function ensureDepotHqDoor(world: World, room: Room, owner: TerritoryOwner): void {
  const passable = (idx: number): boolean => {
    const cell = world.cells[idx];
    return cell === Cell.FLOOR || cell === Cell.WATER || cell === Cell.DOOR;
  };
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const x = room.x + dx;
      const y = room.y + dy;
      const idx = world.idx(x, y);
      if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT) continue;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const inside = world.idx(x - ddx, y - ddy);
        const outside = world.idx(x + ddx, y + ddy);
        if (world.roomMap[inside] !== room.id || !passable(outside)) continue;
        world.cells[idx] = Cell.DOOR;
        world.wallTex[idx] = Tex.HERMO_WALL;
        world.hermoWall[idx] = 1;
        world.doors.set(idx, { idx, state: DoorState.HERMETIC_OPEN, roomA: room.id, roomB: -1, keyId: '', timer: 0 });
        if (!room.doors.includes(idx)) room.doors.push(idx);
        setTerritoryOwnerAtIndex(world, idx, owner);
        const jambA = world.idx(x + ddy, y + ddx);
        const jambB = world.idx(x - ddy, y - ddx);
        for (const jamb of [jambA, jambB]) {
          if (world.aptMask[jamb] || world.cells[jamb] === Cell.LIFT || world.cells[jamb] === Cell.DOOR || world.roomMap[jamb] >= 0) continue;
          world.cells[jamb] = Cell.WALL;
          world.wallTex[jamb] = Tex.HERMO_WALL;
          world.hermoWall[jamb] = 1;
          setTerritoryOwnerAtIndex(world, jamb, owner);
        }
        return;
      }
    }
  }
}

export function decorateDepotRoom(world: World, room: Room, serial: number, owner: TerritoryOwner): void {
  switch (room.type) {
    case RoomType.KITCHEN:
      setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
      setFeature(world, room.x + room.w - 4, room.y + 2, Feature.SINK);
      setFeature(world, room.x + (room.w >> 1), room.y + room.h - 3, Feature.TABLE);
      break;
    case RoomType.BATHROOM:
      setFeature(world, room.x + 2, room.y + 2, Feature.TOILET);
      setFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.SINK);
      break;
    case RoomType.MEDICAL:
      setFeature(world, room.x + 3, room.y + 2, Feature.BED);
      setFeature(world, room.x + room.w - 4, room.y + 2, Feature.APPARATUS);
      break;
    case RoomType.PRODUCTION:
      setFeature(world, room.x + 3, room.y + 2, Feature.MACHINE);
      setFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.APPARATUS);
      break;
    case RoomType.OFFICE:
    case RoomType.HQ:
      setFeature(world, room.x + 2, room.y + 2, Feature.DESK);
      setFeature(world, room.x + 4, room.y + 2, Feature.SCREEN);
      setFeature(world, room.x + room.w - 4, room.y + room.h - 3, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.LAMP);
      break;
    case RoomType.SMOKING:
      setFeature(world, room.x + 2, room.y + 2, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.CHAIR);
      setFeature(world, room.x + room.w - 4, room.y + 2, Feature.TABLE);
      break;
    case RoomType.STORAGE:
    default:
      for (let x = room.x + 2; x < room.x + room.w - 2; x += 4) setFeature(world, x, room.y + 2, Feature.SHELF);
      setFeature(world, room.x + room.w - 4, room.y + room.h - 3, serial % 3 === 0 ? Feature.SCREEN : Feature.LAMP);
      break;
  }
}

export function repairDepotDoorFrames(world: World): void {
  for (const [idx, door] of world.doors) {
    const room = world.rooms[door.roomA] ?? world.rooms[door.roomB];
    if (!room) continue;
    const x = idx % W;
    const y = (idx / W) | 0;
    const left = world.idx(x - 1, y);
    const right = world.idx(x + 1, y);
    const up = world.idx(x, y - 1);
    const down = world.idx(x, y + 1);
    const vertical = world.roomMap[up] >= 0 || world.roomMap[down] >= 0;
    const jambs = vertical ? [left, right] : [up, down];
    for (const jamb of jambs) {
      if (world.cells[jamb] !== Cell.WALL || world.aptMask[jamb]) continue;
      world.wallTex[jamb] = door.state === DoorState.HERMETIC_OPEN || door.state === DoorState.HERMETIC_CLOSED ? Tex.HERMO_WALL : room.wallTex;
    }
  }
}

export function canStampRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] !== Cell.WALL || world.aptMask[ci]) return false;
    }
  }
  return true;
}

export function connectRoomToPoint(world: World, room: Room, targetX: number, targetY: number, state: DoorState, keyId = ''): number {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  const dx = targetX - cx;
  const dy = targetY - cy;
  let doorX = cx;
  let doorY = cy;
  let outX = cx;
  let outY = cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    doorY = Math.max(room.y + 1, Math.min(room.y + room.h - 2, targetY));
    if (dx >= 0) {
      doorX = room.x + room.w;
      outX = doorX + 1;
    } else {
      doorX = room.x - 1;
      outX = doorX - 1;
    }
    outY = doorY;
  } else {
    doorX = Math.max(room.x + 1, Math.min(room.x + room.w - 2, targetX));
    if (dy >= 0) {
      doorY = room.y + room.h;
      outY = doorY + 1;
    } else {
      doorY = room.y - 1;
      outY = doorY - 1;
    }
    outX = doorX;
  }

  const doorId = addDoor(world, room, doorX, doorY, state, keyId);
  carveLine(world, outX, outY, targetX, targetY, 0, room.floorTex);
  return doorId;
}

export function addDoor(world: World, room: Room, x: number, y: number, state: DoorState, keyId = ''): number {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.DOOR;
  world.wallTex[ci] = room.wallTex;
  world.doors.set(ci, { idx: ci, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  if (!room.doors.includes(ci)) room.doors.push(ci);
  return ci;
}

export function placeLift(world: World, x: number, y: number, direction: LiftDirection): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.liftDir[ci] = direction;
  setFeature(world, x + (direction === LiftDirection.UP ? 1 : -1), y, Feature.LIFT_BUTTON);
  world.liftDir[world.idx(x + (direction === LiftDirection.UP ? 1 : -1), y)] = direction;
}

export function carveLine(world: World, ax: number, ay: number, bx: number, by: number, radius: number, floorTex: Tex): void {
  let x = ax;
  let y = ay;
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  openBrush(world, x, y, radius, floorTex);
  while (x !== bx) {
    x += dx;
    openBrush(world, x, y, radius, floorTex);
  }
  while (y !== by) {
    y += dy;
    openBrush(world, x, y, radius, floorTex);
  }
}

export function carveOwnedLine(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  owner: TerritoryOwner,
): void {
  let x = world.wrap(ax);
  let y = world.wrap(ay);
  const targetX = world.wrap(bx);
  const targetY = world.wrap(by);
  const dx = Math.sign(world.delta(targetX, x));
  const dy = Math.sign(world.delta(targetY, y));
  openOwnedBrush(world, x, y, width, floorTex, owner);
  while (x !== targetX) {
    x = world.wrap(x + dx);
    openOwnedBrush(world, x, y, width, floorTex, owner);
  }
  while (y !== targetY) {
    y = world.wrap(y + dy);
    openOwnedBrush(world, x, y, width, floorTex, owner);
  }
}

export function openBrush(world: World, x: number, y: number, radius: number, floorTex: Tex): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      openCell(world, x + dx, y + dy, floorTex);
    }
  }
}

export function openOwnedBrush(world: World, x: number, y: number, radius: number, floorTex: Tex, owner: TerritoryOwner): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > (radius + 0.4) * (radius + 0.4)) continue;
      openOwnedCell(world, x + dx, y + dy, floorTex, owner);
    }
  }
}

export function openCell(world: World, x: number, y: number, floorTex: Tex): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.LIFT) return;
  world.cells[ci] = Cell.FLOOR;
  world.floorTex[ci] = floorTex;
  if (world.roomMap[ci] < 0) world.wallTex[ci] = Tex.METAL;
}

export function openOwnedCell(world: World, x: number, y: number, floorTex: Tex, owner: TerritoryOwner): void {
  const idx = world.idx(x, y);
  if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR || world.hermoWall[idx]) return;
  if (world.roomMap[idx] >= 0) return;
  world.cells[idx] = Cell.FLOOR;
  world.roomMap[idx] = -1;
  world.floorTex[idx] = floorTex;
  world.wallTex[idx] = Tex.METAL;
  setTerritoryOwnerAtIndex(world, idx, owner);
  if (world.features[idx] !== Feature.LIFT_BUTTON) world.features[idx] = Feature.NONE;
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.WALL || world.cells[ci] === Cell.LIFT) return;
  world.features[ci] = feature;
}

export function roomCell(room: Room, salt: number): Point {
  const w = Math.max(1, room.w - 4);
  const h = Math.max(1, room.h - 4);
  return {
    x: room.x + 2 + ((salt * 5) % w),
    y: room.y + 2 + ((salt * 3) % h),
  };
}

export function uniqueTags(tags: readonly string[]): string[] {
  return tags.filter((tag, index, all) => all.indexOf(tag) === index);
}

export function cargoLabel(order: number): string {
  return `Г-${order.toString().padStart(3, '0')}`;
}

export function depotOwnerFloor(owner: TerritoryOwner, serial: number): Tex {
  if (owner === ZoneFaction.SCIENTIST) return Tex.F_TILE;
  if (owner === ZoneFaction.CITIZEN) return serial % 2 === 0 ? Tex.F_LINO : Tex.F_CONCRETE;
  if (owner === ZoneFaction.CULTIST) return Tex.F_CARPET;
  if (owner === ZoneFaction.WILD) return serial % 3 === 0 ? Tex.F_TILE : Tex.F_CONCRETE;
  return serial % 5 === 0 ? Tex.F_TILE : Tex.F_CONCRETE;
}

export function depotOwnerWall(owner: TerritoryOwner): Tex {
  if (owner === ZoneFaction.SCIENTIST) return Tex.TILE_W;
  if (owner === ZoneFaction.CITIZEN) return Tex.PANEL;
  if (owner === ZoneFaction.CULTIST) return Tex.CROSS;
  if (owner === ZoneFaction.WILD) return Tex.ROTTEN;
  return Tex.METAL;
}

export function hilbertTracePoints(order: number, x: number, y: number, step: number): Point[] {
  const n = 1 << order;
  const points: Point[] = [];
  for (let d = 0; d < n * n; d++) {
    const p = hilbertIndexToPoint(n, d);
    points.push({ x: x + p.x * step, y: y + p.y * step });
  }
  return points;
}

export function hilbertIndexToPoint(n: number, d: number): Point {
  let rx = 0;
  let ry = 0;
  let t = d;
  let x = 0;
  let y = 0;
  for (let s = 1; s < n; s <<= 1) {
    rx = 1 & (t >> 1);
    ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const swap = x;
      x = y;
      y = swap;
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return { x, y };
}

