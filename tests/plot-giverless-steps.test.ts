import test from 'node:test';
import assert from 'node:assert/strict';

import { QuestType, type Quest } from '../src/core/types';
import { World } from '../src/core/world';
import { PLOT_CHAIN } from '../src/data/plot';
import { checkQuests } from '../src/systems/quests';
import { makeGameState, makeTestPlayer } from './helpers';

/* Пустота безлюдна: разговаривать там не с кем, поэтому три финальных шага
 * цепочки не имеют дающего вовсе — их выдаёт сама цепочка, как только закрыт
 * предыдущий шаг, и закрывает дело. Проверять надо механику, а не номера шагов:
 * цепочка вправе расти. */
const GIVERLESS_INDEX = PLOT_CHAIN.findIndex(step => step.giverId === undefined);

function doneQuestsBefore(index: number): Quest[] {
  const out: Quest[] = [];
  for (let i = 0; i < index; i++) {
    out.push({
      id: i + 1, type: QuestType.FETCH, giverId: 1, giverName: 'тест',
      desc: 'сделано', plotStepIndex: i, done: true,
    } as Quest);
  }
  return out;
}

test('шаг без дающего выдаётся сам, как только закрыт предыдущий', () => {
  assert.notEqual(GIVERLESS_INDEX, -1, 'в цепочке нет ни одного шага без дающего');
  const world = new World();
  const player = makeTestPlayer({ x: 10.5, y: 10.5 });
  const state = makeGameState({ quests: doneQuestsBefore(GIVERLESS_INDEX) });

  checkQuests(player, world, [player], state, []);

  const granted = state.quests.find(q => q.plotStepIndex === GIVERLESS_INDEX);
  assert.ok(granted, 'шаг не выдался сам');
  assert.equal(granted.giverless, true, 'шаг выдан цепочкой — дающего у него нет');

  // Повторный тик не должен выдавать его второй раз.
  checkQuests(player, world, [player], state, []);
  assert.equal(state.quests.filter(q => q.plotStepIndex === GIVERLESS_INDEX).length, 1);
});

test('пока предыдущий шаг не закрыт, ничего не выдаётся', () => {
  const world = new World();
  const player = makeTestPlayer({ x: 10.5, y: 10.5 });
  const state = makeGameState({ quests: doneQuestsBefore(Math.max(0, GIVERLESS_INDEX - 1)) });

  checkQuests(player, world, [player], state, []);

  assert.equal(state.quests.some(q => q.plotStepIndex === GIVERLESS_INDEX), false);
});

test('шаг без дающего закрывается делом, а не разговором', () => {
  const step = PLOT_CHAIN[GIVERLESS_INDEX];
  assert.equal(step.type, QuestType.FETCH, 'тест написан на предмет; для KILL нужен свой сценарий');
  const world = new World();
  const player = makeTestPlayer({
    x: 10.5, y: 10.5,
    inventory: [{ defId: step.targetItem!, count: step.targetCount ?? 1 }],
  });
  const state = makeGameState({ quests: doneQuestsBefore(GIVERLESS_INDEX) });

  checkQuests(player, world, [player], state, []);
  const granted = state.quests.find(q => q.plotStepIndex === GIVERLESS_INDEX);
  assert.ok(granted);

  checkQuests(player, world, [player], state, []);
  assert.equal(granted.done, true, 'предмет в руках — поручение закрыто, сдавать некому');
});
