import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, Faction, FloorLevel, Occupation, type Entity, type GameState } from '../src/core/types';
import {
  DEMOS_EDGE_DEBT,
  DEMOS_EDGE_ENEMY,
  DEMOS_EDGE_FRIEND,
  DEMOS_RELATION_EMPTY,
  DEMOS_RELATION_MAX,
  DEMOS_RELATION_MIN,
  DEMOS_SOCIAL_NPC_SLOTS,
  DemosSocialRoleId,
} from '../src/data/demos_social';
import { initFactionRelations } from '../src/data/relations';
import {
  captureAlifeFloorState,
  createPrefilledAlifeState,
  recordAlifeNpcDeath,
  type AlifePopulationReservedNpc,
} from '../src/systems/alife';
import {
  getDemosNpcOnlySocialEdges,
  getDemosOutgoingSocialEdges,
  getDemosRelationToPlayerSlot,
  getDemosSocialGraphStats,
} from '../src/systems/demos_social';

interface DemosSocialGraphDebug {
  targets: Uint32Array;
  relations: Int8Array;
}

function stateWithPopulation(seed: number, total: number, reserved: readonly AlifePopulationReservedNpc[] = []): GameState {
  initFactionRelations();
  const state = { currentFloor: FloorLevel.LIVING } as GameState;
  createPrefilledAlifeState(state, seed, total, {
    buckets: [{
      floorKey: 'story:living',
      floor: FloorLevel.LIVING,
      targetCount: total,
      reserved,
    }],
  });
  return state;
}

function debugGraph(state: GameState): DemosSocialGraphDebug {
  getDemosSocialGraphStats(state);
  return (state as GameState & { demosSocialGraph: DemosSocialGraphDebug }).demosSocialGraph;
}

function deadAlifeEntity(alifeId: number): Entity {
  return {
    id: 1000 + alifeId,
    type: EntityType.NPC,
    x: 0,
    y: 0,
    angle: 0,
    pitch: 0,
    alive: false,
    speed: 0,
    sprite: Occupation.HOUSEWIFE,
    name: `dead ${alifeId}`,
    alifeId,
    persistentNpcId: `alife:${alifeId}`,
    faction: Faction.CITIZEN,
    hp: 0,
    maxHp: 10,
    inventory: [],
  };
}

test('Demos social graph is deterministic for the same A-Life seed and state', () => {
  const state = stateWithPopulation(101, 32);
  const first = getDemosNpcOnlySocialEdges(state, 7);
  const second = getDemosNpcOnlySocialEdges(state, 7);
  assert.deepEqual(second, first);

  const sameSeed = stateWithPopulation(101, 32);
  assert.deepEqual(getDemosNpcOnlySocialEdges(sameSeed, 7), first);
});

test('Demos social graph changes at least some edges for a different seed', () => {
  const first = Array.from(debugGraph(stateWithPopulation(201, 48)).targets);
  const second = Array.from(debugGraph(stateWithPopulation(202, 48)).targets);
  assert.notDeepEqual(second, first);
});

test('Demos social graph stores only valid directed NPC targets and relation bytes', () => {
  const total = 40;
  const state = stateWithPopulation(303, total);
  for (let alifeId = 1; alifeId <= total; alifeId++) {
    const seen = new Set<number>();
    const edges = getDemosNpcOnlySocialEdges(state, alifeId);
    assert.ok(edges.length <= DEMOS_SOCIAL_NPC_SLOTS);
    for (const edge of edges) {
      assert.equal(edge.targetKind, 'alife');
      assert.notEqual(edge.slot, 0);
      assert.ok(edge.targetAlifeId !== undefined);
      assert.ok(edge.targetAlifeId > 0 && edge.targetAlifeId <= total);
      assert.notEqual(edge.targetAlifeId, alifeId);
      assert.equal(seen.has(edge.targetAlifeId), false);
      seen.add(edge.targetAlifeId);
      assert.ok(edge.relation >= DEMOS_RELATION_MIN && edge.relation <= DEMOS_RELATION_MAX);
    }
  }
});

