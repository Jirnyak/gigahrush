import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Faction, Occupation, type GameState } from '../src/core/types';
import { PLOT_CHAIN } from '../src/data/plot';
import { initFactionRelations } from '../src/data/relations';
import {
  alifeMigrationApplied,
  createPrefilledAlifeState,
  currentAlifeFloorRecordIds,
  getAlifeNpcRecordSnapshot,
  type AlifePopulationPlan,
} from '../src/systems/alife';
import { publishEvent } from '../src/systems/events';
import { setFloorRunState } from '../src/systems/procedural_floors';
import {
  GARRISON_REINFORCEMENT_EVENT_TAGS,
  GARRISON_REINFORCEMENT_MIGRATION_ID,
} from '../src/gen/maintenance/garrison_reinforcement';

/* Смерть генерала видна в мире: гарнизон майора Громного в коллекторах
 * пополняется отрядом с Базы Ликвидаторов, и база на столько же редеет.
 *
 * Модуль ничего не спавнит и своего флага не держит — он зовёт общее переселение
 * A-Life. Здесь проверяется его сторона: за ЧТО он цепляется, что случается один
 * раз и что раньше времени не случается ничего. */

const DONOR = 'design:liquidatorbase';
const GARRISON = 'design:maintenance';
const DONOR_COUNT = 64;
const GARRISON_COUNT = 48;

const PLAN: AlifePopulationPlan = {
  buckets: [
    {
      floorKey: DONOR,
      z: -12,
      targetCount: DONOR_COUNT,
      factionWeights: [{ value: Faction.LIQUIDATOR, weight: 1 }],
      occupationWeights: [{ value: Occupation.HUNTER, weight: 1 }],
    },
    {
      floorKey: GARRISON,
      z: -26,
      targetCount: GARRISON_COUNT,
      factionWeights: [{ value: Faction.LIQUIDATOR, weight: 1 }],
      occupationWeights: [{ value: Occupation.MECHANIC, weight: 1 }],
    },
  ],
};

function freshState(): GameState {
  initFactionRelations();
  const state = {
    currentZ: 30,
    time: 0,
    tick: 0,
    clock: { hour: 8, minute: 0, totalMinutes: 480 },
    quests: [],
    msgs: [],
    msgLog: [],
  } as unknown as GameState;
  setFloorRunState(state, undefined);
  createPrefilledAlifeState(state, 4242, DONOR_COUNT + GARRISON_COUNT, PLAN);
  return state;
}

function liquidators(state: GameState, floorKey: string): number {
  let count = 0;
  for (const id of currentAlifeFloorRecordIds(state, floorKey)) {
    if (getAlifeNpcRecordSnapshot(state, id)?.faction === Faction.LIQUIDATOR) count++;
  }
  return count;
}

/** Шаг цепочки, на котором руна снята с генерала, — по СОДЕРЖАНИЮ, не по номеру. */
function runeStepTags(): string[] {
  const steps = PLOT_CHAIN.filter(step =>
    GARRISON_REINFORCEMENT_EVENT_TAGS.every(tag => step.eventTags?.includes(tag)));
  assert.equal(steps.length, 1, 'пара тегов обязана принадлежать ровно одному шагу цепочки');
  return [...(steps[0].eventTags ?? [])];
}

function completeStep(state: GameState, tags: readonly string[]): void {
  publishEvent(state, {
    type: 'quest_completed',
    severity: 4,
    privacy: 'public',
    actorFaction: Faction.LIQUIDATOR,
    tags: ['quest', 'completed', ...tags],
  });
}

test('до снятия руны гарнизон прежний', () => {
  const state = freshState();
  const donorBefore = liquidators(state, DONOR);
  const garrisonBefore = liquidators(state, GARRISON);

  // Соседний шаг цепочки — визит в министерство. Тег предательства на нём есть,
  // руны нет: пополнение по нему подниматься не должно.
  const betrayalOnly = PLOT_CHAIN.find(step =>
    step.eventTags?.includes('zaslonov_betrayal') && !step.eventTags.includes('black_rune'));
  assert.ok(betrayalOnly, 'шаг предательства без руны должен существовать');
  completeStep(state, betrayalOnly.eventTags ?? []);

  // И посторонние закрытые поручения тоже ничего не двигают.
  completeStep(state, ['ministry', 'design_route']);

  assert.equal(liquidators(state, DONOR), donorBefore);
  assert.equal(liquidators(state, GARRISON), garrisonBefore);
  assert.equal(alifeMigrationApplied(state, GARRISON_REINFORCEMENT_MIGRATION_ID), false);
});

test('руна снята — гарнизон пополнился, а донор на столько же обеднел', () => {
  const state = freshState();
  const donorBefore = liquidators(state, DONOR);
  const garrisonBefore = liquidators(state, GARRISON);

  completeStep(state, runeStepTags());

  const moved = garrisonBefore === 0 ? 0 : liquidators(state, GARRISON) - garrisonBefore;
  assert.ok(moved > 0, 'пополнение обязано быть заметным');
  assert.equal(donorBefore - liquidators(state, DONOR), moved, 'донор редеет ровно на приехавших');
  // Никто не появился из воздуха: сумма по двум этажам та же.
  assert.equal(
    liquidators(state, DONOR) + liquidators(state, GARRISON),
    donorBefore + garrisonBefore,
  );
  assert.equal(alifeMigrationApplied(state, GARRISON_REINFORCEMENT_MIGRATION_ID), true);

  // Игрок узнаёт об этом строкой в журнале, а не молча.
  assert.ok(state.msgs.some(m => m.text.includes('пополнение')), 'событие обязано быть видно игроку');
});

test('повторное срабатывание не приводит вторую волну', () => {
  const state = freshState();
  const tags = runeStepTags();
  completeStep(state, tags);
  const donorAfter = liquidators(state, DONOR);
  const garrisonAfter = liquidators(state, GARRISON);
  // Считаем только СВОИ строки: тот же факт мира читают и другие подписчики.
  const reports = (): number => state.msgs.filter(m => m.text.includes('пополнение')).length;
  assert.equal(reports(), 1);

  completeStep(state, tags);
  completeStep(state, tags);

  assert.equal(liquidators(state, DONOR), donorAfter);
  assert.equal(liquidators(state, GARRISON), garrisonAfter);
  assert.equal(reports(), 1, 'вторая волна не должна даже отчитываться');
});

test('модуль не помнит номеров шагов цепочки', () => {
  const source = readFileSync(new URL('../src/gen/maintenance/garrison_reinforcement.ts', import.meta.url), 'utf8');
  assert.equal(/PLOT_CHAIN\s*\[/.test(source), false, 'индексирование цепочки числом запрещено');
  assert.equal(/plotStepIndex/.test(source), false, 'номер шага цепочки в модуле не нужен');
  // Своего флага однократности тоже нет: её держит сама механика переселения.
  assert.equal(/\blet\b/.test(source), false, 'модуль не хранит собственного состояния');
});
