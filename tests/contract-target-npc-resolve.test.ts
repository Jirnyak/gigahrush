import test from 'node:test';
import assert from 'node:assert/strict';

import { Faction, Occupation, QuestType } from '../src/core/types';
import { registerSideQuest, type PlotNpcDef } from '../src/data/plot';
import { getPlotNpcNumericId } from '../src/data/npc_packages';
import { contractToQuest, type ContractDef } from '../src/data/contracts';

// Regression guard for the contract TALK-target import-time freeze (#25). Three contracts
// authored `targetNpcId: getPlotNpcNumericId('…')!` directly in the CONTRACTS literal, but
// their targets register only via gen-module registerSideQuest loaded AFTER contracts.ts —
// so the eager id froze to undefined and checkTalkQuest (id-only match, quests.ts:1054)
// could never fire: accept the contract, reach the NPC, talk → nothing completes. The fix
// moves them to `targetPlotNpcStringId`, resolved to the numeric id at RUNTIME inside
// contractToQuest (by which point every gen module has been side-effect-imported). A
// plot-package NPC materializes with entity.id === its plot numeric id (plot_npc_spawn.ts:61),
// so the resolved id is exactly what the target will carry when reached.

const TARGET_NPC_ID = 'test_contract_target_npc';

const TARGET_NPC: PlotNpcDef = {
  name: 'Тестовая Цель',
  isFemale: true,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.DIRECTOR,
  sprite: Occupation.DIRECTOR,
  money: 0,
  inventory: [],
  talkLines: ['...'],
  talkLinesPost: [],
};

function contractDef(over: Partial<ContractDef>): ContractDef {
  return {
    id: 'test_contract',
    title: 't',
    issuer: 'i',
    faction: Faction.LIQUIDATOR,
    rank: 1,
    type: QuestType.TALK,
    desc: 'probe',
    target: { z: 0, hint: 'probe' },
    moneyReward: 0,
    xpReward: 0,
    relationDelta: 0,
    tags: [],
    ...over,
  };
}

test('contractToQuest resolves targetPlotNpcStringId to the live numeric id at runtime', () => {
  // Register the target the way a gen module would (post-import), giving it a real numeric id.
  registerSideQuest(TARGET_NPC_ID, TARGET_NPC, []);
  const numericId = getPlotNpcNumericId(TARGET_NPC_ID);
  assert.ok(numericId !== undefined && numericId >= 1, 'target registered with a real id');

  const quest = contractToQuest(contractDef({ targetPlotNpcStringId: TARGET_NPC_ID }), 1);
  assert.equal(quest.targetNpcId, numericId, 'string id resolved to the id a spawned NPC will carry');
});

test('contractToQuest prefers an explicit numeric targetNpcId over the string id', () => {
  const quest = contractToQuest(contractDef({ targetNpcId: 42, targetPlotNpcStringId: TARGET_NPC_ID }), 2);
  assert.equal(quest.targetNpcId, 42);
});

test('contractToQuest leaves targetNpcId undefined when neither id resolves', () => {
  const quest = contractToQuest(contractDef({ targetPlotNpcStringId: 'nonexistent_contract_target_zzz' }), 3);
  assert.equal(quest.targetNpcId, undefined);
});

test('contractToQuest passes a plain numeric targetNpcId through unchanged', () => {
  const quest = contractToQuest(contractDef({ targetNpcId: 7 }), 4);
  assert.equal(quest.targetNpcId, 7);
});
