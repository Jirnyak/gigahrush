import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, Faction, Occupation } from '../src/core/types';
import { npcCombatProfile } from '../src/systems/combat_stimulus';
import { WEAPON_STATS } from '../src/data/catalog';
import { makeTestEntity } from './helpers';

test('npcCombatProfile: brave logic', async (t) => {
  await t.test('brave when psiMadness > 0', () => {
    const npc = makeTestEntity({ id: 1, type: EntityType.NPC, psiMadness: 10, faction: Faction.CITIZEN, occupation: Occupation.HOUSEWIFE });
    const profile = npcCombatProfile(npc);
    assert.equal(profile.brave, true);
  });

  await t.test('brave when occupation has combat/patrol tag (HUNTER)', () => {
    const npc = makeTestEntity({ id: 2, type: EntityType.NPC, faction: Faction.CITIZEN, occupation: Occupation.HUNTER });
    const profile = npcCombatProfile(npc);
    assert.equal(profile.brave, true);
  });

  await t.test('brave when faction is LIQUIDATOR, CULTIST, or WILD', () => {
    const liq = makeTestEntity({ id: 3, type: EntityType.NPC, faction: Faction.LIQUIDATOR, occupation: Occupation.HOUSEWIFE });
    assert.equal(npcCombatProfile(liq).brave, true);

    const cult = makeTestEntity({ id: 4, type: EntityType.NPC, faction: Faction.CULTIST, occupation: Occupation.HOUSEWIFE });
    assert.equal(npcCombatProfile(cult).brave, true);

    const wild = makeTestEntity({ id: 5, type: EntityType.NPC, faction: Faction.WILD, occupation: Occupation.HOUSEWIFE });
    assert.equal(npcCombatProfile(wild).brave, true);
  });

  await t.test('not brave when none of the conditions are met', () => {
    const npc = makeTestEntity({ id: 6, type: EntityType.NPC, faction: Faction.CITIZEN, occupation: Occupation.HOUSEWIFE });
    const profile = npcCombatProfile(npc);
    assert.equal(profile.brave, false);
  });
});

test('npcCombatProfile: weapon logic (armed & ranged)', async (t) => {
  await t.test('unarmed (default bare hands)', () => {
    const npc = makeTestEntity({ id: 7, type: EntityType.NPC, weapon: '' });
    const profile = npcCombatProfile(npc);
    assert.equal(profile.armed, false);
    assert.equal(profile.ranged, false);
  });

  await t.test('armed with basic melee (>3 dmg)', () => {
    const npc = makeTestEntity({ id: 8, type: EntityType.NPC, weapon: 'knife' });
    const profile = npcCombatProfile(npc);
    assert.equal(profile.armed, true);
    assert.equal(profile.ranged, false);
  });

  /* Стволу нужен ПАТРОН, и с 2026-08-29 справка это знает. До этого стрелок с
   * пустым магазином числился вооружённым: по расчёту сил он оставался бойцом,
   * поэтому стоял на месте и «отстреливался» вхолостую вместо того, чтобы
   * разорвать контакт и сходить за патронами. Замер на базе ликвидаторов: 61
   * стрелок из 171 опустошался за десять минут, и вернуться к патронам
   * удавалось двоим. */
  await t.test('armed with ranged weapon — только с патронами', () => {
    const ws = WEAPON_STATS['gauss'];
    assert.ok(ws?.ammoType, 'тест держится на том, что гауссу нужен патрон');

    const dry = makeTestEntity({ id: 9, type: EntityType.NPC, weapon: 'gauss' });
    assert.equal(npcCombatProfile(dry).armed, false, 'пустой ствол — не оружие');
    assert.equal(npcCombatProfile(dry).ranged, true, 'но он всё ещё дальнобойный');

    const loaded = makeTestEntity({
      id: 19, type: EntityType.NPC, weapon: 'gauss',
      inventory: [{ defId: ws!.ammoType!, count: 10 }],
    });
    assert.equal(npcCombatProfile(loaded).armed, true);
    assert.equal(npcCombatProfile(loaded).ranged, true);
  });

  /* Чужой магазин со стороны НЕ виден: вес актора читают соседи, когда решают,
   * драться ли. Пустота ствола меняет решение только своего хозяина. */
  await t.test('пустой магазин не делает стрелка менее страшным для других', () => {
    const ws = WEAPON_STATS['gauss'];
    const dry = makeTestEntity({ id: 29, type: EntityType.NPC, weapon: 'gauss', hp: 50, maxHp: 50 });
    const loaded = makeTestEntity({
      id: 39, type: EntityType.NPC, weapon: 'gauss', hp: 50, maxHp: 50,
      inventory: [{ defId: ws!.ammoType!, count: 10 }],
    });
    assert.equal(npcCombatProfile(dry).threatScore, npcCombatProfile(loaded).threatScore);
  });
});

