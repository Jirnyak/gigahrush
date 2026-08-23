/* Замок на нумерацию сущностей.
 *
 * Два правила, и оба про одно: номер сущности — адрес, и адрес обязан быть один.
 *
 *   1. Номер уникален на этаже. Два тела под одним номером расходятся во
 *      мнениях: индекс отдаёт одно, `Array.find` — другое, и панель диалога
 *      рисуется из листовки, пока кнопки работают с человеком.
 *   2. Обычная сущность не садится в диапазон `1..getPlotNpcCount()`. Там живут
 *      номера слотов сюжетных личностей: их читают A-Life, сейв и `isPlotNpc`.
 *      Самозванец в этом диапазоне заставляет A-Life вычистить его как
 *      «переехавшего» — так с ада каждую загрузку пропадали два Сторожа,
 *      Скрежет, Пасть и Певчий налога, — а его смерть навсегда записывает в
 *      сохранение флаг «эта сюжетная личность мертва».
 *
 * Проверяется ПОСЛЕ всей сборки этажа: генератор, общее население, монстры и
 * доставка авторских пакетов. Ловить надо то, что уходит игроку, а не то, что
 * вышло из одной фазы.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import type { Entity } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { initFactionRelations } from '../src/data/relations';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import { getPlotNpcCount } from '../src/data/npc_packages';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { firstRuntimeEntityId } from '../src/gen/entity_ids';
import { generateFloor } from '../src/gen/floor_manifest';

const SEED = 61_061;
/** Нечётные этажи собираются процедурно и своей нумерации не наследуют. */
const PROCEDURAL_Z = [1, -1, 15, -27];

interface Report {
  duplicates: string[];
  squatters: string[];
}

function inspect(entities: readonly Entity[]): Report {
  const slots = getPlotNpcCount();
  const seen = new Set<number>();
  const duplicates: string[] = [];
  const squatters: string[] = [];
  for (const entity of entities) {
    /* Неположительный номер — не адрес, а МЕТКА ЗАГОТОВКИ: по `id <= 0`
     * `isAmbientNpcCandidate` узнаёт шаблон жителя, которого наполнит A-Life.
     * Процедурные этажи ставят так всё население; настоящий номер приходит с
     * материализацией. Требовать от заготовок уникальности — значит требовать,
     * чтобы они перестали быть заготовками. */
    if (entity.id <= 0) continue;
    if (seen.has(entity.id)) duplicates.push(`${entity.id} (тип ${entity.type}${entity.name ? ` ${entity.name}` : ''})`);
    seen.add(entity.id);
    // Личность опознаётся по `alifeId`, а не по номеру: сюжетному человеку
    // диапазон слотов принадлежит по праву, всем прочим — нет.
    if (entity.id >= 1 && entity.id <= slots && entity.alifeId === undefined) {
      squatters.push(`${entity.id} (тип ${entity.type}${entity.name ? ` ${entity.name}` : ''})`);
    }
  }
  return { duplicates, squatters };
}

function assertClean(label: string, entities: readonly Entity[]): void {
  const { duplicates, squatters } = inspect(entities);
  assert.deepEqual(duplicates.slice(0, 8), [],
    `${label}: ${duplicates.length} сущностей делят чужой номер`);
  assert.deepEqual(squatters.slice(0, 8), [],
    `${label}: ${squatters.length} обычных сущностей сидят в диапазоне сюжетных слотов 1..${getPlotNpcCount()}`);
}

test('каждый дизайн-этаж выдаёт уникальные номера вне диапазона слотов', () => {
  for (const route of DESIGN_FLOOR_ROUTES) {
    seedGlobalRng(1);
    initFactionRelations();
    assertClean(`design:${route.id}`, generateDesignFloor(route.id, SEED).entities);
  }
});

test('процедурные этажи нумеруют так же', () => {
  for (const z of PROCEDURAL_Z) {
    seedGlobalRng(1);
    initFactionRelations();
    assertClean(`procedural:z=${z}`, generateFloor(z, SEED).entities);
  }
});

test('авторская личность живёт в alifeId, а номер сущности обычный', () => {
  /* Корень прежнего класса: доставка выдавала авторскому человеку номер
   * сущности, РАВНЫЙ его слоту, и сотня мест по всему коду читала `entity.id`
   * там, где имелась в виду личность. Пока совпадение держалось, это работало;
   * стоило обычной сущности попасть в слотовый диапазон — она выдавала себя за
   * человека. Здесь проверяется, что совпадения больше нет и не вернётся. */
  const slots = getPlotNpcCount();
  for (const route of DESIGN_FLOOR_ROUTES) {
    seedGlobalRng(1);
    initFactionRelations();
    const gen = generateDesignFloor(route.id, SEED);
    const authored = gen.entities.filter(e => (e as Entity & { npcPackageId?: string }).npcPackageId !== undefined);
    const noSlot: string[] = [];
    const idIsSlot: string[] = [];
    for (const npc of authored) {
      const packageId = (npc as Entity & { npcPackageId?: string }).npcPackageId;
      if (npc.alifeId === undefined || npc.alifeId < 1 || npc.alifeId > slots) noSlot.push(`${packageId}: alifeId=${npc.alifeId}`);
      if (npc.id === npc.alifeId) idIsSlot.push(`${packageId}: id=${npc.id}`);
    }
    assert.deepEqual(noSlot.slice(0, 8), [],
      `design:${route.id}: ${noSlot.length} авторских людей без слота в alifeId`);
    assert.deepEqual(idIsSlot.slice(0, 8), [],
      `design:${route.id}: ${idIsSlot.length} авторских людей носят слот номером сущности — совпадение вернулось`);
  }
});

test('порог нумерации выводится из числа слотов, а не написан числом', () => {
  // Список слотов растёт по мере того, как дописывают личностей. Порог, забитый
  // числом, однажды окажется НИЖЕ него — и класс вернётся целиком.
  assert.ok(firstRuntimeEntityId() > getPlotNpcCount(),
    `порог ${firstRuntimeEntityId()} обязан лежать выше ${getPlotNpcCount()} слотов`);
});
