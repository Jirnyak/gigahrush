/* Закон «насилие двигает репутацию» и его единственный ограничитель.
 *
 * Две половины одной механики, и вводятся они только вместе:
 *
 *  1. Удар и убийство по члену чужой фракции двигают отношение — у жертвы и у
 *     всех, кто это видел. Атакующий — это его ФРАКЦИЯ, отдельного пути для
 *     игрока нет.
 *  2. Живое число медленно тянется обратно к рождению. Без этого любая обида
 *     вечна: влить в неё можно бесконечно, вылить нечем, и долгий прогон
 *     неизбежно сползает во всеобщую войну.
 *
 * Замок именно на паре: свидетели без затухания множат существующий раскрут
 * (личная ячейка падала на −1 за каждое попадание, база LIQ→CIT −24, порог
 * вражды −64, то есть сорок попаданий — восемь секунд ножом).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, Faction, Occupation, type Entity, type GameState } from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import {
  RELATION_DECAY_SHIFT,
  addFactionRelMutual,
  decayFactionMatrixTowardBase,
  factionBaseRelation,
  getFactionRel,
  applyTheftRelationPenalty,
  initFactionRelations,
  npcFactionAttitudeAtBirth,
  relationDecayStep,
} from '../src/data/relations';
import {
  addAlifeFactionAttitude,
  createPrefilledAlifeState,
  decayAlifeRelations,
  existingAlifeFactionAttitudes,
  getAlifeNpcRecordSnapshot,
} from '../src/systems/alife';
import { floorKeyForDesign } from '../src/systems/floor_keys';
import {
  WITNESS_KILL_WEIGHT,
  applyDamageRelationPenalty,
  combatSideOf,
  setFactionsSocialContext,
} from '../src/systems/factions';
import { applyDemosRelationDelta, setDemosSocialEdge } from '../src/systems/demos_social';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { setNpcPlayerRelation } from '../src/systems/npc_relations';
import { notifyActorDamaged, resetCombatStimulus } from '../src/systems/combat_stimulus';
import { QUEST_FACTION_RELATION_DELTA } from '../src/systems/npc_relations';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { createWorldEventState } from '../src/systems/events';
import { decayRelationsTick, resetRelationDecay } from '../src/systems/relation_decay';
import { makeGameState, makeTestNpc, makeTestEntity, addTestRoom } from './helpers';
import { EntityType } from '../src/core/types';

const FLOOR_KEY = floorKeyForDesign('living');
/** Одна комната на всех: свидетелем считается только сосед по комнате. */
const ROOM = { id: 0, x: 4, y: 4, w: 24, h: 24 };

function openWorld(): World {
  const world = new World();
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) world.set(x, y, Cell.FLOOR);
  addTestRoom(world, ROOM);
  return world;
}

function ai() {
  return { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 10 };
}

