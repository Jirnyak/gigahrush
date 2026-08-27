import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { Faction, MonsterKind, QuestType, type Quest } from '../src/core/types';
import { World } from '../src/core/world';
import { getPlotNpcNumericId } from '../src/data/npc_packages';
import { PLOT_CHAIN, applyPlotSampleLottery, plotSampleKindsForSeed } from '../src/data/plot';
import { getMonsterEcology } from '../src/data/monster_ecology';
import { checkQuests, offerQuest } from '../src/systems/quests';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

/* ── Средняя часть цепочки: блокада, руна, три образца ─────────────
 *
 * Перестановка цепочки — единственное место, где порядок шагов является
 * контрактом: `Quest.plotStepIndex` уходит в сейв числом, а шесть мест в коде
 * ждут конкретный шаг по номеру. Здесь заперты те свойства перестановки, из-за
 * которых она делалась, и жребий видов образцов, у которого своя ловушка:
 * значение обязано доехать до объекта квеста, иначе после загрузки цель пропадёт.
 */

const SAMPLE_TAG = 'nii_sample';

function stepIndexesWithTag(tag: string): number[] {
  const out: number[] = [];
  PLOT_CHAIN.forEach((step, index) => {
    if (step.eventTags?.includes(tag)) out.push(index);
  });
  return out;
}

function indexOfGiverStep(plotNpcId: string, type: QuestType, from = 0): number {
  const giver = getPlotNpcNumericId(plotNpcId);
  return PLOT_CHAIN.findIndex((step, index) => index >= from && step.giverId === giver && step.type === type);
}

test('блокада стоит между Яковом и Громным: Блинков, потом министр', () => {
  const yakovToBlinkov = PLOT_CHAIN.findIndex(step =>
    step.giverId === getPlotNpcNumericId('yakov')
    && step.targetNpcId === getPlotNpcNumericId('blinkov'));
  const blinkovToMinister = PLOT_CHAIN.findIndex(step =>
    step.giverId === getPlotNpcNumericId('blinkov')
    && step.targetNpcId === getPlotNpcNumericId('rotenbergov'));
  const ministerToGrom = PLOT_CHAIN.findIndex(step =>
    step.giverId === getPlotNpcNumericId('rotenbergov')
    && step.targetNpcId === getPlotNpcNumericId('major_grom'));

  assert.ok(yakovToBlinkov >= 0, 'Яков больше не отправляет прямо к Громному — он отправляет к Блинкову');
  assert.ok(blinkovToMinister > yakovToBlinkov, 'Блинков объясняет блокаду и шлёт наверх');
  assert.ok(ministerToGrom > blinkovToMinister, 'министр разводит руками и возвращает вниз');
});

test('ад стоит после НИИ, а министерство с патронами — до руны', () => {
  const ministryVisit = PLOT_CHAIN.findIndex(step => step.eventTags?.includes('zaslonov_betrayal')
    && step.type === QuestType.VISIT);
  const rune = PLOT_CHAIN.findIndex(step => step.targetItem === 'black_rune');
  const samples = stepIndexesWithTag(SAMPLE_TAG);
  const hell = PLOT_CHAIN.findIndex(step => step.eventTags?.includes('hell_holdout'));
  const podad = PLOT_CHAIN.findIndex(step => step.targetRoute?.designFloorId === 'podad');

  assert.ok(ministryVisit >= 0, 'шаг с министерством обязан публиковать тег предательства — по нему поднимается сцена');
  assert.ok(rune > ministryVisit, 'руна снимается с генерала после того, как он развернулся');
  assert.equal(samples.length, 3, 'образцов ровно три');
  assert.ok(samples[0] > rune, 'НИИ читает руну, а не наоборот');
  assert.ok(hell > samples[2], 'ад переехал в поздний гейм — после НИИ');
  assert.ok(podad > hell, 'подад по-прежнему за адом');
  assert.equal(PLOT_CHAIN.length, 27, 'длина цепочки — часть контракта сейва: менять только вместе с бампом формы');
});

test('шаг руны выдаёт себя сам: тому, кто мог бы его выдать, уже не до этого', () => {
  const rune = PLOT_CHAIN.findIndex(step => step.targetItem === 'black_rune');
  const step = PLOT_CHAIN[rune];
  assert.equal(step.giverId, undefined, 'дающего нет — генерал перешёл на другую сторону');
  assert.equal(step.type, QuestType.FETCH, 'первый шаг без дающего обязан быть FETCH (tests/plot-giverless-steps)');
  assert.ok(step.sourceLabel, 'без дающего шаг подписывается отправителем');
  assert.equal(step.rewardItem, 'black_rune', 'руна возвращается на руки: она нужна Якову и НИИ');
  assert.equal(rune, PLOT_CHAIN.findIndex(s => s.giverId === undefined), 'руна — ПЕРВЫЙ шаг без дающего');
});

