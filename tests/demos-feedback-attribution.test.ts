/* «Нет id» обязано читаться как НЕТ, а не как единица.
 *
 * В разборе событий Демоса стоял `clampInt(value, 0, 1, 0x7fffffff)`, а третий
 * аргумент у `clampInt` — МИНИМУМ. Отсутствующее поле подтягивалось к 1 и
 * возвращалось как настоящий номер личности. Слот 1 — не пустое место: это
 * первая сюжетная личность, Марко Лоло.
 *
 * Следствий два, и второе хуже первого:
 *   1. вся социальная обратная связь от событий без `actorAlifeId` доставалась
 *      одному персонажу;
 *   2. цепочка `actorAlifeId ?? killerAlifeId ?? helperAlifeId ?? giverAlifeId`
 *      не проваливалась НИКОГДА — первый поиск всегда возвращал единицу, и три
 *      остальных были мёртвым кодом.
 *
 * Дефект был невидим, пока разбор событий и режиссёр ленты жили разными
 * файлами: у них две функции с ОДНИМ именем `positiveId` и разным поведением.
 * Слияние конвейера в один модуль показало это за секунду.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { clampInt } from '../src/systems/save_sanitize';
import { PLOT_NPC_ID_ORDER } from '../src/data/npc_plot_ids';

/** Тот самый прежний вид: сохранён, чтобы дефект остался показуемым. */
function brokenPositiveId(value: unknown): number | undefined {
  const id = clampInt(value, 0, 1, 0x7fffffff);
  return id > 0 ? id : undefined;
}

/** Живой вид — копия того, что стоит в `systems/demos_runtime.ts`. */
function positiveId(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const id = Math.trunc(value);
  return id > 0 ? Math.min(id, 0x7fffffff) : undefined;
}

const MISSING: readonly unknown[] = [undefined, null, 0, -1, -5.7, NaN, Infinity, '7', {}, true];

test('слот 1 — живая сюжетная личность, а не пустое место', () => {
  /* Если слот 1 однажды опустеет, дефект перестанет быть страшным, но проверка
   * при этом станет бессмысленной — и об этом надо узнать сразу. */
  assert.ok(PLOT_NPC_ID_ORDER.length > 0);
  assert.equal(typeof PLOT_NPC_ID_ORDER[0], 'string');
  assert.ok(PLOT_NPC_ID_ORDER[0].length > 0, 'первый слот пуст — проверка потеряла смысл');
});

test('отсутствующий id читается как отсутствие', () => {
  for (const value of MISSING) {
    assert.equal(positiveId(value), undefined, `«${String(value)}» прочиталось как номер личности`);
  }
});

test('прежний вид приписывал всё это первой сюжетной личности', () => {
  /* Негативный контроль самого дефекта: без него проверка выше зелена и на
   * сломанной реализации тоже — она просто ничего не утверждает о том, ЧТО
   * было не так. */
  for (const value of MISSING) {
    assert.equal(brokenPositiveId(value), 1, `«${String(value)}» больше не даёт единицу — дефект показать нечем`);
  }
});

test('настоящий номер проходит без изменений', () => {
  assert.equal(positiveId(7), 7);
  assert.equal(positiveId(7.9), 7);
  assert.equal(positiveId(0x7fffffff), 0x7fffffff);
  assert.equal(positiveId(1e12), 0x7fffffff);
});

test('цепочка запасных полей теперь проваливается', () => {
  /* Ровно то, что было мёртвым: первый ключ отсутствует, и ответ обязан прийти
   * из второго, а не из подтянутой единицы. */
  const data: Record<string, unknown> = { killerAlifeId: 42 };
  const chain = positiveId(data.actorAlifeId)
    ?? positiveId(data.killerAlifeId)
    ?? positiveId(data.helperAlifeId);
  assert.equal(chain, 42);

  const broken = brokenPositiveId(data.actorAlifeId)
    ?? brokenPositiveId(data.killerAlifeId)
    ?? brokenPositiveId(data.helperAlifeId);
  assert.equal(broken, 1, 'прежняя цепочка обязана показывать, что она не проваливалась');
});

/* ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Поведенческого замка на этот дефект написать не
 * удалось: три зонда через настоящий вход разбора (безымянное событие;
 * `npc_kill_npc` с жертвой и без автора; связь скорбящего с первым слотом)
 * остаются ЗЕЛЁНЫМИ и на возвращённом дефекте. То есть до отношений такие
 * события не доходят — их отсекает что-то раньше.
 *
 * Поэтому доказано ровно две вещи, и заявлять больше нечестно:
 *   · функция возвращала НОМЕР там, где номера нет;
 *   · цепочка запасных полей из-за этого не проваливалась никогда, то есть три
 *     её звена были мёртвым кодом.
 * Игрок мог этого и не увидеть. Правка всё равно верна: «нет id» не единица. */
