import {
  Cell,
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
} from '../../core/types';
import { auditReachability, hasReachableAdjacentCell, World } from '../../core/world';
import { Spr } from '../../render/sprite_index';
import { stampSurfaceSplat } from '../../systems/surface_marks';
import { stampRoom } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { rng } from '../../core/rand';
import { MARKOV_STAIRWELL_ROUTE_ID, MARKOV_STAIRWELL_Z, MARKOV_STAIRWELL_BYPASS_KEY, SPINE_X, SPINE_Y, SPINE_W, SPINE_H, LANDING_COUNT, LANDING_Y0, LANDING_STEP, SERVICE_X, SERVICE_W, SERVICE_ENTRY_STEP, SERVICE_EXIT_STEP, RARE_STEP_MIN, RARE_STEP_SPAN, GRAPH_NODE_W, GRAPH_NODE_H, GRAPH_ROW_Y, GRAPH_COLUMNS, LEFT_TRUNK_X, RIGHT_TRUNK_X, GRAPH_RING_LEFT, GRAPH_RING_RIGHT, GRAPH_RING_TOP, GRAPH_RING_BOTTOM, HQ_SUPPORT_LIMIT, MotifId, HiddenState, DoorSide, WeightedMotif, ChainRoom, HqSpec, MarkovStairwellMetrics, MOTIFS, TRANSITIONS, MARKOV_HQ_SPECS } from "./meta";

export const markovMetrics = new WeakMap<World, MarkovStairwellMetrics>();

export function weightedPick(options: readonly WeightedMotif[]): MotifId {
  let total = 0;
  for (const option of options) total += option.weight;
  let roll = rng() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option.id;
  }
  return options[options.length - 1]?.id ?? 'landing';
}

export function buildSequence(): MotifId[] {
  const out: MotifId[] = ['landing'];
  let current: MotifId = 'landing';
  for (let i = 1; i < LANDING_COUNT; i++) {
    current = weightedPick(TRANSITIONS[current]);
    out.push(current);
  }
  const rareStep = RARE_STEP_MIN + Math.floor(rng() * RARE_STEP_SPAN);
  out[rareStep] = 'rare';
  if (rareStep > 1) out[rareStep - 2] = 'kitchen';
  if (rareStep > 0) out[rareStep - 1] = 'bath';
  if (rareStep + 1 < out.length) out[rareStep + 1] = 'storage';
  return out;
}

export function hiddenState(motif: MotifId, step: number, previous: MotifId): HiddenState {
  if (motif === 'rare') return 'rare';
  if (motif === previous && step > 0) return 'hunting';
  if ((motif === 'registry' && step % 3 === 1) || (motif === 'service' && step % 4 === 2)) return 'watched';
  if ((motif === 'bath' || motif === 'storage') && rng() < 0.28) return 'hunting';
  if (rng() < 0.18) return 'watched';
  return 'quiet';
}

export function addRoom(
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
  const room = stampRoom(world, world.rooms.length, type, Math.floor(x), Math.floor(y), w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) world.floorTex[ci] = floorTex;
      else world.wallTex[ci] = wallTex;
    }
  }
  return room;
}

export function carveRect(world: World, x: number, y: number, w: number, h: number, floorTex: Tex, wallTex: Tex): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) {
        if (world.cells[ci] !== Cell.LIFT && world.cells[ci] !== Cell.DOOR) {
          world.cells[ci] = Cell.FLOOR;
          world.roomMap[ci] = -1;
          world.floorTex[ci] = floorTex;
        }
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
      }
    }
  }
}

export function carveLine(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  wallTex: Tex,
): void {
  const half = width >> 1;
  if (ay === by) {
    const minX = Math.min(ax, bx);
    carveRect(world, minX, ay - half, Math.abs(bx - ax) + 1, width, floorTex, wallTex);
    return;
  }
  const minY = Math.min(ay, by);
  carveRect(world, ax - half, minY, width, Math.abs(by - ay) + 1, floorTex, wallTex);
}

