/* ── Rebar — inorganic rebar monster (арматура) ───────────────── */
/*   Constructed from twisted construction rebar and concrete.   */
/*   Looks like animated building materials — rods, wires, rust. */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../render/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.REBAR,
  name: 'Арматура',
  hp: 90,
  speed: 0.9,
  dmg: 22,
  attackRate: 2.2,
  sprite: 0,   // auto-assigned by generateSprites()
};

export function generateSprite(): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;

  // Main vertical rebar rods (the skeleton of the creature)
  const rods = [cx - 6, cx - 2, cx + 2, cx + 6];
  for (const rx of rods) {
    for (let y = 4; y < 58; y++) {
      if (rx < 0 || rx >= S) continue;
      const n = noise(rx, y, 1201) * 20;
      const rust = noise(rx * 3, y * 2, 1202) > 0.7 ? 30 : 0;
      // Rebar color: dark grey iron with rust patches
      t[y * S + rx] = rgba(
        clamp(70 + n + rust),
        clamp(60 + n),
        clamp(55 + n - rust * 0.5),
      );
      // Rod is 2px wide
      if (rx + 1 < S) {
        t[y * S + rx + 1] = rgba(
          clamp(65 + n + rust),
          clamp(55 + n),
          clamp(50 + n - rust * 0.5),
        );
      }
    }
  }

  // Cross-bars (horizontal rebar ties)
  for (let y = 10; y < 55; y += 6 + Math.floor(noise(0, y, 1203) * 4)) {
    const startX = cx - 7, endX = cx + 8;
    for (let x = startX; x < endX; x++) {
      if (x < 0 || x >= S) continue;
      const n = noise(x, y, 1204) * 15;
      t[y * S + x] = rgba(clamp(60 + n), clamp(55 + n), clamp(50 + n));
    }
  }

  // Concrete chunks clinging to rebar
  for (let i = 0; i < 8; i++) {
    const chunkX = Math.floor(cx - 5 + noise(i, 0, 1205) * 10);
    const chunkY = Math.floor(10 + noise(0, i, 1206) * 40);
    const chunkR = 2 + Math.floor(noise(i, i, 1207) * 3);
    for (let dy = -chunkR; dy <= chunkR; dy++) for (let dx = -chunkR; dx <= chunkR; dx++) {
      if (dx * dx + dy * dy > chunkR * chunkR) continue;
      const px = chunkX + dx, py = chunkY + dy;
      if (px < 0 || px >= S || py < 0 || py >= S) continue;
      const n = noise(px, py, 1208) * 25;
      const crack = noise(px * 3, py * 3, 1209) > 0.85 ? -25 : 0;
      t[py * S + px] = rgba(
        clamp(105 + n + crack),
        clamp(100 + n + crack),
        clamp(95 + n + crack),
      );
    }
  }

  // Twisted wire wrapping
  for (let y = 8; y < 55; y++) {
    const waveX = Math.floor(cx + Math.sin(y * 0.5) * 8);
    if (waveX >= 0 && waveX < S && t[y * S + waveX] === CLEAR) {
      t[y * S + waveX] = rgba(50, 45, 40);
    }
  }

  // Eyes — sparking red glow in gaps between rebar (at head height)
  const eyeY = 8;
  t[eyeY * S + (cx - 3)] = rgba(255, 60, 30);
  t[eyeY * S + (cx + 3)] = rgba(255, 60, 30);
  t[(eyeY + 1) * S + (cx - 3)] = rgba(200, 40, 20);
  t[(eyeY + 1) * S + (cx + 3)] = rgba(200, 40, 20);

  // Protruding sharp rebar tips at top (like horns)
  for (let y = 0; y < 5; y++) {
    const n = noise(cx - 4, y, 1210) * 10;
    t[y * S + (cx - 4)] = rgba(clamp(75 + n), clamp(65 + n), clamp(60 + n));
    t[y * S + (cx + 5)] = rgba(clamp(75 + n), clamp(65 + n), clamp(60 + n));
  }

  return t;
}
