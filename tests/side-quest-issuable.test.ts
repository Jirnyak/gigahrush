import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { QuestType } from '../src/core/types';
import { SIDE_QUESTS, sideQuestIsIssuable, sideQuestVisitTargetDeclared } from '../src/data/plot';

/* Реестровая достижимость («дающий есть, предмет есть, маршрут есть») ничего не
 * говорит о том, умеет ли ВЫДАЧА построить шаг. Пока условия выдачи жили внутри
 * `generatePlotQuest` отдельным списком, 23 сайд-квеста типа VISIT, чья цель
 * задана одним лишь `targetRoomDefId`, не проходили ни одну ветку: цикл молча
 * уходил к следующему квесту. Ещё шесть ждали их в цепочке — 29 из 437.
 * Завершение при этом умело их закрывать, а маркер «!» над дающим обещал
 * разговор, которого не было. Замок держит обе стороны правила. */

test('каждый сайд-квест умеет быть выданным', () => {
  const dead = SIDE_QUESTS.filter(sq => !sideQuestIsIssuable(sq));
  assert.deepEqual(dead.map(sq => sq.id), [], 'выдача не может построить эти шаги');
});

test('у каждого VISIT объявлено место назначения', () => {
  const homeless = SIDE_QUESTS
    .filter(sq => sq.type === QuestType.VISIT && !sideQuestVisitTargetDeclared(sq))
    .map(sq => sq.id);
  assert.deepEqual(homeless, [], 'VISIT без единого целевого поля некуда вести');
});

test('у каждого TALK есть адресат', () => {
  const mute = SIDE_QUESTS
    .filter(sq => sq.type === QuestType.TALK && !sq.targetNpcId)
    .map(sq => sq.id);
  assert.deepEqual(mute, [], 'TALK без targetNpcId выдача пропускает молча');
});

test('предикат выдачи ловит недостроенный шаг, а не пропускает всё подряд', () => {
  assert.equal(sideQuestIsIssuable({ id: 'x', type: QuestType.VISIT, desc: '' } as never), false);
  assert.equal(sideQuestIsIssuable({ id: 'x', type: QuestType.TALK, desc: '' } as never), false);
  assert.equal(
    sideQuestIsIssuable({ id: 'x', type: QuestType.VISIT, desc: '', targetRoomDefId: 'Комната' } as never),
    true,
  );
});
