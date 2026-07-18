/* -- Design z: Manhattan-like indoor crossroads ------------- */

import {
  Cell,
  DoorState,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { designNpcFloorKey } from '../../data/plot';
import {
  calcZoneLevel,
} from '../../systems/rpg';
import { generateZones, stampRoom } from '../shared';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('manhattan_crossroads');

export const DESIGN_FLOOR_ID = 'manhattan_crossroads' as const;
export const MANHATTAN_CROSSROADS_Z = 8;
import { CENTER, AVENUE_WIDTH, STREET_WIDTH, SIDEWALK, ROAD_TEX, SIDEWALK_TEX, MARK_TEX, ROAD_WALL_TEX, OVERPASS_TEX, UNDERPASS_TEX, CROSSWALK_ROOM_DEF_ID, CONTROL_ROOM_DEF_ID, CARGO_ROOM_DEF_ID, WRONG_TURN_ROOM_DEF_ID, SAFE_CURB_ROOM_DEF_ID, TOLL_GATE_ROOM_DEF_ID, AVENUE_CENTERS, STREET_CENTERS, SHELL_AVENUE_CENTERS, SHELL_STREET_CENTERS, Axis, RoadSpan, KeyRooms, ROAD_SPANS } from './meta';

export function addLogicalRoom(
  world: World,
  name: string,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  floorTex: Tex,
  wallTex = ROAD_WALL_TEX,
): Room {
  const room: Room = {
    id: world.rooms.length,
    type,
    x: world.wrap(x),
    y: world.wrap(y),
    w,
    h,
    doors: [],
    sealed: false,
    name,
    apartmentId: -1,
    wallTex,
    floorTex,
  };
  world.rooms[room.id] = room;
  return room;
}

export function setOpenCell(world: World, x: number, y: number, floorTex: Tex, roomId: number): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.FLOOR;
  world.floorTex[ci] = floorTex;
  world.wallTex[ci] = ROAD_WALL_TEX;
  world.roomMap[ci] = roomId;
}

export function carveRoadSpan(world: World, span: RoadSpan, roadRoomId: number, sidewalkRoomId: number): void {
  const half = Math.floor(span.width / 2);
  const y0 = Math.min(span.from, span.to);
  const y1 = Math.max(span.from, span.to);
  for (let n = y0; n <= y1; n++) {
    for (let o = -half - SIDEWALK; o <= half + SIDEWALK; o++) {
      const road = Math.abs(o) <= half;
      const x = span.axis === 'vertical' ? span.center + o : n;
      const y = span.axis === 'vertical' ? n : span.center + o;
      const ci = world.idx(x, y);
      if (!road && world.floorTex[ci] === ROAD_TEX) continue;
      setOpenCell(world, x, y, road ? ROAD_TEX : SIDEWALK_TEX, road ? roadRoomId : sidewalkRoomId);
    }
  }
}

export function isRoadLikeRoom(world: World, roomId: number): boolean {
  const room = world.rooms[roomId];
  return room?.name === 'Асфальтовая сетка авеню'
    || room?.name === 'Бордюры и служебные края'
    || room?.name === CROSSWALK_ROOM_DEF_ID;
}

export function canRetuneStreetCell(world: World, ci: number): boolean {
  if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) return false;
  if (world.containerMap.has(ci)) return false;
  const roomId = world.roomMap[ci];
  return roomId < 0 || isRoadLikeRoom(world, roomId);
}

export function setOpenCellSafe(world: World, x: number, y: number, floorTex: Tex, roomId: number): void {
  const ci = world.idx(x, y);
  if (!canRetuneStreetCell(world, ci)) return;
  const wasFloor = world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER;
  world.cells[ci] = Cell.FLOOR;
  world.floorTex[ci] = floorTex;
  world.wallTex[ci] = ROAD_WALL_TEX;
  world.roomMap[ci] = roomId;
  if (!wasFloor) world.features[ci] = Feature.NONE;
}

export function carveRoadSpanSafe(world: World, span: RoadSpan, roadRoomId: number, sidewalkRoomId: number): void {
  const half = Math.floor(span.width / 2);
  const start = Math.min(span.from, span.to);
  const end = Math.max(span.from, span.to);
  for (let n = start; n <= end; n++) {
    for (let o = -half - SIDEWALK; o <= half + SIDEWALK; o++) {
      const road = Math.abs(o) <= half;
      const x = span.axis === 'vertical' ? span.center + o : n;
      const y = span.axis === 'vertical' ? n : span.center + o;
      setOpenCellSafe(world, x, y, road ? ROAD_TEX : SIDEWALK_TEX, road ? roadRoomId : sidewalkRoomId);
    }
  }
}

export function carveOpenRect(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  floorTex: Tex,
  roomId: number,
  safe = false,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (safe) setOpenCellSafe(world, x + dx, y + dy, floorTex, roomId);
      else setOpenCell(world, x + dx, y + dy, floorTex, roomId);
    }
  }
}

export function carveDiagonalPath(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  roomId: number,
  safe = false,
): void {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    for (let dy = -width; dy <= width; dy++) {
      for (let dx = -width; dx <= width; dx++) {
        if (dx * dx + dy * dy > width * width) continue;
        if (safe) setOpenCellSafe(world, x + dx, y + dy, floorTex, roomId);
        else setOpenCell(world, x + dx, y + dy, floorTex, roomId);
      }
    }
  }
}

export function placeBarrierRect(world: World, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (!canRetuneStreetCell(world, ci)) continue;
      if (world.cells[ci] !== Cell.FLOOR) continue;
      world.cells[ci] = Cell.WALL;
      world.wallTex[ci] = Tex.METAL;
      world.roomMap[ci] = -1;
      world.features[ci] = Feature.NONE;
    }
  }
}

export function nearAnyCenter(v: number, centers: readonly number[], radius: number): boolean {
  for (const center of centers) {
    if (Math.abs(v - center) <= radius) return true;
  }
  return false;
}

export function paintSurfaceRect(
  world: World,
  x: number,
  y: number,
  px0: number,
  py0: number,
  px1: number,
  py1: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
  let cell = world.surfaceMap.get(ci);
  if (!cell) {
    cell = new Uint8Array(1024);
    world.surfaceMap.set(ci, cell);
  }
  const sx = Math.max(0, Math.min(15, px0));
  const ex = Math.max(0, Math.min(15, px1));
  const sy = Math.max(0, Math.min(15, py0));
  const ey = Math.max(0, Math.min(15, py1));
  for (let py = sy; py <= ey; py++) {
    for (let px = sx; px <= ex; px++) {
      const pi = (py * 16 + px) << 2;
      cell[pi] = r;
      cell[pi + 1] = g;
      cell[pi + 2] = b;
      cell[pi + 3] = Math.max(cell[pi + 3], a);
    }
  }
  world.markSurfaceCellDirty(ci);
}

export function markLineCell(world: World, x: number, y: number, axis: Axis, markRoomId: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.floorTex[ci] = MARK_TEX;
  world.roomMap[ci] = markRoomId;
  if (!shouldPaintHighResMark(x, y)) return;
  if (axis === 'vertical') {
    paintSurfaceRect(world, x, y, 6, 0, 9, 15, 238, 238, 224, 235);
  } else {
    paintSurfaceRect(world, x, y, 0, 6, 15, 9, 238, 238, 224, 235);
  }
}

