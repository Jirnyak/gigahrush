/* ── Замок: метка цели квеста переживает загрузку ──────────────────
 *
 * Что защищает: `Quest.targetMarker` — единственное поле квеста, у которого
 * был писатель и не было читателя. Оно уходило в сейв спредом `{...quest}` в
 * `questsForSave`, а `normalizeQuest` строит объект заново и это поле не
 * переносил.
 *
 * Чем ошибка обошлась игроку: взял контракт или вылазку, перезагрузился — и
 * метка цели на карте (`map_exploration.ts` читает `roomType/roomDefId/
 * zoneTag/z` именно отсюда) молча исчезла, а речь NPC потеряла маршрут
 * (`markov_context.ts` берёт отсюда же `routeZ`, `risk`, `designFloorId`).
 * Квест оставался активным и вёл в никуда.
 *
 * Как держит: разбор рядом с `normalizeQuestTargetRoute` — по образцу
 * соседнего поля. Мусор режется, диапазоны зажимаются, отсутствие метки
 * остаётся законным случаем.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { QuestType, RoomType, type Quest } from '../src/core/types';
import { contractTargetMarker, contractToQuest, CONTRACTS } from '../src/data/contracts';
import { normalizeQuestList } from '../src/systems/save_sanitize';

function roundTrip(raw: Record<string, unknown>): Quest | undefined {
  return normalizeQuestList([raw], 1, 0).quests[0];
}

const BASE = {
  id: 3,
  type: QuestType.FETCH,
  giverId: 12,
  giverName: 'Диспетчер',
  desc: 'Тестовое поручение',
  targetItem: 'bread',
  done: false,
};

test('метка цели восстанавливается из сейва целиком', () => {
  const quest = roundTrip({
    ...BASE,
    targetMarker: {
      z: -26,
      roomType: RoomType.PRODUCTION,
      roomDefId: 'Насосная вторая',
      zoneTag: 'pressure_station',
      designFloorId: 'maintenance',
      proceduralTag: 'mushroom',
      routeZ: -26,
      risk: 2,
    },
  });

  assert.ok(quest, 'квест должен пережить санитайзер');
  assert.deepEqual(quest.targetMarker, {
    z: -26,
    roomType: RoomType.PRODUCTION,
    roomDefId: 'Насосная вторая',
    zoneTag: 'pressure_station',
    designFloorId: 'maintenance',
    proceduralTag: 'mushroom',
    routeZ: -26,
    risk: 2,
  });
});

test('настоящий контракт переживает круг сохранение → загрузка', () => {
  const def = CONTRACTS.find(c => c.target.roomType !== undefined || c.target.zoneTag !== undefined);
  assert.ok(def, 'нужен контракт с целевой комнатой или зоной');
  const source = contractToQuest(def, 1);
  assert.deepEqual(source.targetMarker, contractTargetMarker(def));

  const quest = roundTrip(JSON.parse(JSON.stringify(source)) as Record<string, unknown>);

  assert.ok(quest, 'контракт должен пережить санитайзер');
  assert.deepEqual(quest.targetMarker, JSON.parse(JSON.stringify(source.targetMarker)));
});

test('порченая метка санируется, а не роняет загрузку', () => {
  const quest = roundTrip({
    ...BASE,
    targetMarker: {
      z: Number.POSITIVE_INFINITY,
      roomType: 9999,
      roomDefId: 'я'.repeat(400),
      zoneTag: 'т'.repeat(200),
      designFloorId: 'нет_такого_этажа',
      proceduralTag: 42,
      routeZ: -9000,
      risk: 99,
    },
  });

  assert.ok(quest);
  const marker = quest.targetMarker!;
  assert.equal(marker.z, undefined, 'бесконечность не координата этажа');
  assert.equal(marker.roomType, undefined, 'неизвестный тип комнаты отбрасывается');
  assert.equal(marker.roomDefId!.length, 96);
  assert.equal(marker.zoneTag!.length, 48);
  assert.equal(marker.designFloorId, undefined, 'несуществующий этаж не восстанавливается');
  assert.equal(marker.proceduralTag, undefined, 'число не тег');
  assert.equal(marker.routeZ, -50, 'координата маршрута зажата в диапазон');
  assert.equal(marker.risk, 5, 'риск зажат в 1..5');
});

test('отсутствие и мусор вместо метки — законный случай', () => {
  assert.equal(roundTrip({ ...BASE })?.targetMarker, undefined);
  assert.equal(roundTrip({ ...BASE, targetMarker: null })?.targetMarker, undefined);
  assert.equal(roundTrip({ ...BASE, targetMarker: 'маркер' })?.targetMarker, undefined);
  assert.equal(roundTrip({ ...BASE, targetMarker: [1, 2, 3] })?.targetMarker, undefined);
  assert.equal(roundTrip({ ...BASE, targetMarker: {} })?.targetMarker, undefined, 'пустая метка не создаётся');
});