export function addDoor(world: World, room: Room, x: number, y: number, state = DoorState.CLOSED, keyId = ''): number {
  const idx = world.idx(x, y);
  world.cells[idx] = Cell.DOOR;
  world.wallTex[idx] = state === DoorState.LOCKED ? Tex.DOOR_METAL : Tex.DOOR_WOOD;
  world.hermoWall[idx] = 0;
  const horizontalPassage = x === room.x - 1 || x === room.x + room.w;
  const jambs: [number, number][] = horizontalPassage
    ? [[x, y - 1], [x, y + 1]]
    : [[x - 1, y], [x + 1, y]];
  for (const [jx, jy] of jambs) {
    const ji = world.idx(jx, jy);
    if (world.cells[ji] === Cell.LIFT) continue;
    world.cells[ji] = Cell.WALL;
    world.roomMap[ji] = -1;
    world.features[ji] = Feature.NONE;
    world.wallTex[ji] = room.wallTex;
  }
  world.doors.set(idx, {
    idx,
    state,
    roomA: room.id,
    roomB: -1,
    keyId,
    timer: 0,
  });
  if (!room.doors.includes(idx)) room.doors.push(idx);
  return idx;
}

export function doorOffset(size: number, offset = 0): number {
  const center = size >> 1;
  return Math.max(1, Math.min(size - 2, center + offset));
}

export function addSideDoor(
  world: World,
  room: Room,
  side: DoorSide,
  offset = 0,
  state = DoorState.CLOSED,
  keyId = '',
): { idx: number; x: number; y: number; outX: number; outY: number } {
  const horizontal = side === 'north' || side === 'south';
  const x = horizontal ? room.x + doorOffset(room.w, offset) : side === 'west' ? room.x - 1 : room.x + room.w;
  const y = horizontal ? side === 'north' ? room.y - 1 : room.y + room.h : room.y + doorOffset(room.h, offset);
  const idx = addDoor(world, room, x, y, state, keyId);
  const outX = side === 'west' ? x - 1 : side === 'east' ? x + 1 : x;
  const outY = side === 'north' ? y - 1 : side === 'south' ? y + 1 : y;
  return { idx, x, y, outX, outY };
}

export function connectRoomToPoint(
  world: World,
  room: Room,
  side: DoorSide,
  tx: number,
  ty: number,
  width: number,
  floorTex: Tex,
  wallTex: Tex,
  state = DoorState.CLOSED,
  keyId = '',
): number {
  const door = addSideDoor(world, room, side, 0, state, keyId);
  carveLine(world, door.outX, door.outY, tx, ty, width, floorTex, wallTex);
  return door.idx;
}

export function sideTowardPoint(room: Room, x: number, y: number): DoorSide {
  if (x < room.x) return 'west';
  if (x > room.x + room.w) return 'east';
  if (y < room.y) return 'north';
  return 'south';
}

export function paintRoomTerritory(world: World, room: Room, owner: ZoneFaction): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (!world.aptMask[ci]) world.factionControl[ci] = owner;
    }
  }
  for (const doorIdx of room.doors) world.factionControl[doorIdx] = owner;
}

export function paintTerritoryPatch(world: World, x: number, y: number, radius: number, owner: ZoneFaction): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const ci = world.idx(x + dx, y + dy);
      if (!world.aptMask[ci]) world.factionControl[ci] = owner;
    }
  }
}

export function makeHermeticCore(world: World, room: Room): void {
  room.type = RoomType.HQ;
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.cells[ci] !== Cell.WALL || world.aptMask[ci]) continue;
      world.hermoWall[ci] = 1;
      world.wallTex[ci] = Tex.HERMO_WALL;
    }
  }
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.features[ci] = feature;
  if (feature === Feature.SCREEN && !world.screenCells.includes(ci)) world.screenCells.push(ci);
}

export function setLift(world: World, x: number, y: number, direction: LiftDirection): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.liftDir[ci] = direction;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.floorTex[ci] = Tex.F_CONCRETE;
  world.roomMap[ci] = -1;
  world.features[ci] = Feature.NONE;
}

