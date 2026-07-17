import {
  Cell, EntityType, Feature, LiftDirection,
  RoomType, Tex, W, ZoneFaction,
  type Entity, type Item, type Room, type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { irand } from '../../core/rand';
import { Spr } from '../../render/sprite_index';
import { registerRouteCue } from '../../systems/route_cues';
import {
  carveCorridor,
  placeDoorAt,
  roomExit,
  stampRoom,
} from '../shared';
import { PODAD_DESIGN_FLOOR_ID, PODAD_DEFAULT_SEED, LIVING_TUNNEL_TAG, WALL_SNAKE_TAG, SECTION_SHIFT_TAG, HERALD_GATE_TAG, CAPILLARY_FIELD_TAG, PODAD_HQ_TAG, PODAD_SUPPORT_TAG, PodadTopologyNodeId, PodadTopologyNode, PodadTopologyEdge, PodadTopologyDescriptor, PodadRooms, PODAD_HQ_SPECS, PODAD_MICRO_SPECS } from "./meta";

export function expandPodadRouteGeometry(world: World, rand: () => number): void {
  const hqCores = stampPodadHqCompounds(world, rand);
  const stations = stampPodadOrganStations(world, rand);
  stampPodadScarYards(world, rand);
  connectPodadRouteNetwork(world, [...hqCores, ...stations], rand);
  world.markCellsDirty();
  world.markFloorTexDirty();
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
  world.markFogDirty();
}

export function reinforcePodadAuthoredHqTerritory(world: World): void {
  for (const room of world.rooms) {
    const owner = podadTaggedRoomOwner(room);
    if (owner === undefined) continue;
    if (room.name.includes(PODAD_HQ_TAG)) {
      room.type = RoomType.HQ;
      room.sealed = true;
    }
    paintPodadRoomOwner(world, room, owner);
  }
}

export function stampPodadHqCompounds(world: World, rand: () => number): Room[] {
  const cores: Room[] = [];
  for (const spec of PODAD_HQ_SPECS) {
    const coreW = spec.coreW ?? 22;
    const coreH = spec.coreH ?? 14;
    const core = stampPodadStyledRoom(
      world,
      RoomType.HQ,
      spec.x - (coreW >> 1),
      spec.y - (coreH >> 1),
      coreW,
      coreH,
      `${spec.coreName} ${PODAD_HQ_TAG}${spec.ownerId}]`,
      spec.wallTex,
      spec.floorTex,
      spec.owner,
    );
    if (!core) continue;
    core.sealed = true;
    decoratePodadExpansionRoom(world, core, spec.owner, Feature.DESK, rand);
    cores.push(core);

    const supports = [
      { type: RoomType.KITCHEN, name: 'кухня', dx: -10, dy: coreH + 8, w: 20, h: 10, feature: Feature.STOVE },
      { type: RoomType.STORAGE, name: 'склад', dx: -34, dy: -5, w: 18, h: 11, feature: Feature.SHELF },
      { type: RoomType.MEDICAL, name: 'медугол', dx: -10, dy: -coreH - 17, w: 20, h: 10, feature: Feature.BED },
      { type: RoomType.OFFICE, name: 'журнал', dx: 16, dy: -5, w: 18, h: 11, feature: Feature.DESK },
      { type: RoomType.COMMON, name: 'общая', dx: 16, dy: coreH + 5, w: 18, h: 10, feature: Feature.TABLE },
    ] as const;
    for (const support of supports) {
      const room = stampPodadStyledRoom(
        world,
        support.type,
        spec.x + support.dx,
        spec.y + support.dy,
        support.w,
        support.h,
        `Подад: ${support.name} миништаба ${spec.ownerId} ${PODAD_SUPPORT_TAG}${spec.ownerId}]`,
        spec.wallTex,
        support.type === RoomType.KITCHEN || support.type === RoomType.MEDICAL ? Tex.F_TILE : spec.floorTex,
        spec.owner,
      );
      if (!room) continue;
      decoratePodadExpansionRoom(world, room, spec.owner, support.feature, rand);
      connectPodadRoomToPoint(world, room, roomCenter(core).x, roomCenter(core).y);
    }
  }
  return cores;
}

export function stampPodadOrganStations(world: World, rand: () => number): Room[] {
  const stations: Room[] = [];
  let serial = 0;
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 6; gx++) {
      const baseX = 72 + gx * 176;
      const baseY = 96 + gy * 184;
      const wobbleX = Math.round((rand() - 0.5) * 22);
      const wobbleY = Math.round((rand() - 0.5) * 22);
      const x = world.wrap(baseX + wobbleX);
      const y = world.wrap(baseY + wobbleY);
      serial++;
      const owner = podadStationOwner(gx, gy, serial);
      const station = stampPodadStyledRoom(
        world,
        serial % 4 === 0 ? RoomType.PRODUCTION : RoomType.COMMON,
        x - 9,
        y - 7,
        18,
        14,
        `Станция органа Подада ${serial}`,
        ownerWallTex(owner),
        serial % 3 === 0 ? Tex.F_MEAT : Tex.F_GUT,
        owner,
      );
      if (!station) continue;
      decoratePodadExpansionRoom(world, station, owner, serial % 3 === 0 ? Feature.APPARATUS : Feature.CANDLE, rand);
      stations.push(station);

      for (let i = 0; i < PODAD_MICRO_SPECS.length; i++) {
        const micro = PODAD_MICRO_SPECS[i];
        const room = stampPodadStyledRoom(
          world,
          micro.type,
          x + micro.dx,
          y + micro.dy,
          micro.w,
          micro.h,
          `Микрокиста Подада ${serial}.${i + 1}: ${micro.name}`,
          ownerWallTex(owner),
          micro.type === RoomType.BATHROOM || micro.type === RoomType.MEDICAL ? Tex.F_TILE : (i % 2 === 0 ? Tex.F_GUT : Tex.F_MEAT),
          owner,
        );
        if (!room) continue;
        decoratePodadExpansionRoom(world, room, owner, podadMicroFeature(micro.type, i), rand);
        connectPodadRoomToPoint(world, room, roomCenter(station).x, roomCenter(station).y);
      }
    }
  }
  return stations;
}

