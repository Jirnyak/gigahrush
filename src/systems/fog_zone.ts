/* ── Зонный фиолетовый туман: снятие после смерти босса ───────── */
/*   Отдельно от systems/samosbor: туман зоны переживает волну и    */
/*   снимается боем, а бой не должен тянуть за собой весь самосбор. */

import { W, type GameState, type Msg, msg } from '../core/types';
import { MAX_GRID_DIRTY_RECTS, World, type WorldGridDirtyRect } from '../core/world';
import { publishEvent } from './events';

export function clearFogInZone(world: World, zoneId: number, msgs: Msg[], time: number, state?: GameState): void {
  const zone = world.zones[zoneId];
  if (!zone) return;
  zone.fogged = false;
  // Clear all fog cells belonging to this zone. Runs from a kill inside updateAI,
  // so it must not allocate per cell: a zone is thousands of cells and the rect
  // list collapses to a full invalidation past MAX_GRID_DIRTY_RECTS anyway. Stop
  // building rects at that point and let the fog upload go full.
  let fogDirty = false;
  let fogRects: WorldGridDirtyRect[] | undefined = [];
  for (let i = 0; i < W * W; i++) {
    if (world.zoneMap[i] === zoneId && world.fog[i] !== 0) {
      world.fog[i] = 0;
      fogDirty = true;
      if (fogRects) {
        if (fogRects.length > MAX_GRID_DIRTY_RECTS) fogRects = undefined;
        else fogRects.push({ x: i % W, y: (i / W) | 0, w: 1, h: 1 });
      }
    }
  }
  if (fogDirty) world.markFogDirty(fogRects);
  msgs.push(msg(
    `Туман в зоне ${zoneId} ушёл. Ликвидаторы могут заходить.`,
    time, '#4f4',
  ));
  if (state) {
    publishEvent(state, {
      type: 'fog_boss_killed',
      zoneId,
      x: zone.cx,
      y: zone.cy,
      severity: 5,
      privacy: 'public',
      tags: ['samosbor', 'fog', 'boss', 'clear'],
    });
  }
}
