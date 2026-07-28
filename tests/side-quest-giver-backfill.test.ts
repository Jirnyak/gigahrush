import test from 'node:test';
import assert from 'node:assert/strict';

import { Faction, Occupation, QuestType } from '../src/core/types';
import {
  registerSideQuest,
  sideQuestGiverId,
  SIDE_QUESTS,
  type PlotNpcDef,
  type SideQuestStep,
} from '../src/data/plot';
import { getPlotNpcNumericId } from '../src/data/npc_packages';

// Regression guard for the giverId import-time freeze (#9). Quest literals write
// `giverId: getPlotNpcNumericId('SELF')!`, which evaluates BEFORE the giver NPC is
// registered, so the eager id freezes to `undefined` (the `!` is compile-time only).
// registerSideQuest backfills it at registration; sideQuestGiverId additionally
// resolves forward-ref literals (idols) whose giver is declared in a later module.
// If either path regresses, every self-referencing side quest goes silently
// unofferable (the offer gate compares undefined !== a real id and skips).

const TEST_NPC_ID = 'test_giver_backfill_npc';

const TEST_NPC: PlotNpcDef = {
  name: 'Тестовый Даритель',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.DIRECTOR,
  sprite: Occupation.DIRECTOR,
  money: 0,
  inventory: [],
  talkLines: ['...'],
  talkLinesPost: [],
};

test('registerSideQuest backfills a frozen (undefined) giverId', () => {
  // giverId omitted on purpose: reproduces the literal whose eager
  // getPlotNpcNumericId('SELF')! returned undefined at array-eval time.
  const quest = {
    id: 'test_backfill_quest',
    type: QuestType.TALK,
    desc: 'probe',
    relationDelta: 0,
    xpReward: 0,
  } as SideQuestStep;

  assert.equal(quest.giverId, undefined, 'precondition: giverId starts frozen');

  registerSideQuest(TEST_NPC_ID, TEST_NPC, [quest]);

  const numericId = getPlotNpcNumericId(TEST_NPC_ID);
  assert.ok(numericId !== undefined && numericId >= 1, 'NPC registered with a real id');
  assert.equal(quest.giverId, numericId, 'giverId backfilled to the giver NPC id');
  assert.equal(sideQuestGiverId(quest), numericId, 'resolver returns the backfilled id');

  // The registered quest is discoverable in SIDE_QUESTS with a live giver.
  const stored = SIDE_QUESTS.find(q => q.id === 'test_backfill_quest');
  assert.ok(stored, 'quest reached SIDE_QUESTS');
  assert.equal(sideQuestGiverId(stored!), numericId);
});

test('sideQuestGiverId falls back to giverPlotNpcId for forward-ref literals', () => {
  const numericId = getPlotNpcNumericId(TEST_NPC_ID);
  assert.ok(numericId !== undefined, 'giver was registered by the prior test');

  // Idol-style literal: giverId froze to undefined; giverPlotNpcId names the giver.
  const literal = {
    id: 'test_forward_ref',
    giverPlotNpcId: TEST_NPC_ID,
    type: QuestType.TALK,
    desc: 'probe',
    relationDelta: 0,
    xpReward: 0,
  } as SideQuestStep;

  assert.equal(sideQuestGiverId(literal), numericId, 'fallback resolves via giverPlotNpcId');
});

test('sideQuestGiverId prefers a valid numeric giverId over giverPlotNpcId', () => {
  const literal = {
    id: 'test_giverid_wins',
    giverId: 7,
    giverPlotNpcId: 'nonexistent_npc_zzz',
    type: QuestType.TALK,
    desc: 'probe',
    relationDelta: 0,
    xpReward: 0,
  } as SideQuestStep;

  assert.equal(sideQuestGiverId(literal), 7, 'valid giverId wins');
});

test('sideQuestGiverId returns undefined when neither id resolves', () => {
  const literal = {
    id: 'test_unresolvable',
    giverPlotNpcId: 'nonexistent_npc_zzz',
    type: QuestType.TALK,
    desc: 'probe',
    relationDelta: 0,
    xpReward: 0,
  } as SideQuestStep;

  assert.equal(sideQuestGiverId(literal), undefined);
});
