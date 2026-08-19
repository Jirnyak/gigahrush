import test from 'node:test';
import assert from 'node:assert/strict';

import { makeGameState } from './helpers';
import '../src/content';

import { DEMOS_EDGE_FRIEND, RELATION_HOSTILE_THRESHOLD } from '../src/data/demos_social';
import { initFactionRelations } from '../src/data/relations';
import { createEmptyDemosSocialSaveState } from '../src/systems/demos_save';
import { createPrefilledAlifeState, setAlifeNpcPlayerRelation } from '../src/systems/alife';
import {
  getDemosNpcOnlySocialEdges,
  getDemosRelationToPlayerSlot,
  setDemosSocialEdge,
} from '../src/systems/demos_social';
import { processDemosSocialFeedbackEvents } from '../src/systems/demos_social_feedback';
import { publishEvent } from '../src/systems/events';
import type { GameState } from '../src/core/types';

/* Смерть стоит ровно того, чем человек был для оставшихся: кто любил убитого —
 * на столько же ненавидит убийцу, кто ненавидел — на столько же теплеет.
 * Проверяем это как инвариант по фактическим связям жертвы, а не по
 * расставленным вручную числам: граф вправе перестраиваться. */

const VICTIM = 1;

function socialState(): GameState {
  initFactionRelations();
  const state = makeGameState();
  createPrefilledAlifeState(state, 909, 16, {
    buckets: [{ floorKey: 'design:living', z: 0, targetCount: 16, reserved: [] }],
  });
  (state as GameState & { demosSocial?: ReturnType<typeof createEmptyDemosSocialSaveState> }).demosSocial =
    createEmptyDemosSocialSaveState();
  return state;
}

function playerRelation(state: GameState, alifeId: number): number {
  return getDemosRelationToPlayerSlot(state, alifeId)?.relation ?? 0;
}

function killByPlayer(state: GameState, victimAlifeId: number): void {
  publishEvent(state, {
    type: 'player_kill_npc',
    severity: 4,
    privacy: 'local',
    tags: ['combat', 'kill', 'npc'],
    data: { targetAlifeId: victimAlifeId },
  });
  processDemosSocialFeedbackEvents(state, { ignoreCursor: true });
}

test('связь ставится парой: заявленная с одной стороны видна с обеих', () => {
  const state = socialState();
  setDemosSocialEdge(state, 2, 3, 90, DEMOS_EDGE_FRIEND);

  const back = getDemosNpcOnlySocialEdges(state, 3).find(edge => edge.targetAlifeId === 2);
  assert.ok(back, 'встречного ребра нет — граф остался направленным');
  assert.equal(back.relation, 90, 'число обязано быть одним на пару');
});

test('каждая связь убитого отвечает убийце ровно своим весом', () => {
  const state = socialState();
  const bonds = getDemosNpcOnlySocialEdges(state, VICTIM)
    .filter(edge => edge.targetAlifeId !== undefined && edge.relation !== 0)
    .map(edge => ({ id: edge.targetAlifeId as number, relation: edge.relation }));
  assert.ok(bonds.length >= 4, 'у жертвы слишком мало связей, опыт не показателен');

  // Ставим всех в ноль, чтобы полный вес связи гарантированно поместился в шкалу.
  for (const bond of bonds) setAlifeNpcPlayerRelation(state, bond.id, 0);
  const before = new Map(bonds.map(bond => [bond.id, playerRelation(state, bond.id)]));

  killByPlayer(state, VICTIM);

  for (const bond of bonds) {
    const delta = playerRelation(state, bond.id) - (before.get(bond.id) ?? 0);
    assert.equal(
      delta, -bond.relation,
      `связь ${bond.id} (${bond.relation}) ответила ${delta} — где-то делитель, потолок или молчаливый кап`,
    );
  }
});

test('убийство любимого делает врагом, убийство врага располагает', () => {
  const state = socialState();
  const bonds = getDemosNpcOnlySocialEdges(state, VICTIM)
    .filter(edge => edge.targetAlifeId !== undefined);
  const lover = bonds.find(edge => edge.relation > 0)?.targetAlifeId as number;
  const hater = bonds.find(edge => edge.relation < 0)?.targetAlifeId as number;
  assert.ok(lover !== undefined && hater !== undefined, 'нужны обе стороны связи');

  setAlifeNpcPlayerRelation(state, lover, 0);
  setAlifeNpcPlayerRelation(state, hater, 0);
  playerRelation(state, lover);
  playerRelation(state, hater);

  killByPlayer(state, VICTIM);

  assert.ok(playerRelation(state, lover) < 0, 'любивший убитого не охладел к убийце');
  assert.ok(playerRelation(state, hater) > 0, 'ненавидевший убитого не потеплел к убийце');
});

test('достаточно сильная привязанность переводит за черту вражды', () => {
  const state = socialState();
  const strongest = getDemosNpcOnlySocialEdges(state, VICTIM)
    .filter(edge => edge.targetAlifeId !== undefined)
    .reduce((best, edge) => edge.relation > (best?.relation ?? 0) ? edge : best, undefined as
      | ReturnType<typeof getDemosNpcOnlySocialEdges>[number]
      | undefined);
  assert.ok(strongest && strongest.relation >= -RELATION_HOSTILE_THRESHOLD,
    'у жертвы нет привязанности, способной перевести за порог');

  const mourner = strongest.targetAlifeId as number;
  setAlifeNpcPlayerRelation(state, mourner, 0);
  playerRelation(state, mourner);

  killByPlayer(state, VICTIM);

  assert.ok(playerRelation(state, mourner) <= RELATION_HOSTILE_THRESHOLD,
    'убийство близкого обязано делать врагом, а не просто огорчать');
});

test('весть об убийстве не расходится дальше прямых связей', () => {
  const state = socialState();
  const victimBonds = new Set(
    getDemosNpcOnlySocialEdges(state, VICTIM).map(edge => edge.targetAlifeId),
  );
  const stranger = [...Array(16).keys()]
    .map(i => i + 1)
    .find(id => id !== VICTIM && !victimBonds.has(id));
  assert.ok(stranger !== undefined, 'все записи оказались связаны с жертвой');
  const before = playerRelation(state, stranger);

  killByPlayer(state, VICTIM);

  assert.equal(playerRelation(state, stranger), before, 'посторонний узнал о смерти');
});
