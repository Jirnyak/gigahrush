/* ── Вестник держит нижний маршрут ────────────────────────────────
 * Счёт сходится — нижний лифт слышит кнопку. Раньше ветка стояла в общем
 * обработчике смерти в `main.ts`, поимённо зная и вид монстра, и id этажа. */

import { MonsterKind, EntityType } from '../../core/types';
import { onHeraldKilled } from '../../data/plot_events';
import { registerContentEntityDeathHook } from '../../systems/content_hooks';
import { applyDesignRouteGates } from '../../systems/design_route_gates';
import { currentFloorRunEntry } from '../../systems/procedural_floors';

/** Маршрутный id этажа: ворота открываются только на самом Подаде. */
const PODAD_ROUTE_ID = 'podad';

registerContentEntityDeathHook({
  id: 'podad_herald_gate',
  onDeath(ctx) {
    const { killed, state } = ctx;
    if (killed.type !== EntityType.MONSTER || killed.monsterKind !== MonsterKind.HERALD) return;
    if (!ctx.killerIsPlayer) return;
    if (currentFloorRunEntry(state).designFloorId !== PODAD_ROUTE_ID) return;
    if (!onHeraldKilled(killed, ctx.world, state)) return;
    applyDesignRouteGates(ctx.world, ctx.player, state);
    return { worldChanged: true };
  },
});