export function shouldPaintHighResMark(x: number, y: number): boolean {
  const near = (cx: number, cy: number, r: number) => {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
  return near(512, 512, 90) || near(512, 600, 76) || near(680, 512, 60);
}

export function markCrosswalkCell(world: World, x: number, y: number, markRoomId: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.floorTex[ci] = MARK_TEX;
  world.roomMap[ci] = markRoomId;
  if (!shouldPaintHighResMark(x, y)) return;
  paintSurfaceRect(world, x, y, 0, 0, 15, 15, 244, 244, 232, 245);
}

export function paintRoadDividers(world: World, markRoomId: number): void {
  for (const span of ROAD_SPANS) {
    const start = Math.min(span.from, span.to);
    const end = Math.max(span.from, span.to);
    for (let n = start; n <= end; n++) {
      if (((n - start) % 8) > 4) continue;
      const x = span.axis === 'vertical' ? span.center : n;
      const y = span.axis === 'vertical' ? n : span.center;
      markLineCell(world, x, y, span.axis, markRoomId);
    }
  }
}

export function paintCrosswalkHorizontal(world: World, x0: number, y0: number, w: number, h: number, markRoomId: number): void {
  for (let dy = 0; dy < h; dy++) {
    if (dy % 2 !== 0) continue;
    for (let dx = 0; dx < w; dx++) markCrosswalkCell(world, x0 + dx, y0 + dy, markRoomId);
  }
}

export function paintCrosswalkVertical(world: World, x0: number, y0: number, w: number, h: number, markRoomId: number): void {
  for (let dx = 0; dx < w; dx++) {
    if (dx % 2 !== 0) continue;
    for (let dy = 0; dy < h; dy++) markCrosswalkCell(world, x0 + dx, y0 + dy, markRoomId);
  }
}

export function paintIntersectionCrosswalks(world: World, cx: number, cy: number, avenueWidth: number, streetWidth: number, markRoomId: number): void {
  const aw = Math.floor(avenueWidth / 2);
  const sw = Math.floor(streetWidth / 2);
  paintCrosswalkHorizontal(world, cx - aw, cy - sw - 9, avenueWidth, 7, markRoomId);
  paintCrosswalkHorizontal(world, cx - aw, cy + sw + 3, avenueWidth, 7, markRoomId);
  paintCrosswalkVertical(world, cx - aw - 9, cy - sw, 7, streetWidth, markRoomId);
  paintCrosswalkVertical(world, cx + aw + 3, cy - sw, 7, streetWidth, markRoomId);
}

export function stampNamedRoom(
  world: World,
  name: string,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = wallTex;
    }
  }
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      world.floorTex[ci] = floorTex;
      world.roomMap[ci] = room.id;
    }
  }
  return room;
}

export function placeDoor(world: World, room: Room, x: number, y: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.DOOR) return;
  world.cells[ci] = Cell.DOOR;
  world.wallTex[ci] = Tex.DOOR_METAL;
  world.doors.set(ci, {
    idx: ci,
    state: DoorState.CLOSED,
    roomA: room.id,
    roomB: -1,
    keyId: '',
    timer: 0,
  });
  room.doors.push(ci);
}

export function connectRoomToStreet(world: World, room: Room, sidewalkRoomId: number): void {
  const probes: { doorX: number; doorY: number; outX: number; outY: number; dx: number; dy: number }[] = [];
  for (let dx = 1; dx < room.w - 1; dx++) {
    probes.push({ doorX: room.x + dx, doorY: room.y - 1, outX: room.x + dx, outY: room.y - 2, dx: 0, dy: -1 });
    probes.push({ doorX: room.x + dx, doorY: room.y + room.h, outX: room.x + dx, outY: room.y + room.h + 1, dx: 0, dy: 1 });
  }
  for (let dy = 1; dy < room.h - 1; dy++) {
    probes.push({ doorX: room.x - 1, doorY: room.y + dy, outX: room.x - 2, outY: room.y + dy, dx: -1, dy: 0 });
    probes.push({ doorX: room.x + room.w, doorY: room.y + dy, outX: room.x + room.w + 1, outY: room.y + dy, dx: 1, dy: 0 });
  }

  let best: typeof probes[number] | null = null;
  let bestPath: number[] = [];
  for (const probe of probes) {
    const path: number[] = [];
    let x = probe.outX;
    let y = probe.outY;
    for (let step = 0; step < 54; step++) {
      const ci = world.idx(x, y);
      if (world.cells[ci] === Cell.FLOOR && world.roomMap[ci] !== room.id) {
        if (!best || path.length < bestPath.length) {
          best = probe;
          bestPath = path.slice();
        }
        break;
      }
      if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) break;
      path.push(ci);
      x += probe.dx;
      y += probe.dy;
    }
  }
  if (!best) return;

  placeDoor(world, room, best.doorX, best.doorY);
  for (const ci of bestPath) {
    if (world.cells[ci] === Cell.LIFT) continue;
    world.cells[ci] = Cell.FLOOR;
    world.floorTex[ci] = SIDEWALK_TEX;
    world.roomMap[ci] = sidewalkRoomId;
  }
}

export function connectRoomExit(
  world: World,
  room: Room,
  doorX: number,
  doorY: number,
  dx: number,
  dy: number,
  sidewalkRoomId: number,
): void {
  placeDoor(world, room, doorX, doorY);
  let x = doorX + dx;
  let y = doorY + dy;
  for (let step = 0; step < 46; step++) {
    const ci = world.idx(x, y);
    if (world.cells[ci] === Cell.FLOOR && world.roomMap[ci] !== room.id) break;
    if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) break;
    world.cells[ci] = Cell.FLOOR;
    world.floorTex[ci] = SIDEWALK_TEX;
    world.roomMap[ci] = sidewalkRoomId;
    x += dx;
    y += dy;
  }
}

export function setFeatureIfFloor(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) world.features[ci] = feature;
}

export function paintCrosswalkPlaza(world: World, markRoomId: number): void {
  for (let x = 480; x <= 544; x += 4) {
    for (let y = 492; y <= 532; y++) markCrosswalkCell(world, x, y, markRoomId);
  }
  for (let y = 480; y <= 544; y += 4) {
    for (let x = 492; x <= 532; x++) markCrosswalkCell(world, x, y, markRoomId);
  }
}

export function carveServiceAlleys(world: World, sidewalkRoomId: number): void {
  carveDiagonalPath(world, 272, 658, 442, 542, 2, SIDEWALK_TEX, sidewalkRoomId);
  carveDiagonalPath(world, 586, 468, 748, 326, 2, SIDEWALK_TEX, sidewalkRoomId);
  carveDiagonalPath(world, 632, 620, 746, 704, 2, SIDEWALK_TEX, sidewalkRoomId);
  carveDiagonalPath(world, 304, 360, 454, 470, 1, SIDEWALK_TEX, sidewalkRoomId);
  for (const [x, y] of [[272, 658], [442, 542], [586, 468], [748, 326], [632, 620], [746, 704]] as const) {
    setFeatureIfFloor(world, x, y, Feature.LAMP);
  }
}

export function carveOverpassBypass(world: World, sidewalkRoomId: number): void {
  carveOpenRect(world, 548, 438, 8, 158, OVERPASS_TEX, sidewalkRoomId);
  carveOpenRect(world, 506, 438, 50, 8, OVERPASS_TEX, sidewalkRoomId);
  carveOpenRect(world, 548, 586, 92, 8, OVERPASS_TEX, sidewalkRoomId);
  carveOpenRect(world, 632, 586, 8, 38, OVERPASS_TEX, sidewalkRoomId);
  for (let y = 444; y <= 588; y += 18) {
    setFeatureIfFloor(world, 546, y, Feature.LAMP);
    setFeatureIfFloor(world, 557, y, Feature.LAMP);
  }
  for (let x = 512; x <= 636; x += 18) setFeatureIfFloor(world, x, 586, Feature.LAMP);
}

