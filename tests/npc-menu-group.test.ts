import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  getNpcMenuOptions,
  isNpcMenuOptionListTab,
  npcMenuGroupOf,
  npcMenuGroupTab,
  NPC_MENU_BACK_ID,
} from '../src/systems/npc_interaction_options';
import { tabletopGames } from '../src/systems/tabletop';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

const GAMES_TAB = npcMenuGroupTab('tabletop');

function sceneWith(sets: readonly string[]) {
  const state = makeGameState();
  const npc = makeTestNpc({ id: 2, money: 500, inventory: sets.map(defId => ({ defId, count: 1 })) });
  const player = makeTestPlayer({ id: 1, money: 500, inventory: [] });
  return { state, player, npc };
}

function labels(ctx: ReturnType<typeof sceneWith>): string[] {
  return getNpcMenuOptions(ctx).map(option => option.label);
}

test('a group tab is recognised as an option list, and names its group', () => {
  assert.equal(isNpcMenuOptionListTab('main'), true);
  assert.equal(isNpcMenuOptionListTab(GAMES_TAB), true);
  assert.equal(isNpcMenuOptionListTab('trade'), false);
  assert.equal(npcMenuGroupOf(GAMES_TAB), 'tabletop');
  assert.equal(npcMenuGroupOf('main'), null);
});

test('the root menu shows one line for the whole group, not every game', () => {
  const ctx = sceneWith(['card_deck', 'chess_set', 'go_set']);
  ctx.state.npcMenuTab = 'main';
  const root = labels(ctx);
  // Durak and poker both ride the same deck, so three sets open four games —
  // and the root still spends exactly one line on all of them.
  assert.equal(root.filter(l => l.startsWith('Сыграть')).length, 1);
  assert.equal(root.some(l => l.includes('дурака')), false, 'a game must not leak into the root');
  assert.equal(root.some(l => l.includes('шахматы')), false);
});

test('the group lists exactly the games whose set is on the table', () => {
  const ctx = sceneWith(['chess_set']);
  ctx.state.npcMenuTab = GAMES_TAB;
  const inside = labels(ctx);
  assert.deepEqual(inside, ['Играть в шахматы (₽50)', 'Назад']);
});

test('with no set at all the group line disappears entirely', () => {
  const ctx = sceneWith([]);
  ctx.state.npcMenuTab = 'main';
  assert.equal(labels(ctx).some(l => l.startsWith('Сыграть')), false, 'no empty shelf');
});

test('every registered tabletop game is reachable through the group', () => {
  const ctx = sceneWith(tabletopGames().map(game => game.itemId));
  ctx.state.npcMenuTab = GAMES_TAB;
  const ids = getNpcMenuOptions(ctx).map(option => option.id).filter(id => id !== NPC_MENU_BACK_ID);
  assert.deepEqual(ids.sort(), tabletopGames().map(game => game.id).sort());
});

test('the group offers a way back out', () => {
  const ctx = sceneWith(['card_deck']);
  ctx.state.npcMenuTab = GAMES_TAB;
  const options = getNpcMenuOptions(ctx);
  assert.equal(options[options.length - 1].id, NPC_MENU_BACK_ID, 'back is always last');
});
