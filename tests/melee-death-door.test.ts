/* ── Ближний бой и среда доходят до общей двери смерти ────────────
 *
 * Замок под `postrelease.md` §2.6 — «ближний бой обходит общую дверь смерти».
 * До правки `deathByCaller: true` стоял на ДВУХ самых частых путях убийства в
 * игре: удар твари (`ai/monster.ts`) и удар жильца (`ai/combat.ts`). Флаг
 * отключает `actorDeathHandler → handleKill`, а рядом были переписаны руками
 * только лужа и лут. Терялось всё остальное: запись смерти в A-Life,
 * прикреплённый дневник личности, сюжетный дроп и контентные хуки смерти.
 *
 * Третий замок — про игрока. `finishActorDeath` пропускал его, и флаг `alive`
 * снимал каждый бьющий сам. Путь без своего `killEntity` убить игрока не мог
 * вовсе: состав на рельсах — ЕДИНСТВЕННЫЙ средовой урон с `lethal: true` —
 * снимал 260 и оставлял его живым на нуле здоровья навсегда.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, DamageType, EntityType, Faction, Feature, MonsterKind, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS } from '../src/entities/monster';
import { setEntityMap, tryPerformMonsterMeleeAttack } from '../src/systems/ai/monster';
import { setCombatContext, tryFactionCombat } from '../src/systems/ai/combat';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setActorDeathHandler } from '../src/systems/combat_stimulus';
import { damageActorByEnvironment } from '../src/systems/actor_damage';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { setListenerPos } from '../src/systems/audio';
import { createWorldEventState } from '../src/systems/events';
import { initFactionRelations } from '../src/data/relations';
import { setFactionsSocialContext } from '../src/systems/factions';
import { makeGameState } from './helpers';

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.features.fill(Feature.NONE);
  setListenerPos(512, 512, world.dist2.bind(world));
  return world;
}

function victim(id: number, x: number, y: number, hp = 1): Entity {
  return {
    id, type: EntityType.NPC, x, y, angle: 0, pitch: 0, alive: true,
    speed: 1, sprite: 0, hp, maxHp: 100, faction: Faction.CITIZEN,
    name: 'Сосед',
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function syncEntities(entities: Entity[]): void {
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));
}

interface DeathLog { victims: Entity[]; killers: (Entity | undefined)[] }

function installDeathDoor(): DeathLog {
  const log: DeathLog = { victims: [], killers: [] };
  setActorDeathHandler((v, killer) => {
    log.victims.push(v);
    log.killers.push(killer);
  });
  return log;
}

test('убитый ближним боем твари доходит до общей двери смерти', () => {
  const world = openWorld();
  const target = victim(2, 11.1, 10.5);
  const kind = MonsterKind.SBORKA;
  const def = MONSTERS[kind];
  const threat: Entity = {
    id: 70, type: EntityType.MONSTER, x: 10.5, y: 10.5, angle: 0, pitch: 0,
    alive: true, speed: def.speed, sprite: def.sprite, hp: def.hp, maxHp: def.hp,
    monsterKind: kind, attackCd: 0,
    ai: { goal: AIGoal.HUNT, tx: 10.5, ty: 10.5, path: [], pi: 0, stuck: 0, timer: 0 },
  };
  const msgs: Msg[] = [];
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  const deaths = installDeathDoor();

  try {
    syncEntities([target, threat]);
    const hit = tryPerformMonsterMeleeAttack(
      world, threat, target, def, 0.1, 1, msgs, 999,
      world.dist(threat.x, threat.y, target.x, target.y), state,
    );
    assert.equal(hit, true, 'в упор тварь обязана ударить');
  } finally {
    setActorDeathHandler(undefined);
  }

  assert.equal(target.alive, false, 'цель с одним здоровьем обязана умереть');
  // До правки здесь стоял `deathByCaller: true`, и дверь не звалась ни разу:
  // смерть жильца не попадала ни в A-Life, ни в сюжетный дневник.
  assert.equal(deaths.victims.length, 1, 'смерть от укуса обязана пройти общий обработчик');
  assert.equal(deaths.victims[0], target);
  assert.equal(deaths.killers[0], threat, 'убийца обязан доехать до обработчика');
  assert.equal(target.hp, 0, 'перелёт здоровья ниже нуля гасится дверью');
});

test('убитый ближним боем жильца доходит до общей двери смерти', () => {
  const world = openWorld();
  initFactionRelations();
  setFactionsSocialContext(undefined);
  setCombatContext([], 5);
  /* Жертва — тварь: вражда экологии не зависит от матрицы отношений, а
   * проверяется здесь ровно СМЕРТЬ, а не выбор цели. Смерть жильца от руки
   * жильца идёт тем же вызовом. */
  const target: Entity = {
    id: 11, type: EntityType.MONSTER, x: 510.6, y: 510, angle: 0, pitch: 0,
    alive: true, speed: 2, sprite: 0, hp: 1, maxHp: 100,
    monsterKind: MonsterKind.SBORKA,
  };
  const attacker: Entity = {
    id: 10, type: EntityType.NPC, x: 510, y: 510, angle: 0, pitch: 0,
    alive: true, speed: 3, sprite: 0, hp: 100, maxHp: 100,
    faction: Faction.LIQUIDATOR, weapon: 'pipe', currentMag: 1,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
  const entities = [attacker, target];
  const deaths = installDeathDoor();

  try {
    syncEntities(entities);
    assert.equal(tryFactionCombat(world, entities, attacker, 0.1, 5, [], { v: 100 }), true);
  } finally {
    setActorDeathHandler(undefined);
  }

  assert.equal(target.alive, false, 'труба по цели с одним здоровьем обязана убить');
  assert.equal(deaths.victims.length, 1, 'смерть от руки жильца обязана пройти общий обработчик');
  assert.equal(deaths.killers[0], attacker);
});

test('среда с lethal объявляет смерть игрока, а не оставляет его живым на нуле', () => {
  const world = openWorld();
  const crushed: Entity = {
    id: 1, type: EntityType.PLAYER, x: 512.5, y: 512.5, angle: 0, pitch: 0,
    alive: true, speed: 3, sprite: 0, hp: 100, maxHp: 100, faction: Faction.PLAYER,
  };
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  const deaths = installDeathDoor();
  const prevPlayer = crushed;
  setCurrentPlayerEntity(prevPlayer);

  try {
    syncEntities([crushed]);
    // Ровно то, чем бьёт состав: `rail_trains.ts`, 260 кинетики с `lethal: true`.
    const applied = damageActorByEnvironment(world, state, crushed, {
      damage: 260,
      damageType: DamageType.KINETIC,
      lethal: true,
      time: state.time,
    });
    assert.ok(applied > 0, 'состав обязан снять здоровье');
  } finally {
    setActorDeathHandler(undefined);
  }

  // До правки `finishActorDeath` пропускал игрока, и `damageEntity` состава по
  // `victim.alive` не ставил кулдаун: игрок с нулём здоровья жил и молол его
  // каждый кадр, а `!player.alive` в цикле никогда не срабатывал.
  assert.equal(crushed.alive, false, 'игрока, задавленного составом, обязаны объявить мёртвым');
  assert.equal(crushed.hp, 0);
  assert.equal(deaths.victims.length, 1, 'смерть игрока тоже идёт общей дверью — там его ловит ПСИ-щит');
});
