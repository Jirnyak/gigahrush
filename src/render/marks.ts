/* ── Procedural surface marks — shader-style splat generator ──── *
 *
 * Each mark is generated pixel-by-pixel via a procedural function
 * (like a fragment shader). The shape is computed from seed + position,
 * producing organic splatters, cracks, scorch marks, drips, etc.
 *
 * Generated marks are stamped onto the world's 16×16 per-cell surface
 * grid, naturally spilling across cell boundaries.
 *
 * ────────────────────────────────────────────────────────────────── */

import { W, Cell } from '../core/types';
import { World } from '../core/world';

/* ── Fast hash (same family as pixutil.noise) ─────────────────── */
function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) | 0;
  n = n ^ (n >>> 4);
  n = (n * 0x27d4eb2d) | 0;
  n = n ^ (n >>> 15);
  return (n & 0x7fffffff) / 0x7fffffff; // 0..1
}

function hash2(x: number, y: number, s: number): number {
  return hash((x * 374761393 + y * 668265263 + s * 1274126177) | 0);
}

/* smooth noise with bilinear interpolation */
function snoise(x: number, y: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash2(ix, iy, s);
  const b = hash2(ix + 1, iy, s);
  const c = hash2(ix, iy + 1, s);
  const d = hash2(ix + 1, iy + 1, s);
  const lx = fx * fx * (3 - 2 * fx); // smoothstep
  const ly = fy * fy * (3 - 2 * fy);
  return a + (b - a) * lx + (c - a) * ly + (a - b - c + d) * lx * ly;
}

/* fractal brownian motion — 3 octaves */
function fbm(x: number, y: number, s: number): number {
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < 3; i++) {
    v += snoise(x * freq, y * freq, s + i * 137) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v;
}

/* ── Mark shape types ─────────────────────────────────────────── */
export const enum MarkType {
  SPLAT,    // blood / fluid splatter — organic, irregular outline with tendrils
  BULLET,   // bullet hole — small dense center + micro-cracks
  SCORCH,   // explosion / flame — radial gradient with charred edges
  DRIP,     // urine / fluid drip — elongated, gravity-pulled
  POOL,     // death pool — large, irregular outline, high coverage
  PSI,      // psi-energy mark — purple, crystalline, angular
  BURN,     // fire burn — torn/wispy charred patches, semi-transparent
}

/* ── Fragment shader per mark type ────────────────────────────── *
 * Returns alpha 0..1 for a normalized coordinate (u,v) in [-1..1].
 * The mark is conceptually a unit disk; the shader decides shape.  */

function shaderSplat(u: number, v: number, seed: number): number {
  const r = Math.sqrt(u * u + v * v);
  if (r > 1) return 0;
  // Noisy edge with tendrils
  const angle = Math.atan2(v, u);
  const tendrilFreq = 3 + hash(seed + 11) * 5; // 3-8 tendrils
  const tendrilAmp = 0.15 + hash(seed + 22) * 0.25;
  const nEdge = fbm(angle * tendrilFreq / 6.28, r * 3, seed);
  const edgeR = 0.55 + tendrilAmp * (nEdge - 0.5) * 2;
  // Secondary splotches
  const blobs = fbm(u * 2.5 + hash(seed + 3) * 10, v * 2.5 + hash(seed + 4) * 10, seed + 77);
  const blobBoost = blobs > 0.55 ? (blobs - 0.55) * 3 : 0;
  const dist = r - edgeR - blobBoost * 0.3;
  if (dist > 0.15) return 0;
  if (dist > 0) return 1 - dist / 0.15;
  return 1;
}

