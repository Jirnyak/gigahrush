/* ── Polzun — low crawling horror ─────────────────────────────── */

import { TEX, MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';

const S = TEX;
function rgba(r: number, g: number, b: number, a = 255): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
function noise(x: number, y: number, s: number): number {
  let n = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
  n = (n ^ (n >> 13)) * 1103515245; n = n ^ (n >> 16);
  return (n & 0x7fff) / 0x7fff;
}
const clamp = (v: number) => v < 0 ? 0 : v > 255 ? 255 : v;
const CLEAR = rgba(0, 0, 0, 0);

export const DEF: MonsterDef = {
  kind: MonsterKind.POLZUN,
  name: 'Ползун',
  hp: 80,
  speed: 1.0,
  dmg: 18,
  attackRate: 2.0,
  sprite: 19,
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
