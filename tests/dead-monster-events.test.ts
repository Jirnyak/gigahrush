import test from 'node:test';
import assert from 'node:assert/strict';

import { WORLD_EVENT_TYPES } from '../src/core/types';

/**
 * Замок волны 2026-08-27: четыре мировых события снесены как паразитные.
 *
 * `green_dog_howl` давал ~310 публикаций в минуту на грузовом поясе (шестую часть
 * всего потока), `obzhivalshchik_scratched` — фон одной комнаты, а
 * `false_liquidator_revealed` и `slimevik_harvested` не публиковались НИ РАЗУ ни
 * из одного файла. Читателей не было ни у одного: ни ветки в `contextFactKind`,
 * ни слуха, ни речи — только форматчик строки лога, то есть текст ради текста.
 *
 * Возврат любого из них означает, что вернулась и причина: событие, чей поток
 * платят все, а читает никто. Висячий форматчик при этом ловит уже сам тип:
 * карта в `world_log` объявлена как `Partial<Record<WorldEventType, …>>`, и
 * лишний ключ в ней перестаёт компилироваться.
 */
const REMOVED = [
  'green_dog_howl',
  'obzhivalshchik_scratched',
  'false_liquidator_revealed',
  'slimevik_harvested',
];

test('снесённые мировые события не вернулись в реестр типов', () => {
  const known = new Set<string>(WORLD_EVENT_TYPES);
  for (const type of REMOVED) {
    assert.equal(known.has(type), false, `${type} снят как событие без читателя`);
  }
});
