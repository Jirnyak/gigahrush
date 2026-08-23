/* Замок на память о посещённых комнатах.
 *
 * Кольцо жило приватным `WeakMap` в старом слое AI: оно умирало вместе с
 * сущностью, не переживало ни этаж, ни сейв, и — главное — не доходило до ядра
 * актора, когда тело переехало туда. Память о том, где человек был, принадлежит
 * ЧЕЛОВЕКУ, поэтому теперь живёт колонкой личности A-Life, а оба слоя читают
 * одно и то же кольцо.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, type Entity, type GameState } from '../src/core/types';
import {
  ALIFE_ROOM_VISIT_MEMORY,
  alifeForSave,
  moveAlifeNpcRecord,
  setAlifeState,
} from '../src/systems/alife';
import { noteRoomVisit, roomVisitNovelty, setRoomVisitContext } from '../src/systems/room_visits';
import { floorKeyForDesign } from '../src/systems/floor_keys';
import { makeGameState } from './helpers';

function person(alifeId: number): Entity {
  return {
    id: 500 + alifeId, type: EntityType.NPC, x: 10.5, y: 10.5, angle: 0, pitch: 0,
    alive: true, speed: 1, sprite: 0, alifeId,
  } as Entity;
}

function population(): GameState {
  const state = makeGameState();
  setAlifeState(state, { seed: 4242, total: 64 }, { populationPlan: 'empty_packages' });
  setRoomVisitContext(state);
  return state;
}

test('новизна падает с посещением и восстанавливается по мере забывания', () => {
  const state = population();
  const e = person(1);

  assert.equal(roomVisitNovelty(e, 7), 1, 'незнакомая комната нова целиком');
  noteRoomVisit(e, 7);
  assert.equal(roomVisitNovelty(e, 7), 0, 'откуда только что вышел — не ново вовсе');

  // Кольцо конечно: шесть других комнат вытесняют седьмую совсем.
  for (let i = 0; i < ALIFE_ROOM_VISIT_MEMORY; i++) noteRoomVisit(e, 100 + i);
  assert.equal(roomVisitNovelty(e, 7), 1, 'старое посещение обязано выпасть из кольца');
  assert.equal(roomVisitNovelty(e, 100 + ALIFE_ROOM_VISIT_MEMORY - 1), 0);
  assert.ok(roomVisitNovelty(e, 100) > 0, 'самая давняя из помнящихся уже частично нова');

  // Стояние на месте память не съедает: кольцо хранит переходы.
  for (let i = 0; i < 20; i++) noteRoomVisit(e, 100 + ALIFE_ROOM_VISIT_MEMORY - 1);
  assert.ok(roomVisitNovelty(e, 100) > 0, 'шесть тактов в одной комнате стёрли весь этаж');

  setRoomVisitContext(undefined);
});

test('память принадлежит личности: без личности и без контекста всё ново', () => {
  const state = population();
  const nobody = person(0);
  nobody.alifeId = undefined;
  noteRoomVisit(nobody, 3);
  assert.equal(roomVisitNovelty(nobody, 3), 1, 'у сущности без личности памяти нет');

  const e = person(2);
  noteRoomVisit(e, 3);
  setRoomVisitContext(undefined);
  assert.equal(roomVisitNovelty(e, 3), 1, 'без кадрового контекста память не читается');
  setRoomVisitContext(state);
  assert.equal(roomVisitNovelty(e, 3), 0, 'и возвращается вместе с ним');
  setRoomVisitContext(undefined);
});

test('переезд на другой этаж стирает кольцо: номера комнат этажные', () => {
  const state = population();
  const e = person(3);
  // Сначала явный этаж: у свежей записи ключ ещё не назначен, и «переезд» на
  // первый же ключ переездом не является.
  moveAlifeNpcRecord(state, 3, floorKeyForDesign('living'));
  noteRoomVisit(e, 11);
  assert.equal(roomVisitNovelty(e, 11), 0);

  moveAlifeNpcRecord(state, 3, floorKeyForDesign('ministry'));

  assert.equal(roomVisitNovelty(e, 11), 1,
    'комната 11 на другом этаже — совсем другая комната');
  setRoomVisitContext(undefined);
});

test('кольцо переживает сейв: это прожитое, а не выводимое из семени', () => {
  const state = population();
  const e = person(4);
  noteRoomVisit(e, 21);
  noteRoomVisit(e, 22);

  const saved = alifeForSave(state);
  const restored = makeGameState();
  setAlifeState(restored, saved, { populationPlan: 'empty_packages' });
  setRoomVisitContext(restored);

  assert.equal(roomVisitNovelty(e, 22), 0, 'последняя комната обязана пережить загрузку');
  assert.ok(roomVisitNovelty(e, 21) > 0 && roomVisitNovelty(e, 21) < 1, 'и предпоследняя тоже');
  setRoomVisitContext(undefined);
});
