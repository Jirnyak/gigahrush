/* ── Слой 1: военный распорядок ───────────────────────────────────
 *
 * ИДЕЯ. Форт уже состоит из кварталов, но кварталы безлики: жребий раздаёт
 * «Барак», «Каптёрка», «Караулка» в случайном порядке, и по ним нельзя понять,
 * куда попал. Этот слой кладёт поверх ОДИН квартал, который читается уставом:
 * разводная линейка через всю ширину, по её северной стороне — жильё и служба
 * смены (казарма, оружейная, лазарет, гауптвахта), по южной — боевая подготовка
 * и командование (стрельбище, штабная с картой шахты, караулка развода).
 * Человек, вставший на линейку, видит обе стороны службы сразу.
 *
 * ПОЧЕМУ ИМЕННО ЭТИ ТИПЫ КОМНАТ. Распорядок в этом проекте — не таймер, а
 * ТЯГОТЕНИЕ. Ядро актора берёт комнату по `room.type` через аффордансы
 * (`src/data/room_affordances.ts`), и час суток входит множителем контекста
 * (`routinePhase` в `systems/actor/drives.ts`, окна `patrol` с центрами 10:50 и
 * 20:50). Значит «пост» и «линейка» обязаны быть CORRIDOR: обход объявлен у
 * CORRIDOR 24, HQ 20, COMMON 12, и НИГДЕ больше — караулка типа OFFICE несла бы
 * нулевой вес обхода, то есть часовому на ней нечего делать. Отсюда же выбор
 * LIVING для казармы (сон 34) и MEDICAL для лазарета (лечение 40).
 *
 * ЧЕГО ЭТОТ СЛОЙ НЕ ДЕЛАЕТ. Развода как события и ротации постов в проекте нет:
 * поводок комнаты (`systems/room_leash.ts`) умеет «сидеть до минуты» и снимает
 * себя сам, а «потом иди на другой пост» не умеет. Синхронный строй — это
 * кат-сцена (образец — смотр гарнизона на министерском этаже), а не генерация.
 * Здесь строится место, по которому распорядок УЗНАЁТСЯ, и тяготение, по
 * которому он живёт.
 *
 * СТАДИЯ. Расширение: слой режет геометрию и потому кладётся ДО связности.
 */

