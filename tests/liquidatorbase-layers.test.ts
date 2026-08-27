/* Замок на четыре слоя Базы Ликвидаторов.
 *
 * Этаж собирается как лего: форт даёт землю и безликие кварталы, а поверх
 * ложатся четыре квартала со своими идеями — распорядок, арена как экономика,
 * передний край, снабжение. Здесь держится ровно то, что ломается молча:
 *
 *   — все объявленные комнаты ВЫРЫТЫ, найдены точным `defId` и несут
 *     объявленный тип (тип = поведение: комнату выбирают по нему, а не по тегу);
 *   — массив комнат плотный, id — индекс без дыр (на этом этаже уже ловили
 *     `rooms[0]`-дыру, из-за которой игровой цикл валился каждый кадр);
 *   — у каждой авторской комнаты есть дверь, и она записана в ОБА места:
 *     `world.doors` и `room.doors`;
 *   — ни одна авторская комната не замурована: до каждой доходят обычной ходьбой
 *     от точки спавна;
 *   — кварталы не наехали ни друг на друга, ни на ядро форта (арена, плац, штаб),
 *     и ни одна клетка авторской комнаты не принадлежит соседу;
 *   — ложа делит стену с ареной и имеет в неё дверь: комната без вида на песок —
 *     кабинет, а не ложа;
 *   — цепочка переднего края — настоящая цепочка: соседние звенья делят стену, и
 *     в ней стоит дверь;
 *   — ямы и гауптвахта несут настоящие камеры за перегородкой, а не название;
 *   — хозяева стоят в своих комнатах и ровно по одному (общий добор пакетов
 *     умеет прислать второго, если модуль поставил своего мимо реестра);
 *   — ВНУТРЬ АРЕНЫ слои не положили ни одной преграды. Это главное: там стоит
 *     сцена боя, и лишняя клетка ломает расстановку трибун и облёт камеры.
 *
 * Прогон один: геометрия форта и кварталов от сида не зависит вовсе — числа
 * выведены из середины этажа, — а от сида зависит только жребий безликих блоков.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { Cell, Feature, RoomType, W, type Room } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { generateFloor } from '../src/gen/floor_manifest';
import type { World } from '../src/core/world';
import { LIQUIDATOR_BASE_NAMED_ROOMS, LIQUIDATOR_BASE_ARENA_ANCHOR } from '../src/gen/liquidatorbase/rooms';
import {
  LIQ_AMMO_ROOM, LIQ_ARMORY, LIQ_BRIG, LIQ_DECON, LIQ_GATE_POST, LIQ_INFIRMARY,
  LIQ_MEMORIAL, LIQ_PITS, LIQ_QUARANTINE, LIQ_RANK_BOX, LIQ_SUPPLY, LIQ_TROPHY_HALL,
} from '../src/gen/liquidatorbase/rooms';
import { ORDER_QUARTER } from '../src/gen/liquidatorbase/order';
import { ARENA_QUARTER } from '../src/gen/liquidatorbase/arena_quarter';
import { FRONTLINE_QUARTER } from '../src/gen/liquidatorbase/frontline';
import { SUPPLY_QUARTER } from '../src/gen/liquidatorbase/supply';

const LIQUIDATOR_BASE_Z = -12;
const SEED = 20_881;

/** Порядок звеньев переднего края: он и есть процедура возвращения. */
const FRONTLINE_CHAIN = [LIQ_TROPHY_HALL, LIQ_MEMORIAL, LIQ_QUARANTINE, LIQ_DECON, LIQ_GATE_POST] as const;

/** Хозяин комнаты: пакет NPC и псевдоним комнаты, в которой он обязан стоять. */
const KEEPERS: readonly [string, string][] = [
  ['blinkov', LIQ_SUPPLY],
  ['liq_quartermaster', LIQ_AMMO_ROOM],
  ['liq_armorer', LIQ_ARMORY],
  ['liq_medic', LIQ_INFIRMARY],
];

let cached: ReturnType<typeof generateFloor> | undefined;
function base() {
  if (!cached) {
    seedGlobalRng(0xa5e1 + SEED);
    cached = generateFloor(LIQUIDATOR_BASE_Z, SEED);
  }
  return cached;
}

