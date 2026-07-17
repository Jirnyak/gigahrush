import { stampSurfaceSplat } from '../../systems/surface_marks';
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
  type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { Spr } from '../../render/sprite_index';
import { registerCellHazardSite } from '../../systems/cell_hazards';
import { placeEmergencyPanel } from '../../systems/emergency_panels';
import { stampRoom } from '../shared';
import { type FloorGeneration } from '../floor_manifest';
import { TURING_NURSERY_ROUTE_ID, TURING_NURSERY_ROOM_PREFIX, SEED, CX, CY, FIELD_SIZE, FIELD_CELL, MAX_HAZARD_CELLS, TURING_HQ_SPECS, TURING_DISTRICTS, TURING_CABINET_STRIPS } from "./meta";
import { buildTuringMicroBlock, decorateSmallBowl, hash01 } from "./npcs";

export type NextId = { v: number };

export type DoorSide = 'north' | 'south' | 'west' | 'east';

export interface Point {
  x: number;
  y: number;
}

export interface DoorSite {
  x: number;
  y: number;
  ox: number;
  oy: number;
}

export interface ReactionField {
  v: Float32Array;
}

export interface NurseryRooms {
  entry: Room;
  basin: Room;
  bridge: Room;
  sample: Room;
  burn: Room;
  exposure: Room;
  ward: Room;
  lowerLift: Room;
  nodes: Room[];
}

export interface TuringHqSpec {
  owner: TerritoryOwner;
  x: number;
  y: number;
  name: string;
  supportPrefix: string;
  wallTex: Tex;
  floorTex: Tex;
}

export interface TuringDistrictSpec {
  owner: TerritoryOwner;
  x: number;
  y: number;
  name: string;
  type: RoomType;
  wallTex: Tex;
  floorTex: Tex;
  wet: boolean;
}

export interface TuringCabinetStripSpec {
  owner: TerritoryOwner;
  x: number;
  y: number;
  cols: number;
  rows: number;
  name: string;
  wallTex: Tex;
  floorTex: Tex;
  roomTypes: readonly RoomType[];
}

export interface TuringNurseryMetrics {
  routeId: typeof TURING_NURSERY_ROUTE_ID;
  reactionRooms: number;
  wetCells: number;
  laneCells: number;
  bridgeCells: number;
  decisionContainers: number;
}

export function reinforceTuringNurseryAuthoredHqTerritory(world: World): void {
  const hqRoomsByName = new Map<string, Room>();
  for (const room of world.rooms) {
    if (room?.type === RoomType.HQ && room.name) {
      hqRoomsByName.set(room.name, room);
    }
  }

  for (const spec of TURING_HQ_SPECS) {
    const room = hqRoomsByName.get(spec.name);
    if (!room) continue;
    hardenTuringHqRoom(world, room, spec.owner, spec.wallTex, spec.floorTex);
  }
}

export function hardenTuringHqRoom(world: World, room: Room, owner: TerritoryOwner, wallTex: Tex, floorTex: Tex): void {
  room.type = RoomType.HQ;
  room.sealed = true;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) {
        if (world.roomMap[idx] === room.id) {
          world.factionControl[idx] = owner;
          world.floorTex[idx] = floorTex;
        }
      } else if (world.cells[idx] === Cell.WALL && !world.aptMask[idx]) {
        world.hermoWall[idx] = 1;
        world.wallTex[idx] = wallTex;
      }
    }
  }
  for (const idx of room.doors) world.factionControl[idx] = owner;
}

export function carveTuringMacroNetwork(world: World, field: ReactionField): void {
  carvePointRoute(world, [
    { x: 104, y: 168 },
    { x: 512, y: 104 },
    { x: 920, y: 170 },
    { x: 928, y: 512 },
    { x: 900, y: 854 },
    { x: 512, y: 916 },
    { x: 108, y: 844 },
    { x: 92, y: 512 },
    { x: 104, y: 168 },
  ], 8, Tex.F_TILE);

  carvePointRoute(world, [
    { x: 78, y: 512 },
    { x: 260, y: 512 },
    { x: CX, y: CY },
    { x: 764, y: 512 },
    { x: 948, y: 512 },
  ], 6, Tex.F_CONCRETE);
  carvePointRoute(world, [
    { x: 512, y: 90 },
    { x: 512, y: 284 },
    { x: CX, y: CY },
    { x: 512, y: 742 },
    { x: 512, y: 936 },
  ], 6, Tex.F_CONCRETE);
  carvePointRoute(world, [
    { x: 150, y: 170 },
    { x: 326, y: 326 },
    { x: CX, y: CY },
    { x: 700, y: 700 },
    { x: 862, y: 852 },
  ], 4, Tex.F_TILE);
  carvePointRoute(world, [
    { x: 862, y: 168 },
    { x: 694, y: 326 },
    { x: CX, y: CY },
    { x: 328, y: 696 },
    { x: 158, y: 850 },
  ], 4, Tex.F_TILE);

  const tapeRows = [184, 336, 512, 688, 840];
  for (let row = 0; row < tapeRows.length; row++) {
    carveReactionLane(world, field, 82, tapeRows[row], 942, tapeRows[row] + (row % 2 === 0 ? 18 : -18), 3, Tex.F_TILE, true);
  }
  const tapeCols = [184, 336, 512, 688, 840];
  for (let col = 0; col < tapeCols.length; col++) {
    carveReactionLane(world, field, tapeCols[col], 88, tapeCols[col] + (col % 2 === 0 ? -16 : 16), 938, 3, Tex.F_TILE, col % 2 === 0);
  }
}