/** Трое: житель-жертва, ликвидатор-обидчик и житель-свидетель. */
function socialState(): GameState {
  seedGlobalRng(20260827);
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  createPrefilledAlifeState(state, 909, 3, {
    buckets: [{
      floorKey: FLOOR_KEY,
      z: 0,
      targetCount: 3,
      reserved: [
        { name: 'Жертва', faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
        { name: 'Обидчик', faction: Faction.LIQUIDATOR, occupation: Occupation.WORKER, level: 3 },
        { name: 'Свидетель', faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
      ],
    }],
  });
  setFactionsSocialContext(state);
  return state;
}

function cell(state: GameState, alifeId: number, faction: Faction): number {
  return existingAlifeFactionAttitudes(state)![(alifeId - 1) * 8 + faction];
}

function person(id: number, alifeId: number, faction: Faction, x: number): Entity {
  return makeTestNpc({ id, alifeId, faction, name: `Тело ${id}`, x, y: 10, hp: 60, maxHp: 60, ai: ai() });
}

test.beforeEach(() => {
  initFactionRelations();
  resetCombatStimulus();
  resetRelationDecay();
});

test.afterEach(() => {
  setFactionsSocialContext(undefined);
  resetCombatStimulus();
});

/* ── Свидетели ────────────────────────────────────────────────────── */

test('свидетель платит за ЛЮБОГО обидчика, а не только за руку игрока', () => {
  const state = socialState();
  const world = openWorld();
  const victim = person(101, 1, Faction.CITIZEN, 10);
  const attacker = person(102, 2, Faction.LIQUIDATOR, 11);
  const witness = person(103, 3, Faction.CITIZEN, 12);
  rebuildEntityIndexForSimulation([victim, attacker, witness], 1);

  const before = cell(state, 3, Faction.LIQUIDATOR);
  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', 1, state);
  assert.equal(
    cell(state, 3, Faction.LIQUIDATOR),
    before - QUEST_FACTION_RELATION_DELTA,
    'сосед по комнате запомнил ликвидаторов на ступень хуже',
  );
});

test('убийство весит вчетверо против удара — и то, и другое для свидетеля', () => {
  const state = socialState();
  const world = openWorld();
  const victim = person(101, 1, Faction.CITIZEN, 10);
  const attacker = person(102, 2, Faction.LIQUIDATOR, 11);
  const witness = person(103, 3, Faction.CITIZEN, 12);
  rebuildEntityIndexForSimulation([victim, attacker, witness], 1);

  const before = cell(state, 3, Faction.LIQUIDATOR);
  victim.hp = 0;
  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', 1, state);
  assert.equal(
    cell(state, 3, Faction.LIQUIDATOR),
    before - QUEST_FACTION_RELATION_DELTA * WITNESS_KILL_WEIGHT,
  );
});

test('смерть опрашивает свидетелей даже посреди уже идущей схватки', () => {
  const state = socialState();
  const world = openWorld();
  const victim = person(101, 1, Faction.CITIZEN, 10);
  const attacker = person(102, 2, Faction.LIQUIDATOR, 11);
  const witness = person(103, 3, Faction.CITIZEN, 12);
  rebuildEntityIndexForSimulation([victim, attacker, witness], 1);

  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', 1, state);
  const afterFirst = cell(state, 3, Faction.LIQUIDATOR);
  // Второе попадание в той же схватке свидетелей не тревожит: боевая память жива.
  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', 1.2, state);
  assert.equal(cell(state, 3, Faction.LIQUIDATOR), afterFirst, 'очередь не стоит восьми репутаций');
  // А смерть — тревожит, и по своей цене.
  victim.hp = 0;
  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', 1.4, state);
  assert.equal(
    cell(state, 3, Faction.LIQUIDATOR),
    afterFirst - QUEST_FACTION_RELATION_DELTA * WITNESS_KILL_WEIGHT,
  );
});

test('свидетель своей фракции не платит: принадлежность — не мнение', () => {
  const state = socialState();
  const world = openWorld();
  // Бьёт житель — свидетель тоже житель.
  const victim = person(101, 2, Faction.LIQUIDATOR, 10);
  const attacker = person(102, 1, Faction.CITIZEN, 11);
  const witness = person(103, 3, Faction.CITIZEN, 12);
  rebuildEntityIndexForSimulation([victim, attacker, witness], 1);

  const before = cell(state, 3, Faction.CITIZEN);
  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', 1, state);
  assert.equal(cell(state, 3, Faction.CITIZEN), before);
});

test('экология счёта не открывает: у монстра без стороны репутации нет', () => {
  const state = socialState();
  const world = openWorld();
  const victim = person(101, 1, Faction.CITIZEN, 10);
  const witness = person(103, 3, Faction.CITIZEN, 12);
  const beast = makeTestEntity({
    id: 104, type: EntityType.MONSTER, faction: Faction.WILD, name: 'Тварь',
    x: 11, y: 10, hp: 40, maxHp: 40, ai: ai(),
  });
  rebuildEntityIndexForSimulation([victim, beast, witness], 1);

  assert.equal(combatSideOf(beast), undefined, 'обычная экология стороны не имеет');
  const before = cell(state, 3, Faction.WILD);
  notifyActorDamaged(world, victim, beast, 20, 'monster_melee', 1, state);
  assert.equal(cell(state, 3, Faction.WILD), before, 'укус крысы не портит мнение о диких');
});

/* ── Затухание ────────────────────────────────────────────────────── */

test('шаг затухания — четверть отклонения, и мёртвая зона берётся из неё же', () => {
  assert.equal(relationDecayStep(0, 0), 0);
  // Всё, что меньше 1 << SHIFT, не рассасывается вовсе.
  const deadband = 1 << RELATION_DECAY_SHIFT;
  for (let drift = 1; drift < deadband; drift++) {
    assert.equal(relationDecayStep(drift, 0), 0, `дрейф ${drift} в мёртвой зоне`);
    assert.equal(relationDecayStep(-drift, 0), 0, `дрейф −${drift} в мёртвой зоне`);
  }
  assert.equal(relationDecayStep(-40, 0), 10, 'тянет вверх к базе');
  assert.equal(relationDecayStep(40, 0), -10, 'и вниз к ней же');
  assert.equal(relationDecayStep(-24, -64), -10, 'база не обязана быть нулём');
});

test('личная ячейка возвращается к рождению, и приходит именно туда', () => {
  const state = socialState();
  const born = npcFactionAttitudeAtBirth(Faction.CITIZEN, Faction.LIQUIDATOR, 909, 1);
  assert.equal(cell(state, 1, Faction.LIQUIDATOR), born);
  addAlifeFactionAttitude(state, 1, Faction.LIQUIDATOR, -60);
  assert.equal(cell(state, 1, Faction.LIQUIDATOR), born - 60);

  const deadband = 1 << RELATION_DECAY_SHIFT;
  let visits = 0;
  for (; visits < 64; visits++) {
    const budget = { remaining: 64 };
    const step = decayAlifeRelations(state, FLOOR_KEY, 0, 64, budget);
    if (step.moved === 0) break;
  }
  assert.ok(visits > 0 && visits < 24, `дрейф −60 рассасывается за ${visits} визитов`);
  // Приходит именно к рождению, с точностью до мёртвой зоны, и там встаёт.
  assert.ok(born - cell(state, 1, Faction.LIQUIDATOR) < deadband, 'вернулось к рождению');
});

test('бюджет списывается только за реальный сдвиг', () => {
  const state = socialState();
  addAlifeFactionAttitude(state, 1, Faction.LIQUIDATOR, -60);
  const budget = { remaining: 8 };
  const moved = decayAlifeRelations(state, FLOOR_KEY, 0, 64, budget);
  assert.equal(moved.moved, 1, 'сдвинулась ровно одна ячейка');
  assert.equal(budget.remaining, 7, 'и списана ровно одна единица бюджета');
  // Нетронутые записи бюджета не стоят вовсе, сколько бы их ни просмотрели.
  const idle = { remaining: 8 };
  decayAlifeRelations(state, FLOOR_KEY, moved.nextCursor, 64, idle);
  assert.ok(idle.remaining >= 7, 'упор в мёртвую зону не платит');
});

test('нетронутые записи обход пропускает: работа идёт только по дрейфу', () => {
  const state = socialState();
  const budget = { remaining: 64 };
  const clean = decayAlifeRelations(state, FLOOR_KEY, 0, 64, budget);
  assert.equal(clean.moved, 0);
  assert.equal(budget.remaining, 64, 'свежий этаж затуханию ничего не стоит');
  assert.ok(clean.scanned > 0, 'бакет при этом всё-таки просмотрен');
});

test('матрица тянется к базе, а награда в одну единицу переживает затухание', () => {
  initFactionRelations();
  // Резня увела пару далеко от базы.
  addFactionRelMutual(Faction.PLAYER, Faction.CITIZEN, -80);
  const base = factionBaseRelation(Faction.PLAYER, Faction.CITIZEN);
  assert.ok(getFactionRel(Faction.PLAYER, Faction.CITIZEN) < base - 32);
  for (let i = 0; i < 32; i++) decayFactionMatrixTowardBase();
  assert.ok(
    getFactionRel(Faction.PLAYER, Faction.CITIZEN) > base - (1 << RELATION_DECAY_SHIFT),
    'мир остыл почти до базы',
  );

  // А заслуга в одну ступень лежит в мёртвой зоне и не рассасывается никогда.
  initFactionRelations();
  addFactionRelMutual(Faction.PLAYER, Faction.SCIENTIST, QUEST_FACTION_RELATION_DELTA);
  const earned = getFactionRel(Faction.PLAYER, Faction.SCIENTIST);
  for (let i = 0; i < 64; i++) decayFactionMatrixTowardBase();
  assert.equal(getFactionRel(Faction.PLAYER, Faction.SCIENTIST), earned);
});

test('такт затухания двигает оба канала разом', () => {
  const state = socialState();
  addAlifeFactionAttitude(state, 1, Faction.LIQUIDATOR, -60);
  addFactionRelMutual(Faction.PLAYER, Faction.CITIZEN, -80);
  const result = decayRelationsTick(state, 64);
  assert.equal(result.cells, 1);
  assert.ok(result.matrix >= 2, 'обе стороны пары двинулись');
  assert.ok(result.scanned > 0);
});

/* ── Игрок в общем законе ─────────────────────────────────────────── */

test('удар игрока глобальную матрицу больше не двигает', () => {
  const state = socialState();
  const world = openWorld();
  const victim = person(101, 1, Faction.CITIZEN, 10);
  const player = makeTestNpc({
    id: 900_001, alifeId: undefined, faction: Faction.PLAYER, name: 'Вы',
    x: 11, y: 10, hp: 100, maxHp: 100, karma: 0,
  });
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation([victim, player], 1);

  const before = getFactionRel(Faction.PLAYER, Faction.CITIZEN);
  const personalBefore = getAlifeNpcRecordSnapshot(state, 1)!.playerRelation;
  applyDamageRelationPenalty(Faction.PLAYER, Faction.CITIZEN, 40, victim, player, state);
  assert.equal(getFactionRel(Faction.PLAYER, Faction.CITIZEN), before, 'фракция как целое не вздрагивает');
  assert.equal(getFactionRel(Faction.CITIZEN, Faction.PLAYER), before, 'и с обратной стороны тоже');
  // Личное — двигается, и в этом весь смысл: цена насилия стала местной.
  assert.equal(victim.playerRelation, personalBefore - 8, 'жертва запомнила сама, −1 за каждые пять урона');
  setCurrentPlayerEntity(undefined);
});

test('фракции по-прежнему помнят кражу: у целого остались договор и имущество', () => {
  initFactionRelations();
  const before = getFactionRel(Faction.CITIZEN, Faction.PLAYER);
  const penalty = applyTheftRelationPenalty(Faction.CITIZEN, true, false);
  assert.equal(penalty, -4);
  assert.equal(getFactionRel(Faction.CITIZEN, Faction.PLAYER), before - 4);
});

test('отношение к игроку затухает тем же законом — и в записи, и в живом теле', () => {
  const state = socialState();
  const body = person(101, 1, Faction.CITIZEN, 10);
  const born = getAlifeNpcRecordSnapshot(state, 1)!.playerRelation;

  // Резня: −40 к личному отношению одного свидетеля.
  const hit = applyDemosRelationDelta(state, 1, { targetKind: 'player' }, -40, { reasonTag: 'damage' });
  assert.equal(hit?.changed, true);
  setNpcPlayerRelation(body, hit!.relation);
  assert.equal(body.playerRelation, born - 40);

  let ticks = 0;
  for (; ticks < 64; ticks++) {
    const result = decayRelationsTick(state, 64, [body]);
    if (result.cells === 0) break;
  }
  assert.ok(ticks > 0 && ticks < 24, `остывает за ${ticks} тактов`);
  const cooled = getAlifeNpcRecordSnapshot(state, 1)!.playerRelation;
  assert.ok(born - cooled < (1 << RELATION_DECAY_SHIFT), 'запись вернулась к рождению');
  assert.equal(body.playerRelation, cooled, 'живое тело не осталось при своём старом числе');
});

test('затухание не разносится по кругу знакомых: остывание — не новость', () => {
  const state = socialState();
  // Близкий круг у первого есть, и обычная дельта по нему расходится: это
  // проверяет соседний тест графа. Здесь важно обратное — что ОСТЫВАНИЕ по
  // нему не идёт, иначе затухание само себя размножало бы по всему этажу.
  assert.equal(setDemosSocialEdge(state, 1, 3, 96), true);
  applyDemosRelationDelta(state, 1, { targetKind: 'player' }, -40, {
    reasonTag: 'damage',
    propagate: false,
  });
  const neighbourBefore = getAlifeNpcRecordSnapshot(state, 3)!.playerRelation;
  const result = decayRelationsTick(state, 64);
  assert.ok(result.cells > 0, 'первому было что остужать');
  assert.equal(getAlifeNpcRecordSnapshot(state, 3)!.playerRelation, neighbourBefore, 'соседа не двинуло');
});
