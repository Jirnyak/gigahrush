/* ── Прибытие в Пустоту ───────────────────────────────────────────
 * Этаж сам раскрывает ловушку Творца, когда лифт довёз. Раньше вызов стоял
 * поимённо внутри `switchFloor` в `main.ts` вместе с проверкой «это точно
 * Пустота». */

import { onVoidEntry } from '../../data/plot_events';
import { registerContentFloorArrivalHook } from '../../systems/content_hooks';

/** Маршрутный id: там стоит Творец и там же кончается маршрут. */
const VOID_ROUTE_ID = 'void';

registerContentFloorArrivalHook({
  id: 'void_arrival',
  onArrival(ctx) {
    if (ctx.insideFloorInstance || ctx.designFloorId !== VOID_ROUTE_ID) return;
    onVoidEntry(ctx.state);
  },
});
