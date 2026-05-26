import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { FloorLevel, ItemType, RoomType } from '../src/core/types';
import { ITEMS } from '../src/data/catalog';
import { ITEM_TAGS } from '../src/data/items';
import { RESOURCES, resourceForItem } from '../src/data/resources';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { inventoryItemCategory, useItem } from '../src/systems/inventory';
import { cloneItems, countInventoryItem, makeGameState, makeTestPlayer } from './helpers';

test('ammo rifle coupon is an HQ/office document mapped to ammo scarcity', () => {
  const def = ITEMS.ammo_rifle_coupon;

  assert.equal(def.id, 'ammo_rifle_coupon');
  assert.equal(def.name, 'Талон на винтовочные патроны');
  assert.equal(def.type, ItemType.MISC);
  assert.deepEqual(def.spawnRooms, [RoomType.HQ, RoomType.OFFICE]);
  assert.equal(def.spawnW > 0, true);
  assert.equal(inventoryItemCategory(def.id), 'documents');
  assert.equal(resourceForItem(def.id)?.id, 'ammo');

  const byId = Object.fromEntries(RESOURCES.map(resource => [resource.id, resource]));
  assert.ok(byId.ammo.itemIds.includes(def.id), 'rifle coupon must pressure ammo supply');
  assert.ok(byId.paper.itemIds.includes(def.id), 'rifle coupon must pressure paper supply');
  assert.ok(byId.documents.itemIds.includes(def.id), 'rifle coupon must pressure document supply');

  for (const tag of ['document', 'coupon', 'weapon_permit', 'rifle', 'ammo_762', 'single_use', 'liquidator']) {
    assert.ok(ITEM_TAGS.ammo_rifle_coupon?.includes(tag), `ammo_rifle_coupon must publish ${tag}`);
  }
});

test('using ammo rifle coupon spends the paper for a small 7.62 issue', () => {
  const state = makeGameState({
    currentFloor: FloorLevel.MINISTRY,
    time: 30,
    worldEvents: createWorldEventState(),
  });
  const player = makeTestPlayer({
    id: 1,
    inventory: cloneItems([{ defId: 'ammo_rifle_coupon', count: 1 }]),
  });

  useItem(player, 0, state.msgs, state.time, state);

  assert.equal(countInventoryItem(player, 'ammo_rifle_coupon'), 0);
  assert.equal(countInventoryItem(player, 'ammo_762'), 6);
  assert.equal(state.msgs.some(line => line.text.includes('выдали шесть 7.62')), true);

  const event = getRecentEvents(state, { type: 'player_use_item', tags: ['coupon', 'ammo_762'], limit: 1 })[0];
  assert.ok(event, 'coupon spend should publish a bounded inventory event');
  assert.equal(event.itemId, 'ammo_rifle_coupon');
});