function shaderBullet(u: number, v: number, seed: number): number {
  const r = Math.sqrt(u * u + v * v);
  // Dense dark center
  if (r < 0.3) return 1;
  // Micro-cracks radiating out
  const angle = Math.atan2(v, u);
  const crackCount = 4 + Math.floor(hash(seed + 1) * 5); // 4-8 cracks
  const crackPhase = hash(seed + 2) * 6.28;
  let crackAlpha = 0;
  for (let i = 0; i < crackCount; i++) {
    const ca = crackPhase + i * (6.28 / crackCount) + (hash(seed + 10 + i) - 0.5) * 0.8;
    let da = Math.abs(angle - ca);
    if (da > Math.PI) da = 6.28 - da;
    const crackWidth = 0.08 + hash(seed + 20 + i) * 0.06;
    const crackLen = 0.5 + hash(seed + 30 + i) * 0.5;
    if (da < crackWidth && r < crackLen) {
      const t = 1 - r / crackLen;
      crackAlpha = Math.max(crackAlpha, t * (1 - da / crackWidth));
    }
  }
  // Annular ring around center
  const ring = Math.abs(r - 0.35) < 0.08 ? 1 - Math.abs(r - 0.35) / 0.08 : 0;
  return Math.min(1, Math.max(ring * 0.6, crackAlpha) * (r < 1 ? 1 : 0));
}

function shaderScorch(u: number, v: number, seed: number): number {
  const r = Math.sqrt(u * u + v * v);
  if (r > 1) return 0;
  // Noisy radial with charred edges
  const n = fbm(u * 3 + hash(seed) * 5, v * 3 + hash(seed + 1) * 5, seed + 200);
  const edge = 0.6 + n * 0.35;
  if (r > edge) {
    const outer = (r - edge) / (1 - edge);
    return Math.max(0, (1 - outer) * 0.4);
  }
  return 0.7 + (1 - r / edge) * 0.3;
}

function shaderDrip(u: number, v: number, seed: number): number {
  // Elongated downward (v direction = "down" on the surface)
  const su = u * 1.8; // squish horizontally
  const sv = v * 0.7 - 0.2; // stretch vertically, shift down
  const r = Math.sqrt(su * su + sv * sv);
  if (r > 1) return 0;
  const n = snoise(su * 4, sv * 3, seed);
  const edge = 0.5 + n * 0.3;
  // Drip tail
  if (v > 0.2) {
    const tailWidth = 0.15 - (v - 0.2) * 0.12;
    if (Math.abs(u) < tailWidth) return Math.max(0, 1 - (v - 0.2) * 1.5);
  }
  if (r > edge) return Math.max(0, (1 - (r - edge) / 0.3) * 0.5);
  return 1;
}

function shaderPool(u: number, v: number, seed: number): number {
  const r = Math.sqrt(u * u + v * v);
  if (r > 1) return 0;
  // Large noisy blob
  const n1 = fbm(u * 2 + hash(seed) * 8, v * 2 + hash(seed + 1) * 8, seed + 300);
  const n2 = fbm(u * 4, v * 4, seed + 500);
  const edge = 0.65 + n1 * 0.25;
  const inner = 0.3 + n2 * 0.15;
  if (r > edge) return Math.max(0, (1 - (r - edge) / 0.25) * 0.3);
  if (r < inner) return 0.9 + n2 * 0.1;
  const t = (r - inner) / (edge - inner);
  return 0.9 - t * 0.4;
}

function shaderPsi(u: number, v: number, seed: number): number {
  const r = Math.sqrt(u * u + v * v);
  if (r > 1) return 0;
  // Crystalline angular shape
  const angle = Math.atan2(v, u);
  const sides = 5 + Math.floor(hash(seed) * 4); // 5-8 sides
  const polyR = Math.cos(Math.PI / sides) / Math.cos(((angle + hash(seed + 5)) % (2 * Math.PI / sides)) - Math.PI / sides);
  const pr = r / Math.max(0.01, Math.abs(polyR) * 0.7);
  if (pr > 1) {
    // Glow falloff
    return Math.max(0, (1.3 - pr) / 0.3 * 0.3);
  }
  const n = snoise(u * 5, v * 5, seed + 400);
  return 0.7 + n * 0.3;
}

