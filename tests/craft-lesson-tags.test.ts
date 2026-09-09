import test from 'node:test';
import assert from 'node:assert/strict';

import { Faction, Occupation } from '../src/core/types';
import { allOccupationProfiles } from '../src/data/occupation_profiles';
import { CRAFT_RECIPE_SOURCES, craftRecipeSourcesForNpc } from '../src/data/craft_recipe_sources';

/* ── Метка обучения обязана иметь спрашивающего ───────────────────
 *
 * `#86`: у учителя стояла метка `craftTags: ['lesson']`, а источники рецептов
 * спрашивали три ДРУГИЕ (`mechanic_lesson`, `lab_lesson`, `market_lesson`).
 * Метка была единственным вхождением во всём `src/` — тупик по построению, и
 * единственная «обучающая» профессия, которая ничему не учит.
 *
 * Замок держит КЛАСС, а не случай: любая новая метка обучения без своего
 * источника валит его сама. Обратная сторона тоже проверена — источник, который
 * спрашивает метку, которой ни у кого нет, тоже мёртв.
 */
function askedOccupations(): Set<Occupation> {
  const asked = new Set<Occupation>();
  for (const source of CRAFT_RECIPE_SOURCES) {
    for (const occupation of source.npcOccupations ?? []) asked.add(occupation);
  }
  return asked;
}

test('профессия с меткой обучения имеет источник рецептов', () => {
  const asked = askedOccupations();
  const orphans = allOccupationProfiles()
    .filter(profile => profile.craftTags.length > 0 && !asked.has(profile.occupation))
    .map(profile => `${profile.id} (${profile.craftTags.join(', ')})`);
  assert.deepEqual(orphans, [], 'метка обучения без источника рецептов — профессия не может научить');
});

test('источник рецептов по профессии имеет кого учить', () => {
  const empty = CRAFT_RECIPE_SOURCES
    .filter(source => source.kind === 'npc' && source.npcOccupations !== undefined && source.npcOccupations.length === 0)
    .map(source => source.id);
  assert.deepEqual(empty, [], 'источник спрашивает метку, которой нет ни у одной профессии');
});

test('учитель учит письму, а не ремеслу', () => {
  const lessons = craftRecipeSourcesForNpc({ id: 1, occupation: Occupation.TEACHER, faction: Faction.CITIZEN });
  assert.equal(lessons.length > 0, true, 'учитель по-прежнему ничему не учит');
  const teacher = lessons.find(s => s.id === 'npc_teacher_letter_lesson');
  assert.ok(teacher, 'урока письма нет');
  assert.deepEqual(teacher.recipeIds, ['craft_item_chalk', 'craft_item_note', 'craft_item_book']);
});
