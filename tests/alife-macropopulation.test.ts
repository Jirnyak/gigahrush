import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { EntityType, type Entity, type GameState } from '../src/core/types';
import { initFactionRelations } from '../src/data/relations';
import { materializeAlifeFloorPopulation, needsAlifeAdoption } from '../src/systems/alife';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { makeGameState } from './helpers';

/* Каждый живой человек обязан числиться в макропопуляции A-Life. Без записи он
 * не умирает по-настоящему, не имеет отношений, не виден Демосу и не
 * сворачивается при уходе с этажа — то есть остаётся на экране, но выпадает из
 * мира. Раньше так жили телохранители Махно на коллекторах: генератор не
 * проставлял им `questId`, и усыновление их молча пропускало.
 *
 * Коллекторы в списке обязательны — это тот самый этаж. Остальные взяты как
 * разные способы населять этаж: авторский, жилой, министерский, процедурный. */
const FLOORS = ['maintenance', 'living', 'ministry', 'kvartiry', 'moebius_podezd'] as const;
const SEED = 61061;

for (const floorId of FLOORS) {
  test(`этаж ${floorId}: ни одного живого NPC вне макропопуляции`, () => {
    initFactionRelations();
    const gen = generateDesignFloor(floorId, SEED);
    const state = makeGameState() as GameState;
    const entities = gen.entities as Entity[];

    materializeAlifeFloorPopulation(state, gen.world, entities, { v: 2_000_000 }, `design:${floorId}`);

    const live = entities.filter(e => e.type === EntityType.NPC && e.alive);
    assert.ok(live.length > 0, 'этаж вообще без людей — проверять нечего');
    const orphans = live.filter(needsAlifeAdoption);
    const names = [...new Set(orphans.map(o => o.name ?? '<без имени>'))].slice(0, 6);
    assert.equal(
      orphans.length, 0,
      `${orphans.length} человек вне A-Life: ${names.join(' | ')}`,
    );
  });
}

test('усыновление не трогает авторские личности: у них свой резерв', () => {
  const authored: Entity = {
    id: 1, type: EntityType.NPC, x: 1, y: 1, angle: 0, pitch: 0,
    alive: true, speed: 1, sprite: 0,
    persistentNpcId: 'npc:some_package',
  } as Entity;
  assert.equal(needsAlifeAdoption(authored), false);
});

test('усыновлению подлежит любой безымянный житель без записи, чем бы ни был его questId', () => {
  const base = {
    type: EntityType.NPC, x: 1, y: 1, angle: 0, pitch: 0,
    alive: true, speed: 1, sprite: 0,
  };
  // Ровно эта форма и выпадала: имя есть, id есть, поля `questId` нет вовсе.
  assert.equal(needsAlifeAdoption({ ...base, id: 6814, name: 'Дикий боец' } as Entity), true);
  assert.equal(needsAlifeAdoption({ ...base, id: 6815, questId: -1 } as Entity), true);
  assert.equal(needsAlifeAdoption({ ...base, id: 6816, questId: -25025 } as Entity), true);
  assert.equal(needsAlifeAdoption({ ...base, id: 6817, alifeId: 12 } as Entity), false);
});
