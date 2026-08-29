/* Закон «насилие двигает репутацию».
 *
 * Удар и убийство двигают отношение — у жертвы и у всех, кто это ВИДЕЛ. Цена
 * местная: глобальную матрицу фракций бой не двигает ни от чьей руки, включая
 * руку игрока. Кого считать видевшим, решает линия взгляда, а не совпадение
 * номера комнаты.
 *
 * ПРАВКА 2026-08-29, три части — и каждая закрывала свой отказ закона:
 *
 *  1. ШКАЛА. Штраф считается долей снятого здоровья, а не абсолютным уроном.
 *     Прежняя форма (−1 за каждые пять урона) требовала сорока попаданий до
 *     порога вражды по жертве, умирающей за десять: враждебность по урону была
 *     недостижима арифметически, и жалоба «бью NPC, а они терпят» описывала
 *     ровно это. Половина полоски здоровья теперь проводит от любой дружбы,
 *     какую байт способен выразить, до вражды.
 *  2. ВИДИМОСТЬ. Свидетель — тот, у кого есть луч до места. Проверка «та же
 *     комната» была неверна в обе стороны разом: `roomMap = -1` стоит и в
 *     дверных клетках, и во всех коридорах, то есть была не «нет комнаты», а
 *     ОДНА псевдокомната на весь этаж.
 *  3. СВОЯ СТОРОНА. Совпадение фракций больше не отменяет цену удара. Оно
 *     отменяло её целиком — и это било по единственному случаю, когда игрок
 *     носит чужую нашивку: после смерти и вселения в жителя его удары по
 *     жителям не замечал никто.
 *
 * ЗАТУХАНИЯ БОЛЬШЕ НЕТ. Вторая половина этого файла запирала обратную тягу к
 * рождению (`relationDecayStep`, `decayAlifeRelations`, `relation_decay.ts`);
 * механизм снят целиком по решению владельца, и тесты сняты вместе с ним. Довод
 * в его пользу («влить в обиду можно бесконечно, вылить нечем») был измерен
 * тогда, когда бой ещё двигал глобальную матрицу; сейчас разгон перекрыт у
 * истока. Мир помнит навсегда — см. `src/data/relations.ts`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, Faction, Occupation, type Entity, type GameState } from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import {
  getFactionRel,
  applyTheftRelationPenalty,
  initFactionRelations,
} from '../src/data/relations';
import {
  createPrefilledAlifeState,
  existingAlifeFactionAttitudes,
  getAlifeNpcRecordSnapshot,
} from '../src/systems/alife';
import { floorKeyForDesign } from '../src/systems/floor_keys';
import {
  WITNESS_KILL_WEIGHT,
  applyDamageRelationPenalty,
  combatSideOf,
  damageRelationPenalty,
  setFactionsSocialContext,
} from '../src/systems/factions';
import { getDemosNpcOnlySocialEdges } from '../src/systems/demos_social';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { RELATION_HOSTILE_THRESHOLD, getNpcPlayerRelation, isNpcPlayerHostile } from '../src/systems/npc_relations';
import { notifyActorDamaged, resetCombatStimulus } from '../src/systems/combat_stimulus';
import { QUEST_FACTION_RELATION_DELTA } from '../src/systems/npc_relations';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { createWorldEventState } from '../src/systems/events';
import { makeGameState, makeTestNpc, makeTestEntity, addTestRoom } from './helpers';
import { EntityType } from '../src/core/types';

const FLOOR_KEY = floorKeyForDesign('living');
/** Комната на всех. Стены её самой и служат преградой в тесте видимости. */
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

/** Личное ребро графа Демоса «от кого → к кому», 0 — ребра нет. */
function edgeTo(state: GameState, fromAlifeId: number, toAlifeId: number): number {
  for (const edge of getDemosNpcOnlySocialEdges(state, fromAlifeId)) {
    if (edge.targetAlifeId === toAlifeId) return edge.relation;
  }
  return 0;
}

function person(id: number, alifeId: number, faction: Faction, x: number): Entity {
  return makeTestNpc({ id, alifeId, faction, name: `Тело ${id}`, x, y: 10, hp: 60, maxHp: 60, ai: ai() });
}

test.beforeEach(() => {
  initFactionRelations();
  resetCombatStimulus();
});

test.afterEach(() => {
  setFactionsSocialContext(undefined);
  setCurrentPlayerEntity(undefined);
  resetCombatStimulus();
});

/* ── Шкала ────────────────────────────────────────────────────────── */

test('цена удара — доля снятого здоровья, а не абсолютный урон', () => {
  const weak = makeTestEntity({ id: 1, type: EntityType.NPC, hp: 20, maxHp: 20 });
  const tough = makeTestEntity({ id: 2, type: EntityType.NPC, hp: 200, maxHp: 200 });
  /* Один и тот же урон стоит РАЗНОГО, и это весь смысл: десять по хилому — это
   * половина его жизни, по толстому — двадцатая часть. Прежняя форма считала их
   * одинаково обиженными. */
  assert.ok(damageRelationPenalty(10, weak) < damageRelationPenalty(10, tough));
});

