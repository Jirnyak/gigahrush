import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world';
import {
  AIGoal,
  Cell,
  EntityType,
  Faction,
  Occupation,
  type Entity,
  type GameState,
} from '../src/core/types';
import {
  alifeForSave,
  createPrefilledAlifeState,
  getAlifeNpcFactionOverride,
  getAlifeNpcRecordSnapshot,
  materializeAlifeFloorPopulation,
  rewriteAlifeNpcIdentityFromEntity,
  setAlifeNpcFactionOverride,
  setAlifeState,
  type AlifePopulationPlan,
} from '../src/systems/alife';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { initFactionRelations } from '../src/data/relations';

/* Событийная принадлежность личности: она сильнее анкеты пакета и обязана
 * пережить и перегенерацию этажа, и круг сейв → загрузка. Проверяется общая
 * механика, а не чей-то конкретный переход: «личность 1 сменила сторону». */

const FLOOR_KEY = 'design:ministry';

/* Анкета пакета: сторона, с которой человек РОДИЛСЯ. Именно её тело сюжетного
 * NPC получает заново на каждой генерации этажа. */
const PACKAGE_FACTION = Faction.LIQUIDATOR;
const DEFECTED_FACTION = Faction.CULTIST;

const PLAN: AlifePopulationPlan = {
  buckets: [{
    floorKey: FLOOR_KEY,
    z: 30,
    targetCount: 4,
    reserved: [{
      id: 'npc:override_probe',
      kind: 'authored',
      presence: 'population',
      name: 'Генерал Проверкин',
      faction: PACKAGE_FACTION,
      occupation: Occupation.SOLDIER,
      age: 52,
      sex: 'male',
    }],
  }],
};

function freshState(): GameState {
  initFactionRelations();
  const state = { currentZ: 30, time: 0, clock: { hour: 8, minute: 0, totalMinutes: 480 } } as GameState;
  setFloorRunState(state, undefined);
  return state;
}

function seededState(): GameState {
  const state = freshState();
  createPrefilledAlifeState(state, 4242, 4, PLAN);
  return state;
}

/** Тело, каким его рождает пакет: анкетная фракция плюс слот личности. */
function packageBody(alifeId: number, x = 10.5, y = 10.5): Entity {
  return {
    id: 900 + alifeId,
    alifeId,
    type: EntityType.NPC,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1.2,
    sprite: Occupation.SOLDIER,
    name: 'Генерал Проверкин',
    hp: 100,
    maxHp: 100,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    faction: PACKAGE_FACTION,
    occupation: Occupation.SOLDIER,
    questId: -1,
  };
}

function floorWorld(): World {
  const world = new World();
  world.cells[world.idx(10, 10)] = Cell.FLOOR;
  world.cells[world.idx(11, 10)] = Cell.FLOOR;
  return world;
}

test('событийная принадлежность переживает перегенерацию этажа', () => {
  const state = seededState();
  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.faction, PACKAGE_FACTION);

  assert.equal(setAlifeNpcFactionOverride(state, 1, DEFECTED_FACTION), true);
  assert.equal(getAlifeNpcFactionOverride(state, 1), DEFECTED_FACTION);
  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.faction, DEFECTED_FACTION);

  // Этаж собран заново: тело пришло из пакета со СТАРОЙ стороной.
  const entities: Entity[] = [packageBody(1)];
  materializeAlifeFloorPopulation(state, floorWorld(), entities, { v: 500 }, FLOOR_KEY);

  const body = entities.find(entity => entity.alifeId === 1);
  assert.ok(body);
  assert.equal(body.faction, DEFECTED_FACTION);
  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.faction, DEFECTED_FACTION);
});

test('привязка тела к записи не возвращает анкетную фракцию', () => {
  const state = seededState();
  setAlifeNpcFactionOverride(state, 1, DEFECTED_FACTION);

  const body = packageBody(1);
  rewriteAlifeNpcIdentityFromEntity(state, body);

  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.faction, DEFECTED_FACTION);
  assert.equal(body.faction, DEFECTED_FACTION);
});

