import test from 'node:test';
import assert from 'node:assert/strict';

import { Faction, Occupation } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import {
  NPC_FACTION_ATTITUDE_SIGMA,
  NPC_FACTION_ATTITUDE_SLOTS,
  RELATION_HOSTILE_THRESHOLD,
  RELATION_MAX,
  RELATION_MIN,
  RELATION_UNSET,
  factionBaseRelation,
  getFactionRel,
  initFactionRelations,
  npcFactionAttitudeAtBirth,
} from '../src/data/relations';
import {
  addAlifeFactionAttitude,
  alifeForSave,
  createPrefilledAlifeState,
  existingAlifeFactionAttitudes,
  setAlifeState,
} from '../src/systems/alife';
import { floorKeyForDesign } from '../src/systems/floor_keys';
import {
  applyDamageRelationPenalty,
  areFactionsHostile,
  isSideHostileToFaction,
  setFactionsSocialContext,
} from '../src/systems/factions';
import { QUEST_FACTION_RELATION_DELTA } from '../src/systems/npc_relations';
import { makeGameState, makeTestNpc } from './helpers';

/* Враждебность решается ЛИЧНЫМ числом. Матрица осталась источником базы, из
   которой это число рождается один раз, и отвечает за всех, у кого личности
   нет вовсе. Ширина разброса задаёт не характер, а ДОЛЮ: сколько людей считает
   фракцию врагом. */

const SAMPLE = 20_000;

/** Φ(z) рядом Абрамовица–Стегуна 7.1.26 — теста ради, точности хватает. */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

function hostileShare(viewer: Faction, target: Faction, seed: number): number {
  let hostile = 0;
  for (let id = 1; id <= SAMPLE; id++) {
    if (npcFactionAttitudeAtBirth(viewer, target, seed, id) <= RELATION_HOSTILE_THRESHOLD) hostile++;
  }
  return hostile / SAMPLE;
}

function smallState(faction = Faction.CITIZEN, secondFaction = faction) {
  seedGlobalRng(20260823);
  const state = makeGameState({ currentZ: 0 });
  createPrefilledAlifeState(state, 4242, 2, {
    buckets: [{
      floorKey: floorKeyForDesign('living'),
      z: 0,
      targetCount: 2,
      reserved: [
        { name: 'Первый', faction, occupation: Occupation.WORKER, level: 3 },
        { name: 'Второй', faction: secondFaction, occupation: Occupation.WORKER, level: 3 },
      ],
    }],
  });
  return state;
}

test.beforeEach(() => initFactionRelations());
test.afterEach(() => setFactionsSocialContext(undefined));

test('доля врагов равна Φ((порог − база)/σ) по всем двадцати парам', () => {
  for (let viewer = Faction.CITIZEN; viewer <= Faction.WILD; viewer++) {
    for (let target = Faction.CITIZEN; target <= Faction.WILD; target++) {
      if (viewer === target) continue;
      const base = factionBaseRelation(viewer, target);
      // Решение принимается по целому `<= порог`, нормаль непрерывна: поправка
      // в половину ступени.
      const expected = phi((RELATION_HOSTILE_THRESHOLD + 0.5 - base) / NPC_FACTION_ATTITUDE_SIGMA);
      const actual = hostileShare(viewer, target, 4242);
      assert.ok(
        Math.abs(actual - expected) < 0.02,
        `${viewer}→${target}: база ${base}, ожидалось ${(expected * 100).toFixed(2)}%, вышло ${(actual * 100).toFixed(2)}%`,
      );
    }
  }
});

test('таблица асимметрична: смотрящий и тот, на кого смотрят, — разные роли', () => {
  assert.notEqual(factionBaseRelation(Faction.LIQUIDATOR, Faction.CITIZEN), factionBaseRelation(Faction.CITIZEN, Faction.LIQUIDATOR));
  const liqToCit = hostileShare(Faction.LIQUIDATOR, Faction.CITIZEN, 4242);
  const citToLiq = hostileShare(Faction.CITIZEN, Faction.LIQUIDATOR, 4242);
  assert.ok(liqToCit > citToLiq * 4, `ЛИК→ЖИТ ${liqToCit} должно быть много выше ЖИТ→ЛИК ${citToLiq}`);
});

test('к своим по фракции враждебных нет: сторона — принадлежность, а не мнение', () => {
  for (let faction = Faction.CITIZEN; faction <= Faction.WILD; faction++) {
    assert.equal(hostileShare(faction, faction, 4242), 0);
  }
});

test('рождённое число не попадает в служебное -128 и не выходит за шкалу', () => {
  for (let id = 1; id <= SAMPLE; id++) {
    for (let target = Faction.CITIZEN; target <= Faction.WILD; target++) {
      const value = npcFactionAttitudeAtBirth(Faction.WILD, target, 777, id);
      assert.ok(value >= RELATION_MIN && value <= RELATION_MAX, `${value} вне шкалы`);
      assert.notEqual(value, RELATION_UNSET);
    }
  }
});

