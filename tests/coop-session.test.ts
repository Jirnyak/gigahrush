import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  activeCoopSession,
  coopActivity,
  coopSeatOf,
  endCoopSession,
  isCoopSeated,
  isNetworkedPlayerActor,
  openCoopSession,
  pendingCoopInvite,
  proposeCoopSession,
  resetCoopState,
  tickCoopInvite,
  COOP_INVITE_TIMEOUT,
} from '../src/systems/coop_session';
import { getDurakSnapshot, closeDurakGame } from '../src/systems/durak';
import { isHostile } from '../src/systems/factions';
import { addItem } from '../src/systems/inventory';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';
import '../src/systems/durak';
import '../src/systems/dice';
import '../src/systems/domino';
import '../src/systems/checkers';
import '../src/systems/coop_barter';

/** Two networked humans standing next to each other. */
function twoPlayers(moneyA = 1000, moneyB = 1000) {
  const a = makeTestPlayer({ id: 1, name: 'Первый', money: moneyA, peerSlot: 0 });
  const b = makeTestPlayer({ id: 2, name: 'Второй', money: moneyB, peerSlot: 1 });
  return { a, b };
}

function reset(): void {
  resetCoopState();
  closeDurakGame();
}

test('a networked human is told apart from an NPC by its slot', () => {
  const { a } = twoPlayers();
  assert.equal(isNetworkedPlayerActor(a), true);
  // The host is slot 0 — falsy, so a plain truthiness test would misread it.
  assert.equal(isNetworkedPlayerActor(makeTestPlayer({ id: 3, peerSlot: 0 })), true);
  assert.equal(isNetworkedPlayerActor(makeTestNpc({ id: 4 })), false);
});

test('every co-op activity is registered and prices a table from the poorer purse', () => {
  for (const id of ['durak', 'dice', 'domino', 'checkers', 'barter']) {
    assert.ok(coopActivity(id), `activity ${id} must be registered`);
  }
  const { a, b } = twoPlayers(1000, 300);
  // Ten percent of the poorer side, so both can actually cover the bet.
  assert.equal(coopActivity('durak')!.stake(a, b), 30);
  assert.equal(coopActivity('barter')!.stake(a, b), 0);
});

test('a proposal waits for an answer, refuses a second table and lapses on its own', () => {
  reset();
  const state = makeGameState();
  const { a, b } = twoPlayers();
  const first = proposeCoopSession('durak', a, b, state.time);
  assert.equal(first.ok, true);
  assert.equal(pendingCoopInvite()?.toId, b.id);

  // One invite at a time: a second proposal must not clobber the first.
  const second = proposeCoopSession('dice', a, b, state.time);
  assert.equal(second.ok, false);

  assert.equal(tickCoopInvite(state.time), null, 'a fresh invite must not lapse');
  const lapsed = tickCoopInvite(state.time + COOP_INVITE_TIMEOUT + 1);
  assert.equal(lapsed?.activityId, 'durak');
  assert.equal(pendingCoopInvite(), null);
  reset();
});

test('an accepted table seats both players, freezes them and refuses a second table', () => {
  reset();
  const state = makeGameState();
  const { a, b } = twoPlayers();
  const monster = makeTestNpc({ id: 9 });

  const opened = openCoopSession({ state, player: a, npc: b }, 'durak', 30);
  assert.equal(opened.ok, true);
  assert.equal(coopSeatOf(a.id), 'player');
  assert.equal(coopSeatOf(b.id), 'npc');
  assert.equal(isCoopSeated(a.id), true);
  assert.equal(isCoopSeated(monster.id), false);

  // Frozen means out of play: nothing picks a fight with a seated player.
  assert.equal(isHostile(monster, a), false);
  assert.equal(isHostile(a, monster), false);

  const second = openCoopSession({ state, player: a, npc: b }, 'dice', 10);
  assert.equal(second.ok, false, 'one table per host');

  endCoopSession(undefined, { state, player: a, npc: b });
  assert.equal(activeCoopSession(), null);
  assert.equal(isCoopSeated(a.id), false);
  reset();
});

test('each seat sees its own hand and only the other seat is a card count', () => {
  reset();
  const state = makeGameState();
  const { a, b } = twoPlayers();
  const def = coopActivity('durak')!;
  assert.equal(openCoopSession({ state, player: a, npc: b }, 'durak', 30).ok, true);

  const playerView = def.view('player') as ReturnType<typeof getDurakSnapshot>;
  const npcView = def.view('npc') as ReturnType<typeof getDurakSnapshot>;
  assert.equal(playerView.playerHand.length, 6);
  assert.equal(npcView.playerHand.length, 6);
  assert.equal(playerView.npcHandCount, 6);
  // Hands are disjoint: neither seat is shown the other's cards.
  const ids = new Set(playerView.playerHand.map(card => card.id));
  assert.equal(npcView.playerHand.some(card => ids.has(card.id)), false);
  // Each seat is named the opponent, never itself.
  assert.equal(playerView.npcName, 'Второй');
  assert.equal(npcView.npcName, 'Первый');
  // Exactly one seat is on the move.
  assert.equal(playerView.yourTurn !== npcView.yourTurn, true);
  reset();
});

