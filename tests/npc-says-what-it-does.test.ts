/* NPC ОТВЕЧАЕТ ПРО ТО, ЧЕМ ЗАНЯТ.
 *
 * Контракт владельца (`architecture.md`, «Actor Intent Contract»): чем актор
 * занят — это его ДРАЙВ, и другого источника истины нет. `npcState` понижен до
 * позы для анимаций и реплик, `AIGoal` умирает вместе со старым слоем.
 *
 * Класс дефекта, от которого держим: ядро актора ставит `npcState` только ПО
 * ПРИБЫТИИ, а `ai.goal` не трогает вовсе — там остаётся значение, оставленное
 * прежним слоем. При доле населения под ядром около половины человек на вопрос
 * игрока «чем занят» отвечал про дело, которого не делает, и заметить это можно
 * было только в игре: тест на такое не падал, гейт молчал.
 *
 * Тест держит СВОЙСТВО: у каждого человеческого дела есть свой ответ, и ответы
 * разных дел не совпадают. Если завтра появится новый драйв без ответа, сюда
 * придёт падение, а не молчание.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { DRIVE_BY_ID, type DriveId } from '../src/systems/actor/drives';
import { npcActivityLineForDrive, npcActivityPrefix } from '../src/systems/npc_interaction_options';
import { AIGoal, NpcState, type AIState } from '../src/core/types';

/** Дела, которыми человек занят на глазах у игрока и о которых его спрашивают. */
const HUMAN_DRIVES: readonly DriveId[] = [
  'work', 'social', 'patrol', 'store', 'wander',
  'eat', 'drink', 'sleep', 'toilet', 'heal',
  'flee', 'hide', 'fight', 'capture',
];

test('у каждого человеческого дела есть ответ на вопрос «чем занят»', () => {
  for (const id of HUMAN_DRIVES) {
    const line = npcActivityLineForDrive(id);
    assert.ok(line && line.length > 0,
      `драйв «${id}» не умеет ответить игроку, чем занят`);
  }
});

test('ответ соответствует делу, а не соседнему', () => {
  /* Ответы не обязаны быть все разными — «прячусь» честно годится и бегству, и
   * укрытию. Но дела РАЗНЫХ ГРУПП обязаны отвечать по-разному, иначе игрок не
   * отличит работягу от беглеца. */
  const work = npcActivityLineForDrive('work');
  const flee = npcActivityLineForDrive('flee');
  const eat = npcActivityLineForDrive('eat');
  assert.notEqual(work, flee, 'работа и бегство обязаны звучать по-разному');
  assert.notEqual(work, eat, 'работа и голод обязаны звучать по-разному');
  assert.notEqual(eat, flee, 'голод и бегство обязаны звучать по-разному');
});

test('ответы покрывают все группы драйвов, а не только телесные', () => {
  /* Прежний слой умел отвечать только про тело и работу. Распорядок, склад,
   * прогулка и захват территории появились в ядре позже, и без этой проверки
   * они молча остались бы немыми. */
  const groups = new Set<string>();
  for (const id of HUMAN_DRIVES) {
    if (npcActivityLineForDrive(id)) groups.add(DRIVE_BY_ID[id].group);
  }
  for (const need of ['body', 'survival', 'work', 'social'] as const) {
    assert.ok(groups.has(need), `группа драйвов «${need}» не умеет отвечать игроку`);
  }
});

function aiWith(npcState: NpcState | undefined, goal: AIGoal): AIState {
  return { goal, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0, npcState } as AIState;
}

test('ДРАЙВ перебивает и позу, и цель старого слоя', () => {
  /* Главный замок этого файла, и он про ПРОВОДКУ, а не про таблицу. Первая
   * версия теста проверяла только наличие строк и потому НЕ ловила откат: можно
   * было перестать спрашивать драйв, и тест остался бы зелёным. Проверено —
   * действительно не ловил.
   *
   * Здесь поза и цель намеренно противоречат делу: человек РАБОТАЕТ, но поза у
   * него «спит», а цель старого слоя — «бежать». Ответ обязан быть про работу. */
  const ai = aiWith(NpcState.SLEEPING, AIGoal.FLEE);
  assert.equal(npcActivityPrefix('work', ai, undefined), 'Работаю.');
  assert.equal(npcActivityPrefix('eat', ai, undefined), 'Ищу, где поесть.');
  assert.equal(npcActivityPrefix('patrol', ai, undefined), 'На обходе.');
});

test('без драйва ответ падает на позу — старый слой ещё жив', () => {
  /* Пока донор не снесён, актор без драйва ядра обязан отвечать по-старому.
   * Когда донор уйдёт, эта ветка станет мёртвой, и тест об этом напомнит. */
  const ai = aiWith(NpcState.SLEEPING, AIGoal.FLEE);
  assert.equal(npcActivityPrefix(undefined, ai, undefined), 'Сейчас отдыхаю.');
});
