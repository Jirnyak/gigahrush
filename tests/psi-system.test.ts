import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { getPlotNpcCount } from '../src/data/npc_packages';
import { AIGoal, Faction, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import {
  absorbPsiShieldDamage,
  castInstantSpell,
  endPsiPossession,
  getPsiPossessionTarget,
  isPsiShieldActive,
  resetPsiState,
  updatePsiEffects,
} from '../src/systems/psi';
import { makeTestNpc, makeTestPlayer } from './helpers';

test('PSI shield restores HP loss and spends 10 percent of blocked damage from PSI', () => {
  resetPsiState();
  const world = new World();
  const msgs: Msg[] = [];
  const player = makeTestPlayer({
    id: 1,
    hp: 20,
    maxHp: 20,
    rpg: { level: 1, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 0, psi: 5, maxPsi: 10 },
  });

  castInstantSpell('shield', player, [player], world, msgs, 1, () => {});
  assert.equal(isPsiShieldActive(), true);

  player.hp = 12;
  assert.equal(absorbPsiShieldDamage(player, 20, msgs, 2), 8);
  assert.equal(player.hp, 20);
  assert.equal(player.rpg?.psi, 4.2);

  player.rpg!.psi = 0.1;
  player.hp = 15;
  absorbPsiShieldDamage(player, 20, msgs, 3);
  assert.equal(player.hp, 20);
  assert.equal(player.rpg?.psi, 0);
  assert.equal(isPsiShieldActive(), false);
});

test('PSI possession requires higher player intelligence and expires into backlash madness', () => {
  resetPsiState();
  const world = new World();
  const msgs: Msg[] = [];
  const player = makeTestPlayer({
    id: 1,
    x: 10,
    y: 10,
    angle: 0,
    rpg: { level: 3, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 4, psi: 30, maxPsi: 30 },
  });
  const target = makeTestNpc({
    id: getPlotNpcCount() + 1000,
    x: 16,
    y: 10,
    faction: Faction.WILD,
    rpg: { level: 1, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 1, psi: 0, maxPsi: 0 },
    ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [1], pi: 0, stuck: 0, timer: 1, combatTargetId: 1 },
  });
  const entities = [player, target];

  let activePlayer = castInstantSpell('possession', player, entities, world, msgs, 1, () => {}).player ?? player;
  assert.equal(target.psiControlledBy, player.id);
  assert.equal(activePlayer, target);
  target.alive = false;
  assert.equal(getPsiPossessionTarget(entities, player), null);
  target.alive = true;
  assert.equal(target.ai?.combatTargetId, undefined);
  assert.equal(getPsiPossessionTarget(entities, player), target);

  activePlayer = updatePsiEffects(entities, 19.1, activePlayer, msgs, 17).player ?? activePlayer;
  assert.equal(target.psiControlledBy, undefined);
  assert.equal(activePlayer, player);
  assert.ok((target.psiMadness ?? 0) > 0);
  assert.equal(getPsiPossessionTarget(entities, player), null);
});

test('PSI possession fails closed when target intelligence is not lower', () => {
  resetPsiState();
  const world = new World();
  const msgs: Msg[] = [];
  const player = makeTestPlayer({
    id: 1,
    x: 10,
    y: 10,
    angle: 0,
    rpg: { level: 2, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 1, psi: 30, maxPsi: 30 },
  });
  const target = makeTestNpc({
    id: getPlotNpcCount() + 1001,
    x: 16,
    y: 10,
    rpg: { level: 2, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 1, psi: 0, maxPsi: 0 },
  });
  const entities = [player, target];

  castInstantSpell('possession', player, entities, world, msgs, 1, () => {});

  assert.equal(target.psiControlledBy, undefined);
  assert.equal(getPsiPossessionTarget(entities, player), null);
  endPsiPossession(entities, player, msgs, 2, 'reset');
});

