import test from 'node:test';
import assert from 'node:assert/strict';

import { MonsterKind, type GameState } from '../src/core/types';
import { getMonsterEcology } from '../src/data/monster_ecology';
import { lastPlayerDamageMonsterKind } from '../src/systems/damage';

/* Смерть обязана учить.
 *
 * Противодействие каждой твари автор написал давно и голосом игрока: «Быстрая,
 * слабая и часто не одна: принимайте в широком месте, гасите дешёвым выстрелом
 * и не тратьте последний магазин на первую». До экрана смерти эти строки не
 * доходили — игрок узнавал ЧТО его убило, но не узнавал, как это бьют.
 *
 * Убийца известен точно: `monsterKind` лежит в записи последнего урона, гадать
 * по ближайшему телу не нужно. Окно совпадения живёт в `damage.ts` рядом с
 * причиной смерти — второй копии этих двух чисел в HUD быть не должно.
 *
 * Соседнее поле `deathLogHint` СПЕЦИАЛЬНО не показывается: оно написано
 * режиссёрским голосом («смерть от X должна читать ошибку как…») и адресовано
 * автору, а не игроку. */

function stateWithDamage(overrides: Record<string, unknown> = {}): GameState {
  return {
    time: 100,
    deathTimer: 0,
    lastDamage: {
      time: 100,
      tick: 0,
      amount: 12,
      sourceKind: 'monster',
      sourceName: 'Сборка',
      monsterKind: MonsterKind.ZOMBIE,
      detail: 'Сборка: -12',
      ...overrides,
    },
  } as unknown as GameState;
}

test('убийца-тварь опознаётся по записи урона, а не по ближайшему телу', () => {
  const kind = lastPlayerDamageMonsterKind(stateWithDamage(), 100);
  assert.equal(kind, MonsterKind.ZOMBIE);
});

test('у опознанной твари есть чему учить', () => {
  const kind = lastPlayerDamageMonsterKind(stateWithDamage(), 100);
  const counterplay = getMonsterEcology(kind)?.counterplay;
  assert.ok(counterplay && counterplay.length > 0, 'у твари нет противодействия');
});

test('старый удар уроком не считается', () => {
  // Окно причины смерти — четыре секунды назад и полторы вперёд.
  assert.equal(lastPlayerDamageMonsterKind(stateWithDamage({ time: 90 }), 100), undefined);
  assert.equal(lastPlayerDamageMonsterKind(stateWithDamage({ time: 105 }), 100), undefined);
});

test('смерть не от твари урока не даёт, а не выдумывает его', () => {
  assert.equal(lastPlayerDamageMonsterKind(stateWithDamage({ monsterKind: undefined }), 100), undefined);
  assert.equal(lastPlayerDamageMonsterKind({ time: 100, deathTimer: 0 } as unknown as GameState, 100), undefined);
});

test('противодействие написано голосом игрока, а не режиссёра', () => {
  /* Обратная сторона правила: если однажды в `counterplay` заедет режиссёрская
   * формулировка, игрок прочтёт на экране смерти указание самому себе. */
  let checked = 0;
  for (const kind of Object.values(MonsterKind)) {
    if (typeof kind !== 'number') continue;
    const def = getMonsterEcology(kind);
    if (!def?.counterplay) continue;
    checked++;
    assert.ok(
      !/\bдолжн[аоы]\b/.test(def.counterplay),
      `противодействие ${MonsterKind[kind]} написано голосом режиссёра: ${def.counterplay}`,
    );
  }
  assert.ok(checked > 20, `проверено слишком мало тварей: ${checked}`);
});