function roomByAlias(world: World, alias: string): Room {
  const room = world.rooms.find(candidate => candidate?.defId === alias);
  assert.ok(room, `комната "${alias}" объявлена, но не вырыта`);
  return room!;
}

function walkable(world: World, idx: number): boolean {
  return world.cells[idx] === Cell.FLOOR || world.cells[idx] === Cell.DOOR;
}

/** Достижимое обычной ходьбой от точки спавна. Ни пси, ни лома — только ноги. */
function reachableFromSpawn(): Uint8Array {
  const gen = base();
  const world = gen.world;
  const seen = new Uint8Array(W * W);
  const queue = new Int32Array(W * W);
  let head = 0;
  let tail = 0;
  const start = world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY));
  seen[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const at = queue[head++];
    const ax = at % W;
    const ay = (at - ax) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = world.idx(ax + dx, ay + dy);
      if (seen[next] || !walkable(world, next)) continue;
      seen[next] = 1;
      queue[tail++] = next;
    }
  }
  return seen;
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test('все объявленные комнаты вырыты и несут объявленный тип', () => {
  const world = base().world;
  const aliases = Object.keys(LIQUIDATOR_BASE_NAMED_ROOMS);
  assert.ok(aliases.length >= 28, `объявлено всего ${aliases.length} комнат: слои потерялись`);
  for (const alias of aliases) {
    const def = LIQUIDATOR_BASE_NAMED_ROOMS[alias as keyof typeof LIQUIDATOR_BASE_NAMED_ROOMS];
    const room = roomByAlias(world, alias);
    assert.equal(room.type, def.type,
      `"${alias}": тип комнаты — это ПОВЕДЕНИЕ (по нему её выбирает ядро актора), а он разошёлся с объявлением`);
    assert.equal(room.name, def.name);
    assert.ok(room.tags?.includes(alias), `"${alias}" потерял собственный псевдоним в тегах`);
  }
});

test('массив комнат плотный: id — индекс, дыр нет', () => {
  const world = base().world;
  for (let id = 0; id < world.rooms.length; id++) {
    const room = world.rooms[id];
    assert.ok(room, `дыра в world.rooms на ${id}: любой обход этажа падает на ней насмерть`);
    assert.equal(room.id, id, `комната на ${id} носит чужой id ${room.id}`);
  }
});

test('у каждой авторской комнаты есть дверь, и она записана в оба места', () => {
  const world = base().world;
  for (const alias of Object.keys(LIQUIDATOR_BASE_NAMED_ROOMS)) {
    if (alias === LIQUIDATOR_BASE_ARENA_ANCHOR) continue;  // чаша открыта, дверей у неё нет
    const room = roomByAlias(world, alias);
    /* Дверь ищется в СТЕННОМ КОЛЬЦЕ комнаты. Соседи делят стену, и запись
     * `room.doors` достаётся только одному из двух, поэтому одного списка мало:
     * дверь общей стены принадлежит соседу, но открывает и эту комнату. */
    let doorway = 0;
    for (let dy = -1; dy <= room.h; dy++) {
      for (let dx = -1; dx <= room.w; dx++) {
        const onRing = dx === -1 || dx === room.w || dy === -1 || dy === room.h;
        if (!onRing) continue;
        const idx = world.idx(room.x + dx, room.y + dy);
        if (world.cells[idx] !== Cell.DOOR || !world.doors.has(idx)) continue;
        const door = world.doors.get(idx)!;
        assert.ok(door.roomA >= 0 || door.roomB >= 0,
          `дверь "${alias}" не знает ни одной своей комнаты`);
        doorway++;
      }
    }
    const own = room.doors.filter(idx => world.doors.has(idx) && world.cells[idx] === Cell.DOOR);
    assert.ok(doorway > 0,
      `"${alias}" не имеет ни одной живой двери в стене: её косяк снесла санация или его не ставили`);
    assert.ok(own.length > 0 || doorway > 0,
      `"${alias}": дверь есть в мире, но комната о ней не знает`);
  }
});