export function decorateChainRoom(world: World, entry: ChainRoom): number {
  const room = entry.room;
  const motif = MOTIFS[entry.motif];
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  let tellCells = 0;

  setFeature(world, room.x + 4, room.y + 4, motif.feature);
  setFeature(world, room.x + room.w - 5, room.y + room.h - 5, entry.state === 'hunting' ? Feature.CANDLE : Feature.LAMP);
  tellCells += 2;

  const color = entry.state === 'rare'
    ? [80, 145, 92]
    : entry.state === 'hunting'
      ? [125, 36, 34]
      : entry.state === 'watched'
        ? [54, 94, 150]
        : [172, 164, 126];
  stampSurfaceSplat(world, cx, cy, 0.5, 0.5, entry.state === 'rare' ? 8 : 3.5, 0.18, room.id * 917 + entry.step, color[0], color[1], color[2], false);

  if (entry.state === 'watched') {
    setFeature(world, cx, room.y + 3, Feature.SCREEN);
    tellCells++;
  }
  if (entry.state === 'hunting') {
    for (let dx = -6; dx <= 6; dx += 6) {
      setFeature(world, cx + dx, cy, Feature.CANDLE);
      tellCells++;
    }
  }
  if (entry.state === 'rare') {
    setFeature(world, cx, cy, Feature.SCREEN);
    setFeature(world, cx - 5, cy, Feature.CANDLE);
    setFeature(world, cx + 5, cy, Feature.CANDLE);
    tellCells += 3;
  }

  return tellCells;
}

export function dropItem(
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  defId: string,
  count: number,
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
    inventory: [{ defId, count }],
  });
}

export function tuneZones(world: World): void {
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, SPINE_X + SPINE_W / 2, SPINE_Y + SPINE_H / 2);
    zone.faction = d < 220 ? ZoneFaction.CITIZEN : zone.id % 5 === 0 ? ZoneFaction.WILD : ZoneFaction.LIQUIDATOR;
    zone.level = Math.max(2, Math.min(5, Math.round(2 + d / 250)));
  }
}

export function featureForSupportRoom(type: RoomType, secondary = false): Feature {
  switch (type) {
    case RoomType.KITCHEN: return secondary ? Feature.TABLE : Feature.STOVE;
    case RoomType.BATHROOM: return secondary ? Feature.TOILET : Feature.SINK;
    case RoomType.STORAGE: return Feature.SHELF;
    case RoomType.MEDICAL: return secondary ? Feature.DESK : Feature.SINK;
    case RoomType.OFFICE: return secondary ? Feature.SCREEN : Feature.DESK;
    case RoomType.PRODUCTION: return secondary ? Feature.APPARATUS : Feature.MACHINE;
    case RoomType.COMMON: return secondary ? Feature.CHAIR : Feature.TABLE;
    default: return secondary ? Feature.LAMP : Feature.TABLE;
  }
}

export function decorateSupportRoom(world: World, room: Room): void {
  setFeature(world, room.x + 3, room.y + 3, featureForSupportRoom(room.type));
  setFeature(world, room.x + room.w - 4, room.y + room.h - 4, featureForSupportRoom(room.type, true));
}

