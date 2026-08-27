/* ── Слой 2: арена как экономика ──────────────────────────────────
 *
 * ИДЕЯ. Песок в форте уже есть, и на нём уже дерутся (`fort.ts`, `arena_duel.ts`,
 * ставки — `systems/arena.ts`). Но вокруг него ПУСТО, и потому арена читается
 * аттракционом: пришёл, поставил, ушёл. Этот слой достраивает то, без чего бой
 * не бывает — хозяйство при песке. Ложа по чину у самой стены арены, за ней
 * ставочный ряд с тотализатором, барак бойцов и костоправ по западной стороне
 * ряда, ямы для пленных по восточной. Цепочка честная и односторонняя: пленного
 * приводят снизу в ямы, из ям выводят на песок, с песка уносят к костоправу, а
 * деньги идут по ряду мимо всех троих.
 *
 * ЧТО ДЕЛАЕТ ЛОЖУ ЛОЖЕЙ. Она делит стену с ареной и имеет в неё дверь. Это не
 * украшение: комната, из которой не видно песка, не ложа, а кабинет. Второй
 * знак — пол трибуны: восточный сектор кресел перекрашен под сектор по чину.
 * Красится ТОЛЬКО текстура пола, ни одной преграды внутрь арены не ставится —
 * там стоит сцена боя, и любая клетка, ставшая непроходимой, ломает расстановку
 * трибун и подлёт камеры.
 *
 * СТАДИЯ. Расширение: слой режет геометрию и кладётся ДО связности.
 */

import { Cell, Faction, Feature, Tex, type Entity, type Item, type Room, type WorldContainer } from '../../core/types';
import { ContainerKind } from '../../core/types';
import type { World } from '../../core/world';
import { placeDoorAt } from '../shared';
import { stampNamedRoom } from '../named_rooms';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import type { FortRect } from './fort';
import { ARENA_RING_INSET, ARENA_SIDE, ARENA_STAND_ROW } from './fort';
import {
  LIQUIDATOR_BASE_NAMED_ROOMS,
  LIQ_BETTING_ROW, LIQ_BONESETTER, LIQ_FIGHTER_BARRACKS, LIQ_PITS, LIQ_RANK_BOX, LIQ_TOTE,
} from './rooms';

/** Этаж Базы. Контейнеры хранят его у себя: `z` контейнера сверяют при загрузке. */
const LIQUIDATOR_BASE_Z = -12;

/* Ложа прижата к восточной стене арены и делит её. Числа считаются от той же
 * середины этажа, что и сама арена: сдвинется арена — сдвинется ложа. */
const ARENA_EAST_WALL = 512 + Math.floor(ARENA_SIDE / 2);
const BOX_X = ARENA_EAST_WALL + 1;
const BOX_W = 21;
const BOX_H = 20;
const BOX_Y = 512 - Math.floor(BOX_H / 2) - 4;

/* Ставочный ряд — вертикальный проход восточнее ложи. Всё хозяйство висит на нём. */
const ROW_X = 596;
const ROW_W = 6;
const ROW_Y = 455;
const ROW_H = 102;
const ROW_WEST_WALL = ROW_X - 1;
const ROW_EAST_WALL = ROW_X + ROW_W;

const SHOP_W = 25;
const SHOP_X = ROW_WEST_WALL - SHOP_W;

const PITS_X = ROW_EAST_WALL + 1;
const PITS_W = 25;
const PITS_Y = 470;
const PITS_H = 71;
/** Проход надзирателя вдоль камер. За ним перегородка, за ней — сами ямы. */
const PITS_AISLE = 4;
/** Яма: пять рядов под замком, между ямами — стена. Шаг шесть. */
const PIT_PITCH = 6;
const PIT_ROWS = 5;

/** Пятно квартала со стенами: от общей с ареной стены до восточной стены ям. */
export const ARENA_QUARTER: FortRect = {
  x: ARENA_EAST_WALL,
  y: ROW_Y - 1,
  w: PITS_X + PITS_W + 1 - ARENA_EAST_WALL,
  h: ROW_H + 2,
};

interface Shop {
  alias: string;
  y: number;
  h: number;
}

const WEST_SHOPS: readonly Shop[] = [
  { alias: LIQ_TOTE, y: 460, h: 28 },
  { alias: LIQ_FIGHTER_BARRACKS, y: 492, h: 28 },
  { alias: LIQ_BONESETTER, y: 524, h: 28 },
];

export interface ArenaQuarterLayout {
  box: Room;
  row: Room;
  rooms: Map<string, Room>;
}