export function carveUnderpassTunnels(world: World, sidewalkRoomId: number): void {
  carveOpenRect(world, 292, 620, 212, 7, UNDERPASS_TEX, sidewalkRoomId);
  carveOpenRect(world, 494, 600, 7, 86, UNDERPASS_TEX, sidewalkRoomId);
  carveDiagonalPath(world, 500, 624, 650, 628, 2, UNDERPASS_TEX, sidewalkRoomId);
  carveOpenRect(world, 650, 626, 136, 7, UNDERPASS_TEX, sidewalkRoomId);
  for (const [x, y] of [[292, 623], [498, 604], [650, 628], [782, 628]] as const) {
    setFeatureIfFloor(world, x, y, Feature.SCREEN);
  }
}

export function placeTrafficBarriers(world: World): void {
  placeBarrierRect(world, 356, 340, 42, 7);
  placeBarrierRect(world, 676, 286, 8, 42);
  placeBarrierRect(world, 220, 690, 42, 7);
  placeBarrierRect(world, 498, 502, 8, 20);
  placeBarrierRect(world, 518, 502, 8, 20);
}

export function placeRoadDividerCover(world: World): void {
  for (const span of ROAD_SPANS) {
    const start = Math.min(span.from, span.to) + 18;
    const end = Math.max(span.from, span.to) - 18;
    for (let n = start; n <= end; n += 44) {
      if (span.axis === 'vertical' && nearAnyCenter(n, STREET_CENTERS, 18)) continue;
      if (span.axis === 'horizontal' && nearAnyCenter(n, AVENUE_CENTERS, 18)) continue;
      const x = span.axis === 'vertical' ? span.center - 3 : n;
      const y = span.axis === 'vertical' ? n : span.center - 3;
      setFeatureIfFloor(world, x, y, Feature.APPARATUS);
      if (n % 88 === 0) setFeatureIfFloor(world, span.axis === 'vertical' ? span.center + 3 : n, span.axis === 'vertical' ? n : span.center + 3, Feature.LAMP);
    }
  }
}

export function paintRoadDividersForSpans(world: World, spans: readonly RoadSpan[], markRoomId: number): void {
  for (const span of spans) {
    const start = Math.min(span.from, span.to);
    const end = Math.max(span.from, span.to);
    for (let n = start; n <= end; n++) {
      if (((n - start) % 8) > 4) continue;
      const x = span.axis === 'vertical' ? span.center : n;
      const y = span.axis === 'vertical' ? n : span.center;
      markLineCell(world, x, y, span.axis, markRoomId);
    }
  }
}

export function dressStreetMotifs(world: World, sidewalkRoomId: number, markRoomId: number): void {
  paintCrosswalkPlaza(world, markRoomId);
  carveServiceAlleys(world, sidewalkRoomId);
  carveOverpassBypass(world, sidewalkRoomId);
  carveUnderpassTunnels(world, sidewalkRoomId);
  placeTrafficBarriers(world);
  placeCentralTollGate(world);
  placeRoadDividerCover(world);
}

export function logicalRoomByName(world: World, name: string, type: RoomType, floorTex: Tex, wallTex = ROAD_WALL_TEX): Room {
  const existing = world.rooms.find(room => room?.name === name);
  return existing ?? addLogicalRoom(world, name, type, 0, 0, W, W, floorTex, wallTex);
}

export function canStampShellRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR || world.containerMap.has(ci)) return false;
      const roomId = world.roomMap[ci];
      if (roomId >= 0 && !isRoadLikeRoom(world, roomId)) return false;
    }
  }
  return true;
}

export function stampShellStorefronts(world: World, sidewalkRoomId: number, rng: () => number): void {
  const specs: readonly { name: string; type: RoomType; x: number; y: number; w: number; h: number; wall: Tex; z: Tex }[] = [
    { name: 'Северная закрытая витрина', type: RoomType.STORAGE, x: 92, y: 118, w: 50, h: 28, wall: Tex.PANEL, z: Tex.F_TILE },
    { name: 'Двор над западным тоннелем', type: RoomType.COMMON, x: 92, y: 404, w: 64, h: 42, wall: Tex.BRICK, z: Tex.F_CONCRETE },
    { name: 'Лавка дорожных знаков', type: RoomType.STORAGE, x: 874, y: 302, w: 54, h: 30, wall: Tex.METAL, z: Tex.F_TILE },
    { name: 'Пустая касса восточного блока', type: RoomType.OFFICE, x: 878, y: 548, w: 46, h: 26, wall: Tex.PANEL, z: Tex.F_LINO },
    { name: 'Ночной продуктовый на объезде', type: RoomType.STORAGE, x: 718, y: 878, w: 62, h: 34, wall: Tex.PANEL, z: Tex.F_TILE },
    { name: 'Южный гаражный карман', type: RoomType.STORAGE, x: 394, y: 884, w: 70, h: 36, wall: Tex.METAL, z: Tex.F_CONCRETE },
    { name: 'Подсобка под ложной авеню', type: RoomType.PRODUCTION, x: 108, y: 748, w: 50, h: 30, wall: Tex.PIPE, z: Tex.F_CONCRETE },
    { name: 'Офис дорожного старшего', type: RoomType.OFFICE, x: 846, y: 126, w: 52, h: 30, wall: Tex.CONCRETE, z: Tex.F_LINO },
  ];

  for (const spec of specs) {
    if (!canStampShellRoom(world, spec.x, spec.y, spec.w, spec.h)) continue;
    const room = stampNamedRoom(world, spec.name, spec.type, spec.x, spec.y, spec.w, spec.h, spec.wall, spec.z);
    connectRoomToStreet(world, room, sidewalkRoomId);
    const featureCount = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < featureCount; i++) {
      const fx = room.x + 3 + Math.floor(rng() * Math.max(1, room.w - 6));
      const fy = room.y + 3 + Math.floor(rng() * Math.max(1, room.h - 6));
      setFeatureIfFloor(world, fx, fy, rng() < 0.45 ? Feature.SHELF : rng() < 0.75 ? Feature.TABLE : Feature.LAMP);
    }
  }
}

export function blockRoomType(serial: number): RoomType {
  const types = [
    RoomType.LIVING,
    RoomType.LIVING,
    RoomType.KITCHEN,
    RoomType.BATHROOM,
    RoomType.STORAGE,
    RoomType.OFFICE,
  ] as const;
  return types[serial % types.length];
}

export function blockRoomTex(type: RoomType): { wall: Tex; z: Tex } {
  if (type === RoomType.BATHROOM) return { wall: Tex.TILE_W, z: Tex.F_TILE };
  if (type === RoomType.KITCHEN) return { wall: Tex.PANEL, z: Tex.F_TILE };
  if (type === RoomType.STORAGE) return { wall: Tex.METAL, z: Tex.F_CONCRETE };
  if (type === RoomType.OFFICE) return { wall: Tex.CONCRETE, z: Tex.F_LINO };
  return { wall: Tex.PANEL, z: Tex.F_LINO };
}

export function decorateBlockInteriorRoom(world: World, room: Room, type: RoomType, rng: () => number): void {
  const centerX = room.x + Math.floor(room.w / 2);
  const centerY = room.y + Math.floor(room.h / 2);
  if (type === RoomType.KITCHEN) {
    setFeatureIfFloor(world, room.x + 2, room.y + 2, Feature.STOVE);
    setFeatureIfFloor(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
  } else if (type === RoomType.BATHROOM) {
    setFeatureIfFloor(world, room.x + 2, room.y + 2, Feature.TOILET);
    setFeatureIfFloor(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
  } else if (type === RoomType.STORAGE) {
    setFeatureIfFloor(world, centerX, centerY, Feature.SHELF);
  } else if (type === RoomType.OFFICE) {
    setFeatureIfFloor(world, centerX, centerY, Feature.DESK);
    setFeatureIfFloor(world, room.x + room.w - 3, room.y + 2, Feature.SCREEN);
  } else {
    setFeatureIfFloor(world, centerX, centerY, rng() < 0.5 ? Feature.TABLE : Feature.BED);
  }
  if (rng() < 0.72) setFeatureIfFloor(world, room.x + room.w - 2, room.y + room.h - 2, Feature.LAMP);
}

export interface FloorplanRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function canBuildFloorplanRect(world: World, rect: FloorplanRect): boolean {
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      if (!canRetuneStreetCell(world, world.idx(rect.x + dx, rect.y + dy))) return false;
    }
  }
  return true;
}