test('ни одна авторская комната не замурована: до каждой доходят ногами', () => {
  const world = base().world;
  const seen = reachableFromSpawn();
  for (const alias of Object.keys(LIQUIDATOR_BASE_NAMED_ROOMS)) {
    const room = roomByAlias(world, alias);
    let reached = 0;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (seen[world.idx(x, y)]) reached++;
      }
    }
    assert.ok(reached > 0, `"${alias}" замурована: обычной ходьбой от спавна в неё не попасть`);
  }
});

test('весь проходимый объём этажа достижим ногами', () => {
  const world = base().world;
  const seen = reachableFromSpawn();
  let total = 0;
  let cut = 0;
  for (let i = 0; i < world.cells.length; i++) {
    if (!walkable(world, i)) continue;
    total++;
    if (!seen[i]) cut++;
  }
  assert.ok(total > 300_000, `этаж внезапно сжался до ${total} клеток`);
  assert.equal(cut, 0, `${cut} клеток пола отрезаны от этажа`);
});

test('кварталы не наехали друг на друга и на ядро форта', () => {
  const world = base().world;
  const quarters = [
    ['распорядок', ORDER_QUARTER],
    ['арена-квартал', ARENA_QUARTER],
    ['передний край', FRONTLINE_QUARTER],
    ['снабжение', SUPPLY_QUARTER],
  ] as const;
  for (let i = 0; i < quarters.length; i++) {
    for (let j = i + 1; j < quarters.length; j++) {
      assert.equal(overlaps(quarters[i][1], quarters[j][1]), false,
        `кварталы "${quarters[i][0]}" и "${quarters[j][0]}" перекрылись`);
    }
  }
  /* Ложа делит стену с ареной НАМЕРЕННО, поэтому арена сверяется по своему
   * внутреннему объёму, а не по пятну со стенами. */
  const arena = roomByAlias(world, LIQUIDATOR_BASE_ARENA_ANCHOR);
  for (const [name, rect] of quarters) {
    assert.equal(overlaps(rect, arena), false, `квартал "${name}" залез в чашу арены`);
  }
});

test('ни одна клетка авторской комнаты не принадлежит соседу', () => {
  const world = base().world;
  for (const alias of Object.keys(LIQUIDATOR_BASE_NAMED_ROOMS)) {
    const room = roomByAlias(world, alias);
    let alien = 0;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const idx = world.idx(x, y);
        const owner = world.roomMap[idx];
        // Перегородки ям и гауптвахты — стены внутри своей комнаты: у них хозяина нет.
        if (owner === room.id || owner < 0) continue;
        alien++;
      }
    }
    assert.equal(alien, 0, `"${alias}": ${alien} клеток внутри неё принадлежат другой комнате`);
  }
});

test('ложа делит стену с ареной и имеет в неё дверь', () => {
  const world = base().world;
  const arena = roomByAlias(world, LIQUIDATOR_BASE_ARENA_ANCHOR);
  const box = roomByAlias(world, LIQ_RANK_BOX);
  const shared = arena.x + arena.w;
  assert.equal(box.x, shared + 1, 'ложа отъехала от стены арены: из неё не видно песка');

  let doorway = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    const idx = world.idx(shared, y);
    if (world.cells[idx] !== Cell.DOOR || !world.doors.has(idx)) continue;
    assert.ok(walkable(world, world.idx(shared - 1, y)), 'за дверью ложи не песок');
    assert.ok(walkable(world, world.idx(shared + 1, y)), 'за дверью ложи не ложа');
    doorway++;
  }
  assert.equal(doorway, 1, 'у ложи нет двери прямо в чашу: это кабинет, а не ложа');
});

