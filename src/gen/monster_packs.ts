/* ── Shared monster pack placement ────────────────────────────────
 * Monsters are placed as packs, not as scattered singles: one lead kind per
 * center, a member count taken from the kind's ecology pack shape, and members
 * grown into the tightest free cells around the center. Design floors and
 * procedural floors use the same helpers, so a swarm reads as a swarm and a
 * loner reads as a loner on every route stop.
 *
 * Generation-time only: bounded by the caller's budget and by
 * `isPopulationPlacementCandidateCell`, no runtime scans.
 */

import { W } from '../core/types';
import { type World } from '../core/world';
import { monsterPackShape, type MonsterPackShape } from '../data/monster_ecology';
import { isPopulationPlacementCandidateCell } from './population_placement';

/** Deterministic 0..1 from (seed, serial, salt) — same mixer the design-floor
 *  populate used before this module existed. */
export function packRand32(seed: number, serial: number, salt: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(serial ^ 0xc2b2ae35, 0x27d4eb2d) + salt;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/** Member count for one pack: the kind's shape range, clamped to the remaining
 *  budget. `roll01` is the caller's deterministic sample. */
export function packMemberCount(shape: MonsterPackShape, budget: number, roll01: number): number {
  const span = Math.max(0, shape.size[1] - shape.size[0]);
  const rolled = shape.size[0] + Math.floor(roll01 * (span + 1));
  return Math.max(1, Math.min(Math.max(1, budget), rolled));
}

/**
 * Cells for one pack around `center`. Tight-first: candidates inside the shape
 * spread are ordered by squared distance with a deterministic fractional
 * tiebreak, so members hug the lead instead of forming a ring. Occupied cells
 * are recorded in `used` so packs never overlap.
 */
export function growPackCells(
  world: World,
  center: number,
  memberCount: number,
  spread: number,
  used: Set<number>,
  seed: number,
  packSerial: number,
): number[] {
  if (memberCount <= 1 || spread <= 0) {
    if (used.has(center) || !isPopulationPlacementCandidateCell(world, center)) return [];
    used.add(center);
    return [center];
  }
  const r = Math.max(1, Math.min(24, Math.ceil(spread)));
  const cx = center % W;
  const cy = (center / W) | 0;
  const r2 = r * r;
  const candidates: { cell: number; key: number }[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const cell = world.idx(world.wrap(cx + dx), world.wrap(cy + dy));
      if (used.has(cell) || !isPopulationPlacementCandidateCell(world, cell)) continue;
      // key = squared distance (tight cluster) + fractional rand tiebreak
      candidates.push({ cell, key: d2 + packRand32(seed, packSerial * 131 + cell, 617) });
    }
  }
  candidates.sort((a, b) => a.key - b.key);
  const take = Math.min(memberCount, candidates.length);
  const out: number[] = [];
  for (let i = 0; i < take; i++) {
    out.push(candidates[i].cell);
    used.add(candidates[i].cell);
  }
  return out;
}

/** Pack shape of the lead kind plus its member count in one call. */
export function packPlanFor(
  kind: Parameters<typeof monsterPackShape>[0],
  budget: number,
  roll01: number,
): { shape: MonsterPackShape; memberCount: number } {
  const shape = monsterPackShape(kind);
  return { shape, memberCount: packMemberCount(shape, budget, roll01) };
}
