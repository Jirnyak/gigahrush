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
import {
  stampRoom,
} from '../shared';
import { CX, CY, SiliconRooms, SiliconPoint, SiliconDoorSide, SiliconHqSite, SiliconSupportSpec, SILICON_GRAPH_X, SILICON_GRAPH_Y, SILICON_HQ_SITES } from "./meta";

export function initWorld(world: World): void {
  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.METAL;
    world.floorTex[i] = Tex.F_CONCRETE;
    world.factionControl[i] = ZoneFaction.LIQUIDATOR;
  }
}

export function buildRooms(world: World): SiliconRooms {
  const entry = addRoom(world, RoomType.CORRIDOR, CX - 42, CY + 138, 84, 24, 'Входной шлюз НЕТ-колодца', Tex.PIPE, Tex.F_CONCRETE);
  const well = addRoom(world, RoomType.COMMON, CX - 74, CY - 58, 148, 116, 'Кремниевый колодец без дна', Tex.METAL, Tex.F_CONCRETE);
  const terminal = addRoom(world, RoomType.PRODUCTION, CX - 58, CY - 148, 116, 46, 'Терминальный зал НЕТ-ветки', Tex.DARK, Tex.F_CONCRETE);
  const cibo = addRoom(world, RoomType.MEDICAL, CX - 158, CY - 86, 48, 38, 'Кабина Сибо у холодного экрана', Tex.PANEL, Tex.F_TILE);
  const lab = addRoom(world, RoomType.MEDICAL, CX + 108, CY - 86, 54, 38, 'Лаборатория киборга-учёного', Tex.METAL, Tex.F_TILE);
  const checkpoint = addRoom(world, RoomType.HQ, CX - 158, CY + 72, 62, 38, 'Администраторский пост сверки', Tex.MARBLE, Tex.F_RED_CARPET);
  const vault = addRoom(world, RoomType.STORAGE, CX + 94, CY + 76, 58, 40, 'Сейф GBE за кремниевой решёткой', Tex.METAL, Tex.F_CONCRETE);
  const lowerLift = addRoom(world, RoomType.CORRIDOR, CX + 26, CY + 148, 46, 24, 'Нижняя кабина после колодца', Tex.PIPE, Tex.F_CONCRETE);

  carveVoidShaft(world, well);
  return { entry, well, terminal, cibo, lab, checkpoint, vault, lowerLift };
}

export function connectCore(world: World, rooms: SiliconRooms): void {
  carveLineWidth(world, CX, rooms.entry.y, CX, rooms.well.y + rooms.well.h + 1, 5, Tex.F_CONCRETE);
  carveLineWidth(world, CX, rooms.terminal.y + rooms.terminal.h + 1, CX, rooms.well.y - 1, 4, Tex.F_CONCRETE);
  carveLineWidth(world, rooms.cibo.x + rooms.cibo.w + 1, rooms.cibo.y + 20, rooms.well.x - 1, rooms.cibo.y + 20, 3, Tex.F_CONCRETE);
  carveLineWidth(world, rooms.well.x + rooms.well.w + 1, rooms.lab.y + 20, rooms.lab.x - 1, rooms.lab.y + 20, 3, Tex.F_CONCRETE);
  carveLineWidth(world, rooms.checkpoint.x + rooms.checkpoint.w + 1, rooms.checkpoint.y + 18, rooms.well.x - 1, rooms.checkpoint.y + 18, 3, Tex.F_CONCRETE);
  carveLineWidth(world, rooms.well.x + rooms.well.w + 1, rooms.vault.y + 20, rooms.vault.x - 1, rooms.vault.y + 20, 3, Tex.F_CONCRETE);
  carveLineWidth(world, CX + 48, rooms.well.y + rooms.well.h + 1, rooms.lowerLift.x + 23, rooms.lowerLift.y - 1, 3, Tex.F_CONCRETE);

  addDoor(world, rooms.terminal, CX, rooms.terminal.y + rooms.terminal.h, DoorState.CLOSED);
  addDoor(world, rooms.cibo, rooms.cibo.x + rooms.cibo.w, rooms.cibo.y + 20, DoorState.CLOSED);
  addDoor(world, rooms.lab, rooms.lab.x - 1, rooms.lab.y + 20, DoorState.CLOSED);
  addDoor(world, rooms.checkpoint, rooms.checkpoint.x + rooms.checkpoint.w, rooms.checkpoint.y + 18, DoorState.CLOSED);
  addDoor(world, rooms.vault, rooms.vault.x - 1, rooms.vault.y + 20, DoorState.LOCKED, 'permanent_pass');
}

export function decorateRooms(world: World, rooms: SiliconRooms): void {
  for (let x = rooms.terminal.x + 8; x < rooms.terminal.x + rooms.terminal.w - 8; x += 8) {
    markScreenWall(world, x, rooms.terminal.y - 1, 2 + ((x >> 3) % 6));
  }
  for (let x = rooms.terminal.x + 14; x < rooms.terminal.x + rooms.terminal.w - 12; x += 18) {
    setFeature(world, x, rooms.terminal.y + 18, Feature.APPARATUS);
  }
  setFeature(world, rooms.cibo.x + 8, rooms.cibo.y + 10, Feature.DESK);
  setFeature(world, rooms.cibo.x + rooms.cibo.w - 8, rooms.cibo.y + 14, Feature.APPARATUS);
  markScreenWall(world, rooms.cibo.x + 18, rooms.cibo.y - 1, 7);

  setFeature(world, rooms.lab.x + 8, rooms.lab.y + 10, Feature.APPARATUS);
  setFeature(world, rooms.lab.x + 18, rooms.lab.y + 14, Feature.DESK);
  setFeature(world, rooms.lab.x + rooms.lab.w - 8, rooms.lab.y + rooms.lab.h - 8, Feature.SHELF);
  markScreenWall(world, rooms.lab.x + 28, rooms.lab.y - 1, 5);

  setFeature(world, rooms.checkpoint.x + 10, rooms.checkpoint.y + 12, Feature.DESK);
  setFeature(world, rooms.checkpoint.x + 24, rooms.checkpoint.y + 12, Feature.CHAIR);
  markScreenWall(world, rooms.checkpoint.x + rooms.checkpoint.w - 12, rooms.checkpoint.y - 1, 1);

  setFeature(world, rooms.vault.x + 12, rooms.vault.y + 12, Feature.SHELF);
  setFeature(world, rooms.vault.x + rooms.vault.w - 12, rooms.vault.y + 18, Feature.APPARATUS);
  setFeature(world, rooms.entry.x + 26, rooms.entry.y + 8, Feature.LAMP);
  setFeature(world, rooms.lowerLift.x + 18, rooms.lowerLift.y + 8, Feature.LAMP);

  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2;
    const x = Math.floor(CX + Math.cos(ang) * 54);
    const y = Math.floor(CY + Math.sin(ang) * 40);
    const ci = world.idx(x, y);
    if (world.cells[ci] === Cell.FLOOR) {
      world.features[ci] = i % 3 === 0 ? Feature.CANDLE : Feature.LAMP;
    }
  }
}