export function buildTuringHqSuites(world: World): void {
  for (let i = 0; i < TURING_HQ_SPECS.length; i++) {
    const spec = TURING_HQ_SPECS[i];
    const hq = tryAddTuringRoom(world, RoomType.HQ, spec.x, spec.y, spec.owner === ZoneFaction.SCIENTIST ? 50 : 42, 28, spec.name, spec.wallTex, spec.floorTex, true);
    if (!hq) continue;
    paintRoomTerritory(world, hq, spec.owner);
    decorateHqCore(world, hq, i);
    connectRoomToPoint(world, hq, spec.x < CX ? 'east' : 'west', CX, CY, DoorState.HERMETIC_CLOSED);

    const kitchen = tryAddTuringRoom(world, RoomType.KITCHEN, spec.x - 38, spec.y + 38, 30, 18, `Кухня ${spec.supportPrefix}`, Tex.PANEL, Tex.F_LINO);
    const toilet = tryAddTuringRoom(world, RoomType.BATHROOM, spec.x + 10, spec.y + 40, 24, 16, `Санузел ${spec.supportPrefix}`, Tex.TILE_W, Tex.F_TILE);
    const store = tryAddTuringRoom(world, RoomType.STORAGE, spec.x + 58, spec.y + 3, 30, 24, `Склад ${spec.supportPrefix}`, spec.owner === ZoneFaction.CULTIST ? Tex.BRICK : Tex.METAL, Tex.F_CONCRETE);
    const work = tryAddTuringRoom(world, spec.owner === ZoneFaction.SCIENTIST ? RoomType.MEDICAL : RoomType.OFFICE, spec.x - 44, spec.y + 4, 34, 24, `Рабочая комната ${spec.supportPrefix}`, spec.owner === ZoneFaction.CITIZEN ? Tex.PANEL : spec.wallTex, spec.floorTex);
    for (const room of [kitchen, toilet, store, work]) {
      if (!room) continue;
      paintRoomTerritory(world, room, spec.owner);
      decorateSupportRoom(world, room, i);
      connectRooms(world, hq, room.x < hq.x ? 'west' : room.x > hq.x + hq.w ? 'east' : 'south', room, room.y > hq.y ? 'north' : room.x < hq.x ? 'east' : 'west', DoorState.CLOSED);
    }
  }
}

export function buildTuringDistricts(world: World, field: ReactionField, rng: () => number): void {
  for (let i = 0; i < TURING_DISTRICTS.length; i++) {
    const spec = TURING_DISTRICTS[i];
    const lab = tryAddTuringRoom(
      world,
      spec.type,
      spec.x + Math.floor((rng() - 0.5) * 18),
      spec.y + Math.floor((rng() - 0.5) * 16),
      64 + (i % 4) * 8,
      34 + (i % 3) * 8,
      `${TURING_NURSERY_ROOM_PREFIX}: ${spec.name}`,
      spec.wallTex,
      spec.floorTex,
    );
    if (!lab) continue;
    paintRoomTerritory(world, lab, spec.owner);
    decorateResearchLab(world, lab, field, i, spec.wet);
    connectRoomToPoint(world, lab, lab.x < CX ? 'east' : 'west', CX, CY, DoorState.CLOSED);

    const store = tryAddTuringRoom(world, RoomType.STORAGE, lab.x + lab.w + 10, lab.y + 4, 28, 22, `Шкаф проб: ${spec.name}`, Tex.METAL, Tex.F_CONCRETE);
    const office = tryAddTuringRoom(world, RoomType.OFFICE, lab.x - 38, lab.y + 4, 30, 20, `Кабинет наблюдения: ${spec.name}`, spec.wallTex, spec.floorTex);
    const wash = tryAddTuringRoom(world, RoomType.BATHROOM, lab.x + 8, lab.y + lab.h + 10, 26, 16, `Мокрый шлюз: ${spec.name}`, Tex.TILE_W, spec.wet ? Tex.F_WATER : Tex.F_TILE);
    const bowl = tryAddTuringRoom(world, RoomType.MEDICAL, lab.x + lab.w - 28, lab.y + lab.h + 10, 32, 22, `${TURING_NURSERY_ROOM_PREFIX}: малая чаша ${i + 1}`, Tex.HERMO_WALL, Tex.F_TILE, true);
    for (const room of [store, office, wash, bowl]) {
      if (!room) continue;
      paintRoomTerritory(world, room, spec.owner);
      if (room === bowl) decorateSmallBowl(world, room, field, i);
      else decorateSupportRoom(world, room, 20 + i);
      connectRooms(world, lab, room.y > lab.y + lab.h ? 'south' : room.x < lab.x ? 'west' : 'east', room, room.y > lab.y + lab.h ? 'north' : room.x < lab.x ? 'east' : 'west', room === bowl ? DoorState.HERMETIC_CLOSED : DoorState.CLOSED);
    }
    buildTuringMicroBlock(world, lab, spec.owner, `микроячейка ${spec.name}`, 5 + (i % 3), 3 + (i % 2), i);
  }
}

export function buildTuringCabinetStrips(world: World, rng: () => number): void {
  for (let i = 0; i < TURING_CABINET_STRIPS.length; i++) {
    const spec = TURING_CABINET_STRIPS[i];
    let stripFirst: Room | null = null;
    let previousRowFirst: Room | null = null;
    for (let row = 0; row < spec.rows; row++) {
      let previous: Room | null = null;
      let rowFirst: Room | null = null;
      for (let col = 0; col < spec.cols; col++) {
        const serial = i * 100 + row * 17 + col;
        const room = tryAddTuringRoom(
          world,
          spec.roomTypes[serial % spec.roomTypes.length],
          spec.x + col * 18 + Math.floor(rng() * 3),
          spec.y + row * 15 + Math.floor(rng() * 3),
          10 + (serial % 5),
          8 + ((serial + 2) % 4),
          `${TURING_NURSERY_ROOM_PREFIX}: ${spec.name}: шкаф ${row + 1}-${col + 1}`,
          spec.wallTex,
          spec.floorTex,
        );
        if (!room) continue;
        paintRoomTerritory(world, room, spec.owner);
        decorateMicroRoom(world, room, serial);
        if (!stripFirst) stripFirst = room;
        if (!rowFirst) rowFirst = room;
        if (previous) connectRoomsNarrow(world, previous, 'east', room, 'west', serial % 6 === 0 ? DoorState.CLOSED : DoorState.OPEN);
        previous = room;
      }
      if (rowFirst && previousRowFirst) connectRoomsNarrow(world, previousRowFirst, 'south', rowFirst, 'north', DoorState.CLOSED);
      previousRowFirst = rowFirst;
    }
    if (stripFirst) connectRoomToPoint(world, stripFirst, stripFirst.x < CX ? 'east' : 'west', CX, CY, DoorState.CLOSED);
  }
}

