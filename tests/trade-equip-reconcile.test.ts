import assert from 'node:assert/strict';
import test from 'node:test';
import { createEconomyFloorState } from '../src/data/economy';
import { ensureEconomyState } from '../src/systems/economy';
import { addTradeAskFromSlot, addTradeOfferFromSlot, executeTradeDeal } from '../src/systems/trade';
import { reconcileEquippedAfterLoss } from '../src/systems/inventory';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';
import { type GameState } from '../src/core/types';
import { ITEMS } from '../src/data/items';

function resetFloor(state: GameState): void {
  const economy = ensureEconomyState(state);
  economy.floors[state.currentZ] = createEconomyFloorState(state.currentZ);
}

test('selling the equipped weapon to a vendor unequips it (no phantom weapon)', () => {
  const state = makeGameState({ currentZ: 0 });
  resetFloor(state);
  const player = makeTestPlayer({ id: 1, inventory: [{ defId: 'knife', count: 1 }], weapon: 'knife', money: 0 });
  const npc = makeTestNpc({ id: 2, name: 'Торговец', money: 500 });

  assert.equal(addTradeOfferFromSlot(state, player, npc, 0).ok, true);
  const result = executeTradeDeal(state, player, npc);

  assert.equal(result.ok, true);
  assert.equal(player.weapon, '');
});

test('selling one of a stack keeps the weapon equipped', () => {
  const state = makeGameState({ currentZ: 0 });
  resetFloor(state);
  const player = makeTestPlayer({ id: 1, inventory: [{ defId: 'knife', count: 2 }], weapon: 'knife', money: 0 });
  const npc = makeTestNpc({ id: 2, name: 'Торговец', money: 500 });

  assert.equal(addTradeOfferFromSlot(state, player, npc, 0).ok, true);
  const result = executeTradeDeal(state, player, npc);

  assert.equal(result.ok, true);
  assert.equal(player.weapon, 'knife');
});

test('selling equipped armor unequips it', () => {
  const state = makeGameState({ currentZ: 0 });
  resetFloor(state);
  const player = makeTestPlayer({ id: 1, inventory: [{ defId: 'armor_light', count: 1 }], armorDefId: 'armor_light', money: 0 });
  // Кошелёк торговца выведен из цены товара, а не вписан числом: броня стоит
  // десятки тысяч (полоса E2), и рукописные 5 000 ₽ делали сделку неоплатной —
  // тест падал на бедности покупателя, а проверял снятие надетого.
  const npc = makeTestNpc({ id: 2, name: 'Торговец', money: ITEMS.armor_light.value });

  assert.equal(addTradeOfferFromSlot(state, player, npc, 0).ok, true);
  const result = executeTradeDeal(state, player, npc);

  assert.equal(result.ok, true);
  assert.equal(player.armorDefId, undefined);
});

test('buying the vendor equipped weapon unequips the vendor side', () => {
  const state = makeGameState({ currentZ: 0 });
  resetFloor(state);
  const player = makeTestPlayer({ id: 1, money: 500 });
  const npc = makeTestNpc({ id: 2, name: 'Торговец', inventory: [{ defId: 'knife', count: 1 }], weapon: 'knife', money: 0 });

  assert.equal(addTradeAskFromSlot(state, npc, 0).ok, true);
  const result = executeTradeDeal(state, player, npc);

  assert.equal(result.ok, true);
  assert.equal(npc.weapon, '');
});

test('template NPC loadout weapon without an inventory slot survives unrelated trades', () => {
  const state = makeGameState({ currentZ: 0 });
  resetFloor(state);
  const player = makeTestPlayer({ id: 1, money: 500 });
  const npc = makeTestNpc({ id: 2, name: 'Торговец', inventory: [{ defId: 'water', count: 1 }], weapon: 'pipe', money: 0 });

  assert.equal(addTradeAskFromSlot(state, npc, 0).ok, true);
  const result = executeTradeDeal(state, player, npc);

  assert.equal(result.ok, true);
  assert.equal(npc.weapon, 'pipe');
});

test('reconcileEquippedAfterLoss clears only pointers whose defId actually left', () => {
  const e = makeTestPlayer({
    id: 3,
    inventory: [{ defId: 'knife', count: 1 }],
    weapon: 'knife',
    tool: 'flashlight',
    armorDefId: 'armor_light',
  });

  reconcileEquippedAfterLoss(e, ['flashlight', 'armor_light', 'knife']);

  assert.equal(e.weapon, 'knife');
  assert.equal(e.tool, '');
  assert.equal(e.armorDefId, undefined);
});
