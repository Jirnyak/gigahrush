import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Feature, RoomType } from '../src/core/types';
import {
  ROOM_AFFORDANCES,
  roomAffordanceDef,
  roomAffordanceTags,
  roomAffordanceWeight,
  roomExpectedFeatures,
  roomSupports,
} from '../src/data/room_affordances';
import {
  npcUtilityRoomInterest,
  npcUtilityRoomTypeWeightForIntent,
} from '../src/systems/ai/npc_utility';

const ALL_ROOM_TYPES = Object.values(RoomType).filter(value => typeof value === 'number') as RoomType[];

test('every RoomType has a room affordance registry row', () => {
  for (const type of ALL_ROOM_TYPES) {
    assert.equal(ROOM_AFFORDANCES[type]?.roomType, type, `${RoomType[type]} should have affordance metadata`);
    assert.ok(roomAffordanceTags(type).length > 0, `${RoomType[type]} should expose tags`);
  }
});

test('core living affordances are centralized by room type', () => {
  assert.equal(roomSupports(RoomType.KITCHEN, 'eat'), true);
  assert.equal(roomSupports(RoomType.KITCHEN, 'drink'), true);
  assert.equal(roomSupports(RoomType.BATHROOM, 'toilet'), true);
  assert.equal(roomSupports(RoomType.BATHROOM, 'drink'), true);
  assert.equal(roomSupports(RoomType.LIVING, 'sleep'), true);
  assert.equal(roomSupports(RoomType.LIVING, 'hide'), true);
  assert.equal(roomSupports(RoomType.LIVING, 'shelter'), true);
  assert.equal(roomSupports(RoomType.PRODUCTION, 'work'), true);
  assert.equal(roomSupports(RoomType.OFFICE, 'work'), true);
  assert.equal(roomSupports(RoomType.MEDICAL, 'heal'), true);
  assert.equal(roomSupports(RoomType.STORAGE, 'store'), true);
  assert.equal(roomSupports(RoomType.STORAGE, 'shelter'), true);
  assert.equal(roomSupports(RoomType.MEDICAL, 'shelter'), true);
  assert.equal(roomSupports(RoomType.OFFICE, 'shelter'), true);
  assert.equal(roomSupports(RoomType.COMMON, 'social'), true);
  assert.equal(roomSupports(RoomType.SMOKING, 'social'), true);
  assert.equal(roomSupports(RoomType.HQ, 'patrol'), true);
  assert.equal(roomSupports(RoomType.HQ, 'shelter'), true);
});

/* ── Обход адресуется проходным и общим комнатам, а не рабочим ──────
 *
 * `patrol` ненулевой ровно у CORRIDOR 24, HQ 20, COMMON 12, MARKET 10, и это
 * ЗАМЫСЕЛ, а не пропуск: обход стоит там, где ходят все, — проход, штаб, общий
 * зал, ряд. Ноль у OFFICE читается как дефект («часовому на караулке нечего
 * делать») и уже дважды предлагался к правке, поэтому правило закреплено здесь,
 * а не в комментарии этажа.
 *
 * Замерено: OFFICE по игре — это контора, а не пост. На шести крупных этажах
 * 2312 комнат типа OFFICE, и караульных среди них 281 — все 279 с одного этажа
 * (`Караулка` в жребии кварталов `src/gen/liquidatorbase/fort.ts`); на жилом,
 * министерстве, квартирах и аду их ноль. Выдача `patrol: 12` типу OFFICE объём
 * обхода НЕ поднимает (жилой 9.1% → 8.9%, база 11.5% → 11.1%: объём задаёт тяга
 * драйва, а не запас комнат) и лишь уводит часовых в чужие кабинеты — на жилом
 * доля обхода, проведённая в OFFICE, 1.9% → 10.3%. Значит починка не здесь: пост,
 * объявленный конторой, чинится типом СВОЕЙ комнаты.
 *
 * Правило берётся из тегов самой таблицы, а не из списка типов: список пришлось
 * бы править под каждый новый тип, а тег «проходная/общая/караульная» — это и
 * есть то свойство, из-за которого комнату обходят. Обратное неверно намеренно:
 * SHOP и BAR публичны, но обход в них не стоит.
 */
const PATROLLABLE_TAGS = ['passage', 'public', 'hall', 'guard'] as const;