export function buildTuringOuterAnnexes(world: World, field: ReactionField, rng: () => number): void {
  const annexes = [
    { x: 58, y: 76, cols: 7, rows: 4, owner: ZoneFaction.CITIZEN, name: 'краевая очередь родителей' },
    { x: 852, y: 80, cols: 6, rows: 4, owner: ZoneFaction.WILD, name: 'краевой склад сбежавших проб' },
    { x: 58, y: 856, cols: 7, rows: 4, owner: ZoneFaction.LIQUIDATOR, name: 'нижний пост прожига' },
    { x: 850, y: 852, cols: 6, rows: 4, owner: ZoneFaction.CULTIST, name: 'нижний мокрый скит' },
  ] as const;

  for (let i = 0; i < annexes.length; i++) {
    const annex = annexes[i];
    const anchor = tryAddTuringRoom(world, RoomType.PRODUCTION, annex.x, annex.y, 54, 30, `${TURING_NURSERY_ROOM_PREFIX}: ${annex.name}`, Tex.PIPE, Tex.F_CONCRETE);
    if (!anchor) continue;
    paintRoomTerritory(world, anchor, annex.owner);
    decorateResearchLab(world, anchor, field, 90 + i, annex.owner !== ZoneFaction.CITIZEN);
    connectRoomToPoint(world, anchor, annex.x < CX ? 'east' : 'west', CX, CY, DoorState.CLOSED);
    for (let row = 0; row < annex.rows; row++) {
      let prev: Room | null = null;
      for (let col = 0; col < annex.cols; col++) {
        const serial = 600 + i * 64 + row * 9 + col;
        const room = tryAddTuringRoom(
          world,
          col % 3 === 0 ? RoomType.STORAGE : col % 3 === 1 ? RoomType.OFFICE : RoomType.BATHROOM,
          annex.x + 66 + col * 17 + Math.floor(rng() * 3),
          annex.y + row * 15 + Math.floor(rng() * 3),
          11 + (serial % 4),
          8 + ((serial + 1) % 4),
          `${TURING_NURSERY_ROOM_PREFIX}: ${annex.name}: малый отсек ${row + 1}-${col + 1}`,
          annex.owner === ZoneFaction.CULTIST ? Tex.BRICK : Tex.METAL,
          annex.owner === ZoneFaction.CULTIST ? Tex.F_WATER : Tex.F_CONCRETE,
        );
        if (!room) continue;
        paintRoomTerritory(world, room, annex.owner);
        decorateMicroRoom(world, room, serial);
        connectRoomsNarrow(world, prev ?? anchor, 'east', room, 'west', DoorState.CLOSED);
        prev = room;
      }
    }
  }
}

export function buildTuringStateGraphRooms(world: World, field: ReactionField, rng: () => number): void {
  const columns = [170, 300, 430, 560, 690, 820];
  const rows = [156, 276, 396, 516, 636, 756, 876];
  let previousLayerFirst: Room | null = null;
  for (let y = 0; y < rows.length; y++) {
    let previous: Room | null = null;
    let layerFirst: Room | null = null;
    for (let x = 0; x < columns.length; x++) {
      if (((x * 7 + y * 5) % 4) === 0 && rng() < 0.45) continue;
      const owner = x < 2 ? (y < 3 ? ZoneFaction.CITIZEN : ZoneFaction.LIQUIDATOR)
        : x > 4 ? (y < 3 ? ZoneFaction.WILD : ZoneFaction.CULTIST)
          : ZoneFaction.SCIENTIST;
      const serial = y * 16 + x;
      const node = tryAddTuringRoom(
        world,
        serial % 5 === 0 ? RoomType.PRODUCTION : serial % 3 === 0 ? RoomType.OFFICE : RoomType.MEDICAL,
        columns[x] + Math.floor((rng() - 0.5) * 16),
        rows[y] + Math.floor((rng() - 0.5) * 14),
        24 + (serial % 4) * 4,
        18 + (serial % 3) * 3,
        `${TURING_NURSERY_ROOM_PREFIX}: состояние автомата ${y + 1}.${x + 1}`,
        owner === ZoneFaction.CITIZEN ? Tex.PANEL : owner === ZoneFaction.WILD || owner === ZoneFaction.CULTIST ? Tex.BRICK : Tex.TILE_W,
        owner === ZoneFaction.CULTIST ? Tex.F_WATER : owner === ZoneFaction.CITIZEN ? Tex.F_LINO : Tex.F_TILE,
      );
      if (!node) continue;
      paintRoomTerritory(world, node, owner);
      decorateResearchLab(world, node, field, 120 + serial, owner !== ZoneFaction.CITIZEN);
      if (!layerFirst) layerFirst = node;
      if (previous) connectRoomsNarrow(world, previous, 'east', node, 'west', serial % 3 === 0 ? DoorState.CLOSED : DoorState.OPEN);
      if (previousLayerFirst && x === 0) connectRoomsNarrow(world, previousLayerFirst, 'south', node, 'north', DoorState.CLOSED);
      previous = node;
    }
    if (layerFirst) {
      connectRoomToPoint(world, layerFirst, layerFirst.x < CX ? 'east' : 'west', CX, CY, DoorState.CLOSED);
      previousLayerFirst = layerFirst;
    }
  }
}

export function measureTuringNurseryMetrics(generation: FloorGeneration): TuringNurseryMetrics {
  let wetCells = 0;
  let laneCells = 0;
  let bridgeCells = 0;
  for (let i = 0; i < W * W; i++) {
    if (generation.world.cells[i] === Cell.WATER) wetCells++;
    if (generation.world.cells[i] === Cell.FLOOR && generation.world.roomMap[i] < 0) laneCells++;
    const room = generation.world.rooms[generation.world.roomMap[i]];
    if (room?.name.includes('слизевой мост')) bridgeCells++;
  }
  return {
    routeId: TURING_NURSERY_ROUTE_ID,
    reactionRooms: generation.world.rooms.filter(room => room.name.startsWith(TURING_NURSERY_ROOM_PREFIX)).length,
    wetCells,
    laneCells,
    bridgeCells,
    decisionContainers: generation.world.containers.filter(container => container.tags.includes(TURING_NURSERY_ROUTE_ID)).length,
  };
}

export function initWorld(world: World): void {
  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.PANEL;
    world.floorTex[i] = Tex.F_LINO;
    world.factionControl[i] = ZoneFaction.CITIZEN;
    world.fog[i] = 5;
  }
}