export function stampPodadScarYards(world: World, rand: () => number): void {
  const scars = [
    { x: 348, y: 184, r: 19 },
    { x: 720, y: 380, r: 24 },
    { x: 312, y: 620, r: 23 },
    { x: 650, y: 728, r: 20 },
    { x: 932, y: 534, r: 17 },
  ];
  for (let i = 0; i < scars.length; i++) {
    const scar = scars[i];
    const cx = world.wrap(scar.x + Math.round((rand() - 0.5) * 12));
    const cy = world.wrap(scar.y + Math.round((rand() - 0.5) * 12));
    const yard = stampPodadStyledRoom(
      world,
      RoomType.CORRIDOR,
      cx - scar.r,
      cy - Math.max(8, scar.r >> 1),
      scar.r * 2,
      Math.max(16, scar.r),
      `Рубец самосбора Подада ${i + 1}`,
      Tex.GUT,
      Tex.F_MEAT,
      ZoneFaction.SAMOSBOR,
    );
    if (yard) decoratePodadScarRoom(world, yard, i);
  }
}

export function connectPodadRouteNetwork(world: World, rooms: readonly Room[], rand: () => number): void {
  if (rooms.length === 0) return;
  const sorted = [...rooms].sort((a, b) => {
    const ay = roomCenter(a).y;
    const by = roomCenter(b).y;
    if (Math.abs(ay - by) > 80) return ay - by;
    return roomCenter(a).x - roomCenter(b).x;
  });
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[(i + 1) % sorted.length];
    const ac = roomCenter(a);
    const bc = roomCenter(b);
    carveCorridor(world, ac.x, ac.y, bc.x, bc.y);
  }
  for (let i = 0; i < sorted.length; i += 5) {
    const a = sorted[i];
    const b = sorted[(i + 11 + Math.floor(rand() * 3)) % sorted.length];
    const ac = roomCenter(a);
    const bc = roomCenter(b);
    carveCorridor(world, ac.x, ac.y, bc.x, bc.y);
  }
}

