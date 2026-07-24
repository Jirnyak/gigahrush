import { EntityType, type Entity } from '../core/types';
import type { World } from '../core/world';

import { WEAPON_STATS } from '../data/catalog';

const MELEE_TARGET_EPSILON = 1e-9;

function meleeTraceClearLine(world: World, x1: number, y1: number, x2: number, y2: number, maxDist: number): boolean {
  const dx = world.delta(x1, x2);
  const dy = world.delta(y1, y2);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > maxDist) return false;
  const steps = Math.max(2, Math.ceil(dist * 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor(world.wrap(x1 + dx * t));
    const y = Math.floor(world.wrap(y1 + dy * t));
    if (world.solid(x, y)) return false;
  }
  return true;
}

/**
 * Pure radius-based melee target selection.
 *
 * Hit zone is a circle centered on the attacker with radius = reach + hitRadius.
 * Everything inside the circle can be hit.  Scoring prefers targets aligned
 * with the attacker's facing direction, but does NOT hard-reject targets
 * behind — only applies a soft angular penalty so point-blank hits always land.
 */
export function selectMeleeTarget(
  world: World,
  attacker: Entity,
  candidates: readonly Entity[],
  reach: number,
  weaponId?: string,
): Entity | undefined {
  const hitRadius = WEAPON_STATS[weaponId || '']?.hitRadius ?? 0.6;

  const dirX = Math.cos(attacker.angle);
  const dirY = Math.sin(attacker.angle);

  let best: Entity | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestId = Number.MAX_SAFE_INTEGER;

  for (const candidate of candidates) {
    if ((candidate.type !== EntityType.MONSTER && candidate.type !== EntityType.NPC) || !candidate.alive) continue;
    if (candidate.id === attacker.id) continue;

    const dx = world.delta(attacker.x, candidate.x);
    const dy = world.delta(attacker.y, candidate.y);
    const dist2 = dx * dx + dy * dy;

    // Circle hit check: attacker center → candidate center ≤ reach + hitRadius + targetRadius
    const targetRadius = candidate.type === EntityType.MONSTER ? 0.18 : 0.16;
    const maxR = reach + hitRadius + targetRadius;
    if (dist2 > maxR * maxR) continue;

    if (!meleeTraceClearLine(world, attacker.x, attacker.y, candidate.x, candidate.y, maxR)) continue;

    // Angular alignment: dot product, normalised by distance
    const dist = Math.sqrt(dist2);
    const dot = dist > 0.01 ? (dx * dirX + dy * dirY) / dist : 1;
    // angularPenalty: 0 when perfectly aligned, up to ~2 when directly behind
    const angularPenalty = 1 - dot; // range [0, 2]

    // Score: prefer close + forward targets; angular penalty scaled gently
    const score = dist2 + angularPenalty * 2.0;

    if (score + MELEE_TARGET_EPSILON < bestScore
      || (Math.abs(score - bestScore) <= MELEE_TARGET_EPSILON && candidate.id < bestId)) {
      best = candidate;
      bestScore = score;
      bestId = candidate.id;
    }
  }

  return best;
}
