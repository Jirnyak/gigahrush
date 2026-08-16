/* ── Зонный фиолетовый туман: снятие после смерти босса ───────── */
/*   Отдельно от systems/samosbor: туман зоны переживает волну и    */
/*   снимается боем, а бой не должен тянуть за собой весь самосбор. */

import { W, type GameState, type Msg, msg } from '../core/types';
import { World, type WorldGridDirtyRect } from '../core/world';
import { publishEvent } from './events';

export function clearFogInZone(world: World, zoneId: number, msgs: Msg[], time: number, state?: GameState): void {
  const zone = world.zones[zoneId];
  if (!zone) return;
  zone.fogged = false;
  // Clear all fog cells belonging to this zone
  let fogDirty = false;
  const fogRects: WorldGridDirtyRect[] = [];
  for (let i = 0; i < W * W; i++) {
    if (world.zoneMap[i] === zoneId && world.fog[i] !== 0) {
      world.fog[i] = 0;
      fogDirty = true;
      fogRects.push({ x: i % W, y: (i / W) | 0, w: 1, h: 1 });
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