test('половина полоски здоровья делает врагом кого угодно, даже преданного друга', () => {
  /* Гарантия, а не среднее. Размах взят от `RELATION_MAX` до порога вражды, то
   * есть от самой преданной дружбы, какую байт вообще способен выразить, —
   * поэтому проверять достаточно самого верхнего случая. */
  const victim = makeTestEntity({ id: 1, type: EntityType.NPC, hp: 100, maxHp: 100 });
  const half = damageRelationPenalty(50, victim);
  assert.ok(127 + half <= RELATION_HOSTILE_THRESHOLD,
    `с самой верхушки шкалы полполоски обязаны довести до вражды, а довели до ${127 + half}`);
  // Четверть полоски — ещё не вражда: избиение и убийство должны различаться.
  assert.ok(127 + damageRelationPenalty(25, victim) > RELATION_HOSTILE_THRESHOLD);
});

test('смерть считается снятой полоской целиком, чем бы ни добили', () => {
  const victim = makeTestEntity({ id: 1, type: EntityType.NPC, hp: 100, maxHp: 100 });
  /* Цена трупа есть цена жизни, а не цена последнего тычка. Добивающий удар в
   * единицу урона обязан стоить столько же, сколько удар во всю полоску. */
  assert.equal(damageRelationPenalty(1, victim, true), damageRelationPenalty(100, victim, false));
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
    'видевший сосед запомнил ликвидаторов на ступень хуже',
  );
});

test('свидетеля за стеной нет: считается луч, а не номер комнаты', () => {
  const state = socialState();
  const world = openWorld();
  /* Прежняя проверка сравнивала `roomMap`, и оба эти тела читались бы как одна
   * комната: `carveCorridor` вне комнат `roomMap` не пишет вовсе, а `stampRoom`
   * кладёт −1 в стенное кольцо. Псевдокомната −1 сводила весь этаж в одну.  */
  const victim = person(101, 1, Faction.CITIZEN, 10);
  const attacker = person(102, 2, Faction.LIQUIDATOR, 11);
  const outside = person(103, 3, Faction.CITIZEN, 14);
  // Все трое стоят на одной строке y=10, поэтому одна клетка бетона между ними
  // и есть вся преграда: луч идёт ровно по этим клеткам.
  world.set(12, 10, Cell.WALL);
  rebuildEntityIndexForSimulation([victim, attacker, outside], 1);

  const before = cell(state, 3, Faction.LIQUIDATOR);
  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', 1, state);
  assert.equal(cell(state, 3, Faction.LIQUIDATOR), before,
    'бетон между ними — и он ничего не видел, хоть и в радиусе');
});

