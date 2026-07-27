import test from 'node:test';
import assert from 'node:assert/strict';
import { Faction } from '../src/core/types';
import {
  FACTION_COUNT,
  addFactionRelMutual,
  getFactionRel,
  initFactionRelations,
  resetPlayerFactionRelations,
  restoreFactionRelations,
  snapshotFactionRelations,
} from '../src/data/relations';

test('snapshot + restore round-trips the dynamic faction matrix', () => {
  initFactionRelations();
  addFactionRelMutual(Faction.PLAYER, Faction.LIQUIDATOR, 20);
  const before = getFactionRel(Faction.PLAYER, Faction.LIQUIDATOR);
  const snap = snapshotFactionRelations();
  assert.equal(snap.length, FACTION_COUNT * FACTION_COUNT);

  // Wipe back to base, prove the drift is gone, then restore from the snapshot.
  initFactionRelations();
  assert.notEqual(getFactionRel(Faction.PLAYER, Faction.LIQUIDATOR), before);
  restoreFactionRelations(snap);
  assert.equal(getFactionRel(Faction.PLAYER, Faction.LIQUIDATOR), before);
});

test('restore ignores malformed input and keeps the current matrix', () => {
  initFactionRelations();
  addFactionRelMutual(Faction.PLAYER, Faction.CITIZEN, 5);
  const keep = getFactionRel(Faction.PLAYER, Faction.CITIZEN);
  restoreFactionRelations(undefined);
  restoreFactionRelations([1, 2, 3]); // wrong length
  restoreFactionRelations('nope');
  restoreFactionRelations({ 0: 1 });
  assert.equal(getFactionRel(Faction.PLAYER, Faction.CITIZEN), keep);
});

test('restore clamps out-of-range entries to Int8 bounds', () => {
  initFactionRelations();
  const snap = snapshotFactionRelations();
  snap[Faction.PLAYER * FACTION_COUNT + Faction.WILD] = 9999;
  snap[Faction.WILD * FACTION_COUNT + Faction.PLAYER] = -9999;
  restoreFactionRelations(snap);
  assert.equal(getFactionRel(Faction.PLAYER, Faction.WILD), 127);
  assert.equal(getFactionRel(Faction.WILD, Faction.PLAYER), -128);
});

test('resetPlayerFactionRelations resets only PLAYER row/col, preserving faction politics', () => {
  initFactionRelations();
  // Drift both a non-player pair and a player pair.
  addFactionRelMutual(Faction.CITIZEN, Faction.CULTIST, 30);
  addFactionRelMutual(Faction.PLAYER, Faction.CULTIST, -40);
  const citCul = getFactionRel(Faction.CITIZEN, Faction.CULTIST);
  const playerCulDrifted = getFactionRel(Faction.PLAYER, Faction.CULTIST);

  resetPlayerFactionRelations();

  // Faction↔faction politics untouched by death-continuation.
  assert.equal(getFactionRel(Faction.CITIZEN, Faction.CULTIST), citCul);
  // Player standing reverts to the base matrix value (PLAYER↔CULTIST base = 0).
  assert.notEqual(getFactionRel(Faction.PLAYER, Faction.CULTIST), playerCulDrifted);
  assert.equal(getFactionRel(Faction.PLAYER, Faction.CULTIST), 0);
  assert.equal(getFactionRel(Faction.CULTIST, Faction.PLAYER), 0);
});
