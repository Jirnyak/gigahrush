/* ── Слой 4: снабжение Блинкова ───────────────────────────────────
 *
 * ИДЕЯ. По сюжету старшина Блинков сперва отказывает («я снабженец, а не
 * пропуск»), а после списания генерала Заслонова открывает игроку склад: «бери
 * со стойки, накладную я закрою задним числом». Слова эти сегодня висят в
 * пустоте — старшину никто не ставил на место, и общий добор пакетов бросал его
 * в любую комнату подходящего ремесла по хэшу от id. Этот слой даёт словам
 * ЗЕМЛЮ: погрузочная линейка через весь квартал, каптёрка старшины у её начала,
 * а дальше по обе стороны то, чем он распоряжается, — патронный погреб,
 * топливный двор, оружейная мастерская, сортировка трофеев.
 *
 * ПОЧЕМУ СТАРШИНА СПАВНИТСЯ ЗДЕСЬ, А НЕ ПРИХОДИТ ДОБОРОМ. `deliverFloorNpcPackages`
 * пропускает всех, кого модуль поставил сам, поэтому явный спавн в каптёрке —
 * это адрес, не дубль. Анкету старшины трогать при этом не нужно и нельзя:
 * `placement.roomId` живёт в его пакете, а пакет — чужая земля.
 *
 * СТАДИЯ. Расширение: слой режет геометрию и кладётся ДО связности.
 */

import { Faction, Feature, Tex, type Entity, type Item, type Room, type WorldContainer } from '../../core/types';
import { ContainerKind } from '../../core/types';
import type { World } from '../../core/world';
import { placeDoorAt } from '../shared';
import { stampNamedRoom } from '../named_rooms';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import type { FortRect } from './fort';
import {
  LIQUIDATOR_BASE_NAMED_ROOMS,
  LIQ_AMMO_ROOM, LIQ_FUEL_YARD, LIQ_LOADING, LIQ_SALVAGE, LIQ_SUPPLY, LIQ_WORKSHOP,
} from './rooms';

const LIQUIDATOR_BASE_Z = -12;

/* Погрузочная линейка — вертикальный проход, на который выходит всё складское
 * хозяйство. Квартал стоит западнее арены: снабжение и песок не соседи. */
const LINE_X = 388;
const LINE_W = 6;
const LINE_Y = 455;
const LINE_H = 102;
const LINE_WEST_WALL = LINE_X - 1;
const LINE_EAST_WALL = LINE_X + LINE_W;

const STORE_W = 27;
const WEST_X = LINE_WEST_WALL - STORE_W;
const EAST_X = LINE_EAST_WALL + 1;

/** Пятно квартала со стенами. */
export const SUPPLY_QUARTER: FortRect = {
  x: WEST_X - 1,
  y: LINE_Y - 1,
  w: EAST_X + STORE_W + 1 - (WEST_X - 1),
  h: LINE_H + 2,
};

interface Store {
  alias: string;
  y: number;
  h: number;
}

/* Западная сторона — то, что выдают: стойка, патроны, топливо. */
const WEST_STORES: readonly Store[] = [
  { alias: LIQ_SUPPLY, y: 460, h: 32 },
  { alias: LIQ_AMMO_ROOM, y: 496, h: 32 },
  { alias: LIQ_FUEL_YARD, y: 532, h: 24 },
];

/* Восточная — то, где работают руками: чинят своё и разбирают чужое. */
const EAST_STORES: readonly Store[] = [
  { alias: LIQ_WORKSHOP, y: 460, h: 32 },
  { alias: LIQ_SALVAGE, y: 496, h: 32 },
];

export interface SupplyLayout {
  line: Room;
  rooms: Map<string, Room>;
}