test('без личности отвечает база таблицы, с личностью — своя ячейка', () => {
  const state = smallState();
  setFactionsSocialContext(state);
  const stray = makeTestNpc({ id: 900, alifeId: undefined, faction: Faction.CITIZEN, name: 'Прохожий' });
  assert.equal(
    isSideHostileToFaction(stray, Faction.CITIZEN, Faction.WILD),
    areFactionsHostile(Faction.CITIZEN, Faction.WILD),
    'у безличного нет своего мнения',
  );

  const resident = makeTestNpc({ id: 901, alifeId: 1, faction: Faction.CITIZEN, name: 'Житель' });
  addAlifeFactionAttitude(state, 1, Faction.LIQUIDATOR, RELATION_MIN);
  assert.equal(isSideHostileToFaction(resident, Faction.CITIZEN, Faction.LIQUIDATOR), true);
  // База «житель → ликвидатор» вражды не знает, а этот житель — знает.
  assert.equal(areFactionsHostile(Faction.CITIZEN, Faction.LIQUIDATOR), false);
});

test('запасные слоты хранят сентинел и падают на базу', () => {
  const state = smallState();
  const column = existingAlifeFactionAttitudes(state)!;
  for (let slot = Faction.PLAYER; slot < NPC_FACTION_ATTITUDE_SLOTS; slot++) {
    assert.equal(column[slot], RELATION_UNSET, `слот ${slot} должен быть свободен`);
  }
  setFactionsSocialContext(state);
  const resident = makeTestNpc({ id: 902, alifeId: 1, faction: Faction.CITIZEN, name: 'Житель' });
  // Отношение к игроку — отдельный канал, и через эту дверь оно не читается.
  assert.equal(
    isSideHostileToFaction(resident, Faction.CITIZEN, Faction.PLAYER),
    areFactionsHostile(Faction.CITIZEN, Faction.PLAYER),
  );
});

test('накопленное отклонение переживает сохранение разреженным оверрайдом', () => {
  const state = smallState();
  const born = existingAlifeFactionAttitudes(state)![Faction.WILD];
  const moved = addAlifeFactionAttitude(state, 1, Faction.WILD, -9);
  assert.equal(moved, born - 9);

  const save = alifeForSave(state);
  const drifted = save.overrides.filter(o => o.factionAttitude !== undefined);
  assert.equal(drifted.length, 1, 'сохраняется только тот, у кого отклонение есть');
  assert.equal(drifted[0].id, 1);
  assert.equal(drifted[0].factionAttitude![Faction.WILD], -9);
  assert.equal(drifted[0].factionAttitude![Faction.CITIZEN], 0);

  const restored = makeGameState({ currentZ: 0 });
  setAlifeState(restored, save, {
    populationPlan: {
      buckets: [{
        floorKey: floorKeyForDesign('living'),
        z: 0,
        targetCount: 2,
        reserved: [
          { name: 'Первый', faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
          { name: 'Второй', faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
        ],
      }],
    },
  });
  const back = existingAlifeFactionAttitudes(restored)!;
  assert.equal(back[Faction.WILD], born - 9, 'отклонение легло поверх пересчитанной базы');
  assert.equal(back[Faction.CITIZEN], existingAlifeFactionAttitudes(state)![Faction.CITIZEN]);
});

test('столбец игрока через фракционную дверь не двигается: у него свой канал', () => {
  const state = smallState();
  assert.equal(addAlifeFactionAttitude(state, 1, Faction.PLAYER, -40), undefined);
  const column = existingAlifeFactionAttitudes(state)!;
  assert.equal(column[Faction.PLAYER], RELATION_UNSET);
});

test('удар с чужой стороны роняет отношение жертвы к фракции обидчика, свою не трогает', () => {
  // Фракцию обидчика берёт ЗАПИСЬ A-Life, а не сущность: отношение к фракции —
  // факт личности, он переживает выгрузку этажа.
  const state = smallState(Faction.CITIZEN, Faction.LIQUIDATOR);
  setFactionsSocialContext(state);
  const victim = makeTestNpc({ id: 910, alifeId: 1, faction: Faction.CITIZEN, name: 'Жертва' });
  const shooter = makeTestNpc({ id: 911, alifeId: 2, faction: Faction.LIQUIDATOR, name: 'Стрелок' });
  const column = existingAlifeFactionAttitudes(state)!;
  const beforeLiq = column[Faction.LIQUIDATOR];
  const beforeCit = column[Faction.CITIZEN];

  applyDamageRelationPenalty(Faction.LIQUIDATOR, Faction.CITIZEN, 40, victim, shooter, state);

  // Шаг один и тот же при любой величине повода: обида на ЧЕЛОВЕКА стоит полную
  // цену, на всю его фракцию переносится ровно ступень.
  assert.equal(column[Faction.LIQUIDATOR], beforeLiq - QUEST_FACTION_RELATION_DELTA);
  assert.equal(column[Faction.CITIZEN], beforeCit, 'своя фракция — принадлежность, а не мнение');
  // Матрицу фракций случайность по-прежнему не двигает.
  assert.equal(getFactionRel(Faction.CITIZEN, Faction.LIQUIDATOR), factionBaseRelation(Faction.CITIZEN, Faction.LIQUIDATOR));
});