test('убийство весит вчетверо против удара — для ячейки мнения о фракции', () => {
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

test('свой бьёт своего: мнение о фракции стоит, а личное ребро падает', () => {
  const state = socialState();
  const world = openWorld();
  // Бьёт житель, свидетель тоже житель — одна нашивка на всех троих сторонах.
  const victim = person(101, 2, Faction.CITIZEN, 10);
  const attacker = person(102, 1, Faction.CITIZEN, 11);
  const witness = person(103, 3, Faction.CITIZEN, 12);
  rebuildEntityIndexForSimulation([victim, attacker, witness], 1);

  const factionBefore = cell(state, 3, Faction.CITIZEN);
  const edgeBefore = edgeTo(state, 3, 1);
  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', 1, state);

  /* Принадлежность — не мнение: от драки своих житель не начинает хуже думать о
   * ЖИТЕЛЯХ. Но и бесплатным это больше не остаётся — платит личное ребро к
   * тому, кто поднял руку. Раньше здесь стояла полная тишина, и ровно через неё
   * проваливался игрок в чужом теле: нашивка совпала — счёта нет. */
  assert.equal(cell(state, 3, Faction.CITIZEN), factionBefore, 'о своей фракции мнение не меняется');
  const edgeAfter = edgeTo(state, 3, 1);
  assert.ok(edgeAfter < edgeBefore, `свидетель запомнил обидчика лично: ${edgeBefore} → ${edgeAfter}`);
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

/* ── Игрок в общем законе ─────────────────────────────────────────── */

test('удар игрока глобальную матрицу больше не двигает', () => {
  const state = socialState();
  const victim = person(101, 1, Faction.CITIZEN, 10);
  const player = makeTestNpc({
    id: 900_001, alifeId: undefined, faction: Faction.PLAYER, name: 'Вы',
    x: 11, y: 10, hp: 100, maxHp: 100, karma: 0,
  });
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation([victim, player], 1);

  const before = getFactionRel(Faction.PLAYER, Faction.CITIZEN);
  const personalBefore = getAlifeNpcRecordSnapshot(state, 1)!.playerRelation;
  applyDamageRelationPenalty(Faction.PLAYER, Faction.CITIZEN, 12, victim, player, state);
  assert.equal(getFactionRel(Faction.PLAYER, Faction.CITIZEN), before, 'фракция как целое не вздрагивает');
  assert.equal(getFactionRel(Faction.CITIZEN, Faction.PLAYER), before, 'и с обратной стороны тоже');
  /* Личное — двигается, и в этом весь смысл: цена насилия местная. Двенадцать
   * из шестидесяти — пятая часть полоски, то есть 2/5 пути до вражды: 191 × 0.2
   * / 0.5 = 76. */
  assert.equal(victim.playerRelation, personalBefore - 76, 'жертва запомнила сама, долей снятого HP');
});

test('игрок в ЧУЖОМ теле остаётся узнаваемым: удар не растворяется в нашивке', () => {
  const state = socialState();
  const world = openWorld();
  /* Ровно тот отказ, с которого начался разбор: после смерти игрок продолжает в
   * теле жителя, `makeCurrentPlayer` фракцию не меняет, — и до правки удар по
   * жителю упирался в замок «одна фракция», а свидетели не считались вовсе,
   * потому что канал выбирался по нашивке `PLAYER`, которой у него больше нет. */
  const victim = person(101, 1, Faction.CITIZEN, 10);
  const possessed = makeTestNpc({
    id: 900_002, alifeId: undefined, faction: Faction.CITIZEN, name: 'Носитель',
    x: 11, y: 10, hp: 100, maxHp: 100, karma: 0,
  });
  const witness = person(103, 3, Faction.CITIZEN, 12);
  setCurrentPlayerEntity(possessed);
  rebuildEntityIndexForSimulation([victim, possessed, witness], 1);

  /* Читается ЧЕРЕЗ `getNpcPlayerRelation`, а не полем тела: у свежесозданного
   * тела `playerRelation` ещё не заполнено, и сравнение с `?? 0` меряло бы не
   * сдвиг, а первую инициализацию из записи A-Life. */
  const victimBefore = getNpcPlayerRelation(victim);
  const witnessBefore = getNpcPlayerRelation(witness);
  applyDamageRelationPenalty(
    combatSideOf(possessed), combatSideOf(victim), 12, victim, possessed, state,
  );
  notifyActorDamaged(world, victim, possessed, 12, 'player_melee', 1, state);

  assert.ok(getNpcPlayerRelation(victim) < victimBefore, 'жертва помнит ИГРОКА, а не «жителя вообще»');
  assert.ok(getNpcPlayerRelation(witness) < witnessBefore, 'и свидетель тоже');
});

test('убийство при свидетелях делает врагом всякого, кто это видел', () => {
  const state = socialState();
  const world = openWorld();
  const victim = person(101, 1, Faction.CITIZEN, 10);
  const player = makeTestNpc({
    id: 900_003, alifeId: undefined, faction: Faction.PLAYER, name: 'Вы',
    x: 11, y: 10, hp: 100, maxHp: 100, karma: 0,
  });
  const witness = person(103, 3, Faction.CITIZEN, 12);
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation([victim, player, witness], 1);

  victim.hp = 0;
  notifyActorDamaged(world, victim, player, 12, 'player_melee', 1, state);
  assert.ok(isNpcPlayerHostile(witness),
    `видевший убийство обязан стать врагом, а стал ${witness.playerRelation}`);
});

test('фракции по-прежнему помнят кражу: у целого остались договор и имущество', () => {
  initFactionRelations();
  const before = getFactionRel(Faction.CITIZEN, Faction.PLAYER);
  const penalty = applyTheftRelationPenalty(Faction.CITIZEN, true, false);
  assert.equal(penalty, -4);
  assert.equal(getFactionRel(Faction.CITIZEN, Faction.PLAYER), before - 4);
});

/* ── Затухания нет ────────────────────────────────────────────────── */

test('обида не рассасывается: механизма затухания в проекте больше нет', async () => {
  /* Замок на ОТСУТСТВИЕ. Пока обратная тяга существовала, вражда испарялась за
   * пару минут стояния в стороне, и порог, взятый ударами, тут же отдавался
   * назад. Возврат тяги — отдельное решение владельца, и заводить её надо не
   * таймером забывания, а поступком (извинение, откуп, услуга, смена тела). */
  const relations = await import('../src/data/relations');
  for (const name of ['relationDecayStep', 'decayFactionMatrixTowardBase', 'RELATION_DECAY_SHIFT']) {
    assert.equal((relations as Record<string, unknown>)[name], undefined,
      `${name} снят вместе с механизмом затухания`);
  }
});