export function buildNurseryRooms(world: World, field: ReactionField): NurseryRooms {
  const entry = addRoom(world, RoomType.CORRIDOR, CX - 40, CY + 166, 82, 24, 'Ясли Тьюринга: верхний сухой шлюз', Tex.PIPE, Tex.F_CONCRETE);
  const basin = addRoom(world, RoomType.MEDICAL, CX - 70, CY + 48, 140, 74, 'Ясли Тьюринга: вычислительная чаша инокуляции', Tex.TILE_W, Tex.F_TILE);
  const bridge = addRoom(world, RoomType.CORRIDOR, CX - 188, CY - 16, 126, 32, 'Ясли Тьюринга: слизевой мост', Tex.HERMO_WALL, Tex.F_WATER);
  const sample = addRoom(world, RoomType.STORAGE, CX + 100, CY + 42, 84, 48, 'Ясли Тьюринга: синяя пробная кладовая', Tex.METAL, Tex.F_CONCRETE);
  const burn = addRoom(world, RoomType.OFFICE, CX - 72, CY - 158, 96, 44, 'Ясли Тьюринга: пост прожига моста', Tex.METAL, Tex.F_CONCRETE);
  const exposure = addRoom(world, RoomType.OFFICE, CX + 86, CY - 150, 92, 46, 'Ясли Тьюринга: комната экспозиции роста', Tex.MARBLE, Tex.F_PARQUET);
  const ward = addRoom(world, RoomType.LIVING, CX - 30, CY - 74, 72, 38, 'Ясли Тьюринга: палата нулевого ребёнка', Tex.PANEL, Tex.F_CARPET);
  const lowerLift = addRoom(world, RoomType.CORRIDOR, CX - 34, CY - 236, 70, 24, 'Ясли Тьюринга: нижняя кабина узора', Tex.PIPE, Tex.F_CONCRETE);
  const nodes = buildReactionNodeRooms(world, field);
  return { entry, basin, bridge, sample, burn, exposure, ward, lowerLift, nodes };
}

export function buildReactionNodeRooms(world: World, field: ReactionField): Room[] {
  const out: Room[] = [];
  const candidates: { x: number; y: number; score: number }[] = [];
  for (let gy = 13; gy <= 50; gy++) {
    for (let gx = 13; gx <= 50; gx++) {
      const concentration = field.v[gy * FIELD_SIZE + gx];
      const band = laneScore(concentration);
      if (band < 0.6) continue;
      const x = Math.floor(gx * FIELD_CELL + FIELD_CELL / 2);
      const y = Math.floor(gy * FIELD_CELL + FIELD_CELL / 2);
      const d = Math.hypot(x - CX, y - CY);
      if (d < 110 || d > 350) continue;
      const score = band * 2 + hash01(SEED, gx, gy, 17) - d / 700;
      candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    if (out.length >= 10) break;
    if (out.some(room => world.dist(c.x, c.y, room.x + room.w / 2, room.y + room.h / 2) < 68)) continue;
    const serial = out.length + 1;
    const type = serial % 4 === 0 ? RoomType.STORAGE : serial % 3 === 0 ? RoomType.PRODUCTION : RoomType.MEDICAL;
    const w = type === RoomType.STORAGE ? 34 : 42;
    const h = type === RoomType.PRODUCTION ? 32 : 28;
    const room = addRoom(world, type, c.x - (w >> 1), c.y - (h >> 1), w, h, `${TURING_NURSERY_ROOM_PREFIX}: клетка узора ${serial}`, type === RoomType.STORAGE ? Tex.METAL : Tex.TILE_W, type === RoomType.STORAGE ? Tex.F_CONCRETE : Tex.F_TILE);
    stainReactionRoom(world, room, field, SEED ^ serial);
    out.push(room);
  }
  return out;
}

export function connectNurseryRooms(world: World, rooms: NurseryRooms, field: ReactionField): void {
  const all = [rooms.entry, rooms.basin, rooms.bridge, rooms.sample, rooms.burn, rooms.exposure, rooms.ward, rooms.lowerLift, ...rooms.nodes];
  const edges = mstEdges(world, all);
  for (const [ai, bi] of edges) {
    const a = all[ai];
    const b = all[bi];
    connectRooms(world, a, sideToward(a, b), b, sideToward(b, a), a === rooms.sample || b === rooms.sample ? DoorState.LOCKED : DoorState.CLOSED, a === rooms.sample || b === rooms.sample ? 'key' : '');
    carveReactionLane(world, field, roomCx(a), roomCy(a), roomCx(b), roomCy(b), 3, Tex.F_TILE, true);
  }

  connectRooms(world, rooms.entry, 'north', rooms.basin, 'south', DoorState.CLOSED);
  connectRooms(world, rooms.basin, 'north', rooms.ward, 'south', DoorState.CLOSED);
  connectRooms(world, rooms.ward, 'north', rooms.burn, 'south', DoorState.CLOSED);
  connectRooms(world, rooms.burn, 'north', rooms.lowerLift, 'south', DoorState.CLOSED);
  connectRooms(world, rooms.basin, 'west', rooms.bridge, 'east', DoorState.HERMETIC_CLOSED);
  connectRooms(world, rooms.basin, 'east', rooms.sample, 'west', DoorState.LOCKED, 'key');
  connectRooms(world, rooms.ward, 'east', rooms.exposure, 'west', DoorState.CLOSED);
}

export function decorateNursery(world: World, rooms: NurseryRooms, field: ReactionField): void {
  setFeature(world, rooms.entry.x + 24, rooms.entry.y + 10, Feature.LAMP);
  setFeature(world, rooms.entry.x + 41, rooms.entry.y + 12, Feature.LIFT_BUTTON);
  setFeature(world, rooms.basin.x + 18, rooms.basin.y + 18, Feature.APPARATUS);
  setFeature(world, rooms.basin.x + rooms.basin.w - 20, rooms.basin.y + 18, Feature.APPARATUS);
  setFeature(world, rooms.basin.x + 30, rooms.basin.y + rooms.basin.h - 14, Feature.SINK);
  markScreenWall(world, rooms.basin.x + (rooms.basin.w >> 1), rooms.basin.y - 1, 2);
  fillBasinWater(world, rooms.basin, field);

  for (let x = rooms.bridge.x + 8; x < rooms.bridge.x + rooms.bridge.w - 8; x += 7) {
    addWetCell(world, x, rooms.bridge.y + 14);
    addWetCell(world, x, rooms.bridge.y + 15);
    if (x % 3 === 0) setFeature(world, x, rooms.bridge.y + 8, Feature.APPARATUS);
  }
  stampSurfaceSplat(world, roomCx(rooms.bridge), roomCy(rooms.bridge), 0.5, 0.5, 12, 0.34, SEED ^ 0x6b1d, 42, 165, 96, false);

  for (let x = rooms.sample.x + 10; x < rooms.sample.x + rooms.sample.w - 8; x += 14) {
    setFeature(world, x, rooms.sample.y + 12, Feature.SHELF);
  }
  markScreenWall(world, rooms.sample.x + rooms.sample.w - 10, rooms.sample.y - 1, 6);
  setFeature(world, rooms.burn.x + 12, rooms.burn.y + 14, Feature.DESK);
  setFeature(world, rooms.burn.x + 36, rooms.burn.y + 14, Feature.SHELF);
  setFeature(world, rooms.exposure.x + 10, rooms.exposure.y + 14, Feature.DESK);
  setFeature(world, rooms.exposure.x + rooms.exposure.w - 12, rooms.exposure.y + 14, Feature.SHELF);
  markScreenWall(world, rooms.exposure.x + 22, rooms.exposure.y - 1, 4);

  for (let x = rooms.ward.x + 12; x < rooms.ward.x + rooms.ward.w - 8; x += 20) setFeature(world, x, rooms.ward.y + 16, Feature.BED);
  setFeature(world, rooms.lowerLift.x + 20, rooms.lowerLift.y + 11, Feature.LAMP);

  for (let i = 0; i < rooms.nodes.length; i++) {
    const room = rooms.nodes[i];
    setFeature(world, room.x + 7, room.y + 7, i % 2 === 0 ? Feature.APPARATUS : Feature.SHELF);
    if (i % 3 === 0) markScreenWall(world, room.x + Math.floor(room.w / 2), room.y - 1, i);
  }

  stampReactionWater(world, field, SEED ^ 0x1234, 260);
}

export function placeEmergencyPanels(world: World, rooms: NurseryRooms): void {
  placeEmergencyPanel(world, rooms.basin.x + 10, rooms.basin.y + 10, 'panel_water', SEED ^ 0x10);
  placeEmergencyPanel(world, rooms.burn.x + rooms.burn.w - 12, rooms.burn.y + 10, 'panel_power', SEED ^ 0x20);
  placeEmergencyPanel(world, rooms.exposure.x + rooms.exposure.w - 12, rooms.exposure.y + 10, 'panel_doors', SEED ^ 0x30);
  placeEmergencyPanel(world, rooms.sample.x + 10, rooms.sample.y + 10, 'panel_vent', SEED ^ 0x40);
}

export function placeLifts(world: World, rooms: NurseryRooms): void {
  placeLift(world, rooms.entry.x + 10, rooms.entry.y + 12, rooms.entry.x + 17, rooms.entry.y + 12, LiftDirection.UP);
  placeLift(world, rooms.lowerLift.x + rooms.lowerLift.w - 10, rooms.lowerLift.y + 12, rooms.lowerLift.x + rooms.lowerLift.w - 17, rooms.lowerLift.y + 12, LiftDirection.DOWN);
}

export function tuneNurseryZones(world: World): void {
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, CX, CY);
    zone.level = d < 230 ? 3 : 4;
    zone.faction = d < 210 ? ZoneFaction.LIQUIDATOR : zone.id % 4 === 0 ? ZoneFaction.WILD : ZoneFaction.CITIZEN;
    zone.fogged = false;
    zone.hasLift = d < 270;
  }
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.WATER) {
      const zone = world.zones[world.zoneMap[i]];
      if (zone) {
        zone.faction = ZoneFaction.WILD;
        zone.level = Math.max(zone.level, 4);
      }
    }
  }
  for (let i = 0; i < W * W; i++) {
    world.factionControl[i] = world.zones[world.zoneMap[i]]?.faction ?? ZoneFaction.CITIZEN;
  }
}