export function placeLifts(world: World, rooms: SiliconRooms): void {
  placeLift(world, rooms.entry.x + 10, rooms.entry.y + 11, rooms.entry.x + 15, rooms.entry.y + 11, LiftDirection.UP);
  placeLift(world, rooms.lowerLift.x + rooms.lowerLift.w - 8, rooms.lowerLift.y + 11, rooms.lowerLift.x + rooms.lowerLift.w - 13, rooms.lowerLift.y + 11, LiftDirection.DOWN);
}

export function tuneZones(world: World): void {
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, CX, CY);
    zone.faction = d < 170 ? ZoneFaction.LIQUIDATOR : d < 310 ? ZoneFaction.WILD : ZoneFaction.CITIZEN;
    zone.level = d < 210 ? 4 : 3;
    zone.fogged = false;
    zone.hasLift = false;
  }
  for (let i = 0; i < W * W; i++) {
    world.factionControl[i] = world.zones[world.zoneMap[i]]?.faction ?? ZoneFaction.LIQUIDATOR;
  }
}

export function placeDrops(world: World, entities: Entity[], nextId: { v: number }, rooms: SiliconRooms): void {
  dropItem(world, entities, nextId, rooms.terminal.x + 18, rooms.terminal.y + 18, 'circuit_board', 1);
  dropItem(world, entities, nextId, rooms.well.x + 18, rooms.well.y + rooms.well.h - 18, 'ammo_energy', 1);
  dropItem(world, entities, nextId, rooms.lab.x + rooms.lab.w - 12, rooms.lab.y + rooms.lab.h - 10, 'nii_sample_container', 1);
  dropItem(world, entities, nextId, rooms.well.x + rooms.well.w - 20, rooms.well.y + 20, 'slime_sample_blue', 1);
  dropItem(world, entities, nextId, rooms.entry.x + 26, rooms.entry.y + 14, 'metal_water', 1);
}

export function expandSiliconNetWellRouteGeometry(world: World, rng: () => number): void {
  const mask = siliconProtectedMask(world);
  const podTargets = [
    { x: CX - 150, y: CY - 66 },
    { x: CX + 150, y: CY - 66 },
    { x: CX - 150, y: CY + 90 },
    { x: CX + 150, y: CY + 96 },
  ];

  const pods = [
    { type: RoomType.MEDICAL, x: CX - 374, y: CY - 202, w: 58, h: 30, name: 'НИИ-под Сибо: сухая камера' },
    { type: RoomType.MEDICAL, x: CX + 314, y: CY - 202, w: 60, h: 30, name: 'НИИ-под киборга: сухая камера' },
    { type: RoomType.HQ, x: CX - 386, y: CY + 154, w: 68, h: 30, name: 'Админ-под сверки НЕТ-доступа' },
    { type: RoomType.PRODUCTION, x: CX + 306, y: CY + 154, w: 70, h: 30, name: 'Пульт изоляции НИИ-подов' },
  ];

  for (let i = 0; i < pods.length; i++) {
    const spec = pods[i];
    const room = siliconMacroRoom(world, mask, spec.type, spec.x, spec.y, spec.w, spec.h, spec.name, Tex.PANEL, Tex.F_TILE, 3);
    if (!room) continue;
    decorateSiliconMacroRoom(world, room, i, rng);
    connectSiliconRoomTo(world, mask, room, podTargets[i], Tex.F_TILE, 0);
  }

  const serverRooms = [
    { x: CX - 250, y: CY - 316, w: 60, h: 24, target: { x: CX - 42, y: CY - 104 }, name: 'Серверная кремниевого северного ствола' },
    { x: CX - 72, y: CY - 342, w: 72, h: 24, target: { x: CX, y: CY - 104 }, name: 'Серверная обратного НЕТ-эхо' },
    { x: CX + 176, y: CY - 316, w: 66, h: 24, target: { x: CX + 42, y: CY - 104 }, name: 'Серверная Safeguard-сверки' },
    { x: CX - 238, y: CY + 260, w: 62, h: 24, target: { x: CX - 52, y: CY + 118 }, name: 'Кабельная проб кремния' },
    { x: CX + 178, y: CY + 260, w: 62, h: 24, target: { x: CX + 52, y: CY + 118 }, name: 'Кабельная нижнего НЕТ-сброса' },
  ];

  for (let i = 0; i < serverRooms.length; i++) {
    const spec = serverRooms[i];
    const room = siliconMacroRoom(world, mask, i >= 3 ? RoomType.STORAGE : RoomType.PRODUCTION, spec.x, spec.y, spec.w, spec.h, spec.name, Tex.DARK, Tex.F_CONCRETE, 3);
    if (!room) continue;
    decorateSiliconMacroRoom(world, room, i + pods.length, rng);
    connectSiliconRoomTo(world, mask, room, spec.target, Tex.F_CONCRETE, 16);
  }

  siliconMacroCorridor(world, mask, 92, CY - 242, 840, 5, 'Кристаллизованный северный сервисный коридор', Tex.F_TILE, 34);
  siliconMacroCorridor(world, mask, 92, CY + 226, 840, 5, 'Кристаллизованный южный сервисный коридор', Tex.F_TILE, 38);
  siliconMacroCorridor(world, mask, CX - 352, 116, 5, 780, 'Левая кабельная кишка НЕТ-колодца', Tex.F_CONCRETE, 28);
  siliconMacroCorridor(world, mask, CX + 348, 116, 5, 780, 'Правая кабельная кишка НЕТ-колодца', Tex.F_CONCRETE, 28);

  buildSiliconFactionHqCompounds(world, mask, rng);
  buildSiliconDeBruijnGraph(world, mask, rng);

  for (const p of [
    { x: CX - 352, y: CY - 242 }, { x: CX + 348, y: CY - 242 },
    { x: CX - 352, y: CY + 226 }, { x: CX + 348, y: CY + 226 },
  ]) {
    scatterSiliconCrystals(world, rng, p.x, p.y, 24);
  }

  const radialPods = placeRadialNetPods(world, mask, rng);
  carveVaultShell(world, mask);
  carveHilbertCircuitTraces(world, mask, radialPods);
  applySiliconCrystalBands(world, mask);

  world.markCellsDirty();
  world.markFloorTexDirty();
  world.markWallTexDirty();
  world.markFeaturesDirty();
  world.markFogDirty();
}