export function buildHqCompound(world: World, spec: HqSpec): void {
  const coreW = spec.strong ? 42 : 32;
  const coreH = spec.strong ? 26 : 20;
  const core = addRoom(
    world,
    RoomType.HQ,
    spec.x,
    spec.y,
    coreW,
    coreH,
    `Марковская лестница: штаб ${spec.title}`,
    spec.wallTex,
    spec.floorTex,
  );
  makeHermeticCore(world, core);
  setFeature(world, core.x + 5, core.y + 5, Feature.SCREEN);
  setFeature(world, core.x + core.w - 6, core.y + core.h - 5, Feature.DESK);
  const hubX = core.x + (core.w >> 1);
  const hubY = core.y + core.h + 18;
  connectRoomToPoint(world, core, 'south', hubX, hubY, 4, spec.supportFloorTex, spec.supportWallTex, DoorState.HERMETIC_OPEN);

  const supports: readonly [RoomType, number, number, number, number, string][] = [
    [RoomType.COMMON, -36, coreH + 24, 30, 16, 'общая'],
    [RoomType.KITCHEN, -36, coreH + 48, 30, 14, 'кухня'],
    [RoomType.STORAGE, coreW + 8, coreH + 48, 30, 14, 'склад'],
    [RoomType.MEDICAL, coreW + 44, coreH + 24, 30, 16, 'медпункт'],
    [RoomType.OFFICE, coreW + 8, -22, 30, 14, 'дежурная'],
    [RoomType.PRODUCTION, coreW + 44, -2, 30, 14, 'мастерская'],
  ];
  const limit = spec.strong ? supports.length : HQ_SUPPORT_LIMIT;
  for (let i = 0; i < limit; i++) {
    const [type, dx, dy, w, h, suffix] = supports[i];
    const room = addRoom(
      world,
      type,
      spec.x + dx,
      spec.y + dy,
      w,
      h,
      `Марковская лестница: ${spec.title}, ${suffix}`,
      spec.supportWallTex,
      spec.supportFloorTex,
    );
    decorateSupportRoom(world, room);
    connectRoomToPoint(world, room, sideTowardPoint(room, hubX, hubY), hubX, hubY, 3, spec.supportFloorTex, spec.supportWallTex);
    paintRoomTerritory(world, room, spec.owner);
  }

  const routeY = hubY < W / 2 ? GRAPH_RING_TOP : GRAPH_RING_BOTTOM;
  carveLine(world, hubX, hubY, hubX, routeY, 3, spec.supportFloorTex, spec.supportWallTex);
  paintRoomTerritory(world, core, spec.owner);
  paintTerritoryPatch(world, hubX, hubY, spec.strong ? 44 : 34, spec.owner);
}

export function markovGraphMotif(row: number, col: number): MotifId {
  const motifs: readonly MotifId[] = ['landing', 'registry', 'kitchen', 'bath', 'storage', 'service', 'rare'];
  if (row === 2 && col === 2) return 'rare';
  return motifs[(row * 3 + col * 2 + (col > 2 ? 1 : 0)) % motifs.length];
}

export function decorateGraphNode(world: World, room: Room, motif: MotifId, row: number, col: number): void {
  const def = MOTIFS[motif];
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  setFeature(world, room.x + 4, room.y + 4, def.feature);
  setFeature(world, room.x + room.w - 5, room.y + 4, Feature.SCREEN);
  setFeature(world, cx, room.y + room.h - 5, row % 2 === 0 ? Feature.TABLE : Feature.SHELF);
  if (motif === 'rare' || (row + col) % 4 === 0) setFeature(world, cx + 8, cy, Feature.CANDLE);
  stampSurfaceSplat(
    world,
    cx,
    cy,
    0.5,
    0.5,
    motif === 'rare' ? 7 : 3.2,
    0.14,
    0x4d41524b ^ (row * 97 + col * 131),
    motif === 'rare' ? 82 : 132,
    motif === 'registry' || motif === 'service' ? 112 : 96,
    motif === 'bath' || motif === 'rare' ? 146 : 78,
    false,
  );
}

export function addGraphMicroRoom(
  world: World,
  node: Room,
  rowY: number,
  index: number,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  side: DoorSide,
  suffix: string,
): Room {
  const tile = type === RoomType.KITCHEN || type === RoomType.BATHROOM || type === RoomType.MEDICAL;
  const room = addRoom(
    world,
    type,
    x,
    y,
    w,
    h,
    `Марковская лестница: микро ${String(index).padStart(3, '0')} ${suffix}`,
    tile ? Tex.TILE_W : Tex.PANEL,
    tile ? Tex.F_TILE : Tex.F_LINO,
  );
  decorateSupportRoom(world, room);
  const targetX = Math.max(node.x - 2, Math.min(node.x + node.w + 2, room.x + (room.w >> 1)));
  const targetY = side === 'north' ? rowY + 3 : side === 'south' ? rowY - 3 : rowY;
  connectRoomToPoint(world, room, side, targetX, targetY, 2, Tex.F_LINO, Tex.PANEL);
  return room;
}

