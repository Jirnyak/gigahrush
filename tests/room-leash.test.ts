/* Поводок места на своём единственном шве.
 *
 * Проверяется не «поставили флаг», а то, ради чего он заведён: привязанному не
 * НАЗНАЧАЕТСЯ дорога за порог, кто бы её ни заказывал, а оказавшемуся снаружи
 * тот же поводок заказывает дорогу домой.
 *
 * Форм у места две, и правила у них одни и те же: КОМНАТА, когда место названо,
 * и КРУГ, когда никакой комнате оно не отвечает (место действия кат-сцены шире
 * своего зала намеренно). Круг проверяется теми же тремя вопросами, что и
 * комната, — иначе вторая форма жила бы на честном слове.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, RoomType, Tex, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { setPathContext, tryAssignPathToCell } from '../src/systems/ai/pathfinding';
import {
  bindActorToRoom, bindActorToSpot, releaseActorFromRoom, resetRoomLeashClockForTests,
  setRoomLeashMinute,
} from '../src/systems/room_leash';

/** Комната 10..15 и коридор из её двери направо до x = 34. */
function makeRoomAndCorridorWorld(): World {
  const world = new World();
  for (let y = 10; y <= 15; y++) {
    for (let x = 10; x <= 15; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.roomMap[idx] = 0;
    }
  }
  for (let x = 16; x <= 34; x++) {
    const idx = world.idx(x, 12);
    world.cells[idx] = Cell.FLOOR;
    world.roomMap[idx] = -1;
  }
  world.rooms.push({
    id: 0,
    type: RoomType.COMMON,
    x: 10,
    y: 10,
    w: 6,
    h: 6,
    doors: [],
    sealed: false,
    name: 'Актовый зал',
    apartmentId: -1,
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_CONCRETE,
  });
  return world;
}

function actorAt(x: number, y: number): Entity {
  return {
    id: 21,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

test('a leashed actor gets no route out of his room', () => {
  resetRoomLeashClockForTests();
  setPathContext([], 0, false);
  const world = makeRoomAndCorridorWorld();
  const e = actorAt(12, 12);

  // Свободному коридор доступен — иначе тест доказывал бы только сломанный мир.
  assert.notEqual(tryAssignPathToCell(world, e, 30, 12), 'not_found');

  bindActorToRoom(e, 0, 480);
  setRoomLeashMinute(30);
  assert.equal(tryAssignPathToCell(world, e, 30, 12), 'not_found');
  assert.deepEqual(e.ai!.path, []);
});

test('inside his room a leashed actor still walks wherever he likes', () => {
  resetRoomLeashClockForTests();
  setPathContext([], 0, false);
  const world = makeRoomAndCorridorWorld();
  const e = actorAt(11, 11);
  bindActorToRoom(e, 0, 480);
  setRoomLeashMinute(30);

  assert.notEqual(tryAssignPathToCell(world, e, 14, 14), 'not_found');
});

test('pushed outside, the same leash routes him back in instead of refusing', () => {
  resetRoomLeashClockForTests();
  setPathContext([], 0, false);
  const world = makeRoomAndCorridorWorld();
  const e = actorAt(30, 12);
  bindActorToRoom(e, 0, 480);
  setRoomLeashMinute(30);

  // Заказана дорога ЕЩЁ дальше от дома — а ведёт она домой.
  const status = tryAssignPathToCell(world, e, 34, 12);
  assert.notEqual(status, 'not_found');
  assert.equal(world.roomMap[world.idx(Math.floor(e.ai!.tx), Math.floor(e.ai!.ty))], 0);
});

test('when the post expires the actor is free again, with nobody having ticked it', () => {
  resetRoomLeashClockForTests();
  setPathContext([], 0, false);
  const world = makeRoomAndCorridorWorld();
  const e = actorAt(12, 12);
  bindActorToRoom(e, 0, 480);

  setRoomLeashMinute(479);
  assert.equal(tryAssignPathToCell(world, e, 30, 12), 'not_found');
  setRoomLeashMinute(480);
  assert.notEqual(tryAssignPathToCell(world, e, 30, 12), 'not_found');
});

test('releasing the binding restores ordinary movement at once', () => {
  resetRoomLeashClockForTests();
  setPathContext([], 0, false);
  const world = makeRoomAndCorridorWorld();
  const e = actorAt(12, 12);
  bindActorToRoom(e, 0, 480);
  setRoomLeashMinute(30);
  assert.equal(tryAssignPathToCell(world, e, 30, 12), 'not_found');

  releaseActorFromRoom(e);
  assert.notEqual(tryAssignPathToCell(world, e, 30, 12), 'not_found');
});

test('an unleashed actor pays nothing: movement is untouched', () => {
  resetRoomLeashClockForTests();
  setPathContext([], 0, false);
  const world = makeRoomAndCorridorWorld();
  const e = actorAt(12, 12);
  setRoomLeashMinute(30);

  assert.notEqual(tryAssignPathToCell(world, e, 30, 12), 'not_found');
  assert.notEqual(tryAssignPathToCell(world, e, 14, 14), 'not_found');
});

test('круг держит так же, как комната: дороги за радиус нет', () => {
  resetRoomLeashClockForTests();
  setPathContext([], 0, false);
  const world = makeRoomAndCorridorWorld();
  const e = actorAt(12, 12);
  assert.notEqual(tryAssignPathToCell(world, e, 30, 12), 'not_found');

  bindActorToSpot(e, 12.5, 12.5, 4, 480);
  setRoomLeashMinute(30);
  assert.equal(tryAssignPathToCell(world, e, 30, 12), 'not_found');
  assert.deepEqual(e.ai!.path, []);
  // А внутри круга он ходит как ходил.
  assert.notEqual(tryAssignPathToCell(world, e, 14, 14), 'not_found');
});

test('снаружи круг зовёт на свой КРАЙ, а не в середину', () => {
  resetRoomLeashClockForTests();
  setPathContext([], 0, false);
  const world = makeRoomAndCorridorWorld();
  const e = actorAt(30, 12);
  bindActorToSpot(e, 12.5, 12.5, 8, 480);
  setRoomLeashMinute(30);

  /* Заказана дорога ЕЩЁ дальше от места действия. Поводок обязан вернуть его на
   * место, но не тащить к самому якорю: боец, застигнутый в погоне, возвращается
   * на край круга и врага при этом не бросает. */
  const status = tryAssignPathToCell(world, e, 34, 12);
  assert.notEqual(status, 'not_found');
  const away = world.dist(e.ai!.tx, e.ai!.ty, 12.5, 12.5);
  assert.ok(away > 6 && away <= 9, `цель обязана лечь у края круга, а она в ${away.toFixed(1)}`);
});
