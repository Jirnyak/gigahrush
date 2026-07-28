import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, Faction, type Entity, type GameState } from '../src/core/types';
import { ensureAlifeState, getAlifeLeaderboardSnapshot, setAlifeState } from '../src/systems/alife';
import { setFloorRunState } from '../src/systems/procedural_floors';

// mirrors tests/alife.test.ts:43 — a bare state sufficient for the A-Life leaderboard path.
function minimalState(): GameState {
  const state = { currentZ: 0 } as GameState;
  setFloorRunState(state, { runSeed: 1 }.LIVING);
  return state;
}

function makePlayer(): Entity {
  return {
    id: 0,
    type: EntityType.NPC,
    persistentNpcId: 'player',
    x: 0,
    y: 0,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    name: 'Вы',
    faction: Faction.PLAYER,
  };
}

test('#127 A-Life leaderboard does not count the player-inhabited body as its own rival', () => {
  // After death-continuation the player inhabits an NPC record (playerRelationTargetAlifeId) that stays
  // alive in alife.npcs. getAlifeLeaderboardSnapshot already emits the player as its own top entry, so
  // the inhabited record must be skipped (alife.ts:2828, where the `continue` sits BEFORE totalAlive++ at
  // :2829) — otherwise the player is tallied as its own rival, inflating totalAlive and duplicating an
  // `alife:<id>` row. Before the first death the target is undefined → byte-identical no-op, which is why
  // the pre-existing leaderboard tests never drove this branch.
  //
  // ONE state is used on purpose: the population build is not reproducible across two setAlifeState calls
  // in a process (shared module RNG bleeds), and the guard's effect must be isolated to a single variable.
  // So we snapshot, then flip only playerRelationTargetAlifeId and clear leaderboardCache to force a fresh
  // recompute over the SAME npcs array (the cache key at :2798 does not include the inhabited target).
  const state = minimalState();
  setAlifeState(state, { seed: 12345, total: 1_000 }, { populationPlan: 'empty_packages' }); // proven setup (tests/alife.test.ts:879)
  const alife = ensureAlifeState(state);
  assert.equal(alife.playerRelationTargetAlifeId, undefined, 'baseline has no inhabited body');

  const baseSnap = getAlifeLeaderboardSnapshot(state, makePlayer(), 100);

  // Victim = a row that is PROVABLY alive and counted (it passed both the death filter at :2823 and the
  // totalAlive++ tally, then ranked). This avoids guessing whether any particular npcs[i] is alive/rankable.
  const rival = baseSnap.entries.find(e => !e.player && e.id.startsWith('alife:'));
  assert.ok(rival, 'the baseline board ranks at least one live NPC rival');
  const victimId = Number(rival.id.slice('alife:'.length));

  // Inhabit that exact record and force a recompute over the identical npcs.
  alife.playerRelationTargetAlifeId = victimId;
  alife.leaderboardCache = undefined;
  const liveSnap = getAlifeLeaderboardSnapshot(state, makePlayer(), 100);

  // Same npcs, same player, same limit — the ONLY difference is the :2828 guard. Pre-fix the tally and row
  // are unchanged; post-fix the inhabited body drops out of both. No other record can backfill the SAME id.
  assert.equal(liveSnap.totalAlive, baseSnap.totalAlive - 1, 'the inhabited body is not tallied as a rival');
  assert.equal(liveSnap.entries.some(e => e.id === `alife:${victimId}`), false, 'no duplicate row re-represents the player');
});
