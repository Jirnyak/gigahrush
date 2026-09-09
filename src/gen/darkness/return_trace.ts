/* ── Одно имя, вынесенное из темноты ──────────────────────────────
 * Карточка Тамары Беловой лежит в мире с генерации, а `publishDarknessReturnTrace`
 * не звали ни разу: вынос имени не становился фактом, и три поздних адресата
 * (жилая зона, министерство, Яков) о нём не узнавали. Заодно мёртвыми стояли
 * `getDarknessState` и поле `returnTracePublished`, объявленное ровно под этот
 * случай.
 *
 * Момент возврата — лифт: имя вынесено тогда, когда игрок с карточкой стоит на
 * кабине. Не «поднял» (поднять можно и бросить) и не «сменил этаж» (там уже
 * другой мир и другое состояние).
 *
 * Стоимость кадра: сторож этажа первой строкой, дальше редкий такт и проверка
 * одной клетки под ногами. Инвентарь просматривается только стоя на лифте.
 */

import { Cell, type Entity } from '../../core/types';
import { registerContentRuntimeHook } from '../../systems/content_hooks';
import { currentFloorRunEntry } from '../../systems/procedural_floors';
import { getDarknessState, publishDarknessReturnTrace } from './geometry';
import { DARKNESS_DESIGN_FLOOR_ID } from './meta';
import { DARKNESS_PRESERVED_NAME_ID } from './npcs';

/** Раз в столько тактов спрашиваем клетку под ногами. */
const POLL_TICKS = 30;
const NAME_CARD_DEF_ID = 'personal_file_copy';

/** Несёт ли игрок именно ту карточку — по метке в данных предмета, а не по имени. */
function carriesPreservedName(player: Entity): boolean {
  for (const item of player.inventory ?? []) {
    if (item.defId !== NAME_CARD_DEF_ID) continue;
    const data = item.data;
    if (data && typeof data === 'object' && (data as { darknessNameId?: unknown }).darknessNameId === DARKNESS_PRESERVED_NAME_ID) {
      return true;
    }
  }
  return false;
}

registerContentRuntimeHook({
  id: 'darkness_return_trace',
  phases: ['floor_activity'],
  update(ctx) {
    if (ctx.state.tick % POLL_TICKS !== 0) return;
    if (currentFloorRunEntry(ctx.state).designFloorId !== DARKNESS_DESIGN_FLOOR_ID) return;
    const darkness = getDarknessState(ctx.world);
    if (!darkness || darkness.returnTracePublished) return;

    const ci = ctx.world.idx(Math.floor(ctx.player.x), Math.floor(ctx.player.y));
    if (ctx.world.cells[ci] !== Cell.LIFT) return;
    if (!carriesPreservedName(ctx.player)) return;

    darkness.preservedNameId = DARKNESS_PRESERVED_NAME_ID;
    darkness.returnTracePublished = true;
    publishDarknessReturnTrace(ctx.state, {
      preservedNameId: DARKNESS_PRESERVED_NAME_ID,
      sourceRoomId: ctx.world.roomMap[ci] >= 0 ? ctx.world.roomMap[ci] : undefined,
      sourceZoneId: ctx.world.zoneMap[ci] >= 0 ? ctx.world.zoneMap[ci] : undefined,
      x: ctx.player.x,
      y: ctx.player.y,
    });
  },
});