export function stampPodadStyledRoom(
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
  if (!canStampPodadRoom(world, x, y, w, h)) return null;
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) {
        world.floorTex[ci] = floorTex;
        world.wallTex[ci] = 0;
        world.factionControl[ci] = owner;
        world.fog[ci] = Math.max(world.fog[ci], owner === ZoneFaction.SAMOSBOR ? 42 : 18);
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
      }
    }
  }
  return room;
}

export function canStampPodadRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.aptMask[ci] || world.cells[ci] === Cell.LIFT || world.features[ci] === Feature.LIFT_BUTTON) return false;
      if (world.doors.has(ci) || world.roomMap[ci] >= 0) return false;
    }
  }
  return true;
}

export function connectPodadRoomToPoint(world: World, room: Room, tx: number, ty: number): void {
  const exit = roomExit(world, room, tx, ty);
  placeDoorAt(world, exit.wx, exit.wy, room.id);
  carveCorridor(world, exit.ox, exit.oy, tx, ty);
}

export function decoratePodadExpansionRoom(world: World, room: Room, owner: TerritoryOwner, primary: Feature, rand: () => number): void {
  placePodadFeature(world, room.x + (room.w >> 1), room.y + (room.h >> 1), primary);
  const fixtures = Math.max(1, Math.min(5, Math.floor((room.w * room.h) / 34)));
  for (let i = 0; i < fixtures; i++) {
    const x = room.x + 1 + Math.floor(rand() * Math.max(1, room.w - 2));
    const y = room.y + 1 + Math.floor(rand() * Math.max(1, room.h - 2));
    placePodadFeature(world, x, y, i % 3 === 0 ? primary : podadOwnerFeature(owner, i));
  }
}

export function decoratePodadScarRoom(world: World, room: Room, serial: number): void {
  for (let dy = 1; dy < room.h - 1; dy++) {
    for (let dx = 1; dx < room.w - 1; dx++) {
      if (((dx * 13 + dy * 17 + serial * 19) % 29) !== 0) continue;
      const ci = world.idx(room.x + dx, room.y + dy);
      world.cells[ci] = (dx + dy + serial) % 5 === 0 ? Cell.WATER : Cell.FLOOR;
      world.floorTex[ci] = (dx + serial) % 3 === 0 ? Tex.F_WATER : Tex.F_MEAT;
      world.fog[ci] = Math.max(world.fog[ci], 48);
      world.factionControl[ci] = ZoneFaction.SAMOSBOR;
    }
  }
  placePodadFeature(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.APPARATUS);
}

export function placePodadFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.WALL || world.cells[ci] === Cell.LIFT || world.features[ci] === Feature.LIFT_BUTTON) return;
  world.features[ci] = feature;
}

export function podadStationOwner(gx: number, gy: number, serial: number): TerritoryOwner {
  if ((gx === 2 && gy <= 2) || (gx === 3 && gy <= 2) || serial % 7 === 0) return ZoneFaction.CULTIST;
  if (gx <= 1 && gy >= 3) return ZoneFaction.SCIENTIST;
  if (gx >= 4 && gy >= 3) return ZoneFaction.WILD;
  if (gx >= 4 && gy <= 1) return ZoneFaction.LIQUIDATOR;
  if (gx <= 1 && gy <= 1) return ZoneFaction.CITIZEN;
  return serial % 3 === 0 ? ZoneFaction.SAMOSBOR : ZoneFaction.WILD;
}

export function ownerWallTex(owner: TerritoryOwner): Tex {
  switch (owner) {
    case ZoneFaction.CITIZEN: return Tex.PANEL;
    case ZoneFaction.LIQUIDATOR: return Tex.METAL;
    case ZoneFaction.SCIENTIST: return Tex.PIPE;
    case ZoneFaction.WILD: return Tex.BRICK;
    case ZoneFaction.SAMOSBOR: return Tex.GUT;
    case ZoneFaction.CULTIST:
    default: return Tex.GUT;
  }
}

export function podadMicroFeature(type: RoomType, serial: number): Feature {
  switch (type) {
    case RoomType.KITCHEN: return serial % 2 === 0 ? Feature.STOVE : Feature.SINK;
    case RoomType.BATHROOM: return serial % 2 === 0 ? Feature.TOILET : Feature.SINK;
    case RoomType.STORAGE: return Feature.SHELF;
    case RoomType.MEDICAL: return Feature.BED;
    case RoomType.OFFICE: return Feature.DESK;
    case RoomType.SMOKING: return Feature.CANDLE;
    case RoomType.LIVING: return Feature.BED;
    default: return Feature.TABLE;
  }
}

