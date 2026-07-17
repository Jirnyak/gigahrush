import {
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Faction,
  Feature,
  LiftDirection,
  MonsterKind,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { Spr } from '../../render/sprite_index';
import { registerRouteCue } from '../../systems/route_cues';
import { syncZoneMetadataFromTerritory } from '../../systems/territory';
import { carveCorridor, generateZones, stampRoom } from '../shared';
import { CAYLEY_BYURO_BASE_FLOOR, CayleyElement, CayleyGenerator, CayleyCoset, CAYLEY_BYURO_ROOM_NAMES, CAYLEY_NEXT, CayleyByuroState, Point, CayleyHqSpec, CAYLEY_GRAPH_POINTS, CAYLEY_LATTICE_X, CAYLEY_LATTICE_Y, CAYLEY_TERRITORY_GRID, CAYLEY_HQ_SPECS, CLERK_DEF, COSET_DEF, INSPECTOR_DEF } from "./meta";
import { spawnNpc, spawnMonster, addContainer } from "./npcs";

export function cayleyApplyFormSequence(sequence: readonly CayleyGenerator[], start: CayleyElement = 'e'): CayleyElement {
  let current = start;
  for (const generator of sequence) current = CAYLEY_NEXT[generator][current];
  return current;
}

export function cayleyCosetOf(element: CayleyElement): CayleyCoset {
  return element === 'e' || element === 'r' || element === 'rr' ? 'even' : 'odd';
}

export function styleRoom(world: World, room: Room, wallTex: Tex, floorTex: Tex): Room {
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) {
        world.floorTex[ci] = floorTex;
      } else {
        world.wallTex[ci] = wallTex;
      }
    }
  }
  return room;
}

export function addRoom(
  world: World,
  id: number,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex = Tex.MARBLE,
  floorTex = Tex.F_PARQUET,
): Room {
  const room = stampRoom(world, id, type, x, y, w, h, -1);
  room.name = name;
  return styleRoom(world, room, wallTex, floorTex);
}

export function roomCoord(value: number, size: number): number {
  return Math.max(2, Math.min(W - size - 3, Math.round(value)));
}

export function addAutoRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex = Tex.MARBLE,
  floorTex = Tex.F_PARQUET,
): Room {
  return addRoom(world, world.rooms.length, type, roomCoord(x, w), roomCoord(y, h), w, h, name, wallTex, floorTex);
}

export function canStampGeneratedRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  const rx = roomCoord(x, w);
  const ry = roomCoord(y, h);
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      if (world.aptMask[ci] || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR || world.roomMap[ci] >= 0) return false;
    }
  }
  return true;
}

export function tryAddAutoRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex = Tex.MARBLE,
  floorTex = Tex.F_PARQUET,
): Room | null {
  if (!canStampGeneratedRoom(world, x, y, w, h)) return null;
  return addAutoRoom(world, type, x, y, w, h, name, wallTex, floorTex);
}

export function center(room: Room): { x: number; y: number } {
  return {
    x: worldClamp(room.x + Math.floor(room.w / 2)),
    y: worldClamp(room.y + Math.floor(room.h / 2)),
  };
}

export function worldClamp(value: number): number {
  return Math.max(0, Math.min(W - 1, value));
}

export function setCellFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR && world.features[ci] === Feature.NONE) world.features[ci] = feature;
}

export function carveCayleyDisc(world: World, cx: number, cy: number, radius: number, wallTex: Tex, floorTex: Tex): void {
  const floorR2 = radius * radius;
  const shoulder = radius + 2;
  const shoulderR2 = shoulder * shoulder;
  for (let dy = -shoulder; dy <= shoulder; dy++) {
    for (let dx = -shoulder; dx <= shoulder; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > shoulderR2) continue;
      const ci = world.idx(cx + dx, cy + dy);
      if (world.aptMask[ci] || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR || world.roomMap[ci] >= 0) continue;
      if (d2 <= floorR2) {
        world.cells[ci] = Cell.FLOOR;
        world.floorTex[ci] = floorTex;
        world.wallTex[ci] = wallTex;
        world.features[ci] = Feature.NONE;
        world.hermoWall[ci] = 0;
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
        world.features[ci] = Feature.NONE;
      }
    }
  }
}

export function carveCayleySegment(world: World, a: Point, b: Point, radius: number, wallTex: Tex, floorTex: Tex): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(1, Math.abs(dx), Math.abs(dy));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = Math.round(a.x + dx * t);
    const y = Math.round(a.y + dy * t);
    carveCayleyDisc(world, x, y, radius, wallTex, floorTex);
    if (step % 47 === 0) setCellFeature(world, x, y, step % 94 === 0 ? Feature.SCREEN : Feature.SHELF);
  }
}

