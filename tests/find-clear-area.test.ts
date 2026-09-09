/* Замок на `findClearArea`.
 *
 * Это был ЖРЕБИЙ, а не поиск: 400 случайных проб по 1 048 576 клеткам. На
 * рыхлом этаже он попадает, на плотном промахивается почти всегда — и авторская
 * комната молча не рождается, вместе со своими тварями, ящиками и целью слуха.
 *
 * Замерено на жилом (4 сида, до правки): три написанных POI не встали НИ РАЗУ.
 * Причин две: под комнату 15×10 проба требует СПЛОШНОЙ блок 17×12 (таких на
 * жилом ноль при 34 сплошных 15×10), а редкие годные места дротики не находят.
 *
 * Замок держит КЛАСС: место, которое в мире ЕСТЬ, обязано быть найдено.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, W } from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { findClearArea } from '../src/gen/shared';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';

/** Мир из сплошного пола с одним-единственным карманом бетона. */
function worldWithOnePocket(px: number, py: number, w: number, h: number): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.aptMask.fill(0);
  for (let y = py; y < py + h; y++) {
    for (let x = px; x < px + w; x++) world.cells[world.idx(x, y)] = Cell.WALL;
  }
  return world;
}

test('единственный карман в мире находится, а не проигрывается жребию', () => {
  seedGlobalRng(1337);
  /* Карман ровно под комнату 15×10 плюс поле в клетку: 17×12. Жребий имел бы
   * шанс порядка 10⁻⁵ за пробу и с 400 проб не нашёл бы его практически
   * никогда — так и терялись три POI жилого этажа. */
  const world = worldWithOnePocket(300, 400, 17, 12);
  const pos = findClearArea(world, 512, 512, 15, 10, 24, 140);
  assert.ok(pos, 'карман есть в мире, но не найден');
  assert.equal(pos!.x, 301);
  assert.equal(pos!.y, 401);
});

test('поле вокруг — удобство, а не контракт: без него место всё равно берётся', () => {
  seedGlobalRng(1337);
  /* Карман ровно по размеру комнаты, поля вокруг нет. Именно этот случай и
   * стоит на жилом: сплошных 15×10 там десятки, сплошных 17×12 — ноль. */
  const world = worldWithOnePocket(300, 400, 15, 10);
  const pos = findClearArea(world, 512, 512, 15, 10, 24, 140);
  assert.ok(pos, 'место по размеру комнаты обязано подойти, когда поля в мире нет');
  assert.equal(pos!.x, 300);
  assert.equal(pos!.y, 400);
});

test('места нет — ответом остаётся null, а не выдуманная точка', () => {
  seedGlobalRng(1337);
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  assert.equal(findClearArea(world, 512, 512, 15, 10, 24, 140), null);
});

test('карман под маской квартир не берётся', () => {
  seedGlobalRng(1337);
  const world = worldWithOnePocket(300, 400, 17, 12);
  for (let y = 400; y < 412; y++) for (let x = 300; x < 317; x++) world.aptMask[world.idx(x, y)] = 1;
  assert.equal(findClearArea(world, 512, 512, 15, 10, 24, 140), null);
});

test('берётся ближайший к якорю карман, а не первый попавшийся', () => {
  seedGlobalRng(1337);
  /* Оба кармана лежат ВНУТРИ первой коробки обхода, и дальний встречается
   * раньше по порядку обхода (сверху вниз, слева направо). Без сравнения
   * расстояний победил бы он — поэтому карманы и поставлены так: контроль на
   * этой строке иначе оставался бы пустым. */
  const world = worldWithOnePocket(481, 481, 17, 12);
  for (let y = 505; y < 517; y++) for (let x = 505; x < 522; x++) world.cells[world.idx(x, y)] = Cell.WALL;
  const pos = findClearArea(world, 512, 512, 15, 10, 24, 140);
  assert.ok(pos);
  assert.deepEqual(pos, { x: 506, y: 506 }, 'взят дальний карман, хотя ближний лежит в той же коробке');
});

test('карман через шов тора виден поиску', () => {
  seedGlobalRng(1337);
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  for (let dy = 0; dy < 12; dy++) {
    for (let dx = 0; dx < 17; dx++) world.cells[world.idx((W - 8 + dx) % W, (W - 6 + dy) % W)] = Cell.WALL;
  }
  const pos = findClearArea(world, W - 1, W - 1, 15, 10, 24, 140);
  assert.ok(pos, 'карман, лежащий на шве, обязан находиться так же, как любой другой');
});

test('три авторских POI жилого этажа снова встают', () => {
  /* Поимённо: до правки ни один из трёх не появлялся ни на одном из четырёх
   * сидов, а на них ведут слухи `lead_living_lost_gnilushka_cell`,
   * `lead_living_spore_carpet_cache` и экология лампоглаза. */
  const gen = generateDesignFloor('living', 1);
  const names = new Set(gen.world.rooms.filter(Boolean).map(room => room.name));
  for (const name of [
    'Потерянная ячейка Гнилушки',
    'Кладовая висячего ковра',
    'Ламповая линия: желтый коридор',
  ]) {
    assert.ok(names.has(name), `авторская комната «${name}» не построена`);
  }
});
