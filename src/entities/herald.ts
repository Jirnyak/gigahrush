/* ── Herald (Вестник) — thin tree-like watcher ────────────────── */
/*   Tall, skeletal structure like a dead tree with dangling      */
/*   eyes on thin stalks/tendrils. Otherworldly and eerie.       */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../render/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.HERALD,
  name: 'Вестник',
  hp: 250,
  speed: 1.4,
  dmg: 30,
  attackRate: 2.0,
  sprite: 0,   // auto-assigned by generateSprites()
  isRanged: true,
  projSpeed: 7,
  projSprite: 0,
};

export function generateSprite(): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;

  // Thin skeletal trunk — like a dead tree
  for (let y = 8; y < 60; y++) {
    const sway = Math.sin(y * 0.15) * 1.5;
    const halfW = y < 15 ? 2 :   // thin top
                  y < 45 ? 3 :   // main trunk
                  2;              // thin base
    for (let x = Math.floor(cx - halfW + sway); x <= Math.ceil(cx + halfW + sway); x++) {
      if (x < 0 || x >= S) continue;
      const n = noise(x, y, 800) * 20;
      // Dark brownish-grey bark
      const bark = noise(x * 7, y * 2, 801) > 0.85 ? -20 : 0;
      t[y * S + x] = rgba(
        clamp(55 + n + bark),
        clamp(45 + n + bark),
        clamp(40 + n + bark),
      );
    }
  }

  // Branching stalks with dangling eyes
  const eyeStalks: [number, number, number, number][] = [
    [-12, 12, -1, 0.3],  // left high
    [10, 14, 1, 0.25],   // right high
    [-15, 20, -1, 0.35], // left mid
    [13, 22, 1, 0.3],    // right mid
    [-8, 28, -1, 0.2],   // left low
    [11, 30, 1, 0.28],   // right low
    [-5, 8, -1, 0.15],   // left top
    [7, 10, 1, 0.18],    // right top
  ];

  for (const [ex, ey, dir, curve] of eyeStalks) {
    // Draw thin stalk from trunk to eye position
    const startX = cx;
    const startY = ey;
    const endX = cx + ex;
    const endY = ey + Math.abs(ex) * 0.4 + noise(ex, ey, 802) * 4;
    const steps = Math.max(Math.abs(ex), 8);

    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const sx = Math.floor(startX + (endX - startX) * frac);
      const sy = Math.floor(startY + (endY - startY) * frac + Math.sin(frac * Math.PI) * curve * dir * 8);
      if (sx >= 0 && sx < S && sy >= 0 && sy < S) {
        t[sy * S + sx] = rgba(50, 40, 35);
        // Slightly thicker near trunk
        if (frac < 0.3 && sx + 1 < S) t[sy * S + sx + 1] = rgba(50, 40, 35);
      }
    }

    // Eye at the end of stalk
    const eyeX = endX;
    const eyeY = Math.floor(ey + Math.abs(ex) * 0.4 + noise(ex, ey, 802) * 4);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 5) continue;
        const px = Math.floor(eyeX + dx), py = Math.floor(eyeY + dy);
        if (px >= 0 && px < S && py >= 0 && py < S) {
          // White sclera
          t[py * S + px] = rgba(220, 215, 200);
        }
      }
    }
    // Pupil — sickly green
    const px = Math.floor(eyeX), py = Math.floor(eyeY);
    if (px >= 0 && px < S && py >= 0 && py < S) {
      t[py * S + px] = rgba(30, 180, 60);
      // Glowing effect
      if (px + 1 < S) t[py * S + px + 1] = rgba(60, 200, 80);
      if (py + 1 < S) t[(py + 1) * S + px] = rgba(60, 200, 80);
    }
  }

  // Root-like base spreading on ground
  for (let i = 0; i < 6; i++) {
    const rootDir = (i / 6) * Math.PI * 2;
    for (let r = 0; r < 8; r++) {
      const rx = Math.floor(cx + Math.cos(rootDir) * r);
      const ry = Math.floor(58 + Math.sin(rootDir) * r * 0.3);
      if (rx >= 0 && rx < S && ry >= 0 && ry < S) {
        t[ry * S + rx] = rgba(45, 35, 30);
      }
    }
  }

  // Faint inner glow in trunk — pulsing green
  for (let y = 15; y < 40; y++) {
    const n = noise(cx, y, 803);
    if (n > 0.6) {
      if (cx >= 0 && cx < S) {
        t[y * S + cx] = rgba(40, 100 + Math.floor(n * 60), 50);
      }
    }
  }

  return t;
}
