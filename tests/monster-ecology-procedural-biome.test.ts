import test from 'node:test';
import assert from 'node:assert/strict';

import { MonsterKind } from '../src/core/types';
import { getMonsterEcology, rankMonsterEcology, type MonsterEcologyRank } from '../src/data/monster_ecology';

/* Кто водится на этаже, решает сам этаж.
 *
 * Раньше здесь проверялся вывод по корзине тем: якорные `z` вида разворачивались
 * в теги этажей на этих `z`, и вид считался родным для ЛЮБОГО этажа той же
 * корзины — один тег отвечал за пятнадцать этажей сразу. Этажи не группируются,
 * поэтому догадка снята. Экология осталась общим словарём (кто чем является), а
 * состав этажа выбирает его собственный генератор — `monsterBiasKinds` и
 * `monsterTags` уже учтены отдельными весами.
 *
 * Тест держит обе стороны нового правила: свой выбор этажа работает, а чужого
 * ярлыка больше не существует.
 */
function weightOf(ranks: readonly MonsterEcologyRank[], kind: MonsterKind): number {
  return ranks.find(rank => rank.kind === kind)?.weight ?? 0;
}

/** Вид с ненулевым весом, у которого есть авторский якорь на `z`. */
function anchoredKind(ranks: readonly MonsterEcologyRank[], z: number): MonsterKind | undefined {
  for (const rank of ranks) {
    if (rank.weight <= 0) continue;
    const def = getMonsterEcology(rank.kind);
    if (!def || def.rare) continue;
    if (def.floors.includes(z)) return rank.kind;
  }
  return undefined;
}

test('состав этажа задаёт его собственный выбор, а не чужой якорь', () => {
  // Нечётный z — процедурная остановка: авторского якоря на ней нет ни у кого.
  const bare = rankMonsterEcology({ z: -25 });
  const picked = bare.find(rank => rank.weight > 0)?.kind;
  assert.ok(picked !== undefined, 'на процедурном этаже должен быть хоть кто-то');

  const chosen = rankMonsterEcology({ z: -25, biasKinds: [picked] });
  assert.ok(
    weightOf(chosen, picked) > weightOf(bare, picked),
    'вид, выбранный самим этажом, обязан получить вес',
  );
});

test('авторский якорь работает только на своём этаже', () => {
  const onAnchor = rankMonsterEcology({ z: -26 });
  const anchored = anchoredKind(onAnchor, -26);
  assert.ok(anchored !== undefined, 'нужен вид с якорем на -26');

  // Соседний этаж чужой якорь не наследует: раньше его тянула общая корзина.
  const anchoredDef = getMonsterEcology(anchored);
  assert.ok(anchoredDef && !anchoredDef.floors.includes(-25), 'вид не должен иметь якоря на -25');

  const elsewhere = rankMonsterEcology({ z: -25 });
  assert.ok(
    weightOf(onAnchor, anchored) > weightOf(elsewhere, anchored),
    'на своём этаже вид обязан быть вероятнее, чем на чужом',
  );
});