export function addFloorplanRoom(world: World, name: string, type: RoomType, x: number, y: number, w: number, h: number, wallTex: Tex, floorTex: Tex): Room {
  const room = addLogicalRoom(world, name, type, x, y, w, h, floorTex, wallTex);
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  return room;
}

export function fillFloorplanWalls(world: World, rect: FloorplanRect, wallTex: Tex): void {
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const ci = world.idx(rect.x + dx, rect.y + dy);
      if (!canRetuneStreetCell(world, ci)) continue;
      world.cells[ci] = Cell.WALL;
      world.wallTex[ci] = wallTex;
      world.floorTex[ci] = Tex.F_CONCRETE;
      world.roomMap[ci] = -1;
      world.features[ci] = Feature.NONE;
    }
  }
}

export function carveFloorplanRoom(world: World, room: Room): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (!canRetuneStreetCell(world, ci)) continue;
      world.cells[ci] = Cell.FLOOR;
      world.wallTex[ci] = room.wallTex;
      world.floorTex[ci] = room.floorTex;
      world.roomMap[ci] = room.id;
      world.features[ci] = Feature.NONE;
    }
  }
}

export function canRetuneFloorplanCell(world: World, ci: number): boolean {
  if (canRetuneStreetCell(world, ci)) return true;
  const roomId = world.roomMap[ci];
  return roomId >= 0 && world.rooms[roomId]?.name.startsWith('Внутренний квартал');
}

export function carveFloorplanCorridor(world: World, room: Room): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (!canRetuneFloorplanCell(world, ci)) continue;
      world.cells[ci] = Cell.FLOOR;
      world.wallTex[ci] = room.wallTex;
      world.floorTex[ci] = room.floorTex;
      world.roomMap[ci] = room.id;
      world.features[ci] = Feature.NONE;
    }
  }
}

export function placeFloorplanDoor(world: World, a: Room, b: Room, x: number, y: number): void {
  const ci = world.idx(x, y);
  if (!canRetuneStreetCell(world, ci) && world.cells[ci] !== Cell.WALL) return;
  world.cells[ci] = Cell.DOOR;
  world.wallTex[ci] = Tex.DOOR_WOOD;
  world.features[ci] = Feature.NONE;
  world.doors.set(ci, {
    idx: ci,
    state: DoorState.CLOSED,
    roomA: a.id,
    roomB: b.id,
    keyId: '',
    timer: 0,
  });
  if (!a.doors.includes(ci)) a.doors.push(ci);
  if (!b.doors.includes(ci)) b.doors.push(ci);
}

export function floorplanSegments(start: number, end: number, rng: () => number): { from: number; size: number }[] {
  const out: { from: number; size: number }[] = [];
  let cursor = start;
  while (cursor + 6 <= end) {
    const remaining = end - cursor + 1;
    const target = 7 + Math.floor(rng() * 8);
    const size = remaining <= target + 7 ? remaining : Math.min(target, remaining - 7);
    if (size < 6) break;
    out.push({ from: cursor, size });
    cursor += size + 1;
  }
  return out;
}

export function randomFloorplanDepth(maxDepth: number, minDepth: number, rng: () => number): number {
  if (maxDepth <= minDepth) return Math.max(1, maxDepth);
  const span = maxDepth - minDepth;
  const biased = Math.floor(Math.pow(rng(), 1.45) * (span + 1));
  return Math.max(minDepth, Math.min(maxDepth, minDepth + biased));
}

export function overlapMidpoint(a0: number, a1: number, b0: number, b1: number): number | null {
  const from = Math.max(a0, b0);
  const to = Math.min(a1, b1);
  return from <= to ? Math.floor((from + to) / 2) : null;
}

export function linkFloorplanNeighbors(world: World, rooms: readonly Room[], verticalWall: boolean, rng: () => number): void {
  for (let i = 1; i < rooms.length; i++) {
    if (rng() >= 0.34) continue;
    const prev = rooms[i - 1];
    const room = rooms[i];
    if (verticalWall) {
      const y = overlapMidpoint(prev.y, prev.y + prev.h - 1, room.y, room.y + room.h - 1);
      if (y !== null) placeFloorplanDoor(world, prev, room, room.x - 1, y);
    } else {
      const x = overlapMidpoint(prev.x, prev.x + prev.w - 1, room.x, room.x + room.w - 1);
      if (x !== null) placeFloorplanDoor(world, prev, room, x, room.y - 1);
    }
  }
}

export function stampHorizontalFloorplanRow(
  world: World,
  corridor: Room,
  blockIndex: number,
  rowIndex: number,
  y: number,
  h: number,
  x0: number,
  x1: number,
  wallTex: Tex,
  rng: () => number,
): number {
  if (h < 6) return 0;
  const rowRooms: Room[] = [];
  const segments = floorplanSegments(x0, x1, rng);
  const above = y < corridor.y;
  for (let i = 0; i < segments.length; i++) {
    const type = blockRoomType(blockIndex * 17 + rowIndex * 7 + i);
    const tex = blockRoomTex(type);
    const maxDepth = Math.min(h, 12 + Math.floor(rng() * 8));
    const depth = randomFloorplanDepth(maxDepth, Math.min(6, maxDepth), rng);
    const roomY = above ? corridor.y - 1 - depth : corridor.y + corridor.h + 1;
    const room = addFloorplanRoom(
      world,
      `Внутренний квартал ${blockIndex + 1}.${rowIndex + 1}.${i + 1}`,
      type,
      segments[i].from,
      roomY,
      segments[i].size,
      depth,
      wallTex,
      tex.z,
    );
    carveFloorplanRoom(world, room);
    const doorY = y < corridor.y ? corridor.y - 1 : corridor.y + corridor.h;
    placeFloorplanDoor(world, room, corridor, room.x + Math.floor(room.w / 2), doorY);
    decorateBlockInteriorRoom(world, room, type, rng);
    rowRooms.push(room);
  }
  linkFloorplanNeighbors(world, rowRooms, true, rng);
  return rowRooms.length;
}

export function stampVerticalFloorplanRow(
  world: World,
  corridor: Room,
  blockIndex: number,
  rowIndex: number,
  x: number,
  w: number,
  y0: number,
  y1: number,
  wallTex: Tex,
  rng: () => number,
): number {
  if (w < 6) return 0;
  const rowRooms: Room[] = [];
  const segments = floorplanSegments(y0, y1, rng);
  const left = x < corridor.x;
  for (let i = 0; i < segments.length; i++) {
    const type = blockRoomType(blockIndex * 19 + rowIndex * 5 + i);
    const tex = blockRoomTex(type);
    const maxDepth = Math.min(w, 12 + Math.floor(rng() * 8));
    const depth = randomFloorplanDepth(maxDepth, Math.min(6, maxDepth), rng);
    const roomX = left ? corridor.x - 1 - depth : corridor.x + corridor.w + 1;
    const room = addFloorplanRoom(
      world,
      `Внутренний квартал ${blockIndex + 1}.${rowIndex + 1}.${i + 1}`,
      type,
      roomX,
      segments[i].from,
      depth,
      segments[i].size,
      wallTex,
      tex.z,
    );
    carveFloorplanRoom(world, room);
    const doorX = x < corridor.x ? corridor.x - 1 : corridor.x + corridor.w;
    placeFloorplanDoor(world, room, corridor, doorX, room.y + Math.floor(room.h / 2));
    decorateBlockInteriorRoom(world, room, type, rng);
    rowRooms.push(room);
  }
  linkFloorplanNeighbors(world, rowRooms, false, rng);
  return rowRooms.length;
}