export function placeDrops(world: World, entities: Entity[], nextId: NextId, rooms: NurseryRooms): void {
  dropItem(world, entities, nextId, rooms.entry.x + 30, rooms.entry.y + 14, 'gasmask_filter', 1);
  dropItem(world, entities, nextId, rooms.basin.x + 40, rooms.basin.y + 44, 'decon_fluid', 1);
  dropItem(world, entities, nextId, rooms.bridge.x + rooms.bridge.w - 20, rooms.bridge.y + 16, 'deactivated_residue', 1);
}

export function registerStaticHazards(world: World, rooms: NurseryRooms): void {
  const basinCells = hazardCellsForRoom(world, rooms.basin, MAX_HAZARD_CELLS);
  registerCellHazardSite(world, {
    id: 'turing_nursery_basin_growth',
    kind: 'slime',
    displayName: 'инокуляционный налёт яслей',
    cells: basinCells,
    tags: [TURING_NURSERY_ROUTE_ID, 'inoculation', 'reaction_diffusion', 'slime', 'cleanable'],
    roomId: rooms.basin.id,
    zoneId: world.zoneMap[world.idx(roomCx(rooms.basin), roomCy(rooms.basin))],
    centerX: roomCx(rooms.basin),
    centerY: roomCy(rooms.basin),
    playerDamagePerSecond: 0.4,
    slowMult: 0.62,
    trappedMult: 0.22,
    activeFog: 32,
    warning: 'Инокуляционный налёт липнет к обуви. Обеззараживающая жидкость снимет часть узора.',
  });

  const bridgeCells = hazardCellsForRoom(world, rooms.bridge, MAX_HAZARD_CELLS);
  registerCellHazardSite(world, {
    id: 'turing_nursery_bridge_growth',
    kind: 'slime',
    displayName: 'слизевой мост яслей',
    cells: bridgeCells,
    tags: [TURING_NURSERY_ROUTE_ID, 'burn_bridge', 'reaction_diffusion', 'slime', 'cleanable'],
    roomId: rooms.bridge.id,
    zoneId: world.zoneMap[world.idx(roomCx(rooms.bridge), roomCy(rooms.bridge))],
    centerX: roomCx(rooms.bridge),
    centerY: roomCy(rooms.bridge),
    playerDamagePerSecond: 0.55,
    slowMult: 0.55,
    trappedMult: 0.16,
    activeFog: 42,
    warning: 'Слизевой мост держит ногу и шепчет маршрут. Огонь или реагент рвут связность.',
  });
}

