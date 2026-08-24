/**
 * Перевалка (route z = -12).
 *
 * Единственный чётный слот маршрута, у которого не было дизайн-этажа: лифт
 * проваливался в fallback-шаг ±2 и курсор маршрута застревал, отрезая всю
 * нижнюю половину авторских этажей. Этот модуль закрывает дыру.
 *
 * Смысл места: грузовой ярус между Чёрным рынком 88 (z=-10) и Производственным
 * поясом (z=-14). Сверху приходит товар с рынка, вниз уходит в промзону.
 * Ликвидаторы держат весовую и досмотр посреди галереи; Wild держат серый обход
 * понизу. У игрока есть выбор маршрута: через досмотр или в обход.
 *
 * Первая версия сознательно компактная — геометрия, комнаты, лифты обоих
 * направлений, территория, контейнеры и амбиентная популяция. Авторские NPC,
 * побочные квесты и досмотровая механика наращиваются поверх этого каркаса.
 */
import {
  AIGoal,
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Faction,
  Feature,
  LiftDirection,
  NpcState,
  Occupation,
  RoomType,
  Tex,
  ZoneFaction,
  type ContainerAccess,
  type Entity,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { withSeededRandom } from '../../core/rand';
import { freshNeeds } from '../../data/catalog';
import { ensureConnectivity, generateZones, sanitizeDoors, stampRoom } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { newEntityIdCursor } from '../entity_ids';

export const PEREVALKA_DESIGN_FLOOR_ID = 'perevalka';
/** Маршрутный z, а не легаси-номер этажа: контейнеры чистятся самосбором по нему. */
export const PEREVALKA_Z = -12;
export const PEREVALKA_SEED = 0x9e12;

const GALLERY_Y = 512;
const NORTH_AISLE_Y = 470;
const SOUTH_AISLE_Y = 554;
const GREY_AISLE_Y = 598;
const WEST_X = 300;
const EAST_X = 724;

export interface PerevalkaLayout {
  spawnX: number;
  spawnY: number;
}

export interface PerevalkaRooms {
  dock: Room;
  weighing: Room;
  checkpoint: Room;
  greyDen: Room;
  shelter: Room;
  smoking: Room;
  stores: Room[];
}

function carveFloorCell(world: World, x: number, y: number, floorTex: Tex): void {
  const i = world.idx(x, y);
  world.cells[i] = Cell.FLOOR;
  world.roomMap[i] = -1;
  world.floorTex[i] = floorTex;
  world.factionControl[i] = ZoneFaction.CITIZEN;
}

function carveLineWidth(world: World, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex): void {
  if (ax !== bx && ay !== by) {
    carveLineWidth(world, ax, ay, bx, ay, width, floorTex);
    carveLineWidth(world, bx, ay, bx, by, width, floorTex);
    return;
  }
  const half = Math.floor(width / 2);
  const from = ax === bx ? Math.min(ay, by) : Math.min(ax, bx);
  const to = ax === bx ? Math.max(ay, by) : Math.max(ax, bx);
  for (let p = from; p <= to; p++) {
    for (let n = 0; n < width; n++) {
      const o = n - half;
      carveFloorCell(world, ax === bx ? ax + o : p, ax === bx ? p : ay + o, floorTex);
    }
  }
}

function createRoom(
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
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.WALL) world.wallTex[i] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) world.floorTex[world.idx(room.x + dx, room.y + dy)] = floorTex;
  }
  return room;
}

/** Дверь всегда попадает и в `world.doors`, и в `room.doors` — иначе комната запечатывается. */
function connectRoomToPoint(
  world: World,
  room: Room,
  doorX: number,
  doorY: number,
  targetX: number,
  targetY: number,
  state: DoorState,
  keyId = '',
): void {
  const idx = world.idx(doorX, doorY);
  world.cells[idx] = Cell.DOOR;
  world.wallTex[idx] = state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED ? Tex.HERMO_WALL : Tex.DOOR_METAL;
  world.doors.set(idx, { idx, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  room.doors.push(idx);
  const outX = doorX < room.x ? doorX - 1 : doorX >= room.x + room.w ? doorX + 1 : doorX;
  const outY = doorY < room.y ? doorY - 1 : doorY >= room.y + room.h ? doorY + 1 : doorY;
  carveLineWidth(world, outX, outY, targetX, targetY, 1, Tex.F_CONCRETE);
}

function placeFeature(world: World, x: number, y: number, feature: Feature): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.FLOOR) world.features[i] = feature;
}

