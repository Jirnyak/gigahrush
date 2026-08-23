import test from 'node:test';
import assert from 'node:assert/strict';
import { Faction, Occupation } from '../src/core/types';
import { RELATION_HOSTILE_THRESHOLD, RELATION_MIN } from '../src/data/relations';
import { seedGlobalRng } from '../src/core/rand';
import { createPrefilledAlifeState } from '../src/systems/alife';
import { floorKeyForDesign } from '../src/systems/floor_keys';
import {
  clearDemosNpcSocialEdges,
  isDemosPersonalEnemy,
  setDemosSocialEdge,
} from '../src/systems/demos_social';
import { isHostile, isPersonalFeudEnemy, setFactionsSocialContext } from '../src/systems/factions';
import { makeGameState, makeTestNpc } from './helpers';

/* Личная вражда — свойство пары людей, а не канал «к игроку». Читается она
   отдельным каналом (`isPersonalFeudEnemy`) и меняет ПОВЕДЕНИЕ: отказ помочь,
   избегание, разборка один на один (`systems/npc_feud.ts`). Боевой целью она
   НЕ делает — иначе двое соседей дружественных фракций открывали бы огонь
   посреди коридора, и мир выедал сам себя без игрока и без монстров. */

function makeSocialState() {
  seedGlobalRng(20260820);
  const state = makeGameState({ currentZ: 0 });
  createPrefilledAlifeState(state, 4242, 3, {
    buckets: [{
      floorKey: floorKeyForDesign('living'),
      z: -6,
      targetCount: 3,
      reserved: [
        { name: 'Сосед Первый', female: false, faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
        { name: 'Сосед Второй', female: false, faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
        { name: 'Сосед Третий', female: true, faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
      ],
    }],
  });
  // Процедурные рёбра случайны — контрольная пара очищается явно.
  clearDemosNpcSocialEdges(state, 1);
  clearDemosNpcSocialEdges(state, 2);
  return state;
}

const first = () => makeTestNpc({ id: 101, alifeId: 1, faction: Faction.CITIZEN, name: 'Сосед Первый' });
const second = () => makeTestNpc({ id: 102, alifeId: 2, faction: Faction.CITIZEN, name: 'Сосед Второй' });

test.afterEach(() => setFactionsSocialContext(undefined));

test('без ребра Демоса соседи одной фракции мирны', () => {
  const state = makeSocialState();
  setFactionsSocialContext(state);
  const a = first();
  const b = second();
  assert.equal(isDemosPersonalEnemy(state, 1, 2), false);
  assert.equal(isPersonalFeudEnemy(a, b), false);
  assert.equal(isHostile(a, b), false);
  assert.equal(isHostile(b, a), false);
});

test('резко отрицательное ребро Демоса заводит личную вражду, но не бой', () => {
  const state = makeSocialState();
  setFactionsSocialContext(state);
  const a = first();
  const b = second();
  assert.equal(isPersonalFeudEnemy(a, b), false);

  assert.equal(setDemosSocialEdge(state, 1, 2, RELATION_MIN), true);
  assert.equal(isDemosPersonalEnemy(state, 1, 2), true);
  assert.equal(isPersonalFeudEnemy(a, b), true);
  // Число зеркалится на встречное ребро, поэтому вражду видят оба.
  assert.equal(isPersonalFeudEnemy(b, a), true);
  // И при этом ни один не считает другого боевой целью.
  assert.equal(isHostile(a, b), false);
  assert.equal(isHostile(b, a), false);

  // Третий сосед в ссоре не участвует.
  const c = makeTestNpc({ id: 103, alifeId: 3, faction: Faction.CITIZEN, name: 'Сосед Третий' });
  assert.equal(isDemosPersonalEnemy(state, 1, 3), false);
  assert.equal(isPersonalFeudEnemy(a, c), false);
});

test('порог вражды — общий RELATION_HOSTILE_THRESHOLD', () => {
  const state = makeSocialState();
  setFactionsSocialContext(state);
  const a = first();
  const b = second();

  setDemosSocialEdge(state, 1, 2, RELATION_HOSTILE_THRESHOLD + 1);
  assert.equal(isPersonalFeudEnemy(a, b), false);

  setDemosSocialEdge(state, 1, 2, RELATION_HOSTILE_THRESHOLD);
  assert.equal(isPersonalFeudEnemy(a, b), true);
});

test('без контекста кадра личная вражда не читается и ничего не падает', () => {
  const state = makeSocialState();
  setDemosSocialEdge(state, 1, 2, RELATION_MIN);
  setFactionsSocialContext(undefined);
  const a = first();
  const b = second();
  assert.equal(isPersonalFeudEnemy(a, b), false);
  assert.equal(isPersonalFeudEnemy(b, a), false);
  assert.equal(isHostile(a, b), false);
  assert.equal(isHostile(b, a), false);
});

test('сущность без alifeId проходит горячий путь без графа', () => {
  const state = makeSocialState();
  setDemosSocialEdge(state, 1, 2, RELATION_MIN);
  setFactionsSocialContext(state);
  const a = first();
  const nameless = makeTestNpc({ id: 104, alifeId: undefined, faction: Faction.CITIZEN, name: 'Безымянный' });
  assert.equal(isPersonalFeudEnemy(a, nameless), false);
  assert.equal(isPersonalFeudEnemy(nameless, a), false);
  assert.equal(isHostile(a, nameless), false);
  assert.equal(isHostile(nameless, a), false);
});

test('пустой слот не читается как вражда: цель 0 и несуществующая строка', () => {
  const state = makeSocialState();
  assert.equal(isDemosPersonalEnemy(state, 1, 0), false);
  assert.equal(isDemosPersonalEnemy(state, 0, 1), false);
  assert.equal(isDemosPersonalEnemy(state, 1, 99999), false);
  assert.equal(isDemosPersonalEnemy(makeGameState({ currentZ: 0 }), 1, 2), false);
});