export function carveCayleyPolyline(world: World, points: readonly Point[], radius: number, wallTex: Tex, floorTex: Tex): void {
  for (let i = 1; i < points.length; i++) carveCayleySegment(world, points[i - 1], points[i], radius, wallTex, floorTex);
}

export function carveCayleyGraphField(world: World): void {
  for (const y of CAYLEY_LATTICE_Y) carveCayleySegment(world, { x: 0, y }, { x: W - 1, y }, 2, Tex.MARBLE, Tex.F_PARQUET);
  for (const x of CAYLEY_LATTICE_X) carveCayleySegment(world, { x, y: 0 }, { x, y: W - 1 }, 2, Tex.MARBLE, Tex.F_PARQUET);

  for (const [a, b] of [['e', 'r'], ['r', 'rr'], ['rr', 'e'], ['s', 'sr'], ['sr', 'srr'], ['srr', 's']] as const) {
    carveCayleySegment(world, CAYLEY_GRAPH_POINTS[a], CAYLEY_GRAPH_POINTS[b], 5, Tex.MARBLE, Tex.F_GREEN_CARPET);
  }
  for (const [a, b] of [['e', 's'], ['r', 'srr'], ['rr', 'sr']] as const) {
    carveCayleySegment(world, CAYLEY_GRAPH_POINTS[a], CAYLEY_GRAPH_POINTS[b], 4, Tex.METAL, Tex.F_RED_CARPET);
  }

  const centerPoint = { x: 512, y: 502 };
  carveCayleyPolyline(world, [
    { x: 0, y: centerPoint.y },
    centerPoint,
    { x: W - 1, y: centerPoint.y },
  ], 3, Tex.MARBLE, Tex.F_MARBLE_TILE);
  carveCayleyPolyline(world, [
    { x: centerPoint.x, y: 0 },
    centerPoint,
    { x: centerPoint.x, y: W - 1 },
  ], 3, Tex.MARBLE, Tex.F_MARBLE_TILE);

  for (const element of ['e', 'r', 'rr', 's', 'sr', 'srr'] as const) {
    const p = CAYLEY_GRAPH_POINTS[element];
    carveCayleyDisc(world, p.x, p.y, 28, Tex.MARBLE, Tex.F_MARBLE_TILE);
    setCellFeature(world, p.x, p.y, cayleyCosetOf(element) === 'odd' ? Feature.SCREEN : Feature.DESK);
  }
}

export function connectRooms(
  world: World,
  a: Room,
  b: Room,
  state: CayleyByuroState,
  kind: 'plain' | 'generator_r' | 'quotient',
): void {
  const before = new Set([...a.doors, ...b.doors]);
  const ac = center(a);
  const bc = center(b);
  carveCorridor(world, ac.x, ac.y, bc.x, bc.y);

  const newDoorIds = [...a.doors, ...b.doors].filter(idx => !before.has(idx));
  for (const idx of newDoorIds) {
    const door = world.doors.get(idx);
    if (!door) continue;
    world.wallTex[idx] = Tex.DOOR_METAL;
    if (kind === 'generator_r') {
      door.state = DoorState.LOCKED;
      door.keyId = 'key';
      state.generatorDoorIds.push(idx);
    } else if (kind === 'quotient') {
      door.state = DoorState.LOCKED;
      door.keyId = 'forged_permit_slip';
      state.quotientShortcutDoorIds.push(idx);
    } else {
      door.state = DoorState.CLOSED;
      door.keyId = '';
    }
  }
}

export function carveShortcutCell(world: World, x: number, y: number): void {
  const ci = world.idx(x, y);
  if (world.aptMask[ci] || world.roomMap[ci] >= 0) return;
  world.cells[ci] = Cell.FLOOR;
  world.floorTex[ci] = Tex.F_CONCRETE;
  world.features[ci] = 0;
}

export function carveOrthogonalShortcut(world: World, ax: number, ay: number, bx: number, by: number): void {
  const stepX = ax <= bx ? 1 : -1;
  for (let x = ax; x !== bx; x += stepX) carveShortcutCell(world, x, ay);
  carveShortcutCell(world, bx, ay);

  const stepY = ay <= by ? 1 : -1;
  for (let y = ay; y !== by; y += stepY) carveShortcutCell(world, bx, y);
  carveShortcutCell(world, bx, by);
}