function placeLift(world: World, x: number, y: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const li = world.idx(x, y);
  world.cells[li] = Cell.LIFT;
  world.wallTex[li] = Tex.LIFT_DOOR;
  world.liftDir[li] = direction;
  const bi = world.idx(buttonX, buttonY);
  if (world.cells[bi] === Cell.FLOOR) world.features[bi] = Feature.LIFT_BUTTON;
  world.liftDir[bi] = direction;
}

export function carvePerevalkaGalleries(world: World): PerevalkaLayout {
  // Главная грузовая галерея и два разгрузочных прохода.
  carveLineWidth(world, WEST_X, GALLERY_Y, EAST_X, GALLERY_Y, 5, Tex.F_CONCRETE);
  carveLineWidth(world, WEST_X + 24, NORTH_AISLE_Y, EAST_X - 24, NORTH_AISLE_Y, 3, Tex.F_CONCRETE);
  carveLineWidth(world, WEST_X + 24, SOUTH_AISLE_Y, EAST_X - 24, SOUTH_AISLE_Y, 3, Tex.F_CONCRETE);
  // Серый обход понизу: длиннее и уже, зато мимо весовой.
  carveLineWidth(world, WEST_X + 40, GREY_AISLE_Y, EAST_X - 40, GREY_AISLE_Y, 2, Tex.F_CONCRETE);
  for (const x of [WEST_X + 40, EAST_X - 40]) {
    carveLineWidth(world, x, SOUTH_AISLE_Y, x, GREY_AISLE_Y, 2, Tex.F_CONCRETE);
  }
  for (const x of [WEST_X + 24, 400, 512, 624, EAST_X - 24]) {
    carveLineWidth(world, x, NORTH_AISLE_Y, x, SOUTH_AISLE_Y, 3, Tex.F_CONCRETE);
  }
  return { spawnX: WEST_X + 8.5, spawnY: GALLERY_Y + 0.5 };
}

export function buildPerevalkaRooms(world: World): PerevalkaRooms {
  const dock = createRoom(world, RoomType.PRODUCTION, 432, 424, 64, 34, 'Погрузочная площадка', Tex.CONCRETE, Tex.F_CONCRETE);
  connectRoomToPoint(world, dock, dock.x + 32, dock.y + dock.h, dock.x + 32, NORTH_AISLE_Y, DoorState.OPEN);

  const weighing = createRoom(world, RoomType.OFFICE, 596, 478, 44, 26, 'Весовая ликвидаторов', Tex.PANEL, Tex.F_LINO);
  connectRoomToPoint(world, weighing, weighing.x - 1, weighing.y + 13, 624, weighing.y + 13, DoorState.CLOSED);

  const checkpoint = createRoom(world, RoomType.HQ, 640, 522, 34, 24, 'Пост досмотра', Tex.PANEL, Tex.F_LINO);
  connectRoomToPoint(world, checkpoint, checkpoint.x + 17, checkpoint.y - 1, checkpoint.x + 17, GALLERY_Y + 1, DoorState.CLOSED);

  const greyDen = createRoom(world, RoomType.HQ, 344, 576, 40, 26, 'Серая каморка перевозчиков', Tex.CONCRETE, Tex.F_CONCRETE);
  // Дверь смотрит на вертикаль серого обхода слева, иначе проём вырождается и
  // `sanitizeDoors` снимает дверь как избыточную — комната остаётся без записи.
  connectRoomToPoint(world, greyDen, greyDen.x - 1, greyDen.y + 13, WEST_X + 40, greyDen.y + 13, DoorState.CLOSED);

  const shelter = createRoom(world, RoomType.COMMON, 466, 570, 84, 22, 'Гермоубежище грузового яруса', Tex.HERMO_WALL, Tex.F_CONCRETE);
  shelter.sealed = true;
  connectRoomToPoint(world, shelter, shelter.x + 42, shelter.y - 1, shelter.x + 42, SOUTH_AISLE_Y, DoorState.HERMETIC_OPEN);

  const smoking = createRoom(world, RoomType.SMOKING, 392, 486, 26, 16, 'Курилка у весов', Tex.PANEL, Tex.F_LINO);
  connectRoomToPoint(world, smoking, smoking.x + 13, smoking.y + smoking.h, smoking.x + 13, GALLERY_Y - 2, DoorState.OPEN);

  const stores: Room[] = [];
  for (let i = 0; i < 4; i++) {
    const x = 336 + i * 108;
    const store = createRoom(world, RoomType.STORAGE, x, 432, 30, 24, `Времянка ${i + 1}`, Tex.CONCRETE, Tex.F_CONCRETE);
    connectRoomToPoint(world, store, store.x + 15, store.y + store.h, store.x + 15, NORTH_AISLE_Y, i === 3 ? DoorState.LOCKED : DoorState.CLOSED, i === 3 ? 'key' : '');
    stores.push(store);
  }

  return { dock, weighing, checkpoint, greyDen, shelter, smoking, stores };
}

