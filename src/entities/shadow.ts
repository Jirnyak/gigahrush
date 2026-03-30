/* ── Shadow — dark silhouette (теневик) ───────────────────────── */
/*   Completely black humanoid figure with faint glowing eyes.   */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../render/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.SHADOW,
  name: 'Теневик',
  hp: 45,
  speed: 2.4,
  dmg: 14,
  attackRate: 1.0,
  sprite: 0,   // auto-assigned by generateSprites()
};

export function generateSprite(): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;
  // Head — slightly oval, pure black with noise
  for (let y = 4; y < 18; y++) for (let x = cx - 6; x < cx + 6; x++) {
    if (x < 0 || x >= S) continue;
    const dx = (x - cx) / 6, dy = (y - 11) / 7;
    if (dx * dx + dy * dy < 1) {
      const n = noise(x, y, 1101) * 8;
      t[y * S + x] = rgba(clamp(8 + n), clamp(8 + n), clamp(10 + n));
    }
  }
  // Eyes — faint dim glow
  t[10 * S + (cx - 3)] = rgba(60, 40, 80);
  t[10 * S + (cx + 3)] = rgba(60, 40, 80);
  t[11 * S + (cx - 3)] = rgba(80, 50, 110);
  t[11 * S + (cx + 3)] = rgba(80, 50, 110);
  t[11 * S + (cx - 2)] = rgba(50, 30, 70);
  t[11 * S + (cx + 2)] = rgba(50, 30, 70);
  // Torso — tall slender black form with wispy edges
  for (let y = 18; y < 50; y++) {
    const taper = y < 25 ? 8 : y < 40 ? 7 : 5;
    const wispL = noise(y, 0, 1102) * 3;
    const wispR = noise(0, y, 1103) * 3;
    for (let x = Math.floor(cx - taper - wispL); x < Math.floor(cx + taper + wispR); x++) {
      if (x < 0 || x >= S) continue;
      const edgeDist = Math.min(x - (cx - taper), (cx + taper) - x);
      const n = noise(x, y, 1104) * 6;
      // Edges are semi-transparent (wispy shadow)
      const alpha = edgeDist < 2 ? 120 + Math.floor(noise(x, y, 1105) * 80) : 255;
      t[y * S + x] = rgba(clamp(6 + n), clamp(6 + n), clamp(8 + n), alpha);
    }
  }
  // Arms — thin trailing wisps
  for (let y = 22; y < 44; y++) {
    const spread = (y - 22) * 0.3;
    const lx = Math.floor(cx - 9 - spread + noise(y, 1, 1106) * 2);
    const rx = Math.floor(cx + 9 + spread - noise(1, y, 1107) * 2);
    if (lx >= 0) t[y * S + lx] = rgba(5, 5, 7, 150);
    if (rx < S)  t[y * S + rx] = rgba(5, 5, 7, 150);
    if (lx + 1 < S) t[y * S + lx + 1] = rgba(6, 6, 8, 180);
    if (rx - 1 >= 0) t[y * S + rx - 1] = rgba(6, 6, 8, 180);
  }
  // Lower body dissolves into wisps — no distinct legs
  for (let y = 50; y < 62; y++) {
    const fade = (y - 50) / 12;
    const halfW = Math.floor(5 * (1 - fade));
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      if (x < 0 || x >= S) continue;
      const alpha = Math.floor(200 * (1 - fade) * (0.5 + noise(x, y, 1108) * 0.5));
      if (alpha > 10) t[y * S + x] = rgba(5, 5, 7, alpha);
    }
  }
  return t;
}
