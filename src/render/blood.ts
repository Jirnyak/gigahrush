/* ── Blood FX — procedural splatter, trails, pools ────────────── */

import { W, type Entity, EntityType } from '../core/types';
import { World } from '../core/world';

/* ── Screen-space blood particles ─────────────────────────────── */
export interface BloodParticle {
  x: number; y: number;      // world position
  vx: number; vy: number;    // velocity (cells/sec)
  life: number;              // remaining seconds
  size: number;              // 1-3 px
  r: number; g: number; b: number;
}

const MAX_PARTICLES = 256;
export const particles: BloodParticle[] = [];

// Incrementing counter ensures every splatter is unique
let _splatterSeed = 0;

// Substance colors (R, G, B)
const BLOOD: [number, number, number] = [140, 10, 10];
const GORE:  [number, number, number] = [30, 40, 10];

/* ── Spawn blood particles on hit ─────────────────────────────── */
export function spawnBloodHit(world: World, ex: number, ey: number, fromAngle: number, dmg: number, gore = false): void {
  const seed = ++_splatterSeed;
  const [sr, sg, sb] = gore ? GORE : BLOOD;
  // Floor blood stamp at entity position
  const cx = Math.floor(ex), cy = Math.floor(ey);
  const fx = ex - cx, fy = ey - cy;
  const radius = Math.min(0.35, 0.08 + dmg * 0.004);
  const intensity = Math.min(220, 80 + dmg * 3);
  world.stamp(cx, cy, fx, fy, radius, intensity, seed, sr, sg, sb);

  // Spray some blood in hit direction (away from attacker)
  const count = Math.min(24, 4 + Math.floor(dmg * 0.3));
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const spread = (Math.random() - 0.5) * 1.6;
    const ang = fromAngle + Math.PI + spread;
    const spd = 1.5 + Math.random() * 3;
    // Unique color per particle — dark red / crimson / maroon
    const h = (seed * 7 + i * 31) & 0xFF;
    particles.push({
      x: ex, y: ey,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.15 + Math.random() * 0.25,
      size: 1 + (h & 1),
      r: gore ? 20 + (h & 31) : 120 + (h & 63),
      g: gore ? 25 + (h & 15) : 5 + (h & 15),
      b: gore ? 5 + (h & 7) : 5 + (h & 7),
    });
  }
}

/* ── Large blood pool on death ────────────────────────────────── */
export function spawnDeathPool(world: World, ex: number, ey: number, gore = false): void {
  const seed = ++_splatterSeed;
  const [sr, sg, sb] = gore ? GORE : BLOOD;
  const cx = Math.floor(ex), cy = Math.floor(ey);
  const fx = ex - cx, fy = ey - cy;
  // Large central pool
  world.stamp(cx, cy, fx, fy, 0.45, 255, seed, sr, sg, sb);
  // Secondary splatters around
  for (let i = 0; i < 5; i++) {
    const ox = (((seed * 73856093 + i * 19349663) >>> 0) % 100 - 50) / 100;
    const oy = (((seed * 19349663 + i * 83492791) >>> 0) % 100 - 50) / 100;
    const sx = ex + ox * 0.6;
    const sy = ey + oy * 0.6;
    const scx = Math.floor(sx), scy = Math.floor(sy);
    world.stamp(scx, scy, sx - scx, sy - scy, 0.2, 180, seed + i + 1, sr, sg, sb);
  }
}

