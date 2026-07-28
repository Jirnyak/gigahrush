import test from 'node:test';
import assert from 'node:assert/strict';

import { QuestType, type Quest } from '../src/core/types';
import { sideQuestPrereqsMet, type SideQuestStep } from '../src/data/plot';

// Pins the offer-gate half of the mutually-exclusive side-quest contract that the
// double-dip fixes (#97/#98/#99/#168/#169) depend on. A truly-safe exclusive pair
// {A,B} needs all four links: A.abandons⊇{B} ∧ B.abandons⊇{A} (guards the both-active
// orderings, enforced at completion in quests.ts:abandonSideQuests, which fails only
// ACTIVE siblings) AND A.blockedBy⊇{B} ∧ B.blockedBy⊇{A} (guards the sequential
// complete-one-then-accept-other orderings, enforced HERE by sideQuestPrereqsMet).
// If the block gate ever stops keying on `done && !failed`, every exclusive pair
// silently regresses into a double-dip, so lock the exact semantics.

function questRecord(sideQuestId: string, over: Partial<Quest> = {}): Quest {
  return { sideQuestId, done: true, failed: false, ...over } as unknown as Quest;
}

function step(id: string, over: Partial<SideQuestStep> = {}): SideQuestStep {
  return {
    id,
    giverId: 1,
    type: QuestType.TALK,
    desc: 'probe',
    relationDelta: 0,
    xpReward: 0,
    ...over,
  } as SideQuestStep;
}

test('blockedBy suppresses the offer once the sibling is completed (done && !failed)', () => {
  const b = step('excl_b', { blockedBySideQuestIds: ['excl_a'] });
  assert.equal(sideQuestPrereqsMet(b, [questRecord('excl_a')]), false, 'A completed blocks B');
});

test('blockedBy does NOT suppress the offer when the sibling FAILED (abandoned/expired)', () => {
  // A failed sibling is done && failed → not a real completion → must not block, or a
  // failed rescue would wrongly seal the write-off branch (belaya rescue⟷lost).
  const b = step('excl_b', { blockedBySideQuestIds: ['excl_a'] });
  assert.equal(sideQuestPrereqsMet(b, [questRecord('excl_a', { failed: true })]), true, 'failed A does not block B');
});

test('blockedBy is inert while the sibling is still active (not yet done)', () => {
  const b = step('excl_b', { blockedBySideQuestIds: ['excl_a'] });
  assert.equal(sideQuestPrereqsMet(b, [questRecord('excl_a', { done: false })]), true, 'active A does not block B');
});

test('symmetric block links make BOTH orderings unofferable after either completes', () => {
  const a = step('excl_a', { blockedBySideQuestIds: ['excl_b'] });
  const b = step('excl_b', { blockedBySideQuestIds: ['excl_a'] });
  assert.equal(sideQuestPrereqsMet(a, [questRecord('excl_b')]), false, 'B completed blocks A');
  assert.equal(sideQuestPrereqsMet(b, [questRecord('excl_a')]), false, 'A completed blocks B');
  // With no completion yet, both remain freely offerable.
  assert.equal(sideQuestPrereqsMet(a, []), true);
  assert.equal(sideQuestPrereqsMet(b, []), true);
});

test('requiresSideQuestDone still keys on a real (non-failed) completion', () => {
  const follow = step('follow', { requiresSideQuestDone: 'lead' });
  assert.equal(sideQuestPrereqsMet(follow, []), false, 'unmet prereq withholds offer');
  assert.equal(sideQuestPrereqsMet(follow, [questRecord('lead', { failed: true })]), false, 'failed prereq does not satisfy');
  assert.equal(sideQuestPrereqsMet(follow, [questRecord('lead')]), true, 'completed prereq unlocks offer');
});
