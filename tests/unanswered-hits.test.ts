/* Прибор: кого бьют безответно и почему.
 *
 * Не проверка одного случая, а СЛЕЖКА за живым этажом. Каждый кадр смотрим, у
 * кого убавилось здоровье, и через выдержку спрашиваем: ответил ли он. Не
 * ответившие раскладываются по причинам — потому что «не ответил» само по себе
 * ничего не говорит, а причина говорит всё.
 *
 * Ради чего: гражданский подходил и бил ликвидатора, а тот не отвечал. Причин
 * оказалось две, и обе системные. Условием боевой памяти была вражда по матрице
 * фракций — мирный по бумагам сосед бил и не считался врагом. А актёра сцены
 * цикл AI пропускал целиком, и весь строй стоял живой мишенью: ответить он не
 * мог не по решению, а потому, что его AI не запускался.
 *
 * Обе закрыты, и здесь стоит замок на обе. Отдельно проверяется сцена: актёр,
 * которого бьют, обязан отвечать, как всякий другой человек, — кат-сцены идут на
 * живой симуляции, а не на выключенных людях.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { AIGoal, EntityType, NpcRole, type Entity } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { initFactionRelations } from '../src/data/relations';
import { generateFloor } from '../src/gen/floor_manifest';
import { updateAI } from '../src/systems/ai';
import { getRecentCombatThreat, notifyActorDamaged } from '../src/systems/combat_stimulus';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState, makeTestPlayer } from './helpers';

const FRAME = 1 / 60;
/** Сколько кадров даём на ответ. Полторы секунды: скан цели и путь до обидчика. */
const ANSWER_GRACE = 90;

interface Verdict {
  hits: number;
  /** Урон пришёл, а кто ударил — неизвестно: путь урона не сообщил о себе. */
  unattributed: number;
  /** Обидчик не пережил выдержку: отвечать стало некому. Законно. */
  attackerGone: number;
  /** Взял обидчика целью хоть раз за выдержку. */
  answered: number;
  /** Убежал — это тоже ответ. */
  fled: number;
  /** Дерётся, но с кем-то другим: значит удар до AI дошёл. */
  busyElsewhere: number;
  /** Память боевая, обидчик жив, а человек так и не шелохнулся. Поломка. */
  silent: number;
  startled: number;
  diedFirst: number;
}

function watchFloor(z: number, seconds: number): Verdict {
  seedGlobalRng(0xbeef);
  initFactionRelations();
  const gen = generateFloor(z, 61_061);
  const world = gen.world;
  // Игрок унесён в угол: симуляция не должна зависеть от того, где он стоит.
  const player = makeTestPlayer({ x: 4.5, y: 4.5, angle: 0 });
  const entities: Entity[] = [player, ...gen.entities];
  const state = makeGameState({ currentZ: z });
  setCurrentPlayerEntity(player);

  const hp = new Map<number, number>();
  for (const e of entities) hp.set(e.id, e.hp ?? 0);
  interface Pending {
    victim: Entity;
    attackerId: number;
    frame: number;
    sawAttacker: boolean;
    sawFlee: boolean;
    sawOther: boolean;
  }
  const pending: Pending[] = [];
  const out: Verdict = {
    hits: 0, unattributed: 0, attackerGone: 0, answered: 0,
    fled: 0, busyElsewhere: 0, silent: 0, startled: 0, diedFirst: 0,
  };
  const nextId = { v: 900_000 };

  for (let f = 0; f < seconds * 60; f++) {
    state.time += FRAME;
    state.tick++;
    rebuildEntityIndexForSimulation(entities, f);
    updateAI(world, entities, FRAME, state.time, state.msgs, player.id, state.clock, false, nextId, z, state);

    for (const e of entities) {
      if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
      const was = hp.get(e.id);
      const now = e.hp ?? 0;
      if (was !== undefined && now < was && e.alive) {
        out.hits++;
        const threat = getRecentCombatThreat(e, state.time);
        if (!threat) out.unattributed++;
        else if (threat.reaction === 'startled') out.startled++;
        else pending.push({
          victim: e, attackerId: threat.attackerId, frame: f,
          sawAttacker: false, sawFlee: false, sawOther: false,
        });
      }
      hp.set(e.id, now);
    }

    /* Ответ ловится ВЕСЬ срок выдержки, а не в её конце: человек успевает
     * ответить, добить и вернуться к делам, и на последнем кадре выглядел бы
     * безответным. */
    const byId = new Map(entities.map(e => [e.id, e] as const));
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      const ai = p.victim.ai;
      if (ai) {
        if (ai.combatTargetId === p.attackerId) p.sawAttacker = true;
        else if (ai.combatTargetId !== undefined) p.sawOther = true;
        if (ai.goal === AIGoal.FLEE) p.sawFlee = true;
      }
      if (f - p.frame < ANSWER_GRACE) continue;
      pending.splice(i, 1);
      if (!p.victim.alive) { out.diedFirst++; continue; }
      if (p.sawAttacker) { out.answered++; continue; }
      if (p.sawFlee) { out.fled++; continue; }
      const attacker = byId.get(p.attackerId);
      if (!attacker?.alive) { out.attackerGone++; continue; }
      if (p.sawOther) { out.busyElsewhere++; continue; }
      out.silent++;
    }
  }
  return out;
}