export function buildArenaQuarter(
  world: World, arena: Room, entities: Entity[], nextId: { v: number },
): ArenaQuarterLayout {
  const rooms = new Map<string, Room>();

  const box = stampNamedRoom(world, world.rooms.length, LIQ_RANK_BOX,
    LIQUIDATOR_BASE_NAMED_ROOMS[LIQ_RANK_BOX], BOX_X, BOX_Y, BOX_W, BOX_H);
  box.wallTex = Tex.METAL;
  box.floorTex = Tex.F_CARPET;
  rooms.set(LIQ_RANK_BOX, box);
  // Дверь прямо в чашу: ложа без вида на песок — кабинет, а не ложа.
  placeDoorAt(world, ARENA_EAST_WALL, BOX_Y + Math.floor(BOX_H / 2), box.id);
  placeDoorAt(world, BOX_X + BOX_W, BOX_Y + Math.floor(BOX_H / 2), box.id);
  furnishRankBox(world, box);
  paintRankSeating(world, arena);

  const row = stampNamedRoom(world, world.rooms.length, LIQ_BETTING_ROW,
    LIQUIDATOR_BASE_NAMED_ROOMS[LIQ_BETTING_ROW], ROW_X, ROW_Y, ROW_W, ROW_H);
  row.wallTex = Tex.METAL;
  row.floorTex = Tex.F_CONCRETE;
  rooms.set(LIQ_BETTING_ROW, row);
  placeDoorAt(world, ROW_X + 2, ROW_Y - 1, row.id);
  placeDoorAt(world, ROW_X + 3, ROW_Y + ROW_H, row.id);

  for (const shop of WEST_SHOPS) {
    const def = LIQUIDATOR_BASE_NAMED_ROOMS[shop.alias as keyof typeof LIQUIDATOR_BASE_NAMED_ROOMS];
    const room = stampNamedRoom(world, world.rooms.length, shop.alias, def, SHOP_X, shop.y, SHOP_W, shop.h);
    room.wallTex = Tex.CONCRETE;
    room.floorTex = Tex.F_CONCRETE;
    const midY = shop.y + Math.floor(shop.h / 2);
    placeDoorAt(world, ROW_WEST_WALL, midY, room.id);
    placeDoorAt(world, SHOP_X - 1, midY, room.id);
    rooms.set(shop.alias, room);
  }

  rooms.set(LIQ_PITS, buildPits(world));

  furnishTote(world, rooms.get(LIQ_TOTE)!);
  furnishFighterBarracks(world, rooms.get(LIQ_FIGHTER_BARRACKS)!);
  furnishBonesetter(world, rooms.get(LIQ_BONESETTER)!);

  /* Распорядитель песка. Стоит У трибуны, а не НА песке: ряд берётся у той же
   * геометрии, что строит арену и что читает сцена боя, — иначе сцена начинается
   * с телепорта Марко через полкомнаты, а вне сцены он попадает ровно туда, куда
   * дуэльная система выводит бойцов, и кончает первую же дуэль своим выстрелом. */
  requireSpawnedPlotNpcFromPackage(entities, nextId, 'marko_lolo',
    arena.x + Math.floor(arena.w / 2), arena.y + Math.floor(arena.h / 2) - ARENA_STAND_ROW,
    { angle: Math.PI / 2 });

  return { box, row, rooms };
}

/**
 * Ямы: проход надзирателя, перегородка во всю высоту и камеры за ней. Дверь в
 * каждую камеру настоящая, в перегородке, — по одной на яму. Именно это делает
 * их ямами, а не комнатой с названием.
 */
function buildPits(world: World): Room {
  const pits = stampNamedRoom(world, world.rooms.length, LIQ_PITS,
    LIQUIDATOR_BASE_NAMED_ROOMS[LIQ_PITS], PITS_X, PITS_Y, PITS_W, PITS_H);
  pits.wallTex = Tex.METAL;
  pits.floorTex = Tex.F_CONCRETE;

  const partition = PITS_X + PITS_AISLE;
  for (let y = PITS_Y; y < PITS_Y + PITS_H; y++) {
    const i = world.idx(partition, y);
    world.cells[i] = Cell.WALL;
    world.wallTex[i] = Tex.METAL;
    world.features[i] = Feature.NONE;
    world.roomMap[i] = -1;
  }
  for (let band = PITS_Y; band + PIT_ROWS <= PITS_Y + PITS_H; band += PIT_PITCH) {
    const sill = band + PIT_ROWS;
    if (sill < PITS_Y + PITS_H) {
      for (let x = partition + 1; x < PITS_X + PITS_W; x++) {
        const i = world.idx(x, sill);
        world.cells[i] = Cell.WALL;
        world.wallTex[i] = Tex.METAL;
        world.features[i] = Feature.NONE;
        world.roomMap[i] = -1;
      }
    }
    placeDoorAt(world, partition, band + 2, pits.id);
    world.features[world.idx(PITS_X + PITS_W - 1, band + 2)] = Feature.SHELF;
  }

  // Проход надзирателя выходит и в ряд, и во двор: караул ходит насквозь.
  placeDoorAt(world, PITS_X - 1, PITS_Y + Math.floor(PITS_H / 2), pits.id);
  placeDoorAt(world, PITS_X + 1, PITS_Y - 1, pits.id);
  return pits;
}

