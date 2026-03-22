/* ── Tvar — hunched shadow creature ───────────────────────────── */

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
  kind: MonsterKind.TVAR,
  name: 'Тварь',
  hp: 40,
  speed: 1.8,
  dmg: 12,
  attackRate: 1.2,
  sprite: 18,
};

export function generateSprite(): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;
  // Hunched mass
  for (let y = 8; y < 55; y++) for (let x = cx - 14; x < cx + 14; x++) {
    if (x < 0 || x >= S) continue;
    const dx = (x - cx) / 14, dy = (y - 32) / 24;
    if (dx * dx + dy * dy < 1) {
      const n = noise(x, y, 555) * 20;
      const dark = y > 40 ? 15 : 0;
      t[y * S + x] = rgba(clamp(45 + n - dark), clamp(40 + n - dark), clamp(50 + n - dark));
    }
  }
  // Multiple eyes
  for (const [ex, ey] of [[-5,16],[-2,14],[2,14],[5,16],[0,18]]) {
    const px = cx + ex, py = ey;
    if (px >= 0 && px < S && py >= 0 && py < S)
      t[py * S + px] = rgba(180, 255, 180);
  }
  return t;
}