export function podadOwnerFeature(owner: TerritoryOwner, serial: number): Feature {
  if (owner === ZoneFaction.LIQUIDATOR) return serial % 2 === 0 ? Feature.MACHINE : Feature.SHELF;
  if (owner === ZoneFaction.SCIENTIST) return serial % 2 === 0 ? Feature.APPARATUS : Feature.SCREEN;
  if (owner === ZoneFaction.CULTIST || owner === ZoneFaction.SAMOSBOR) return serial % 2 === 0 ? Feature.CANDLE : Feature.APPARATUS;
  if (owner === ZoneFaction.WILD) return serial % 2 === 0 ? Feature.TABLE : Feature.SHELF;
  return serial % 2 === 0 ? Feature.LAMP : Feature.CHAIR;
}

export function podadTaggedRoomOwner(room: Room): TerritoryOwner | undefined {
  const hqAt = room.name.indexOf(PODAD_HQ_TAG);
  const supportAt = room.name.indexOf(PODAD_SUPPORT_TAG);
  const tagAt = hqAt >= 0 ? hqAt : supportAt;
  if (tagAt < 0) return undefined;
  const tag = hqAt >= 0 ? PODAD_HQ_TAG : PODAD_SUPPORT_TAG;
  const end = room.name.indexOf(']', tagAt);
  const raw = room.name.slice(tagAt + tag.length, end < 0 ? undefined : end);
  return podadOwnerId(raw);
}

export function podadOwnerId(id: string): TerritoryOwner | undefined {
  switch (id) {
    case 'citizen': return ZoneFaction.CITIZEN;
    case 'liquidator': return ZoneFaction.LIQUIDATOR;
    case 'cultist': return ZoneFaction.CULTIST;
    case 'scientist': return ZoneFaction.SCIENTIST;
    case 'wild': return ZoneFaction.WILD;
    default: return undefined;
  }
}

export function paintPodadRoomOwner(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[ci] === room.id) world.factionControl[ci] = owner;
    }
  }
  for (const doorIdx of room.doors) world.factionControl[doorIdx] = owner;
}

export function paintPodadTerrain(world: World, field: Uint8Array): void {
  for (let i = 0; i < W * W; i++) {
    if (field[i]) {
      world.cells[i] = Cell.FLOOR;
      world.floorTex[i] = (i & 7) === 0 ? Tex.F_MEAT : Tex.F_GUT;
    } else {
      world.cells[i] = Cell.WALL;
      world.wallTex[i] = (i & 5) === 0 ? Tex.MEAT : Tex.GUT;
    }
  }
}

export function repaintRoom(world: World, room: Room, wallTex: Tex, floorTex: Tex): void {
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) {
        world.floorTex[ci] = floorTex;
        world.wallTex[ci] = 0;
      } else {
        world.wallTex[ci] = wallTex;
      }
    }
  }
}

export function decoratePodadRooms(world: World, rooms: PodadRooms): void {
  placeFeature(world, rooms.entry, 7, 7, Feature.LAMP);
  placeFeature(world, rooms.contact, 2, 2, Feature.CANDLE);
  placeFeature(world, rooms.contact, rooms.contact.w - 3, 2, Feature.SHELF);
  placeFeature(world, rooms.threshold, 2, 2, Feature.CANDLE);
  placeFeature(world, rooms.threshold, rooms.threshold.w - 3, 2, Feature.CANDLE);
  placeFeature(world, rooms.threshold, rooms.threshold.w >> 1, rooms.threshold.h >> 1, Feature.APPARATUS);
  placeFeature(world, rooms.upperLift, rooms.upperLift.w >> 1, rooms.upperLift.h >> 1, Feature.LIFT_BUTTON);

  for (const room of Object.values(rooms)) {
    for (let i = 0; i < 5; i++) {
      const x = room.x + irand(1, room.w - 2);
      const y = room.y + irand(1, room.h - 2);
      const ci = world.idx(x, y);
      if (world.features[ci] === Feature.NONE) world.features[ci] = i & 1 ? Feature.CANDLE : Feature.LAMP;
    }
  }
}