/**
 * Сектор по чину. Только текстура пола: внутри арены стоит сцена боя, и любая
 * поставленная там преграда ломает расстановку трибун и облёт камеры.
 */
function paintRankSeating(world: World, arena: Room): void {
  const from = arena.x + ARENA_SIDE - ARENA_RING_INSET + 2;
  for (let y = arena.y; y < arena.y + arena.h; y++) {
    for (let x = from; x < arena.x + arena.w; x++) {
      world.floorTex[world.idx(x, y)] = Tex.F_CARPET;
    }
  }
}

function furnishRankBox(world: World, box: Room): void {
  for (let x = box.x + 1; x < box.x + box.w - 1; x += 3) {
    world.features[world.idx(x, box.y + 1)] = Feature.CHAIR;
    world.features[world.idx(x, box.y + box.h - 2)] = Feature.CHAIR;
  }
  world.features[world.idx(box.x + 1, box.y + Math.floor(box.h / 2))] = Feature.TABLE;
  world.features[world.idx(box.x + box.w - 2, box.y + 2)] = Feature.SCREEN;
}

function furnishTote(world: World, tote: Room): void {
  // Прилавок вдоль северной стены и табло над ним: ставку принимают в лицо.
  for (let x = tote.x + 1; x < tote.x + tote.w - 1; x += 2) {
    world.features[world.idx(x, tote.y + 1)] = Feature.DESK;
  }
  world.features[world.idx(tote.x + 2, tote.y)] = Feature.SCREEN;
  world.features[world.idx(tote.x + tote.w - 3, tote.y)] = Feature.SCREEN;
  addQuarterContainer(world, tote, tote.x + 1, tote.y + tote.h - 2,
    ContainerKind.CASHBOX, 'Касса тотализатора', 'locked', [
      { defId: 'liquidator_token', count: 6 },
      { defId: 'arena_gold_trophy', count: 1 },
    ]);
}

function furnishFighterBarracks(world: World, barracks: Room): void {
  for (let y = barracks.y + 1; y < barracks.y + barracks.h - 1; y += 3) {
    world.features[world.idx(barracks.x, y)] = Feature.BED;
    world.features[world.idx(barracks.x + barracks.w - 1, y)] = Feature.BED;
  }
  addQuarterContainer(world, barracks, barracks.x + 2, barracks.y + 1,
    ContainerKind.WOODEN_CHEST, 'Сундук выставленных на песок', 'room', [
      { defId: 'bandage', count: 2 },
      { defId: 'liquidator_ration', count: 2 },
      { defId: 'braga_bucket', count: 1 },
    ]);
}

function furnishBonesetter(world: World, clinic: Room): void {
  clinic.wallTex = Tex.TILE_W;
  clinic.floorTex = Tex.F_TILE;
  for (let y = clinic.y + 2; y < clinic.y + clinic.h - 2; y += 4) {
    world.features[world.idx(clinic.x + 1, y)] = Feature.BED;
    world.features[world.idx(clinic.x + clinic.w - 2, y)] = Feature.BED;
  }
  world.features[world.idx(clinic.x + 1, clinic.y)] = Feature.SINK;
  addQuarterContainer(world, clinic, clinic.x + clinic.w - 2, clinic.y + clinic.h - 2,
    ContainerKind.MEDICAL_CABINET, 'Шкаф костоправа', 'public', [
      { defId: 'bandage', count: 4 },
      { defId: 'sterile_bandage', count: 2 },
      { defId: 'pills', count: 2 },
    ]);
}

/* Контейнер квартала. Своя маленькая фабрика на модуль — намеренно: сосед
 * (`supply.ts`) кладёт своё, и общий помощник связал бы два независимых слоя. */
function addQuarterContainer(
  world: World, room: Room, x: number, y: number,
  kind: ContainerKind, name: string, access: WorldContainer['access'], inventory: Item[],
): void {
  let id = 1;
  for (const other of world.containers) id = Math.max(id, other.id + 1);
  const container: WorldContainer = {
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
    tags: ['liquidatorbase', 'arena_quarter'],
  };
  world.addContainer(container);
}
