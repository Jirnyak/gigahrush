/* Приёмник пакетов сообщества обязан быть ПОЗВАН.
 *
 * `registerReviewedCommunityNpcPackages` — единственная ссылка на
 * `COMMUNITY_NPC_PACKAGE_FOLDERS`, и её не звал никто. Сегодня список пуст,
 * поэтому дефекта в игре нет; цена молчания вся в будущем: первая же принятая
 * папка НЕ зарегистрировалась бы, а автор искал бы своего NPC в мире, который
 * его не видел. Такую ловушку ловит не тест на случай, а инвариант на класс.
 *
 * Замок держит обе стороны: приёмник зовётся из точки сборки контента, и любая
 * объявленная папка после сборки действительно лежит в реестре пакетов.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../src/content';
import { COMMUNITY_NPC_PACKAGE_FOLDERS } from '../src/data/npc_packages/community';
import { registerReviewedCommunityNpcPackages } from '../src/data/npc_packages';

test('приёмник пакетов сообщества зовётся из точки сборки контента', () => {
  const content = readFileSync('src/content.ts', 'utf8');
  assert.ok(
    content.includes('registerReviewedCommunityNpcPackages()'),
    'принятую папку сообщества никто не зарегистрирует: позовите приёмник из src/content.ts',
  );
});

test('приёмник не возвращает ошибок на текущем составе папок', () => {
  /* Возвращаемое значение — СПИСОК ОШИБОК, а не список id: папка, не прошедшая
   * проверку, регистрацию молча пропускает. Сегодня список папок пуст, и
   * ошибок ноль; в тот день, когда появится первая, эта строка скажет, приняли
   * её или отвергли. Повторный вызов безопасен: `registerNpcPackage` на дубле
   * бросает, и ошибка попадёт сюда же, а не в тишину. */
  const errors = registerReviewedCommunityNpcPackages();
  assert.deepEqual([...errors], [], 'папка сообщества объявлена, но не прошла проверку');
});

test('объявленная папка обязана иметь все четыре обязательных файла', () => {
  /* Форма папки — контракт приёма (`NpcCommunityPackageFolder`), и проверка
   * читает именно её поля. Пустой список тут законен: принятых папок ещё нет,
   * а проверка начнёт работать в день первой. */
  const broken: string[] = [];
  for (const folder of COMMUNITY_NPC_PACKAGE_FOLDERS) {
    if (!folder.folderName) broken.push('папка без имени');
    for (const key of ['npc', 'spriteRle', 'readme', 'consent'] as const) {
      if (folder[key] === undefined || folder[key] === null) broken.push(`${folder.folderName}: нет ${key}`);
    }
  }
  assert.deepEqual(broken, []);
});
