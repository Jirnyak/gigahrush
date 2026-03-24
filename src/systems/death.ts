/* ── Death camera: rolling head physics ───────────────────────── */
/* Pure visual effect — camera inside a ball rolling on the floor, *
 * bouncing off walls. Rodrigues rotation tracks the camera look   *
 * vector in full 3D as the ball rolls. atan2 gives smooth yaw    *
 * transitions through all directions including backward.          *
 * Does not affect gameplay state.                                 */

import { W } from '../core/types';
import { World } from '../core/world';

const BALL_RADIUS = 0.2;   // physics radius for rolling ball
const FRICTION = 0.65;     // velocity decay per second
const BOUNCE = 0.45;       // velocity retained on wall bounce
const FLOOR_HEIGHT = 0.12; // camera height once on floor
const DROP_SPEED = 4.0;    // how fast camera drops to floor (units/sec)

export interface DeathCam {
  x: number;
  y: number;
  vx: number;
  vy: number;
  height: number;     // current camera height (drops from 0.5 to floor)
  // Camera forward direction as 3D unit vector (rotated by Rodrigues)
  fx: number;
  fy: number;
  fz: number;
  prevYaw: number;    // smoothed yaw (dampened near poles to avoid atan2 singularity)
  timer: number;
  active: boolean;
}

/** Create a death cam from player position, launching in a random direction */
export function initDeathCam(px: number, py: number, pAngle: number): DeathCam {
  const spreadAngle = pAngle + (Math.random() - 0.5) * Math.PI * 0.8;
  const launchSpeed = 2.0 + Math.random() * 2.5;

  // Start looking slightly downward so rolling produces pitch change
  // from any velocity direction (avoids degenerate axis alignment)
  const tilt = -0.3;
  const h = Math.sqrt(1 - tilt * tilt);

  return {
    x: px,
    y: py,
    vx: Math.cos(spreadAngle) * launchSpeed,
    vy: Math.sin(spreadAngle) * launchSpeed,
    height: 0.5,
    fx: Math.cos(pAngle) * h,
    fy: Math.sin(pAngle) * h,
    fz: tilt,
    prevYaw: pAngle,
    timer: 0,
    active: true,
  };
}

/* Rodrigues rotation: rotate vector v around unit axis k by angle θ */
function rotateVec(
  vx: number, vy: number, vz: number,
  kx: number, ky: number, kz: number,
  theta: number,
): [number, number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const dot = kx * vx + ky * vy + kz * vz;
  const cx = ky * vz - kz * vy;
  const cy = kz * vx - kx * vz;
  const cz = kx * vy - ky * vx;
  return [
    vx * c + cx * s + kx * dot * (1 - c),
    vy * c + cy * s + ky * dot * (1 - c),
    vz * c + cz * s + kz * dot * (1 - c),
  ];
}

/** Tick rolling ball physics + Rodrigues camera rotation */
export function updateDeathCam(dc: DeathCam, world: World, dt: number): void {
  if (!dc.active) return;
  dc.timer += dt;

  // Drop height to floor
  if (dc.height > FLOOR_HEIGHT) {
    dc.height = Math.max(FLOOR_HEIGHT, dc.height - DROP_SPEED * dt);
  }

  const speed = Math.sqrt(dc.vx * dc.vx + dc.vy * dc.vy);

  // Stop when slow enough
  if (speed < 0.04 && dc.timer > 0.5) {
    dc.vx = 0;
    dc.vy = 0;
    return;
  }

  // Friction
  const decay = Math.pow(FRICTION, dt);
  dc.vx *= decay;
  dc.vy *= decay;

  // ── Rodrigues: roll the camera direction ────────────────
  // Ball on floor: rotation axis = (-vy, vx, 0) / speed
  // (perpendicular to velocity, in the floor plane)
  if (speed > 0.01) {
    const ax = -dc.vy / speed;
    const ay =  dc.vx / speed;
    const theta = (speed * dt) / BALL_RADIUS;

    const [nx, ny, nz] = rotateVec(dc.fx, dc.fy, dc.fz, ax, ay, 0, theta);
    // Renormalize to prevent drift
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    dc.fx = nx / len;
    dc.fy = ny / len;
    dc.fz = nz / len;
  }

  // ── Wall collision & position update ───────────────────
  const wxO = ((Math.floor(dc.x) % W) + W) % W;
  const wyO = ((Math.floor(dc.y) % W) + W) % W;

  let hitX = false, hitY = false;

  const offX = dc.vx > 0 ? BALL_RADIUS : -BALL_RADIUS;
  const offY = dc.vy > 0 ? BALL_RADIUS : -BALL_RADIUS;
  const nxPos = dc.x + dc.vx * dt;
  const nyPos = dc.y + dc.vy * dt;

  const cxCheck = ((Math.floor(nxPos + offX) % W) + W) % W;
  if (world.solid(cxCheck, wyO)) {
    dc.vx = -dc.vx * BOUNCE;
    hitX = true;
  }

  const cyCheck = ((Math.floor(nyPos + offY) % W) + W) % W;
  if (world.solid(wxO, cyCheck)) {
    dc.vy = -dc.vy * BOUNCE;
    hitY = true;
  }

  if (!hitX && !hitY) {
    const cxD = ((Math.floor(nxPos + offX) % W) + W) % W;
    const cyD = ((Math.floor(nyPos + offY) % W) + W) % W;
    if (world.solid(cxD, cyD)) {
      dc.vx = -dc.vx * BOUNCE;
      dc.vy = -dc.vy * BOUNCE;
    }
  }

  dc.x = ((dc.x + dc.vx * dt) % W + W) % W;
  dc.y = ((dc.y + dc.vy * dt) % W + W) % W;
}

/** Yaw from look vector — dampened near poles to avoid atan2 singularity */
export function getDeathCamAngle(dc: DeathCam): number {
  const raw = Math.atan2(dc.fy, dc.fx);
  // Near poles (|fz|→1), fx/fy→0 and atan2 jitters wildly.
  // Blend toward previous yaw proportionally to XY projection length.
  const xyLen = Math.sqrt(dc.fx * dc.fx + dc.fy * dc.fy);
  const t = Math.min(1, xyLen / 0.4);
  let diff = raw - dc.prevYaw;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  dc.prevYaw += diff * t;
  return dc.prevYaw;
}

/** Pitch from vertical component of look vector, mapped directly to -1..1 */
export function getDeathCamPitch(dc: DeathCam): number {
  return Math.max(-1, Math.min(1, dc.fz));
}
