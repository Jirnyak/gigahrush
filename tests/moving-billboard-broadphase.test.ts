/* ── Ездящая статика не остаётся в бакете, где родилась ────────────
 *
 * `postrelease.md` §3, `#126`. Билборд по маске статичен ВСЕГДА
 * (`ENTITY_MASK_STATIC_VISIBLE`), а полный обход статики ждёт чужой смерти —
 * живая статика своих адресов не трогает по построению.
 *
 * Одна статика в игре ездит: вагоны состава. Создаются они в точке (0, 0) и
 * раскладываются по рельсам каждым тактом, то есть навсегда оставались в
 * бакете угла карты. Цена не косметическая: райкастер набирает спрайты
 * РАДИУСНЫМ запросом (`ENTITY_MASK_VISIBLE`), а он идёт по бакетам — состав в
 * двух шагах от игрока в этот запрос не попадал вовсе.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { EntityType, type Entity } from '../src/core/types';
import { Spr } from '../src/entities/sprite_index';
import {
  ENTITY_MASK_VISIBLE,
  getEntityIndex,
  rebuildEntityIndex,
} from '../src/systems/entity_index';

function billboardAt(id: number, x: number, y: number): Entity {
  return {
    id, type: EntityType.BILLBOARD, x, y, angle: 0, pitch: 0,
    alive: true, speed: 0, sprite: Spr.ITEM_DROP, name: 'вагон',
  };
}

test('уехавший билборд находится радиусным запросом на новом месте', () => {
  // Родился в углу карты — ровно так создаётся вагон состава.
  const car = billboardAt(1, 0.5, 0.5);
  rebuildEntityIndex([car]);
  const index = getEntityIndex();

  const found: Entity[] = [];
  assert.equal(
    index.queryRadiusCapped(0.5, 0.5, 3, found, ENTITY_MASK_VISIBLE, 16), 1,
    'контроль: на месте рождения вагон находится',
  );

  // Поехал на другой конец этажа, как по рельсам.
  car.x = 400.5;
  car.y = 300.5;
  index.restaticMovedEntity(car);

  assert.equal(
    index.queryRadiusCapped(400.5, 300.5, 3, found, ENTITY_MASK_VISIBLE, 16), 1,
    'вагон обязан находиться там, где он ЕСТЬ, а не там, где родился',
  );
  assert.equal(found[0], car);
  assert.equal(
    index.queryRadiusCapped(0.5, 0.5, 3, found, ENTITY_MASK_VISIBLE, 16), 0,
    'и не обязан находиться там, где его уже нет',
  );
});

test('переезд в тот же бакет ничего не портит и не двоит', () => {
  const car = billboardAt(2, 100.5, 100.5);
  rebuildEntityIndex([car]);
  const index = getEntityIndex();

  // Сдвиг внутри одного бакета: адрес не меняется, список тоже.
  car.x = 100.9;
  index.restaticMovedEntity(car);
  index.restaticMovedEntity(car);

  const found: Entity[] = [];
  assert.equal(index.queryRadiusCapped(100.5, 100.5, 3, found, ENTITY_MASK_VISIBLE, 16), 1);
});