export function stampFloorplanBranchCorridor(
  world: World,
  sidewalkRoomId: number,
  rect: FloorplanRect,
  blockIndex: number,
  horizontalMain: boolean,
  wallTex: Tex,
  rng: () => number,
): number {
  if (rect.w < 56 || rect.h < 54 || rng() < 0.22) return 0;
  if (horizontalMain) {
    const w = rng() < 0.45 ? 2 : 3;
    const x = rect.x + 8 + Math.floor(rng() * Math.max(1, rect.w - 16 - w));
    const room = addFloorplanRoom(
      world,
      `Внутренний квартал ${blockIndex + 1}: боковой проход`,
      RoomType.CORRIDOR,
      x,
      rect.y + 1,
      w,
      rect.h - 2,
      wallTex,
      SIDEWALK_TEX,
    );
    carveFloorplanCorridor(world, room);
    connectRoomExit(world, room, x + Math.floor(w / 2), rect.y, 0, -1, sidewalkRoomId);
    connectRoomExit(world, room, x + Math.floor(w / 2), rect.y + rect.h - 1, 0, 1, sidewalkRoomId);
    return 1;
  }

  const h = rng() < 0.45 ? 2 : 3;
  const y = rect.y + 8 + Math.floor(rng() * Math.max(1, rect.h - 16 - h));
  const room = addFloorplanRoom(
    world,
    `Внутренний квартал ${blockIndex + 1}: боковой проход`,
    RoomType.CORRIDOR,
    rect.x + 1,
    y,
    rect.w - 2,
    h,
    wallTex,
    SIDEWALK_TEX,
  );
  carveFloorplanCorridor(world, room);
  connectRoomExit(world, room, rect.x, y + Math.floor(h / 2), -1, 0, sidewalkRoomId);
  connectRoomExit(world, room, rect.x + rect.w - 1, y + Math.floor(h / 2), 1, 0, sidewalkRoomId);
  return 1;
}

export function stampFloorplanBlock(world: World, sidewalkRoomId: number, rect: FloorplanRect, blockIndex: number, rng: () => number): number {
  if (rect.w < 44 || rect.h < 40 || !canBuildFloorplanRect(world, rect)) return 0;
  const wallTex = blockIndex % 7 === 0 ? Tex.BRICK : blockIndex % 5 === 0 ? Tex.CONCRETE : Tex.PANEL;
  const horizontal = rect.w >= rect.h ? rng() > 0.22 : rng() > 0.58;
  fillFloorplanWalls(world, rect, wallTex);

  let placed = 0;
  if (horizontal) {
    const corridorH = rect.h >= 68 ? 3 : 2;
    const corridorY = rect.y + Math.floor((rect.h - corridorH) / 2);
    const corridor = addFloorplanRoom(world, `Внутренний квартал ${blockIndex + 1}: общий коридор`, RoomType.CORRIDOR, rect.x + 1, corridorY, rect.w - 2, corridorH, wallTex, SIDEWALK_TEX);
    carveFloorplanRoom(world, corridor);
    connectRoomExit(world, corridor, rect.x, corridorY + Math.floor(corridorH / 2), -1, 0, sidewalkRoomId);
    connectRoomExit(world, corridor, rect.x + rect.w - 1, corridorY + Math.floor(corridorH / 2), 1, 0, sidewalkRoomId);
    placed += stampHorizontalFloorplanRow(world, corridor, blockIndex, 0, rect.y + 2, corridorY - rect.y - 3, rect.x + 2, rect.x + rect.w - 3, wallTex, rng);
    placed += stampHorizontalFloorplanRow(world, corridor, blockIndex, 1, corridorY + corridorH + 1, rect.y + rect.h - corridorY - corridorH - 3, rect.x + 2, rect.x + rect.w - 3, wallTex, rng);
    placed += stampFloorplanBranchCorridor(world, sidewalkRoomId, rect, blockIndex, true, wallTex, rng);
  } else {
    const corridorW = rect.w >= 72 ? 3 : 2;
    const corridorX = rect.x + Math.floor((rect.w - corridorW) / 2);
    const corridor = addFloorplanRoom(world, `Внутренний квартал ${blockIndex + 1}: поперечный коридор`, RoomType.CORRIDOR, corridorX, rect.y + 1, corridorW, rect.h - 2, wallTex, SIDEWALK_TEX);
    carveFloorplanRoom(world, corridor);
    connectRoomExit(world, corridor, corridorX + Math.floor(corridorW / 2), rect.y, 0, -1, sidewalkRoomId);
    connectRoomExit(world, corridor, corridorX + Math.floor(corridorW / 2), rect.y + rect.h - 1, 0, 1, sidewalkRoomId);
    placed += stampVerticalFloorplanRow(world, corridor, blockIndex, 0, rect.x + 2, corridorX - rect.x - 3, rect.y + 2, rect.y + rect.h - 3, wallTex, rng);
    placed += stampVerticalFloorplanRow(world, corridor, blockIndex, 1, corridorX + corridorW + 1, rect.x + rect.w - corridorX - corridorW - 3, rect.y + 2, rect.y + rect.h - 3, wallTex, rng);
    placed += stampFloorplanBranchCorridor(world, sidewalkRoomId, rect, blockIndex, false, wallTex, rng);
  }
  return placed;
}

export function stampManhattanBlockInteriors(world: World, sidewalkRoomId: number, rng: () => number): void {
  let blockIndex = 0;
  let placed = 0;
  for (let row = 0; row < SHELL_STREET_CENTERS.length - 1; row++) {
    for (let col = 0; col < SHELL_AVENUE_CENTERS.length - 1; col++) {
      const left = SHELL_AVENUE_CENTERS[col];
      const right = SHELL_AVENUE_CENTERS[col + 1];
      const top = SHELL_STREET_CENTERS[row];
      const bottom = SHELL_STREET_CENTERS[row + 1];
      const rect = {
        x: left + 16,
        y: top + 16,
        w: right - left - 32,
        h: bottom - top - 32,
      };
      placed += stampFloorplanBlock(world, sidewalkRoomId, rect, blockIndex++, rng);
    }
  }
  if (placed > 0) {
    world.markCellsDirty();
    world.markWallTexDirty();
    world.markFloorTexDirty();
    world.markFeaturesDirty(true);
  }
}

export const FRONTAGE_ROOM_CAP = 360;

export function frontageRoomType(serial: number): RoomType {
  const types = [
    RoomType.STORAGE,
    RoomType.OFFICE,
    RoomType.KITCHEN,
    RoomType.BATHROOM,
    RoomType.LIVING,
    RoomType.SMOKING,
  ] as const;
  return types[serial % types.length];
}

export function frontageRoomName(type: RoomType, serial: number): string {
  const prefix =
    type === RoomType.KITCHEN ? 'чайная' :
    type === RoomType.BATHROOM ? 'санузел' :
    type === RoomType.OFFICE ? 'будка' :
    type === RoomType.LIVING ? 'ночлежка' :
    type === RoomType.SMOKING ? 'курилка' :
    'кладовая';
  return `Микролавка перекрестка ${serial + 1}: ${prefix}`;
}

