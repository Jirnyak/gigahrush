/* ── Торговый угол: ряд, две лавки и бар ──────────────────────────
 *
 * Первая стройка под словарь торговли и досуга (`rooms.md`): `MARKET` — общий
 * ряд, по которому ходят, `SHOP` — лавка, куда товар возят и где им торгуют,
 * `BAR` — где наливают и где люди скапливаются сами.
 *
 * Ничего своего в поведение эти комнаты не приносят: тяга к ним целиком идёт
 * из `ROOM_AFFORDANCES` (бар держится на `social` и `drink`), товар доезжает
 * общей возкой кладовщика, а нужда гаснет в баре той же таблицей нужд. Модуль
 * строит место, а не механику.
 */

import {
  AIGoal, Cell, ContainerKind, DoorState, EntityType, Faction, Feature, NpcState, Occupation, RoomType, Tex,
  type Entity, type Room, type WorldContainer,
} from '../../core/types';
import { World, classifyReachabilityCell } from '../../core/world';
import { freshNeeds } from '../../data/names';
import { connectProtectedRoom, protectRoom } from '../shared';
import { genLog } from '../log';
import { registerZoneContent } from './zone_content';
import { irand, rng } from '../../core/rand';

export const TRADE_ROW_ZONE_HUD = 43;
export const TRADE_ROW_MARKET_NAME = 'Торговый ряд у лифта';
export const TRADE_ROW_SHOP_NAMES = ['Лавка сухого пайка', 'Лавка обменного хлама'] as const;
export const TRADE_ROW_BAR_NAME = 'Бар «Тёплая труба»';

const AREA_W = 20;
const AREA_H = 12;
/** Ряд занимает верх целиком, лавки и бар стоят под ним в один ряд. */
const MARKET_H = 5;
const LOWER_H = AREA_H - MARKET_H - 1;
const CELL_W = 6;

const SHOP_STOCK: readonly (readonly { defId: string; count: number }[])[] = [
  [{ defId: 'bread', count: 4 }, { defId: 'canned', count: 2 }, { defId: 'water', count: 3 }],
  [{ defId: 'cigs', count: 3 }, { defId: 'duct_tape', count: 2 }, { defId: 'chalk', count: 2 }],
];
const BAR_STOCK: readonly { defId: string; count: number }[] = [
  { defId: 'water', count: 5 },
  { defId: 'govnyak_roll', count: 2 },
  { defId: 'kompot', count: 3 },
];

function areaClear(world: World, rx: number, ry: number): boolean {
  for (let dy = -1; dy <= AREA_H; dy++) {
    for (let dx = -1; dx <= AREA_W; dx++) {
      if (world.aptMask[world.idx(rx + dx, ry + dy)]) return false;
    }
  }
  return true;
}

function findOrigin(world: World, zcx: number, zcy: number): { x: number; y: number } {
  const baseX = zcx - Math.floor(AREA_W / 2);
  const baseY = zcy - Math.floor(AREA_H / 2);
  for (let r = 0; r <= 96; r += 4) {
    for (let k = 0; k < 24; k++) {
      const a = ((k + 3) / 24) * Math.PI * 2;
      const x = world.wrap(baseX + Math.round(Math.cos(a) * r));
      const y = world.wrap(baseY + Math.round(Math.sin(a) * r));
      if (areaClear(world, x, y)) return { x, y };
    }
  }
  return { x: world.wrap(baseX), y: world.wrap(baseY) };
}

function fillRoomCells(world: World, room: Room, floorTex: Tex): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.aptMask[ci]) continue;
      world.cells[ci] = Cell.FLOOR;
      world.floorTex[ci] = floorTex;
      world.roomMap[ci] = room.id;
      world.features[ci] = Feature.NONE;
    }
  }
}

function makeRoom(
  world: World,
  id: number,
  type: RoomType,
  name: string,
  x: number, y: number, w: number, h: number,
  tags: readonly string[],
): Room {
  const room: Room = {
    id,
    type,
    x: world.wrap(x), y: world.wrap(y), w, h,
    doors: [],
    sealed: false,
    name,
    apartmentId: -1,
    wallTex: Tex.PANEL,
    floorTex: type === RoomType.MARKET ? Tex.F_CONCRETE : Tex.F_WOOD,
    tags: [...tags],
  };
  world.rooms[id] = room;
  fillRoomCells(world, room, room.floorTex);
  return room;
}

