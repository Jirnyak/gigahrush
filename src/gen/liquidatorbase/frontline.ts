/* ── Слой 3: передний край ────────────────────────────────────────
 *
 * ИДЕЯ. Форт стоит не «где-то», а НАД чем-то: ниже промзоны всё закрыто
 * приказом, и База — последняя дверь перед низом. Этот слой отвечает на вопрос
 * «зачем гарнизон именно здесь» единственным способом, который читается ногами:
 * ПРОЦЕДУРОЙ ВОЗВРАЩЕНИЯ. От южных ворот внутрь идёт цепочка комнат, и пройти её
 * можно только насквозь, комната за комнатой:
 *
 *   ворота → Пост южных ворот → Шлюз дезактивации → Карантин вернувшихся
 *          → Стена памяти → Трофейная стена → форт
 *
 * Порядок и есть смысл. Сперва тебя считают, потом отмывают, потом держат,
 * потом ты читаешь, кто не дошёл, и только потом видишь, что принесли те, кто
 * дошёл. Склад трофеев снизу стоит сбоку от трофейной стены и под замком:
 * витрина открыта всем, добыча — нет.
 *
 * ЭТО НЕ ЗАМОК. Цепочка — единственный путь через СЕБЯ, а не через форт: вокруг
 * неё открытая фортовая земля, и обойти её можно обычной ходьбой, ничего не
 * тратя. Так и задумано (`CLAUDE.md`, универсальность систем): непроходимых
 * дверей в мире с пси-дефазингом и полной разрушаемостью не бывает, а бывает
 * место, где порядок ВИДЕН.
 *
 * СТАДИЯ. Расширение: слой режет геометрию и кладётся ДО связности.
 */

import { Faction, Feature, Tex, type Item, type Room, type WorldContainer } from '../../core/types';
import { ContainerKind } from '../../core/types';
import type { World } from '../../core/world';
import { placeDoorAt } from '../shared';
import { stampNamedRoom } from '../named_rooms';
import type { FortRect } from './fort';
import {
  LIQUIDATOR_BASE_NAMED_ROOMS,
  LIQ_DECON, LIQ_GATE_POST, LIQ_MEMORIAL, LIQ_QUARANTINE, LIQ_TROPHY_HALL, LIQ_TROPHY_STORE,
} from './rooms';

const LIQUIDATOR_BASE_Z = -12;

/* Цепочка стоит на оси южных ворот: ворота форта прорезаны по середине стены,
 * и процедура обязана лежать ровно на дороге, а не рядом с ней. */
const CHAIN_X = 496;
const CHAIN_W = 36;
const CHAIN_DOOR_X = CHAIN_X + Math.floor(CHAIN_W / 2) - 3;
const CHAIN_TOP = 606;

/* Кладовая трофеев западнее цепочки: у витрины, но за своей дверью. */
const STORE_X = 456;
const STORE_W = 31;
const STORE_H = 38;

/**
 * Пятно квартала. Тянется от трофейной стены до самой стены форта: полоса между
 * последней комнатой и воротами обязана остаться ЧИСТОЙ, иначе процедура
 * возвращения начинается не с поста, а с чужого квартала поперёк дороги.
 */
export const FRONTLINE_QUARTER: FortRect = {
  x: STORE_X - 1,
  y: CHAIN_TOP - 1,
  w: CHAIN_X + CHAIN_W + 1 - (STORE_X - 1),
  h: 157,
};

interface Link {
  alias: string;
  h: number;
}

/* Звенья с севера на юг — то есть в обратном порядке прохождения. Возвращаются
 * снизу, а этаж читается сверху; список идёт так, как он стоит на земле. */
const CHAIN: readonly Link[] = [
  { alias: LIQ_TROPHY_HALL, h: 20 },
  { alias: LIQ_MEMORIAL, h: 18 },
  { alias: LIQ_QUARANTINE, h: 18 },
  { alias: LIQ_DECON, h: 18 },
  { alias: LIQ_GATE_POST, h: 20 },
];

