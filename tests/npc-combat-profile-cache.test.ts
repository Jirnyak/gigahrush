import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, Faction, Occupation } from '../src/core/types';
import { npcCombatProfile, npcIsBraveActor, resetCombatStimulus } from '../src/systems/combat_stimulus';
import { WEAPON_STATS } from '../src/data/catalog';
import { makeTestEntity } from './helpers';

/**
 * Замок кэша боевой справки.
 *
 * Постоянная половина профиля кэшируется по личности, и цена ошибки здесь —
 * человек, который ходит с новым стволом, а дерётся по старому. Поэтому каждый
 * вход справки проверяется отдельно: сменили — обязано измениться ТЕМ ЖЕ
 * вызовом, без единого такта между.
 */

test('кэш профиля: смену оружия видно тем же вызовом', () => {
  resetCombatStimulus();
  const npc = makeTestEntity({ id: 1, type: EntityType.NPC, hp: 20, maxHp: 20, weapon: '' });

  const bare = npcCombatProfile(npc);
  assert.equal(bare.armed, false);
  assert.equal(bare.ranged, false);

  npc.weapon = 'knife';
  const knife = npcCombatProfile(npc);
  assert.equal(knife.armed, true, 'нож обязан вооружить сразу');
  assert.equal(knife.ranged, false);
  assert.equal(knife.threatScore, 20 * 0.22 + WEAPON_STATS['knife'].dmg + 3);

  npc.weapon = 'gauss';
  const gauss = npcCombatProfile(npc);
  assert.equal(gauss.ranged, true, 'ствол обязан стать дальнобойным сразу');
  assert.equal(
    gauss.threatScore,
    20 * 0.22 + WEAPON_STATS['gauss'].dmg * (WEAPON_STATS['gauss'].pellets ?? 1) * 1.6 + 3,
  );

  // И обратно: разоружение тоже вход, а не только вооружение.
  npc.weapon = '';
  assert.equal(npcCombatProfile(npc).armed, false, 'разоружение обязано сняться сразу');
  assert.equal(npcCombatProfile(npc).ranged, false);
});

test('кэш профиля: смелость пересчитывается на смену занятия, фракции, безумия и странствия', () => {
  resetCombatStimulus();
  const npc = makeTestEntity({
    id: 2, type: EntityType.NPC, faction: Faction.CITIZEN, occupation: Occupation.HOUSEWIFE,
  });
  assert.equal(npcCombatProfile(npc).brave, false);
  assert.equal(npcIsBraveActor(npc), false);

  npc.occupation = Occupation.HUNTER;
  assert.equal(npcCombatProfile(npc).brave, true, 'занятие — вход справки');
  assert.equal(npcIsBraveActor(npc), true, 'быстрый вход обязан отвечать так же');

  npc.occupation = Occupation.HOUSEWIFE;
  assert.equal(npcIsBraveActor(npc), false);

  npc.faction = Faction.LIQUIDATOR;
  assert.equal(npcIsBraveActor(npc), true, 'фракция — вход справки');
  npc.faction = Faction.CITIZEN;
  assert.equal(npcIsBraveActor(npc), false);

  npc.psiMadness = 5;
  assert.equal(npcIsBraveActor(npc), true, 'пси-безумие — вход справки');
  npc.psiMadness = 0;
  assert.equal(npcIsBraveActor(npc), false);

  npc.isTraveler = true;
  assert.equal(npcIsBraveActor(npc), true, 'странник — вход справки');
  npc.isTraveler = false;
  assert.equal(npcIsBraveActor(npc), false);
});

test('кэш профиля: уровень и здоровье пересчитываются', () => {
  resetCombatStimulus();
  const npc = makeTestEntity({
    id: 3, type: EntityType.NPC, hp: 40, maxHp: 40, weapon: '',
    rpg: { level: 1, xp: 0, attrPoints: 0, str: 1, agi: 1, int: 1, psi: 0, maxPsi: 0 },
  });
  const bare = WEAPON_STATS[''].dmg;
  assert.equal(npcCombatProfile(npc).threatScore, 40 * 0.22 + bare + 3);

  npc.rpg!.level = 9;
  assert.equal(npcCombatProfile(npc).threatScore, 40 * 0.22 + bare + 27, 'уровень — вход справки');

  // Здоровье в ключ кэша не входит вовсе: оно обязано читаться на каждом вызове.
  npc.hp = 10;
  const hurt = npcCombatProfile(npc);
  assert.equal(hurt.hpRatio, 10 / 40);
  assert.equal(hurt.threatScore, 10 * 0.22 + bare + 27);
  npc.hp = 40;
  assert.equal(npcCombatProfile(npc).hpRatio, 1);
});

test('кэш профиля: два человека не делят одну справку', () => {
  resetCombatStimulus();
  const armed = makeTestEntity({ id: 4, type: EntityType.NPC, hp: 20, maxHp: 20, weapon: 'gauss' });
  const bare = makeTestEntity({ id: 5, type: EntityType.NPC, hp: 20, maxHp: 20, weapon: '' });

  const a = npcCombatProfile(armed);
  const b = npcCombatProfile(bare);
  assert.equal(a.ranged, true);
  assert.equal(b.ranged, false);
  // Первая справка обязана пережить вторую: общий изменяемый объект сломал бы
  // сравнение двух бойцов внутри одного решения.
  assert.equal(a.ranged, true, 'справка первого не имеет права смениться справкой второго');
  assert.notEqual(a.threatScore, b.threatScore);
});

test('кэш профиля: броня входом не является и профиль не трогает', () => {
  resetCombatStimulus();
  const npc = makeTestEntity({ id: 6, type: EntityType.NPC, hp: 30, maxHp: 30, weapon: 'knife' });
  const before = npcCombatProfile(npc);
  npc.armorDefId = 'kombez';
  npc.monsterArmorStacks = 4;
  npc.monsterArmorChip = 2;
  const after = npcCombatProfile(npc);
  assert.deepEqual(after, before, 'справка брони не читает — и меняться от неё не должна');
});

test('кэш профиля: сброс состояния боя не портит ответ', () => {
  resetCombatStimulus();
  const npc = makeTestEntity({ id: 7, type: EntityType.NPC, hp: 20, maxHp: 20, weapon: 'gauss' });
  const before = npcCombatProfile(npc);
  resetCombatStimulus();
  assert.deepEqual(npcCombatProfile(npc), before);
});
