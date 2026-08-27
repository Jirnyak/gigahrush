/* ── Постановка авторских постов ──────────────────────────────────
 *
 * Один шаг, один раз, при спавне: анкета человека объявляет пост
 * (`runtime.specialRoutineId`), генератор говорит, в какой он комнате, — и
 * поводок комнаты делает остальное сам. Такта у этого модуля нет и не нужно:
 * срок поста — абсолютная минута игровых часов, и он снимает себя сам в момент,
 * когда у поводка спрашивают (`systems/room_leash.ts`).
 */

import { type Entity } from '../core/types';
import { getNpcPackageByPlotNpcId } from '../data/npc_packages';
import { getNpcSpecialRoutine } from '../data/npc_special_routines';
import { bindActorToRoom } from './room_leash';

/**
 * Поставить человека на объявленный им пост в этой комнате.
 *
 * Возвращает `true`, если пост действительно объявлен анкетой. Не объявлен —
 * тихо ничего не делает: это обычный случай, а не ошибка, постов на весь проект
 * единицы.
 */
export function postNpcToRoom(e: Entity, roomId: number): boolean {
  if (e.alifeId === undefined) return false;
  const def = getNpcSpecialRoutine(getNpcPackageByPlotNpcId(e.alifeId)?.runtime?.specialRoutineId);
  if (!def) return false;
  bindActorToRoom(e, roomId, def.boundToRoomUntilMinutes);
  return true;
}