export function placeBoundaryDoor(
  world: World,
  room: Room,
  wx: number,
  wy: number,
  outsideX: number,
  outsideY: number,
  state: DoorState,
  keyId: string,
  list?: number[],
): number {
  const idx = world.idx(wx, wy);
  const outsideIdx = world.idx(outsideX, outsideY);
  const verticalWallDoor = wx === room.x - 1 || wx === room.x + room.w;
  const blockers = verticalWallDoor ? [[0, -1], [0, 1]] as const : [[-1, 0], [1, 0]] as const;

  for (const [dx, dy] of blockers) {
    const bi = world.idx(wx + dx, wy + dy);
    if (world.roomMap[bi] < 0 && bi !== outsideIdx) {
      world.cells[bi] = Cell.WALL;
      world.wallTex[bi] = room.wallTex;
    }
  }

  carveShortcutCell(world, outsideX, outsideY);
  world.cells[idx] = Cell.DOOR;
  world.wallTex[idx] = Tex.DOOR_METAL;
  world.doors.set(idx, { idx, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  if (!room.doors.includes(idx)) room.doors.push(idx);
  if (list && !list.includes(idx)) list.push(idx);
  return idx;
}

export function addQuotientShortcut(world: World, rooms: ReturnType<typeof createRooms>, state: CayleyByuroState): void {
  const qy = rooms.quotient.y + Math.floor(rooms.quotient.h / 2);
  const sy = rooms.srr.y + Math.floor(rooms.srr.h / 2);
  const qDoorX = rooms.quotient.x - 1;
  const qOutsideX = rooms.quotient.x - 2;
  const sDoorX = rooms.srr.x - 1;
  const sOutsideX = rooms.srr.x - 2;

  carveOrthogonalShortcut(world, qOutsideX, qy, sOutsideX, sy);
  placeBoundaryDoor(world, rooms.quotient, qDoorX, qy, qOutsideX, qy, DoorState.LOCKED, 'forged_permit_slip', state.quotientShortcutDoorIds);
  placeBoundaryDoor(world, rooms.srr, sDoorX, sy, sOutsideX, sy, DoorState.CLOSED, '');
}

export function placeLift(world: World, x: number, y: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const li = world.idx(x, y);
  world.cells[li] = Cell.LIFT;
  world.wallTex[li] = Tex.LIFT_DOOR;
  world.liftDir[li] = direction;
  const bi = world.idx(buttonX, buttonY);
  if (world.cells[bi] === Cell.FLOOR) world.features[bi] = Feature.LIFT_BUTTON;
  world.liftDir[bi] = direction;
}

export function setFeature(world: World, room: Room, dx: number, dy: number, feature: Feature): void {
  const x = room.x + dx;
  const y = room.y + dy;
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR) world.features[ci] = feature;
}

export function decorateRoom(world: World, room: Room, element?: CayleyElement): void {
  for (let x = 3; x < room.w - 3; x += 7) setFeature(world, room, x, 3, Feature.DESK);
  for (let y = 6; y < room.h - 3; y += 6) setFeature(world, room, 3, y, Feature.SHELF);
  setFeature(world, room, room.w - 4, 3, Feature.LAMP);
  if (element && cayleyCosetOf(element) === 'odd') setFeature(world, room, room.w - 5, room.h - 5, Feature.SCREEN);
}

export function decorateGeneratedRoom(world: World, room: Room, serial: number): void {
  switch (room.type) {
    case RoomType.KITCHEN:
      for (let x = 2; x < room.w - 2; x += 5) setFeature(world, room, x, 2, Feature.STOVE);
      setFeature(world, room, room.w - 4, room.h - 3, Feature.SINK);
      setFeature(world, room, 3, room.h - 3, Feature.TABLE);
      break;
    case RoomType.BATHROOM:
      for (let x = 2; x < room.w - 2; x += 5) setFeature(world, room, x, 2, Feature.SINK);
      setFeature(world, room, room.w - 4, room.h - 3, Feature.TOILET);
      break;
    case RoomType.MEDICAL:
      for (let x = 3; x < room.w - 3; x += 7) setFeature(world, room, x, 3, Feature.APPARATUS);
      setFeature(world, room, room.w - 4, room.h - 4, Feature.SCREEN);
      break;
    case RoomType.PRODUCTION:
      for (let x = 3; x < room.w - 3; x += 6) setFeature(world, room, x, 3, Feature.MACHINE);
      for (let x = 5; x < room.w - 4; x += 8) setFeature(world, room, x, room.h - 4, Feature.APPARATUS);
      break;
    case RoomType.STORAGE:
      for (let y = 2; y < room.h - 2; y += 4) {
        setFeature(world, room, 2, y, Feature.SHELF);
        setFeature(world, room, room.w - 3, y, Feature.SHELF);
      }
      break;
    case RoomType.HQ:
      for (let x = 4; x < room.w - 4; x += 8) setFeature(world, room, x, 4, Feature.DESK);
      setFeature(world, room, room.w - 5, 4, Feature.SCREEN);
      setFeature(world, room, 4, room.h - 5, Feature.LAMP);
      break;
    case RoomType.COMMON:
      for (let x = 4; x < room.w - 4; x += 10) setFeature(world, room, x, room.h >> 1, Feature.TABLE);
      setFeature(world, room, room.w - 5, 4, Feature.LAMP);
      break;
    case RoomType.OFFICE:
    default:
      for (let x = 3; x < room.w - 3; x += 6) setFeature(world, room, x, 3, serial % 3 === 0 ? Feature.SCREEN : Feature.DESK);
      setFeature(world, room, room.w - 4, room.h - 4, Feature.SHELF);
      break;
  }
}

export function connectRoomToPoint(world: World, room: Room, target: Point, state?: DoorState, keyId = ''): void {
  const c = center(room);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  let wx: number;
  let wy: number;
  let ox: number;
  let oy: number;

  if (Math.abs(dx) >= Math.abs(dy)) {
    wy = worldClamp(room.y + Math.max(1, Math.min(room.h - 2, Math.round(target.y - room.y))));
    if (dx >= 0) {
      wx = room.x + room.w;
      ox = wx + 1;
    } else {
      wx = room.x - 1;
      ox = wx - 1;
    }
    oy = wy;
  } else {
    wx = worldClamp(room.x + Math.max(1, Math.min(room.w - 2, Math.round(target.x - room.x))));
    if (dy >= 0) {
      wy = room.y + room.h;
      oy = wy + 1;
    } else {
      wy = room.y - 1;
      oy = wy - 1;
    }
    ox = wx;
  }

  carveOrthogonalShortcut(world, ox, oy, target.x, target.y);
  placeBoundaryDoor(world, room, wx, wy, ox, oy, state ?? DoorState.CLOSED, keyId);
}

export function hardenHermeticCore(world: World, room: Room): void {
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const border = dx < 0 || dx >= room.w || dy < 0 || dy >= room.h;
      const ci = world.idx(room.x + dx, room.y + dy);
      if (border && world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = Tex.HERMO_WALL;
        world.hermoWall[ci] = 1;
      }
    }
  }
  for (const doorIdx of room.doors) {
    const door = world.doors.get(doorIdx);
    if (!door) continue;
    door.state = DoorState.HERMETIC_OPEN;
    door.keyId = '';
    world.wallTex[doorIdx] = Tex.DOOR_METAL;
  }
}

