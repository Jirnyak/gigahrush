/* ── `world.rooms`: id комнаты — это её индекс ─────────────────────
 *
 * Массив комнат индексируется id: `stampRoom` кладёт комнату по `[id]`,
 * `world.roomAt()` читает `rooms[roomMap[i]]`, а восстановление памяти этажа
 * (`systems/floor_memory.ts`) прямо переставляет `room.id = idx`, потому что
 * иначе патч сядет не в ту комнату. Контракт молчаливый: TypeScript видит
 * `Room[]` и не знает ни про дыры, ни про то, откуда взялся счётчик.
 *
 * Ломается он двумя способами, и оба один раз уже случились:
 *
 * 1. Счётчик комнат этажа начинается с единицы. `rooms[0]` остаётся дырой, а
 *    `for...of` по разреженному массиву выдаёт `undefined` (в отличие от
 *    `forEach`/`map`/`filter`, которые дыры молча пропускают — оттого этажные
 *    тесты и остаются зелёными). Любой из сотни обходов `world.rooms` падает на
 *    ней насмерть: так `tutorialRoomFeature` в `systems/target_guide.ts` валила
 *    игровой цикл каждый кадр на базе ликвидаторов.
 * 2. Комнатам раздаются id из счётчика СУЩНОСТЕЙ (тот стартует с 10000). Индекс
 *    расходится с id, `roomMap` хранит числа за краем массива, и `roomAt()`
 *    возвращает null на всём этаже: ни территории, ни занятий, ни целей квестов,
 *    ни комнат на карте. Падения при этом нет вообще — этаж просто нем.
 *
 * Поэтому проверка идёт по РЕЗУЛЬТАТУ генерации, а не по исходнику: счётчик
 * можно завести где угодно, а вот массив обязан выйти плотным.
 */

import * as assert from 'node:assert/strict';

import '../src/content';
import { makeProceduralFloorSpec } from '../src/data/procedural_floors';
import type { DesignFloorId } from '../src/data/design_floors';
import { designFloorGeneratorIds, generateDesignFloor } from '../src/gen/design_floors/manifest';
import { generateProceduralFloor } from '../src/gen/procedural_floor';
import type { World } from '../src/core/world';
import { testGenerationMatrix } from './generator_helpers';

const SEED = 1;

/** Что не так с массивом комнат, человеческим языком. Пусто — всё хорошо. */
function densityFaults(world: World): string[] {
  const faults: string[] = [];
  const holes: number[] = [];
  const mismatched: string[] = [];
  for (let i = 0; i < world.rooms.length; i++) {
    const room = world.rooms[i];
    if (room === undefined) { holes.push(i); continue; }
    if (room.id !== i) mismatched.push(`${i}→${room.id}`);
  }
  if (holes.length > 0) {
    faults.push(`дыр ${holes.length} из ${world.rooms.length} слотов: ${holes.slice(0, 8).join(', ')}`);
  }
  if (mismatched.length > 0) {
    faults.push(`id ≠ индекс у ${mismatched.length} комнат: ${mismatched.slice(0, 5).join(', ')}`);
  }
  return faults;
}

testGenerationMatrix('дизайн-этаж отдаёт плотный world.rooms, где id комнаты равен индексу', () => {
  const broken: string[] = [];
  for (const id of designFloorGeneratorIds()) {
    const faults = densityFaults(generateDesignFloor(id as DesignFloorId, SEED).world);
    if (faults.length > 0) broken.push(`${id}: ${faults.join('; ')}`);
  }
  assert.deepEqual(broken, [], `разреженный world.rooms:\n- ${broken.join('\n- ')}`);
});

/* Процедурная ветка сшивается своим кодом и на момент написания теста чиста на
 * всём маршруте (3 сида × 40 этажей, проверено вручную). Полный прогон стоит
 * около двух минут матрицы, поэтому здесь ВЫБОРКА из четырёх высот — она ловит
 * системную поломку общего пути, но не поручится за отдельную геометрию. */
const PROCEDURAL_SAMPLE_ZS = [29, 7, -17, -49] as const;

testGenerationMatrix('процедурный этаж отдаёт плотный world.rooms, где id комнаты равен индексу', () => {
  const broken: string[] = [];
  for (const z of PROCEDURAL_SAMPLE_ZS) {
    const spec = makeProceduralFloorSpec(SEED, z);
    const faults = densityFaults(generateProceduralFloor(spec).world);
    if (faults.length > 0) broken.push(`z=${z} (${spec.geometryId}): ${faults.join('; ')}`);
  }
  assert.deepEqual(broken, [], `разреженный world.rooms:\n- ${broken.join('\n- ')}`);
});