export function carvePointRoute(world: World, points: readonly { x: number; y: number }[], width: number, floorTex: Tex): void {
  for (let i = 1; i < points.length; i++) {
    carveLineWidth(world, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, width, floorTex);
  }
}

export function tryAddTuringRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  sealed = false,
): Room | null {
  const rx = Math.floor(x);
  const ry = Math.floor(y);
  if (!canStampTuringRoom(world, rx, ry, w, h)) return null;
  return addRoom(world, type, rx, ry, w, h, name, wallTex, floorTex, sealed);
}

export function canStampTuringRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  if (x < 2 || y < 2 || x + w >= W - 2 || y + h >= W - 2) return false;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.aptMask[idx] || world.hermoWall[idx]) return false;
      if (world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR) return false;
      if (world.roomMap[idx] >= 0) return false;
    }
  }
  return true;
}

export function connectRoomsNarrow(world: World, a: Room, sideA: DoorSide, b: Room, sideB: DoorSide, state: DoorState, keyId = ''): void {
  const da = doorSite(a, sideA);
  const db = doorSite(b, sideB);
  carveLineWidth(world, da.ox, da.oy, db.ox, db.oy, 1, a.floorTex);
  const ai = addDoorAt(world, a, da.x, da.y, state, keyId);
  const bi = addDoorAt(world, b, db.x, db.y, state === DoorState.LOCKED ? DoorState.CLOSED : state, keyId);
  const ad = world.doors.get(ai);
  const bd = world.doors.get(bi);
  if (ad) ad.roomB = b.id;
  if (bd) bd.roomB = a.id;
}

export function connectRoomToPoint(world: World, room: Room, side: DoorSide, tx: number, ty: number, state: DoorState, keyId = ''): void {
  const d = doorSite(room, side);
  carveLineWidth(world, d.ox, d.oy, tx, ty, 3, Tex.F_TILE);
  addDoorAt(world, room, d.x, d.y, state, keyId);
}

export function paintRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      world.factionControl[world.idx(room.x + dx, room.y + dy)] = owner;
    }
  }
  for (const idx of room.doors) world.factionControl[idx] = owner;
}

export function decorateHqCore(world: World, room: Room, serial: number): void {
  setFeature(world, room.x + 8, room.y + 8, Feature.DESK);
  setFeature(world, room.x + room.w - 9, room.y + 8, Feature.SHELF);
  setFeature(world, room.x + 10, room.y + room.h - 8, Feature.TABLE);
  setFeature(world, room.x + room.w - 10, room.y + room.h - 8, Feature.LAMP);
  markScreenWall(world, room.x + (room.w >> 1), room.y - 1, serial + 2);
}

export function decorateResearchLab(world: World, room: Room, field: ReactionField, serial: number, wet: boolean): void {
  for (let y = room.y + 7; y < room.y + room.h - 5; y += 7) {
    for (let x = room.x + 8; x < room.x + room.w - 8; x += 16) {
      setFeature(world, x, y, Feature.APPARATUS);
      if (wet && laneScore(reactionAt(field, x, y)) > 0.45) addWetCell(world, x + 2, y);
    }
  }
  if (room.type === RoomType.STORAGE) {
    for (let x = room.x + 7; x < room.x + room.w - 6; x += 12) setFeature(world, x, room.y + 8, Feature.SHELF);
  }
  setFeature(world, room.x + room.w - 8, room.y + room.h - 7, wet ? Feature.SINK : Feature.LAMP);
  markScreenWall(world, room.x + 10 + (serial % Math.max(1, room.w - 20)), room.y - 1, serial);
  stainReactionRoom(world, room, field, SEED ^ serial);
  if (wet) stampSurfaceSplat(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 0.5, 0.5, 7, 0.22, SEED ^ serial, 35, 145, 82, false);
}

export function decorateSupportRoom(world: World, room: Room, serial: number): void {
  switch (room.type) {
    case RoomType.KITCHEN:
      setFeature(world, room.x + 7, room.y + 7, Feature.STOVE);
      setFeature(world, room.x + room.w - 7, room.y + 7, Feature.SINK);
      setFeature(world, room.x + (room.w >> 1), room.y + room.h - 7, Feature.TABLE);
      break;
    case RoomType.BATHROOM:
      setFeature(world, room.x + 6, room.y + 6, Feature.TOILET);
      setFeature(world, room.x + room.w - 7, room.y + room.h - 7, Feature.SINK);
      break;
    case RoomType.STORAGE:
      for (let x = room.x + 6; x < room.x + room.w - 5; x += 9) setFeature(world, x, room.y + 6, Feature.SHELF);
      break;
    case RoomType.MEDICAL:
    case RoomType.PRODUCTION:
      setFeature(world, room.x + 7, room.y + 7, Feature.APPARATUS);
      setFeature(world, room.x + room.w - 7, room.y + room.h - 7, Feature.SINK);
      break;
    case RoomType.OFFICE:
    case RoomType.COMMON:
    default:
      setFeature(world, room.x + 7, room.y + 7, Feature.DESK);
      setFeature(world, room.x + room.w - 8, room.y + 7, Feature.SHELF);
      setFeature(world, room.x + (room.w >> 1), room.y + room.h - 7, Feature.CHAIR);
      break;
  }
  if (serial % 3 === 0) markScreenWall(world, room.x + (room.w >> 1), room.y - 1, serial);
}

export function decorateMicroRoom(world: World, room: Room, serial: number): void {
  const primary = room.type === RoomType.BATHROOM ? Feature.SINK
    : room.type === RoomType.MEDICAL || room.type === RoomType.PRODUCTION ? Feature.APPARATUS
      : room.type === RoomType.OFFICE ? Feature.DESK
        : room.type === RoomType.COMMON || room.type === RoomType.SMOKING ? Feature.TABLE
          : Feature.SHELF;
  setFeature(world, room.x + Math.max(2, Math.min(room.w - 3, 3 + (serial % 4))), room.y + Math.max(2, Math.min(room.h - 3, 3 + (serial % 3))), primary);
  if (room.w > 9 && room.h > 7) {
    const secondary = primary === Feature.SHELF ? Feature.APPARATUS : Feature.SHELF;
    setFeature(world, room.x + room.w - 4, room.y + room.h - 4, secondary);
  }
  if (serial % 13 === 0) markScreenWall(world, room.x + (room.w >> 1), room.y - 1, serial);
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
  sealed = false,
): Room {
  const room = stampRoom(world, world.rooms.length, type, Math.floor(x), Math.floor(y), w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  room.sealed = sealed;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) {
        world.floorTex[idx] = floorTex;
      } else if (world.cells[idx] === Cell.WALL) {
        world.wallTex[idx] = wallTex;
        if (wallTex === Tex.HERMO_WALL || sealed) world.hermoWall[idx] = 1;
      }
    }
  }
  return room;
}

