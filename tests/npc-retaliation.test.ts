/* Замок на ответную агрессию.
 *
 * Правило одно, и оно без списков: **ударивший с чужой стороны становится врагом
 * сам по себе** — рукой, очередью, шальной пулей, взрывом. Перечислять источники
 * нельзя: шальная пуля и нападение физически одно и то же событие.
 *
 * Внутри одной стороны удар врагом не делает — там вражда идёт своим каналом,
 * личным обоюдным ребром графа Демоса, и двое своих ниже порога дерутся и без
 * удара. Экология (монстр против монстра) — объявленное исключение про мир.
 *
 * До этого условием боевой памяти была вражда по матрице фракций, и мирный по
 * бумагам сосед мог бить ликвидатора сколько угодно: тот читал его как друга и
 * возвращался к своим делам под градом ударов.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, EntityType, Faction } from '../src/core/types';
import { World } from '../src/core/world';
import {
  getRecentCombatThreat,
  notifyActorDamaged,
  resetCombatStimulus,
} from '../src/systems/combat_stimulus';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { applyDamageRelationPenalty } from '../src/systems/factions';
import { RELATION_FRIENDLY_THRESHOLD } from '../src/systems/npc_relations';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState, makeTestNpc } from './helpers';

const TIME = 100;

function npcAt(id: number, faction: Faction, x: number, y: number) {
  const npc = makeTestNpc({ id, faction, x, y, hp: 100, maxHp: 100 });
  npc.alive = true;
  npc.ai = { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 };
  return npc;
}

test('ликвидатор отвечает гражданскому, который его ударил', () => {
  resetCombatStimulus();
  const world = new World();
  const state = makeGameState();

  const liquidator = npcAt(600_001, Faction.LIQUIDATOR, 20.5, 20.5);
  const civilian = npcAt(600_002, Faction.CITIZEN, 21.5, 20.5);
  rebuildEntityIndex([liquidator, civilian]);

  notifyActorDamaged(world, liquidator, civilian, 12, 'npc_melee', TIME, state);

  const threat = getRecentCombatThreat(liquidator, TIME);
  assert.ok(threat, 'удар обязан оставить боевую память');
  assert.equal(threat.attackerId, civilian.id);
  assert.equal(threat.reaction, 'fight', 'по матрице фракций гражданин ему друг — и всё же он ответит');
  assert.equal(liquidator.ai?.combatTargetId, civilian.id);
  assert.equal(liquidator.ai?.goal, AIGoal.HUNT);
});

test('свои в той же комнате вступаются за товарища', () => {
  resetCombatStimulus();
  const world = new World();
  const state = makeGameState();

  const victim = npcAt(600_011, Faction.LIQUIDATOR, 30.5, 30.5);
  const mate = npcAt(600_012, Faction.LIQUIDATOR, 33.5, 30.5);
  const stranger = npcAt(600_013, Faction.CITIZEN, 31.5, 31.5);
  const attacker = npcAt(600_014, Faction.CITIZEN, 31.5, 30.5);
  rebuildEntityIndex([victim, mate, stranger, attacker]);

  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', TIME, state);

  assert.equal(mate.ai?.combatTargetId, attacker.id, 'товарищ рядом обязан вступиться');
  assert.equal(getRecentCombatThreat(mate, TIME)?.reaction, 'fight');
  // Чужой по фракции мимо не втягивается: это драка своих, а не всеобщая.
  assert.equal(stranger.ai?.combatTargetId, undefined);
});

test('далёкий свой не слышит драки', () => {
  resetCombatStimulus();
  const world = new World();
  const state = makeGameState();

  const victim = npcAt(600_021, Faction.LIQUIDATOR, 40.5, 40.5);
  const far = npcAt(600_022, Faction.LIQUIDATOR, 70.5, 40.5);
  const attacker = npcAt(600_023, Faction.CITIZEN, 41.5, 40.5);
  rebuildEntityIndex([victim, far, attacker]);

  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', TIME, state);

  assert.equal(far.ai?.combatTargetId, undefined);
});

test('своя сторона не ссорится ни очередью, ни рукой', () => {
  resetCombatStimulus();
  const world = new World();
  const state = makeGameState();

  const hit = npcAt(600_031, Faction.LIQUIDATOR, 50.5, 50.5);
  const ally = npcAt(600_032, Faction.LIQUIDATOR, 51.5, 50.5);
  rebuildEntityIndex([hit, ally]);

  for (const source of ['npc_ranged', 'npc_melee', 'explosion'] as const) {
    resetCombatStimulus();
    notifyActorDamaged(world, hit, ally, 9, source, TIME, state);
    assert.equal(getRecentCombatThreat(hit, TIME)?.reaction, 'startled',
      `свои не ссорятся из-за «${source}»: внутри фракции вражда идёт личным каналом`);
    assert.equal(hit.ai?.combatTargetId, undefined);
  }
});

test('чужая сторона ссорится ЛЮБЫМ уроном, включая взрыв', () => {
  resetCombatStimulus();
  const world = new World();
  const state = makeGameState();

  for (const source of ['explosion', 'projectile', 'npc_ranged', 'npc_melee'] as const) {
    resetCombatStimulus();
    const victim = npcAt(600_041, Faction.LIQUIDATOR, 60.5, 60.5);
    const attacker = npcAt(600_042, Faction.CITIZEN, 61.5, 60.5);
    rebuildEntityIndex([victim, attacker]);

    notifyActorDamaged(world, victim, attacker, 20, source, TIME, state);

    assert.equal(getRecentCombatThreat(victim, TIME)?.reaction, 'fight',
      `«${source}» с чужой стороны — такой же удар, как всякий другой`);
    assert.equal(victim.ai?.combatTargetId, attacker.id);
  }
});

test('экология остаётся исключением: монстр монстру не враг даже от удара', () => {
  resetCombatStimulus();
  const world = new World();
  const state = makeGameState();

  const victim = npcAt(600_051, Faction.WILD, 70.5, 70.5);
  const attacker = npcAt(600_052, Faction.WILD, 71.5, 70.5);
  victim.type = EntityType.MONSTER;
  attacker.type = EntityType.MONSTER;
  rebuildEntityIndex([victim, attacker]);

  notifyActorDamaged(world, victim, attacker, 30, 'monster_melee', TIME, state);

  assert.equal(getRecentCombatThreat(victim, TIME), undefined);
  assert.equal(victim.ai?.combatTargetId, undefined);
});

/* ── Игрок в общем законе ────────────────────────────────────────
 *
 * Фракция игрока синтетическая: других членов у неё нет, поэтому «свои» для
 * него пусты по построению, и подъём соседей за него не срабатывал никогда.
 * Сторону игрока читает тот же личный канал, который есть у каждого NPC, —
 * порог общий, ручки под игрока не заведено.
 */