test('жребий образцов детерминирован по сиду, не повторяется и берёт только спавнящиеся виды', () => {
  const a = plotSampleKindsForSeed(4242);
  const b = plotSampleKindsForSeed(4242);
  const c = plotSampleKindsForSeed(4243);

  assert.deepEqual(a, b, 'один сид — один жребий, иначе перезагрузка сменит цель');
  assert.equal(new Set(a).size, 3, 'три РАЗНЫХ вида: три одинаковых шага подряд — это не выборка');
  assert.notDeepEqual(a, c, 'разные прогоны получают разную охоту');
  for (const kind of a) {
    const ecology = getMonsterEcology(kind);
    assert.ok(ecology, `вид ${MonsterKind[kind]} обязан быть в реестре экологии`);
    assert.ok(ecology.spawnWeight > 0, `вид ${MonsterKind[kind]} с нулевым весом спавна не найти в мире`);
    assert.ok(MonsterKind[kind] !== undefined, 'вид обязан быть членом enum: санитайзер сейва срежет чужое число');
  }
});

test('разыгранный вид доезжает до объекта квеста, а не остаётся в шаге', () => {
  const seed = 90210;
  applyPlotSampleLottery(seed, kind => `вид-${MonsterKind[kind]}`);
  const expected = plotSampleKindsForSeed(seed);
  const firstSample = stepIndexesWithTag(SAMPLE_TAG)[0];
  const step = PLOT_CHAIN[firstSample];

  assert.equal(step.targetMonsterKind, expected[0]);
  assert.ok(!step.desc.includes('{вид}'), 'токен обязан быть подставлен: игрок не должен видеть заготовку');
  assert.ok(step.desc.includes(`вид-${MonsterKind[expected[0]]}`), 'имя вида названо прямо в поручении');

  const world = new World();
  const player = makeTestPlayer({ x: 10.5, y: 10.5 });
  const done: Quest[] = [];
  for (let i = 0; i < firstSample; i++) {
    done.push({
      id: i + 1, type: QuestType.FETCH, giverId: 1, giverName: 'тест',
      desc: 'сделано', plotStepIndex: i, done: true,
    } as Quest);
  }
  const state = makeGameState({ quests: done, nextQuestId: firstSample + 1 });
  (state as { floorRun?: { runSeed?: number } }).floorRun = { runSeed: seed };

  const giver = makeTestNpc({
    id: 77,
    x: 12.5, y: 10.5,
    alifeId: step.giverId,
    name: 'Завлаб Гущин',
    faction: Faction.SCIENTIST,
    canGiveQuest: true,
  });

  offerQuest(giver, player, world, [player, giver], state, []);
  const quest = state.quests.find(q => q.plotStepIndex === firstSample);
  assert.ok(quest, 'шаг с образцом выдаётся');
  assert.equal(quest.targetMonsterKind, expected[0], 'вид записан В КВЕСТ — только он переживает загрузку');

  checkQuests(player, world, [player, giver], state, []);
  assert.equal(quest.done, false, 'без убийства шаг не закрывается');
});

test('шаги с образцами идут подряд и каждый просит ровно одно убийство', () => {
  const samples = stepIndexesWithTag(SAMPLE_TAG);
  assert.deepEqual(samples, [samples[0], samples[0] + 1, samples[0] + 2], 'три подряд: движок не умеет трёх целей в одном квесте');
  const giver = getPlotNpcNumericId('nii_gushchin');
  for (const index of samples) {
    const step = PLOT_CHAIN[index];
    assert.equal(step.type, QuestType.KILL);
    assert.equal(step.giverId, giver, 'все три выдаёт завлаб НИИ');
    assert.equal(step.killNeeded, 1);
    assert.equal(step.rewardItem, 'mutant_tissue_sample');
    assert.equal(step.targetFloorZ, undefined, 'подсказки, где искать, нет — засчитывается на любом этаже');
    assert.equal(step.visitFloorZ, undefined);
  }
  const closing = indexOfGiverStep('nii_gushchin', QuestType.TALK, samples[2]);
  assert.ok(closing > samples[2], 'после третьего образца завлаб отправляет вниз');
});