export function tuneSiliconNetWellRouteZones(world: World): void {
  for (const zone of world.zones) {
    const dx = world.delta(zone.cx, CX);
    const dy = world.delta(zone.cy, CY);
    const d = Math.sqrt(dx * dx + dy * dy);
    const protectedPodBand = Math.abs(dx) > 210 && Math.abs(dx) < 455 && Math.abs(dy) < 210;
    const serverBand = dy < -185 && Math.abs(dx) < 330 && zone.id % 2 === 0;
    if (d < 150) {
      zone.faction = ZoneFaction.SAMOSBOR;
      zone.level = 5;
    } else if (protectedPodBand || serverBand) {
      zone.faction = ZoneFaction.LIQUIDATOR;
      zone.level = d < 360 ? 4 : 5;
    } else if (d < 440) {
      zone.faction = ZoneFaction.WILD;
      zone.level = 4;
    } else {
      zone.faction = zone.id % 9 === 0 ? ZoneFaction.LIQUIDATOR : zone.id % 3 === 0 ? ZoneFaction.SAMOSBOR : ZoneFaction.WILD;
      zone.level = zone.faction === ZoneFaction.LIQUIDATOR ? 4 : 5;
    }
    zone.fogged = false;
    zone.hasLift = false;
  }
}

export function siliconProtectedMask(world: World): Uint8Array {
  const mask = new Uint8Array(W * W);
  for (const room of world.rooms) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) mask[world.idx(x, y)] = 1;
    }
  }
  for (const idx of world.doors.keys()) mask[idx] = 1;
  for (const container of world.containers) mask[world.idx(container.x, container.y)] = 1;
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.LIFT || world.features[i] === Feature.LIFT_BUTTON) mask[i] = 1;
  }
  return mask;
}

export function siliconRectTouchesMask(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number, margin: number): boolean {
  for (let dy = -margin; dy < h + margin; dy++) {
    for (let dx = -margin; dx < w + margin; dx++) {
      if (mask[world.idx(x + dx, y + dy)]) return true;
    }
  }
  return false;
}

export function siliconMacroRoom(
  world: World,
  mask: Uint8Array,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  margin: number,
): Room | null {
  const rx = Math.max(4, Math.min(W - w - 5, Math.round(x)));
  const ry = Math.max(4, Math.min(W - h - 5, Math.round(y)));
  if (siliconRectTouchesMask(world, mask, rx, ry, w, h, margin)) return null;
  const room: Room = {
    id: world.rooms.length,
    type,
    x: rx,
    y: ry,
    w,
    h,
    doors: [],
    sealed: false,
    name,
    apartmentId: -1,
    wallTex,
    floorTex,
  };
  world.rooms.push(room);
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const border = dx < 0 || dx >= w || dy < 0 || dy >= h;
      const ci = world.idx(rx + dx, ry + dy);
      mask[ci] = 1;
      world.cells[ci] = border ? Cell.WALL : Cell.FLOOR;
      world.roomMap[ci] = border ? -1 : room.id;
      world.wallTex[ci] = wallTex;
      world.floorTex[ci] = floorTex;
      world.features[ci] = Feature.NONE;
      if (!border && type !== RoomType.MEDICAL && type !== RoomType.HQ) world.fog[ci] = Math.max(world.fog[ci], 18);
    }
  }
  return room;
}

export function siliconMacroCorridor(
  world: World,
  mask: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  floorTex: Tex,
  fog: number,
): Room {
  const room: Room = {
    id: world.rooms.length,
    type: RoomType.CORRIDOR,
    x: world.wrap(x),
    y: world.wrap(y),
    w,
    h,
    doors: [],
    sealed: false,
    name,
    apartmentId: -1,
    wallTex: Tex.METAL,
    floorTex,
  };
  world.rooms.push(room);
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (mask[ci] || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR || world.hermoWall[ci]) continue;
      const border = dx < 0 || dx >= w || dy < 0 || dy >= h;
      if (border) {
        if (world.cells[ci] === Cell.WALL || world.cells[ci] === Cell.ABYSS) {
          world.cells[ci] = Cell.WALL;
          world.wallTex[ci] = Tex.METAL;
          world.features[ci] = Feature.NONE;
        }
        continue;
      }
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = room.id;
      world.floorTex[ci] = floorTex;
      world.fog[ci] = Math.max(world.fog[ci], fog);
      if ((dx + dy) % 17 === 0) world.features[ci] = Feature.APPARATUS;
    }
  }
  return room;
}

export function decorateSiliconMacroRoom(world: World, room: Room, serial: number, rng: () => number): void {
  if (room.type === RoomType.MEDICAL) {
    for (let x = room.x + 4; x < room.x + room.w - 5; x += 8) {
      setFeature(world, x, room.y + 4, Feature.APPARATUS);
      setFeature(world, x + 2, room.y + room.h - 5, Feature.DESK);
    }
    setFeature(world, room.x + room.w - 6, room.y + 5, Feature.SCREEN);
    setFeature(world, room.x + 6, room.y + room.h - 6, Feature.LAMP);
    return;
  }
  if (room.type === RoomType.HQ) {
    setFeature(world, room.x + 6, room.y + 5, Feature.DESK);
    setFeature(world, room.x + 12, room.y + 5, Feature.CHAIR);
    setFeature(world, room.x + room.w - 7, room.y + 5, Feature.SCREEN);
    for (let x = room.x + 8; x < room.x + room.w - 8; x += 12) setFeature(world, x, room.y + room.h - 6, Feature.SHELF);
    return;
  }
  if (room.type === RoomType.STORAGE) {
    for (let x = room.x + 4; x < room.x + room.w - 4; x += 5) {
      setFeature(world, x, room.y + 4, Feature.SHELF);
      if (rng() < 0.45) setFeature(world, x, room.y + room.h - 5, Feature.APPARATUS);
    }
    if (serial % 2 === 0) {
      const water = world.idx(room.x + (room.w >> 1), room.y + (room.h >> 1));
      world.cells[water] = Cell.WATER;
      world.floorTex[water] = Tex.F_WATER;
      world.fog[water] = Math.max(world.fog[water], 52);
    }
    return;
  }
  for (let x = room.x + 5; x < room.x + room.w - 5; x += 7) {
    setFeature(world, x, room.y + 4, Feature.APPARATUS);
    setFeature(world, x + 2, room.y + room.h - 5, serial % 2 === 0 ? Feature.MACHINE : Feature.SCREEN);
  }
  setFeature(world, room.x + room.w - 7, room.y + 5, Feature.LAMP);
}

