/* ── Combat orbital step: universal combat movement ───────────── */
/*
 * One cheap fine-movement helper that lets any actor (NPC or monster) circle
 * around its combat target.  Works like knockback: direct position adjustment
 * with wall-collision checks, no pathfinding or BFS.
 *
 * Called from melee-range strafing, ranged cooldown strafing, and hunt-range
 * approach transitions.
 */

import { type Entity } from '../../core/types';
import { World } from '../../core/world';
import { canActorOccupy, entityIgnoresFineBlockers } from '../movement_collision';
import { rng } from '../../core/rand';

/* ── Tuning constants ────────────────────────────────────────── */

/** Fraction of entity speed used for orbital movement (< 1 keeps orbit slower than chase) */
const ORBIT_SPEED_FRAC = 0.55;

/** Body radius for collision checks during orbit */
const ORBIT_BODY_R = 0.16;

/** How strongly the actor corrects radial distance vs. orbits tangentially.
 *  Higher = more radial correction, less strafe.  0.35 feels natural. */
const RADIAL_WEIGHT = 0.35;

/** Cooldown range for random radius-delta pulses (seconds) */
const PULSE_CD_MIN = 0.8;
const PULSE_CD_MAX = 2.2;

/** Max random offset added to idealRadius during a pulse */
const PULSE_DELTA_MAX = 1.5;

/**
 * Attempt one frame of orbital movement around `target`.
 *
 * @param idealRadius  desired orbit distance (≈ weapon range)
 * @param radiusDelta  allowed ± band around idealRadius
 * @param dt           frame delta
 * @returns true if the actor moved
 */
export function tryCombatOrbitStep(
  world: World,
  e: Entity,
  target: Entity,
  idealRadius: number,
  radiusDelta: number,
  dt: number,
): boolean {
  const ai = e.ai;
  if (!ai) return false;

  // Vector from target → actor (toroidal)
  const dx = world.delta(target.x, e.x);
  const dy = world.delta(target.y, e.y);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.01) return false; // sitting on top of target, let regular AI handle

  // Normalised radial direction (away from target)
  const rx = dx / dist;
  const ry = dy / dist;

  // Orbit direction: initialise once per target engagement
  if (ai.orbitDir === undefined) ai.orbitDir = e.id % 2 === 0 ? 1 : -1;

  // Tangent vector (perpendicular to radial, respecting orbitDir)
  const tx = -ry * ai.orbitDir;
  const ty = rx * ai.orbitDir;

  // Pulse: periodically jitter the ideal radius for organic movement
  ai.orbitPulseCd = (ai.orbitPulseCd ?? 0) - dt;
  let pulseOffset = 0;
  if (ai.orbitPulseCd <= 0) {
    ai.orbitPulseCd = PULSE_CD_MIN + rng() * (PULSE_CD_MAX - PULSE_CD_MIN);
    pulseOffset = (rng() - 0.5) * 2 * Math.min(radiusDelta, PULSE_DELTA_MAX);
  }

  // Radial error: positive = too far, negative = too close
  const effectiveIdeal = idealRadius + pulseOffset;
  const radialErr = dist - effectiveIdeal;
  const clampedErr = Math.max(-radiusDelta, Math.min(radiusDelta, radialErr));

  // Compose movement: radial correction + tangential orbit
  //   radialCorrection pushes actor toward ideal distance
  //   tangential orbit pushes actor sideways around target
  const radialMag = -clampedErr * RADIAL_WEIGHT; // negative = move toward target when too far
  const tangentMag = 1.0 - Math.abs(clampedErr / Math.max(0.5, radiusDelta)) * 0.3; // reduce orbit when correcting hard

  let mx = rx * radialMag + tx * tangentMag;
  let my = ry * radialMag + ty * tangentMag;

  // Normalise and scale by speed
  const mLen = Math.sqrt(mx * mx + my * my);
  if (mLen < 0.001) return false;
  const step = Math.min(e.speed * ORBIT_SPEED_FRAC * dt, 0.9); // cap per-frame step
  mx = (mx / mLen) * step;
  my = (my / mLen) * step;

  // Face the target
  const faceX = world.delta(e.x, target.x);
  const faceY = world.delta(e.y, target.y);
  e.angle = Math.atan2(faceY, faceX);

  // Try full step
  const ignoreFine = entityIgnoresFineBlockers(e);
  const nx = world.wrap(e.x + mx);
  const ny = world.wrap(e.y + my);

  if (canActorOccupy(world, nx, ny, ORBIT_BODY_R, { ignoreFineBlockers: ignoreFine })) {
    e.x = nx;
    e.y = ny;
    return true;
  }

  // Full step blocked — try axis-separated movement
  let moved = false;
  if (canActorOccupy(world, nx, e.y, ORBIT_BODY_R, { ignoreFineBlockers: ignoreFine })) {
    e.x = nx;
    moved = true;
  }
  if (canActorOccupy(world, moved ? e.x : e.x, ny, ORBIT_BODY_R, { ignoreFineBlockers: ignoreFine })) {
    e.y = ny;
    moved = true;
  }

  // If completely stuck — flip orbit direction and nudge along intended radial correction
  if (!moved) {
    ai.orbitDir = -ai.orbitDir;
    // Fallback: nudge in the direction the orbit was already correcting
    // radialErr > 0 = too far → nudge inward; radialErr < 0 = too close → nudge outward
    const nudgeDir = radialErr > 0.1 ? -1 : radialErr < -0.1 ? 1 : 0;
    if (nudgeDir !== 0) {
      const inX = world.wrap(e.x + rx * nudgeDir * step * 0.5);
      const inY = world.wrap(e.y + ry * nudgeDir * step * 0.5);
      if (canActorOccupy(world, inX, inY, ORBIT_BODY_R, { ignoreFineBlockers: ignoreFine })) {
        e.x = inX;
        e.y = inY;
        moved = true;
      }
    }
  }

  return moved;
}

/** Reset orbit state when switching targets */
export function resetOrbitState(ai: { orbitDir?: number; orbitPulseCd?: number }): void {
  ai.orbitDir = undefined;
  ai.orbitPulseCd = undefined;
}
