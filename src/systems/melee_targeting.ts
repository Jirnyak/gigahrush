import { EntityType, type Entity } from '../core/types';
import type { World } from '../core/world';

const MELEE_TARGET_EPSILON = 1e-9;

export function selectMeleeTarget(
  world: World,
  attacker: Entity,
  candidates: readonly Entity[],
  reach: number,
  hitRadius = 1.2,
): Entity | undefined {
  const dirX = Math.cos(attacker.angle);
  const dirY = Math.sin(attacker.angle);
  const hitRadius2 = hitRadius * hitRadius;
  let best: Entity | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestId = Number.MAX_SAFE_INTEGER;

  for (const candidate of candidates) {
    if ((candidate.type !== EntityType.MONSTER && candidate.type !== EntityType.NPC) || !candidate.alive) continue;
    if (candidate.id === attacker.id) continue;

    const dx = world.delta(attacker.x, candidate.x);
    const dy = world.delta(attacker.y, candidate.y);
    const forward = dx * dirX + dy * dirY;
    if (forward < 0) continue;

    const tipDx = dx - dirX * reach;
    const tipDy = dy - dirY * reach;
    const tipDist2 = tipDx * tipDx + tipDy * tipDy;
    if (tipDist2 >= hitRadius2) continue;

    const lateral = Math.abs(dx * dirY - dy * dirX);
    const forwardMiss = Math.abs(reach - forward);
    const score = lateral * 64 + forwardMiss * 8 + tipDist2;
    if (score + MELEE_TARGET_EPSILON < bestScore
      || (Math.abs(score - bestScore) <= MELEE_TARGET_EPSILON && candidate.id < bestId)) {
      best = candidate;
      bestScore = score;
      bestId = candidate.id;
    }
  }

  return best;
}
