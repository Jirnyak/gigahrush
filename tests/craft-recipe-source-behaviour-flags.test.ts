import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { CRAFT_RECIPE_SOURCES, craftRecipeSourceConsumesItem } from '../src/data/craft_recipe_sources';

/** Поведение источника рецептов объявляют поля, а не теги. Оба тега ниже когда-то
 *  читались кодом и не были поставлены ни одному источнику: `consume_item`
 *  дублировал флаг `consume`, а `pass_through_item_use` включал точку
 *  расширения, которую нельзя было включить. Если такой тег появится снова,
 *  автор должен узнать об этом здесь, а не по молчаливо нерасходуемой бумаге. */
const BEHAVIOUR_TAGS = ['consume_item', 'pass_through_item_use'];

test('теги не подменяют поведенческие поля источника рецептов', () => {
  for (const source of CRAFT_RECIPE_SOURCES) {
    for (const tag of BEHAVIOUR_TAGS) {
      assert.equal(
        source.tags.includes(tag),
        false,
        `источник ${source.id} размечен тегом '${tag}', который ничего не делает; поведение задаётся полем`,
      );
    }
  }
});

test('расходуемость источника читается только из флага consume', () => {
  let consumable = 0;
  for (const source of CRAFT_RECIPE_SOURCES) {
    assert.equal(craftRecipeSourceConsumesItem(source), source.consume === true, `источник ${source.id}`);
    if (source.consume === true) consumable++;
  }
  assert.equal(consumable > 0, true, 'ни один источник не расходуется — расходуемость перестала существовать');
});