/** Клетка, по которой можно пройти: пол, вода или любая дверь. */
function walkable(world: World, x: number, y: number): boolean {
  return classifyReachabilityCell(world, world.idx(x, y)).passable;
}

/**
 * Дверной проём в стене, разделяющей ряд и нижнюю комнату.
 *
 * Столбец объявлен серединой комнаты, но середина может прийтись на клетку
 * соседней квартиры: та защищена `aptMask`, и проём там не рубится. Раньше
 * такой случай молча пропускался — а другого входа у нижней комнаты нет, и
 * лавка оставалась замурована. Теперь берётся ближайший к середине рабочий
 * столбец: незащищённый и такой, где по обе стороны стены действительно пол.
 */
function openDoorway(world: World, market: Room, room: Room, wallY: number): void {
  const mid = Math.floor(room.w / 2);
  for (let step = 0; step < room.w; step++) {
    const dx = mid + (step % 2 === 0 ? step >> 1 : -((step + 1) >> 1));
    if (dx < 0 || dx >= room.w) continue;
    const x = room.x + dx;
    const ci = world.idx(x, wallY);
    if (world.aptMask[ci]) continue;
    if (!walkable(world, x, wallY - 1) || !walkable(world, x, wallY + 1)) continue;
    world.cells[ci] = Cell.DOOR;
    world.roomMap[ci] = room.id;
    world.doors.set(ci, { idx: ci, state: DoorState.CLOSED, roomA: market.id, roomB: room.id, keyId: '', timer: 0 });
    room.doors.push(ci);
    market.doors.push(ci);
    return;
  }
  genLog(`[TRADE_ROW] "${room.name}": стена с рядом сплошь защищена, проёма нет`);
}

/** Столько же щупает `connectProtectedRoom`: толще стены на этаже не бывает. */
const CARVE_REACH = 30;

/**
 * Выходы торгового угла — по одному на каждую сторону кольца.
 *
 * Раньше выход был один и случайный: `connectProtectedRoom` пробивал наугад
 * клетку кольца, у которой СНАРУЖИ есть пол, не проверяя, есть ли пол ИЗНУТРИ.
 * Дыра, пришедшаяся на угол кольца или ровно на перегородку между лавками,
 * вела в стену, и весь угол — ряд, обе лавки и бар — оказывался замурован
 * целиком. Спасти его было уже некому: `ensureConnectivity` рубит коридор
 * `carveCorridor`, а тот никогда не идёт сквозь `aptMask`, и для компоненты,
 * почти целиком защищённой, спасательный ход не рубится вовсе. Один же
 * уцелевший выход мог упереться в отрезанный огрызок коридора, который сам
 * бульдозер кольца и осиротил.
 *
 * Поэтому выход не один. Ряд у лифта — проходной двор, а не крепость: с каждой
 * из четырёх сторон от заведомого пола наружу прорубается ход до первой клетки
 * этажа. Жребий при этом не бросается ни разу — поток случайных чисел здесь не
 * двигается, как и во втором заходе на район в НИИ слизи.
 */
function carveRowExit(world: World, sx: number, sy: number, ddx: number, ddy: number): void {
  const path: number[] = [];
  let cx = sx, cy = sy;
  for (let step = 0; step < CARVE_REACH; step++) {
    const ci = world.idx(cx, cy);
    if (world.cells[ci] === Cell.FLOOR && !world.aptMask[ci]) {
      for (const pi of path) {
        world.cells[pi] = Cell.FLOOR;
        world.roomMap[pi] = -1;
        world.aptMask[pi] = 0;
      }
      return;
    }
    path.push(ci);
    cx += ddx;
    cy += ddy;
  }
  genLog('[TRADE_ROW] с одной из сторон хода наружу нет: за кольцом сплошной массив');
}

