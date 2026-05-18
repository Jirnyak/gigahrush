import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { EntityType, Faction, ItemType, MonsterKind, type Entity, type Msg } from '../src/core/types';
import { ITEMS, WEAPON_STATS } from '../src/data/catalog';
import { getStack, spawnCount } from '../src/data/items';
import {
  addItem,
  consumeAmmo,
  consumeDurability,
  countAmmo,
  getEquippedDurability,
  getWeaponReadiness,
  getWeaponStats,
  useItem,
} from '../src/systems/inventory';
import {
  awardXP,
  freshRPG,
  getMaxHp,
  questDifficulty,
  questMoneyReward,
  questXpReward,
  scaleMonsterDmg,
  scaleMonsterHp,
  spendAttrPoint,
  xpForLevel,
  xpForMonsterKill,
} from '../src/systems/rpg';
import {
  activeZhelemishSkin,
  applyZhelemishSkin,
  cureZhelemishSkin,
  updateZhelemishSkinStatus,
  zhelemishHealingMult,
  zhelemishIncomingMeleeDamage,
  zhelemishMoveMult,
} from '../src/systems/status';
import { getRecentEvents } from '../src/systems/events';
import { makeGameState } from './helpers';

function makePlayer(): Entity {
  return {
    id: 1,
    type: EntityType.PLAYER,
    x: 0,
    y: 0,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 3,
    sprite: 0,
    hp: 50,
    maxHp: 100,
    inventory: [],
    weapon: '',
    faction: Faction.PLAYER,
    name: 'Вы',
    rpg: freshRPG(1),
  };
}

test('item stack rules keep weapons single-slot and commodities stackable', () => {
  assert.equal(getStack(ITEMS.bread), 999);
  assert.equal(getStack(ITEMS.pipe), 1);
  assert.equal(spawnCount(ITEMS.ammo_9mm), 100);
  assert.equal(spawnCount(ITEMS.pipe), 1);

  const player = makePlayer();
  assert.equal(addItem(player, 'bread', 1200), true);
  assert.deepEqual(player.inventory?.map(i => i.count), [999, 201]);

  assert.equal(addItem(player, 'pipe', 2), true);
  const pipes = player.inventory?.filter(i => i.defId === 'pipe') ?? [];
  assert.equal(pipes.length, 2);
  assert.ok(pipes.every(i => (i.data as { dur?: number }).dur === WEAPON_STATS.pipe.durability));
});

test('using items equips weapons and consumes medicine only once', () => {
  const player = makePlayer();
  const msgs: Msg[] = [];

  addItem(player, 'knife', 1);
  useItem(player, 0, msgs, 10);
  assert.equal(player.weapon, 'knife');
  assert.equal(player.inventory?.length, 1);

  addItem(player, 'bandage', 1);
  player.hp = 20;
  useItem(player, 1, msgs, 11);
  assert.equal(player.hp, 35);
  assert.equal(player.inventory?.some(i => i.defId === 'bandage'), false);
});

test('using zhelemish resource applies timed skin and antifungal medicine cures it', () => {
  const player = makePlayer();
  const state = makeGameState({ time: 20 });
  const msgs: Msg[] = [];

  addItem(player, 'zhelemish_dried', 1);
  addItem(player, 'antifungal_ointment', 1);
  useItem(player, 0, msgs, 20, state);
  assert.equal(activeZhelemishSkin(player, 20)?.source, 'zhelemish_treated');
  assert.equal(player.inventory?.some(i => i.defId === 'zhelemish_dried'), false);

  player.hp = 40;
  useItem(player, 0, msgs, 21, state);
  assert.equal(activeZhelemishSkin(player, 21), undefined);
  assert.equal(player.hp, 60);
  assert.ok(getRecentEvents(state).some(e => e.type === 'player_status_cured'));
});