export function buildSupplyYard(world: World, entities: Entity[], nextId: { v: number }): SupplyLayout {
  const rooms = new Map<string, Room>();

  const line = stampNamedRoom(world, world.rooms.length, LIQ_LOADING,
    LIQUIDATOR_BASE_NAMED_ROOMS[LIQ_LOADING], LINE_X, LINE_Y, LINE_W, LINE_H);
  line.wallTex = Tex.METAL;
  line.floorTex = Tex.F_CONCRETE;
  rooms.set(LIQ_LOADING, line);
  placeDoorAt(world, LINE_X + 2, LINE_Y - 1, line.id);
  placeDoorAt(world, LINE_X + 3, LINE_Y + LINE_H, line.id);

  for (const store of WEST_STORES) {
    rooms.set(store.alias, buildStore(world, store, WEST_X, LINE_WEST_WALL, WEST_X - 1));
  }
  for (const store of EAST_STORES) {
    rooms.set(store.alias, buildStore(world, store, EAST_X, LINE_EAST_WALL, EAST_X + STORE_W));
  }

  furnishCounter(world, rooms.get(LIQ_SUPPLY)!);
  furnishAmmoRoom(world, rooms.get(LIQ_AMMO_ROOM)!);
  furnishFuelYard(world, rooms.get(LIQ_FUEL_YARD)!);
  furnishWorkshop(world, rooms.get(LIQ_WORKSHOP)!);
  furnishSalvage(world, rooms.get(LIQ_SALVAGE)!);

  staffSupply(entities, nextId, rooms);
  return { line, rooms };
}

/* Склад: дверь на линейку и вторая во двор. Погрузка идёт насквозь, а не через
 * единственный проём, в котором встанет первый же встречный. */
function buildStore(world: World, store: Store, x: number, innerWall: number, outerWall: number): Room {
  const def = LIQUIDATOR_BASE_NAMED_ROOMS[store.alias as keyof typeof LIQUIDATOR_BASE_NAMED_ROOMS];
  const room = stampNamedRoom(world, world.rooms.length, store.alias, def, x, store.y, STORE_W, store.h);
  room.wallTex = Tex.METAL;
  room.floorTex = Tex.F_CONCRETE;
  const midY = store.y + Math.floor(store.h / 2);
  placeDoorAt(world, innerWall, midY, room.id);
  placeDoorAt(world, outerWall, midY - 4, room.id);
  return room;
}

function furnishCounter(world: World, counter: Room): void {
  /* Стойка поперёк комнаты: старшина по одну сторону, очередь по другую. Так
   * выглядит выдача, а не склад, куда пускают всех. */
  const y = counter.y + Math.floor(counter.h / 2) + 2;
  for (let x = counter.x + 1; x < counter.x + counter.w - 1; x += 2) {
    world.features[world.idx(x, y)] = Feature.DESK;
  }
  for (let x = counter.x + 1; x < counter.x + counter.w - 1; x += 3) {
    world.features[world.idx(x, counter.y)] = Feature.SHELF;
  }
  world.features[world.idx(counter.x + 1, counter.y + counter.h - 1)] = Feature.SCREEN;
  addSupplyContainer(world, counter, counter.x + 2, counter.y + 1,
    ContainerKind.FILING_CABINET, 'Накладные старшины', 'owner', [
      { defId: 'ammo_issue_order', count: 2 },
      { defId: 'liquidator_field_roster', count: 1 },
    ]);
}

function furnishAmmoRoom(world: World, room: Room): void {
  // Патронные шкафы двумя рядами вдоль стен: середина оставлена под тележку.
  for (let y = room.y + 1; y < room.y + room.h - 1; y += 2) {
    world.features[world.idx(room.x, y)] = Feature.SHELF;
    world.features[world.idx(room.x + room.w - 1, y)] = Feature.SHELF;
  }
  addSupplyContainer(world, room, room.x + 2, room.y + 2,
    ContainerKind.WEAPON_CRATE, 'Патронный шкаф первой смены', 'faction', [
      { defId: 'ammo_762', count: 40 },
      { defId: 'ammo_9mm', count: 32 },
      { defId: 'ammo_shells', count: 12 },
    ]);
  addSupplyContainer(world, room, room.x + room.w - 3, room.y + room.h - 3,
    ContainerKind.WEAPON_CRATE, 'Шкаф под опись', 'locked', [
      { defId: 'ammo_12g_slug', count: 10 },
      { defId: 'rifle_bolt_pack', count: 1 },
      { defId: 'magazine_part', count: 2 },
    ]);
}