export function createCayleyArchiveWing(world: World, hall: Room, element: CayleyElement, state: CayleyByuroState): void {
  const c = center(hall);
  const serialBase = hall.id * 100;
  const roomTypes = [
    RoomType.OFFICE,
    RoomType.STORAGE,
    RoomType.OFFICE,
    RoomType.BATHROOM,
    RoomType.KITCHEN,
    RoomType.STORAGE,
    RoomType.MEDICAL,
  ] as const;
  let serial = 0;
  for (let i = 0; i < 8; i++) {
    const top = tryAddAutoRoom(world, roomTypes[i % roomTypes.length], c.x - 92 + i * 24, c.y - 98, 14, 10, `Архив ${element}: верхняя ячейка ${i + 1}`);
    if (top) {
      decorateGeneratedRoom(world, top, serialBase + serial++);
      connectRooms(world, hall, top, state, 'plain');
    }
    const bottom = tryAddAutoRoom(world, roomTypes[(i + 3) % roomTypes.length], c.x - 92 + i * 24, c.y + 88, 14, 10, `Архив ${element}: нижняя ячейка ${i + 1}`);
    if (bottom) {
      decorateGeneratedRoom(world, bottom, serialBase + serial++);
      connectRooms(world, hall, bottom, state, 'plain');
    }
  }
  for (let i = 0; i < 7; i++) {
    const left = tryAddAutoRoom(world, roomTypes[(i + 1) % roomTypes.length], c.x - 126, c.y - 62 + i * 20, 13, 11, `Кабинка ${element}: левая ${i + 1}`);
    if (left) {
      decorateGeneratedRoom(world, left, serialBase + serial++);
      connectRooms(world, hall, left, state, 'plain');
    }
    const right = tryAddAutoRoom(world, roomTypes[(i + 4) % roomTypes.length], c.x + 112, c.y - 62 + i * 20, 13, 11, `Кабинка ${element}: правая ${i + 1}`);
    if (right) {
      decorateGeneratedRoom(world, right, serialBase + serial++);
      connectRooms(world, hall, right, state, 'plain');
    }
  }
}

