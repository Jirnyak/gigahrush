/* -- Design z: Верхнее бюро / каталоги развилок на карту -----------
 *
 * `UPPER_BUREAU_GATE_OUTCOMES` и `UPPER_BUREAU_ROUTE_DECISIONS` — два
 * авторских каталога с русскими последствиями («Кассир продает допуск в
 * архив за деньги; альтернативой остается кража кассы или актовое
 * разоблачение»), у которых не было ни одного потребителя. Каталог без
 * потребителя не долг только тогда, когда игрок может его услышать.
 *
 * Модуль вешает каждую развилку на маршрутную подсказку в её собственной
 * комнате: подсказка кладётся по `registerRouteCue`, читается по `E`
 * общим диспетчером (`tryUseRouteCue`) и попадает в HUD и слухи. Текст
 * берётся ИЗ каталога — переписывать его здесь нельзя, иначе через месяц
 * будет две редакции одной развилки.
 */

import type { Room } from '../../core/types';
import { World } from '../../core/world';
import { registerDebugCommand } from '../../systems/debug_registry';
import { getRouteCueMarkers, registerRouteCue } from '../../systems/route_cues';
import { UPPER_BUREAU_ANCHOR_Z, UPPER_BUREAU_ROUTE_ID } from './meta';
import { UPPER_BUREAU_DEBUG_ENTRY } from './geometry';
import { UPPER_BUREAU_GATE_OUTCOMES, UPPER_BUREAU_ROUTE_DECISIONS } from './geometry';

const GATE_ROOM = 'Кабинет предварительных решений';

function roomByName(world: World, name: string): Room | undefined {
  return world.rooms.find(room => room?.name === name);
}

function center(room: Room): { x: number; y: number } {
  return { x: room.x + (room.w >> 1) + 0.5, y: room.y + (room.h >> 1) + 0.5 };
}

/** Кладёт подсказки по двум каталогам развилок. Возвращает число
 *  поставленных подсказок — ноль означает, что комнаты не нашлись. */
export function registerUpperBureauDecisionCues(world: World, salon?: Room): number {
  let placed = 0;

  /* Четыре исхода прохода через пост — одна подсказка у самого поста:
     развилка здесь одна, а вариантов у неё четыре, и читаться они должны
     вместе, иначе игрок увидит четыре двери вместо одного выбора. */
  const gateRoom = salon ?? roomByName(world, GATE_ROOM) ?? world.rooms[0];
  if (gateRoom) {
    const from = center(gateRoom);
    registerRouteCue(world, {
      id: 'upper_bureau_gate_outcomes',
      x: from.x,
      y: from.y,
      targetX: from.x,
      targetY: from.y,
      z: UPPER_BUREAU_ANCHOR_Z,
      label: 'Кабинет предварительных решений',
      hint: UPPER_BUREAU_GATE_OUTCOMES.map(outcome => outcome.consequence).join(' '),
      targetName: gateRoom.name,
      color: '#f6c957',
      tags: [UPPER_BUREAU_ROUTE_ID, 'gate', 'documents', 'route_choice'],
      toneSeed: 90_071,
      roomId: gateRoom.id,
      targetRoomId: gateRoom.id,
      heardText: 'Пост берёт корешок, деньги, служебный обход или чужое имя. Четвёртый путь поднимает аудит.',
      followedText: 'Пост пропустил вас. Каким именно способом — запомнит не только он.',
      ignoredText: 'Пост предварительной записи остался непроверенным.',
      routeGroup: {
        id: 'upper_bureau_gate',
        lead: 'Дверь за постом открывается четырьмя разными способами.',
        risk: UPPER_BUREAU_GATE_OUTCOMES.map(outcome => `${outcome.route}: ${outcome.documentItem}`).join('; '),
        decision: 'Корешок, деньги, ключ Толика или чужое стёртое имя.',
        reward: 'Проход наверх; цена — тишина, деньги или аудит.',
        mapLabel: 'Верхнее бюро',
        mapHint: 'Проверь, чем платить посту.',
        logLine: 'Пост предварительной записи принимает четыре разные оплаты.',
      },
    });
    placed++;
  }

  /* Две маршрутные развилки стоят каждая в своей комнате: у них разный
     легальный и нелегальный предмет, и разводить их нельзя. */
  for (const decision of UPPER_BUREAU_ROUTE_DECISIONS) {
    const room = roomByName(world, decision.roomDefId);
    if (!room) continue;
    const from = center(room);
    registerRouteCue(world, {
      id: `upper_bureau_${decision.id}`,
      x: from.x,
      y: from.y,
      targetX: from.x,
      targetY: from.y,
      z: UPPER_BUREAU_ANCHOR_Z,
      label: decision.roomDefId,
      hint: decision.outcome,
      targetName: decision.roomDefId,
      color: '#c9a',
      tags: [UPPER_BUREAU_ROUTE_ID, decision.eventTag, 'route_choice'],
      toneSeed: 90_072 + placed,
      roomId: room.id,
      targetRoomId: room.id,
      heardText: decision.outcome,
      followedText: `Развилка «${decision.roomDefId}» отработана.`,
      ignoredText: `Развилка «${decision.roomDefId}» осталась без отметки.`,
      routeGroup: {
        id: `upper_bureau_${decision.id}`,
        lead: decision.outcome,
        risk: `Чисто: ${decision.legalItemId}. Через подделку: ${decision.illegalItemId}.`,
        decision: 'Пройти по бумаге, купить проход или взять силой и поднять аудит.',
        reward: 'Проход, улика или чужая папка.',
        mapLabel: 'Верхнее бюро',
        mapHint: decision.roomDefId,
        logLine: decision.outcome,
      },
    });
    placed++;
  }
  return placed;
}

/* Авторский маршрут дыма был написан в `UPPER_BUREAU_DEBUG_ENTRY` и не имел
   потребителя. Отладочная дверь проекта одна — `registerDebugCommand`; здесь
   же видно, легли ли подсказки каталогов на карту. */
registerDebugCommand({
  id: 'upper_bureau_route_decisions',
  group: 'route',
  label: 'Верхнее бюро: развилки и маршрут',
  sort: -UPPER_BUREAU_ANCHOR_Z,
  run(ctx) {
    if (ctx.state.currentZ !== UPPER_BUREAU_ANCHOR_Z) {
      ctx.say(`[${UPPER_BUREAU_ROUTE_ID}] это не верхнее бюро`, '#c66');
      return;
    }
    ctx.say(`[${UPPER_BUREAU_ROUTE_ID}] ${UPPER_BUREAU_DEBUG_ENTRY.displayName}`, '#9cf');
    ctx.say(`  маршрут: ${UPPER_BUREAU_DEBUG_ENTRY.smokePath}`, '#cc9');
    const cues = getRouteCueMarkers(ctx.world).filter(marker => marker.id.startsWith('upper_bureau_'));
    ctx.say(`  подсказок развилок: ${cues.length}`, '#9f7');
    for (const cue of cues) ctx.say(`    ${cue.id} @${Math.floor(cue.x)},${Math.floor(cue.y)}`, '#9f7');
  },
});
