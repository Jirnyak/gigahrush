import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { TutorialStep } from '../src/systems/tutorial';
import { guideTarget, resetTargetGuide, tutorialGuideStage } from '../src/systems/target_guide';
import { EntityType, type Entity, type GameState } from '../src/core/types';

function guideState(overrides: Partial<GameState>): GameState {
  return {
    tutorialMode: true,
    tutorialStep: TutorialStep.DRINK,
    quests: [],
    time: 0,
    ...overrides,
  } as unknown as GameState;
}

function guidePlayer(pee: number, poo: number, keys: number): Entity {
  return {
    alive: true,
    needs: { water: 50, food: 50, pee, poo, sleep: 50 },
    inventory: keys > 0 ? [{ defId: 'tut_cafe_key', count: keys }] : [],
  } as unknown as Entity;
}

test('tutorial guidance walks the linear chain in the order the tutorial plays', () => {
  // Fresh start: thirsty, needs still full — the sink is the only target.
  assert.equal(tutorialGuideStage(guideState({}), guidePlayer(50, 50, 0)), 'sink');

  // Drinking flips the step; the toilet takes over while the urge is still there.
  const afterDrink = guideState({ tutorialStep: TutorialStep.TOILET });
  assert.equal(tutorialGuideStage(afterDrink, guidePlayer(50, 50, 0)), 'toilet');

  // Relieved but no key yet — the key drop is next. The step does NOT advance here
  // in the shipped tutorial, so the stage must come from world state.
  assert.equal(tutorialGuideStage(afterDrink, guidePlayer(0, 0, 0)), 'key');

  // Key in the bag — the locked door.
  assert.equal(tutorialGuideStage(afterDrink, guidePlayer(0, 0, 1)), 'door');
});

test('tutorial guidance hands off to Ольга and stops once she gives the first quest', () => {
  const opened = guideState({ tutorialMode: false, tutorialStep: TutorialStep.DONE });
  assert.equal(tutorialGuideStage(opened, guidePlayer(0, 0, 1)), 'npc');

  const withQuest = guideState({
    tutorialMode: false,
    tutorialStep: TutorialStep.DONE,
    quests: [{ id: 1 }] as unknown as GameState['quests'],
  });
  assert.equal(tutorialGuideStage(withQuest, guidePlayer(0, 0, 1)), null);
});

test('tutorial guidance stays silent for runs that never started the tutorial', () => {
  const plainRun = guideState({ tutorialMode: false, tutorialStep: undefined });
  assert.equal(tutorialGuideStage(plainRun, guidePlayer(50, 50, 0)), null);

  // A loaded mid-run save with the tutorial long finished and quests in flight.
  const midRun = guideState({
    tutorialMode: false,
    tutorialStep: TutorialStep.DONE,
    quests: [{ id: 7 }] as unknown as GameState['quests'],
  });
  assert.equal(tutorialGuideStage(midRun, guidePlayer(20, 20, 0)), null);
});

test('guidance falls through to the active task once the tutorial is over', () => {
  resetTargetGuide();
  const npc = { id: 42, type: EntityType.NPC, alive: true, x: 12.5, y: 34.5 } as unknown as Entity;
  const world = { rooms: [], doors: new Map() } as unknown as Parameters<typeof guideTarget>[0];
  const player = guidePlayer(0, 0, 0);

  const state = guideState({
    tutorialMode: false,
    tutorialStep: TutorialStep.DONE,
    activeQuestId: 3,
    quests: [
      { id: 3, targetNpcId: 42, desc: 'Поговорить с сержантом Бариновым' },
      { id: 4, targetNpcId: 99, desc: 'Другое задание' },
    ] as unknown as GameState['quests'],
  });

  const target = guideTarget(world, state, [npc], player);
  assert.equal(target?.kind, 'quest');
  assert.equal(target?.x, 12.5);
  assert.equal(target?.y, 34.5);
  assert.equal(target?.label, 'ПОГОВОРИТЬ С СЕРЖАНТОМ БАРИНО…');

  // The quest marker is a route hint and must obey its UI toggle.
  resetTargetGuide();
  assert.equal(guideTarget(world, state, [npc], player, { questGuide: false }), null);
});

test('an unreachable task target draws nothing rather than pointing at a wall', () => {
  resetTargetGuide();
  const world = { rooms: [], doors: new Map() } as unknown as Parameters<typeof guideTarget>[0];
  const state = guideState({
    tutorialMode: false,
    tutorialStep: TutorialStep.DONE,
    activeQuestId: 5,
    quests: [{ id: 5, targetNpcId: 77, desc: 'Найти пропавшего' }] as unknown as GameState['quests'],
  });
  // The target NPC is not on this floor and no room resolves for the quest.
  assert.equal(guideTarget(world, state, [], guidePlayer(0, 0, 0)), null);
});