test('без оверрайда фракция по-прежнему приезжает из тела', () => {
  const state = seededState();
  const body = packageBody(2);
  body.faction = Faction.SCIENTIST;

  rewriteAlifeNpcIdentityFromEntity(state, body);

  assert.equal(getAlifeNpcFactionOverride(state, 2), undefined);
  assert.equal(getAlifeNpcRecordSnapshot(state, 2)?.faction, Faction.SCIENTIST);

  // И на этаж такое тело выходит нетронутым: чинить нечего.
  const entities: Entity[] = [packageBody(2)];
  materializeAlifeFloorPopulation(state, floorWorld(), entities, { v: 600 }, FLOOR_KEY);
  assert.equal(entities.find(entity => entity.alifeId === 2)?.faction, PACKAGE_FACTION);
});

test('оверрайд переживает круг сейв → загрузка', () => {
  const state = seededState();
  setAlifeNpcFactionOverride(state, 1, DEFECTED_FACTION);

  const payload = JSON.parse(JSON.stringify(alifeForSave(state)));
  assert.deepEqual(payload.factionOverrides, [1, DEFECTED_FACTION]);

  const loaded = freshState();
  setAlifeState(loaded, payload, { populationPlan: PLAN });

  assert.equal(getAlifeNpcFactionOverride(loaded, 1), DEFECTED_FACTION);
  assert.equal(getAlifeNpcRecordSnapshot(loaded, 1)?.faction, DEFECTED_FACTION);

  const entities: Entity[] = [packageBody(1)];
  materializeAlifeFloorPopulation(loaded, floorWorld(), entities, { v: 700 }, FLOOR_KEY);
  assert.equal(entities.find(entity => entity.alifeId === 1)?.faction, DEFECTED_FACTION);
});

test('снятый оверрайд возвращает личность общему правилу', () => {
  const state = seededState();
  setAlifeNpcFactionOverride(state, 1, DEFECTED_FACTION);
  setAlifeNpcFactionOverride(state, 1, undefined);

  assert.equal(getAlifeNpcFactionOverride(state, 1), undefined);
  assert.equal(alifeForSave(state).factionOverrides, undefined);

  const body = packageBody(1);
  rewriteAlifeNpcIdentityFromEntity(state, body);
  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.faction, PACKAGE_FACTION);
});

test('санитайзер отбрасывает мусор в оверрайдах принадлежности', () => {
  const state = seededState();
  const payload = alifeForSave(state) as Record<string, unknown>;
  payload.factionOverrides = [
    999_999, Faction.CULTIST,   // слота нет — и прижимать номер к границе нельзя
    0, Faction.CULTIST,         // слоты начинаются с единицы
    -3, Faction.CULTIST,
    2, 99,                      // такой фракции не существует
    3, -1,
    1.5, Faction.CULTIST,       // не целое
    2, Number.NaN,
    4,                          // хвост без пары
  ];

  const loaded = freshState();
  setAlifeState(loaded, JSON.parse(JSON.stringify(payload)), { populationPlan: PLAN });

  for (let id = 1; id <= 4; id++) assert.equal(getAlifeNpcFactionOverride(loaded, id), undefined);
  assert.equal(getAlifeNpcRecordSnapshot(loaded, 1)?.faction, PACKAGE_FACTION);
  assert.equal(alifeForSave(loaded).factionOverrides, undefined);
});

test('несуществующий слот оверрайду не поддаётся', () => {
  const state = seededState();
  assert.equal(setAlifeNpcFactionOverride(state, 0, DEFECTED_FACTION), false);
  assert.equal(setAlifeNpcFactionOverride(state, 10_000, DEFECTED_FACTION), false);
  assert.equal(alifeForSave(state).factionOverrides, undefined);
});