export function createCayleyMacroCampuses(
  world: World,
  authoredRooms: ReturnType<typeof createRooms>,
  state: CayleyByuroState,
): Record<CayleyElement, Room> {
  const macroRooms = {} as Record<CayleyElement, Room>;
  for (const element of ['e', 'r', 'rr', 's', 'sr', 'srr'] as const) {
    const p = CAYLEY_GRAPH_POINTS[element];
    const hall = addAutoRoom(
      world,
      RoomType.COMMON,
      p.x - 38,
      p.y - 24,
      76,
      48,
      `Макроузел графа Кэли ${element}: ${CAYLEY_BYURO_ROOM_NAMES[element]}`,
      Tex.MARBLE,
      cayleyCosetOf(element) === 'odd' ? Tex.F_RED_CARPET : Tex.F_GREEN_CARPET,
    );
    macroRooms[element] = hall;
    decorateRoom(world, hall, element);
    setFeature(world, hall, hall.w >> 1, hall.h >> 1, Feature.SCREEN);
    connectRooms(world, hall, authoredRooms[element], state, 'plain');
    createCayleyArchiveWing(world, hall, element, state);
  }
  return macroRooms;
}

export function connectCayleyMacroGraph(world: World, macroRooms: Record<CayleyElement, Room>, state: CayleyByuroState): void {
  for (const [a, b] of [['e', 'r'], ['r', 'rr'], ['rr', 'e'], ['s', 'sr'], ['sr', 'srr'], ['srr', 's']] as const) {
    connectRooms(world, macroRooms[a], macroRooms[b], state, 'generator_r');
  }
  for (const [a, b] of [['e', 's'], ['r', 'srr'], ['rr', 'sr']] as const) {
    connectRooms(world, macroRooms[a], macroRooms[b], state, 'plain');
  }
}

export function nearestMacroRoom(spec: CayleyHqSpec, macroRooms: Record<CayleyElement, Room>): Room {
  if (spec.owner === ZoneFaction.CITIZEN) return macroRooms.e;
  if (spec.owner === ZoneFaction.LIQUIDATOR) return macroRooms.r;
  if (spec.owner === ZoneFaction.CULTIST) return macroRooms.sr;
  if (spec.owner === ZoneFaction.WILD) return macroRooms.rr;
  return macroRooms.r;
}

export function createHqSupportRooms(world: World, core: Room, spec: CayleyHqSpec, state: CayleyByuroState): void {
  const c = center(core);
  const support = [
    { type: RoomType.KITCHEN, x: c.x - 78, y: c.y - 18, w: 24, h: 14, suffix: 'кухня и выдача' },
    { type: RoomType.BATHROOM, x: c.x - 76, y: c.y + 22, w: 22, h: 12, suffix: 'санузел гермы' },
    { type: RoomType.STORAGE, x: c.x + 54, y: c.y - 22, w: 26, h: 16, suffix: 'склад допусков' },
    { type: spec.owner === ZoneFaction.SCIENTIST ? RoomType.MEDICAL : RoomType.OFFICE, x: c.x + 56, y: c.y + 22, w: 28, h: 16, suffix: spec.owner === ZoneFaction.SCIENTIST ? 'медико-измерительная' : 'канцелярия' },
    { type: spec.owner === ZoneFaction.WILD ? RoomType.SMOKING : RoomType.PRODUCTION, x: c.x - 18, y: c.y + 54, w: 34, h: 16, suffix: spec.owner === ZoneFaction.WILD ? 'разбитая курилка' : 'мастерская' },
  ] as const;

  for (let i = 0; i < support.length; i++) {
    const s = support[i];
    const room = tryAddAutoRoom(world, s.type, s.x, s.y, s.w, s.h, `${spec.supportPrefix}: ${s.suffix}`, spec.wallTex, spec.floorTex);
    if (!room) continue;
    decorateGeneratedRoom(world, room, core.id * 10 + i);
    connectRooms(world, core, room, state, 'plain');
  }
}

export function createScientistOutposts(world: World, core: Room, state: CayleyByuroState): void {
  const outposts = [
    { x: 690, y: 424, name: 'НИИ Кэли: пост генератора R' },
    { x: 696, y: 566, name: 'НИИ Кэли: пост факторного обхода' },
  ] as const;
  for (const outpost of outposts) {
    const room = tryAddAutoRoom(world, RoomType.HQ, outpost.x - 24, outpost.y - 16, 48, 32, outpost.name, Tex.HERMO_WALL, Tex.F_MARBLE_TILE);
    if (!room) continue;
    decorateGeneratedRoom(world, room, room.id);
    connectRooms(world, core, room, state, 'plain');
    hardenHermeticCore(world, room);
  }
}