export function buildSiliconFactionHqCompounds(world: World, mask: Uint8Array, rng: () => number): void {
  for (const site of SILICON_HQ_SITES) {
    const core = siliconMacroRoom(world, mask, RoomType.HQ, site.x, site.y, site.w, site.h, site.name, site.wallTex, site.floorTex, 2);
    if (!core) continue;
    core.sealed = true;
    markSiliconHermeticShell(world, core);
    paintSiliconRoomOwner(world, core, site.owner);
    decorateSiliconHqCore(world, core, site.owner);
    connectSiliconRoomTo(world, mask, core, { x: site.linkX, y: site.linkY }, site.floorTex, 12, DoorState.HERMETIC_OPEN);
    buildSiliconHqSupportRooms(world, mask, site, core, rng);
  }
}

export function buildSiliconHqSupportRooms(world: World, mask: Uint8Array, site: SiliconHqSite, core: Room, rng: () => number): void {
  const supports = siliconHqSupportSpecs(site.owner);
  const placements = [
    { dx: -26, dy: -18, w: 20, h: 11 },
    { dx: site.w + 10, dy: 2, w: 22, h: 12 },
    { dx: 6, dy: site.h + 10, w: 24, h: 12 },
    { dx: site.w - 18, dy: -18, w: 22, h: 11 },
  ] as const;
  for (let i = 0; i < supports.length; i++) {
    const support = supports[i];
    const place = placements[i];
    const room = siliconMacroRoom(
      world,
      mask,
      support.type,
      site.x + place.dx,
      site.y + place.dy,
      place.w,
      place.h,
      `${site.name}: ${support.name}`,
      support.wallTex,
      support.floorTex,
      0,
    );
    if (!room) continue;
    paintSiliconRoomOwner(world, room, site.owner);
    decorateSiliconSupportRoom(world, room, i + Math.floor(rng() * 7));
    connectSiliconRooms(world, mask, core, room, site.floorTex, DoorState.CLOSED);
  }
}

