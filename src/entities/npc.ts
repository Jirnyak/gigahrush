/* ── NPC sprite generation — one per occupation ──────────────── */

import { TEX } from '../core/types';

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

/* ── Base humanoid sprite generator ──────────────────────────── */
function genHumanoid(
  skinR: number, skinG: number, skinB: number,
  shirtR: number, shirtG: number, shirtB: number,
  pantsR: number, pantsG: number, pantsB: number,
  seed: number,
  headTop: number, headBot: number, bodyTop: number, bodyBot: number, legBot: number,
): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;
  const headCy = Math.floor((headTop + headBot) / 2);
  const headRad = Math.floor((headBot - headTop) / 2);
  // Head
  for (let y = headTop; y < headBot; y++) for (let x = cx - headRad; x < cx + headRad; x++) {
    const dx = x - cx, dy = y - headCy;
    if (dx * dx + dy * dy < headRad * headRad) {
      const n = noise(x, y, seed) * 15;
      t[y * S + x] = rgba(clamp(skinR + n), clamp(skinG + n), clamp(skinB + n));
    }
  }
  // Eyes
  const eyeY = headCy;
  t[eyeY * S + (cx - 2)] = rgba(20, 20, 20);
  t[eyeY * S + (cx + 2)] = rgba(20, 20, 20);
  // Body
  for (let y = bodyTop; y < bodyBot; y++) {
    const halfW = 7 + (y < bodyTop + 8 ? (y - bodyTop) / 3 : 3);
    for (let x = Math.floor(cx - halfW); x < Math.floor(cx + halfW); x++) {
      if (x < 0 || x >= S) continue;
      const n = noise(x, y, seed + 10) * 10;
      t[y * S + x] = rgba(clamp(shirtR + n), clamp(shirtG + n), clamp(shirtB + n));
    }
  }
  // Legs
  for (let y = bodyBot; y < legBot; y++) {
    for (let leg = -1; leg <= 1; leg += 2) {
      for (let x = cx + leg * 2 - 3; x < cx + leg * 2 + 3; x++) {
        if (x < 0 || x >= S) continue;
        const n = noise(x, y, seed + 20) * 8;
        t[y * S + x] = rgba(clamp(pantsR + n), clamp(pantsG + n), clamp(pantsB + n));
      }
    }
  }
  return t;
}

/* ── Decoration helpers ──────────────────────────────────────── */
function addHat(t: Uint32Array, r: number, g: number, b: number, top: number) {
  const cx = S / 2;
  for (let y = top - 4; y < top + 2; y++)
    for (let x = cx - 7; x < cx + 7; x++)
      if (x >= 0 && x < S && y >= 0) {
        t[y * S + x] = rgba(clamp(r), clamp(g), clamp(b));
      }
}

function addApron(t: Uint32Array, r: number, g: number, b: number, bodyTop: number, bodyBot: number) {
  const cx = S / 2;
  for (let y = bodyTop + 4; y < bodyBot; y++)
    for (let x = cx - 5; x < cx + 5; x++)
      if (x >= 0 && x < S) t[y * S + x] = rgba(clamp(r), clamp(g), clamp(b));
}

function addStripe(t: Uint32Array, r: number, g: number, b: number, bodyTop: number, bodyBot: number) {
  const cx = S / 2;
  for (let y = bodyTop; y < bodyBot; y++)
    for (let x = cx - 1; x <= cx + 1; x++)
      if (x >= 0 && x < S) t[y * S + x] = rgba(clamp(r), clamp(g), clamp(b));
}

/* ── Occupation sprites — indexed by Occupation enum value ───── */
// Normal adult proportions: head 8-22, body 22-44, legs 44-58
const H_TOP = 8, H_BOT = 22, B_TOP = 22, B_BOT = 44, L_BOT = 58;
// Child proportions: smaller head, shorter body, shorter legs
const CH_TOP = 20, CH_BOT = 32, CB_TOP = 32, CB_BOT = 46, CL_BOT = 56;

