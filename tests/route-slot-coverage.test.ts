import test from 'node:test';
import assert from 'node:assert/strict';

import { DESIGN_FLOOR_ROUTES, designFloorAtZ } from '../src/data/design_floors';
import { FLOOR_RUN_MAX_Z, FLOOR_RUN_MIN_Z, isProceduralFloorZ } from '../src/data/procedural_floors';

// Регрессия: пустой чётный слот маршрута (был z=-12) заставляет switchFloor уйти
// в fallback-шаг ±2 без commitFloorRunEntry. Курсор floorRun застревает, и все
// дизайн-этажи ниже дыры становятся недостижимы обычным лифтом.
test('every route z resolves to a design floor or a procedural slot', () => {
  const holes: number[] = [];
  for (let z = FLOOR_RUN_MIN_Z; z <= FLOOR_RUN_MAX_Z; z++) {
    if (!designFloorAtZ(z) && !isProceduralFloorZ(z)) holes.push(z);
  }
  assert.deepEqual(holes, [], `route slots without an entry: ${holes.join(', ')}`);
});

test('design floors sit on even z only and never share a slot', () => {
  const seen = new Set<number>();
  for (const route of DESIGN_FLOOR_ROUTES) {
    assert.equal(Math.abs(route.z % 2), 0, `${route.id} sits on odd z=${route.z}`);
    assert.equal(seen.has(route.z), false, `duplicate design floor at z=${route.z}`);
    seen.add(route.z);
    assert.equal(route.z >= FLOOR_RUN_MIN_Z && route.z <= FLOOR_RUN_MAX_Z, true, `${route.id} is outside the run range`);
  }
});