test('Demos social graph leaves empty NPC slots with the -128 relation sentinel', () => {
  const graph = debugGraph(stateWithPopulation(404, 1));
  assert.equal(graph.targets.length, DEMOS_SOCIAL_NPC_SLOTS);
  for (let i = 0; i < graph.targets.length; i++) {
    assert.equal(graph.targets[i], 0);
    assert.equal(graph.relations[i], DEMOS_RELATION_EMPTY);
  }
});

test('Demos player relation is exposed as virtual public slot zero only', () => {
  const state = stateWithPopulation(505, 8, [{
    faction: Faction.CULTIST,
  }]);
  captureAlifeFloorState(state, [{ ...deadAlifeEntity(1), alive: true, hp: 10, playerRelation: -100 }]);
  const playerSlot = getDemosRelationToPlayerSlot(state, 1);
  assert.ok(playerSlot);
  assert.equal(playerSlot.slot, 0);
  assert.equal(playerSlot.targetKind, 'player');
  assert.equal(playerSlot.targetAlifeId, undefined);
  assert.equal(playerSlot.relation, DEMOS_RELATION_MIN);

  const outgoing = getDemosOutgoingSocialEdges(state, 1);
  assert.equal(outgoing[0].slot, 0);
  assert.equal(outgoing[0].targetKind, 'player');
  assert.equal(getDemosNpcOnlySocialEdges(state, 1).some(edge => edge.slot === 0 || edge.targetKind === 'player'), false);
});

test('Demos child records receive parent edges from controlled family state', () => {
  const state = stateWithPopulation(606, 4, [
    { name: 'Ребенок Демоса', occupation: Occupation.CHILD, age: 10, familyId: 77, faction: Faction.CITIZEN },
    { name: 'Родитель один', occupation: Occupation.DOCTOR, age: 34, familyId: 77, faction: Faction.CITIZEN },
    { name: 'Родитель два', occupation: Occupation.MECHANIC, age: 36, familyId: 77, faction: Faction.CITIZEN },
    { name: 'Сосед', occupation: Occupation.COOK, familyId: 88, faction: Faction.CITIZEN },
  ]);

  const childEdges = getDemosNpcOnlySocialEdges(state, 1);
  const parentEdges = childEdges.filter(edge => edge.role === DemosSocialRoleId.PARENT);
  assert.ok(parentEdges.length >= 1);
  assert.ok(parentEdges.some(edge => edge.targetAlifeId === 2 || edge.targetAlifeId === 3));
  assert.ok(getDemosNpcOnlySocialEdges(state, 2).some(edge => edge.targetAlifeId === 1 && edge.role === DemosSocialRoleId.CHILD));
});

test('Demos social parent candidates use age instead of occupation label', () => {
  const state = stateWithPopulation(616, 3, [
    { name: 'Младший', occupation: Occupation.CHILD, age: 11, familyId: 78, faction: Faction.CITIZEN },
    { name: 'Старший с детской меткой', occupation: Occupation.CHILD, age: 19, familyId: 78, faction: Faction.CITIZEN },
    { name: 'Взрослый механик', occupation: Occupation.MECHANIC, age: 40, familyId: 78, faction: Faction.CITIZEN },
  ]);

  const parentEdges = getDemosNpcOnlySocialEdges(state, 1).filter(edge => edge.role === DemosSocialRoleId.PARENT);
  assert.ok(parentEdges.some(edge => edge.targetAlifeId === 2));
  assert.ok(parentEdges.some(edge => edge.targetAlifeId === 3));
});

