import test from 'node:test';
import assert from 'node:assert/strict';

import { ITEMS, itemIsFlammable } from '../src/data/items';

/* «Горит» переехало из `main.ts` в свойство предмета (§2.12). Замок держит
 * ДВЕ стороны переезда: набор не поехал и метка читается через `ITEMS`. */
const FLAME_COLLATERAL_ITEMS_AT_MOVE = [
  'bread', 'canned', 'rawmeat', 'mushroom_mass', 'infected_mushroom',
  'cloth_roll', 'note', 'book', 'water_coupon', 'filter_layer',
];

test('метка flammable совпадает со списком, что жил у огнемёта', () => {
  const flammable = Object.keys(ITEMS).filter(id => itemIsFlammable(id)).sort();
  assert.deepEqual(flammable, [...FLAME_COLLATERAL_ITEMS_AT_MOVE].sort());
});

test('несуществующий id не горит и не роняет вызов', () => {
  assert.equal(itemIsFlammable('нет такого предмета'), false);
  assert.equal(itemIsFlammable(''), false);
});

test('вода и металл не горят', () => {
  for (const id of ['ak47', 'bandage', 'ammo_9mm', 'void_spike']) {
    assert.equal(itemIsFlammable(id), false, `${id} не должен гореть`);
  }
});