function furnishFuelYard(world: World, yard: Room): void {
  for (let x = yard.x + 1; x < yard.x + yard.w - 1; x += 3) {
    world.features[world.idx(x, yard.y)] = Feature.APPARATUS;
    world.features[world.idx(x, yard.y + yard.h - 1)] = Feature.APPARATUS;
  }
  addSupplyContainer(world, yard, yard.x + 2, yard.y + Math.floor(yard.h / 2),
    ContainerKind.TOOL_LOCKER, 'Топливная кладовая', 'faction', [
      { defId: 'ammo_fuel', count: 20 },
      { defId: 'barrel_part', count: 2 },
      { defId: 'duct_tape', count: 2 },
    ]);
}

function furnishWorkshop(world: World, shop: Room): void {
  for (let y = shop.y + 2; y < shop.y + shop.h - 2; y += 5) {
    world.features[world.idx(shop.x + 1, y)] = Feature.MACHINE;
    world.features[world.idx(shop.x + shop.w - 2, y)] = Feature.MACHINE;
  }
  world.features[world.idx(shop.x + Math.floor(shop.w / 2), shop.y + 1)] = Feature.TABLE;
  addSupplyContainer(world, shop, shop.x + 2, shop.y + shop.h - 3,
    ContainerKind.TOOL_LOCKER, 'Верстачный шкаф', 'public', [
      { defId: 'wrench', count: 1 },
      { defId: 'wire_coil', count: 2 },
      { defId: 'metal_sheet', count: 3 },
    ]);
}

function furnishSalvage(world: World, sorting: Room): void {
  /* Сортировка: столы в два ряда, между ними проход. Сюда попадает всё, что
   * принесли снизу, и отсюда уходит либо в мастерскую, либо в утиль. */
  for (let y = sorting.y + 2; y < sorting.y + sorting.h - 2; y += 4) {
    for (let x = sorting.x + 2; x < sorting.x + sorting.w - 2; x += 3) {
      world.features[world.idx(x, y)] = Feature.TABLE;
    }
  }
  addSupplyContainer(world, sorting, sorting.x + 1, sorting.y + 1,
    ContainerKind.TRASH_BIN, 'Утиль после разбора', 'public', [
      { defId: 'cloth_roll', count: 2 },
      { defId: 'wet_rag_bundle', count: 1 },
      { defId: 'metal_sheet', count: 1 },
    ]);
}

/**
 * Люди склада. Старшина Блинков — за стойкой каптёрки: его инвентарь и есть
 * прилавок, и стоять он обязан там, где этот прилавок нарисован. Снабженец
 * Петрович уходит в патронный погреб — раньше все трое ликвидаторских торговцев
 * стояли кучей в середине штаба, где не работает ни один.
 */
function staffSupply(entities: Entity[], nextId: { v: number }, rooms: Map<string, Room>): void {
  const counter = rooms.get(LIQ_SUPPLY)!;
  const ammo = rooms.get(LIQ_AMMO_ROOM)!;
  requireSpawnedPlotNpcFromPackage(entities, nextId, 'blinkov',
    counter.x + Math.floor(counter.w / 2), counter.y + Math.floor(counter.h / 2) - 1,
    { angle: Math.PI / 2 });
  requireSpawnedPlotNpcFromPackage(entities, nextId, 'liq_quartermaster',
    ammo.x + Math.floor(ammo.w / 2), ammo.y + Math.floor(ammo.h / 2), { angle: 0 });
}

/* Контейнер склада. Своя фабрика на слой — намеренно: соседние слои кладут
 * своё, и общий помощник связал бы независимые модули в один. */
function addSupplyContainer(
  world: World, room: Room, x: number, y: number,
  kind: ContainerKind, name: string, access: WorldContainer['access'], inventory: Item[],
): void {
  let id = 1;
  for (const other of world.containers) id = Math.max(id, other.id + 1);
  world.addContainer({
    id,
    x: world.wrap(x), y: world.wrap(y), z: LIQUIDATOR_BASE_Z,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind, name,
    inventory: inventory.map(item => ({ ...item })),
    faction: Faction.LIQUIDATOR,
    access,
    lockDifficulty: access === 'locked' ? 4 : undefined,
    discovered: access !== 'secret',
    tags: ['liquidatorbase', 'supply'],
  });
}