export function createCayleyHqClusters(world: World, macroRooms: Record<CayleyElement, Room>, state: CayleyByuroState): void {
  for (const spec of CAYLEY_HQ_SPECS) {
    const core = addAutoRoom(
      world,
      RoomType.HQ,
      spec.x - Math.floor(spec.coreW / 2),
      spec.y - Math.floor(spec.coreH / 2),
      spec.coreW,
      spec.coreH,
      spec.name,
      spec.wallTex,
      spec.floorTex,
    );
    decorateGeneratedRoom(world, core, core.id);
    createHqSupportRooms(world, core, spec, state);
    connectRooms(world, core, nearestMacroRoom(spec, macroRooms), state, 'plain');
    if (spec.strong) createScientistOutposts(world, core, state);
    hardenHermeticCore(world, core);
  }
}

export function createCayleyLatticeBooths(world: World): void {
  const boothTypes = [RoomType.OFFICE, RoomType.STORAGE, RoomType.OFFICE, RoomType.BATHROOM] as const;
  let serial = 0;
  for (const x of CAYLEY_LATTICE_X) {
    for (const y of CAYLEY_LATTICE_Y) {
      const offsets = [
        { dx: -31, dy: -27, w: 12, h: 9 },
        { dx: 18, dy: -27, w: 12, h: 9 },
        { dx: -31, dy: 18, w: 12, h: 9 },
        { dx: 18, dy: 18, w: 12, h: 9 },
      ] as const;
      for (let i = 0; i < offsets.length; i++) {
        if ((serial + i) % 11 === 0) continue;
        const o = offsets[i];
        const room = tryAddAutoRoom(
          world,
          boothTypes[(serial + i) % boothTypes.length],
          x + o.dx,
          y + o.dy,
          o.w,
          o.h,
          `Микроокно алгоритма ${serial + 1}.${i + 1}`,
          Tex.PANEL,
          Tex.F_LINO,
        );
        if (!room) continue;
        decorateGeneratedRoom(world, room, serial + i);
        connectRoomToPoint(world, room, { x, y });
      }
      serial++;
    }
  }
}

export function createRooms(world: World, state: CayleyByuroState): Record<CayleyElement | 'lobby' | 'bribe' | 'audit' | 'quotient', Room> {
  let roomId = 0;
  const rooms = {
    lobby: addRoom(world, roomId++, RoomType.COMMON, 470, 476, 84, 50, CAYLEY_BYURO_ROOM_NAMES.lobby, Tex.MARBLE, Tex.F_MARBLE_TILE),
    e: addRoom(world, roomId++, RoomType.OFFICE, 448, 264, 64, 32, CAYLEY_BYURO_ROOM_NAMES.e),
    r: addRoom(world, roomId++, RoomType.OFFICE, 580, 350, 66, 34, CAYLEY_BYURO_ROOM_NAMES.r),
    rr: addRoom(world, roomId++, RoomType.OFFICE, 580, 540, 66, 34, CAYLEY_BYURO_ROOM_NAMES.rr),
    s: addRoom(world, roomId++, RoomType.OFFICE, 448, 666, 64, 32, CAYLEY_BYURO_ROOM_NAMES.s),
    sr: addRoom(world, roomId++, RoomType.OFFICE, 316, 540, 66, 34, CAYLEY_BYURO_ROOM_NAMES.sr),
    srr: addRoom(world, roomId++, RoomType.OFFICE, 316, 350, 66, 34, CAYLEY_BYURO_ROOM_NAMES.srr),
    bribe: addRoom(world, roomId++, RoomType.OFFICE, 202, 464, 72, 40, CAYLEY_BYURO_ROOM_NAMES.bribe, Tex.PANEL, Tex.F_GREEN_CARPET),
    audit: addRoom(world, roomId++, RoomType.OFFICE, 750, 464, 74, 42, CAYLEY_BYURO_ROOM_NAMES.audit, Tex.METAL, Tex.F_CONCRETE),
    quotient: addRoom(world, roomId++, RoomType.CORRIDOR, 470, 590, 84, 34, CAYLEY_BYURO_ROOM_NAMES.quotient, Tex.METAL, Tex.F_RED_CARPET),
  };

  for (const element of ['e', 'r', 'rr', 's', 'sr', 'srr'] as const) {
    state.groupRooms[element] = rooms[element].id;
    decorateRoom(world, rooms[element], element);
  }
  decorateRoom(world, rooms.lobby);
  decorateRoom(world, rooms.bribe);
  decorateRoom(world, rooms.audit);
  decorateRoom(world, rooms.quotient);
  setFeature(world, rooms.lobby, 8, 8, Feature.SCREEN);
  setFeature(world, rooms.quotient, 12, 7, Feature.APPARATUS);
  return rooms;
}