test('на живом этаже никого не бьют безответно', () => {
  const v = watchFloor(-26, 45);
  assert.ok(v.hits > 0, 'за сорок пять секунд на коллекторах обязан кто-то кого-то ударить');

  /* Ловится КЛАСС, а не единичный промах, и порог поэтому дробный, а не ноль.
   *
   * История замеров: до правил ответной агрессии — 149 безответных из 1847, то
   * есть восемь процентов и явная поломка. После — ноль в трёх прогонах подряд и
   * три из 1911 в четвёртом. Разброс не в правилах, а в самой симуляции: она
   * недетерминирована между процессами (отдельная запись в `problems.md`), и
   * требовать точного нуля от сорока пяти секунд живого этажа значит проверять
   * везение. Полпроцента ловит возврат класса и не ловит рябь. */
  assert.ok(v.silent <= Math.max(1, Math.round(v.hits * 0.005)),
    `${v.silent} из ${v.hits} ударов без ответа: память боевая, обидчик жив, человек не шелохнулся`
      + ` [ответил ${v.answered}, убежал ${v.fled}, занят другим ${v.busyElsewhere},`
      + ` обидчик погиб ${v.attackerGone}, вздрогнул ${v.startled}, без автора ${v.unattributed}]`);

  /* Урон без автора — отдельный класс: он означает, что путь урона не сообщил,
   * кто бил, и никакая правила вражды тут не помогут. Бывает законно (среда,
   * голод), поэтому порог, а не ноль. */
  assert.ok(v.unattributed <= v.hits * 0.5,
    `${v.unattributed} из ${v.hits} ударов пришли без автора — путь урона молчит о том, кто бил`);
});

test('актёра сцены бьют — он отвечает, как всякий живой', () => {
  seedGlobalRng(7);
  initFactionRelations();
  const world = generateFloor(-26, 61_061).world;
  const state = makeGameState({ currentZ: -26 });
  const player = makeTestPlayer({ x: 4.5, y: 4.5, angle: 0 });
  setCurrentPlayerEntity(player);

  /* Актёр стоит на посту в роли сцены — ровно так, как его держит проигрыватель
   * между тактами. Раньше эта роль означала «вне цикла AI», и человек в строю
   * был живой мишенью. */
  const actor = {
    id: 700_001, type: EntityType.NPC, x: 20.5, y: 20.5, angle: 0, pitch: 0, alive: true,
    speed: 1.2, sprite: 0, hp: 200, maxHp: 200, faction: 1, questId: -1,
    role: NpcRole.CINEMATIC_ACTOR,
    cinematicState: { originalRole: NpcRole.WANDERER, postX: 20.5, postY: 20.5, sceneId: 'probe' },
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  } as unknown as Entity;
  const civilian = {
    id: 700_002, type: EntityType.NPC, x: 21.5, y: 20.5, angle: 0, pitch: 0, alive: true,
    speed: 1.2, sprite: 0, hp: 100, maxHp: 100, faction: 0, questId: -1,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  } as unknown as Entity;
  const entities = [player, actor, civilian];
  rebuildEntityIndexForSimulation(entities, 0);

  notifyActorDamaged(world, actor, civilian, 15, 'npc_melee', state.time, state);

  assert.equal(actor.ai?.combatTargetId, civilian.id, 'удар обязан дойти до актёра сцены');

  // И цикл AI обязан его вести: раньше он молча выпадал из прохода целиком.
  const nextId = { v: 900_000 };
  // Отпечаток прохода: цель, курс и таймер трогает только тот, кого цикл AI ведёт.
  for (let f = 0; f < 30; f++) {
    state.time += FRAME;
    rebuildEntityIndexForSimulation(entities, f + 1);
    updateAI(world, entities, FRAME, state.time, state.msgs, player.id, state.clock, false, nextId, -26, state);
  }
  assert.equal(actor.alive, true);
  assert.ok(actor.ai!.goal !== AIGoal.IDLE || actor.ai!.timer !== 0,
    'актёр сцены обязан проходить цикл AI, а не стоять выключенным');
});