test('PSI shield can protect whichever entity is the current player', () => {
  resetPsiState();
  const world = new World();
  const msgs: Msg[] = [];
  const player = makeTestPlayer({
    id: 1,
    x: 10,
    y: 10,
    angle: 0,
    rpg: { level: 3, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 4, psi: 30, maxPsi: 30 },
  });
  const target = makeTestNpc({
    id: getPlotNpcCount() + 1002,
    x: 16,
    y: 10,
    hp: 20,
    maxHp: 20,
    rpg: { level: 1, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 1, psi: 10, maxPsi: 10 },
  });
  const entities = [player, target];

  castInstantSpell('shield', player, entities, world, msgs, 1, () => {});
  const activePlayer = castInstantSpell('possession', player, entities, world, msgs, 2, () => {}).player ?? player;
  activePlayer.hp = 6;

  assert.equal(absorbPsiShieldDamage(activePlayer, 20, msgs, 3), 14);
  assert.equal(activePlayer.hp, 20);
  assert.equal(activePlayer.rpg?.psi, 8.6);
});

/* Замок на универсальность вселения.
 *
 * Способность держалась на ОДНОМ модульном слоте на весь мир, и это делало её
 * игроцкой по устройству: пока слот занят, вселиться не мог больше никто.
 * Каст при этом уже принимал любого актора (`castInstantSpell` зовут и не за
 * игрока), поэтому NPC мог занять слот и запереть способность игроку.
 *
 * Закон проекта — «игрок это просто NPC», значит вселение обязано работать
 * одинаково у всех и одновременно у многих. Правда о том, кто в ком, живёт на
 * сущностях: `psiControlledBy` у захваченного тела, зеркальное `psiAway` у
 * ушедшего хозяина. Пара нужна ради O(1) в обе стороны — цикл AI обязан за одно
 * сравнение понять, что тело покинуто.
 */
test('вселяться могут двое сразу, и ни один не мешает другому', () => {
  resetPsiState();
  const world = new World();
  const msgs: Msg[] = [];
  const smart = (id: number, x: number) => makeTestNpc({
    id, x, y: 10, faction: Faction.WILD,
    rpg: { level: 3, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 4, psi: 30, maxPsi: 30 },
  });
  const dull = (id: number, x: number) => makeTestNpc({
    id, x, y: 10, faction: Faction.WILD,
    rpg: { level: 1, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 1, psi: 0, maxPsi: 0 },
    ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [1], pi: 0, stuck: 0, timer: 1, combatTargetId: 1 },
  });
  const base = getPlotNpcCount() + 2000;
  const hostA = smart(base, 10);
  const bodyA = dull(base + 1, 16);
  const hostB = smart(base + 2, 40);
  const bodyB = dull(base + 3, 46);
  const entities = [hostA, bodyA, hostB, bodyB];

  castInstantSpell('possession', hostA, entities, world, msgs, 1, () => {});
  castInstantSpell('possession', hostB, entities, world, msgs, 1, () => {});

  assert.equal(bodyA.psiControlledBy, hostA.id, 'первый вселился');
  assert.equal(bodyB.psiControlledBy, hostB.id, 'второй НЕ должен упереться в чужое вселение');
  assert.equal(hostA.psiAway, bodyA.id, 'покинутое тело помнит, где хозяин');
  assert.equal(hostB.psiAway, bodyB.id);
  assert.equal(getPsiPossessionTarget(entities, hostA), bodyA);
  assert.equal(getPsiPossessionTarget(entities, hostB), bodyB);
});

test('в занятое тело второй раз не вселяются', () => {
  resetPsiState();
  const world = new World();
  const msgs: Msg[] = [];
  const base = getPlotNpcCount() + 3000;
  const mk = (id: number, x: number, int: number) => makeTestNpc({
    id, x, y: 10, faction: Faction.WILD,
    rpg: { level: 3, xp: 0, attrPoints: 0, str: 0, agi: 0, int, psi: 30, maxPsi: 30 },
  });
  const first = mk(base, 10, 4);
  const body = mk(base + 1, 16, 1);
  const second = mk(base + 2, 22, 4);
  const entities = [first, body, second];

  castInstantSpell('possession', first, entities, world, msgs, 1, () => {});
  assert.equal(body.psiControlledBy, first.id);

  castInstantSpell('possession', second, entities, world, msgs, 1, () => {});
  assert.equal(body.psiControlledBy, first.id, 'тело осталось за первым');
  assert.equal(second.psiAway, undefined, 'второй никуда не ушёл');
});
