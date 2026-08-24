/* НЕВИДИМЫХ СТЕН НЕ БЫВАЕТ.
 *
 * Клетка `Cell.DOOR` без записи в `world.doors` — состояние, не имеющее смысла
 * ни для одной системы проекта:
 *
 *  - `world.solid` отдаёт её СПЛОШНОЙ навсегда (`core/world.ts`: `if (!d) return true`);
 *  - навигация, наоборот, считает дверную клетку проходимой (глухими её делают
 *    только `LOCKED` и `HERMETIC_CLOSED`), то есть маршрут через неё строится;
 *  - открыть её нельзя: `actorContactDoor` работает с записью, которой нет;
 *  - сломать нельзя по той же причине;
 *  - игрок не видит ни створки, ни причины, почему он не проходит.
 *
 * Итог — стена, которую маршрут обещает пройти, а тело не проходит, и ничто в
 * игре не может это исправить. Ровно тот класс «маршрут врёт», который стоил
 * проекту отдельной большой смены.
 *
 * Найдено ареной 2026-08-24: на восьми проверенных дизайн-этажах фантомов НОЛЬ,
 * а вот сцена стенда `corridor` оказалась запечатана наглухо именно так — её
 * единственный проход между залами был фантомной дверью, и все снятые с неё
 * числа описывали коробку, из которой нельзя выйти.
 *
 * Поэтому тест зелёный с рождения: он ловит не текущий дефект, а РЕГРЕСС —
 * генератор, который однажды поставит `Cell.DOOR`, забыв запись.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, W } from '../src/core/types';
import { World } from '../src/core/world';
import { designFloorById, type DesignFloorId } from '../src/data/design_floors';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { testGenerationMatrix } from './generator_helpers';

const SEED = 1;

/** Этажи, проверенные ареной; берём тот же набор, чтобы числа были сравнимы. */
const FLOORS: readonly DesignFloorId[] = [
  'living', 'kvartiry', 'ministry', 'maintenance',
];

for (const id of FLOORS) {
  if (!designFloorById(id)) continue;
  testGenerationMatrix(`${id}: нет дверной клетки без записи двери`, () => {
    const gen = generateDesignFloor(id, SEED);
    const world = gen.world;
    const phantoms: number[] = [];
    for (let i = 0; i < W * W; i++) {
      if (world.cells[i] !== Cell.DOOR) continue;
      if (world.doors.get(i) === undefined) phantoms.push(i);
    }
    assert.equal(phantoms.length, 0,
      `${id}: ${phantoms.length} дверных клеток без записи — это невидимые стены.`
      + ` Первые: ${phantoms.slice(0, 5).map(i => `(${i % W},${Math.floor(i / W)})`).join(' ')}`);
  });
}

test('фантомная дверь по определению непроходима и неоткрываема', () => {
  /* Свойство, ради которого тест выше вообще существует. Держим его отдельно:
   * если однажды `world.solid` научится пропускать дверь без записи, проверка
   * выше станет бессмысленной, и об этом надо узнать здесь, а не в игре. */
  const world = new World();
  world.set(100, 100, Cell.FLOOR);
  assert.equal(world.solid(100, 100), false, 'пол обязан быть проходим');
  world.set(100, 100, Cell.DOOR);
  assert.equal(world.solid(100, 100), true,
    'дверь без записи обязана быть сплошной — иначе тест на фантомы бессмыслен');
});