export function placeFeature(world: World, room: Room, ox: number, oy: number, feature: Feature): void {
  world.features[world.idx(room.x + ox, room.y + oy)] = feature;
}

export function markWallSnakeRoom(world: World, room: Room): void {
  const x0 = room.x + 1;
  const y0 = room.y + 1;
  const w = Math.min(room.w - 2, 28);
  const h = Math.min(room.h - 2, 18);
  room.name = `${room.name} ${WALL_SNAKE_TAG}${x0},${y0},${w},${h}]`;
  world.features[world.idx(x0, y0)] = Feature.SCREEN;
  for (let i = 0; i < (w + h) * 2 - 4; i += 2) {
    const p = perimeterPoint(world, x0, y0, w, h, i);
    const ci = world.idx(p.x, p.y);
    world.floorTex[ci] = Tex.F_CONCRETE;
    world.fog[ci] = Math.max(world.fog[ci], 24);
  }
}

export function markSectionShiftRoom(world: World, room: Room): void {
  const x = room.x + 1;
  const y = room.y + 1;
  const w = Math.min(room.w - 2, 30);
  const h = Math.min(room.h - 2, 22);
  const phase = 2;
  room.name = `${room.name} ${SECTION_SHIFT_TAG}${x},${y},${w},${h},${phase}]`;
  for (let dy = 1; dy <= h; dy++) {
    for (let dx = 1; dx <= w; dx++) {
      if (((dx + phase * 3) % 6) !== 0 && ((dy + phase * 2) % 7) !== 0) continue;
      const ci = world.idx(room.x + dx, room.y + dy);
      world.floorTex[ci] = Tex.F_TILE;
      world.fog[ci] = Math.max(world.fog[ci], 38);
    }
  }
  world.features[world.idx(room.x + (room.w >> 1), room.y + (room.h >> 1))] = Feature.APPARATUS;
}

export function paintCapillaryDisc(world: World, x: number, y: number, r: number, marked: Set<number>): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 1) continue;
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR || world.features[ci] === Feature.LIFT_BUTTON) continue;
      if (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) {
        world.floorTex[ci] = ((ci + dx + dy) & 3) === 0 ? Tex.F_MEAT : Tex.F_GUT;
        world.fog[ci] = Math.max(world.fog[ci], 18 + (ci & 7));
        marked.add(ci);
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = (ci & 1) === 0 ? Tex.GUT : Tex.MEAT;
      }
    }
  }
}

export function extractPodadTopologyDescriptor(world: World): PodadTopologyDescriptor {
  const nodes = podadTopologyNodes(world);
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const capillaryCells = podadCapillaryCells(world);
  const movingWallChokepointScore = topologyRoomScore(world, nodeMap.get('wall_snake')?.roomId);
  const sectionShiftChokepointScore = topologyRoomScore(world, nodeMap.get('section_shift')?.roomId);
  const edges: PodadTopologyEdge[] = [
    topologyEdge('entry', 'contact', 'retreat_or_talk', nodeMap, ['podad', 'retreat', 'contact']),
    topologyEdge('contact', 'herald_gate', 'fight_heralds', nodeMap, ['podad', 'herald', 'gate']),
    topologyEdge('entry', 'living_tunnel', 'use_living_tunnel', nodeMap, ['podad', 'living_tunnels', 'shortcut']),
    topologyEdge('living_tunnel', 'wall_snake', 'bait_moving_wall', nodeMap, ['podad', 'moving_walls', 'chokepoint']),
    topologyEdge('wall_snake', 'section_shift', 'time_wall_and_section', nodeMap, ['podad', 'section_shift', 'chokepoint']),
    topologyEdge('section_shift', 'upper_lift', 'retreat_after_shift', nodeMap, ['podad', 'retreat', 'lift']),
  ].filter(edge => edge.score > 0);
  return {
    routeId: PODAD_DESIGN_FLOOR_ID,
    capillaryCells,
    nodes,
    edges,
    sectionShiftChokepointScore,
    movingWallChokepointScore,
  };
}

