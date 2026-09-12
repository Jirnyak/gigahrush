/* Регенерация «на выброс» не трогает живой этаж — и смена мира одной формы.
 *
 * Игра иногда генерирует этаж НЕ чтобы играть: при сохранении ей нужна
 * чистая геометрия как база, чтобы в сейв уехала только разница
 * (`captureCurrentFloorMemory` в `main.ts`, ленивый `baseForDelta`). Пока эта
 * база строится, контентные модули регистрируются на неё — и, поскольку
 * `register` при смене владельца стирает карту комнат целиком, состояние
 * ЖИВОГО этажа не терялось, а ПОДМЕНЯЛОСЬ состоянием выброшенной базы.
 * Хранилище при этом оставалось держать ссылку на выброшенный мир — те самые
 * 42 МиБ, из-за которых в `main.ts` и заведена точка разгрузки этажа.
 *
 * Защита была написана (`snapshotAllWorldContexts`/`restoreAllWorldContexts`) и
 * не подключена: работал только персональный страж, и завёл его ОДИН модуль из
 * тридцати одного. Пара подключена в `withPreservedGenerationRuntime`
 * 2026-09-12; персональный страж остался для состояния, которое не является
 * комнатным контекстом (у кварти́р это массив POI и два счётчика времени).
 *
 * Вторая половина файла — про причину, из-за которой у гостя протекали щитки:
 * у смены мира было две формы, и одна переиспользовала объект `World`.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { World, replaceWorldFromGeneration } from '../src/core/world';
import { clearAllWorldContexts, createWorldContextStore } from '../src/world/world_contexts';
import {
  registerGenerationRuntimeGuard, withPreservedGenerationRuntime,
} from '../src/systems/generation_runtime_guard';

test('комнатный контекст живого этажа переживает регенерацию на выброс', () => {
  clearAllWorldContexts();
  const live = new World();
  const throwaway = new World();
  const store = createWorldContextStore<{ tag: string }>();

  store.register(live, 7, { tag: 'живое' });
  assert.equal(store.byRoom(7)?.tag, 'живое', 'подготовка: контекст живого этажа не записался');

  withPreservedGenerationRuntime(() => {
    // Ровно то, что делает контентный модуль, пока строится база для дельты.
    store.register(throwaway, 7, { tag: 'выброшенная база' });
  });

  assert.equal(store.byRoom(7)?.tag, 'живое',
    'контекст живого этажа подменён состоянием выброшенной базы');
  assert.equal(store.world(), live,
    'хранилище осталось привязано к выброшенному миру и держит его в памяти');
});

test('возврат происходит и когда регенерация упала', () => {
  clearAllWorldContexts();
  const live = new World();
  const throwaway = new World();
  const store = createWorldContextStore<{ tag: string }>();
  store.register(live, 3, { tag: 'живое' });

  assert.throws(() => withPreservedGenerationRuntime(() => {
    store.register(throwaway, 3, { tag: 'выброшенная база' });
    throw new Error('генерация базы упала');
  }), /упала/);

  assert.equal(store.byRoom(3)?.tag, 'живое', 'после падения генерации состояние не вернулось');
});

test('персональный страж модуля продолжает работать рядом с общим', () => {
  /* Два механизма ДОПОЛНЯЮТ друг друга: общий снимает однотипные хранилища
   * комнат, персональный — произвольное состояние модуля. Проверка держит
   * второе, иначе подключение общего могло бы тихо вытеснить его. */
  clearAllWorldContexts();
  let moduleSingleton = 'живое';
  registerGenerationRuntimeGuard({
    snapshot: () => moduleSingleton,
    restore: (snap) => { moduleSingleton = snap as string; },
  });
  withPreservedGenerationRuntime(() => { moduleSingleton = 'затёрто генерацией'; });
  assert.equal(moduleSingleton, 'живое', 'персональный страж перестал возвращать состояние модуля');
});

test('смена мира одной формы: новый этаж — всегда новый объект', () => {
  /* Причина утечки щитков у гостя. Ветка «скопировать этаж ВНУТРЬ прежнего
   * объекта» отключала разгрузку этажа целиком, потому что та сравнивает
   * ОБЪЕКТЫ. Замерено до правки: щитков на новом этаже 8 вместо 3. */
  const first = new World();
  const second = new World();
  const live = replaceWorldFromGeneration({ world: first } as never);
  assert.equal(live, first, 'сгенерированный мир не стал живым');
  const next = replaceWorldFromGeneration({ world: second } as never);
  assert.notEqual(next, live, 'новый этаж приехал в ПРЕЖНИЙ объект — разгрузка этажа снова ослепнет');
});

test('ни один вызов не просит переиспользовать прежний мир', () => {
  /* `main.ts` в тесте не поднять, поэтому форму вызова охраняем статикой:
   * второй аргумент означал бы возврат снятой ветки. */
  const src = readFileSync('src/main.ts', 'utf8');
  const calls = [...src.matchAll(/replaceWorldFromGeneration\(([^)]*)\)/g)].map(m => m[1]);
  assert.ok(calls.length >= 6, `вызовов найдено ${calls.length} — проверка смотрит не туда`);
  const withTarget = calls.filter(args => args.includes(',') || /^\s*(world|null)\s*,/.test(args));
  assert.deepEqual(withTarget, [],
    'вызов снова передаёт прежний мир целью: объект будет переиспользован, и состояние этажа потечёт');
});
