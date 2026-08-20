/* Замок: роль сцены не имеет права попасть в A-Life и в сейв.
 *
 * Цикл AI пропускает `NpcRole.CINEMATIC_ACTOR` целиком. Пока роль живёт в кадре,
 * это пауза для одного человека; но записанная в персистентную личность, она
 * становится приговором: NPC возвращается из сейва живым снаружи и выключенным
 * из симуляции внутри — не сканирует, не ходит, не стреляет, не бежит.
 *
 * Попасть туда было проще простого: автосейв срабатывает, когда игрок сворачивает
 * вкладку, а сцена-пролог идёт больше двух минут и всё это время ничего не требует
 * от игрока.
 */

import test from 'node:test';
import assert from 'node:assert';

import {
  AIGoal,
  EntityType,
  Faction,
  NpcRole,
  Occupation,
  type Entity,
  type GameState,
} from '../src/core/types';
import {
  captureAlifeFloorState,
  getAlifeNpcRecordSnapshot,
  setAlifeState,
  alifeForSave,
} from '../src/systems/alife';

function buildState(): GameState {
  return {
    time: 0,
    tick: 0,
    currentZ: 0,
    clock: { hour: 8, minute: 0, totalMinutes: 480 },
    msgs: [],
    msgLog: [],
    recentEvents: [],
    importantEvents: [],
    zoneEvents: {},
  } as unknown as GameState;
}

function makeActor(alifeId: number): Entity {
  return {
    id: 5000 + alifeId,
    type: EntityType.NPC,
    x: 100.5, y: 100.5,
    angle: 0, pitch: 0,
    alive: true,
    speed: 1,
    sprite: Occupation.HUNTER,
    occupation: Occupation.HUNTER,
    name: 'Актёр сцены',
    hp: 100, maxHp: 100,
    faction: Faction.LIQUIDATOR,
    questId: -1,
    alifeId,
    // Человек играет в сцене, но по жизни он торговец.
    role: NpcRole.CINEMATIC_ACTOR,
    cinematicState: { originalRole: NpcRole.TRADER, originalX: 90, originalY: 90, sceneId: 'test' },
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  } as unknown as Entity;
}

test('scene role never reaches the persistent A-Life record', () => {
  const state = buildState();
  setAlifeState(state, { seed: 4242, count: 8, populationPlan: 'empty_packages' } as never);

  const actor = makeActor(1);
  captureAlifeFloorState(state, [actor]);

  const snapshot = getAlifeNpcRecordSnapshot(state, 1);
  assert.ok(snapshot, 'запись A-Life обязана существовать');
  assert.notEqual(
    snapshot!.role,
    NpcRole.CINEMATIC_ACTOR,
    'роль сцены в записи = человек навсегда вне цикла AI',
  );
  assert.equal(snapshot!.role, NpcRole.TRADER, 'в запись обязана уйти та роль, которой человек жил до сцены');
});

test('scene role survives neither save nor load', () => {
  const state = buildState();
  setAlifeState(state, { seed: 4242, count: 8, populationPlan: 'empty_packages' } as never);
  captureAlifeFloorState(state, [makeActor(2)]);

  const saved = alifeForSave(state);
  const reloaded = buildState();
  setAlifeState(reloaded, saved as never);

  const snapshot = getAlifeNpcRecordSnapshot(reloaded, 2);
  assert.ok(snapshot, 'запись обязана пережить круг сейв → загрузка');
  assert.notEqual(snapshot!.role, NpcRole.CINEMATIC_ACTOR, 'сцена не имеет права просачиваться через сейв');
});
