/* ── Betonnik — massive concrete golem ────────────────────────── */

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
  kind: MonsterKind.BETONNIK,
  name: 'Бетонник',
  hp: 1500,
  speed: 0.8,
  dmg: 40,
  attackRate: 3.0,
  sprite: 20,
};

export function generateSprite(): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;
  // Massive blocky body
  for (let y = 4; y < 60; y++) {
    const halfW = y < 15 ? 8 : y < 45 ? 14 : 10;
    for (let x = cx - halfW; x < cx + halfW; x++) {
      if (x < 0 || x >= S) continue;
      const n = noise(x, y, 777) * 25;
      const crack = noise(x * 3, y * 3, 778) > 0.9 ? -30 : 0;
      t[y * S + x] = rgba(clamp(110 + n + crack), clamp(108 + n + crack), clamp(105 + n + crack));
    }
  }
  // Dark eye slits
  for (let x = cx - 4; x < cx - 1; x++) t[10 * S + x] = rgba(20, 10, 10);
  for (let x = cx + 1; x < cx + 4; x++) t[10 * S + x] = rgba(20, 10, 10);
  // Rebar sticking out
  for (let y = 20; y < 40; y++) {
    t[y * S + (cx - 14)] = rgba(80, 50, 30);
    t[y * S + (cx + 14)] = rgba(80, 50, 30);
  }
  return t;
}