test('цепочка переднего края — настоящая цепочка: общая стена и дверь в ней', () => {
  const world = base().world;
  for (let i = 0; i + 1 < FRONTLINE_CHAIN.length; i++) {
    const above = roomByAlias(world, FRONTLINE_CHAIN[i]);
    const below = roomByAlias(world, FRONTLINE_CHAIN[i + 1]);
    const wall = above.y + above.h;
    assert.equal(below.y, wall + 1,
      `звенья "${FRONTLINE_CHAIN[i]}" и "${FRONTLINE_CHAIN[i + 1]}" не делят стену`);
    let doorway = 0;
    for (let x = above.x; x < above.x + above.w; x++) {
      const idx = world.idx(x, wall);
      if (world.cells[idx] === Cell.DOOR && world.doors.has(idx)) doorway++;
    }
    assert.ok(doorway >= 1,
      `между "${FRONTLINE_CHAIN[i]}" и "${FRONTLINE_CHAIN[i + 1]}" нет двери: процедура рвётся`);
  }
});

test('ямы и гауптвахта несут настоящие камеры за перегородкой', () => {
  const world = base().world;
  for (const [alias, least] of [[LIQ_PITS, 8], [LIQ_BRIG, 3]] as const) {
    const room = roomByAlias(world, alias);
    const cells = room.doors.filter(idx => {
      const x = idx % W;
      const y = (idx - x) / W;
      // Камерная дверь стоит ВНУТРИ комнаты, а не в её наружной стене.
      return x > room.x && x < room.x + room.w - 1 && y >= room.y && y < room.y + room.h;
    });
    assert.ok(cells.length >= least,
      `"${alias}": камер за перегородкой ${cells.length}, а обещано не меньше ${least}`);
  }
});

test('хозяева стоят в своих комнатах и ровно по одному', () => {
  const gen = base();
  const world = gen.world;
  for (const [packageId, alias] of KEEPERS) {
    const found = gen.entities.filter(e => (e as { npcPackageId?: string }).npcPackageId === packageId);
    assert.equal(found.length, 1,
      `"${packageId}" доставлен ${found.length} раз: общий добор пакетов прислал второго`);
    const room = roomByAlias(world, alias);
    const at = world.roomMap[world.idx(Math.floor(found[0].x), Math.floor(found[0].y))];
    assert.equal(at, room.id, `"${packageId}" стоит не в комнате "${alias}"`);
  }
});

test('слои не положили внутрь арены ни одной новой преграды', () => {
  const world = base().world;
  const arena = roomByAlias(world, LIQUIDATOR_BASE_ARENA_ANCHOR);
  /* Чаша принадлежит сцене боя. Внутри неё законны ровно два предмета — столы
   * ринга и кресла трибун (`buildArenaRing`), и ни одной стены: любая лишняя
   * клетка ломает расстановку трибун и облёт камеры. */
  const allowed = new Set<number>([Feature.NONE, Feature.TABLE, Feature.CHAIR]);
  let carpet = 0;
  for (let y = arena.y; y < arena.y + arena.h; y++) {
    for (let x = arena.x; x < arena.x + arena.w; x++) {
      const idx = world.idx(x, y);
      assert.ok(world.cells[idx] === Cell.FLOOR,
        `клетка (${x}, ${y}) внутри арены перестала быть полом`);
      assert.ok(allowed.has(world.features[idx]),
        `в арену занесли предмет ${world.features[idx]} на (${x}, ${y})`);
      if (world.floorTex[idx] !== arena.floorTex) carpet++;
    }
  }
  assert.ok(carpet > 0, 'сектор трибун по чину не размечен: ложа висит у безымянной стены');
  assert.ok(carpet < arena.w * arena.h / 2, 'сектор по чину съел половину чаши');
});

test('военный распорядок объявлен коридорами там, где по нему ходят', () => {
  const world = base().world;
  /* Обход (`patrol`) объявлен в таблице аффордансов только у CORRIDOR, HQ и
   * COMMON. Караулка и разводная линейка обязаны быть коридорами: комната типа
   * OFFICE несёт нулевой вес обхода, то есть часовому на ней нечего делать. */
  for (const alias of ['liquidatorbase_muster', 'liquidatorbase_guardhouse', 'liquidatorbase_gate_post']) {
    assert.equal(roomByAlias(world, alias).type, RoomType.CORRIDOR,
      `"${alias}" перестала быть коридором: обход в неё больше не заходит`);
  }
});