export function connectRooms(world: World, a: Room, sideA: DoorSide, b: Room, sideB: DoorSide, state: DoorState, keyId = ''): void {
  const da = doorSite(a, sideA);
  const db = doorSite(b, sideB);
  carveLineWidth(world, da.ox, da.oy, db.ox, db.oy, 3, a.floorTex);
  const ai = addDoorAt(world, a, da.x, da.y, state, keyId);
  const bi = addDoorAt(world, b, db.x, db.y, state === DoorState.LOCKED ? DoorState.CLOSED : state, keyId);
  const ad = world.doors.get(ai);
  const bd = world.doors.get(bi);
  if (ad) ad.roomB = b.id;
  if (bd) bd.roomB = a.id;
}

export function addDoorAt(world: World, room: Room, x: number, y: number, state: DoorState, keyId = ''): number {
  const idx = world.idx(x, y);
  world.cells[idx] = Cell.DOOR;
  world.hermoWall[idx] = 0;
  world.wallTex[idx] = state === DoorState.LOCKED || state === DoorState.HERMETIC_CLOSED ? Tex.DOOR_METAL : Tex.DOOR_WOOD;
  const existing = world.doors.get(idx);
  if (existing) {
    existing.state = state;
    existing.keyId = keyId;
  } else {
    world.doors.set(idx, { idx, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  }
  if (!room.doors.includes(idx)) room.doors.push(idx);
  return idx;
}

export function doorSite(room: Room, side: DoorSide): DoorSite {
  switch (side) {
    case 'north': {
      const x = room.x + (room.w >> 1);
      return { x, y: room.y - 1, ox: x, oy: room.y };
    }
    case 'south': {
      const x = room.x + (room.w >> 1);
      return { x, y: room.y + room.h, ox: x, oy: room.y + room.h - 1 };
    }
    case 'west': {
      const y = room.y + (room.h >> 1);
      return { x: room.x - 1, y, ox: room.x, oy: y };
    }
    case 'east': {
      const y = room.y + (room.h >> 1);
      return { x: room.x + room.w, y, ox: room.x + room.w - 1, oy: y };
    }
  }
}

export function sideToward(from: Room, to: Room): DoorSide {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west';
  return dy > 0 ? 'south' : 'north';
}

export function mstEdges(world: World, rooms: readonly Room[]): [number, number][] {
  const edges: [number, number][] = [];
  if (rooms.length < 2) return edges;
  const used = new Uint8Array(rooms.length);
  used[0] = 1;
  while (edges.length < rooms.length - 1) {
    let bestA = -1;
    let bestB = -1;
    let bestD = Infinity;
    for (let a = 0; a < rooms.length; a++) {
      if (!used[a]) continue;
      for (let b = 0; b < rooms.length; b++) {
        if (used[b]) continue;
        const d = world.dist2(roomCx(rooms[a]), roomCy(rooms[a]), roomCx(rooms[b]), roomCy(rooms[b]));
        if (d < bestD) {
          bestD = d;
          bestA = a;
          bestB = b;
        }
      }
    }
    if (bestA < 0 || bestB < 0) break;
    used[bestB] = 1;
    edges.push([bestA, bestB]);
  }
  return edges;
}

export function carveReactionLane(world: World, field: ReactionField, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex, mark = false): void {
  let x = Math.round(ax);
  let y = Math.round(ay);
  const tx = Math.round(bx);
  const ty = Math.round(by);
  const touched: Point[] = [];
  for (let step = 0; step < 900 && (x !== tx || y !== ty); step++) {
    carveDisc(world, x, y, width, floorTex);
    if (mark && step % 17 === 0) touched.push({ x, y });
    let bestX = x;
    let bestY = y;
    let bestScore = -Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = world.wrap(x + dx);
        const ny = world.wrap(y + dy);
        const d = world.dist(nx, ny, tx, ty);
        const score = -d * 0.028 + reactionLaneAt(field, nx, ny) + (dx !== 0 && dy !== 0 ? -0.08 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestX = nx;
          bestY = ny;
        }
      }
    }
    if (bestX === x && bestY === y) break;
    x = bestX;
    y = bestY;
  }
  carveDisc(world, tx, ty, width, floorTex);
  if (mark) {
    for (let i = 0; i < touched.length; i++) {
      if ((i & 1) === 0) stampSurfaceSplat(world, touched[i].x, touched[i].y, 0.5, 0.5, 1.7, 0.12, SEED ^ i, 72, 180, 118, false);
    }
  }
}

export function carveLineWidth(world: World, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex): void {
  if (Math.abs(ax - bx) > Math.abs(ay - by)) {
    const from = Math.min(ax, bx);
    const to = Math.max(ax, bx);
    for (let x = from; x <= to; x++) carveDisc(world, x, ay, width, floorTex);
    const x = bx;
    const y0 = Math.min(ay, by);
    const y1 = Math.max(ay, by);
    for (let y = y0; y <= y1; y++) carveDisc(world, x, y, width, floorTex);
  } else {
    const from = Math.min(ay, by);
    const to = Math.max(ay, by);
    for (let y = from; y <= to; y++) carveDisc(world, ax, y, width, floorTex);
    const y = by;
    const x0 = Math.min(ax, bx);
    const x1 = Math.max(ax, bx);
    for (let x = x0; x <= x1; x++) carveDisc(world, x, y, width, floorTex);
  }
}