export function placePerevalkaLifts(world: World): void {
  // Оба направления обязательны: этот этаж существует ради связности маршрута.
  placeLift(world, WEST_X + 2, GALLERY_Y, WEST_X + 6, GALLERY_Y, LiftDirection.UP);
  placeLift(world, EAST_X - 2, GALLERY_Y, EAST_X - 6, GALLERY_Y, LiftDirection.DOWN);
}

export function applyPerevalkaZones(world: World): void {
  for (const zone of world.zones) {
    zone.level = 3;
    zone.faction = ZoneFaction.CITIZEN;
    // Восток галереи — ликвидаторский досмотр, низ — серый обход перевозчиков.
    if (zone.cx > 590 && zone.cy > 460 && zone.cy < 560) zone.faction = ZoneFaction.LIQUIDATOR;
    if (zone.cy > 566) zone.faction = ZoneFaction.WILD;
    zone.fogged = false;
  }
  for (let i = 0; i < world.factionControl.length; i++) {
    world.factionControl[i] = world.zones[world.zoneMap[i]]?.faction ?? ZoneFaction.CITIZEN;
  }
}

export function reinforcePerevalkaAuthoredHqTerritory(world: World): void {
  for (const room of world.rooms) {
    if (room.type !== RoomType.HQ) continue;
    const owner = room.name.includes('Серая') ? ZoneFaction.WILD : ZoneFaction.LIQUIDATOR;
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        const idx = world.idx(room.x + dx, room.y + dy);
        if (world.roomMap[idx] === room.id) world.factionControl[idx] = owner;
      }
    }
    for (const doorIdx of room.doors) world.factionControl[doorIdx] = owner;
  }
}

export function decoratePerevalka(world: World, rooms: PerevalkaRooms): void {
  for (let x = WEST_X + 12; x < EAST_X - 12; x += 26) placeFeature(world, x, GALLERY_Y - 2, Feature.LAMP);
  for (const store of rooms.stores) {
    for (let i = 0; i < 4; i++) placeFeature(world, store.x + 3 + i * 7, store.y + 4, Feature.SHELF);
  }
  for (let i = 0; i < 6; i++) placeFeature(world, rooms.dock.x + 6 + i * 10, rooms.dock.y + 6, Feature.MACHINE);
  placeFeature(world, rooms.weighing.x + 8, rooms.weighing.y + 8, Feature.DESK);
  placeFeature(world, rooms.weighing.x + 20, rooms.weighing.y + 8, Feature.SCREEN);
  placeFeature(world, rooms.checkpoint.x + 8, rooms.checkpoint.y + 8, Feature.DESK);
  placeFeature(world, rooms.greyDen.x + 8, rooms.greyDen.y + 8, Feature.TABLE);
  placeFeature(world, rooms.greyDen.x + 12, rooms.greyDen.y + 12, Feature.CHAIR);
  placeFeature(world, rooms.smoking.x + 6, rooms.smoking.y + 6, Feature.CHAIR);
  for (let i = 0; i < 4; i++) placeFeature(world, rooms.shelter.x + 10 + i * 20, rooms.shelter.y + 10, Feature.BED);
}