export function connectCayleyGraph(world: World, rooms: ReturnType<typeof createRooms>, state: CayleyByuroState): void {
  connectRooms(world, rooms.lobby, rooms.e, state, 'plain');
  connectRooms(world, rooms.lobby, rooms.bribe, state, 'plain');
  connectRooms(world, rooms.lobby, rooms.audit, state, 'plain');
  connectRooms(world, rooms.lobby, rooms.quotient, state, 'plain');

  for (const [a, b] of [['e', 'r'], ['r', 'rr'], ['rr', 'e'], ['s', 'sr'], ['sr', 'srr'], ['srr', 's']] as const) {
    connectRooms(world, rooms[a], rooms[b], state, 'generator_r');
  }
  for (const [a, b] of [['e', 's'], ['r', 'srr'], ['rr', 'sr']] as const) {
    connectRooms(world, rooms[a], rooms[b], state, 'plain');
  }
  connectRooms(world, rooms.quotient, rooms.srr, state, 'quotient');
  addQuotientShortcut(world, rooms, state);
}

export function addNote(entities: Entity[], nextId: { v: number }, x: number, y: number, text: string): void {
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
    inventory: [{ defId: 'note', count: 1, data: { text } }],
  });
}

export function populateAuthoredContent(
  world: World,
  entities: Entity[],
  rooms: ReturnType<typeof createRooms>,
  state: CayleyByuroState,
): void {
  const nextId = { v: 10000 };
  const clerkId = spawnNpc(entities, nextId, 'cayley_byuro_clerk', CLERK_DEF, rooms.bribe, 10, 12);
  spawnNpc(entities, nextId, 'cayley_byuro_coset_masha', COSET_DEF, rooms.quotient, 16, 9);
  const inspectorId = spawnNpc(entities, nextId, 'cayley_byuro_inspector', INSPECTOR_DEF, rooms.audit, 10, 10, 'makarov');

  addContainer(world, state, rooms.bribe, rooms.bribe.x + rooms.bribe.w - 5, rooms.bribe.y + 8, {
    kind: ContainerKind.CASHBOX,
    name: 'Касса платного генератора R',
    access: 'owner',
    ownerNpcId: clerkId,
    ownerName: CLERK_DEF.name,
    faction: Faction.CITIZEN,
    inventory: [
      { defId: 'key', count: 1 },
      { defId: 'official_permit_slip', count: 1 },
      { defId: 'seal_wax', count: 1 },
    ],
    tags: ['bribe', 'generator_r', 'paid_access'],
    lockDifficulty: 2,
  });

  addContainer(world, state, rooms.quotient, rooms.quotient.x + rooms.quotient.w - 8, rooms.quotient.y + 8, {
    kind: ContainerKind.FILING_CABINET,
    name: 'Факторная папка короткого хода',
    access: 'locked',
    inventory: [
      { defId: 'forged_permit_slip', count: 1 },
      { defId: 'fake_pass', count: 1 },
      { defId: 'blank_form', count: 2 },
    ],
    tags: ['quotient_shortcut', 'illegal', 'forgery'],
    lockDifficulty: 4,
  });

  addContainer(world, state, rooms.audit, rooms.audit.x + rooms.audit.w - 6, rooms.audit.y + 7, {
    kind: ContainerKind.SAFE,
    name: 'Сейф разоблаченных личностей',
    access: 'owner',
    ownerNpcId: inspectorId,
    ownerName: INSPECTOR_DEF.name,
    faction: Faction.LIQUIDATOR,
    inventory: [
      { defId: 'record_exposure_notice', count: 1 },
      { defId: 'denunciation', count: 2 },
      { defId: 'elevator_access_order', count: 1 },
    ],
    tags: ['identity_exposure', 'liquidator', 'evidence'],
    lockDifficulty: 5,
  });

  addContainer(world, state, rooms.srr, rooms.srr.x + rooms.srr.w - 6, rooms.srr.y + rooms.srr.h - 6, {
    kind: ContainerKind.FILING_CABINET,
    name: 'Папка правильного порядка RS',
    access: 'room',
    inventory: [
      { defId: 'archive_access_permit', count: 1 },
      { defId: 'official_permit_slip', count: 1 },
    ],
    tags: ['order_rs', 'legal', 'reward'],
  });

  addNote(entities, nextId, rooms.lobby.x + 11, rooms.lobby.y + 12, 'Бюро Кэли: R затем S ведет в SR2. S затем R ведет в SR. В журнале это разные люди.');
  addNote(entities, nextId, rooms.quotient.x + 10, rooms.quotient.y + 12, 'Факторный ход принимает любой нечетный класс. Поддельный пропуск сокращает путь и оставляет улику.');
  addNote(entities, nextId, rooms.audit.x + 8, rooms.audit.y + rooms.audit.h - 7, 'Поддельную личность сдавать в комнату разоблачения. Не через окно жалоб.');

  spawnMonster(world, entities, nextId, rooms.r, 9, 10, MonsterKind.PARAGRAPH);
  spawnMonster(world, entities, nextId, rooms.sr, 10, 12, MonsterKind.PECHATEED);
  spawnMonster(world, entities, nextId, rooms.rr, 12, 12, MonsterKind.KONTORSHCHIK);
}

