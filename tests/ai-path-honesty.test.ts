import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { setPathBlockerRow, PATH_BLOCKER_SUBDIV } from '../src/core/path_blockers';
import {
  bfsPath,
  followPath,
  setPathContext,
  subcellIdx,
  tryAssignPathToCell,
} from '../src/systems/ai/pathfinding';

/* ── Клетка, разрезанная мебелью пополам ───────────────────────────
 *
 * Мебель живёт на сетке подклеток, поэтому клетка бывает проходима как
 * макроузел и при этом непроходима насквозь: два свободных ряда сверху и
 * снизу и глухая перемычка между ними. Маркоуровневый маршрут такую клетку
 * считал сквозной, актор упирался в перемычку и стоял до конца этажа.
 *
 * Замер на жилом этаже до починки: внутренне несвязных клеток 1.0%, но
 * маршрутов с разрывом — 21.2%, потому что длинный маршрут задевает сотни
 * клеток. */

const SUB = PATH_BLOCKER_SUBDIV;
const SW = 1024 * SUB;

/** Перегородить средние ряды подклеток: клетка распадается на верх и низ. */
function splitCellHorizontally(world: World, x: number, y: number): void {
  const ci = world.idx(x, y);
  for (let row = 1; row < SUB - 1; row++) setPathBlockerRow(world, ci, row, (1 << SUB) - 1);
  world.pathBlockerVersion++;
}

/** Вертикальный коридор шириной в клетку: (x, y0..y1). */
function makeVerticalCorridor(y0: number, y1: number, x = 20): World {
  const world = new World();
  for (let y = y0; y <= y1; y++) world.set(x, y, Cell.FLOOR);
  return world;
}

