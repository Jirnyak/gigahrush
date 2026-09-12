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

/* Личная вражда — свойство пары людей, а не канал «к игроку», и РЕШАЕТ она
   раньше фракций. Ненавидящий конкретного человека враждебен ему, даже когда их
   нашивки в мире: `isHostile` спрашивает личное ребро (`isPersonalFeudEnemy`)
   перед личным отношением к стороне, а глобальная матрица остаётся последней.
   Помимо боя вражда по-прежнему платит поведением — отказ помочь, избегание
   комнаты, разборка один на один (`systems/npc_feud.ts`).

   ПОПРАВКА 2026-09-12, решение владельца. До неё правило было обратным: личное
   ребро боевой целью НЕ делало (2026-08-23), и за этим стоял замер — двое из
   ДРУЖЕСТВЕННЫХ фракций открывали огонь посреди коридора. Владелец выбрал
   «личное решает всегда» и цену принял; она замерена на живых этажах и записана
   в `problems.md`. Прежний замок стоял ровно на снятом правиле и переписан по
   существу, а не подогнан порогом. */

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

test('резко отрицательное ребро Демоса делает боевой целью вопреки общим нашивкам', () => {
  const state = makeSocialState();
  setFactionsSocialContext(state);
  const a = first();
  const b = second();
  // Исходно — одна фракция и никакой личной истории: мир.
  assert.equal(isPersonalFeudEnemy(a, b), false);
  assert.equal(isHostile(a, b), false);

  assert.equal(setDemosSocialEdge(state, 1, 2, RELATION_MIN), true);
  assert.equal(isDemosPersonalEnemy(state, 1, 2), true);
  assert.equal(isPersonalFeudEnemy(a, b), true);
  // Число зеркалится на встречное ребро, поэтому вражду видят оба.
  assert.equal(isPersonalFeudEnemy(b, a), true);
  // И оба считают другого боевой целью, хотя фракция у них ОДНА.
  assert.equal(isHostile(a, b), true, 'личное решает раньше фракции — иначе ненависть ничего не стоит');
  assert.equal(isHostile(b, a), true);

  // Третий сосед в ссоре не участвует и остаётся мирным обоим.
  const c = makeTestNpc({ id: 103, alifeId: 3, faction: Faction.CITIZEN, name: 'Сосед Третий' });
  assert.equal(isDemosPersonalEnemy(state, 1, 3), false);
  assert.equal(isPersonalFeudEnemy(a, c), false);
  assert.equal(isHostile(a, c), false, 'вражда осталась делом двоих, а не объявлением войны всем');
});

test('неприязнь выше порога вражды боевой целью не делает', () => {
  /* Граница на месте: «решают личные отношения» не значит «любая обида — повод
   * стрелять». Целью делает только число ниже общего порога вражды, иначе
   * прохладные соседи начали бы убивать друг друга. */
  const state = makeSocialState();
  setFactionsSocialContext(state);
  const a = first();
  const b = second();
  assert.equal(setDemosSocialEdge(state, 1, 2, RELATION_HOSTILE_THRESHOLD + 1), true);
  assert.equal(isPersonalFeudEnemy(a, b), false);
  assert.equal(isHostile(a, b), false);
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