export function podadTopologyNodes(world: World): PodadTopologyNode[] {
  const specs: readonly [PodadTopologyNodeId, string, readonly string[]][] = [
    ['entry', 'Корневая площадка Подада', ['podad', 'entry', 'capillary']],
    ['contact', 'Обожженная сторожка Подада', ['podad', 'contact', 'retreat']],
    ['living_tunnel', LIVING_TUNNEL_TAG, ['podad', 'living_tunnels', 'topology']],
    ['wall_snake', WALL_SNAKE_TAG, ['podad', 'moving_walls', 'chokepoint']],
    ['section_shift', SECTION_SHIFT_TAG, ['podad', 'section_shift', 'chokepoint']],
    ['herald_gate', HERALD_GATE_TAG, ['podad', 'herald', 'gate']],
    ['upper_lift', 'Верхняя створка Подада', ['podad', 'upper_lift', 'retreat']],
  ];
  const out: PodadTopologyNode[] = [];
  const roomsLen = world.rooms.length;
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const marker = spec[1];
    for (let j = 0; j < roomsLen; j++) {
      const room = world.rooms[j];
      if (room.name.includes(marker)) {
        const c = roomCenter(room);
        out.push({ id: spec[0], roomId: room.id, roomDefId: room.name, x: c.x + 0.5, y: c.y + 0.5, tags: spec[2] });
        break;
      }
    }
  }
  return out;
}

export function podadCapillaryCells(world: World): number {
  for (const room of world.rooms) {
    const tagAt = room.name.indexOf(CAPILLARY_FIELD_TAG);
    if (tagAt < 0) continue;
    const end = room.name.indexOf(']', tagAt);
    const raw = room.name.slice(tagAt + CAPILLARY_FIELD_TAG.length, end < 0 ? undefined : end);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, parsed | 0) : 0;
  }
  return 0;
}

export function topologyRoomScore(world: World, roomId: number | undefined): number {
  if (roomId === undefined) return 0;
  const room = world.rooms.find(candidate => candidate.id === roomId);
  if (!room) return 0;
  let walkable = 0;
  let narrow = 0;
  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      const ci = world.idx(room.x + x, room.y + y);
      if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) continue;
      walkable++;
      let exits = 0;
      if (world.cells[world.idx(room.x + x + 1, room.y + y)] !== Cell.WALL) exits++;
      if (world.cells[world.idx(room.x + x - 1, room.y + y)] !== Cell.WALL) exits++;
      if (world.cells[world.idx(room.x + x, room.y + y + 1)] !== Cell.WALL) exits++;
      if (world.cells[world.idx(room.x + x, room.y + y - 1)] !== Cell.WALL) exits++;
      if (exits <= 2) narrow++;
    }
  }
  const doorPressure = Math.max(1, 5 - Math.min(4, room.doors.length));
  const areaPressure = Math.min(4, walkable / 130);
  const narrowPressure = walkable > 0 ? Math.min(4, (narrow / walkable) * 5) : 0;
  return Math.round((doorPressure + areaPressure + narrowPressure) * 10) / 10;
}

export function topologyEdge(
  from: PodadTopologyNodeId,
  to: PodadTopologyNodeId,
  decision: string,
  nodes: ReadonlyMap<PodadTopologyNodeId, PodadTopologyNode>,
  tags: readonly string[],
): PodadTopologyEdge {
  const a = nodes.get(from);
  const b = nodes.get(to);
  if (!a || !b) return { from, to, decision, tags, score: 0 };
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const distanceScore = Math.max(1, Math.min(4, Math.hypot(dx, dy) / 70));
  const topologyBonus = tags.includes('chokepoint') ? 3 : tags.includes('herald') ? 2 : 1;
  return { from, to, decision, tags, score: Math.round((distanceScore + topologyBonus) * 10) / 10 };
}