function actor(id: number, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.NPC,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 3,
    sprite: 0,
    ai: { goal: AIGoal.GOTO, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

test('маршрут не строится сквозь клетку, разрезанную мебелью пополам', () => {
  const world = makeVerticalCorridor(10, 20);
  setPathContext([], 0);
  // Без мебели путь по коридору есть.
  assert.ok(bfsPath(world, 20.5, 19.5, 20.5, 10.5).length > 0, 'чистый коридор непроходим');

  splitCellHorizontally(world, 20, 15);
  const path = bfsPath(world, 20.5, 19.5, 20.5, 10.5);
  assert.equal(path.length, 0, `маршрут прошёл сквозь перемычку: ${path.length} вейпойнтов`);
});

test('разрез внутри клетки не мешает обойти его по соседней клетке', () => {
  const world = makeVerticalCorridor(10, 20);
  // Обход: вторая колонка рядом с перерезанной клеткой.
  for (let y = 14; y <= 16; y++) world.set(21, y, Cell.FLOOR);
  setPathContext([], 0);
  splitCellHorizontally(world, 20, 15);

  const path = bfsPath(world, 20.5, 19.5, 20.5, 10.5);
  assert.ok(path.length > 0, 'обход не найден, хотя соседняя колонка открыта');
  // Ни один вейпойнт не должен лежать в перемычке.
  const cut = world.idx(20, 15);
  for (const si of path) {
    const cellX = ((si % SW) / SUB) | 0;
    const cellY = (((si / SW) | 0) / SUB) | 0;
    if (cellY * 1024 + cellX !== cut) continue;
    const row = ((si / SW) | 0) % SUB;
    assert.ok(row === 0 || row === SUB - 1, `вейпойнт в заблокированном ряду ${row}`);
  }
});

test('цель в отрезанной половине своей же клетки недостижима', () => {
  const world = new World();
  world.set(20, 15, Cell.FLOOR);
  setPathContext([], 0);
  splitCellHorizontally(world, 20, 15);
  // Обе точки — в одной клетке, но по разные стороны перемычки.
  assert.equal(bfsPath(world, 20.5, 15.9, 20.5, 15.1).length, 0);
});

/* ── Лестница спасения из залипания ───────────────────────────────
 *
 * Ступени две: перешагнуть застрявший вейпойнт (2 с) и бросить маршрут (4 с).
 * Раньше перешагивание стояло первым и ОБНУЛЯЛО счётчик, поэтому на маршруте
 * длиннее двух вейпойнтов вторая ступень была недостижима: актор молол
 * указатель со скоростью один вейпойнт в две секунды и стоял. Замер на живом
 * этаже: 2070 вейпойнтов, 29 пройдено за 59 секунд, смещение 4.9 клетки. */

test('маршрут, по которому нет продвижения, бросается, а не мелется вечно', () => {
  const world = makeVerticalCorridor(10, 30);
  setPathContext([], 0);
  const e = actor(1, 20.5, 29.5);
  // Монстр берёт скорость прямо из `speed` (у людей она считается от статов),
  // поэтому нулём здесь запирается именно шаг, а не решение.
  e.type = EntityType.MONSTER;
  assert.equal(tryAssignPathToCell(world, e, 20, 11), 'assigned');
  const pathLen = e.ai!.path.length;
  assert.ok(pathLen > 4, `маршрут слишком короткий для проверки: ${pathLen}`);
  e.speed = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 6 && e.ai!.path.length > 0; i++) followPath(world, e, dt);

  assert.equal(e.ai!.path.length, 0, 'маршрут не брошен за шесть секунд без продвижения');
  assert.equal(e.ai!.goal, AIGoal.IDLE);
  assert.ok(e.ai!.timer > 0, 'после отказа не взведён отрицательный кэш');
});

test('перешагивание вейпойнта остаётся: продвижение обнуляет счётчик', () => {
  const world = makeVerticalCorridor(10, 30);
  setPathContext([], 0);
  const e = actor(2, 20.5, 29.5);
  assert.equal(tryAssignPathToCell(world, e, 20, 11), 'assigned');

  const dt = 1 / 60;
  const startSub = subcellIdx(e.x, e.y);
  for (let i = 0; i < 60 * 3; i++) followPath(world, e, dt);

  assert.notEqual(subcellIdx(e.x, e.y), startSub, 'идущий актор не сдвинулся');
  assert.ok(e.ai!.stuck < 2, `у идущего актора растёт счётчик залипания: ${e.ai!.stuck}`);
});

/* ── Ложное «недостижимо» ──────────────────────────────────────────
 *
 * Честность маршрута нужна в обе стороны. Отказ там, где обход физически есть,
 * бьёт так же больно, как ложный путь: актор перестаёт получать дорогу и
 * блуждает. Замер на жилом этаже (3000 случайных пар клеток): ложных отказов
 * было 7.2%, честных 0.4%. Ниже заперты три их источника. */

/** Перегородить средние КОЛОНКИ подклеток: клетка распадается на лево и право. */
function splitCellVertically(world: World, x: number, y: number): void {
  const ci = world.idx(x, y);
  for (let row = 0; row < SUB; row++) setPathBlockerRow(world, ci, row, 0b0110);
  world.pathBlockerVersion++;
}

/** Горизонтальный коридор шириной в клетку: (x0..x1, y). */
function makeHorizontalCorridor(x0: number, x1: number, y: number, world = new World()): World {
  for (let x = x0; x <= x1; x++) world.set(x, y, Cell.FLOOR);
  return world;
}

test('в разрезанную клетку входят той половиной, которой из неё выходят', () => {
  // Клетка (20,14) разрезана надвое по горизонтали, дорога сворачивает из неё
  // ВНИЗ — то есть выйти можно только нижней половиной. Слева она открыта
  // обеими: обход, берущий первую попавшуюся пограничную подклетку, входил
  // верхней, упирался и объявлял «дороги нет».
  const world = makeHorizontalCorridor(19, 20, 14);
  world.set(20, 15, Cell.FLOOR);
  setPathContext([], 0);
  splitCellHorizontally(world, 20, 14);

  const path = bfsPath(world, 19.5, 14.5, 20.5, 15.5);
  assert.ok(path.length > 0, 'вход в клетку взят не той половиной — обход потерян');
  for (const si of path) {
    const cellX = ((si % SW) / SUB) | 0;
    const cellY = (((si / SW) | 0) / SUB) | 0;
    if (cellY * 1024 + cellX !== world.idx(20, 14)) continue;
    const row = ((si / SW) | 0) % SUB;
    assert.ok(row === 0 || row === SUB - 1, `вейпойнт в перемычке, ряд ${row}`);
  }
});

test('регион, разрезанный надвое, обходится по соседнему региону', () => {
  // Разрез внутри клетки (20,14) рвёт коридор пополам. Обе половины коридора
  // раньше носили ОДИН номер региона (заливка регионов клетку насквозь не
  // проверяла), поэтому колено внутри региона упиралось в перемычку, а обход
  // по нижнему коридору региональный граф даже не предлагал.
  const world = makeHorizontalCorridor(17, 22, 14);
  makeHorizontalCorridor(18, 22, 16, world);
  world.set(18, 15, Cell.FLOOR);
  world.set(22, 15, Cell.FLOOR);
  setPathContext([], 0);
  splitCellVertically(world, 20, 14);

  const path = bfsPath(world, 17.5, 14.5, 22.5, 14.5);
  assert.ok(path.length > 0, 'обход по соседнему региону не найден');
  // Обход обязан спуститься на нижний коридор, а не «пройти» сквозь перемычку.
  const usedLower = path.some(si => (((si / SW) | 0) / SUB | 0) === 16);
  assert.ok(usedLower, 'маршрут не пошёл в обход, значит прошёл сквозь разрез');
});

test('цель внутри мебели достижима, а последний вейпойнт остаётся проходимым', () => {
  // Раковина, кровать, верстак — это и есть блокер, а точка интереса указывает
  // на его клетку. Требовать проходимости последнего вейпойнта значит отказать
  // всем таким целям разом; требовать у неё компоненту — отказать всегда.
  const world = makeHorizontalCorridor(17, 20, 14);
  const ci = world.idx(20, 14);
  for (let row = 0; row < SUB - 1; row++) setPathBlockerRow(world, ci, row, (1 << SUB) - 1);
  world.pathBlockerVersion++;
  setPathContext([], 0);

  const path = bfsPath(world, 17.5, 14.5, 20, 14);
  assert.ok(path.length > 0, 'до клетки с мебелью нет дороги');
  const last = path[path.length - 1];
  const lastCell = ((((last / SW) | 0) / SUB) | 0) * 1024 + (((last % SW) / SUB) | 0);
  assert.equal(lastCell, ci, 'маршрут кончился не в клетке цели');
  assert.equal(((last / SW) | 0) % SUB, SUB - 1, 'последний вейпойнт лёг в мебель');
});