function genHousewife(): Uint32Array {
  const t = genHumanoid(180, 155, 140, 160, 80, 100, 80, 60, 100, 0, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
  addApron(t, 220, 220, 200, B_TOP, B_BOT); // light apron
  return t;
}
function genLocksmith(): Uint32Array {
  const t = genHumanoid(175, 150, 130, 80, 80, 120, 60, 60, 80, 1, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
  addHat(t, 100, 100, 40, H_TOP); // yellow hard hat
  return t;
}
function genSecretary(): Uint32Array {
  return genHumanoid(185, 165, 145, 200, 200, 210, 40, 40, 60, 2, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
}
function genElectrician(): Uint32Array {
  const t = genHumanoid(170, 145, 125, 50, 80, 140, 50, 50, 70, 3, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
  addHat(t, 220, 160, 30, H_TOP); // orange hard hat
  return t;
}
function genCook(): Uint32Array {
  const t = genHumanoid(180, 160, 140, 230, 230, 230, 50, 50, 60, 4, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
  addHat(t, 240, 240, 240, H_TOP); // white chef hat
  addApron(t, 240, 240, 240, B_TOP, B_BOT);
  return t;
}
function genDoctor(): Uint32Array {
  const t = genHumanoid(185, 165, 150, 230, 240, 240, 60, 60, 80, 5, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
  addStripe(t, 200, 40, 40, B_TOP, B_TOP + 10); // red cross
  return t;
}
function genTurner(): Uint32Array {
  return genHumanoid(170, 150, 130, 100, 90, 70, 70, 70, 80, 6, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
}
function genMechanic(): Uint32Array {
  const t = genHumanoid(175, 155, 135, 60, 70, 90, 60, 60, 70, 7, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
  // oil stains
  for (let i = 0; i < 8; i++) {
    const sx = Math.floor(S / 2 - 5 + noise(i, 0, 700) * 10);
    const sy = B_TOP + Math.floor(noise(i, 1, 700) * (B_BOT - B_TOP));
    if (sx >= 0 && sx < S) t[sy * S + sx] = rgba(30, 25, 20);
  }
  return t;
}
function genStorekeeper(): Uint32Array {
  return genHumanoid(180, 160, 140, 120, 100, 60, 60, 50, 40, 8, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
}
function genAlcoholic(): Uint32Array {
  const t = genHumanoid(200, 150, 140, 100, 80, 80, 80, 70, 60, 9, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
  // reddish nose
  const cx = S / 2;
  t[(H_BOT - 4) * S + cx] = rgba(220, 80, 80);
  return t;
}
function genScientist(): Uint32Array {
  const t = genHumanoid(180, 165, 150, 230, 230, 240, 40, 40, 50, 10, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
  // glasses
  const cx = S / 2;
  const eyeY = Math.floor((H_TOP + H_BOT) / 2);
  t[eyeY * S + (cx - 3)] = rgba(180, 200, 230);
  t[eyeY * S + (cx + 3)] = rgba(180, 200, 230);
  return t;
}
function genChild(): Uint32Array {
  return genHumanoid(190, 170, 150, 200, 120, 60, 80, 80, 130, 11, CH_TOP, CH_BOT, CB_TOP, CB_BOT, CL_BOT);
}
function genDirector(): Uint32Array {
  const t = genHumanoid(180, 160, 140, 40, 40, 50, 30, 30, 40, 12, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
  // tie
  const cx = S / 2;
  for (let y = B_TOP; y < B_TOP + 12; y++) t[y * S + cx] = rgba(180, 30, 30);
  return t;
}

/** Sprite generators indexed by Occupation enum value (0..12 = resident occupations) */
export const NPC_SPRITE_GENERATORS: (() => Uint32Array)[] = [
  genHousewife,   // 0  HOUSEWIFE
  genLocksmith,   // 1  LOCKSMITH
  genSecretary,   // 2  SECRETARY
  genElectrician, // 3  ELECTRICIAN
  genCook,        // 4  COOK
  genDoctor,      // 5  DOCTOR
  genTurner,      // 6  TURNER
  genMechanic,    // 7  MECHANIC
  genStorekeeper, // 8  STOREKEEPER
  genAlcoholic,   // 9  ALCOHOLIC
  genScientist,   // 10 SCIENTIST
  genChild,       // 11 CHILD
  genDirector,    // 12 DIRECTOR
];

/** Traveler sprite (reused for TRAVELER/PILGRIM/HUNTER — indices 13,14,15) */
export function generateTravelerSprite(seed: number, shirtR: number, shirtG: number, shirtB: number): Uint32Array {
  return genHumanoid(175, 155, 135, shirtR, shirtG, shirtB, 60, 55, 50, seed, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
}

// Keep old export for backward compatibility (unused by sprites.ts now)
export function generateSprite(skinR: number, skinG: number, skinB: number, seed: number): Uint32Array {
  return genHumanoid(skinR, skinG, skinB, 60 + seed * 40, 70 + seed * 20, 100 - seed * 10, 50, 50, 60, seed, H_TOP, H_BOT, B_TOP, B_BOT, L_BOT);
}

export const NPC_VARIANTS: [number, number, number, number][] = [
  [180, 160, 140, 0],
  [170, 150, 135, 1],
  [190, 170, 150, 2],
];