function openRowExits(world: World, rx: number, ry: number): void {
  // Ход начинается от клетки кольца НАД заведомым полом: иначе дыра ведёт в
  // собственную перегородку ряда, ровно как у слепого жребия.
  for (let dx = 0; dx < AREA_W; dx++) {
    if (walkable(world, rx + dx, ry)) { carveRowExit(world, rx + dx, ry - 1, 0, -1); break; }
  }
  for (let dx = AREA_W - 1; dx >= 0; dx--) {
    if (walkable(world, rx + dx, ry + AREA_H - 1)) { carveRowExit(world, rx + dx, ry + AREA_H, 0, 1); break; }
  }
  for (let dy = 0; dy < AREA_H; dy++) {
    if (walkable(world, rx, ry + dy)) { carveRowExit(world, rx - 1, ry + dy, -1, 0); break; }
  }
  for (let dy = AREA_H - 1; dy >= 0; dy--) {
    if (walkable(world, rx + AREA_W - 1, ry + dy)) { carveRowExit(world, rx + AREA_W, ry + dy, 1, 0); break; }
  }
}

function addCounter(
  world: World,
  room: Room,
  kind: ContainerKind,
  name: string,
  inventory: readonly { defId: string; count: number }[],
  owner: Entity | undefined,
  tags: readonly string[],
): void {
  const x = world.wrap(room.x + room.w - 2);
  const y = world.wrap(room.y + Math.floor(room.h / 2));
  const container: WorldContainer = {
    id: world.containers.length > 0 ? Math.max(...world.containers.map(c => c.id)) + 1 : 1,
    x, y, z: 0,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(slot => ({ ...slot })),
    access: 'room',
    ownerNpcId: owner?.id,
    ownerName: owner?.name,
    faction: Faction.CITIZEN,
    discovered: true,
    tags: [...tags],
  };
  world.addContainer(container);
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR) world.features[ci] = Feature.TABLE;
}

/**
 * Торговец лавки. Товар у него и в руках, и на прилавке: магазин — это человек
 * с полными карманами, стоящий там, где ему положено.
 */
function spawnTrader(
  entities: Entity[],
  nextId: { v: number },
  room: Room,
  name: string,
  stock: readonly { defId: string; count: number }[],
): Entity {
  const x = room.x + 1.5;
  const y = room.y + Math.floor(room.h / 2) + 0.5;
  const trader: Entity = {
    id: nextId.v++,
    type: EntityType.NPC,
    x, y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0.66,
    sprite: Occupation.STOREKEEPER,
    name,
    needs: freshNeeds(),
    hp: 74,
    maxHp: 74,
    money: 40 + irand(0, 60),
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 4, npcState: NpcState.WORKING },
    inventory: stock.map(slot => ({ ...slot, count: slot.count * 2 })),
    faction: Faction.CITIZEN,
    occupation: Occupation.STOREKEEPER,
    assignedRoomId: room.id,
    questId: -1,
  };
  entities.push(trader);
  return trader;
}

/** Завсегдатай бара: сидит, пока его не позовёт своя нужда. */
function spawnBarRegular(entities: Entity[], nextId: { v: number }, room: Room, index: number): void {
  const x = room.x + 1.5 + index * 1.5;
  const y = room.y + 1.5 + (index % 2);
  const needs = freshNeeds();
  needs.water = 30 + index * 6;
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x, y,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: 0.58,
    sprite: Occupation.ALCOHOLIC,
    name: `Завсегдатай ${index + 1}`,
    needs,
    hp: 66,
    maxHp: 66,
    money: irand(0, 12),
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 6 + index, npcState: NpcState.FREE_TIME },
    inventory: [{ defId: 'cigs', count: 1 }],
    faction: Faction.CITIZEN,
    occupation: Occupation.ALCOHOLIC,
    assignedRoomId: room.id,
    questId: -1,
  });
}

