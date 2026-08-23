import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { syncNextEntityId } from '../src/gen/content_manifest_utils';
import { firstRuntimeEntityId } from '../src/gen/entity_ids';
import { EntityType, type Entity } from '../src/core/types';

/* Договор у `syncNextEntityId` с 2026-08-22 такой: «продвинуть счётчик за уже
 * расставленные сущности, но НЕ НИЖЕ порога выдачи». Нижнюю границу вызывающий
 * больше не задаёт и задать не может — она одна на всю генерацию и живёт в
 * `firstRuntimeEntityId()`.
 *
 * Раньше функция возвращала переданное число как есть, и общие шаги населения,
 * зовущие её с нулём, на этаже с пустым генератором получали единицу: всё
 * население садилось прямо в диапазон номеров сюжетных слотов. */

const FLOOR = firstRuntimeEntityId();

test('syncNextEntityId поднимает пустой массив до порога выдачи', () => {
  assert.equal(syncNextEntityId([], 10), FLOOR);
  assert.equal(syncNextEntityId([], 0), FLOOR);
});

test('syncNextEntityId не опускается ниже порога из-за мелких id', () => {
  const entities = [
    { id: 1 } as Entity,
    { id: 5 } as Entity,
  ];
  assert.equal(syncNextEntityId(entities, 10), FLOOR);
});

test('syncNextEntityId возвращает max id + 1, когда он выше порога', () => {
  const entities = [
    { id: FLOOR + 5 } as Entity,
    { id: FLOOR + 12 } as Entity,
    { id: FLOOR + 10 } as Entity,
  ];
  assert.equal(syncNextEntityId(entities, FLOOR), FLOOR + 13);
});

test('syncNextEntityId уважает запрошенное начало, если оно выше порога', () => {
  const entities = [
    { id: FLOOR + 1 } as Entity,
  ];
  assert.equal(syncNextEntityId(entities, FLOOR + 500), FLOOR + 500);
});

test('заготовки с неположительным номером счётчик не двигают', () => {
  // `id <= 0` — метка шаблона жителя для A-Life, а не адрес.
  const entities = [
    { id: -1, type: EntityType.NPC } as Entity,
    { id: -1, type: EntityType.NPC } as Entity,
  ];
  assert.equal(syncNextEntityId(entities, 0), FLOOR);
});
