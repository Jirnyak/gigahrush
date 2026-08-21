/* Замок на порядок шагов стартового сиквенса.
 *
 * Шаг НЕ хранится в сейве: он выводится из состояния мира — из нужды и из того,
 * лежит ли ключ в сумке. Это и делает сиквенс устойчивым (перезагрузка ничего не
 * ломает, а разъехаться с делами игрока он не может), и это же делает его
 * неочевидным при чтении кода. Поэтому порядок зафиксирован тестом: раковина →
 * уборная → ключ → дверь → Ольга.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { type Entity, type GameState } from '../src/core/types';
import { TUTORIAL_START } from '../src/data/tutorial_start';
import { tutorialGuideStage } from '../src/systems/target_guide';
import { TutorialStep } from '../src/systems/tutorial';

function player(overrides: Partial<Entity> = {}): Entity {
  return {
    needs: { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 },
    inventory: [],
    ...overrides,
  } as unknown as Entity;
}

function state(overrides: Partial<GameState> = {}): GameState {
  return { tutorialMode: true, tutorialStep: TutorialStep.DRINK, quests: [], ...overrides } as unknown as GameState;
}

const urgent = TUTORIAL_START.toiletUrge + 1;

test('the guide walks the start in order: sink, toilet, key, door', () => {
  // Пока не попил — только раковина, даже если нужда уже поджимает.
  assert.equal(
    tutorialGuideStage(state(), player({ needs: { food: 100, water: 20, sleep: 100, pee: urgent, poo: 0 } })),
    'sink',
  );

  // Попил (шаг сдвинулся раковиной) — нужда выводит на уборную.
  assert.equal(
    tutorialGuideStage(
      state({ tutorialStep: TutorialStep.TOILET }),
      player({ needs: { food: 100, water: 100, sleep: 100, pee: urgent, poo: 0 } }),
    ),
    'toilet',
  );

  // Нужды нет, ключа нет — ключ. Счётчик шагов при этом НЕ двигается, и именно
  // поэтому решает состояние мира, а не он.
  assert.equal(tutorialGuideStage(state({ tutorialStep: TutorialStep.TOILET }), player()), 'key');

  // Ключ в сумке — дверь.
  assert.equal(
    tutorialGuideStage(
      state({ tutorialStep: TutorialStep.TOILET }),
      player({ inventory: [{ defId: TUTORIAL_START.keyId, count: 1 }] }),
    ),
    'door',
  );
});

test('after the door the guide hands the player to the tutor, then goes quiet', () => {
  // Туториал снят отпиранием двери, но передача не закончена, пока Ольга не
  // выдала первое дело.
  assert.equal(
    tutorialGuideStage(state({ tutorialMode: false, tutorialStep: TutorialStep.DONE }), player()),
    'npc',
  );
  assert.equal(
    tutorialGuideStage(
      state({ tutorialMode: false, tutorialStep: TutorialStep.DONE, quests: [{ id: 1 }] as never }),
      player(),
    ),
    null,
  );
  // Вне туториала и без шага гид молчит: дальше ведут дела, а не сиквенс.
  assert.equal(tutorialGuideStage(state({ tutorialMode: false, tutorialStep: undefined }), player()), null);
});
