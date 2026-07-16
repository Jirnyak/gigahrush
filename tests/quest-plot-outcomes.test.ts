import test from 'node:test';
import assert from 'node:assert/strict';

import { applyStoryQuestOutcome } from '../src/systems/quests';
import { makeGameState, makeTestPlayer } from './helpers';
import { QuestType } from '../src/core/types';

test('applyStoryQuestOutcome', async (t) => {

  await t.test('ignores non-complete_quest outcomes', () => {
    const state = makeGameState();
    const player = makeTestPlayer();

    // @ts-expect-error - testing invalid kind
    const result = applyStoryQuestOutcome({ kind: 'other' }, player, [], state, [], 'test_item');
    assert.equal(result, false);
  });

  await t.test('returns false if no matching active quest is found', () => {
    const state = makeGameState();
    state.quests = [
      {
        id: 1,
        type: QuestType.VISIT,
        giverId: 2,
        giverName: 'Giver',
        desc: 'Visit',
        done: true, // Already done!
        failed: false,
        plotStepIndex: 1,
      }
    ];

    const player = makeTestPlayer();

    const outcome = {
      kind: 'complete_quest' as const,
      quest: { plotStepIndex: 1 },
    };

    const result = applyStoryQuestOutcome(outcome, player, [], state, [], 'test_item');
    assert.equal(result, false);
  });

  await t.test('completes a matched non-FETCH story quest and consumes item if specified', () => {
    const state = makeGameState();
    state.quests = [
      {
        id: 1,
        type: QuestType.VISIT, // Not FETCH
        giverId: 2,
        giverName: 'Giver',
        desc: 'Visit',
        done: false,
        failed: false,
        plotStepIndex: 1,
      }
    ];

    const player = makeTestPlayer({
      inventory: [{ defId: 'special_key', count: 1 }, { defId: 'other', count: 1 }]
    });

    const msgs: any[] = [];

    const outcome = {
      kind: 'complete_quest' as const,
      quest: { plotStepIndex: 1 },
      consumeItem: true,
    };

    const result = applyStoryQuestOutcome(outcome, player, [], state, msgs, 'special_key');

    assert.equal(result, true);
    assert.equal(state.quests[0].done, true);
    assert.equal(state.quests[0].failed, false);

    // special_key should be consumed because it's not a FETCH quest
    assert.equal(player.inventory.find(i => i.defId === 'special_key'), undefined);
    assert.equal(player.inventory.find(i => i.defId === 'other')?.count, 1);
  });

  await t.test('completes a matched FETCH story quest and does NOT double-consume item if it matches targetItem', () => {
    const state = makeGameState();
    state.quests = [
      {
        id: 1,
        type: QuestType.FETCH,
        giverId: 2,
        giverName: 'Giver',
        desc: 'Bring item',
        targetItem: 'special_key',
        targetCount: 1,
        done: false,
        failed: false,
        plotStepIndex: 1,
      }
    ];

    const player = makeTestPlayer({
      inventory: [{ defId: 'special_key', count: 2 }]
    });

    const msgs: any[] = [];

    const outcome = {
      kind: 'complete_quest' as const,
      quest: { plotStepIndex: 1 },
      consumeItem: true,
    };

    const result = applyStoryQuestOutcome(outcome, player, [], state, msgs, 'special_key');

    assert.equal(result, true);
    assert.equal(state.quests[0].done, true);
    assert.equal(state.quests[0].failed, false);

    // FETCH quest completeQuest itself will consume 1. applyStoryQuestOutcome should NOT consume a 2nd one.
    assert.equal(player.inventory.find(i => i.defId === 'special_key')?.count, 1);
  });
});