export function forceUpperLift(world: World, room: Room): void {
  const lx = world.wrap(room.x + (room.w >> 1));
  const ly = world.wrap(room.y + (room.h >> 1));
  const li = world.idx(lx, ly);
  world.cells[li] = Cell.LIFT;
  world.liftDir[li] = LiftDirection.UP;
  world.wallTex[li] = Tex.LIFT_DOOR;
  world.floorTex[li] = Tex.F_CONCRETE;

  const bx = world.wrap(lx + 1);
  const bi = world.idx(bx, ly);
  world.cells[bi] = Cell.FLOOR;
  world.features[bi] = Feature.LIFT_BUTTON;
  world.liftDir[bi] = LiftDirection.UP;
  world.floorTex[bi] = Tex.F_CONCRETE;
}

export function registerPodadRouteCues(world: World, rooms: PodadRooms): void {
  const descriptor = extractPodadTopologyDescriptor(world);
  const movingScore = descriptor.movingWallChokepointScore;
  const shiftScore = descriptor.sectionShiftChokepointScore;
  registerPodadCue(world, rooms.entry, rooms.livingTunnel, {
    id: 'podad_living_tunnel_shortcut',
    label: 'живая кишка',
    hint: 'тоннель режет путь к стене-змейке, но зарастает за спиной',
    targetName: 'живой тоннель',
    color: '#d66',
    tags: ['podad', 'living_tunnels', 'topology', 'shortcut', 'capillary'],
    toneSeed: PODAD_DEFAULT_SEED + descriptor.capillaryCells,
    heardText: 'Капилляры тянут к живому тоннелю: это короткий путь, если успеть вернуться до зарастания.',
    followedText: 'Живой тоннель отмечен. Герметик или УФ даст время на отход.',
    ignoredText: 'Живой тоннель остался сбоку. Путь к Вестникам будет длиннее и громче.',
    decision: 'срезать путь или держать обычный коридор',
    risk: 'тоннель закрывает старые клетки',
    reward: 'быстрый фланг к стене-змейке',
  });
  registerPodadCue(world, rooms.livingTunnel, rooms.wallSnake, {
    id: 'podad_wall_snake_chokepoint',
    label: 'змейка стены',
    hint: `движущаяся стена держит проход, score ${movingScore}`,
    targetName: 'экран змейки',
    color: '#f84',
    tags: ['podad', 'moving_walls', 'wall_snake', 'chokepoint', 'bait'],
    toneSeed: PODAD_DEFAULT_SEED + Math.round(movingScore * 31),
    heardText: 'Стена-змейка шуршит по сухому желудку. Приманка, пауза или хвостовой зазор решают проход.',
    followedText: 'Змейка найдена. Бросай железо, еду или грибную массу, если проход стал узким.',
    ignoredText: 'Змейка продолжает резать обратный путь.',
    decision: 'ждать хвост, кормить экран или отступить',
    risk: 'подвижная стена сжимает узкий карман',
    reward: 'контролируемый проход к секционному сдвигу',
  });
  registerPodadCue(world, rooms.wallSnake, rooms.sectionShift, {
    id: 'podad_section_shift_chokepoint',
    label: 'секционный сдвиг',
    hint: `сдвиг комнаты предупреждает перед переносом, score ${shiftScore}`,
    targetName: 'аппарат секции',
    color: '#c8f',
    tags: ['podad', 'section_shift', 'moving_rooms', 'chokepoint', 'freeze'],
    toneSeed: PODAD_DEFAULT_SEED + Math.round(shiftScore * 47),
    heardText: 'Мокрый пролет не совпадает сам с собой. Аппарат секции можно выключить почти на минуту.',
    followedText: 'Аппарат секции отмечен. Заморозь сдвиг или проходи после предупреждения.',
    ignoredText: 'Секционный сдвиг остался активным между тобой и порогом.',
    decision: 'заморозить секцию, таймить рывок или заманить монстров',
    risk: 'перенос в том же зале под давлением монстров',
    reward: 'безопаснее вывести бой к порогу Вестников',
  });
  registerPodadCue(world, rooms.contact, rooms.threshold, {
    id: 'podad_herald_gate',
    label: 'порог Вестников',
    hint: 'три Вестника держат нижний маршрут закрытым',
    targetName: 'Порог Вестников',
    color: '#f44',
    tags: ['podad', 'herald', 'gate', 'lower_route', 'fight'],
    toneSeed: PODAD_DEFAULT_SEED + rooms.threshold.id * 101,
    heardText: 'Порог Вестников впереди: проверь обратный ход от контактной клетки, держи дверь между залпами и забирай награду с края, не из центра.',
    followedText: 'Порог Вестников отмечен. Держи дверь между залпами и забирай награду с края.',
    ignoredText: 'Порог Вестников остался впереди без проверенного отхода.',
    decision: 'убить Вестников, открыть нижний маршрут или отступить',
    risk: 'нижние лифты молчат до зачистки',
    reward: 'после боя маршрут вниз становится доступен',
  });
}

