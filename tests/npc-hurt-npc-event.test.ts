/* Событие удара между акторами: игрок — просто ещё один атакующий.
 *
 * До 2026-08-27 событие удара публиковалось ТОЛЬКО за руку игрока
 * (`publishPlayerHurtNpcEvent`), хотя убийства уже давно шли обеими сторонами —
 * `player_kill_npc` и `npc_kill_npc`. Это была последняя ветка класса «игрок
 * особенный» в событийном слое.
 *
 * Замок держит три вещи разом, и их нельзя разъединять:
 *  1. обе руки публикуют, и различаются только именем типа;
 *  2. троттл: событие про НАЧАЛО схватки, а не про попадание. Замер живого
 *     этажа без игрока (жилая зона, seed 1337, 60 c): 381 попадание NPC↔NPC в
 *     минуту без троттла против 63 завязок с ним. Кольцо `recentEvents` — 1024,
 *     окно ленты Демоса — 64 события на такт в 30 секунд; без троттла одна
 *     перестрелка вымывает оба;
 *  3. у события есть читатель — стеносводка. Событие без читателя запрещено.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, MonsterKind, type Entity, type GameState } from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { initFactionRelations } from '../src/data/relations';
import { notifyActorDamaged, resetCombatStimulus } from '../src/systems/combat_stimulus';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { setWorldLogSpatialContext } from '../src/systems/world_log';
import { makeGameState, makeTestEntity, makeTestNpc, addTestRoom } from './helpers';

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

function freshState(): GameState {
  seedGlobalRng(20260827);
  return makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
}

function person(id: number, faction: Faction, x: number, name: string): Entity {
  return makeTestNpc({ id, alifeId: id, faction, name, x, y: 10, hp: 60, maxHp: 60, ai: ai() });
}

function beast(id: number, x: number): Entity {
  return makeTestEntity({
    id, faction: Faction.WILD, name: 'Тварь', x, y: 10, hp: 60, maxHp: 60, ai: ai(),
    type: EntityType.MONSTER, monsterKind: MonsterKind.TVAR,
  });
}

function typesOf(state: GameState): string[] {
  return getRecentEvents(state, { limit: 64 }).map(event => event.type);
}

test.beforeEach(() => {
  initFactionRelations();
  resetCombatStimulus();
  setCurrentPlayerEntity(undefined);
  setWorldLogSpatialContext(undefined);
});

test.afterEach(() => {
  resetCombatStimulus();
  setCurrentPlayerEntity(undefined);
  setWorldLogSpatialContext(undefined);
});

/* ── Обе руки публикуют ───────────────────────────────────────────── */

test('удар NPC по NPC публикует npc_hurt_npc', () => {
  const state = freshState();
  const world = openWorld();
  const victim = person(101, Faction.CITIZEN, 10, 'Жертва');
  const attacker = person(102, Faction.LIQUIDATOR, 11, 'Обидчик');
  rebuildEntityIndexForSimulation([victim, attacker], 1);

  notifyActorDamaged(world, victim, attacker, 9, 'npc_melee', 1, state);

  const events = getRecentEvents(state, { type: 'npc_hurt_npc', limit: 8 });
  assert.equal(events.length, 1, 'чужая рука обязана публиковать так же, как рука игрока');
  assert.equal(events[0].actorId, attacker.id);
  assert.equal(events[0].targetId, victim.id);
  assert.equal(events[0].actorFaction, Faction.LIQUIDATOR);
  assert.equal(events[0].targetFaction, Faction.CITIZEN);
  assert.equal(events[0].data?.damage, 9);
  assert.ok(events[0].tags.includes('combat'));
});

test('рука игрока меняет только имя типа, а не наличие события', () => {
  const state = freshState();
  const world = openWorld();
  const victim = person(101, Faction.CITIZEN, 10, 'Жертва');
  const player = person(102, Faction.PLAYER, 11, 'Вы');
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation([victim, player], 1);

  notifyActorDamaged(world, victim, player, 9, 'player_melee', 1, state);

  assert.deepEqual(typesOf(state), ['player_hurt_npc'], 'старый тип не потерял ни одного читателя');
});

test('тварь бьёт молча: у монстра своего типа нет', () => {
  const state = freshState();
  const world = openWorld();
  const victim = person(101, Faction.CITIZEN, 10, 'Жертва');
  const monster = beast(102, 11);
  rebuildEntityIndexForSimulation([victim, monster], 1);

  notifyActorDamaged(world, victim, monster, 9, 'monster_melee', 1, state);

  assert.deepEqual(typesOf(state), [], 'иначе `npc_hurt_npc` соврал бы про автора');
});

/* ── Троттл ───────────────────────────────────────────────────────── */

test('очередь из одного ствола стоит ОДНОГО события', () => {
  const state = freshState();
  const world = openWorld();
  const victim = person(101, Faction.CITIZEN, 10, 'Жертва');
  const attacker = person(102, Faction.LIQUIDATOR, 11, 'Обидчик');
  rebuildEntityIndexForSimulation([victim, attacker], 1);

  // Четырнадцать выстрелов в секунду — темп ППШ. Боевая память жертвы живёт
  // пять секунд и продлевается каждым попаданием, значит вся очередь внутри
  // одной схватки.
  for (let i = 0; i < 42; i++) {
    notifyActorDamaged(world, victim, attacker, 4, 'npc_ranged', 1 + i / 14, state);
  }

  assert.equal(getRecentEvents(state, { type: 'npc_hurt_npc', limit: 64 }).length, 1);
});

test('третий, вступивший в идущую драку, публикует своё событие', () => {
  const state = freshState();
  const world = openWorld();
  const victim = person(101, Faction.CITIZEN, 10, 'Жертва');
  const attacker = person(102, Faction.LIQUIDATOR, 11, 'Обидчик');
  const joiner = person(103, Faction.CULTIST, 12, 'Второй обидчик');
  rebuildEntityIndexForSimulation([victim, attacker, joiner], 1);

  notifyActorDamaged(world, victim, attacker, 6, 'npc_melee', 1, state);
  notifyActorDamaged(world, victim, joiner, 6, 'npc_melee', 1.5, state);

  const events = getRecentEvents(state, { type: 'npc_hurt_npc', limit: 8 });
  assert.equal(events.length, 2, 'память сверяется по ПАРЕ, а не «жертва вообще дерётся»');
  assert.deepEqual(events.map(e => e.actorId).sort(), [attacker.id, joiner.id]);
});

/* ── Читатель ─────────────────────────────────────────────────────── */

test('стеносводка печатает завязку драки — и не выносит её в HUD', () => {
  const state = freshState();
  const world = openWorld();
  const victim = person(101, Faction.CITIZEN, 10, 'Жертва');
  const attacker = person(102, Faction.LIQUIDATOR, 11, 'Обидчик');
  rebuildEntityIndexForSimulation([victim, attacker], 1);

  notifyActorDamaged(world, victim, attacker, 9, 'npc_melee', 1, state);

  const line = state.msgLog.at(-1);
  assert.ok(line, 'событие без читателя — мёртвые данные');
  assert.equal(line!.text, 'Обидчик бьёт Жертва.');
  assert.equal(
    state.msgs.some(m => m.text === line!.text),
    false,
    'чужая драка — строка журнала, а не всплывающее сообщение поверх прицела',
  );
});
