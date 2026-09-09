/* ── Сквозь материю ходит бесплотное, и это ОДИН флаг ──────────────
 *
 * Было: тридцать одно место в двадцати семи файлах писало свой список «кто
 * проходит стены», и ответы РАСХОДИЛИСЬ. Дух проходил везде; теневик — на шести
 * этажах и не на остальных; тонкая тень — на двух; глубинная тень — на двух.
 * То есть проходимость сквозь материю зависела от того, на каком этаже вид
 * заспавнили, а не от самого вида. Флаг `noclip` при этом существовал и стоял
 * на Ложном духе, которого ни один из этих списков не упоминал.
 *
 * Решение владельца 2026-09-09: сквозь стены ходят духи, и флаг на это ОДИН.
 * Первая редакция правки развела мебель и стены по двум флагам — владелец это
 * отменил: «духи ходят сквозь стены, своди в один». `noclip` теперь значит
 * «бесплотен» целиком: и мебель, и стены, и взгляд.
 *
 * Следствие, названное прямо: Ложный дух ПОЛУЧИЛ хождение сквозь стены, которого
 * у него не было. Это не побочный эффект, а решение — он дух.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { MonsterKind } from '../src/core/types';
import { MONSTERS, monsterHasAIFlag } from '../src/entities/monster';
import { entityIgnoresFineBlockers } from '../src/systems/movement_collision';
import { EntityType } from '../src/core/types';
import '../src/content';

function bodilessKinds(): string[] {
  return (Object.values(MonsterKind) as unknown[])
    .filter((k): k is MonsterKind => typeof k === 'number')
    .filter(kind => monsterHasAIFlag({ monsterKind: kind }, 'noclip'))
    .map(kind => MonsterKind[kind])
    .sort();
}

test('бесплотных ровно двое, и оба — духи', () => {
  assert.deepEqual(bodilessKinds(), ['LOZHNYY_DUKH', 'SPIRIT']);
  assert.equal(MONSTERS[MonsterKind.SPIRIT].aiFlags?.includes('noclip'), true);
  assert.equal(MONSTERS[MonsterKind.LOZHNYY_DUKH].aiFlags?.includes('noclip'), true);
});

test('тени сквозь стены не ходят ни на одном этаже', () => {
  for (const kind of [MonsterKind.SHADOW, MonsterKind.TONKAYA_TEN, MonsterKind.GLUBINNAYA_TEN]) {
    assert.equal(
      monsterHasAIFlag({ monsterKind: kind }, 'noclip'), false,
      `${MonsterKind[kind]} проходил стены только на части этажей — это и был разнобой`,
    );
  }
});

test('один флаг снимает и мебель, и стены — второй половине взяться неоткуда', () => {
  for (const kind of [MonsterKind.SPIRIT, MonsterKind.LOZHNYY_DUKH]) {
    assert.equal(
      entityIgnoresFineBlockers({ type: EntityType.MONSTER, monsterKind: kind }), true,
      `${MonsterKind[kind]} обязан игнорировать мебель тем же флагом`,
    );
  }
  assert.equal(
    entityIgnoresFineBlockers({ type: EntityType.MONSTER, monsterKind: MonsterKind.SHADOW }), false,
    'теневик телесен и о мебель клипается',
  );
});