function shaderBurn(u: number, v: number, seed: number): number {
  const r = Math.sqrt(u * u + v * v);
  if (r > 1.25) return 0;
  // Multi-layer noise for highly irregular torn shape
  const n1 = fbm(u * 5 + hash(seed) * 10, v * 5 + hash(seed + 1) * 10, seed + 200);
  const n2 = fbm(u * 10 + hash(seed + 2) * 6, v * 10 + hash(seed + 3) * 6, seed + 300);
  const n3 = snoise(u * 16 + hash(seed + 4) * 8, v * 16 + hash(seed + 5) * 8, seed + 400);
  // Very irregular torn edge
  const edge = 0.3 + n1 * 0.35 + n2 * 0.15;
  // Thin wispy tendrils reaching outward
  const tendril = n3 > 0.5 ? (n3 - 0.5) * 2.0 : 0;
  const effectiveR = r - tendril * 0.22;
  if (effectiveR > edge + 0.3) return 0;
  if (effectiveR > edge) {
    // Thin transparent charred fringe — very faint
    const t = (effectiveR - edge) / 0.3;
    return Math.max(0, (1 - t * t) * 0.18);
  }
  // Inner: charred texture with variation — moderate alpha, not opaque
  const inner = 1 - effectiveR / edge;
  const charPat = n2 * 0.25 + inner * 0.4;
  return 0.3 + charPat * 0.45;
}

/* ── Shader dispatch ──────────────────────────────────────────── */
const SHADERS: ((u: number, v: number, seed: number) => number)[] = [
  shaderSplat, shaderBullet, shaderScorch, shaderDrip, shaderPool, shaderPsi, shaderBurn,
];

/* ── Generate & stamp a mark onto the world surface grid ──────── *
 *
 * cx, cy   — integer cell coordinates (center cell)
 * fx, fy   — fractional position within center cell (0..1)
 * radius   — radius in cells (e.g. 0.3 = spans ~0.6 cells)
 * type     — MarkType enum
 * seed     — unique seed for shape variation
 * r, g, b  — mark color
 * intensity — max alpha 0..255
 * wallOk   — if true, allows marking on wall cells (for wall splatters)
 */
export function stampMark(
  world: World,
  cx: number, cy: number,
  fx: number, fy: number,
  radius: number,
  type: MarkType,
  seed: number,
  r: number, g: number, b: number,
  intensity = 220,
  wallOk = false,
): void {
  const shader = SHADERS[type] ?? SHADERS[0];
  // Convert to 16×16 grid coordinates
  const centerPx = fx * 16;
  const centerPy = fy * 16;
  const radiusPx = Math.max(1, radius * 16);

  // Scan bounding box of the mark in surface-pixel space
  const r2 = radiusPx + 1;
  for (let dy = -r2; dy <= r2; dy++) {
    for (let dx = -r2; dx <= r2; dx++) {
      // Absolute pixel position relative to center cell's surface grid
      let px = Math.floor(centerPx + dx);
      let py = Math.floor(centerPy + dy);

      // Determine which cell this pixel belongs to
      let cellDx = 0, cellDy = 0;
      while (px < 0)  { px += 16; cellDx--; }
      while (px >= 16) { px -= 16; cellDx++; }
      while (py < 0)  { py += 16; cellDy--; }
      while (py >= 16) { py -= 16; cellDy++; }

      const ncx = ((cx + cellDx) % W + W) % W;
      const ncy = ((cy + cellDy) % W + W) % W;
      const ci = ncy * W + ncx;

      if (!wallOk && world.cells[ci] === Cell.WALL) continue;

      // Normalized coordinates for the shader: [-1..1]
      const u = dx / radiusPx;
      const v = dy / radiusPx;

      // Run the procedural shader
      const alpha = shader(u, v, seed);
      if (alpha <= 0.01) continue;

      const newA = Math.min(255, Math.floor(intensity * alpha));
      if (newA <= 0) continue;

      // Write to cell's surface map
      let cell = world.surfaceMap.get(ci);
      if (!cell) { cell = new Uint8Array(1024); world.surfaceMap.set(ci, cell); }

      const idx = (py * 16 + px) << 2;
      const curA = cell[idx + 3];
      if (curA === 0) {
        cell[idx] = r; cell[idx + 1] = g; cell[idx + 2] = b; cell[idx + 3] = newA;
      } else {
        const total = curA + newA;
        cell[idx]     = Math.floor((cell[idx]     * curA + r * newA) / total);
        cell[idx + 1] = Math.floor((cell[idx + 1] * curA + g * newA) / total);
        cell[idx + 2] = Math.floor((cell[idx + 2] * curA + b * newA) / total);
        cell[idx + 3] = Math.min(255, total);
      }
    }
  }
}