test('patrol is offered only by through/public/guard rooms', () => {
  for (const type of ALL_ROOM_TYPES) {
    if (roomAffordanceWeight(type, 'patrol') <= 0) continue;
    const tags = roomAffordanceTags(type);
    assert.ok(
      PATROLLABLE_TAGS.some(tag => tags.includes(tag)),
      `${RoomType[type]} предлагает обход, но по тегам не проходная и не общая: ${tags.join(', ')}`,
    );
  }
});

test('office is a workroom, not a guard post', () => {
  assert.equal(roomSupports(RoomType.OFFICE, 'work'), true);
  assert.equal(
    roomAffordanceWeight(RoomType.OFFICE, 'patrol'), 0,
    'контора — рабочая комната; караульный пост чинится типом своей комнаты, а не строкой OFFICE',
  );
});

test('room expected features describe feature-first interactable surfaces', () => {
  assert.equal(roomExpectedFeatures(RoomType.KITCHEN).includes(Feature.STOVE), true);
  assert.equal(roomExpectedFeatures(RoomType.BATHROOM).includes(Feature.TOILET), true);
  assert.equal(roomExpectedFeatures(RoomType.PRODUCTION).includes(Feature.MACHINE), true);
  assert.equal(roomExpectedFeatures(RoomType.OFFICE).includes(Feature.DESK), true);
});

/* Телесные намерения (`eat`, `drink`, `sleep`, `toilet`, `heal`) уехали в ядро
 * актора и у этого слоя их больше нет: назначение комнаты называется ПРЯМО
 * (`affordance`), а не выводится из намерения. Требование при этом не изменилось
 * — вес по-прежнему берётся из реестра `ROOM_AFFORDANCES` и нигде не дублируется,
 * поэтому проверяется тот же реестр, только через новую дорогу. */
test('NPC utility target scoring consumes room affordance weights for named affordances', () => {
  const bare = { intent: 'wander' as const };
  assert.equal(npcUtilityRoomInterest(RoomType.KITCHEN, { ...bare, affordance: 'eat' }), roomAffordanceWeight(RoomType.KITCHEN, 'eat'));
  assert.equal(npcUtilityRoomInterest(RoomType.BATHROOM, { ...bare, affordance: 'drink' }), roomAffordanceWeight(RoomType.BATHROOM, 'drink'));
  assert.equal(npcUtilityRoomInterest(RoomType.LIVING, { ...bare, affordance: 'sleep' }), roomAffordanceWeight(RoomType.LIVING, 'sleep'));
  assert.equal(npcUtilityRoomInterest(RoomType.BATHROOM, { ...bare, affordance: 'toilet' }), roomAffordanceWeight(RoomType.BATHROOM, 'toilet'));
  assert.equal(npcUtilityRoomInterest(RoomType.MEDICAL, { ...bare, affordance: 'heal' }), roomAffordanceWeight(RoomType.MEDICAL, 'heal'));
  // Намерения, оставшиеся у этого слоя, берут вес из того же реестра.
  assert.equal(npcUtilityRoomTypeWeightForIntent('patrol', RoomType.CORRIDOR), roomAffordanceWeight(RoomType.CORRIDOR, 'patrol'));
  assert.equal(npcUtilityRoomTypeWeightForIntent('social', RoomType.COMMON), roomAffordanceWeight(RoomType.COMMON, 'social'));
});

test('routine safety keeps its narrower pre-registry room scoring', () => {
  assert.equal(npcUtilityRoomTypeWeightForIntent('safety', RoomType.LIVING), roomAffordanceWeight(RoomType.LIVING, 'shelter'));
  assert.equal(npcUtilityRoomTypeWeightForIntent('safety', RoomType.HQ), roomAffordanceWeight(RoomType.HQ, 'shelter'));
  assert.equal(npcUtilityRoomTypeWeightForIntent('safety', RoomType.COMMON), roomAffordanceWeight(RoomType.COMMON, 'shelter'));
  assert.equal(npcUtilityRoomTypeWeightForIntent('safety', RoomType.STORAGE), 0);
  assert.equal(npcUtilityRoomTypeWeightForIntent('flee', RoomType.MEDICAL), 0);
  assert.equal(npcUtilityRoomTypeWeightForIntent('flee', RoomType.OFFICE), 0);
});

test('room affordance def returns the full definition for a room type', () => {
  const livingDef = roomAffordanceDef(RoomType.LIVING);
  assert.deepEqual(livingDef, ROOM_AFFORDANCES[RoomType.LIVING]);

  const hqDef = roomAffordanceDef(RoomType.HQ);
  assert.deepEqual(hqDef, ROOM_AFFORDANCES[RoomType.HQ]);
});
