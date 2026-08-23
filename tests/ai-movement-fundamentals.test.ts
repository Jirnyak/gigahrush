/* Фундамент движения: изотропный шаг, расталкивание тел, честный детектор
 * залипания, разброс общей цели и отрицательный кэш неудачного поиска.
 *
 * Всё это раньше было сломано так, что не ловилось глазами: акторы проходили
 * друг сквозь друга и стекались в одну подклетку, счётчик залипания обнулялся
 * скольжением вдоль стены, а монстр с недостижимой целью гонял полный поиск
 * каждый кадр. Тесты закрывают именно эти классы. */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, W, type Entity, type Room, RoomType } from '../src/core/types';
import { World } from '../src/core/world';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import {
  actorOccupyRadius,
  applyActorSeparation,
  canActorOccupy,
  stepActorBy,
} from '../src/systems/movement_collision';
import {
  followPath,
  pathTargetIs,
  roomTargetCell,
  spreadTargetCell,
  subcellIdx,
  tryAssignPathToCell,
} from '../src/systems/ai/pathfinding';

function makeOpenWorld(cx: number, cy: number, radius: number): World {
  const world = new World();
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      world.set(world.wrap(x), world.wrap(y), Cell.FLOOR);
    }
  }
  return world;
}

function makeActor(id: number, x: number, y: number, speed = 1): Entity {
  return {
    id,
    type: EntityType.NPC,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed,
    sprite: 0,
    ai: { goal: AIGoal.GOTO, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

/* ── Изотропия шага ───────────────────────────────────────────── */

test('осевой шаг не отдаёт больше задуманного вдоль стены', () => {
  const world = makeOpenWorld(40, 40, 4);
  world.set(41, 41, Cell.WALL);

  const actor = makeActor(1, 40.9, 40.9);
  const step = 0.2;
  const startX = actor.x;
  const startY = actor.y;
  // Диагональ упирается в угол: разрешено только скольжение по одной оси.
  stepActorBy(world, actor, step * Math.SQRT1_2, step * Math.SQRT1_2, 0);

  const moved = Math.hypot(world.delta(startX, actor.x), world.delta(startY, actor.y));
  assert.ok(moved <= step + 1e-9, `шаг ${moved} превысил ${step}`);
});

test('скольжение симметрично при зеркальной геометрии', () => {
  const stepAlong = (mirror: boolean): number => {
    const world = makeOpenWorld(40, 40, 4);
    // Стена перекрывает движение по одной оси; зеркальная пара — по другой.
    world.set(mirror ? 40 : 41, mirror ? 41 : 40, Cell.WALL);
    const actor = makeActor(1, 40.5, 40.5);
    const dx = mirror ? 0.1 : 0.3;
    const dy = mirror ? 0.3 : 0.1;
    stepActorBy(world, actor, dx, dy, 0);
    return Math.hypot(world.delta(40.5, actor.x), world.delta(40.5, actor.y));
  };

  assert.ok(Math.abs(stepAlong(false) - stepAlong(true)) < 1e-9, 'мир анизотропен по осям');
});

test('тело держит клиренс от стены, но не больше половины подклетки', () => {
  const world = makeOpenWorld(50, 50, 3);
  world.set(51, 50, Cell.WALL);
  const r = actorOccupyRadius(makeActor(1, 0, 0));

  // Вплотную к стене встать нельзя...
  assert.equal(canActorOccupy(world, 50.98, 50.5, r), false);
  // ...а центр крайней подклетки обязан остаться достижимым, иначе законный
  // вейпойнт превращается в вечное залипание.
  assert.equal(canActorOccupy(world, 50.875, 50.5, r), true);
});

/* ── Расталкивание ────────────────────────────────────────────── */

test('слипшиеся акторы расходятся, а разведённые остаются на месте', () => {
  const world = makeOpenWorld(60, 60, 5);
  const a = makeActor(11, 60.5, 60.5);
  const b = makeActor(12, 60.5, 60.5);
  const entities = [a, b];
  rebuildEntityIndexForSimulation(entities, 1);

  assert.equal(applyActorSeparation(world, a, 1 / 30), true);
  assert.ok(world.dist(a.x, a.y, b.x, b.y) > 0, 'тела остались в одной точке');

  const far = makeActor(13, 63.5, 63.5);
  entities.push(far);
  rebuildEntityIndexForSimulation(entities, 2);
  const fx = far.x;
  const fy = far.y;
  assert.equal(applyActorSeparation(world, far, 1 / 30), false);
  assert.equal(far.x, fx);
  assert.equal(far.y, fy);
});

test('расталкивание разбирает кучу, а не тасует её', () => {
  const world = makeOpenWorld(70, 70, 6);
  const pile: Entity[] = [];
  for (let i = 0; i < 8; i++) pile.push(makeActor(20 + i, 70.5, 70.5));
  rebuildEntityIndexForSimulation(pile, 1);

  for (let frame = 0; frame < 90; frame++) {
    for (const e of pile) applyActorSeparation(world, e, 1 / 30);
    rebuildEntityIndexForSimulation(pile, frame + 2);
  }

  let overlaps = 0;
  for (let i = 0; i < pile.length; i++) {
    for (let j = i + 1; j < pile.length; j++) {
      const want = actorOccupyRadius(pile[i]) + actorOccupyRadius(pile[j]);
      if (world.dist2(pile[i].x, pile[i].y, pile[j].x, pile[j].y) < want * want * 0.25) overlaps++;
    }
  }
  assert.equal(overlaps, 0, `в куче осталось ${overlaps} слипшихся пар`);
});

/* ── Детектор залипания ───────────────────────────────────────── */

test('залипание считает продвижение по маршруту, а не факт смещения', () => {
  const world = makeOpenWorld(80, 80, 4);
  // Коридор вверх перекрыт: вейпойнт по диагонали недостижим, но по X место есть.
  world.set(80, 81, Cell.WALL);
  world.set(81, 81, Cell.WALL);

  const actor = makeActor(31, 80.5, 80.9, 1.2);
  const ai = actor.ai!;
  ai.path = [subcellIdx(80.5, 81.5)];
  ai.pi = 0;
  ai.tx = 80.5;
  ai.ty = 81.5;
  ai.stuck = 0;

  for (let frame = 0; frame < 30; frame++) followPath(world, actor, 1 / 30);

  assert.ok(ai.stuck > 0.4, `счётчик залипания не растёт: ${ai.stuck}`);
});

/* ── Боковой обход при лобовом упоре ──────────────────────────── */

/* Актёр стоит вплотную к бетону, вейпойнт — прямо за бетоном. Север тоже
 * бетон, свободен только юг: сторону обхода решает проба, а не жребий. */
function makeHeadOnPress(id: number): { world: World; actor: Entity } {
  const world = makeOpenWorld(80, 80, 5);
  world.set(81, 80, Cell.WALL);
  world.set(80, 81, Cell.WALL);
  const actor = makeActor(id, 80.85, 80.5, 1.2);
  const ai = actor.ai!;
  ai.path = [subcellIdx(83.5, 80.5)];
  ai.pi = 0;
  ai.tx = 83.5;
  ai.ty = 80.5;
  return { world, actor };
}

test('упёршийся в лоб уходит вбок, а не ползёт вдоль оси', () => {
  const { world, actor } = makeHeadOnPress(41);
  const startX = actor.x;
  const startY = actor.y;

  for (let frame = 0; frame < 60; frame++) followPath(world, actor, 1 / 30);

  assert.ok(
    Math.hypot(world.delta(startX, actor.x), world.delta(startY, actor.y)) > 1,
    `актёр остался в углу: (${actor.x.toFixed(2)}, ${actor.y.toFixed(2)})`,
  );
  // Обход идёт ОБЩИМ шагом, поэтому в бетон он никого не протаскивает.
  assert.ok(canActorOccupy(world, actor.x, actor.y, actorOccupyRadius(actor)));
});

test('обход — рунг лестницы: до своей выдержки он не срабатывает', () => {
  const { world, actor } = makeHeadOnPress(42);
  const startY = actor.y;

  // Меньше нижнего рунга (полсекунды): актёр уже упёрся, но обход ещё не его ход.
  for (let frame = 0; frame < 12; frame++) followPath(world, actor, 1 / 30);

  assert.ok(actor.ai!.stuck > 0.3, `счётчик залипания не набрался: ${actor.ai!.stuck}`);
  assert.ok(
    Math.abs(world.delta(startY, actor.y)) < 0.1,
    `обход сработал раньше своего рунга: сдвиг вбок ${world.delta(startY, actor.y)}`,
  );
});

test('продвижение сливает счётчик залипания, а не обнуляет его разом', () => {
  const world = makeOpenWorld(60, 60, 6);
  const actor = makeActor(43, 60.5, 60.5, 1.2);
  const ai = actor.ai!;
  ai.path = [subcellIdx(64.5, 60.5)];
  ai.pi = 0;
  ai.tx = 64.5;
  ai.ty = 60.5;
  ai.stuck = 1;

  followPath(world, actor, 1 / 30);
  // Разом обнулять нельзя: кроху продвижения даёт и сам обход, и тогда ступени
  // «перешагнуть» и «бросить» становятся недостижимы.
  assert.ok(ai.stuck > 0.9 && ai.stuck < 1, `счёт слит не сливом: ${ai.stuck}`);

  // Но идущему нормально лестница пустеет до нуля и не отнимает годный маршрут.
  for (let frame = 0; frame < 60; frame++) followPath(world, actor, 1 / 30);
  assert.equal(ai.stuck, 0);
});

/* ── Разброс общей цели ───────────────────────────────────────── */

test('общая цель разводится по кольцу, детерминированно и по тору', () => {
  const world = makeOpenWorld(100, 100, 6);
  const cells = new Set<string>();
  for (let id = 0; id < 12; id++) {
    const spot = spreadTargetCell(world, makeActor(id, 0, 0), 100.5, 100.5, 0.9);
    cells.add(`${spot.x}:${spot.y}`);
  }
  assert.ok(cells.size >= 4, `кольцо схлопнулось в ${cells.size} клеток`);

  const e = makeActor(7, 0, 0);
  const a = spreadTargetCell(world, e, 100.5, 100.5, 0.9);
  const b = spreadTargetCell(world, e, 100.5, 100.5, 0.9);
  assert.deepEqual(a, b, 'разброс недетерминирован');

  // Шов тора: цель у нулевой координаты остаётся рядом с целью, а не улетает.
  const seamWorld = makeOpenWorld(0, 0, 6);
  const seam = spreadTargetCell(seamWorld, makeActor(5, 0, 0), 0.5, 0.5, 0.9);
  assert.ok(seam.x >= 0 && seam.x < W && seam.y >= 0 && seam.y < W);
  assert.ok(seamWorld.dist(0.5, 0.5, seam.x + 0.5, seam.y + 0.5) < 2);
});

test('цель в комнате своя у каждого жильца, а не общий центр', () => {
  const world = makeOpenWorld(200, 200, 8);
  const room: Room = {
    id: 0,
    x: 196,
    y: 196,
    w: 9,
    h: 9,
    type: RoomType.LIVING,
    doors: [],
  } as unknown as Room;

  const spots = new Set<string>();
  for (let id = 0; id < 10; id++) {
    const spot = roomTargetCell(world, makeActor(id, 0, 0), room);
    assert.ok(spot.x > room.x && spot.x < room.x + room.w - 1);
    assert.ok(spot.y > room.y && spot.y < room.y + room.h - 1);
    spots.add(`${spot.x}:${spot.y}`);
  }
  assert.ok(spots.size >= 5, `вся комната свелась к ${spots.size} точкам`);
});

/* ── Сравнение назначенной цели ───────────────────────────────── */

test('назначенная цель сравнивается в тех же координатах, в каких пишется', () => {
  const world = makeOpenWorld(300, 300, 5);
  const actor = makeActor(41, 300.5, 300.5);

  tryAssignPathToCell(world, actor, 302, 301);
  // Сторожа пересборки пути сравнивали ai.tx с сырым Math.floor(...), а сюда
  // ложится floor + 0.5 — условие «цель сменилась» было истинно всегда.
  assert.equal(pathTargetIs(world, actor, 302, 301), true);
  assert.equal(pathTargetIs(world, actor, 302, 302), false);
});

test('недостижимая цель не оставляет назначение позади себя', () => {
  const world = makeOpenWorld(400, 400, 3);
  const actor = makeActor(51, 400.5, 400.5);

  const status = tryAssignPathToCell(world, actor, 500, 500);
  assert.equal(status, 'not_found');
  assert.equal(actor.ai!.path.length, 0);
  assert.equal(pathTargetIs(world, actor, 500, 500), true);
});