export function carveDisc(world: World, cx: number, cy: number, r: number, floorTex: Tex, roomId = -1): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const idx = world.idx(cx + dx, cy + dy);
      if (world.cells[idx] === Cell.LIFT || world.hermoWall[idx]) continue;
      world.cells[idx] = Cell.FLOOR;
      if (roomId >= 0 || world.roomMap[idx] < 0) world.roomMap[idx] = roomId;
      world.floorTex[idx] = floorTex;
      if (world.features[idx] !== Feature.NONE) world.features[idx] = Feature.NONE;
    }
  }
}

export function fillBasinWater(world: World, room: Room, field: ReactionField): void {
  for (let y = room.y + 10; y < room.y + room.h - 8; y++) {
    for (let x = room.x + 10; x < room.x + room.w - 10; x++) {
      const c = reactionAt(field, x, y);
      if (laneScore(c) < 0.58 && hash01(SEED, x, y, 31) < 0.74) continue;
      addWetCell(world, x, y);
    }
  }
  stampSurfaceSplat(world, roomCx(room), roomCy(room), 0.5, 0.5, 18, 0.24, SEED ^ 0xbaa, 58, 174, 126, false);
}

export function stainReactionRoom(world: World, room: Room, field: ReactionField, salt: number): void {
  for (let y = room.y + 3; y < room.y + room.h - 3; y++) {
    for (let x = room.x + 3; x < room.x + room.w - 3; x++) {
      const c = reactionAt(field, x, y);
      if (c < 0.16 || c > 0.5 || hash01(salt, x, y, 11) < 0.72) continue;
      const idx = world.idx(x, y);
      if (world.cells[idx] === Cell.FLOOR && world.features[idx] === Feature.NONE) {
        world.floorTex[idx] = c > 0.3 ? Tex.F_WATER : room.floorTex;
        if (c > 0.34 && hash01(salt, x, y, 19) > 0.62) world.cells[idx] = Cell.WATER;
      }
    }
  }
}

export function stampReactionWater(world: World, field: ReactionField, salt: number, cap: number): void {
  let changed = 0;
  for (let gy = 0; gy < FIELD_SIZE && changed < cap; gy++) {
    for (let gx = 0; gx < FIELD_SIZE && changed < cap; gx++) {
      const c = field.v[gy * FIELD_SIZE + gx];
      if (c < 0.18 || c > 0.45 || hash01(salt, gx, gy, 7) < 0.42) continue;
      const x = Math.floor(gx * FIELD_CELL + hash01(salt, gx, gy, 17) * FIELD_CELL);
      const y = Math.floor(gy * FIELD_CELL + hash01(salt, gx, gy, 29) * FIELD_CELL);
      const idx = world.idx(x, y);
      if (world.cells[idx] !== Cell.FLOOR || world.hermoWall[idx] || world.features[idx] !== Feature.NONE) continue;
      const room = world.rooms[world.roomMap[idx]];
      if (room?.name.includes('шлюз') || room?.name.includes('кабина')) continue;
      world.cells[idx] = Cell.WATER;
      world.floorTex[idx] = Tex.F_WATER;
      changed++;
      if ((changed & 15) === 0) stampSurfaceSplat(world, x, y, 0.5, 0.5, 2.5, 0.12, salt ^ idx, 54, 160, 102, false);
    }
  }
}

export function laplace(values: Float32Array, x: number, y: number): number {
  const center = values[y * FIELD_SIZE + x];
  return -center
    + (values[y * FIELD_SIZE + fieldWrap(x - 1)] + values[y * FIELD_SIZE + fieldWrap(x + 1)] + values[fieldWrap(y - 1) * FIELD_SIZE + x] + values[fieldWrap(y + 1) * FIELD_SIZE + x]) * 0.2
    + (values[fieldWrap(y - 1) * FIELD_SIZE + fieldWrap(x - 1)] + values[fieldWrap(y - 1) * FIELD_SIZE + fieldWrap(x + 1)] + values[fieldWrap(y + 1) * FIELD_SIZE + fieldWrap(x - 1)] + values[fieldWrap(y + 1) * FIELD_SIZE + fieldWrap(x + 1)]) * 0.05;
}

export function reactionAt(field: ReactionField, x: number, y: number): number {
  const gx = fieldWrap(Math.floor(x / FIELD_CELL));
  const gy = fieldWrap(Math.floor(y / FIELD_CELL));
  return field.v[gy * FIELD_SIZE + gx];
}

export function reactionLaneAt(field: ReactionField, x: number, y: number): number {
  return laneScore(reactionAt(field, x, y));
}

export function laneScore(value: number): number {
  const a = Math.max(0, 1 - Math.abs(value - 0.22) / 0.11);
  const b = Math.max(0, 1 - Math.abs(value - 0.36) / 0.08);
  return Math.max(a, b * 0.88);
}

export function fieldWrap(value: number): number {
  return ((value % FIELD_SIZE) + FIELD_SIZE) % FIELD_SIZE;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function hazardCellsForRoom(world: World, room: Room, cap: number): number[] {
  const cells: number[] = [];
  for (let y = room.y + 2; y < room.y + room.h - 2 && cells.length < cap; y++) {
    for (let x = room.x + 2; x < room.x + room.w - 2 && cells.length < cap; x++) {
      const idx = world.idx(x, y);
      if (world.cells[idx] !== Cell.WATER && world.cells[idx] !== Cell.FLOOR) continue;
      if (world.features[idx] !== Feature.NONE) continue;
      if (hash01(SEED, x, y, room.id) < 0.46) cells.push(idx);
    }
  }
  return cells;
}

export function addWetCell(world: World, x: number, y: number): void {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return;
  world.cells[idx] = Cell.WATER;
  world.floorTex[idx] = Tex.F_WATER;
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const idx = world.idx(x, y);
  if (world.cells[idx] === Cell.FLOOR || world.cells[idx] === Cell.WATER) world.features[idx] = feature;
}

export function markScreenWall(world: World, x: number, y: number, frame: number): void {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.WALL) return;
  world.features[idx] = Feature.SCREEN;
  world.wallTex[idx] = (Tex.SCREEN_BASE + (frame % 8) * 4) as Tex;
  if (!world.screenCells.includes(idx)) world.screenCells.push(idx);
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

export function dropItem(world: World, entities: Entity[], nextId: NextId, x: number, y: number, defId: string, count: number): void {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) return;
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

export function roomCx(room: Room): number {
  return room.x + Math.floor(room.w / 2);
}

export function roomCy(room: Room): number {
  return room.y + Math.floor(room.h / 2);
}