export function maybeStampFrontageRoom(
  world: World,
  sidewalkRoomId: number,
  span: RoadSpan,
  side: -1 | 1,
  pos: number,
  serial: number,
  rng: () => number,
): boolean {
  const half = Math.floor(span.width / 2) + SIDEWALK;
  const type = frontageRoomType(serial);
  const tex = blockRoomTex(type);
  const main = 7 + Math.floor(rng() * 8);
  const depth = 6 + Math.floor(rng() * 8);
  let x = 0;
  let y = 0;
  let w = 0;
  let h = 0;

  if (span.axis === 'vertical') {
    if (nearAnyCenter(pos, SHELL_STREET_CENTERS, 24)) return false;
    w = depth;
    h = main;
    x = side > 0 ? span.center + half + 4 : span.center - half - 4 - w;
    y = pos;
  } else {
    if (nearAnyCenter(pos, SHELL_AVENUE_CENTERS, 24)) return false;
    w = main;
    h = depth;
    x = pos;
    y = side > 0 ? span.center + half + 4 : span.center - half - 4 - h;
  }

  if (x < 3 || y < 3 || x + w >= W - 3 || y + h >= W - 3) return false;
  if (!canStampShellRoom(world, x, y, w, h)) return false;

  const room = stampNamedRoom(world, frontageRoomName(type, serial), type, x, y, w, h, tex.wall, tex.z);
  connectRoomToStreet(world, room, sidewalkRoomId);
  decorateBlockInteriorRoom(world, room, type, rng);
  return room.doors.length > 0;
}

export function stampStreetFrontageRooms(
  world: World,
  sidewalkRoomId: number,
  spans: readonly RoadSpan[],
  rng: () => number,
): void {
  let placed = 0;
  for (const span of spans) {
    const start = Math.max(12, Math.min(span.from, span.to) + 22);
    const end = Math.min(W - 18, Math.max(span.from, span.to) - 22);
    for (let pos = start; pos <= end && placed < FRONTAGE_ROOM_CAP; pos += 15 + Math.floor(rng() * 7)) {
      if (maybeStampFrontageRoom(world, sidewalkRoomId, span, -1, pos, placed, rng)) placed++;
      if (placed >= FRONTAGE_ROOM_CAP) break;
      if (maybeStampFrontageRoom(world, sidewalkRoomId, span, 1, pos, placed, rng)) placed++;
    }
  }
  if (placed > 0) {
    world.markCellsDirty();
    world.markWallTexDirty();
    world.markFloorTexDirty();
    world.markFeaturesDirty(true);
  }
}

export interface ManhattanHqCampusSpec {
  owner: TerritoryOwner;
  label: string;
  x: number;
  y: number;
  coreName: string;
}

export const MANHATTAN_HQ_CAMPUSES: readonly ManhattanHqCampusSpec[] = [
  { owner: ZoneFaction.CITIZEN, label: 'граждан', x: 286, y: 742, coreName: 'Гермодвор гражданского обхода' },
  { owner: ZoneFaction.CITIZEN, label: 'граждан западного объезда', x: 146, y: 286, coreName: 'Домком западного объезда' },
  { owner: ZoneFaction.LIQUIDATOR, label: 'ликвидаторов', x: 520, y: 472, coreName: 'Гермопост регулировщиков' },
  { owner: ZoneFaction.CULTIST, label: 'культистов', x: 856, y: 734, coreName: 'Скрытый молельный светофор' },
  { owner: ZoneFaction.SCIENTIST, label: 'ученых', x: 742, y: 286, coreName: 'Измерительный штаб разметки' },
  { owner: ZoneFaction.WILD, label: 'диких', x: 152, y: 724, coreName: 'Разбитый штаб съезда' },
];

export function roomMappedCellCount(world: World, room: Room): number {
  let count = 0;
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      if (world.roomMap[world.idx(room.x + dx, room.y + dy)] === room.id) count++;
    }
  }
  return count;
}

export function retintRoom(world: World, room: Room, wallTex: Tex, floorTex: Tex): void {
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) {
        if (world.roomMap[ci] === room.id) world.floorTex[ci] = floorTex;
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
      }
    }
  }
}

export function paintRoomOwnerCells(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[ci] === room.id) world.factionControl[ci] = owner;
    }
  }
  for (const doorIdx of room.doors) world.factionControl[doorIdx] = owner;
}

export function hardenAuthoredHqCore(world: World, room: Room, owner: TerritoryOwner, name: string): void {
  room.type = RoomType.HQ;
  room.name = name;
  room.sealed = true;
  retintRoom(world, room, Tex.HERMO_WALL, Tex.F_CONCRETE);
  paintRoomOwnerCells(world, room, owner);
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.cells[ci] !== Cell.WALL) continue;
      world.hermoWall[ci] = 1;
      world.wallTex[ci] = Tex.HERMO_WALL;
    }
  }
  for (const doorIdx of room.doors) {
    const door = world.doors.get(doorIdx);
    if (!door) continue;
    door.state = DoorState.HERMETIC_OPEN;
    door.keyId = '';
  }
  setFeatureIfFloor(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), Feature.SCREEN);
}

export function retuneSupportRoom(world: World, room: Room, owner: TerritoryOwner, label: string, index: number): void {
  const pattern = [
    { type: RoomType.KITCHEN, name: `Кухня штаба ${label}`, wall: Tex.PANEL, z: Tex.F_TILE },
    { type: RoomType.BATHROOM, name: `Санузел штаба ${label}`, wall: Tex.TILE_W, z: Tex.F_TILE },
    { type: RoomType.STORAGE, name: `Склад штаба ${label}`, wall: Tex.METAL, z: Tex.F_CONCRETE },
    { type: RoomType.MEDICAL, name: `Медпункт штаба ${label}`, wall: Tex.PANEL, z: Tex.F_TILE },
    { type: RoomType.OFFICE, name: `Канцелярия штаба ${label}`, wall: Tex.CONCRETE, z: Tex.F_LINO },
  ] as const;
  const spec = pattern[index % pattern.length];
  room.type = spec.type;
  room.name = spec.name;
  room.sealed = false;
  retintRoom(world, room, spec.wall, spec.z);
  paintRoomOwnerCells(world, room, owner);
  decorateBlockInteriorRoom(world, room, spec.type, () => 0.5);
}

export function manhattanRoomCenter(room: Room): { x: number; y: number } {
  return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
}

export function hqCandidateRooms(world: World, spec: ManhattanHqCampusSpec, used: Set<number>): Room[] {
  return world.rooms
    .filter(room =>
      room &&
      !used.has(room.id) &&
      room.type !== RoomType.CORRIDOR &&
      room.w >= 6 &&
      room.h >= 6 &&
      room.w * room.h <= 360 &&
      roomMappedCellCount(world, room) >= 24 &&
      (
        room.name.startsWith('Внутренний квартал') ||
        room.name.startsWith('Микролавка перекрестка') ||
        room.name.includes('закрытая витрина') ||
        room.name.includes('кладовая') ||
        room.name.includes('касса')
      )
    )
    .sort((a, b) => {
      const ac = manhattanRoomCenter(a);
      const bc = manhattanRoomCenter(b);
      const ad = world.dist2(ac.x, ac.y, spec.x, spec.y);
      const bd = world.dist2(bc.x, bc.y, spec.x, spec.y);
      return ad - bd || a.id - b.id;
    });
}