test('the seat that is not on the move cannot play a card', () => {
  reset();
  const state = makeGameState();
  const { a, b } = twoPlayers();
  const def = coopActivity('durak')!;
  openCoopSession({ state, player: a, npc: b }, 'durak', 30);

  const waiting = (def.view('player') as ReturnType<typeof getDurakSnapshot>).yourTurn ? 'npc' : 'player';
  const before = (def.view(waiting) as ReturnType<typeof getDurakSnapshot>).playerHand.length;
  def.input({ state, player: a, npc: b, seat: waiting, input: { interactEdge: true } });
  const after = (def.view(waiting) as ReturnType<typeof getDurakSnapshot>).playerHand.length;
  assert.equal(after, before, 'a card must not leave the waiting seat');
  reset();
});

test('walking away from a wagered table hands the stake to whoever stayed', () => {
  reset();
  const state = makeGameState();
  const { a, b } = twoPlayers(1000, 1000);
  const def = coopActivity('durak')!;
  openCoopSession({ state, player: a, npc: b }, 'durak', 100);

  endCoopSession('player', { state, player: a, npc: b });
  assert.equal(a.money, 900, 'the leaver forfeits');
  assert.equal(b.money, 1100, 'the one who stayed collects');
  reset();
});

test('barter moves nothing until both sides confirm, and cancels clean', () => {
  reset();
  const state = makeGameState();
  const { a, b } = twoPlayers();
  addItem(a, 'bandage', 2);
  addItem(b, 'canned', 1);
  const def = coopActivity('barter')!;
  assert.equal(openCoopSession({ state, player: a, npc: b }, 'barter', 0).ok, true);

  // Both stage one item; nothing has moved yet.
  def.input({ state, player: a, npc: b, seat: 'player', input: { interactEdge: true } });
  def.input({ state, player: a, npc: b, seat: 'npc', input: { interactEdge: true } });
  assert.equal(countOf(a, 'bandage'), 2);
  assert.equal(countOf(b, 'canned'), 1);

  // One confirmation alone is not an agreement.
  def.input({ state, player: a, npc: b, seat: 'player', input: {}, payload: { confirm: true } });
  assert.equal(countOf(b, 'bandage'), 0);

  def.input({ state, player: a, npc: b, seat: 'npc', input: {}, payload: { confirm: true } });
  assert.equal(countOf(b, 'bandage'), 1, 'the swap runs once both agree');
  assert.equal(countOf(a, 'canned'), 1);
  reset();
});

test('editing a basket withdraws both confirmations', () => {
  reset();
  const state = makeGameState();
  const { a, b } = twoPlayers();
  addItem(a, 'bandage', 3);
  addItem(b, 'canned', 1);
  const def = coopActivity('barter')!;
  openCoopSession({ state, player: a, npc: b }, 'barter', 0);

  def.input({ state, player: a, npc: b, seat: 'player', input: { interactEdge: true } });
  def.input({ state, player: a, npc: b, seat: 'npc', input: {}, payload: { confirm: true } });
  // The other side sweetens the pot: the agreement was about the old basket.
  def.input({ state, player: a, npc: b, seat: 'player', input: { interactEdge: true } });
  const view = def.view('npc') as { you: { confirmed: boolean } };
  assert.equal(view.you.confirmed, false, 'a changed table re-opens for both');
  reset();
});

test('an abandoned barter leaves both inventories untouched', () => {
  reset();
  const state = makeGameState();
  const { a, b } = twoPlayers();
  addItem(a, 'bandage', 2);
  const def = coopActivity('barter')!;
  openCoopSession({ state, player: a, npc: b }, 'barter', 0);
  def.input({ state, player: a, npc: b, seat: 'player', input: { interactEdge: true } });
  endCoopSession('player', { state, player: a, npc: b });
  assert.equal(countOf(a, 'bandage'), 2, 'no stake, so nothing is forfeited');
  assert.equal(countOf(b, 'bandage'), 0);
  reset();
});

function countOf(actor: { inventory?: { defId: string; count: number }[] }, defId: string): number {
  let n = 0;
  for (const slot of actor.inventory ?? []) if (slot.defId === defId) n += slot.count;
  return n;
}