function generateTradeRow(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number },
  zcx: number, zcy: number,
): { nextRoomId: number } {
  const origin = findOrigin(world, zcx, zcy);
  const rx = origin.x;
  const ry = origin.y;

  // Стены по кольцу, затем комнаты по своим клеткам.
  for (let dy = -1; dy <= AREA_H; dy++) {
    for (let dx = -1; dx <= AREA_W; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      if (world.aptMask[ci]) continue;
      /* Угол ставится поверх коридоров лабиринта, а в них есть двери. Клетку
       * перезаписать мало: запись в `world.doors` переживает бульдозер, и потом
       * `sanitizeDoors` находит дверь, под которой уже не дверь, и «чинит» её —
       * а поскольку `protectRoom` объявил весь угол защищённым, чинит В СТЕНУ.
       * Так внутри ряда и лавок вырастали случайные столбы, а стоило столбу
       * встать под дырой кольца — торговый угол оказывался замурован целиком. */
      world.removeDoorAt(ci);
      world.cells[ci] = Cell.WALL;
      world.wallTex[ci] = Tex.PANEL;
      world.floorTex[ci] = Tex.F_CONCRETE;
      world.roomMap[ci] = -1;
      world.features[ci] = Feature.NONE;
    }
  }

  let roomId = nextRoomId;
  const market = makeRoom(world, roomId++, RoomType.MARKET, TRADE_ROW_MARKET_NAME,
    rx, ry, AREA_W, MARKET_H, ['market', 'trade', 'crowd']);
  const lowerY = ry + MARKET_H + 1;
  const shops: Room[] = [];
  for (let i = 0; i < TRADE_ROW_SHOP_NAMES.length; i++) {
    shops.push(makeRoom(world, roomId++, RoomType.SHOP, TRADE_ROW_SHOP_NAMES[i],
      rx + i * (CELL_W + 1), lowerY, CELL_W, LOWER_H, ['shop', 'trade']));
  }
  const bar = makeRoom(world, roomId++, RoomType.BAR, TRADE_ROW_BAR_NAME,
    rx + 2 * (CELL_W + 1), lowerY, AREA_W - 2 * (CELL_W + 1), LOWER_H, ['bar', 'social', 'drink']);

  // Из ряда — по проёму в каждую нижнюю комнату.
  for (const room of [...shops, bar]) {
    openDoorway(world, market, room, ry + MARKET_H);
  }

  protectRoom(world, market.x, market.y, AREA_W, AREA_H, Tex.PANEL, Tex.F_CONCRETE);
  connectProtectedRoom(world, market.x, market.y, AREA_W, AREA_H);
  openRowExits(world, market.x, market.y);

  // Прилавки: у лавок свои, у бара стойка с выпивкой.
  for (let i = 0; i < shops.length; i++) {
    const trader = spawnTrader(entities, nextId, shops[i], `Лавочник ${i + 1}`, SHOP_STOCK[i]);
    addCounter(world, shops[i], ContainerKind.CASHBOX, `Прилавок: ${shops[i].name}`,
      SHOP_STOCK[i], trader, ['trade', 'shop', 'counter']);
  }
  const barman = spawnTrader(entities, nextId, bar, 'Наливающий за трубой', BAR_STOCK);
  addCounter(world, bar, ContainerKind.FRIDGE, 'Барная стойка', BAR_STOCK, barman, ['bar', 'trade', 'drink']);
  for (let i = 0; i < 3; i++) spawnBarRegular(entities, nextId, bar, i);

  // Столы и полки: ряд — прилавками, бар — столиками.
  for (let i = 2; i < AREA_W - 2; i += 5) {
    const ci = world.idx(market.x + i, market.y + Math.floor(MARKET_H / 2));
    if (world.cells[ci] === Cell.FLOOR) world.features[ci] = Feature.TABLE;
  }
  for (let i = 2; i < bar.w - 1; i += 2) {
    const ci = world.idx(bar.x + i, bar.y + LOWER_H - 2);
    if (world.cells[ci] === Cell.FLOOR) world.features[ci] = Feature.CHAIR;
  }

  genLog(`[TRADE_ROW] ряд + ${shops.length} лавки + бар at (${rx},${ry})`);
  return { nextRoomId: roomId };
}

registerZoneContent(TRADE_ROW_ZONE_HUD, TRADE_ROW_MARKET_NAME, generateTradeRow);
