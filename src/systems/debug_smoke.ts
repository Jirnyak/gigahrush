/* ── Смоук-помощники ──────────────────────────────────────────
 *
 * Headless-прогон `npm run smoke` жмёт отладочные команды в браузере и должен
 * пережить то, что игрок пережил бы сам: встать у лифта и не умереть на старте
 * форсированного самосбора. Вынесено из debug.ts отдельным листом, потому что
 * этим пользуются и отладка, и сам самосбор.
 */

import { Cell, EntityType, W, type Entity } from '../core/types';
import { World } from '../core/world';

export function movePlayerToSmokeLift(world: World, player: Entity, entities: Entity[]): boolean {
  let fallback: { x: number; y: number; angle: number } | null = null;
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] !== Cell.LIFT) continue;
    const lx = i % W;
    const ly = (i / W) | 0;
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    for (const dir of dirs) {
      const px = world.wrap(lx + dir.dx);
      const py = world.wrap(ly + dir.dy);
      const pi = world.idx(px, py);
      if (world.cells[pi] === Cell.LIFT || world.solid(px, py)) continue;
      const spot = {
        x: px + 0.5,
        y: py + 0.5,
        angle: Math.atan2((ly + 0.5) - (py + 0.5), (lx + 0.5) - (px + 0.5)) };
      fallback ??= spot;
      const actorTooClose = entities.some(e => (
        (e.type === EntityType.NPC || e.type === EntityType.MONSTER)
        && e.alive
        && world.dist2(spot.x, spot.y, e.x, e.y) < 9
      ));
      if (!actorTooClose) {
        player.x = spot.x;
        player.y = spot.y;
        player.angle = spot.angle;
        player.pitch = 0;
        return true;
      }
    }
  }
  if (!fallback) return false;
  player.x = fallback.x;
  player.y = fallback.y;
  player.angle = fallback.angle;
  player.pitch = 0;
  return true;
}

export function isSmokeDebugRun(): boolean {
  return typeof window !== 'undefined' && window.location.search.includes('smoke');
}

export function stabilizeSmokeRecovery(world: World, player: Entity, entities: Entity[]): void {
  movePlayerToSmokeLift(world, player, entities);
  player.alive = true;
  player.maxHp = Math.max(100, player.maxHp ?? 100);
  player.hp = player.maxHp;
}