test('за игрока вступается друг, но не равнодушный', () => {
  resetCombatStimulus();
  const world = new World();
  const state = makeGameState();

  const player = npcAt(600_061, Faction.PLAYER, 80.5, 80.5);
  player.persistentNpcId = 'player';
  setCurrentPlayerEntity(player);
  const friend = npcAt(600_062, Faction.CITIZEN, 82.5, 80.5);
  friend.playerRelation = RELATION_FRIENDLY_THRESHOLD;
  const indifferent = npcAt(600_063, Faction.CITIZEN, 81.5, 81.5);
  indifferent.playerRelation = RELATION_FRIENDLY_THRESHOLD - 1;
  const attacker = npcAt(600_064, Faction.WILD, 81.5, 80.5);
  rebuildEntityIndex([player, friend, indifferent, attacker]);

  try {
    notifyActorDamaged(world, player, attacker, 14, 'npc_melee', TIME, state);

    assert.equal(friend.ai?.combatTargetId, attacker.id, 'друг игрока обязан вступиться');
    assert.equal(getRecentCombatThreat(friend, TIME)?.reaction, 'fight');
    assert.equal(indifferent.ai?.combatTargetId, undefined, 'на волосок ниже порога — это не друг');
    // Сам игрок помнит удар, как всякий актор, но целей ему никто не ставит:
    // строка состояния у него есть, а решает за него ввод.
    assert.equal(getRecentCombatThreat(player, TIME)?.attackerId, attacker.id);
    assert.equal(player.ai?.combatTargetId, undefined);
  } finally {
    setCurrentPlayerEntity(undefined);
  }
});

test('свидетель удара игрока помнит его сам, и вдвое слабее жертвы', () => {
  resetCombatStimulus();
  const world = new World();
  const state = makeGameState();

  const player = npcAt(600_071, Faction.PLAYER, 90.5, 90.5);
  player.persistentNpcId = 'player';
  setCurrentPlayerEntity(player);
  const victim = npcAt(600_072, Faction.CITIZEN, 91.5, 90.5);
  victim.playerRelation = 40;
  const witness = npcAt(600_073, Faction.CITIZEN, 92.5, 90.5);
  witness.playerRelation = 40;
  const blind = npcAt(600_074, Faction.CITIZEN, 120.5, 90.5);
  blind.playerRelation = 40;
  rebuildEntityIndex([player, victim, witness, blind]);

  try {
    applyDamageRelationPenalty(player.faction, victim.faction, 20, victim, player, state);
    notifyActorDamaged(world, victim, player, 20, 'player_melee', TIME, state);

    assert.equal(victim.playerRelation, 36, 'жертва платит полным штрафом за 20 урона');
    assert.equal(witness.playerRelation, 38, 'свидетель — половиной: он видел, а не почувствовал');
    assert.equal(blind.playerRelation, 40, 'кто далеко, тот ничего не видел');
  } finally {
    setCurrentPlayerEntity(undefined);
  }
});