import { Cell, Feature, Tex, type Entity, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { placeDoorAt } from '../shared';
import { applyNamedRoom, stampNamedRoom } from '../named_rooms';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import type { FortRect } from './fort';
import {
  LIQUIDATOR_BASE_NAMED_ROOMS,
  LIQ_ARMORY, LIQ_BARRACKS, LIQ_BRIG, LIQ_GUARDHOUSE, LIQ_INFIRMARY,
  LIQ_MUSTER, LIQ_PARADE, LIQ_RANGE, LIQ_WAR_ROOM,
} from './rooms';

/* Квартал стоит севернее штаба, на своей полосе фортовой земли. Числа — это
 * стены, а не «примерно»: соседние комнаты делят ОДНУ стену с линейкой, чтобы
 * дверь имела пол с обеих сторон (иначе `sanitizeDoors` её снесёт). */
const MUSTER_X = 455;
const MUSTER_W = 102;
const MUSTER_Y = 370;
const MUSTER_H = 6;
/** Северная и южная стены линейки. Они же — стены комнат по обе стороны. */
const NORTH_WALL = MUSTER_Y - 1;
const SOUTH_WALL = MUSTER_Y + MUSTER_H;
const WING_H = 18;
const NORTH_Y = NORTH_WALL - WING_H;
const SOUTH_Y = SOUTH_WALL + 1;

/** Пятно квартала со стенами. Форт обязан знать его ДО раздачи кварталов. */
export const ORDER_QUARTER: FortRect = {
  x: MUSTER_X - 1,
  y: NORTH_Y - 1,
  w: MUSTER_W + 2,
  h: WING_H * 2 + MUSTER_H + 4,
};

interface Wing {
  alias: string;
  x: number;
  w: number;
}

/* Северное крыло — служба смены: где спят, где получают, где лечат, где сидят
 * под арестом. Порядок слева направо и есть порядок суток. */
const NORTH_WING: readonly Wing[] = [
  { alias: LIQ_BARRACKS, x: 456, w: 22 },
  { alias: LIQ_ARMORY, x: 482, w: 22 },
  { alias: LIQ_INFIRMARY, x: 508, w: 22 },
  { alias: LIQ_BRIG, x: 533, w: 23 },
];

/* Южное крыло — служба боевая: стрельбище во всю длину, штабная и караулка. */
const SOUTH_WING: readonly Wing[] = [
  { alias: LIQ_RANGE, x: 456, w: 48 },
  { alias: LIQ_WAR_ROOM, x: 508, w: 26 },
  { alias: LIQ_GUARDHOUSE, x: 537, w: 20 },
];

export interface OrderLayout {
  muster: Room;
  rooms: Map<string, Room>;
}

/**
 * Положить квартал распорядка. Плац слой не роет: он уже вырыт фортом и здесь
 * лишь ПРИНИМАЕТ ИМЯ — `applyNamedRoom` для того и существует, чтобы генератор
 * мог занять готовую комнату вместо второй такой же рядом.
 */
export function buildGarrisonOrder(
  world: World, entities: Entity[], nextId: { v: number }, parade: Room,
): OrderLayout {
  applyNamedRoom(parade, LIQ_PARADE, LIQUIDATOR_BASE_NAMED_ROOMS[LIQ_PARADE]);

  const rooms = new Map<string, Room>();
  const muster = stampNamedRoom(world, world.rooms.length, LIQ_MUSTER,
    LIQUIDATOR_BASE_NAMED_ROOMS[LIQ_MUSTER], MUSTER_X, MUSTER_Y, MUSTER_W, MUSTER_H);
  muster.wallTex = Tex.CONCRETE;
  muster.floorTex = Tex.F_CONCRETE;
  rooms.set(LIQ_MUSTER, muster);

  // Линейка открыта с обоих торцов: строй входит с одной стороны и выходит с
  // другой, а не толчётся в тупике.
  placeDoorAt(world, MUSTER_X - 1, MUSTER_Y + 2, muster.id);
  placeDoorAt(world, MUSTER_X + MUSTER_W, MUSTER_Y + 3, muster.id);
  markMusterLine(world, muster);

  for (const wing of NORTH_WING) {
    rooms.set(wing.alias, buildWingRoom(world, wing, NORTH_Y, NORTH_WALL, NORTH_Y - 1));
  }
  for (const wing of SOUTH_WING) {
    rooms.set(wing.alias, buildWingRoom(world, wing, SOUTH_Y, SOUTH_WALL, SOUTH_Y + WING_H));
  }

  furnishBarracks(world, rooms.get(LIQ_BARRACKS)!);
  furnishArmory(world, rooms.get(LIQ_ARMORY)!);
  furnishInfirmary(world, rooms.get(LIQ_INFIRMARY)!);
  furnishBrig(world, rooms.get(LIQ_BRIG)!);
  furnishRange(world, rooms.get(LIQ_RANGE)!);
  furnishWarRoom(world, rooms.get(LIQ_WAR_ROOM)!);
  furnishGuardhouse(world, rooms.get(LIQ_GUARDHOUSE)!);

  postKeepers(entities, nextId, rooms);
  return { muster, rooms };
}

/* Комната крыла: дверь на линейку по общей стене и вторая — во двор. Одна
 * дверь на комнату означала бы тупик, а смена ходит насквозь. */
function buildWingRoom(world: World, wing: Wing, y: number, innerWall: number, outerWall: number): Room {
  const def = LIQUIDATOR_BASE_NAMED_ROOMS[wing.alias as keyof typeof LIQUIDATOR_BASE_NAMED_ROOMS];
  const room = stampNamedRoom(world, world.rooms.length, wing.alias, def, wing.x, y, wing.w, WING_H);
  room.wallTex = Tex.CONCRETE;
  room.floorTex = Tex.F_CONCRETE;
  const doorX = wing.x + Math.floor(wing.w / 2);
  placeDoorAt(world, doorX, innerWall, room.id);
  placeDoorAt(world, doorX - 3, outerWall, room.id);
  return room;
}

/** Разметка линейки: лампы по осевой, ряд у которой и строится смена. */
function markMusterLine(world: World, muster: Room): void {
  const y = muster.y + 1;
  for (let x = muster.x + 4; x < muster.x + muster.w - 4; x += 9) {
    world.features[world.idx(x, y)] = Feature.LAMP;
  }
}

function furnishBarracks(world: World, room: Room): void {
  // Койки в два ряда вдоль стен, проход посередине: казарма, а не спальня.
  for (let y = room.y + 1; y < room.y + room.h - 1; y += 3) {
    world.features[world.idx(room.x, y)] = Feature.BED;
    world.features[world.idx(room.x + room.w - 1, y)] = Feature.BED;
    world.features[world.idx(room.x + 1, y)] = Feature.SHELF;
  }
}

function furnishArmory(world: World, room: Room): void {
  for (let x = room.x + 1; x < room.x + room.w - 1; x += 2) {
    world.features[world.idx(x, room.y)] = Feature.SHELF;
    world.features[world.idx(x, room.y + room.h - 1)] = Feature.SHELF;
  }
  world.features[world.idx(room.x + 1, room.y + Math.floor(room.h / 2))] = Feature.DESK;
}

function furnishInfirmary(world: World, room: Room): void {
  room.wallTex = Tex.TILE_W;
  room.floorTex = Tex.F_TILE;
  for (let y = room.y + 1; y < room.y + room.h - 1; y += 3) {
    world.features[world.idx(room.x, y)] = Feature.BED;
    world.features[world.idx(room.x + room.w - 1, y)] = Feature.BED;
  }
  world.features[world.idx(room.x + 1, room.y)] = Feature.SINK;
  world.features[world.idx(room.x + 2, room.y)] = Feature.APPARATUS;
}

function furnishBrig(world: World, room: Room): void {
  /* Гауптвахта — не тюрьма, а ряд каморок за одной перегородкой. Перегородка
   * настоящая, с дверью в каждую камеру: «арест», читаемый только по названию,
   * не читается никак. Камеры уходят к дальней стене, а обе двери комнаты
   * выходят в проход перед перегородкой — караул стоит между камерами и выходом.
   */
  room.wallTex = Tex.METAL;
  const partition = room.x + room.w - 6;
  for (let y = room.y; y < room.y + room.h; y++) {
    const i = world.idx(partition, y);
    world.cells[i] = Cell.WALL;
    world.wallTex[i] = Tex.METAL;
    world.features[i] = Feature.NONE;
    world.roomMap[i] = -1;
  }
  for (let y = room.y + 1; y + 2 < room.y + room.h; y += 4) {
    placeDoorAt(world, partition, y + 1, room.id);
    world.features[world.idx(room.x + room.w - 1, y + 1)] = Feature.BED;
  }
}

function furnishRange(world: World, room: Room): void {
  /* Мишени — на дальней стене, огневой рубеж — у ближней. Рубеж отмечен столами
   * не для красоты: они путевая преграда, и стрелок упирается в них, а не
   * забредает под собственные мишени. */
  for (let y = room.y; y < room.y + room.h; y++) {
    world.wallTex[world.idx(room.x + room.w, y)] = Tex.TARGET;
  }
  for (let y = room.y + 1; y < room.y + room.h - 1; y += 2) {
    world.features[world.idx(room.x + 2, y)] = Feature.TABLE;
  }
}

function furnishWarRoom(world: World, room: Room): void {
  /* Карта шахты — стол посреди комнаты, вокруг которого стоят. Экраны на стене
   * держат сводку по этажам; на что они смотрят, решает общий слой экранов. */
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  for (let dx = -3; dx <= 3; dx++) {
    world.features[world.idx(cx + dx, cy)] = Feature.TABLE;
  }
  for (let dx = -4; dx <= 4; dx += 4) {
    world.features[world.idx(cx + dx, room.y)] = Feature.SCREEN;
  }
  world.features[world.idx(room.x + 1, room.y + room.h - 1)] = Feature.DESK;
}

function furnishGuardhouse(world: World, room: Room): void {
  world.features[world.idx(room.x + 1, room.y + 1)] = Feature.DESK;
  world.features[world.idx(room.x + 2, room.y + 1)] = Feature.CHAIR;
  world.features[world.idx(room.x + room.w - 2, room.y + 1)] = Feature.SCREEN;
  world.features[world.idx(room.x + 1, room.y + room.h - 2)] = Feature.LAMP;
}

/**
 * Хозяева комнат. Трое ликвидаторских торговцев раньше стояли кучей в середине
 * штаба — там, где ни один из них не работает. Оружейник принадлежит оружейной,
 * медик лазарету, квартирмейстер каптёрке; последнего забирает слой снабжения,
 * потому что каптёрка старшины — его земля.
 */
function postKeepers(
  entities: Entity[], nextId: { v: number }, rooms: Map<string, Room>,
): void {
  const armory = rooms.get(LIQ_ARMORY)!;
  const infirmary = rooms.get(LIQ_INFIRMARY)!;
  requireSpawnedPlotNpcFromPackage(entities, nextId, 'liq_armorer',
    armory.x + Math.floor(armory.w / 2), armory.y + Math.floor(armory.h / 2), { angle: Math.PI / 2 });
  requireSpawnedPlotNpcFromPackage(entities, nextId, 'liq_medic',
    infirmary.x + Math.floor(infirmary.w / 2), infirmary.y + Math.floor(infirmary.h / 2), { angle: Math.PI / 2 });
}
