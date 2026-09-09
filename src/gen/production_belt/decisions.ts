/* ── Конвейер узнаёт о своём решении ──────────────────────────────
 * Четыре побочки этажа игрались, а `publishProductionBeltDecision` не звали
 * ни разу: `ProductionBeltRouteState` рождался в `index.ts`, уезжал в объект
 * генерации и там умирал. Для мира это значило, что чинил игрок линию или
 * воровал зелёную партию — одно и то же: ни экономика, ни слухи, ни соседи
 * этого не узнавали.
 *
 * Своего рантайма шву не нужно, и ребро `systems → gen` тут не возникает:
 * этаж ПОДПИСЫВАЕТСЯ на общую шину снизу вверх, как `gen/hell/choir_tax.ts`.
 * Решение доезжает двумя видами уже публикуемых фактов:
 *
 *   1. `quest_completed` с `data.sideQuestId` — три из четырёх решений;
 *   2. `item_stolen` / `container_looted` из выходного ящика нелегальной
 *      смены — четвёртое, `steal_bad_batch`. Побочки на него нет вовсе, и это
 *      правильно: партию не сдают, её выносят. Замысел так и записан в
 *      `PRODUCTION_BELT_PIPELINE_DEPENDENCIES` («Зеленая партия стоит денег на
 *      рынке, но дает поздний слух о браке»), просто спрашивать было некому.
 *
 * Решение объявляется ОДИН раз за прогон этажа: повторное закрытие того же
 * дела и второй заход в тот же ящик уже ничего не меняют в трубопроводе.
 */

import { type GameState, type WorldEvent, type Faction } from '../../core/types';
import { type World } from '../../core/world';
import { registerFloorScopedReset } from '../../world/world_contexts';
import { registerWorldEventObserver } from '../../systems/events';
import {
  publishProductionBeltDecision,
  type ProductionBeltDecisionId,
  type ProductionBeltRouteState,
} from './geometry';
import { PRODUCTION_BELT_Z } from './meta';

/** Какая побочка какое решение закрывает. Ключ — `sideQuestId` шага. */
const QUEST_TO_DECISION: Readonly<Record<string, ProductionBeltDecisionId>> = {
  prod_restore_line: 'repair_metal_line',
  prod_steal_crate: 'transfer_charge_cells',
  prod_bad_batch: 'expose_bad_batch',
};

/** Линия, чей выходной ящик и есть «зелёная партия». */
const BAD_BATCH_FACTORY_ID = 'illegal_ammo_smelter';

let activeWorld: World | null = null;
let activeState: ProductionBeltRouteState | null = null;
const announced = new Set<ProductionBeltDecisionId>();

/* Этаж перестал быть играемым — состояние обязано уйти вместе с ним, иначе
 * следующий конвейер начнёт прогон с чужими объявленными решениями. */
registerFloorScopedReset(current => {
  if (activeWorld !== current) resetProductionBeltDecisions();
});

/** Зовёт генератор, сразу после сборки `ProductionBeltRouteState`. */
export function bindProductionBeltDecisions(world: World, routeState: ProductionBeltRouteState): void {
  activeWorld = world;
  activeState = routeState;
  announced.clear();
}

export function resetProductionBeltDecisions(): void {
  activeWorld = null;
  activeState = null;
  announced.clear();
}

/** Для замка: какие решения этаж уже объявил миру. */
export function announcedProductionBeltDecisions(): readonly ProductionBeltDecisionId[] {
  return [...announced];
}

function announce(state: GameState, decisionId: ProductionBeltDecisionId, event: WorldEvent): void {
  const world = activeWorld;
  const routeState = activeState;
  if (!world || !routeState) return;
  if (announced.has(decisionId)) return;
  announced.add(decisionId);
  publishProductionBeltDecision(state, world, {
    actorId: event.actorId,
    actorName: event.actorName,
    actorFaction: event.actorFaction as Faction | undefined,
    x: event.x,
    y: event.y,
    zoneId: event.zoneId,
  }, routeState, decisionId);
}

function handleProductionBeltDecision(state: GameState, event: WorldEvent): void {
  const routeState = activeState;
  if (!routeState) return;
  /* Собственные события шва обратно в него не заходят: он публикует
   * `room_produced_items` / `room_blocked_production`, а слушает другое. */
  if (event.z !== PRODUCTION_BELT_Z) return;

  if (event.type === 'quest_completed') {
    const sideQuestId = event.data?.sideQuestId;
    if (typeof sideQuestId !== 'string') return;
    const decisionId = QUEST_TO_DECISION[sideQuestId];
    if (decisionId) announce(state, decisionId, event);
    return;
  }

  if (event.type === 'item_stolen' || event.type === 'container_looted') {
    const line = routeState.lines.find(l => l.factoryId === BAD_BATCH_FACTORY_ID);
    if (line && event.containerId === line.outputContainerId) announce(state, 'steal_bad_batch', event);
  }
}

registerWorldEventObserver(handleProductionBeltDecision);