export interface FrontlineLayout {
  rooms: Map<string, Room>;
}

export function buildFrontline(world: World): FrontlineLayout {
  const rooms = new Map<string, Room>();

  let y = CHAIN_TOP;
  let previous: Room | undefined;
  for (const link of CHAIN) {
    const def = LIQUIDATOR_BASE_NAMED_ROOMS[link.alias as keyof typeof LIQUIDATOR_BASE_NAMED_ROOMS];
    const room = stampNamedRoom(world, world.rooms.length, link.alias, def, CHAIN_X, y, CHAIN_W, link.h);
    room.wallTex = Tex.CONCRETE;
    room.floorTex = Tex.F_CONCRETE;
    rooms.set(link.alias, room);
    // Общая стена с предыдущим звеном: дверь в ней и есть переход процедуры.
    if (previous) placeDoorAt(world, CHAIN_DOOR_X, y - 1, room.id);
    previous = room;
    y += link.h + 1;
  }

  const first = rooms.get(CHAIN[0].alias)!;
  const last = rooms.get(CHAIN[CHAIN.length - 1].alias)!;
  // Оба конца цепочки открыты: с юга входит вернувшаяся группа, с севера
  // выходит в форт. Тупик на любом конце превратил бы процедуру в чулан.
  placeDoorAt(world, CHAIN_DOOR_X, first.y - 1, first.id);
  placeDoorAt(world, CHAIN_DOOR_X, last.y + last.h, last.id);

  const store = stampNamedRoom(world, world.rooms.length, LIQ_TROPHY_STORE,
    LIQUIDATOR_BASE_NAMED_ROOMS[LIQ_TROPHY_STORE], STORE_X, CHAIN_TOP, STORE_W, STORE_H);
  store.wallTex = Tex.METAL;
  store.floorTex = Tex.F_CONCRETE;
  rooms.set(LIQ_TROPHY_STORE, store);
  placeDoorAt(world, STORE_X + STORE_W, CHAIN_TOP + Math.floor(STORE_H / 2), store.id);

  furnishGatePost(world, rooms.get(LIQ_GATE_POST)!);
  furnishDecon(world, rooms.get(LIQ_DECON)!);
  furnishQuarantine(world, rooms.get(LIQ_QUARANTINE)!);
  furnishMemorial(world, rooms.get(LIQ_MEMORIAL)!);
  furnishTrophyHall(world, rooms.get(LIQ_TROPHY_HALL)!);
  furnishTrophyStore(world, store);

  return { rooms };
}

function furnishGatePost(world: World, post: Room): void {
  // Стол досмотра поперёк входа и экран учёта: считают всех, кто прошёл ворота.
  const y = post.y + post.h - 3;
  for (let x = post.x + 2; x < post.x + post.w - 2; x += 4) {
    world.features[world.idx(x, y)] = Feature.DESK;
  }
  world.features[world.idx(post.x + 1, post.y + 1)] = Feature.SCREEN;
  world.features[world.idx(post.x + post.w - 2, post.y + 1)] = Feature.LAMP;
  addFrontlineContainer(world, post, post.x + 1, post.y + 2,
    ContainerKind.WEAPON_CRATE, 'Ящик сдачи оружия на посту', 'faction', [
      { defId: 'ammo_762', count: 24 },
      { defId: 'ammo_12g_slug', count: 8 },
    ]);
}

function furnishDecon(world: World, decon: Room): void {
  decon.wallTex = Tex.TILE_W;
  decon.floorTex = Tex.F_TILE;
  // Два ряда моек вдоль стен, между ними — проход, по которому и гонят строем.
  for (let x = decon.x + 1; x < decon.x + decon.w - 1; x += 2) {
    world.features[world.idx(x, decon.y)] = Feature.SINK;
    world.features[world.idx(x, decon.y + decon.h - 1)] = Feature.SINK;
  }
  world.features[world.idx(decon.x + 1, decon.y + 2)] = Feature.APPARATUS;
  world.features[world.idx(decon.x + decon.w - 2, decon.y + decon.h - 3)] = Feature.APPARATUS;
}