export function claimManhattanHqCampuses(world: World): void {
  const used = new Set<number>();
  for (const spec of MANHATTAN_HQ_CAMPUSES) {
    const candidates = hqCandidateRooms(world, spec, used);
    const core = candidates.find(room => {
      const c = manhattanRoomCenter(room);
      return world.dist2(c.x, c.y, spec.x, spec.y) <= 230 * 230;
    }) ?? candidates[0];
    if (!core) continue;
    used.add(core.id);
    hardenAuthoredHqCore(world, core, spec.owner, spec.coreName);

    let supportIndex = 0;
    for (const room of candidates) {
      if (supportIndex >= 5) break;
      if (used.has(room.id)) continue;
      const c = manhattanRoomCenter(room);
      const cc = manhattanRoomCenter(core);
      if (world.dist2(c.x, c.y, cc.x, cc.y) > 120 * 120) continue;
      used.add(room.id);
      retuneSupportRoom(world, room, spec.owner, spec.label, supportIndex++);
    }
  }
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty(false);
}

export function reinforceManhattanCrossroadsAuthoredHqTerritory(world: World): void {
  for (const spec of MANHATTAN_HQ_CAMPUSES) {
    for (const room of world.rooms) {
      if (room.name === spec.coreName) hardenAuthoredHqCore(world, room, spec.owner, spec.coreName);
      else if (room.name.includes(`штаба ${spec.label}`)) paintRoomOwnerCells(world, room, spec.owner);
    }
  }
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty(false);
}

export function expandManhattanCrossroadsRouteShell(world: World, rng: () => number): void {
  const roadRoom = logicalRoomByName(world, 'Асфальтовая сетка авеню', RoomType.CORRIDOR, ROAD_TEX);
  const sidewalkRoom = logicalRoomByName(world, 'Бордюры и служебные края', RoomType.COMMON, SIDEWALK_TEX);
  const markRoom = logicalRoomByName(world, CROSSWALK_ROOM_DEF_ID, RoomType.MEDICAL, MARK_TEX);
  const shellSpans: readonly RoadSpan[] = [
    { axis: 'vertical', center: 104, from: 0, to: W - 1, width: 9, name: 'Ложная западная авеню' },
    { axis: 'vertical', center: 232, from: 0, to: W - 1, width: 9, name: 'Западная окраинная авеню' },
    { axis: 'vertical', center: 344, from: 0, to: W - 1, width: AVENUE_WIDTH, name: 'Западная авеню' },
    { axis: 'vertical', center: 512, from: 0, to: W - 1, width: AVENUE_WIDTH, name: 'Центральная авеню' },
    { axis: 'vertical', center: 680, from: 0, to: W - 1, width: AVENUE_WIDTH, name: 'Восточная авеню' },
    { axis: 'vertical', center: 792, from: 0, to: W - 1, width: 9, name: 'Крайняя восточная авеню' },
    { axis: 'vertical', center: 920, from: 0, to: W - 1, width: 9, name: 'Ложная восточная авеню' },
    { axis: 'horizontal', center: 104, from: 0, to: W - 1, width: 7, name: 'Северный фальшобъезд' },
    { axis: 'horizontal', center: 232, from: 0, to: W - 1, width: STREET_WIDTH, name: 'Северный въезд' },
    { axis: 'horizontal', center: 344, from: 0, to: W - 1, width: STREET_WIDTH, name: 'Северная улица' },
    { axis: 'horizontal', center: 512, from: 0, to: W - 1, width: STREET_WIDTH, name: 'Главный кросс' },
    { axis: 'horizontal', center: 680, from: 0, to: W - 1, width: STREET_WIDTH, name: 'Южная улица' },
    { axis: 'horizontal', center: 792, from: 0, to: W - 1, width: STREET_WIDTH, name: 'Южный объезд' },
    { axis: 'horizontal', center: 920, from: 0, to: W - 1, width: 7, name: 'Нижний фальшобъезд' },
  ];

  for (const span of shellSpans) carveRoadSpanSafe(world, span, roadRoom.id, sidewalkRoom.id);
  paintRoadDividersForSpans(world, shellSpans, markRoom.id);
  for (const x of [104, 232, 512, 792, 920] as const) {
    for (const y of [104, 344, 680, 920] as const) paintIntersectionCrosswalks(world, x, y, AVENUE_WIDTH, STREET_WIDTH, markRoom.id);
  }
  carveDiagonalPath(world, 118, 768, 280, 634, 2, SIDEWALK_TEX, sidewalkRoom.id, true);
  carveDiagonalPath(world, 792, 256, 928, 418, 2, SIDEWALK_TEX, sidewalkRoom.id, true);
  placeBarrierRect(world, 910, 512, 46, 7);
  placeBarrierRect(world, 98, 676, 7, 46);
  stampShellStorefronts(world, sidewalkRoom.id, rng);
  stampManhattanBlockInteriors(world, sidewalkRoom.id, rng);
  stampStreetFrontageRooms(world, sidewalkRoom.id, shellSpans, rng);
  claimManhattanHqCampuses(world);
  for (const [x, y] of [[104, 104], [920, 104], [104, 920], [920, 920], [512, 920], [920, 512]] as const) {
    placeSignalCluster(world, x, y);
  }
  placeCentralTollGate(world);
}

