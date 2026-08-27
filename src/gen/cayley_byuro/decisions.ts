/* -- Design z: Бюро Кэли / каталог развилок на карту ---------------
 *
 * `CAYLEY_BYURO_DECISIONS` — три авторские развилки с русскими
 * подсказками («Кассир продает ключ к дверям генератора R. Это взятка,
 * но не подделка.»), у которых не было ни одного потребителя. Одну из
 * трёх — порядок форм — рука автора уже переписала внутрь
 * `registerCayleyRouteCue`, и с тех пор текст жил в двух редакциях.
 *
 * Модуль вешает подсказку на каждую развилку и берёт `cue` ИЗ каталога:
 * одна редакция текста, три доступные развилки вместо одной. Подсказка
 * читается по `E` общим диспетчером (`tryUseRouteCue`) и попадает в HUD.
 */

import type { Room } from '../../core/types';
import { World } from '../../core/world';
import { registerRouteCue } from '../../systems/route_cues';
import {
  CAYLEY_BYURO_DECISIONS,
  CAYLEY_BYURO_ROOM_NAMES,
  CAYLEY_BYURO_ROUTE_ID,
  CAYLEY_BYURO_Z,
  type CayleyElement,
} from './meta';

/** Куда ведёт развилка: элемент группы или косет. У факторного хода
 *  результат — косет, и комнаты под него нет: подсказка остаётся в лобби. */
function targetRoomFor(world: World, result: string): Room | undefined {
  const name = (CAYLEY_BYURO_ROOM_NAMES as Record<string, string>)[result as CayleyElement];
  if (!name) return undefined;
  return world.rooms.find(room => room?.name === name);
}

function center(room: Room): { x: number; y: number } {
  return { x: room.x + (room.w >> 1) + 0.5, y: room.y + (room.h >> 1) + 0.5 };
}

/** Кладёт подсказку на каждую развилку каталога. Возвращает их число. */
export function registerCayleyDecisionCues(world: World, lobby: Room): number {
  const from = center(lobby);
  let placed = 0;
  for (const decision of CAYLEY_BYURO_DECISIONS) {
    const target = targetRoomFor(world, decision.result) ?? lobby;
    const to = center(target);
    registerRouteCue(world, {
      id: `cayley_byuro_decision_${decision.id}`,
      x: from.x,
      y: from.y,
      targetX: to.x,
      targetY: to.y,
      z: CAYLEY_BYURO_Z,
      label: `Формы: ${decision.sequence.join('')}`,
      hint: decision.cue,
      targetName: target.name,
      color: '#f6c957',
      tags: [CAYLEY_BYURO_ROUTE_ID, 'route_choice', 'forms', decision.id],
      toneSeed: 90_040 + placed,
      roomId: lobby.id,
      targetRoomId: target.id,
      heardText: decision.cue,
      followedText: `Ход «${decision.sequence.join('')}» отработан.`,
      ignoredText: `Ход «${decision.sequence.join('')}» остался без отметки.`,
      routeGroup: {
        id: `cayley_byuro_${decision.id}`,
        lead: decision.cue,
        risk: 'Двери генератора R требуют ключа; факторный ход принимает подделку.',
        decision: 'Идти по порядку форм, купить ключ R или срезать факторным ходом.',
        reward: `Выход к ${target.name}.`,
        mapLabel: 'Бюро Кэли',
        mapHint: decision.cue,
        logLine: decision.cue,
      },
    });
    placed++;
  }
  return placed;
}