export function buildMarkovTransitionGraph(world: World): void {
  carveLine(world, GRAPH_RING_LEFT, GRAPH_RING_TOP, GRAPH_RING_RIGHT, GRAPH_RING_TOP, 5, Tex.F_LINO, Tex.PANEL);
  carveLine(world, GRAPH_RING_LEFT, GRAPH_RING_BOTTOM, GRAPH_RING_RIGHT, GRAPH_RING_BOTTOM, 5, Tex.F_LINO, Tex.PANEL);
  carveLine(world, GRAPH_RING_LEFT, GRAPH_RING_TOP, GRAPH_RING_LEFT, GRAPH_RING_BOTTOM, 5, Tex.F_LINO, Tex.PANEL);
  carveLine(world, GRAPH_RING_RIGHT, GRAPH_RING_TOP, GRAPH_RING_RIGHT, GRAPH_RING_BOTTOM, 5, Tex.F_LINO, Tex.PANEL);
  carveLine(world, LEFT_TRUNK_X, GRAPH_RING_TOP, LEFT_TRUNK_X, GRAPH_RING_BOTTOM, 5, Tex.F_LINO, Tex.PANEL);
  carveLine(world, RIGHT_TRUNK_X, GRAPH_RING_TOP, RIGHT_TRUNK_X, GRAPH_RING_BOTTOM, 5, Tex.F_CONCRETE, Tex.PIPE);

  const topLinkY = SPINE_Y + 14;
  const bottomLinkY = SPINE_Y + SPINE_H - 18;
  carveLine(world, LEFT_TRUNK_X, topLinkY, SPINE_X - 1, topLinkY, 4, Tex.F_LINO, Tex.PANEL);
  carveLine(world, RIGHT_TRUNK_X, topLinkY, SPINE_X + SPINE_W, topLinkY, 4, Tex.F_CONCRETE, Tex.PIPE);
  carveLine(world, LEFT_TRUNK_X, bottomLinkY, SPINE_X - 1, bottomLinkY, 4, Tex.F_LINO, Tex.PANEL);
  carveLine(world, RIGHT_TRUNK_X, bottomLinkY, SPINE_X + SPINE_W, bottomLinkY, 4, Tex.F_CONCRETE, Tex.PIPE);

  for (const y of GRAPH_ROW_Y) {
    carveLine(world, GRAPH_RING_LEFT, y, LEFT_TRUNK_X, y, 3, Tex.F_LINO, Tex.PANEL);
    carveLine(world, RIGHT_TRUNK_X, y, GRAPH_RING_RIGHT, y, 3, Tex.F_CONCRETE, Tex.PIPE);
  }

  let microIndex = 0;
  for (let row = 0; row < GRAPH_ROW_Y.length; row++) {
    const rowY = GRAPH_ROW_Y[row];
    for (let col = 0; col < GRAPH_COLUMNS.length; col++) {
      const column = GRAPH_COLUMNS[col];
      const motif = markovGraphMotif(row, col);
      const def = MOTIFS[motif];
      const node = addRoom(
        world,
        RoomType.OFFICE,
        column.x,
        rowY - (GRAPH_NODE_H >> 1),
        GRAPH_NODE_W,
        GRAPH_NODE_H,
        `Марковская лестница: граф ${column.label}-${row + 1} ${def.label}`,
        motif === 'service' ? Tex.PIPE : motif === 'rare' ? Tex.DARK : Tex.MARBLE,
        motif === 'service' ? Tex.F_CONCRETE : motif === 'rare' ? Tex.F_GREEN_CARPET : Tex.F_PARQUET,
      );
      decorateGraphNode(world, node, motif, row, col);
      addSideDoor(world, node, 'west');
      addSideDoor(world, node, 'east');

      addGraphMicroRoom(world, node, rowY, microIndex++, RoomType.STORAGE, node.x + 2, node.y - 28, 16, 11, 'south', 'шкаф перехода');
      addGraphMicroRoom(world, node, rowY, microIndex++, RoomType.OFFICE, node.x + 23, node.y - 30, 18, 12, 'south', 'кабинка расчёта');
      addGraphMicroRoom(world, node, rowY, microIndex++, RoomType.BATHROOM, node.x + 2, node.y + node.h + 17, 17, 11, 'north', 'мокрая петля');
      addGraphMicroRoom(world, node, rowY, microIndex++, RoomType.STORAGE, node.x + 23, node.y + node.h + 15, 18, 12, 'north', 'архив шага');
    }
  }
}

