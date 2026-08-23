import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AIGoal, Cell, EntityType, RoomType, Tex, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { gotoRoom, tryAssignPathToCell } from '../src/systems/ai/pathfinding';

/*
 * Класс «не то пространство идентификаторов».
 *
 * `gotoRoom(world, e, targetRoomType)` ждёт ТИП комнаты, а `assignedRoomId` и
 * `findFamilyRoom()` дают НОМЕР. TypeScript молчит: номер — это `number`, а
 * `RoomType` — числовой enum, и одно присваивается другому без единого слова.
 * Цена молчания: путь почти никогда не находится (типов пятнадцать, комнат
 * тысячи), фолбэк не срабатывает, потому что ветка уже взята, — и человек
 * стоит намертво, перезапрашивая раз в такт. А в редком случае, когда номер
 * случайно попал в диапазон типов, ВСЕ такие люди идут в одну комнату.
 */

const ROOM_ID = 300;

function makeWorld(): World {
  const world = new World();
  for (let x = 0; x <= 60; x++) world.set(x, 10, Cell.FLOOR);
  for (let y = 9; y <= 11; y++) {
    for (let x = 40; x <= 44; x++) {
      world.set(x, y, Cell.FLOOR);
      world.roomMap[world.idx(x, y)] = ROOM_ID;
    }
  }
  world.rooms.length = ROOM_ID;
  world.rooms.push({
    id: ROOM_ID,
    type: RoomType.LIVING,
    x: 40, y: 9, w: 5, h: 3,
    doors: [], sealed: false,
    name: 'Своя комната',
    apartmentId: 0,
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_CONCRETE,
  });
  return world;
}

function npc(): Entity {
  return {
    id: 1, type: EntityType.NPC, x: 2.5, y: 10.5,
    angle: 0, pitch: 0, alive: true, speed: 1, sprite: 0,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

test('номер комнаты, поданный как тип, никуда человека не ведёт', () => {
  const world = makeWorld();
  const e = npc();
  // Комнат типа 300 на этаже нет и быть не может — это номер, а не тип.
  assert.equal(gotoRoom(world, e, ROOM_ID as unknown as RoomType), 'not_found');
  assert.equal(e.ai!.path.length, 0);
});

test('тот же адрес, взятый как номер, ведёт в центр своей комнаты', () => {
  const world = makeWorld();
  const e = npc();
  const room = world.rooms[ROOM_ID]!;
  const status = tryAssignPathToCell(world, e,
    room.x + Math.floor(room.w / 2),
    room.y + Math.floor(room.h / 2),
  );
  assert.notEqual(status, 'not_found');
  assert.ok(e.ai!.path.length > 0, 'путь до своей комнаты обязан находиться');
});

test('утилити-FSM больше не подаёт номер комнаты в поиск по типу', () => {
  // Механический замок на класс: в `npc_fsm.ts` жили ОБА промаха — назначенная
  // комната и комната семьи. Обе шли номером в `gotoRoom`, который ждёт тип.
  // Возврат вызова сюда — это возврат дефекта, поэтому его здесь быть не должно.
  const source = readFileSync(new URL('../src/systems/ai/npc_fsm.ts', import.meta.url), 'utf8');
  const code = source
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
  assert.equal(/\bgotoRoom\b/.test(code), false,
    'маршрут «в конкретную комнату по номеру» идёт через tryAssignPathToRoomCenter, а не через поиск по типу');
});