test('ammo and durability consumption update equipped combat state', () => {
  const player = makePlayer();

  addItem(player, 'makarov', 1);
  addItem(player, 'ammo_9mm', 2);
  player.weapon = 'makarov';
  player.attackCd = 0.25;
  assert.equal(getWeaponStats(player).isRanged, true);
  assert.equal(countAmmo(player), 2);
  let readiness = getWeaponReadiness(player);
  assert.equal(readiness.resourceLabel, '9мм 2');
  assert.equal(readiness.cooldownLabel, 'КД 0.3с');
  assert.equal(readiness.cannotFireReason, '');
  assert.equal(consumeAmmo(player), true);
  assert.equal(countAmmo(player), 1);

  player.weapon = 'psi_rupture';
  player.rpg!.psi = 1;
  readiness = getWeaponReadiness(player);
  assert.equal(readiness.resourceLabel, `ПСИ 1/10 -${WEAPON_STATS.psi_rupture.psiCost}`);
  assert.equal(readiness.cannotFireReason, 'нет ПСИ');

  player.weapon = 'knife';
  addItem(player, 'knife', 1);
  const before = getEquippedDurability(player);
  assert.equal(before?.max, WEAPON_STATS.knife.durability);
  const msgs: Msg[] = [];
  for (let i = 0; i < WEAPON_STATS.knife.durability - 1; i++) {
    assert.equal(consumeDurability(player, msgs, 20), false);
  }
  assert.equal(consumeDurability(player, msgs, 21), true);
  assert.equal(player.weapon, '');
  assert.equal(player.inventory?.some(i => i.defId === 'knife'), false);
});

test('RPG rewards, attribute spend, and scaling formulas remain stable', () => {
  const player = makePlayer();
  const msgs: Msg[] = [];

  awardXP(player, xpForLevel(2), msgs, 30);
  assert.equal(player.rpg?.level, 2);
  assert.equal(player.rpg?.attrPoints, 1);
  assert.equal(spendAttrPoint(player, 'str'), true);
  assert.equal(player.rpg?.str, 1);
  assert.equal(player.maxHp, getMaxHp(player.rpg!));

  assert.equal(xpForMonsterKill(MonsterKind.SBORKA, 1), 15);
  assert.equal(scaleMonsterHp(100, 3), 124);
  assert.equal(scaleMonsterDmg(10, 3), 12);

  const difficulty = questDifficulty(30, 100, 2);
  assert.equal(difficulty, 8);
  assert.equal(questXpReward(difficulty), 160);
  assert.equal(questMoneyReward(difficulty), 40);
  assert.equal(ITEMS.water.type, ItemType.DRINK);
});

test('zhelemish skin timing, costs, and combat formulas stay bounded', () => {
  const player = makePlayer();
  player.needs = { food: 100, water: 50, sleep: 100, pee: 0, poo: 0 };
  player.rpg!.psi = 5;
  const state = makeGameState({ time: 10 });

  const applied = applyZhelemishSkin(player, 10, 'zhelemish_raw', state, () => 0);
  assert.equal(applied.badReaction, true);
  assert.equal(player.needs.water, 42);
  assert.equal(player.rpg?.psi, 3);
  assert.equal(zhelemishIncomingMeleeDamage(player, 10, 10), 7);
  assert.equal(zhelemishMoveMult(player, 10), 0.82);
  assert.equal(zhelemishHealingMult(player, 10), 0.55);

  state.time = 12;
  updateZhelemishSkinStatus(player, state, 2);
  assert.equal(Math.round(player.needs.water * 100) / 100, 41.85);
  assert.ok(getRecentEvents(state).some(e => e.type === 'player_status_bad_reaction'));

  assert.equal(cureZhelemishSkin(player, 12, state.msgs, state, 'antibiotic'), true);
  assert.equal(activeZhelemishSkin(player, 12), undefined);

  applyZhelemishSkin(player, 20, 'zhelemish_treated');
  state.time = 200;
  updateZhelemishSkinStatus(player, state, 1);
  assert.equal(activeZhelemishSkin(player, 200), undefined);
});