export function addTerraceMicroRoom(
  world: World,
  terrace: Room,
  index: number,
  left: boolean,
): void {
  const x = left ? terrace.x - 22 : terrace.x + terrace.w + 8;
  const y = terrace.y + 6;
  const room = addRoom(
    world,
    left ? RoomType.STORAGE : RoomType.OFFICE,
    x,
    y,
    left ? 14 : 16,
    12,
    `Марковская лестница: микроклетка террасы ${String(index).padStart(2, '0')}${left ? 'л' : 'п'}`,
    left ? Tex.METAL : Tex.MARBLE,
    left ? Tex.F_CONCRETE : Tex.F_PARQUET,
  );
  decorateSupportRoom(world, room);
  connectRoomToPoint(
    world,
    room,
    left ? 'east' : 'west',
    left ? terrace.x - 1 : terrace.x + terrace.w,
    terrace.y + (terrace.h >> 1),
    2,
    terrace.floorTex,
    terrace.wallTex,
  );
}

export function buildMarkovTerraceCells(world: World): void {
  const terraceXs = [70, 186, 302, 648, 764, 880] as const;
  let terraceIndex = 0;
  for (let row = 0; row < GRAPH_ROW_Y.length - 1; row++) {
    const upperY = GRAPH_ROW_Y[row];
    const lowerY = GRAPH_ROW_Y[row + 1];
    const y = Math.round((upperY + lowerY) / 2 - 12);
    for (let col = 0; col < terraceXs.length; col++) {
      const x = terraceXs[col];
      const type = col % 3 === 0 ? RoomType.COMMON : col % 3 === 1 ? RoomType.STORAGE : RoomType.PRODUCTION;
      const room = addRoom(
        world,
        type,
        x,
        y,
        54,
        24,
        `Марковская лестница: терраса переходов ${row + 1}-${col + 1}`,
        type === RoomType.PRODUCTION ? Tex.PIPE : type === RoomType.STORAGE ? Tex.METAL : Tex.PANEL,
        type === RoomType.PRODUCTION || type === RoomType.STORAGE ? Tex.F_CONCRETE : Tex.F_LINO,
      );
      decorateSupportRoom(world, room);
      setFeature(world, room.x + (room.w >> 1), room.y + (room.h >> 1), col % 2 === 0 ? Feature.SCREEN : Feature.APPARATUS);
      connectRoomToPoint(world, room, 'north', room.x + (room.w >> 1), upperY, 3, room.floorTex, room.wallTex);
      connectRoomToPoint(world, room, 'south', room.x + (room.w >> 1), lowerY, 3, room.floorTex, room.wallTex);
      addTerraceMicroRoom(world, room, terraceIndex, true);
      addTerraceMicroRoom(world, room, terraceIndex, false);
      terraceIndex++;
    }
  }
}

export function buildMarkovHqCompounds(world: World): void {
  for (const spec of MARKOV_HQ_SPECS) buildHqCompound(world, spec);
}

