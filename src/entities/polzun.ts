/* ── Polzun — low crawling horror ─────────────────────────────── */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../render/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.POLZUN,
  name: 'Ползун',
  hp: 80,
  speed: 1.0,
  dmg: 18,
  attackRate: 2.0,
  sprite: 0,   // auto-assigned by generateSprites()
};

export function generateSprite(): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;
  // Flat wide body near bottom
  for (let y = 35; y < 58; y++) for (let x = cx - 18; x < cx + 18; x++) {
    if (x < 0 || x >= S) continue;
    const dx = (x - cx) / 18, dy = (y - 48) / 12;
    if (dx * dx + dy * dy < 1) {
      const n = noise(x, y, 666) * 25;
      const vein = Math.sin(x * 0.7 + y * 0.3) * 10;
      t[y * S + x] = rgba(clamp(60 + n + vein), clamp(55 + n), clamp(40 + n));
    }
  }
  // Head protrusion
  for (let y = 28; y < 40; y++) for (let x = cx - 5; x < cx + 5; x++) {
    const n = noise(x, y, 667) * 15;
    t[y * S + x] = rgba(clamp(70 + n), clamp(60 + n), clamp(45 + n));
  }
  // Eyes
  t[32 * S + (cx - 2)] = rgba(255, 200, 50);
  t[32 * S + (cx + 2)] = rgba(255, 200, 50);
  return t;
}
