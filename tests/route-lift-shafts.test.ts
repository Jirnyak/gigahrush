/* Закон владельца: лифты — единственная механика, которой связаны соседние
 * этажи, и на каждом этаже число лифтов вверх равно числу лифтов вниз. Лифты
 * вниз верхнего этажа — те же клетки, что лифты вверх нижнего.
 *
 * Замок держит АРИФМЕТИКУ этого закона, а не её соблюдение генераторами:
 * пока `floorAboveZ(floorBelowZ(z)) === z` на всём кольце, зеркальность не
 * может разойтись, потому что оба этажа пары спрашивают одну функцию с одним
 * ключом. Замер до системы (2026-08-24): 12 дизайн-этажей из 51 несли разное
 * число лифтов вверх и вниз, разброс от 0/1 до 1/16. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { W } from '../src/core/types';
import { FLOOR_RUN_MAX_Z, FLOOR_RUN_MIN_Z } from '../src/data/procedural_floors';
import {
  ROUTE_LIFTS_PER_DIRECTION,
  ROUTE_LIFT_GRID,
  ROUTE_LIFT_GRID_STEP,
  floorAboveZ,
  floorBelowZ,
  isRouteSeamEdge,
  routeLiftShaftsDown,
  routeLiftShaftsUp,
} from '../src/data/route_lift_shafts';

const ALL_Z: number[] = [];
for (let z = FLOOR_RUN_MIN_Z; z <= FLOOR_RUN_MAX_Z; z++) ALL_Z.push(z);

test('кольцо этажей замкнуто: под низом лежит верх, и обратно', () => {
  for (const z of ALL_Z) {
    assert.equal(floorAboveZ(floorBelowZ(z)), z, `кольцо разорвано под z=${z}`);
    assert.equal(floorBelowZ(floorAboveZ(z)), z, `кольцо разорвано над z=${z}`);
  }
  assert.equal(floorBelowZ(FLOOR_RUN_MIN_Z), FLOOR_RUN_MAX_Z, 'шов кольца снизу не замкнут');
  assert.equal(floorAboveZ(FLOOR_RUN_MAX_Z), FLOOR_RUN_MIN_Z, 'шов кольца сверху не замкнут');
});

test('лифты вниз этажа — это лифты вверх этажа под ним, клетка в клетку', () => {
  const seed = 0x51ff77;
  for (const z of ALL_Z) {
    const down = routeLiftShaftsDown(seed, z);
    const up = routeLiftShaftsUp(seed, floorBelowZ(z));
    assert.deepEqual(down, up, `перегон ${z} → ${floorBelowZ(z)} разошёлся по клеткам`);
  }
});

test('число лифтов вверх и вниз одинаково на каждом этаже', () => {
  const seed = 0x51ff77;
  for (const z of ALL_Z) {
    assert.equal(routeLiftShaftsDown(seed, z).length, ROUTE_LIFTS_PER_DIRECTION);
    assert.equal(routeLiftShaftsUp(seed, z).length, ROUTE_LIFTS_PER_DIRECTION);
  }
});

test('в каждой ячейке сетки ровно одна шахта: дальше половины ячейки идти не надо', () => {
  const seed = 0x51ff77;
  for (const z of [FLOOR_RUN_MAX_Z, 14, 0, -16, -26, FLOOR_RUN_MIN_Z]) {
    const cells = routeLiftShaftsDown(seed, z);
    const occupied = new Set<number>();
    for (const idx of cells) {
      const gx = Math.floor((idx % W) / ROUTE_LIFT_GRID_STEP);
      const gy = Math.floor(Math.floor(idx / W) / ROUTE_LIFT_GRID_STEP);
      const slot = gy * ROUTE_LIFT_GRID + gx;
      assert.ok(!occupied.has(slot), `две шахты в одной ячейке сетки на z=${z}`);
      occupied.add(slot);
    }
    assert.equal(occupied.size, ROUTE_LIFTS_PER_DIRECTION, `ячейка без шахты на z=${z}`);
  }
});

test('разные перегоны стоят в разных местах, один перегон — всегда в тех же', () => {
  const seed = 0x51ff77;
  const a = routeLiftShaftsDown(seed, 0);
  const again = routeLiftShaftsDown(seed, 0);
  assert.deepEqual(a, again, 'функция шахт перестала быть чистой');

  const b = routeLiftShaftsDown(seed, -1);
  assert.notDeepEqual(a, b, 'соседние перегоны совпали клетка в клетку — джиттер по паре не работает');

  const otherRun = routeLiftShaftsDown(seed ^ 0x9e3779b9, 0);
  assert.notDeepEqual(a, otherRun, 'шахты не зависят от сида прогона');
});

test('шов кольца объявлен явно и ровно один', () => {
  const seams = ALL_Z.filter(z => isRouteSeamEdge(z));
  assert.deepEqual(seams, [FLOOR_RUN_MIN_Z], 'швов кольца должно быть ровно один');
});
