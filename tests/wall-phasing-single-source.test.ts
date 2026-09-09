/* ── Кто проходит сквозь стены — решает ФЛАГ, а не этаж ────────────
 *
 * Было: тридцать одно место в двадцати семи файлах писало свой список «кто
 * проходит стены», и ответы РАСХОДИЛИСЬ. Дух проходил везде; теневик — на шести
 * этажах и не на остальных; тонкая тень — на двух; глубинная тень — на двух.
 * То есть проходимость сквозь материю зависела от того, на каком этаже вид
 * заспавнили, а не от самого вида.
 *
 * Решение владельца 2026-09-09: сквозь стены ходит ТОЛЬКО дух.
 *
 * Флагов два, и путать их нельзя — они про разное:
 *   · `wallPhase` — проходит сквозь СТЕНЫ (поле сущности `phasing`);
 *   · `noclip` — не клипается о мебель и видит сквозь стены, но стены для него
 *     твёрдые. Его несёт Ложный дух, и это НЕ тронуто: у него стены твёрдые и
 *     были, он просто не застревал в тумбочках.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { MonsterKind } from '../src/core/types';
import { MONSTERS, monsterHasAIFlag } from '../src/entities/monster';
import '../src/content';

function kindsWithFlag(flag: 'wallPhase' | 'noclip'): string[] {
  return (Object.values(MonsterKind) as unknown[])
    .filter((k): k is MonsterKind => typeof k === 'number')
    .filter(kind => monsterHasAIFlag({ monsterKind: kind }, flag))
    .map(kind => MonsterKind[kind])
    .sort();
}

test('сквозь стены проходит ровно один вид, и это дух', () => {
  assert.deepEqual(kindsWithFlag('wallPhase'), ['SPIRIT']);
  assert.equal(MONSTERS[MonsterKind.SPIRIT].aiFlags?.includes('wallPhase'), true);
});

test('noclip — про мебель и взгляд, а не про стены, и остался у Ложного духа', () => {
  assert.deepEqual(kindsWithFlag('noclip'), ['LOZHNYY_DUKH']);
  assert.equal(
    monsterHasAIFlag({ monsterKind: MonsterKind.LOZHNYY_DUKH }, 'wallPhase'), false,
    'Ложный дух сквозь стены не ходил и не должен начать',
  );
});

test('тени сквозь стены больше не ходят ни на одном этаже', () => {
  for (const kind of [MonsterKind.SHADOW, MonsterKind.TONKAYA_TEN, MonsterKind.GLUBINNAYA_TEN]) {
    assert.equal(
      monsterHasAIFlag({ monsterKind: kind }, 'wallPhase'), false,
      `${MonsterKind[kind]} проходил стены только на части этажей — это и был разнобой`,
    );
  }
});