export function stampDistrictRooms(world: World, sidewalkRoomId: number): KeyRooms {
  const rooms = [
    stampNamedRoom(world, 'Квартальный блок у Западной авеню', RoomType.LIVING, 218, 224, 86, 72, Tex.PANEL, Tex.F_LINO),
    stampNamedRoom(world, 'Гаражи под северной улицей', RoomType.STORAGE, 382, 222, 74, 48, Tex.METAL, Tex.F_CONCRETE),
    stampNamedRoom(world, 'Лифтовой павильон северного квартала', RoomType.COMMON, 496, 224, 34, 22, Tex.CONCRETE, Tex.F_TILE),
    stampNamedRoom(world, 'Витринный блок западного квартала', RoomType.STORAGE, 250, 402, 58, 28, Tex.PANEL, Tex.F_TILE),
    stampNamedRoom(world, 'Аптека у северной зебры', RoomType.MEDICAL, 548, 390, 44, 24, Tex.PANEL, Tex.F_TILE),
    stampNamedRoom(world, 'Киоск у белой зебры', RoomType.STORAGE, 384, 540, 42, 22, Tex.METAL, Tex.F_TILE),
    stampNamedRoom(world, CONTROL_ROOM_DEF_ID, RoomType.OFFICE, 474, 462, 28, 18, Tex.METAL, Tex.F_CONCRETE),
    stampNamedRoom(world, SAFE_CURB_ROOM_DEF_ID, RoomType.COMMON, 604, 464, 38, 20, Tex.PANEL, Tex.F_TILE),
    stampNamedRoom(world, TOLL_GATE_ROOM_DEF_ID, RoomType.OFFICE, 528, 526, 20, 12, Tex.METAL, Tex.F_CONCRETE),
    stampNamedRoom(world, CARGO_ROOM_DEF_ID, RoomType.STORAGE, 548, 548, 50, 32, Tex.METAL, Tex.F_CONCRETE),
    stampNamedRoom(world, 'Сервисная светофора', RoomType.PRODUCTION, 622, 548, 34, 28, Tex.PIPE, Tex.F_CONCRETE),
    stampNamedRoom(world, 'Низкий тоннель под Восточной авеню', RoomType.CORRIDOR, 650, 626, 84, 14, Tex.PIPE, Tex.F_CONCRETE),
    stampNamedRoom(world, WRONG_TURN_ROOM_DEF_ID, RoomType.CORRIDOR, 744, 614, 82, 16, Tex.CONCRETE, Tex.F_CONCRETE),
    stampNamedRoom(world, 'Дворовая кладовая дорожников', RoomType.STORAGE, 724, 708, 48, 36, Tex.PANEL, Tex.F_CONCRETE),
    stampNamedRoom(world, 'Магазин под эстакадой', RoomType.STORAGE, 676, 452, 48, 26, Tex.METAL, Tex.F_TILE),
    stampNamedRoom(world, 'Южный лифтовой вестибюль', RoomType.COMMON, 498, 782, 36, 24, Tex.CONCRETE, Tex.F_TILE),
    stampNamedRoom(world, 'Квартиры над Южной улицей', RoomType.LIVING, 222, 724, 86, 70, Tex.PANEL, Tex.F_LINO),
  ];

  for (const room of rooms) connectRoomToStreet(world, room, sidewalkRoomId);

  const control = rooms.find(r => r.name === CONTROL_ROOM_DEF_ID)!;
  const cargo = rooms.find(r => r.name === CARGO_ROOM_DEF_ID)!;
  const wrongTurn = rooms.find(r => r.name === WRONG_TURN_ROOM_DEF_ID)!;
  const safeCurb = rooms.find(r => r.name === SAFE_CURB_ROOM_DEF_ID)!;
  const kiosk = rooms.find(r => r.name === 'Киоск у белой зебры')!;
  const tollGate = rooms.find(r => r.name === TOLL_GATE_ROOM_DEF_ID)!;
  const underpass = rooms.find(r => r.name === 'Низкий тоннель под Восточной авеню')!;
  connectRoomExit(world, underpass, underpass.x - 1, underpass.y + Math.floor(underpass.h / 2), -1, 0, sidewalkRoomId);
  connectRoomExit(world, underpass, underpass.x + underpass.w, underpass.y + Math.floor(underpass.h / 2), 1, 0, sidewalkRoomId);

  for (let dx = 3; dx < control.w - 3; dx += 5) setFeatureIfFloor(world, control.x + dx, control.y + 4, Feature.SCREEN);
  setFeatureIfFloor(world, control.x + 4, control.y + control.h - 3, Feature.DESK);
  setFeatureIfFloor(world, control.x + control.w - 5, control.y + control.h - 4, Feature.LAMP);

  for (let dx = 3; dx < cargo.w - 2; dx += 7) setFeatureIfFloor(world, cargo.x + dx, cargo.y + 3, Feature.SHELF);
  setFeatureIfFloor(world, cargo.x + cargo.w - 4, cargo.y + cargo.h - 4, Feature.MACHINE);
  setFeatureIfFloor(world, cargo.x + 5, cargo.y + cargo.h - 4, Feature.LAMP);

  for (let dx = 4; dx < wrongTurn.w - 4; dx += 8) {
    setFeatureIfFloor(world, wrongTurn.x + dx, wrongTurn.y + 3, Feature.SCREEN);
    setFeatureIfFloor(world, wrongTurn.x + dx, wrongTurn.y + wrongTurn.h - 4, Feature.LAMP);
  }
  setFeatureIfFloor(world, wrongTurn.x + wrongTurn.w - 4, wrongTurn.y + Math.floor(wrongTurn.h / 2), Feature.LIFT_BUTTON);
  setFeatureIfFloor(world, safeCurb.x + 4, safeCurb.y + 4, Feature.TABLE);
  setFeatureIfFloor(world, safeCurb.x + 8, safeCurb.y + 4, Feature.CHAIR);
  setFeatureIfFloor(world, kiosk.x + 4, kiosk.y + 4, Feature.SHELF);
  setFeatureIfFloor(world, kiosk.x + kiosk.w - 5, kiosk.y + 4, Feature.LAMP);
  setFeatureIfFloor(world, tollGate.x + 4, tollGate.y + 3, Feature.DESK);
  setFeatureIfFloor(world, tollGate.x + 9, tollGate.y + 3, Feature.SCREEN);
  setFeatureIfFloor(world, tollGate.x + 15, tollGate.y + 8, Feature.SHELF);
  for (let dx = 6; dx < underpass.w - 4; dx += 12) setFeatureIfFloor(world, underpass.x + dx, underpass.y + 4, Feature.LAMP);

  return { control, cargo, wrongTurn, safeCurb, kiosk, tollGate };
}

export function placeCentralTollGate(world: World): void {
  const y = 536;
  for (let x = 504; x <= 520; x++) {
    const ci = world.idx(x, y);
    if (!canRetuneStreetCell(world, ci) || world.cells[ci] !== Cell.FLOOR) continue;
    world.cells[ci] = Cell.WALL;
    world.wallTex[ci] = Tex.METAL;
    world.roomMap[ci] = -1;
    world.features[ci] = Feature.NONE;
  }

  const doorIdx = world.idx(512, y);
  world.cells[doorIdx] = Cell.DOOR;
  world.wallTex[doorIdx] = Tex.DOOR_METAL;
  world.floorTex[doorIdx] = ROAD_TEX;
  world.doors.set(doorIdx, {
    idx: doorIdx,
    state: DoorState.LOCKED,
    roomA: -1,
    roomB: -1,
    keyId: 'key',
    timer: 0,
  });
  setFeatureIfFloor(world, 508, y - 2, Feature.SCREEN);
  setFeatureIfFloor(world, 516, y - 2, Feature.LAMP);
}

export function placeSignalCluster(world: World, x: number, y: number): void {
  for (const [dx, dy] of [[-8, -8], [8, -8], [-8, 8], [8, 8]] as const) {
    setFeatureIfFloor(world, x + dx, y + dy, Feature.SCREEN);
    paintSurfaceRect(world, x + dx, y + dy, 4, 4, 11, 11, 215, 35, 25, 210);
  }
  for (const [dx, dy] of [[-10, 0], [10, 0], [0, -10], [0, 10]] as const) {
    setFeatureIfFloor(world, x + dx, y + dy, Feature.LAMP);
  }
}

export function placeLift(world: World, x: number, y: number, dir: LiftDirection, buttonX: number, buttonY: number): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.liftDir[ci] = dir;
  setFeatureIfFloor(world, buttonX, buttonY, Feature.LIFT_BUTTON);
}

export function placeDistrictLifts(world: World): void {
  placeLift(world, 512, 223, LiftDirection.UP, 512, 247);
  placeLift(world, 516, 782, LiftDirection.DOWN, 516, 781);
  placeLift(world, 823, 622, LiftDirection.UP, 822, 622);
}

export function applyZones(world: World): void {
  generateZones(world);
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, CENTER, CENTER);
    zone.level = Math.max(2, Math.min(5, calcZoneLevel(zone.cx, zone.cy, 8) + (d < 150 ? 2 : 1)));
    if (d < 130) zone.faction = ZoneFaction.LIQUIDATOR;
    else if (zone.cx > CENTER + 120) zone.faction = ZoneFaction.WILD;
    else zone.faction = ZoneFaction.CITIZEN;
    zone.fogged = false;
    zone.hasLift = d < 280;
  }
}

export function carveStreetGrid(world: World, roadRoomId: number, sidewalkRoomId: number, markRoomId: number): void {
  for (const span of ROAD_SPANS) carveRoadSpan(world, span, roadRoomId, sidewalkRoomId);
  paintRoadDividers(world, markRoomId);
  for (const x of AVENUE_CENTERS) {
    for (const y of STREET_CENTERS) paintIntersectionCrosswalks(world, x, y, AVENUE_WIDTH, STREET_WIDTH, markRoomId);
  }
  paintIntersectionCrosswalks(world, 512, 600, AVENUE_WIDTH, STREET_WIDTH, markRoomId);
  placeSignalCluster(world, 512, 512);
  placeSignalCluster(world, 512, 600);
  placeSignalCluster(world, 680, 512);
  placeSignalCluster(world, 344, 344);
  placeSignalCluster(world, 232, 680);
  dressStreetMotifs(world, sidewalkRoomId, markRoomId);
}
