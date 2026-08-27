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
import { stepActorBy } from '../movement_collision';

/* ── Tuning constants ────────────────────────────────────────── */

/** Fraction of entity speed used for orbital movement (< 1 keeps orbit slower than chase) */
const ORBIT_SPEED_FRAC = 0.55;

/** Body radius for collision checks during orbit */
const ORBIT_BODY_R = 0.16;

/** How strongly the actor corrects radial distance vs. orbits tangentially.
 *  Higher = more radial correction, less strafe.  0.35 feels natural. */
const RADIAL_WEIGHT = 0.35;

/** Полоса периодов дыхания по радиусу (секунды); свой период у каждого актора */
const PULSE_CD_MIN = 0.8;
const PULSE_CD_MAX = 2.2;

/** Амплитуда дыхания: насколько идеальный радиус ходит в обе стороны */
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

  /* Дыхание полосы — НЕПРЕРЫВНАЯ функция фазы, а не однокадровый рывок.
   *
   * Здесь стоял бросок, живший ровно тот кадр, в котором откат перешёл ноль:
   * один кадр из ста с лишним. И возмущал он шаг, уже ограниченный
   * `e.speed * ORBIT_SPEED_FRAC * dt` — около двух сотых клетки при 60 к/с.
   * Задуманного «стрелки дышат по своей полосе» не происходило никогда, а
   * `PULSE_DELTA_MAX` и обе `PULSE_CD_*` были инертны.
   *
   * Теперь `orbitPulseCd` — это ФАЗА: она набегает временем и оборачивается на
   * полном круге, поэтому синус непрерывен и на самом обороте (sin 0 = sin 2π).
   * Период — свойство актора, а не броска в момент сброса: хранить его негде, а
   * нового поля `AIState` он не стоит. Остаток id раскладывает соседей по всей
   * объявленной полосе тем же приёмом, каким строкой выше выбрано направление
   * орбиты, поэтому толпа не дышит в такт.
   */
  const pulsePeriod = PULSE_CD_MIN + ((e.id % 8) / 8) * (PULSE_CD_MAX - PULSE_CD_MIN);
  ai.orbitPulseCd = ((ai.orbitPulseCd ?? 0) + dt) % pulsePeriod;
  const pulseOffset = Math.sin((ai.orbitPulseCd / pulsePeriod) * Math.PI * 2)
    * Math.min(radiusDelta, PULSE_DELTA_MAX);

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

  // Общий изотропный шаг: полный 2D-вектор, осевое скольжение только как фолбэк.
  let moved = stepActorBy(world, e, mx, my, ORBIT_BODY_R);

  // If completely stuck — flip orbit direction and nudge along intended radial correction
  if (!moved) {
    ai.orbitDir = -ai.orbitDir;
    // Fallback: nudge in the direction the orbit was already correcting
    // radialErr > 0 = too far → nudge inward; radialErr < 0 = too close → nudge outward
    const nudgeDir = radialErr > 0.1 ? -1 : radialErr < -0.1 ? 1 : 0;
    if (nudgeDir !== 0) {
      moved = stepActorBy(world, e, rx * nudgeDir * step * 0.5, ry * nudgeDir * step * 0.5, ORBIT_BODY_R);
    }
  }

  return moved;
}

