/* Задание помнит ЛИЧНОСТЬ дающего, а не его тело.
 *
 * `giverId` был числом двух разных пространств, и какое именно — выводилось из
 * происхождения задания: авторское адресует слот личности, процедурное —
 * номер сущности, «потому что личности за ним нет». Вторая половина неверна:
 * обычного жильца усыновляет A-Life, и личность у него есть — она в `alifeId`.
 *
 * Замерено прогоном материализации (`materializeAlifeFloorPopulation`, тот же
 * сид, тот же план, сдвинутый курсор тел): номер сущности сменился у 24
 * личностей из 24, слот — ни у одной. Для игрока это значило, что задание,
 * взятое у обычного NPC, после поездки на лифте адресовано телу, которого
 * больше нет: сдать его тому же человеку было нельзя.
 *
 * Теперь адрес — ХРАНИМЫЙ факт задания (`giverBySlot`), а не догадка читателя.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIGoal, EntityType, Faction, Occupation, QuestType,
  type Entity, type GameState, type Quest,
} from '../src/core/types';
import {
  npcCanGiveQuestNow,
  questAddressesBySlot,
  questGiverAddress,
  questTalkAddress,
} from '../src/systems/quests';
import { normalizeQuestList } from '../src/systems/save_sanitize';

/* Выше сюжетного пула: слоты 1..getPlotNpcCount() заняты сюжетными
 * личностями, и `isPlotNpc` уводит их по другой ветке. Обычные жильцы
 * получают слоты сверх него. */
const ALIFE_SLOT = 900;

function npc(entityId: number, alifeId: number | undefined): Entity {
  return {
    id: entityId,
    type: EntityType.NPC,
    x: 10, y: 10, angle: 0, pitch: 0,
    alive: true, speed: 1, sprite: Occupation.COOK,
    hp: 100, maxHp: 100,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    name: 'Повар',
    faction: Faction.CITIZEN,
    occupation: Occupation.COOK,
    alifeId,
    canGiveQuest: true,
    questId: -1,
  };
}

function fetchQuest(patch: Partial<Quest>): Quest {
  return {
    id: 1,
    type: QuestType.FETCH,
    giverId: 0,
    giverName: 'Повар',
    desc: 'Принеси воды',
    targetItem: 'water',
    targetCount: 1,
    done: false,
    ...patch,
  };
}

test('адрес дающего хранится, а не выводится из происхождения задания', () => {
  assert.equal(questAddressesBySlot(fetchQuest({ giverBySlot: true })), true);
  assert.equal(questAddressesBySlot(fetchQuest({})), false);
  /* Запасной ход для задания без поля — прежнее правило: у авторского оно
   * верно по построению, и это тот же контракт, а не догадка. */
  assert.equal(questAddressesBySlot(fetchQuest({ sideQuestId: 'x' })), true);
  assert.equal(questAddressesBySlot(fetchQuest({ plotStepIndex: 3 })), true);
});

test('новое задание берёт адрес личности, когда она есть', () => {
  /* Тот самый производственный шаг: без него все остальные проверки этого
   * файла зелены и на старом поведении — они собирают задания руками. */
  assert.deepEqual(questGiverAddress(npc(100, ALIFE_SLOT)), {
    giverId: ALIFE_SLOT, giverBySlot: true, giverName: 'Повар',
  });
  /* Тело без личности адресуется номером: хранить о нём нечего. */
  assert.deepEqual(questGiverAddress(npc(100, undefined)), { giverId: 100, giverName: 'Повар' });
});

test('дающий узнаётся после перестройки этажа, когда его тело сменило номер', () => {
  const state = { quests: [fetchQuest({ giverId: ALIFE_SLOT, giverBySlot: true })] } as GameState;
  /* То же тело: задание открыто, второго от того же человека не дают. */
  assert.equal(npcCanGiveQuestNow(npc(100, ALIFE_SLOT), state), false);
  /* Этаж пересобран, тело переминчено — личность та же, и ответ обязан не
   * измениться. Без хранимого адреса здесь было бы `true`: тот же человек
   * выдал бы задание повторно, а старое осталось бы несдаваемым. */
  assert.equal(npcCanGiveQuestNow(npc(900_123, ALIFE_SLOT), state), false);
  /* А вот ЧУЖАЯ личность на том же номере тела — это другой человек. */
  assert.equal(npcCanGiveQuestNow(npc(100, ALIFE_SLOT + 1), state), true);
});

test('старое поведение показано на том же стенде: номер тела не переживает перестройку', () => {
  /* Негативный контроль самой постановки: задание, адресованное номером
   * сущности, узнаёт дающего ровно до первой перестройки этажа. */
  const state = { quests: [fetchQuest({ giverId: 100 })] } as GameState;
  assert.equal(npcCanGiveQuestNow(npc(100, ALIFE_SLOT), state), false);
  assert.equal(npcCanGiveQuestNow(npc(900_123, ALIFE_SLOT), state), true);
});

test('адрес переживает сейв: санитайзер не роняет поле', () => {
  const saved = JSON.parse(JSON.stringify([fetchQuest({ giverId: ALIFE_SLOT, giverBySlot: true })]));
  const { quests } = normalizeQuestList(saved, 2, 0);
  assert.equal(quests.length, 1);
  assert.equal(quests[0].giverBySlot, true);
  assert.equal(quests[0].giverId, ALIFE_SLOT);
  assert.equal(questAddressesBySlot(quests[0]), true);

  /* И не выдумывает его там, где его не было. */
  const plain = normalizeQuestList(JSON.parse(JSON.stringify([fetchQuest({ giverId: 100 })])), 2, 0);
  assert.equal(plain.quests[0].giverBySlot, undefined);
});

test('оба числа разговора живут в одном пространстве', () => {
  /* Флаг у задания ОДИН на `giverId` и `targetNpcId`. Если личность есть у
   * обоих — слот; если хотя бы у одного нет — оба номером тела. Иначе флаг
   * сказал бы «слот», а адресат приехал бы номером, и разговор не засчитался
   * бы никогда. */
  const both = questTalkAddress(npc(100, ALIFE_SLOT), npc(200, ALIFE_SLOT + 1));
  assert.equal(both.giver.giverBySlot, true);
  assert.equal(both.giver.giverId, ALIFE_SLOT);
  assert.equal(both.targetNpcId, ALIFE_SLOT + 1);

  const targetless = questTalkAddress(npc(100, ALIFE_SLOT), npc(200, undefined));
  assert.equal(targetless.giver.giverBySlot, undefined);
  assert.equal(targetless.giver.giverId, 100);
  assert.equal(targetless.targetNpcId, 200);

  const giverless = questTalkAddress(npc(100, undefined), npc(200, ALIFE_SLOT + 1));
  assert.equal(giverless.giver.giverBySlot, undefined);
  assert.equal(giverless.targetNpcId, 200);
});
