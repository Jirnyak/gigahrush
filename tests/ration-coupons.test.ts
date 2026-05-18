import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { EntityType, Faction, FloorLevel, type Entity, type Item } from '../src/core/types';
import { ITEMS } from '../src/data/catalog';
import { ITEM_TAGS } from '../src/data/items';
import { RESOURCES } from '../src/data/resources';
import { ensureEconomyState } from '../src/systems/economy';
import { createWorldEventState, getRecentEvents, publishEvent } from '../src/systems/events';
import { useItem } from '../src/systems/inventory';
import { RATION_COUPON_ITEM_IDS } from '../src/systems/ration_coupons';
import { makeGameState } from './helpers';

function player(inventory: Item[]): Entity {
  return {
    id: 0,
    type: EntityType.PLAYER,
    x: 0,
    y: 0,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: 0,
    name: 'Вы',
    faction: Faction.PLAYER,
    inventory: inventory.map(item => ({ ...item })),
    money: 0,
  };
}

function countItem(actor: Entity, defId: string): number {
  return (actor.inventory ?? []).reduce((sum, item) => item.defId === defId ? sum + item.count : sum, 0);
}

test('ration coupon ids resolve through items, resources, and tags', () => {
  const paper = RESOURCES.find(resource => resource.id === 'paper')!;
  const documents = RESOURCES.find(resource => resource.id === 'documents')!;
  for (const id of RATION_COUPON_ITEM_IDS) {
    assert.ok(ITEMS[id], `${id} item must exist`);
    assert.ok(ITEM_TAGS[id]?.includes('ration'), `${id} must be tagged as ration content`);
    assert.ok(paper.itemIds.includes(id), `${id} must affect paper scarcity`);
    assert.ok(documents.itemIds.includes(id), `${id} must affect document scarcity`);
  }
});

test('using a fair ration coupon spends stock and grants ration output', () => {
  const state = makeGameState({ currentFloor: FloorLevel.LIVING, worldEvents: createWorldEventState() });
  const actor = player([{ defId: 'water_coupon', count: 1 }]);

  useItem(actor, 0, state.msgs, state.time, state);

  assert.equal(countItem(actor, 'water_coupon'), 0);
  assert.equal(countItem(actor, 'water'), 1);
  const economy = ensureEconomyState(state);
  assert.equal(economy.floors[FloorLevel.LIVING]?.resources.drink_water.stock, 119);
  assert.equal(getRecentEvents(state)[0].type, 'ration_coupon_spent');
});

test('using a ration stamp pad forges a dangerous ration card', () => {
  const state = makeGameState({ currentFloor: FloorLevel.MINISTRY, worldEvents: createWorldEventState() });
  const actor = player([{ defId: 'ration_stamp_pad', count: 1 }, { defId: 'blank_form', count: 1 }]);

  useItem(actor, 0, state.msgs, state.time, state);

  assert.equal(countItem(actor, 'ration_stamp_pad'), 0);
  assert.equal(countItem(actor, 'blank_form'), 0);
  assert.equal(countItem(actor, 'forged_ration_card'), 1);
  assert.equal(getRecentEvents(state)[0].type, 'ration_coupon_forged');
});

test('reporting a forged ration card resolves the audit into Kvartiry stock', () => {
  const state = makeGameState({ currentFloor: FloorLevel.MINISTRY, worldEvents: createWorldEventState() });
  const actor = player([{ defId: 'ration_registry_extract', count: 1 }, { defId: 'forged_ration_card', count: 1 }]);

  useItem(actor, 0, state.msgs, state.time, state);

  assert.equal(countItem(actor, 'ration_registry_extract'), 0);
  assert.equal(countItem(actor, 'forged_ration_card'), 0);
  assert.equal(actor.money, 18);
  const economy = ensureEconomyState(state);
  assert.equal(economy.floors[FloorLevel.KVARTIRY]?.resources.food.stock, 144);
  assert.equal(economy.floors[FloorLevel.KVARTIRY]?.resources.drink_water.stock, 122);
  assert.deepEqual(getRecentEvents(state).slice(0, 2).map(event => event.type), ['ration_audit_resolved', 'ration_coupon_reported']);
});

test('stolen coupon events publish a ration-specific theft consequence', () => {
  const state = makeGameState({ currentFloor: FloorLevel.KVARTIRY, worldEvents: createWorldEventState() });

  publishEvent(state, {
    type: 'item_stolen',
    actorId: 0,
    actorName: 'Вы',
    actorFaction: Faction.PLAYER,
    itemId: 'water_coupon',
    itemName: ITEMS.water_coupon.name,
    itemCount: 2,
    severity: 4,
    privacy: 'local',
    tags: ['container', 'theft'],
  });

  const recent = getRecentEvents(state);
  assert.equal(recent[0].type, 'ration_coupon_stolen');
  assert.equal(recent[0].itemCount, 2);
  const economy = ensureEconomyState(state);
  assert.equal(economy.floors[FloorLevel.KVARTIRY]?.resources.drink_water.stock, 118);
});