/* ── Blood drip trail for wounded entities ────────────────────── */
export function updateBloodTrails(world: World, entities: Entity[], dt: number): void {
  // Only process every ~0.3s worth of dt (accumulate externally)
  for (const e of entities) {
    if (!e.alive) continue;
    if (e.type === EntityType.PROJECTILE || e.type === EntityType.ITEM_DROP) continue;
    if (e.hp === undefined || e.maxHp === undefined) continue;
    const ratio = e.hp / e.maxHp;
    if (ratio >= 0.5) continue;  // only bleed when under 50% HP
    // Drip probability scales with damage
    const drip = (0.5 - ratio) * 2;  // 0..1
    if (Math.random() > drip * dt * 3) continue;
    const cx = Math.floor(e.x), cy = Math.floor(e.y);
    const fx = e.x - cx + (Math.random() - 0.5) * 0.3;
    const fy = e.y - cy + (Math.random() - 0.5) * 0.3;
    const isGore = e.type === EntityType.MONSTER;
    const [sr, sg, sb] = isGore ? GORE : BLOOD;
    world.stamp(cx, cy,
      Math.max(0, Math.min(0.999, fx)),
      Math.max(0, Math.min(0.999, fy)),
      0.06 + Math.random() * 0.04,
      60 + Math.floor(Math.random() * 40),
      ++_splatterSeed, sr, sg, sb);
  }
}

/* ── Update particles physics ─────────────────────────────────── */
export function updateParticles(world: World, dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      // Particle lands → stamp a tiny blood dot on the floor
      const cx = Math.floor(p.x), cy = Math.floor(p.y);
      const fx = ((p.x % 1) + 1) % 1;
      const fy = ((p.y % 1) + 1) % 1;
      world.stamp(cx, cy, fx, fy, 0.04, 100, ++_splatterSeed, ...BLOOD);
      particles.splice(i, 1);
      continue;
    }
    // Gravity + friction
    p.vy += 0.5 * dt; // slight world-space drift
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.x = ((p.x + p.vx * dt) % W + W) % W;
    p.y = ((p.y + p.vy * dt) % W + W) % W;
  }
}

/* ── Render particles into screen buffer ──────────────────────── */
export function renderParticles(
  buf: Uint32Array, scrW: number, scrH: number,
  px: number, py: number, _pAngle: number,
  dirX: number, dirY: number, planeX: number, planeY: number,
  halfH: number,
  columnDepth: Float64Array,
): void {
  if (particles.length === 0) return;
  const invDet = 1.0 / (planeX * dirY - dirX * planeY);

  for (const p of particles) {
    let dx = p.x - px;
    let dy = p.y - py;
    if (dx >  W / 2) dx -= W;
    if (dx < -W / 2) dx += W;
    if (dy >  W / 2) dy -= W;
    if (dy < -W / 2) dy += W;

    const txf = invDet * (dirY * dx - dirX * dy);
    const tyf = invDet * (-planeY * dx + planeX * dy);
    if (tyf <= 0.1) continue;

    const sx = Math.floor((scrW / 2) * (1 + txf / tyf));
    if (sx < 0 || sx >= scrW) continue;
    // Z-buffer: don't render particles behind walls
    if (tyf >= columnDepth[sx]) continue;
    const sy = Math.floor(halfH + scrH / (tyf * 2));  // at floor level
    if (sy < 0 || sy >= scrH) continue;

    const alpha = Math.min(1, p.life * 5);  // fade out
    const sz = p.size;
    for (let oy = -sz; oy <= sz; oy++) {
      for (let ox = -sz; ox <= sz; ox++) {
        const px2 = sx + ox, py2 = sy + oy;
        if (px2 < 0 || px2 >= scrW || py2 < 0 || py2 >= scrH) continue;
        const idx = py2 * scrW + px2;
        const bg = buf[idx];
        const br = (bg & 0xFF), bgg = ((bg >> 8) & 0xFF), bb = ((bg >> 16) & 0xFF);
        const nr = Math.min(255, Math.floor(br * (1 - alpha) + p.r * alpha));
        const ng = Math.min(255, Math.floor(bgg * (1 - alpha) + p.g * alpha));
        const nb = Math.min(255, Math.floor(bb * (1 - alpha) + p.b * alpha));
        buf[idx] = ((0xFF << 24) | (nb << 16) | (ng << 8) | nr) >>> 0;
      }
    }
  }
}
