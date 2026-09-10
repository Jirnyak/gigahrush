/* Восемь авторских имён-ориентиров архивных варренов не присваивались НИГДЕ.
 *
 * `ARCHIVE_WARREN_LANDMARK_NAMES` — «Портретная опись», «Клетка клерка»,
 * «Копировальная яма», «Шкаф печатей», «Окно жалоб», «Папочная биржа», «Стол
 * отказов», «Картотека без лица». Единственный их читатель
 * (`archiveRoomHasLandmarkName`) поэтому отвечал `false` ВСЕГДА, а составное имя
 * поста ликвидаторов в `stampLiquidatorCheckpoint` было веткой, недостижимой по
 * построению.
 *
 * Замерено прогоном ДО правки: шесть процедурных этажей с
 * `geometryId === 'archive_warrens'` (z 15, 19, 21, 29, 31, 33) — ориентиров 0/8
 * на каждом. После: 4, 8, 5, 8, 3, 8. Число постов ликвидаторов при этом не
 * сдвинулось (0/0/0/5/0/5 до и после) — имена ориентиров их не затирают.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { makeProceduralFloorSpec } from '../src/data/procedural_floors';
import { generateProceduralFloor } from '../src/gen/procedural_floor';

const SEED = 4242;

/** Слепок объявленного списка: тест обязан покраснеть и на снятии имени. */
const LANDMARKS = [
  'Портретная опись',
  'Клетка клерка',
  'Копировальная яма',
  'Шкаф печатей',
  'Окно жалоб',
  'Папочная биржа',
  'Стол отказов',
  'Картотека без лица',
] as const;

function firstArchiveWarrenZ(): number | undefined {
  for (let z = -49; z <= 49; z += 2) {
    if (makeProceduralFloorSpec(SEED, z).geometryId === 'archive_warrens') return z;
  }
  return undefined;
}

test('авторские ориентиры архивных варренов доезжают до мира', () => {
  const z = firstArchiveWarrenZ();
  assert.notEqual(z, undefined, 'на маршруте не осталось архивных варренов — замок стал бессмысленным');

  const gen = generateProceduralFloor(makeProceduralFloorSpec(SEED, z!));
  const names = gen.world.rooms.filter(Boolean).map(room => room.name);
  const found = LANDMARKS.filter(landmark => names.some(name => name.includes(landmark)));

  assert.ok(found.length > 0, 'ни один объявленный ориентир не присвоен ни одной комнате');
  /* Ориентир — комната ОДНА на этаж, поэтому имя идёт без номера: имя и есть
   * его уникальность. Дублей быть не должно. */
  for (const landmark of found) {
    const hits = names.filter(name => name.includes(landmark));
    assert.equal(hits.length, 1, `ориентир «${landmark}» присвоен ${hits.length} комнатам`);
  }
});
