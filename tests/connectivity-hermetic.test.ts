/* ── Связность и неразрушимая стена ────────────────────────────────
 *
 * Решение владельца 2026-09-09: гермостена — неразрушимая комната, в которой
 * безопасно при самосборе. Её не берут ни инструмент игрока, ни подрывной заряд;
 * связность — не исключение. Убежище, вскрытое коридором, перестаёт быть
 * убежищем, а отпущенная в гермокамере тварь выходит в галерею.
 *
 * Второе правило того же захода: `ensureConnectivity` не вправе объявлять успех,
 * не проверив линию. Прокладка на защищённой клетке МОЛЧА ничего не делает, и
 * прежний код метил остров присоединённым по факту вызова — на карте оставался
 * шрам-полукоридор, а остров оставался островом.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, W } from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { carveCorridor, connectProtectedRoom, ensureConnectivity } from '../src/gen/shared';

/** Пустой мир из бетона с одной комнатой-материком вокруг точки спавна. */
function concreteWorld(): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  return world;
}

function fillFloor(world: World, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) world.cells[world.idx(x + dx, y + dy)] = Cell.FLOOR;
  }
}

/** Кольцо вокруг прямоугольника: `hermetic` — гермостена, иначе обычный бетон. */
function ringWall(world: World, x: number, y: number, w: number, h: number, hermetic: boolean): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) continue;
      const ci = world.idx(x + dx, y + dy);
      world.cells[ci] = Cell.WALL;
      if (hermetic) world.hermoWall[ci] = 1;
    }
  }
}

function reachableFrom(world: World, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(W * W);
  const queue = new Int32Array(W * W);
  let head = 0;
  let tail = 0;
  const start = world.idx(sx, sy);
  seen[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const ci = queue[head++];
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = world.idx(x + dx, y + dy);
      if (seen[ni]) continue;
      const cell = world.cells[ni];
      if (cell !== Cell.FLOOR && cell !== Cell.DOOR && cell !== Cell.WATER) continue;
      seen[ni] = 1;
      queue[tail++] = ni;
    }
  }
  return seen;
}

test('carveCorridor не прорезает гермостену даже вызванный в лоб', () => {
  seedGlobalRng(1);
  const world = concreteWorld();
  fillFloor(world, 100, 100, 10, 10);
  fillFloor(world, 130, 100, 10, 10);
  // Одна гермоклетка ровно поперёк линии между двумя площадками.
  const barrier: number[] = [];
  for (let y = 90; y < 120; y++) {
    const ci = world.idx(120, y);
    world.hermoWall[ci] = 1;
    barrier.push(ci);
  }

  carveCorridor(world, 105, 105, 135, 105);

  for (const ci of barrier) {
    assert.equal(world.cells[ci], Cell.WALL, `гермостена ${ci} прорезана прокладкой коридора`);
  }
});

test('связность не вскрывает гермооболочку, чтобы дотянуться до острова', () => {
  seedGlobalRng(1);
  const world = concreteWorld();
  fillFloor(world, 100, 100, 40, 40);          // материк со спавном
  fillFloor(world, 200, 100, 20, 20);          // остров под гермооболочкой
  ringWall(world, 200, 100, 20, 20, true);

  const hermeticCells: number[] = [];
  for (let i = 0; i < W * W; i++) if (world.hermoWall[i]) hermeticCells.push(i);
  assert.ok(hermeticCells.length > 0, 'гермооболочка не поставлена — тест не о том');

  ensureConnectivity(world, 110, 110);

  for (const ci of hermeticCells) {
    assert.equal(
      world.cells[ci], Cell.WALL,
      `связность прорезала гермостену в клетке ${ci}: убежище перестало быть убежищем`,
    );
  }

  // Остров обязан остаться островом. Полукоридор до гермооболочки при этом
  // законен и намеренен: на этаже, изрезанном пропастью, ЧАСТИЧНАЯ прокладка
  // вскрывает перемычку и следующий проход достраивает остальное (замерено на
  // фрактальном поле: отказ от неё стоил +2..+6 недостижимых комнат на сид).
  const seen = reachableFrom(world, 110, 110);
  assert.equal(seen[world.idx(210, 110)], 0, 'клетка за гермооболочкой оказалась достижима');
});

test('связность по-прежнему присоединяет остров за ОБЫЧНОЙ стеной', () => {
  seedGlobalRng(1);
  const world = concreteWorld();
  fillFloor(world, 100, 100, 40, 40);
  fillFloor(world, 200, 100, 20, 20);
  ringWall(world, 200, 100, 20, 20, false);

  ensureConnectivity(world, 110, 110);

  const seen = reachableFrom(world, 110, 110);
  assert.equal(seen[world.idx(210, 110)], 1, 'остров за обычным бетоном обязан быть присоединён');
});

test('связность ищет чистую линию, а не только ближайшую пару', () => {
  seedGlobalRng(1);
  const world = concreteWorld();
  fillFloor(world, 100, 100, 40, 40);
  // Остров вытянут вдоль материка: верхние его ряды смотрят в гермозаслон,
  // нижние — в чистый бетон. Расстояние до материка у всех рядов ОДНО, поэтому
  // «ближайшая пара» приводит ровно в заслон.
  fillFloor(world, 200, 100, 20, 40);
  ringWall(world, 200, 100, 20, 40, false);
  for (let y = 95; y <= 125; y++) {
    const ci = world.idx(160, y);
    world.cells[ci] = Cell.WALL;
    world.hermoWall[ci] = 1;
  }

  ensureConnectivity(world, 110, 110);

  const seen = reachableFrom(world, 110, 110);
  assert.equal(
    seen[world.idx(210, 130)], 1,
    'остров остался отрезанным: перебрана только ближайшая пара, обход заслона не найден',
  );
});

test('connectProtectedRoom щупает весь периметр, а не середину каждой стороны', () => {
  seedGlobalRng(1);
  const world = concreteWorld();
  const rx = 300;
  const ry = 300;
  const w = 20;
  const h = 20;
  fillFloor(world, rx, ry, w, h);
  for (let i = 0; i < W * W; i++) if (world.cells[i] === Cell.FLOOR) world.aptMask[i] = 1;

  // Коридор подходит к УГЛУ комнаты и не пересекает ни одну из четырёх середин
  // сторон: зонд от середины упирается в бетон и молчит, комната остаётся без
  // входа вовсе. Так «Обожжённая сторожка» на сиде 4242 имела ноль проёмов.
  fillFloor(world, rx + 1, ry - 6, 1, 4);

  connectProtectedRoom(world, rx, ry, w, h);

  let openings = 0;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) continue;
      if (world.cells[world.idx(rx + dx, ry + dy)] === Cell.FLOOR) openings++;
    }
  }
  assert.ok(openings > 0, 'защищённая комната осталась без единого проёма');

  const seen = reachableFrom(world, rx + 1, ry - 6);
  assert.equal(seen[world.idx(rx + 5, ry + 5)], 1, 'проём есть, а пути внутрь нет');
});
