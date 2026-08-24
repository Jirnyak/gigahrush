/* Класс дефекта, всплывавший в проекте четвёртый раз: таблица «этаж → имя»
 * с ключами ИЗ ОТМЕНЁННОЙ схемы, а поиск в ней — по реальному z. Промах молчит:
 * `Record<number, string>` отдаёт `undefined`, тип этого не ловит, и наружу
 * уходит либо пустая строка, либо падение на `.length`, либо чужое имя.
 *
 * Найдено 2026-08-24 сразу в трёх местах: `rumor.ts` держал снятых
 * «представителей» (34/2/−6/−14/−40/−48), а `route_cues.ts` и `npc_memory.ts` —
 * коды удалённого `FloorLevel` (0..5), где ключ `0` подписывал ЖИЛОЙ этаж
 * «Министерством». Замок держит единственный оставшийся путь. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import { floorDisplayNameForZ } from '../src/data/floor_names';
import { RUMORS } from '../src/data/rumors';
import { describeRumorReveal } from '../src/systems/rumor';

test('каждый маршрутный этаж называется своим именем, а не координатой', () => {
  for (const route of DESIGN_FLOOR_ROUTES) {
    const name = floorDisplayNameForZ(route.z);
    assert.equal(name, route.displayName, `z=${route.z} потерял имя маршрута`);
    assert.ok(!name.startsWith('этаж '), `z=${route.z} свалился в запасное «этаж N»`);
  }
});

test('координата вне маршрута не даёт undefined, а честно называет себя', () => {
  const name = floorDisplayNameForZ(9999);
  assert.equal(typeof name, 'string');
  assert.equal(name, 'этаж 9999');
});

test('слух про этаж печатает имя этажа, а не пустоту', () => {
  let checked = 0;
  for (const rumor of RUMORS) {
    if (!rumor.reveals) continue;
    const reveals = Array.isArray(rumor.reveals) ? rumor.reveals : [rumor.reveals];
    for (const reveal of reveals) {
      if (reveal.kind !== 'floor') continue;
      checked++;
      const text = describeRumorReveal(reveal);
      // Именно эта строка падала: раньше вернулось бы undefined, и вызов
      // `.length` у неё в `revealIsActionable` обрывал разговор исключением.
      assert.equal(typeof text, 'string', `слух ${rumor.id} отдал не строку`);
      assert.ok(text.length > 0, `слух ${rumor.id} отдал пустое имя этажа`);
    }
  }
  assert.ok(checked > 0, 'в данных не осталось слухов про этаж — замок стал бессмысленным');
});
