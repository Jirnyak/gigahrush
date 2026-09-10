import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ItemType } from '../src/core/types';
import {
  ITEMS,
  getStack,
  itemEquipSlot,
  itemHasUseAction,
  itemStackableByDefault,
  spawnCount,
} from '../src/data/items';
import { MAX_ITEM_STACK } from '../src/data/inventory_limits';
import {
  activeToolLightDrainPerSecond,
  activeToolLightRenderIntensity,
  equippedToolLightScore,
  toolLightDef,
} from '../src/data/tool_lights';
import { addItem, getEquippedToolDurability } from '../src/systems/inventory';
import { makeTestPlayer } from './helpers';

test('equipable tools default to single-item stacks', () => {
  const toolIds = Object.values(ITEMS)
    .filter(def => def.type === ItemType.TOOL && def.stack === undefined)
    .map(def => def.id)
    .sort();

  assert.ok(toolIds.includes('flashlight'));
  assert.ok(toolIds.includes('uv_spotlight'));
  for (const id of toolIds) {
    assert.equal(getStack(ITEMS[id]), 1, `${id} must not inherit commodity stack size`);
  }

  assert.equal(getStack(ITEMS.smoke_candle_check), 6);
  assert.equal(getStack(ITEMS.ammo_9mm), MAX_ITEM_STACK);
});

test('default stack model separates bulk consumables from non-use objects', () => {
  assert.equal(itemEquipSlot(ITEMS.knife), 'weapon');
  assert.equal(itemEquipSlot(ITEMS.flashlight), 'tool');
  assert.equal(itemEquipSlot(ITEMS.psi_strike), 'tool');
  assert.equal(itemEquipSlot(ITEMS.bread), null);

  assert.equal(itemHasUseAction(ITEMS.bread), true);
  assert.equal(itemHasUseAction(ITEMS.flashlight), false);
  assert.equal(itemHasUseAction(ITEMS.manometer), false);

  assert.equal(itemStackableByDefault(ITEMS.bread), true);
  assert.equal(itemStackableByDefault(ITEMS.ammo_9mm), true);
  assert.equal(itemStackableByDefault(ITEMS.manometer), false);
  assert.equal(itemStackableByDefault(ITEMS.key), false);
  assert.equal(itemStackableByDefault(ITEMS.note), false);

  assert.equal(getStack(ITEMS.bread), MAX_ITEM_STACK);
  assert.equal(getStack(ITEMS.ammo_9mm), MAX_ITEM_STACK);
  assert.equal(getStack(ITEMS.manometer), 1);
  assert.equal(getStack(ITEMS.psi_strike), 1);
  assert.equal(getStack(ITEMS.key), 1);
  assert.equal(getStack(ITEMS.note), 1);
  assert.equal(getStack(ITEMS.krona_battery), 8, 'explicit finite resource stacks remain data-driven');

  assert.equal(spawnCount(ITEMS.manometer), 1);
  assert.ok(spawnCount(ITEMS.bread) > 1);
});

test('tool pickup creates separate durability slots instead of 999 flashlights', () => {
  const player = makeTestPlayer();

  assert.equal(addItem(player, 'flashlight', 2), true);

  const slots = player.inventory?.filter(slot => slot.defId === 'flashlight') ?? [];
  assert.equal(slots.length, 2);
  assert.deepEqual(slots.map(slot => slot.count), [1, 1]);
  assert.ok(slots.every(slot => (slot.data as { dur?: number }).dur === ITEMS.flashlight.durability));
});

test('non-use misc pickup creates separate slots unless the item declares a stack', () => {
  const player = makeTestPlayer();

  assert.equal(addItem(player, 'manometer', 2), true);
  assert.deepEqual(player.inventory?.map(slot => [slot.defId, slot.count]), [
    ['manometer', 1],
    ['manometer', 1],
  ]);

  assert.equal(addItem(player, 'krona_battery', 2), true);
  assert.deepEqual(player.inventory?.at(-1), { defId: 'krona_battery', count: 2, data: undefined });
});

/* Тест ОХРАНЯЛ ДЕФЕКТ и переписан 2026-09-10.
 *
 * Прежняя редакция запирала три равенства пассивного яруса и — главное —
 * `equippedToolLightScore(id) === 0`, то есть «человек с фонарём в руке
 * незаметен». Ноль этот брался не из замысла, а из мёртвого поля `passive`, и
 * из-за него молчали три написанных пути: противодействие гермодверному буру,
 * опознание светящегося актора у Лишенного и его же выбор цели по свету. Ярус
 * снят по решению владельца, ноль вместе с ним. */
test('свет в руке зажигается кнопкой, но носителя видно и без неё', () => {
  for (const id of ['flashlight', 'liquidator_flashlamp'] as const) {
    const player = makeTestPlayer();
    assert.equal(addItem(player, id, 1), true);
    player.tool = id;

    const durability = getEquippedToolDurability(player);
    assert.deepEqual(durability, { cur: ITEMS[id].durability, max: ITEMS[id].durability }, id);
    assert.ok(toolLightDef(id), id);
    // Луч и расход батареи — только по удержанию кнопки; это зовёт сам вызывающий.
    assert.ok(activeToolLightDrainPerSecond(id) > 0, id);
    assert.ok(activeToolLightRenderIntensity(id, durability) > 0, id);
    // А вот носитель источника света заметен твари и буру всегда.
    assert.ok(equippedToolLightScore(id) > 0, id);
  }
});