export function ownerForCayleyTerritoryTile(x: number, y: number): TerritoryOwner {
  const tx = Math.max(0, Math.min(7, Math.floor(x / 128)));
  const ty = Math.max(0, Math.min(7, Math.floor(y / 128)));
  return CAYLEY_TERRITORY_GRID[ty][tx];
}

export function paintRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (!world.aptMask[ci]) world.factionControl[ci] = owner;
    }
  }
  for (const doorIdx of room.doors) world.factionControl[doorIdx] = owner;
}

export function paintNearbyTerritoryPatch(world: World, x: number, y: number, radius: number, owner: TerritoryOwner): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const ci = world.idx(x + dx, y + dy);
      if (!world.aptMask[ci]) world.factionControl[ci] = owner;
    }
  }
}

export function retuneCayleyByuroTerritory(world: World): void {
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      world.factionControl[world.idx(x, y)] = ownerForCayleyTerritoryTile(x, y);
    }
  }

  for (const spec of CAYLEY_HQ_SPECS) {
    paintNearbyTerritoryPatch(world, spec.x, spec.y, spec.strong ? 82 : 58, spec.owner);
  }

  for (const room of world.rooms) {
    const c = center(room);
    if (room.type === RoomType.HQ) {
      paintRoomTerritory(world, room, ownerForCayleyTerritoryTile(c.x, c.y));
    } else if (room.name === CAYLEY_BYURO_ROOM_NAMES.bribe) {
      paintRoomTerritory(world, room, ZoneFaction.CITIZEN);
    } else if (room.name === CAYLEY_BYURO_ROOM_NAMES.audit) {
      paintRoomTerritory(world, room, ZoneFaction.LIQUIDATOR);
    } else if (room.name === CAYLEY_BYURO_ROOM_NAMES.quotient || room.name.includes('факторного обхода')) {
      paintRoomTerritory(world, room, ZoneFaction.WILD);
    }
  }

  for (const zone of world.zones) {
    const owner = ownerForCayleyTerritoryTile(zone.cx, zone.cy);
    zone.level = owner === ZoneFaction.CULTIST || owner === ZoneFaction.WILD ? 4 : owner === ZoneFaction.SCIENTIST ? 3 : 2;
    zone.fogged = false;
  }
  syncZoneMetadataFromTerritory(world);
}

export function tuneInitialZones(world: World): void {
  generateZones(world);
  retuneCayleyByuroTerritory(world);
}

export function registerCayleyRouteCue(world: World, rooms: ReturnType<typeof createRooms>): void {
  const lobby = center(rooms.lobby);
  const target = center(rooms.srr);
  registerRouteCue(world, {
    id: 'cayley_byuro_order_rs',
    x: lobby.x + 0.5,
    y: lobby.y + 0.5,
    targetX: target.x + 0.5,
    targetY: target.y + 0.5,
    z: CAYLEY_BYURO_BASE_FLOOR,
    label: 'Порядок форм',
    hint: 'R потом S ведет в SR2. Обратный порядок приведет в другую очередь.',
    targetName: CAYLEY_BYURO_ROOM_NAMES.srr,
    color: '#f6c957',
    tags: ['cayley_byuro', 'route_choice', 'forms', 'order_rs'],
    toneSeed: 90_032,
    roomId: rooms.lobby.id,
    targetRoomId: rooms.srr.id,
    heardText: 'Указатель бюро щелкает: сначала R, потом S. Короткий ход требует липовый пропуск.',
    followedText: 'Вы идете по порядку R затем S.',
    ignoredText: 'Порядок форм оставлен без отметки.',
    routeGroup: {
      id: 'cayley_byuro_forms',
      lead: 'В бюро Кэли двери подписаны генераторами R и S.',
      risk: 'Ключ R покупается, факторный ход работает через подделку.',
      decision: 'Идти легальным порядком, платить за R или резать путь липовой личностью.',
      reward: 'Пропуск, улика или быстрый выход к косетным окнам.',
      mapLabel: 'Бюро Кэли',
      mapHint: 'Проверь порядок форм перед дверью.',
      logLine: 'Бюро Кэли показывает порядок R затем S.',
    },
  });
}

export function retainLiveCayleyDoorIds(world: World, state: CayleyByuroState): void {
  state.generatorDoorIds = state.generatorDoorIds.filter(idx => world.doors.has(idx));
  state.quotientShortcutDoorIds = state.quotientShortcutDoorIds.filter(idx => world.doors.has(idx));
}

