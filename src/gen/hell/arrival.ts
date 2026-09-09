/* ── Прибытие на Мясной низ ───────────────────────────────────────
 * Этаж встречает высадку сам: подсказка про зону закрепления и объявление
 * группы Громного. Раньше оба вызова стояли поимённо внутри `switchFloor`
 * в `main.ts`, вместе с проверкой «это точно Ад». */

import { onHellArrival, tryCreateVoiceQuest } from '../../data/plot_events';
import { registerContentFloorArrivalHook } from '../../systems/content_hooks';

/** Маршрутный id этажа: шаг «Зона закрепления» объявляет `design:hell`, z −36. */
const HELL_ROUTE_ID = 'hell';

registerContentFloorArrivalHook({
  id: 'hell_arrival',
  onArrival(ctx) {
    if (ctx.insideFloorInstance || ctx.designFloorId !== HELL_ROUTE_ID) return;
    onHellArrival(ctx.player, ctx.state);
    tryCreateVoiceQuest(ctx.world, ctx.entities, ctx.state);
  },
});