export function siliconHqSupportSpecs(owner: TerritoryOwner): readonly SiliconSupportSpec[] {
  switch (owner) {
    case ZoneFaction.SCIENTIST:
      return [
        { type: RoomType.OFFICE, name: 'офис сверки сигналов', wallTex: Tex.PANEL, floorTex: Tex.F_TILE },
        { type: RoomType.MEDICAL, name: 'лаборатория живого кремния', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
        { type: RoomType.STORAGE, name: 'склад сухих плат', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
        { type: RoomType.KITCHEN, name: 'чайная НИИ-смены', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      ];
    case ZoneFaction.LIQUIDATOR:
      return [
        { type: RoomType.OFFICE, name: 'дежурная допуска', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
        { type: RoomType.STORAGE, name: 'оружейная ниша', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
        { type: RoomType.MEDICAL, name: 'перевязочный шкаф', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
        { type: RoomType.BATHROOM, name: 'санузел поста', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      ];
    case ZoneFaction.CULTIST:
      return [
        { type: RoomType.COMMON, name: 'комната тихого следа', wallTex: Tex.ROTTEN, floorTex: Tex.F_RED_CARPET },
        { type: RoomType.STORAGE, name: 'кладовая свечей и плат', wallTex: Tex.ROTTEN, floorTex: Tex.F_CONCRETE },
        { type: RoomType.KITCHEN, name: 'кипяток ритуальной смены', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
        { type: RoomType.MEDICAL, name: 'психометрическая ниша', wallTex: Tex.PANEL, floorTex: Tex.F_TILE },
      ];
    case ZoneFaction.WILD:
      return [
        { type: RoomType.COMMON, name: 'общий угол самозахвата', wallTex: Tex.ROTTEN, floorTex: Tex.F_CONCRETE },
        { type: RoomType.STORAGE, name: 'склад снятых экранов', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
        { type: RoomType.SMOKING, name: 'курилка у патч-панели', wallTex: Tex.ROTTEN, floorTex: Tex.F_CONCRETE },
        { type: RoomType.BATHROOM, name: 'грязный санитарный отсек', wallTex: Tex.TILE_W, floorTex: Tex.F_WATER },
      ];
    case ZoneFaction.CITIZEN:
    default:
      return [
        { type: RoomType.COMMON, name: 'общая комната кабельщиков', wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
        { type: RoomType.KITCHEN, name: 'кухня аварийной смены', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
        { type: RoomType.STORAGE, name: 'кладовая пайков', wallTex: Tex.PANEL, floorTex: Tex.F_CONCRETE },
        { type: RoomType.MEDICAL, name: 'медшкаф убежища', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      ];
  }
}

export function buildSiliconDeBruijnGraph(world: World, mask: Uint8Array, rng: () => number): void {
  for (const y of SILICON_GRAPH_Y) {
    carveSiliconLine(world, mask, SILICON_GRAPH_X[0], y, SILICON_GRAPH_X[SILICON_GRAPH_X.length - 1], y, 3, Tex.F_TILE, 26);
  }
  for (const x of SILICON_GRAPH_X) {
    carveSiliconLine(world, mask, x, SILICON_GRAPH_Y[0], x, SILICON_GRAPH_Y[SILICON_GRAPH_Y.length - 1], 2, Tex.F_CONCRETE, 24);
  }

  const nodes: Room[] = [];
  for (let gy = 0; gy < SILICON_GRAPH_Y.length; gy++) {
    for (let gx = 0; gx < SILICON_GRAPH_X.length; gx++) {
      const x = SILICON_GRAPH_X[gx];
      const y = SILICON_GRAPH_Y[gy];
      if (world.dist(x, y, CX, CY) < 156) continue;
      const serial = gy * SILICON_GRAPH_X.length + gx;
      const owner = siliconGraphOwner(serial);
      const room = siliconMacroRoom(
        world,
        mask,
        serial % 7 === 0 ? RoomType.PRODUCTION : serial % 5 === 0 ? RoomType.STORAGE : RoomType.OFFICE,
        x - 16,
        y - 9,
        32,
        18,
        `НЕТ-граф Брёйна: узел ${serial.toString(2).padStart(6, '0')}`,
        serial % 3 === 0 ? Tex.PANEL : Tex.METAL,
        serial % 4 === 0 ? Tex.F_TILE : Tex.F_CONCRETE,
        0,
      );
      if (!room) continue;
      nodes.push(room);
      paintSiliconRoomOwner(world, room, owner);
      decorateSiliconGraphNode(world, room, serial);
      addSiliconStationDoors(world, room);
      placeSiliconNodeMicroRooms(world, mask, room, serial, owner, rng);
    }
  }

  for (let i = 0; i < 16; i++) {
    const from = graphPoint(i % SILICON_GRAPH_X.length, (i * 3) % SILICON_GRAPH_Y.length);
    const to = graphPoint((i * 2 + 1) % SILICON_GRAPH_X.length, (i * 5 + 2) % SILICON_GRAPH_Y.length);
    carveSiliconLine(world, mask, from.x, from.y, to.x, to.y, 1, Tex.F_TILE, 34);
    setCircuitFeature(world, from.x, from.y, i % 2 === 0 ? Feature.SCREEN : Feature.APPARATUS);
    setCircuitFeature(world, to.x, to.y, i % 2 === 0 ? Feature.APPARATUS : Feature.SCREEN);
  }

  placeSiliconEdgeArchiveCells(world, mask, rng);
  for (let i = 0; i < nodes.length; i += 5) {
    const c = roomCenter(nodes[i]);
    scatterSiliconCrystals(world, rng, c.x, c.y, 12);
  }
}

export function graphPoint(gx: number, gy: number): SiliconPoint {
  return {
    x: SILICON_GRAPH_X[Math.max(0, Math.min(SILICON_GRAPH_X.length - 1, gx))],
    y: SILICON_GRAPH_Y[Math.max(0, Math.min(SILICON_GRAPH_Y.length - 1, gy))],
  };
}

export function siliconGraphOwner(serial: number): TerritoryOwner {
  if (serial % 17 === 0) return ZoneFaction.CULTIST;
  if (serial % 11 === 0) return ZoneFaction.WILD;
  if (serial % 7 === 0) return ZoneFaction.LIQUIDATOR;
  if (serial % 5 === 0) return ZoneFaction.CITIZEN;
  return ZoneFaction.SCIENTIST;
}

export function decorateSiliconGraphNode(world: World, room: Room, serial: number): void {
  for (let x = room.x + 4; x < room.x + room.w - 4; x += 6) {
    setFeature(world, x, room.y + 4, serial % 2 === 0 ? Feature.SCREEN : Feature.APPARATUS);
    setFeature(world, x + 2, room.y + room.h - 5, serial % 3 === 0 ? Feature.MACHINE : Feature.DESK);
  }
  setFeature(world, room.x + room.w - 5, room.y + 5, Feature.LAMP);
}

export function addSiliconStationDoors(world: World, room: Room): void {
  addSiliconRoomDoor(world, room, 'north', DoorState.CLOSED);
  addSiliconRoomDoor(world, room, 'south', DoorState.CLOSED);
  addSiliconRoomDoor(world, room, 'west', DoorState.CLOSED);
  addSiliconRoomDoor(world, room, 'east', DoorState.CLOSED);
}

export function placeSiliconNodeMicroRooms(
  world: World,
  mask: Uint8Array,
  node: Room,
  serial: number,
  owner: TerritoryOwner,
  rng: () => number,
): void {
  const specs = [
    { dx: -31, dy: -25, w: 13, h: 8, type: RoomType.STORAGE, name: 'шкаф патч-кабелей', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    { dx: node.w + 18, dy: -22, w: 14, h: 8, type: RoomType.OFFICE, name: 'будка обходчика узла', wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
    { dx: -30, dy: node.h + 14, w: 13, h: 8, type: RoomType.MEDICAL, name: 'камера живого кремния', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
    { dx: node.w + 18, dy: node.h + 12, w: 15, h: 8, type: RoomType.STORAGE, name: 'кассета сухих ячеек', wallTex: Tex.METAL, floorTex: Tex.F_TILE },
  ] as const;
  const limit = 3 + (serial % 3 === 0 ? 1 : 0);
  for (let i = 0; i < limit; i++) {
    const spec = specs[i];
    const room = siliconMacroRoom(
      world,
      mask,
      spec.type,
      node.x + spec.dx,
      node.y + spec.dy,
      spec.w,
      spec.h,
      `${node.name}: ${spec.name}`,
      spec.wallTex,
      spec.floorTex,
      0,
    );
    if (!room) continue;
    paintSiliconRoomOwner(world, room, owner);
    decorateSiliconSupportRoom(world, room, serial + i + Math.floor(rng() * 5));
    connectSiliconRooms(world, mask, node, room, spec.floorTex, DoorState.CLOSED);
  }
}

export function placeSiliconEdgeArchiveCells(world: World, mask: Uint8Array, rng: () => number): void {
  let serial = 0;
  for (const y of SILICON_GRAPH_Y) {
    for (let gx = 0; gx < SILICON_GRAPH_X.length - 1; gx++) {
      const x = Math.round((SILICON_GRAPH_X[gx] + SILICON_GRAPH_X[gx + 1]) / 2);
      const dy = (serial % 2 === 0 ? -24 : 18) + Math.floor(rng() * 5);
      placeSiliconEdgeArchiveCell(world, mask, x - 8, y + dy, x, y, serial++);
    }
  }
  for (const x of SILICON_GRAPH_X) {
    for (let gy = 0; gy < SILICON_GRAPH_Y.length - 1; gy++) {
      const y = Math.round((SILICON_GRAPH_Y[gy] + SILICON_GRAPH_Y[gy + 1]) / 2);
      const dx = (serial % 2 === 0 ? -24 : 18) + Math.floor(rng() * 5);
      placeSiliconEdgeArchiveCell(world, mask, x + dx, y - 5, x, y, serial++);
    }
  }
}

export function placeSiliconEdgeArchiveCell(world: World, mask: Uint8Array, x: number, y: number, linkX: number, linkY: number, serial: number): void {
  if (world.dist(x, y, CX, CY) < 134) return;
  const owner = siliconGraphOwner(serial + 3);
  const room = siliconMacroRoom(
    world,
    mask,
    serial % 4 === 0 ? RoomType.STORAGE : serial % 4 === 1 ? RoomType.OFFICE : serial % 4 === 2 ? RoomType.PRODUCTION : RoomType.BATHROOM,
    x,
    y,
    serial % 3 === 0 ? 18 : 15,
    serial % 5 === 0 ? 10 : 8,
    `НЕТ-регистр Брёйна: боковая ячейка ${serial + 1}`,
    serial % 2 === 0 ? Tex.METAL : Tex.PANEL,
    serial % 4 === 3 ? Tex.F_TILE : Tex.F_CONCRETE,
    0,
  );
  if (!room) return;
  paintSiliconRoomOwner(world, room, owner);
  decorateSiliconSupportRoom(world, room, serial);
  connectSiliconRoomTo(world, mask, room, { x: linkX, y: linkY }, room.floorTex, 22, DoorState.CLOSED);
}

export function decorateSiliconHqCore(world: World, room: Room, owner: TerritoryOwner): void {
  setFeature(world, room.x + 5, room.y + 5, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.DESK);
  setFeature(world, room.x + room.w - 7, room.y + 5, owner === ZoneFaction.SCIENTIST ? Feature.APPARATUS : Feature.SCREEN);
  setFeature(world, room.x + 6, room.y + room.h - 6, Feature.SHELF);
  setFeature(world, room.x + room.w - 8, room.y + room.h - 6, Feature.LAMP);
  for (let x = room.x + 14; x < room.x + room.w - 12; x += 14) {
    setFeature(world, x, room.y + (room.h >> 1), owner === ZoneFaction.SCIENTIST ? Feature.APPARATUS : Feature.TABLE);
  }
}

export function decorateSiliconSupportRoom(world: World, room: Room, serial: number): void {
  switch (room.type) {
    case RoomType.BATHROOM:
      setFeature(world, room.x + 3, room.y + 3, Feature.SINK);
      setFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.TOILET);
      break;
    case RoomType.KITCHEN:
      setFeature(world, room.x + 3, room.y + 3, Feature.STOVE);
      setFeature(world, room.x + room.w - 4, room.y + 3, Feature.SINK);
      setFeature(world, room.x + 5, room.y + room.h - 3, Feature.TABLE);
      break;
    case RoomType.MEDICAL:
      setFeature(world, room.x + 3, room.y + 3, Feature.APPARATUS);
      setFeature(world, room.x + room.w - 4, room.y + 3, Feature.SINK);
      break;
    case RoomType.STORAGE:
      for (let y = room.y + 3; y < room.y + room.h - 2; y += 4) {
        setFeature(world, room.x + 3, y, Feature.SHELF);
        setFeature(world, room.x + room.w - 4, y, Feature.SHELF);
      }
      break;
    case RoomType.OFFICE:
      setFeature(world, room.x + 3, room.y + 3, Feature.DESK);
      setFeature(world, room.x + room.w - 5, room.y + 3, serial % 2 === 0 ? Feature.SCREEN : Feature.SHELF);
      break;
    case RoomType.PRODUCTION:
      setFeature(world, room.x + 4, room.y + 4, Feature.MACHINE);
      setFeature(world, room.x + room.w - 5, room.y + 4, Feature.APPARATUS);
      break;
    default:
      setFeature(world, room.x + 4, room.y + 4, Feature.TABLE);
      setFeature(world, room.x + room.w - 5, room.y + room.h - 4, serial % 2 === 0 ? Feature.CHAIR : Feature.CANDLE);
      break;
  }
  if (serial % 3 === 0) setFeature(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.LAMP);
}

export function placeRadialNetPods(world: World, mask: Uint8Array, rng: () => number): SiliconPoint[] {
  const centers: SiliconPoint[] = [];
  const specs = [
    { a: -Math.PI * 0.92, type: RoomType.PRODUCTION, w: 42, h: 22, name: 'Радиальный НЕТ-под северо-западного кристалла' },
    { a: -Math.PI * 0.68, type: RoomType.STORAGE, w: 38, h: 22, name: 'Радиальный НЕТ-под сухих образцов' },
    { a: -Math.PI * 0.32, type: RoomType.PRODUCTION, w: 42, h: 22, name: 'Радиальный НЕТ-под Safeguard-отсечки' },
    { a: -Math.PI * 0.08, type: RoomType.MEDICAL, w: 36, h: 22, name: 'Радиальный НЕТ-под живого кремния' },
    { a: Math.PI * 0.18, type: RoomType.STORAGE, w: 38, h: 22, name: 'Радиальный НЕТ-под остывших ячеек' },
    { a: Math.PI * 0.42, type: RoomType.PRODUCTION, w: 42, h: 22, name: 'Радиальный НЕТ-под нижней ветки' },
    { a: Math.PI * 0.66, type: RoomType.HQ, w: 40, h: 22, name: 'Радиальный НЕТ-под протокола допуска' },
    { a: Math.PI * 0.9, type: RoomType.PRODUCTION, w: 42, h: 22, name: 'Радиальный НЕТ-под обратного эха' },
  ];

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const rx = Math.round(CX + Math.cos(spec.a) * 260 - spec.w / 2);
    const ry = Math.round(CY + Math.sin(spec.a) * 198 - spec.h / 2);
    const room = siliconMacroRoom(world, mask, spec.type, rx, ry, spec.w, spec.h, spec.name, Tex.PANEL, Tex.F_TILE, 2);
    if (!room) continue;
    decorateSiliconMacroRoom(world, room, i + 32, rng);
    const center = roomCenter(room);
    const ringTarget = {
      x: Math.round(CX + Math.cos(spec.a) * 106),
      y: Math.round(CY + Math.sin(spec.a) * 78),
    };
    connectSiliconRoomTo(world, mask, room, ringTarget, Tex.F_TILE, 30 + (i % 3) * 8);
    centers.push(center);
  }

  return centers;
}

export function carveVaultShell(world: World, mask: Uint8Array): void {
  const shell: SiliconPoint[] = [
    { x: CX + 70, y: CY + 62 },
    { x: CX + 176, y: CY + 62 },
    { x: CX + 176, y: CY + 132 },
    { x: CX + 70, y: CY + 132 },
    { x: CX + 70, y: CY + 62 },
  ];
  for (let i = 1; i < shell.length; i++) {
    carveSiliconLine(world, mask, shell[i - 1].x, shell[i - 1].y, shell[i].x, shell[i].y, 2, Tex.F_TILE, 42);
  }
  for (const p of shell) {
    setCircuitFeature(world, p.x, p.y, Feature.SCREEN);
    setCircuitFeature(world, p.x + 2, p.y, Feature.APPARATUS);
  }
}

export function carveHilbertCircuitTraces(world: World, mask: Uint8Array, radialPods: readonly SiliconPoint[]): void {
  const terminals: SiliconPoint[] = [
    { x: CX - 40, y: CY - 128 },
    { x: CX + 40, y: CY - 128 },
    { x: CX - 140, y: CY - 67 },
    { x: CX + 138, y: CY - 67 },
    { x: CX - 126, y: CY + 91 },
    { x: CX + 124, y: CY + 96 },
    ...radialPods,
  ];

  const route = hilbertTracePoints(3, CX - 112, CY - 96, 32);
  for (let i = 1; i < route.length; i++) {
    carveSiliconLine(world, mask, route[i - 1].x, route[i - 1].y, route[i].x, route[i].y, 1, Tex.F_TILE, 36);
  }
  for (let i = 0; i < route.length; i += 3) setCircuitFeature(world, route[i].x, route[i].y, i % 2 === 0 ? Feature.SCREEN : Feature.APPARATUS);

  for (let i = 0; i < terminals.length; i++) {
    const target = terminals[i];
    const hub = route[(i * 7 + 5) % route.length];
    carveSiliconLine(world, mask, hub.x, hub.y, target.x, target.y, 1, Tex.F_TILE, 34 + (i % 4) * 4);
    setCircuitFeature(world, target.x, target.y, i % 3 === 0 ? Feature.SCREEN : Feature.APPARATUS);
  }
}

export function hilbertTracePoints(order: number, x: number, y: number, step: number): SiliconPoint[] {
  const n = 1 << order;
  const points: SiliconPoint[] = [];
  for (let d = 0; d < n * n; d++) {
    const p = hilbertIndexToPoint(n, d);
    points.push({ x: x + p.x * step, y: y + p.y * step });
  }
  return points;
}

export function hilbertIndexToPoint(n: number, d: number): SiliconPoint {
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

export function applySiliconCrystalBands(world: World, mask: Uint8Array): void {
  for (let y = 64; y < W - 64; y++) {
    for (let x = 64; x < W - 64; x++) {
      const ci = world.idx(x, y);
      if (mask[ci] || world.cells[ci] !== Cell.FLOOR || world.features[ci] !== Feature.NONE) continue;
      const dx = world.delta(x, CX);
      const dy = world.delta(y, CY);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 132 || d > 470) continue;
      const angle = Math.atan2(dy, dx);
      const feed = Math.sin(d * 0.071 + angle * 6.0);
      const kill = Math.sin((dx - dy) * 0.036 + Math.sin((dx + dy) * 0.011) * 2.0);
      const noise = siliconCoordNoise(x, y);
      const band = feed * 0.52 + kill * 0.34 + noise * 0.32;
      if (band < 0.71) continue;
      world.floorTex[ci] = band > 0.92 ? Tex.F_WATER : Tex.F_TILE;
      world.fog[ci] = Math.max(world.fog[ci], band > 0.92 ? 64 : 42);
      if (noise > 0.9) world.features[ci] = Feature.APPARATUS;
      else if (noise < 0.08 && d > 210) world.features[ci] = Feature.SCREEN;
    }
  }
}

export function siliconCoordNoise(x: number, y: number): number {
  let n = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y ^ 0xc2b2ae35, 0x27d4eb2d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x2c1b3c6d);
  n ^= n >>> 12;
  return (n >>> 0) / 0x100000000;
}

export function roomCenter(room: Room): SiliconPoint {
  return { x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) };
}

export function setCircuitFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR && world.features[ci] === Feature.NONE) world.features[ci] = feature;
}

export function paintSiliconRoomOwner(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id && !world.aptMask[idx]) world.factionControl[idx] = owner;
    }
  }
  for (const idx of room.doors) {
    if (!world.aptMask[idx]) world.factionControl[idx] = owner;
  }
}

export function markSiliconHermeticShell(world: World, room: Room): void {
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
}

export function siliconDoorSite(room: Room, side: SiliconDoorSide): { x: number; y: number; ox: number; oy: number } {
  if (side === 'north') {
    const x = room.x + Math.max(2, Math.min(room.w - 3, room.w >> 1));
    return { x, y: room.y - 1, ox: x, oy: room.y - 2 };
  }
  if (side === 'south') {
    const x = room.x + Math.max(2, Math.min(room.w - 3, room.w >> 1));
    return { x, y: room.y + room.h, ox: x, oy: room.y + room.h + 1 };
  }
  if (side === 'west') {
    const y = room.y + Math.max(2, Math.min(room.h - 3, room.h >> 1));
    return { x: room.x - 1, y, ox: room.x - 2, oy: y };
  }
  const y = room.y + Math.max(2, Math.min(room.h - 3, room.h >> 1));
  return { x: room.x + room.w, y, ox: room.x + room.w + 1, oy: y };
}

export function sideTowardRoom(from: Room, to: Room): SiliconDoorSide {
  const ax = from.x + (from.w >> 1);
  const ay = from.y + (from.h >> 1);
  const bx = to.x + (to.w >> 1);
  const by = to.y + (to.h >> 1);
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'west' : 'east';
  return dy < 0 ? 'north' : 'south';
}

export function addSiliconRoomDoor(world: World, room: Room, side: SiliconDoorSide, state: DoorState, keyId = ''): number {
  const site = siliconDoorSite(room, side);
  forceOpenSiliconTile(world, site.ox, site.oy, room.floorTex, -1, 18);
  addDoor(world, room, site.x, site.y, state, keyId);
  return world.idx(site.x, site.y);
}

export function connectSiliconRooms(
  world: World,
  mask: Uint8Array,
  a: Room,
  b: Room,
  floorTex: Tex,
  state: DoorState,
): void {
  const aSide = sideTowardRoom(a, b);
  const bSide = sideTowardRoom(b, a);
  const aSite = siliconDoorSite(a, aSide);
  const bSite = siliconDoorSite(b, bSide);
  forceOpenSiliconTile(world, aSite.ox, aSite.oy, floorTex, -1, 16);
  forceOpenSiliconTile(world, bSite.ox, bSite.oy, floorTex, -1, 16);
  addDoor(world, a, aSite.x, aSite.y, state);
  addDoor(world, b, bSite.x, bSite.y, state === DoorState.LOCKED ? DoorState.CLOSED : state);
  carveSiliconLine(world, mask, aSite.ox, aSite.oy, bSite.ox, bSite.oy, 2, floorTex, 16);
}

export function connectSiliconRoomTo(
  world: World,
  mask: Uint8Array,
  room: Room,
  target: { x: number; y: number },
  floorTex: Tex,
  fog: number,
  state = DoorState.CLOSED,
  keyId = '',
): void {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  const dx = world.delta(cx, target.x);
  const dy = world.delta(cy, target.y);
  let doorX = cx;
  let doorY = cy;
  let outsideX = cx;
  let outsideY = cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    doorX = dx < 0 ? room.x - 1 : room.x + room.w;
    doorY = Math.max(room.y + 2, Math.min(room.y + room.h - 3, cy));
    outsideX = doorX + (dx < 0 ? -1 : 1);
    outsideY = doorY;
  } else {
      doorX = Math.max(room.x + 2, Math.min(room.x + room.w - 3, cx));
    doorY = dy < 0 ? room.y - 1 : room.y + room.h;
    outsideX = doorX;
    outsideY = doorY + (dy < 0 ? -1 : 1);
  }
  forceOpenSiliconTile(world, outsideX, outsideY, floorTex, -1, fog);
  addDoor(world, room, doorX, doorY, state, keyId);
  carveSiliconLine(world, mask, outsideX, outsideY, target.x, target.y, 2, floorTex, fog);
}

export function carveSiliconLine(
  world: World,
  mask: Uint8Array,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  fog: number,
): void {
  if (ax !== bx && ay !== by) {
    carveSiliconLine(world, mask, ax, ay, bx, ay, width, floorTex, fog);
    carveSiliconLine(world, mask, bx, ay, bx, by, width, floorTex, fog);
    return;
  }
  const half = width >> 1;
  const from = ax === bx ? Math.min(ay, by) : Math.min(ax, bx);
  const to = ax === bx ? Math.max(ay, by) : Math.max(ax, bx);
  for (let p = from; p <= to; p++) {
    for (let n = 0; n < width; n++) {
      const o = n - half;
      openSiliconTile(world, mask, ax === bx ? ax + o : p, ax === bx ? p : ay + o, floorTex, fog);
    }
  }
}

export function openSiliconTile(world: World, mask: Uint8Array, x: number, y: number, floorTex: Tex, fog: number): void {
  const ci = world.idx(x, y);
  if (mask[ci] || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR || world.hermoWall[ci]) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = -1;
  world.floorTex[ci] = floorTex;
  world.wallTex[ci] = Tex.METAL;
  world.features[ci] = Feature.NONE;
  world.fog[ci] = Math.max(world.fog[ci], fog);
}

export function forceOpenSiliconTile(world: World, x: number, y: number, floorTex: Tex, roomId: number, fog: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR || world.hermoWall[ci]) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = roomId;
  world.floorTex[ci] = floorTex;
  world.wallTex[ci] = Tex.METAL;
  world.features[ci] = Feature.NONE;
  world.fog[ci] = Math.max(world.fog[ci], fog);
}

export function scatterSiliconCrystals(world: World, rng: () => number, cx: number, cy: number, radius: number): void {
  for (let i = 0; i < 42; i++) {
    const ang = rng() * Math.PI * 2;
    const r = 3 + rng() * radius;
    const x = Math.round(cx + Math.cos(ang) * r);
    const y = Math.round(cy + Math.sin(ang) * r);
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.FLOOR || world.features[ci] !== Feature.NONE) continue;
    world.features[ci] = i % 3 === 0 ? Feature.SCREEN : Feature.APPARATUS;
    world.fog[ci] = Math.max(world.fog[ci], 44);
  }
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
      else if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = wallTex;
    }
  }
  return room;
}

export function carveLineWidth(world: World, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex): void {
  if (ax !== bx && ay !== by) {
    carveLineWidth(world, ax, ay, bx, ay, width, floorTex);
    carveLineWidth(world, bx, ay, bx, by, width, floorTex);
    return;
  }
  const half = width >> 1;
  const from = ax === bx ? Math.min(ay, by) : Math.min(ax, bx);
  const to = ax === bx ? Math.max(ay, by) : Math.max(ax, bx);
  for (let p = from; p <= to; p++) {
    for (let n = 0; n < width; n++) {
      const o = n - half;
      openTile(world, ax === bx ? ax + o : p, ax === bx ? p : ay + o, floorTex, -1);
    }
  }
}

export function openTile(world: World, x: number, y: number, floorTex: Tex, roomId: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR || world.hermoWall[ci]) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = roomId;
  world.floorTex[ci] = floorTex;
  if (world.features[ci] !== Feature.NONE) world.features[ci] = Feature.NONE;
}