export function reinforceMarkovStairwellAuthoredHqTerritory(world: World): void {
  for (const spec of MARKOV_HQ_SPECS) {
    let patched = 0;
    for (const room of world.rooms) {
      if (!room.name.includes(spec.title)) continue;
      if (room.type === RoomType.HQ) makeHermeticCore(world, room);
      paintRoomTerritory(world, room, spec.owner);
      const cx = room.x + (room.w >> 1);
      const cy = room.y + (room.h >> 1);
      if (room.type === RoomType.HQ) paintTerritoryPatch(world, cx, cy, spec.strong ? 48 : 36, spec.owner);
      patched++;
    }
    if (patched === 0) continue;
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(true);
}

export function buildGeometry(world: World): { chain: ChainRoom[]; watcherRoom: Room; patternRoom: Room; rareRoom: Room; tellCells: number; serviceCells: number; lockedDoors: number } {
  const spine = addRoom(world, RoomType.CORRIDOR, SPINE_X, SPINE_Y, SPINE_W, SPINE_H, 'Марковская лестница: основной марш', Tex.PANEL, Tex.F_LINO);
  const sequence = buildSequence();
  const chain: ChainRoom[] = [];
  let tellCells = 0;
  let patternRoom: Room | undefined;
  let rareRoom: Room | undefined;
  let previous = sequence[0];

  setLift(world, SPINE_X + (SPINE_W >> 1), SPINE_Y + 10, LiftDirection.UP);
  setLift(world, SPINE_X + (SPINE_W >> 1), SPINE_Y + SPINE_H - 12, LiftDirection.DOWN);
  for (let y = SPINE_Y + 34; y < SPINE_Y + SPINE_H - 28; y += 28) setFeature(world, SPINE_X + (SPINE_W >> 1), y, Feature.LAMP);

  for (let step = 0; step < LANDING_COUNT; step++) {
    const motifId = sequence[step];
    const motif = MOTIFS[motifId];
    const state = hiddenState(motifId, step, previous);
    previous = motifId;

    const y = LANDING_Y0 + step * LANDING_STEP;
    const leftSide = step % 2 === 0;
    const roomX = leftSide ? SPINE_X - 46 - motif.w : SPINE_X + SPINE_W + 46;
    const room = addRoom(
      world,
      motif.type,
      roomX,
      y - (motif.h >> 1),
      motif.w,
      motif.h,
      motifId === 'rare'
        ? 'Марковская лестница: редкое состояние М'
        : `Марковская лестница: ${String(step + 1).padStart(2, '0')} ${motif.label}`,
      motif.wallTex,
      motif.floorTex,
    );
    const cy = room.y + (room.h >> 1);
    if (leftSide) {
      addDoor(world, room, room.x + room.w, cy);
      carveLine(world, room.x + room.w + 1, cy, SPINE_X - 1, cy, 3, Tex.F_LINO, Tex.PANEL);
    } else {
      addDoor(world, room, room.x - 1, cy);
      carveLine(world, SPINE_X + SPINE_W, cy, room.x - 2, cy, 3, Tex.F_LINO, Tex.PANEL);
    }
    const entry = { room, motif: motifId, state, step };
    tellCells += decorateChainRoom(world, entry);
    chain.push(entry);
    if (step > 1 && sequence[step - 2] === 'kitchen' && sequence[step - 1] === 'bath' && motifId === 'rare') patternRoom = room;
    if (motifId === 'rare') rareRoom = room;
  }

  const serviceY1 = LANDING_Y0 + SERVICE_ENTRY_STEP * LANDING_STEP;
  const serviceY2 = LANDING_Y0 + SERVICE_EXIT_STEP * LANDING_STEP;
  carveLine(world, SERVICE_X, serviceY1, SERVICE_X, serviceY2, SERVICE_W, Tex.F_CONCRETE, Tex.PIPE);
  carveLine(world, SPINE_X + SPINE_W, serviceY1, SERVICE_X - (SERVICE_W >> 1) - 1, serviceY1, 3, Tex.F_CONCRETE, Tex.PIPE);
  carveLine(world, SPINE_X + SPINE_W, serviceY2, SERVICE_X - (SERVICE_W >> 1) - 1, serviceY2, 3, Tex.F_CONCRETE, Tex.PIPE);
  const lockedDoors = addDoor(world, spine, SPINE_X + SPINE_W, serviceY1, DoorState.LOCKED, MARKOV_STAIRWELL_BYPASS_KEY) >= 0 ? 1 : 0;
  addDoor(world, spine, SPINE_X + SPINE_W, serviceY2, DoorState.CLOSED);
  for (let y = serviceY1 + 18; y < serviceY2; y += 36) {
    setFeature(world, SERVICE_X, y, y % 72 === 0 ? Feature.APPARATUS : Feature.LAMP);
    tellCells++;
  }

  const watcherRoom = addRoom(world, RoomType.OFFICE, SPINE_X - 150, SPINE_Y + 20, 78, 26, 'Марковская лестница: стол учёта переходов', Tex.MARBLE, Tex.F_PARQUET);
  addDoor(world, watcherRoom, watcherRoom.x + watcherRoom.w, watcherRoom.y + (watcherRoom.h >> 1));
  carveLine(world, watcherRoom.x + watcherRoom.w + 1, watcherRoom.y + (watcherRoom.h >> 1), SPINE_X - 1, watcherRoom.y + (watcherRoom.h >> 1), 3, Tex.F_LINO, Tex.PANEL);
  setFeature(world, watcherRoom.x + 5, watcherRoom.y + 5, Feature.DESK);
  setFeature(world, watcherRoom.x + watcherRoom.w - 6, watcherRoom.y + 5, Feature.SCREEN);
  tellCells += 2;

  if (!rareRoom) rareRoom = chain[Math.min(chain.length - 1, RARE_STEP_MIN)].room;
  if (!patternRoom) patternRoom = rareRoom;

  buildMarkovTransitionGraph(world);
  buildMarkovTerraceCells(world);
  buildMarkovHqCompounds(world);
  reinforceMarkovStairwellAuthoredHqTerritory(world);

  return { chain, watcherRoom, patternRoom, rareRoom, tellCells, serviceCells: Math.max(0, (serviceY2 - serviceY1 + 1) * SERVICE_W), lockedDoors };
}

export function calculateMetrics(world: World, chain: readonly ChainRoom[], tellCells: number, serviceCells: number, lockedDoors: number): MarkovStairwellMetrics {
  const audit = auditReachability(world, world.idx(SPINE_X + (SPINE_W >> 1), SPINE_Y + 28));
  let motifChanges = 0;
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].motif !== chain[i - 1].motif) motifChanges++;
  }
  return {
    routeId: MARKOV_STAIRWELL_ROUTE_ID,
    z: MARKOV_STAIRWELL_Z,
    sequenceLength: chain.length,
    motifChanges,
    watchedRooms: chain.filter(entry => entry.state === 'watched').length,
    huntingRooms: chain.filter(entry => entry.state === 'hunting').length,
    rareRooms: chain.filter(entry => entry.state === 'rare').length,
    patternTellCells: tellCells,
    serviceBypassCells: serviceCells,
    lockedServiceDoors: lockedDoors,
    patternStashes: world.containers.filter(container => container.tags.includes('pattern_stash')).length,
    rareStateStashes: world.containers.filter(container => container.tags.includes('rare_state')).length,
    ungatedUpLiftReachable: [...world.doors.values()].every(door => door.state !== DoorState.HERMETIC_CLOSED) &&
      Array.from(world.cells).some((cell, idx) => cell === Cell.LIFT && world.liftDir[idx] === LiftDirection.UP && hasReachableAdjacentCell(world, audit, idx)),
    ungatedDownLiftReachable: Array.from(world.cells).some((cell, idx) => cell === Cell.LIFT && world.liftDir[idx] === LiftDirection.DOWN && hasReachableAdjacentCell(world, audit, idx)),
  };
}