export function registerPodadCue(
  world: World,
  source: Room,
  target: Room,
  cue: {
    id: string;
    label: string;
    hint: string;
    targetName: string;
    color: string;
    tags: readonly string[];
    toneSeed: number;
    heardText: string;
    followedText: string;
    ignoredText: string;
    decision: string;
    risk: string;
    reward: string;
  },
): void {
  const from = roomCenter(source);
  const to = roomCenter(target);
  const cell = world.idx(from.x, from.y);
  registerRouteCue(world, {
    id: cue.id,
    x: from.x + 0.5,
    y: from.y + 0.5,
    targetX: to.x + 0.5,
    targetY: to.y + 0.5,
    z: 180,
    roomId: source.id,
    targetRoomId: target.id,
    zoneId: world.zoneMap[cell],
    label: cue.label,
    hint: cue.hint,
    targetName: cue.targetName,
    color: cue.color,
    tags: cue.tags,
    toneSeed: cue.toneSeed,
    radius: 10,
    targetRadius: 4,
    cooldownSec: 40,
    heardText: cue.heardText,
    followedText: cue.followedText,
    ignoredText: cue.ignoredText,
    routeGroup: {
      id: 'podad_topology',
      lead: 'живое мясо помечает короткие ходы',
      risk: cue.risk,
      decision: cue.decision,
      reward: cue.reward,
      mapLabel: 'Подад: топология',
      mapHint: 'живые тоннели, змейка стены, секционный сдвиг и порог Вестников',
    },
  });
}

export function dropItems(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  room: Room,
  ox: number,
  oy: number,
  inventory: Item[],
): void {
  const x = world.wrap(room.x + ox);
  const y = world.wrap(room.y + oy);
  if (world.cells[world.idx(x, y)] !== Cell.FLOOR) return;
  entities.push({
    id: nextId.v++, type: EntityType.ITEM_DROP,
    x: x + 0.5, y: y + 0.5,
    angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
    inventory,
  });
}

export function roomCenter(room: Room): { x: number; y: number } {
  return { x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) };
}

export function perimeterPoint(world: World, x0: number, y0: number, w: number, h: number, step: number): { x: number; y: number } {
  const len = Math.max(1, (w + h) * 2 - 4);
  let t = ((step % len) + len) % len;
  if (t < w) return { x: world.wrap(x0 + t), y: world.wrap(y0) };
  t -= w;
  if (t < h - 1) return { x: world.wrap(x0 + w - 1), y: world.wrap(y0 + 1 + t) };
  t -= h - 1;
  if (t < w - 1) return { x: world.wrap(x0 + w - 2 - t), y: world.wrap(y0 + h - 1) };
  t -= w - 1;
  return { x: world.wrap(x0), y: world.wrap(y0 + h - 2 - t) };
}

export function carveFieldDisc(field: Uint8Array, x: number, y: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 1) continue;
      field[wrapCoord(y + dy) * W + wrapCoord(x + dx)] = 1;
    }
  }
}

export function countNeighbors(field: Uint8Array, x: number, y: number, diagonals: boolean): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (!diagonals && dx !== 0 && dy !== 0) continue;
      count += field[wrapCoord(y + dy) * W + wrapCoord(x + dx)] ? 1 : 0;
    }
  }
  return count;
}

export function hash32(v: number): number {
  v |= 0;
  v ^= v >>> 16;
  v = Math.imul(v, 0x7feb352d);
  v ^= v >>> 15;
  v = Math.imul(v, 0x846ca68b);
  v ^= v >>> 16;
  return v >>> 0;
}

export function wrapCoord(v: number): number {
  return ((v % W) + W) % W;
}

