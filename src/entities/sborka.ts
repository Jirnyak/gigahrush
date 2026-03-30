/* ── Sborka — fast twitchy creature ───────────────────────────── */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../render/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.SBORKA,
  name: 'Сборка',
  hp: 5,
  speed: 2.8,
  dmg: 5,
  attackRate: 0.8,
  sprite: 0,   // auto-assigned by generateSprites()
};

export function generateSprite(): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;
  // Elongated body
  for (let y = 12; y < 52; y++) {
    const halfW = 5 + Math.sin(y * 0.4) * 3;
    for (let x = Math.floor(cx - halfW); x < Math.floor(cx + halfW); x++) {
      if (x < 0 || x >= S) continue;
      const n = noise(x, y, 444) * 30;
      t[y * S + x] = rgba(clamp(80 + n), clamp(40 + n), clamp(50 + n));
    }
  }
  // Glowing eyes
  t[18 * S + (cx - 3)] = rgba(255, 100, 100);
  t[18 * S + (cx + 3)] = rgba(255, 100, 100);
  t[19 * S + (cx - 3)] = rgba(255, 80, 80);
  t[19 * S + (cx + 3)] = rgba(255, 80, 80);
  // Arms/tendrils
  for (let y = 25; y < 45; y++) {
    const spread = (y - 25) * 0.5;
    const lx = Math.floor(cx - 8 - spread), rx = Math.floor(cx + 8 + spread);
    if (lx >= 0) t[y * S + lx] = rgba(70, 35, 45);
    if (rx < S)  t[y * S + rx] = rgba(70, 35, 45);
  }
  return t;
}