test('npcCombatProfile: HP logic (hpRatio)', async (t) => {
  await t.test('hpRatio correctly calculated', () => {
    const npc = makeTestEntity({ id: 10, type: EntityType.NPC, hp: 10, maxHp: 50 });
    const profile = npcCombatProfile(npc);
    assert.equal(profile.hpRatio, 10 / 50);
  });

  await t.test('fallback logic (20/20)', () => {
    const npc = makeTestEntity({ id: 11, type: EntityType.NPC });
    delete npc.hp;
    delete npc.maxHp;
    const profile = npcCombatProfile(npc);
    assert.equal(profile.hpRatio, 1);
  });

  await t.test('hp is bounded', () => {
    const npc = makeTestEntity({ id: 12, type: EntityType.NPC, hp: -5, maxHp: 50 });
    const profile = npcCombatProfile(npc);
    assert.equal(profile.hpRatio, 0); // Math.max(0, -5) / maxHp
  });
});

test('npcCombatProfile: threatScore logic', async (t) => {
  await t.test('threatScore calculations match expected values', () => {
    // threatScore = hp * 0.22 + weaponScore + levelScore
    // levelScore = Math.max(1, level) * 3
    // weaponScore for ranged = ws.dmg * ws.pellets * 1.6
    // weaponScore for melee = ws.dmg

    const knifeNpc = makeTestEntity({
      id: 13,
      type: EntityType.NPC,
      hp: 20,
      maxHp: 20,
      weapon: 'knife',
      rpg: { level: 2, xp: 0, attrPoints: 0, str: 1, agi: 1, int: 1, psi: 0, maxPsi: 0 }
    });
    // hp: 20 * 0.22 = 4.4
    // weapon: 'knife' dmg is 7 -> weaponScore = 7
    // levelScore: 2 * 3 = 6
    // total: 4.4 + 7 + 6 = 17.4
    const knifeProfile = npcCombatProfile(knifeNpc);
    assert.equal(knifeProfile.threatScore, 20 * 0.22 + 7 + 6);

    const gaussNpc = makeTestEntity({
      id: 14,
      type: EntityType.NPC,
      hp: 10,
      maxHp: 20,
      weapon: 'gauss',
      rpg: { level: 5, xp: 0, attrPoints: 0, str: 1, agi: 1, int: 1, psi: 0, maxPsi: 0 }
    });
    // 'gauss' stats: dmg 180, pellets 1, isRanged true
    // hp: 10 * 0.22 = 2.2
    // weaponScore: 180 * 1 * 1.6 = 288
    // levelScore: 5 * 3 = 15
    // total: 2.2 + 288 + 15 = 305.2
    const gaussProfile = npcCombatProfile(gaussNpc);
    assert.equal(gaussProfile.threatScore, 10 * 0.22 + (180 * 1 * 1.6) + 15);
  });
});

/* Пси-инструмент — тоже оружие, и все три справки о силе обязаны это видеть.
 *
 * До 2026-08-29 они читали ОДИН слот `weapon`, а бой берёт оружие через
 * `equippedCombatItemId` (слот ИЛИ пси-инструмент). Расхождение стоило дорого:
 * культист с пси-крюком на 50 урона числился безоружным, а `npcShouldFightThreat`
 * безоружному и несмелому всегда отвечает «беги» — то есть целый род бойцов не
 * дрался вовсе и ничего не весил в раскладе сил сверх здоровья и уровня.
 * Замерено на маршруте: 2 таких человека из 7225 в населении этажей, но 100% из
 * них судились неверно, а сцены раздают культистам пси-удар штатным
 * `generateNpcLoadout`.
 */
test('пси в руках — это вооружён: справка о силе читает то же, чем дерётся бой', () => {
  const psiId = Object.keys(WEAPON_STATS).find(id => (WEAPON_STATS[id]?.psiCost ?? 0) > 0
    && (WEAPON_STATS[id]?.dmg ?? 0) > 3);
  assert.ok(psiId, 'в каталоге обязан быть хоть один боевой пси-инструмент');

  const bare = makeTestEntity({
    id: 900, type: EntityType.NPC, faction: Faction.CITIZEN,
    occupation: Occupation.HOUSEWIFE, hp: 100, maxHp: 100,
  });
  const psi = makeTestEntity({
    id: 901, type: EntityType.NPC, faction: Faction.CITIZEN,
    occupation: Occupation.HOUSEWIFE, hp: 100, maxHp: 100, tool: psiId,
  });

  assert.equal(npcCombatProfile(bare).armed, false, 'с пустыми руками — безоружен');
  assert.equal(npcCombatProfile(psi).armed, true, 'с боевым пси в руках — вооружён');
  // И весит он больше пустых рук: иначе расклад сил по-прежнему его не считает.
  assert.ok(npcCombatProfile(psi).threatScore > npcCombatProfile(bare).threatScore,
    'пси обязано добавлять веса в раскладе сил');
});
