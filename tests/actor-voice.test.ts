/* Голос дела: речь как ПОБОЧНЫЙ ЭФФЕКТ ЗАНЯТИЯ.
 *
 * Решение владельца 2026-08-24: говорят не потому, что решили говорить, а потому
 * что чем-то заняты — работающий ворчит, испуганный кричит, дошедший до комнаты
 * здоровается. Отсюда два свойства, которые тест и держит: реплика привязана к
 * ДРАЙВУ строкой данных, и рождается она в момент, когда за дело взялись.
 *
 * Класс, от которого это защищает: перенос распорядка в ядро уже один раз
 * приглушил этаж, потому что забранный ядром актор не доходил до хвоста старого
 * слоя, где жили барки. Если голос снова отвяжут от дела, этаж замолчит молча —
 * гейт этого не заметит, а игрок заметит. */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { DRIVES, DRIVE_BY_ID, type DriveId } from '../src/systems/actor/drives';

/* Дела, у которых голос обязателен. Тварь молчит по построению (у неё нет
 * имени), поэтому спрашиваем только человеческие занятия и общие состояния. */
const MUST_SPEAK: readonly DriveId[] = [
  'work', 'social', 'patrol', 'store', 'wander',
  'eat', 'drink', 'sleep', 'toilet', 'heal',
  'flee', 'hide', 'fight',
];

test('у каждого человеческого дела есть свой голос', () => {
  for (const id of MUST_SPEAK) {
    const voice = DRIVE_BY_ID[id].voice;
    assert.ok(voice, `драйв «${id}» онемел: нет строки voice`);
    assert.ok(voice.line.length > 0, `драйв «${id}»: пустая реплика`);
    assert.ok(voice.signal.length > 0, `драйв «${id}»: пустой сигнал`);
  }
});

test('сигнал голоса выбран из тех, что различает система реплик', () => {
  /* Сигнал не украшение: по нему берётся корпус реплик, решается срочность и
   * длина пауз (у боевых они короче). Незнакомый сигнал молча провалится в
   * общую ветку, и разница между «в бой!» и «пора на смену» исчезнет. */
  const KNOWN = new Set(['ambient', 'alert', 'combat', 'wounded', 'flee', 'witness', 'lead']);
  for (const def of DRIVES) {
    if (!def.voice) continue;
    assert.ok(KNOWN.has(def.voice.signal),
      `драйв «${def.id}»: сигнал «${def.voice.signal}» система реплик не различает`);
  }
});

test('срочное дело говорит срочным сигналом, а бытовое — фоновым', () => {
  /* Иначе крик «отходим!» встанет в общую очередь бытовых реплик с паузой в
   * четыре с половиной секунды и опоздает к бою, ради которого он и нужен. */
  const URGENT = new Set(['alert', 'combat', 'wounded', 'flee', 'witness', 'lead']);
  assert.ok(URGENT.has(DRIVE_BY_ID['flee'].voice!.signal), 'бегство обязано кричать срочно');
  assert.ok(URGENT.has(DRIVE_BY_ID['fight'].voice!.signal), 'драка обязана кричать срочно');
  assert.ok(URGENT.has(DRIVE_BY_ID['hide'].voice!.signal), 'укрытие обязано кричать срочно');
  assert.equal(DRIVE_BY_ID['work'].voice!.signal, 'ambient', 'смена — дело бытовое');
  assert.equal(DRIVE_BY_ID['wander'].voice!.signal, 'ambient', 'прогулка — дело бытовое');
});

test('голос прихода отличается от голоса замысла там, где дело кончается местом', () => {
  /* «Пора на смену» говорят, вставая; «приступаю» — уже на месте. Если обе
   * строки совпадут, приход перестанет читаться как событие. */
  for (const id of ['work', 'eat', 'sleep', 'social'] as const) {
    const voice = DRIVE_BY_ID[id].voice!;
    if (voice.arrive === undefined) continue;
    assert.notEqual(voice.arrive, voice.line,
      `драйв «${id}»: реплика прихода повторяет реплику замысла`);
  }
});
