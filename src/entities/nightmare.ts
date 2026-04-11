/* ── Nightmare — procedural horror (кошмарище) ────────────────── */
/*   Sprite is a FUNCTION of the monster's name hash — every     */
/*   nightmare looks different. Amorphous body, random eyes,     */
/*   gaping mouths, tentacles. Pure procedural terror.           */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../render/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.NIGHTMARE,
  name: 'Кошмарище',
  hp: 60,
  speed: 1.5,
  dmg: 15,
  attackRate: 1.8,
  sprite: 0,   // auto-assigned by generateSprites()
};

/* ── Static fallback sprite (used in sprite sheet) ────────────── */
export function generateSprite(): Uint32Array {
  return generateNightmareSprite(666);
}

/* ── Procedural sprite from name hash — each nightmare unique ── */
export function generateNightmareSprite(seed: number): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2;

  // Hash-derived parameters
  const bodyR   = 14 + (seed % 7);          // 14-20 body radius
  const numEyes = 3 + (seed % 5);           // 3-7 eyes
  const numMouths = 1 + (seed % 3);         // 1-3 mouths
  const bodyHue = seed % 3;                 // 0=purple, 1=green, 2=brown
  const tentacles = 2 + (seed % 5);         // 2-6 tentacles

  // Color palettes
  const bodyColors: [number, number, number][] = [
    [80, 40, 90],    // purple flesh
    [50, 70, 40],    // sickly green
    [70, 45, 35],    // rotting brown
  ];
  const [br, bg, bb] = bodyColors[bodyHue];

  // Amorphous body — wobbled ellipse
  for (let y = 4; y < 58; y++) for (let x = 4; x < 60; x++) {
    const dx = (x - cx) / bodyR, dy = (y - cy) / bodyR;
    const wobble = noise(x * 0.3, y * 0.3, seed) * 0.4;
    const d2 = dx * dx + dy * dy + wobble;
    if (d2 < 1) {
      const n = noise(x, y, seed + 100) * 30;
      const depth = Math.sqrt(d2) * 30;
      // Pulsating veins
      const vein = Math.sin(x * 0.8 + y * 0.6 + seed) > 0.7 ? 20 : 0;
      t[y * S + x] = rgba(
        clamp(br + n - depth + vein),
        clamp(bg + n - depth),
        clamp(bb + n - depth),
      );
    }
  }

  // Eyes — placed at pseudo-random positions on body surface
  for (let i = 0; i < numEyes; i++) {
    const ang = noise(i, 0, seed + 200) * Math.PI * 2;
    const dist = 3 + noise(0, i, seed + 201) * (bodyR - 6);
    const ex = Math.floor(cx + Math.cos(ang) * dist);
    const ey = Math.floor(cy + Math.sin(ang) * dist);
    const eyeR = 2 + Math.floor(noise(i, i, seed + 202) * 2);
    for (let dy = -eyeR; dy <= eyeR; dy++) for (let dx = -eyeR; dx <= eyeR; dx++) {
      if (dx * dx + dy * dy > eyeR * eyeR) continue;
      const px = ex + dx, py = ey + dy;
      if (px < 0 || px >= S || py < 0 || py >= S) continue;
      if (t[py * S + px] === CLEAR) continue;
      if (dx * dx + dy * dy < 2) {
        // Pupil — black or red
        t[py * S + px] = noise(i, 0, seed + 203) > 0.5
          ? rgba(10, 5, 5) : rgba(180, 20, 20);
      } else {
        // Sclera — yellowish white
        t[py * S + px] = rgba(220, 210, 170);
      }
    }
  }

  // Mouths — dark gashes with teeth
  for (let i = 0; i < numMouths; i++) {
    const my = Math.floor(cy + 2 + noise(i, 1, seed + 300) * (bodyR - 4));
    const mw = 3 + Math.floor(noise(1, i, seed + 301) * 5);
    const mx = Math.floor(cx - mw / 2 + (noise(i, 2, seed + 302) - 0.5) * 8);
    for (let x = mx; x < mx + mw; x++) {
      if (x < 0 || x >= S || my < 0 || my >= S) continue;
      if (t[my * S + x] === CLEAR) continue;
      t[my * S + x] = rgba(20, 5, 10);
      // Teeth
      if (noise(x, my, seed + 303) > 0.5 && my - 1 >= 0) {
        t[(my - 1) * S + x] = rgba(200, 190, 160);
      }
      if (noise(x, my, seed + 304) > 0.6 && my + 1 < S) {
        t[(my + 1) * S + x] = rgba(200, 190, 160);
      }
    }
  }

  // Tentacles — drooping from bottom
  for (let i = 0; i < tentacles; i++) {
    let tx = Math.floor(cx - bodyR / 2 + noise(i, 3, seed + 400) * bodyR);
    let ty = cy + bodyR - 2;
    const len = 6 + Math.floor(noise(3, i, seed + 401) * 10);
    for (let j = 0; j < len; j++) {
      tx += Math.floor((noise(j, i, seed + 402) - 0.5) * 3);
      ty++;
      if (tx < 0 || tx >= S || ty >= S) break;
      const n = noise(tx, ty, seed + 403) * 15;
      t[ty * S + tx] = rgba(clamp(br - 10 + n), clamp(bg - 10 + n), clamp(bb - 10 + n));
      if (tx + 1 < S) t[ty * S + tx + 1] = rgba(clamp(br - 15 + n), clamp(bg - 15 + n), clamp(bb - 15 + n));
    }
  }

  return t;
}