function furnishQuarantine(world: World, ward: Room): void {
  ward.wallTex = Tex.TILE_W;
  ward.floorTex = Tex.F_TILE;
  for (let x = ward.x + 2; x < ward.x + ward.w - 2; x += 4) {
    world.features[world.idx(x, ward.y + 1)] = Feature.BED;
    world.features[world.idx(x, ward.y + ward.h - 2)] = Feature.BED;
  }
  world.features[world.idx(ward.x + 1, ward.y + Math.floor(ward.h / 2))] = Feature.APPARATUS;
  addFrontlineContainer(world, ward, ward.x + ward.w - 2, ward.y + Math.floor(ward.h / 2),
    ContainerKind.MEDICAL_CABINET, 'Шкаф карантина', 'faction', [
      { defId: 'gasmask_filter', count: 3 },
      { defId: 'sterile_bandage', count: 2 },
      { defId: 'antidep', count: 1 },
    ]);
}

function furnishMemorial(world: World, hall: Room): void {
  /* Стена памяти — северная стена зала, вдоль неё свечи. Ни одного экрана:
   * списки погибших здесь пишут от руки, а не выводят на табло. */
  hall.wallTex = Tex.CONCRETE;
  for (let x = hall.x + 1; x < hall.x + hall.w - 1; x += 2) {
    world.features[world.idx(x, hall.y)] = Feature.CANDLE;
  }
  world.features[world.idx(hall.x + 1, hall.y + hall.h - 2)] = Feature.TABLE;
  world.features[world.idx(hall.x + hall.w - 2, hall.y + hall.h - 2)] = Feature.TABLE;
}

function furnishTrophyHall(world: World, hall: Room): void {
  // Витрина: полки по обеим длинным стенам, свет над проходом.
  for (let x = hall.x + 1; x < hall.x + hall.w - 1; x += 2) {
    world.features[world.idx(x, hall.y)] = Feature.SHELF;
    world.features[world.idx(x, hall.y + hall.h - 1)] = Feature.SHELF;
  }
  for (let x = hall.x + 4; x < hall.x + hall.w - 4; x += 8) {
    world.features[world.idx(x, hall.y + Math.floor(hall.h / 2))] = Feature.LAMP;
  }
}

function furnishTrophyStore(world: World, store: Room): void {
  for (let y = store.y + 1; y < store.y + store.h - 1; y += 3) {
    world.features[world.idx(store.x, y)] = Feature.SHELF;
    world.features[world.idx(store.x + store.w - 1, y)] = Feature.SHELF;
  }
  addFrontlineContainer(world, store, store.x + 2, store.y + 2,
    ContainerKind.METAL_CABINET, 'Шкаф принесённого снизу', 'locked', [
      { defId: 'psi_concrete_splinter', count: 1 },
      { defId: 'armor_cultist', count: 1 },
      { defId: 'holy_water', count: 2 },
    ]);
  addFrontlineContainer(world, store, store.x + store.w - 3, store.y + store.h - 3,
    ContainerKind.EMERGENCY_BOX, 'Опись невостребованного', 'faction', [
      { defId: 'liquidator_token', count: 4 },
      { defId: 'liquidator_issue_card', count: 1 },
      { defId: 'radio_headset_liquidator', count: 1 },
    ]);
}

/* Контейнер переднего края. Своя фабрика на слой — намеренно: соседние слои
 * кладут своё, и общий помощник связал бы независимые модули в один. */
function addFrontlineContainer(
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
    lockDifficulty: access === 'locked' ? 5 : undefined,
    discovered: access !== 'secret',
    tags: ['liquidatorbase', 'frontline'],
  });
}