function addContainer(
  world: World,
  containerId: { v: number },
  room: Room,
  dx: number,
  dy: number,
  kind: ContainerKind,
  name: string,
  inventory: { defId: string; count: number }[],
  access: ContainerAccess,
  tags: string[],
): void {
  const x = world.wrap(room.x + dx);
  const y = world.wrap(room.y + dy);
  const container: WorldContainer = {
    id: containerId.v++,
    x,
    y,
    z: PEREVALKA_Z,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots: 12,
    faction: Faction.CITIZEN,
    access,
    discovered: access !== 'secret',
    tags: [PEREVALKA_DESIGN_FLOOR_ID, ...tags],
  };
  world.addContainer(container);
  placeFeature(world, x, y, Feature.SHELF);
}

export function placePerevalkaContainers(world: World, containerId: { v: number }, rooms: PerevalkaRooms): void {
  rooms.stores.forEach((store, i) => {
    addContainer(world, containerId, store, 4, 12, ContainerKind.WOODEN_CHEST, `Грузовой ящик ${i + 1}`, [
      { defId: i % 2 === 0 ? 'scrap' : 'wire_coil', count: 2 + (i % 3) },
      { defId: 'bandage', count: 1 },
    ], i === 3 ? 'locked' : 'public', ['freight']);
  });
  addContainer(world, containerId, rooms.weighing, 30, 18, ContainerKind.METAL_CABINET, 'Ящик изъятого', [
    { defId: 'cigs', count: 3 },
    { defId: 'ammo_9mm', count: 8 },
  ], 'locked', ['confiscated', 'liquidator']);
  addContainer(world, containerId, rooms.greyDen, 6, 18, ContainerKind.SECRET_STASH, 'Схрон перевозчиков', [
    { defId: 'water', count: 2 },
    { defId: 'bread', count: 2 },
  ], 'secret', ['contraband', 'wild']);
}

export function spawnPerevalkaAmbientTemplates(entities: Entity[], nextId: { v: number }, rooms: PerevalkaRooms): void {
  const posts: Array<{ room: Room; count: number; faction: Faction; occupation: Occupation; title: string }> = [
    { room: rooms.dock, count: 8, faction: Faction.CITIZEN, occupation: Occupation.STOREKEEPER, title: 'Грузчик перевалки' },
    { room: rooms.weighing, count: 3, faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, title: 'Весовщик' },
    { room: rooms.checkpoint, count: 3, faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, title: 'Досмотрщик' },
    { room: rooms.greyDen, count: 4, faction: Faction.WILD, occupation: Occupation.TRAVELER, title: 'Серый перевозчик' },
  ];
  let serial = 0;
  for (const post of posts) {
    for (let i = 0; i < post.count; i++) {
      const x = post.room.x + 3 + ((i * 5) % Math.max(1, post.room.w - 6));
      const y = post.room.y + 3 + ((i * 3) % Math.max(1, post.room.h - 6));
      entities.push({
        id: nextId.v++,
        type: EntityType.NPC,
        x: x + 0.5,
        y: y + 0.5,
        angle: (serial % 4) * (Math.PI / 2),
        pitch: 0,
        alive: true,
        speed: 0.68,
        sprite: post.occupation,
        name: `${post.title} ${i + 1}`,
        needs: freshNeeds(),
        hp: 84,
        maxHp: 84,
        money: 6 + (serial % 17),
        ai: { goal: AIGoal.WANDER, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 8 + (serial % 11), npcState: NpcState.WORKING },
        inventory: [{ defId: serial % 3 === 0 ? 'bread' : serial % 3 === 1 ? 'cigs' : 'water', count: 1 }],
        faction: post.faction,
        occupation: post.occupation,
        assignedRoomId: post.room.id,
        questId: -1,
      });
      serial++;
    }
  }
}

export function generatePerevalkaDesignFloor(seed = PEREVALKA_SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = newEntityIdCursor();
    const containerId = { v: 1 };

    const layout = carvePerevalkaGalleries(world);
    const rooms = buildPerevalkaRooms(world);
    generateZones(world);
    applyPerevalkaZones(world);
    reinforcePerevalkaAuthoredHqTerritory(world);
    placePerevalkaLifts(world);
    decoratePerevalka(world, rooms);
    placePerevalkaContainers(world, containerId, rooms);
    spawnPerevalkaAmbientTemplates(entities, nextId, rooms);

    ensureConnectivity(world, layout.spawnX, layout.spawnY);
    sanitizeDoors(world);
    world.rebuildContainerMap();
    world.bakeLights();

    return { world, entities, spawnX: layout.spawnX, spawnY: layout.spawnY };
  });
}