export function carveVoidShaft(world: World, room: Room): void {
  const rx = room.x + (room.w >> 1);
  const ry = room.y + (room.h >> 1);
  for (let dy = -15; dy <= 15; dy++) {
    for (let dx = -15; dx <= 15; dx++) {
      if (dx * dx + dy * dy > 15 * 15) continue;
      const ci = world.idx(rx + dx, ry + dy);
      world.cells[ci] = Cell.ABYSS;
      world.roomMap[ci] = room.id;
      world.floorTex[ci] = Tex.F_ABYSS;
      world.features[ci] = Feature.NONE;
    }
  }
}

export function addDoor(world: World, room: Room, x: number, y: number, state: DoorState, keyId = ''): void {
  const idx = world.idx(x, y);
  world.cells[idx] = Cell.DOOR;
  world.roomMap[idx] = room.id;
  world.hermoWall[idx] = state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED ? 1 : 0;
  world.wallTex[idx] = state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED
    ? Tex.HERMO_WALL
    : Tex.DOOR_METAL;
  world.doors.set(idx, {
    idx,
    state,
    roomA: room.id,
    roomB: -1,
    keyId,
    timer: 0,
  });
  if (!room.doors.includes(idx)) room.doors.push(idx);
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) world.features[ci] = feature;
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

export function dropItem(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  defId: string,
  count: number,
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
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