test('Demos dead family targets remain returnable as visible history edges', () => {
  const state = stateWithPopulation(707, 2, [
    { name: 'Ребенок с записью', occupation: Occupation.CHILD, age: 8, familyId: 91, faction: Faction.CITIZEN },
    { name: 'Мертвый родитель', occupation: Occupation.DOCTOR, age: 41, familyId: 91, faction: Faction.CITIZEN },
  ]);
  recordAlifeNpcDeath(state, deadAlifeEntity(2));

  const parent = getDemosNpcOnlySocialEdges(state, 1).find(edge => edge.targetAlifeId === 2);
  assert.ok(parent);
  assert.equal(parent.role, DemosSocialRoleId.PARENT);
  assert.equal(parent.hidden, false);
});

test('Demos social graph applies optional authored plot relations', () => {
  const state = stateWithPopulation(909, 7, [
    { kind: 'plot', plotNpcId: 'olga', name: 'Ольга Дмитриевна', faction: Faction.SCIENTIST, occupation: Occupation.DOCTOR },
    { kind: 'plot', plotNpcId: 'yakov', name: 'Яков Давидович', faction: Faction.SCIENTIST, occupation: Occupation.SCIENTIST },
    { kind: 'plot', plotNpcId: 'barni', name: 'Сержант Баринов', faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER },
    { kind: 'plot', plotNpcId: 'vanka', name: 'Ванька Банчиный', faction: Faction.CULTIST, occupation: Occupation.ALCOHOLIC },
    { kind: 'plot', plotNpcId: 'major_grom', name: 'Майор Громный', faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER },
    { kind: 'plot', plotNpcId: 'rotenbergov', name: 'Министр Ротенбергов', faction: Faction.CITIZEN, occupation: Occupation.DIRECTOR },
    { kind: 'plot', plotNpcId: 'f69_accountant_nil', name: 'Нил Расписочный', faction: Faction.CITIZEN, occupation: Occupation.STOREKEEPER },
  ]);

  const olgaToYakov = getDemosNpcOnlySocialEdges(state, 1).find(edge => edge.targetAlifeId === 2);
  const yakovToOlga = getDemosNpcOnlySocialEdges(state, 2).find(edge => edge.targetAlifeId === 1);
  const barniToOlga = getDemosNpcOnlySocialEdges(state, 3).find(edge => edge.targetAlifeId === 1);
  const vankaToYakov = getDemosNpcOnlySocialEdges(state, 4).find(edge => edge.targetAlifeId === 2);
  const gromToYakov = getDemosNpcOnlySocialEdges(state, 5).find(edge => edge.targetAlifeId === 2);
  const rotenbergovToNil = getDemosNpcOnlySocialEdges(state, 6).find(edge => edge.targetAlifeId === 7);

  assert.equal(olgaToYakov?.role, DemosSocialRoleId.FRIEND);
  assert.equal(olgaToYakov?.relation, 88);
  assert.equal((yakovToOlga?.flags ?? 0) & DEMOS_EDGE_FRIEND, DEMOS_EDGE_FRIEND);
  assert.equal(barniToOlga?.role, DemosSocialRoleId.PARTNER);
  assert.equal(vankaToYakov?.role, DemosSocialRoleId.ACQUAINTANCE);
  assert.equal(gromToYakov?.role, DemosSocialRoleId.ACQUAINTANCE);
  assert.equal(rotenbergovToNil?.role, DemosSocialRoleId.ENEMY);
  assert.equal((rotenbergovToNil?.flags ?? 0) & DEMOS_EDGE_ENEMY, DEMOS_EDGE_ENEMY);
  assert.equal((rotenbergovToNil?.flags ?? 0) & DEMOS_EDGE_DEBT, DEMOS_EDGE_DEBT);
});

test('Demos social stats report byte storage under five megabytes for 100k records', () => {
  const stats = getDemosSocialGraphStats(stateWithPopulation(808, 100_000));
  assert.equal(stats.totalRecords, 100_000);
  assert.equal(stats.npcSlots, DEMOS_SOCIAL_NPC_SLOTS);
  assert.equal(stats.heapBytesApprox, 100_000 * DEMOS_SOCIAL_NPC_SLOTS * 7);
  assert.ok(stats.heapBytesApprox < 5 * 1024 * 1024);
});