export function measureMarkovStairwellMetrics(generation: FloorGeneration): MarkovStairwellMetrics {
  const cached = markovMetrics.get(generation.world);
  if (cached) return cached;
  const patternStashes = generation.world.containers.filter(container => container.tags.includes('pattern_stash')).length;
  const rareStateStashes = generation.world.containers.filter(container => container.tags.includes('rare_state')).length;
  return {
    routeId: MARKOV_STAIRWELL_ROUTE_ID,
    z: MARKOV_STAIRWELL_Z,
    sequenceLength: generation.world.rooms.filter(room => room.name.startsWith('Марковская лестница: ') && /\d{2}/.test(room.name)).length,
    motifChanges: 0,
    watchedRooms: 0,
    huntingRooms: 0,
    rareRooms: generation.world.rooms.filter(room => room.name.includes('редкое состояние')).length,
    patternTellCells: 0,
    serviceBypassCells: 0,
    lockedServiceDoors: [...generation.world.doors.values()].filter(door => door.state === DoorState.LOCKED && door.keyId === MARKOV_STAIRWELL_BYPASS_KEY).length,
    patternStashes,
    rareStateStashes,
    ungatedUpLiftReachable: generation.world.cells.some((cell, idx) => cell === Cell.LIFT && generation.world.liftDir[idx] === LiftDirection.UP),
    ungatedDownLiftReachable: generation.world.cells.some((cell, idx) => cell === Cell.LIFT && generation.world.liftDir[idx] === LiftDirection.DOWN),
  };
}

