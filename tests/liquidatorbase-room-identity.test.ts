/* Личность комнаты Базы Ликвидаторов: слот и объявление.
 *
 * Здесь держатся ровно две вещи, и обе ломаются МОЛЧА — этаж собирается,
 * генерация не падает, а комната перестаёт быть собой:
 *
 *   1. СЛОТ. `room.id` — это индекс в `world.rooms`, а `stampRoom` кладёт комнату
 *      по индексу (`world.rooms[id] = room`), то есть затирает чужую запись без
 *      единого слова. Две комнаты в одном слоте — это потерянная комната: её
 *      псевдоним пропадает из мира вместе с квестом, который на неё ссылался.
 *      Проверяется НАПРЯМУЮ: каждый объявленный псевдоним найден ровно один раз,
 *      комната лежит в своём собственном слоте, ни один объект не встречается в
 *      массиве дважды.
 *
 *   2. ОБЪЯВЛЕНИЕ. Тип комнаты — это ПОВЕДЕНИЕ (`rooms.md`): ядро актора выбирает
 *      комнату по `room.type`, а не по имени и не по тегам. Общий проход
 *      территории (`initializeCellTerritory`) выдаёт каждому хозяину штаб и, не
 *      найдя готового, ПРОИЗВОДИТ его из подходящей комнаты этажа — пишет
 *      `type = HQ` и запечатывает её. Авторское имя он бережёт, поэтому подмена
 *      читается только по типу: «Склад трофеев снизу» уходил с этажа штабом.
 *      Проверяется не разово, а НА ВХОДЕ: `main.ts` зовёт тот же проход при
 *      каждом входе на этаж, значит объявленное обязано пережить его повторы.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { seedGlobalRng } from '../src/core/rand';
import { generateFloor } from '../src/gen/floor_manifest';
import { initializeCellTerritory } from '../src/systems/territory';
import { LIQUIDATOR_BASE_NAMED_ROOMS } from '../src/gen/liquidatorbase/rooms';

const LIQUIDATOR_BASE_Z = -12;
const SEED = 20_881;
/** Сколько раз игрок входит на этаж в замере. Хватает трёх: проход идемпотентен. */
const FLOOR_ENTRIES = 3;

const ALIASES = Object.keys(LIQUIDATOR_BASE_NAMED_ROOMS) as (keyof typeof LIQUIDATOR_BASE_NAMED_ROOMS)[];

let cached: ReturnType<typeof generateFloor> | undefined;
function base() {
  if (!cached) {
    seedGlobalRng(0xa5e1 + SEED);
    cached = generateFloor(LIQUIDATOR_BASE_Z, SEED);
  }
  return cached;
}

test('слот комнаты занят ровно один раз: объявленное не перезаписано', () => {
  const world = base().world;
  const seen = new Set<unknown>();
  for (let id = 0; id < world.rooms.length; id++) {
    const room = world.rooms[id];
    assert.ok(room, `дыра в world.rooms на ${id}`);
    assert.equal(room.id, id, `комната на ${id} носит чужой id ${room.id}`);
    assert.equal(seen.has(room), false, `объект комнаты ${id} лежит в массиве дважды`);
    seen.add(room);
  }

  for (const alias of ALIASES) {
    const found = world.rooms.filter(room => room?.defId === alias);
    assert.equal(found.length, 1,
      `псевдоним "${alias}" встречается ${found.length} раз: слот перезаписан или комната вырыта дважды`);
    assert.equal(world.rooms[found[0].id], found[0],
      `"${alias}" лежит не в своём слоте: её запись затёрли`);
  }
});

test('объявленный тип и имя переживают вход на этаж', () => {
  const world = base().world;
  /* Ровно то, что делает `initFactionControl` в `main.ts` при каждом входе на
   * этаж. Первый прогон уже был при генерации — здесь повторы. */
  for (let entry = 1; entry <= FLOOR_ENTRIES; entry++) {
    initializeCellTerritory(world);
    for (const alias of ALIASES) {
      const def = LIQUIDATOR_BASE_NAMED_ROOMS[alias];
      const room = world.rooms.find(candidate => candidate?.defId === alias);
      assert.ok(room, `вход ${entry}: комната "${alias}" пропала из мира`);
      assert.equal(room!.type, def.type,
        `вход ${entry}: "${alias}" получила тип ${room!.type} вместо объявленного ${def.type} — `
        + 'тип это поведение, по нему комнату выбирает ядро актора');
      assert.equal(room!.name, def.name, `вход ${entry}: "${alias}" переименована`);
      assert.ok(room!.tags?.includes(alias), `вход ${entry}: "${alias}" потерял свой псевдоним в тегах`);
    }
  }
});
