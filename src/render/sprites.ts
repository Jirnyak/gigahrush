/* ── Procedural sprite generator ──────────────────────────────── */

import { TEX } from '../core/types';
import { NPC_SPRITE_GENERATORS, generateTravelerSprite } from '../entities/npc';
import { MONSTER_SPRITES } from '../entities/monster';

const S = TEX;
export type SpriteData = Uint32Array; // S*S RGBA with alpha

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

/* ── 25 sprite sheets: npcs 0-15, item 16, monsters 17-20, desk 21, projectiles 22-24 ── */
export function generateSprites(): SpriteData[] {
  const sprites: SpriteData[] = [];
  // Occupation NPCs (0-12)
  for (const gen of NPC_SPRITE_GENERATORS) {
    sprites.push(gen());
  }
  // Travelers (13-15): Путник, Паломник, Охотник
  sprites.push(generateTravelerSprite(130, 100, 120, 80));   // 13: traveler — brown
  sprites.push(generateTravelerSprite(140, 80, 60, 120));    // 14: pilgrim — dark robe
  sprites.push(generateTravelerSprite(150, 60, 80, 60));     // 15: hunter — green
  // Item drop (16)
  sprites.push(gen_itemDrop());
  // Monsters (17-20, from entity modules)
  for (const gen of MONSTER_SPRITES) {
    sprites.push(gen());
  }
  // Desk (21)
  sprites.push(gen_deskSprite());
  // Projectiles (22-24)
  sprites.push(gen_bulletSprite());     // 22: pistol bullet
  sprites.push(gen_pelletSprite());     // 23: shotgun pellet
  sprites.push(gen_nailSprite());       // 24: nail
  return sprites;
}

/* ── Desk: Soviet school desk (green top, metal legs) ─────────── */
function gen_deskSprite(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  // Desk appears in lower half of sprite (it's a table, not full height)
  const topY = 20;  // desk surface top edge
  const botY = 44;  // desk legs bottom
  const leftX = 6;
  const rightX = S - 7;

  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, 777) * 10;
    if (x >= leftX && x <= rightX) {
      if (y >= topY && y <= topY + 4) {
        // Desk surface — Soviet green
        const shade = Math.sin(x * 0.3) * 4;
        t[y * S + x] = rgba(
          clamp(55 + shade + n),
          clamp(90 + shade + n),
          clamp(60 + n / 2),
        );
      } else if (y > topY + 4 && y <= topY + 6) {
        // Front apron — dark wood edge
        t[y * S + x] = rgba(clamp(70 + n), clamp(55 + n), clamp(30 + n));
      } else if (y > topY + 6 && y <= botY) {
        // Legs region: two metal legs
        const leg1 = x >= leftX + 2 && x <= leftX + 4;
        const leg2 = x >= rightX - 4 && x <= rightX - 2;
        if (leg1 || leg2) {
          t[y * S + x] = rgba(clamp(75 + n), clamp(78 + n), clamp(82 + n));
        }
      }
    }
  }
  return t;
}

/* ── Item drop: small glowing bag ─────────────────────────────── */
function gen_itemDrop(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2 + 8;
  for (let y = cy - 8; y < cy + 8; y++) for (let x = cx - 6; x < cx + 6; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx / 36 + dy * dy / 64 < 1) {
      const n = noise(x, y, 333) * 20;
      const glow = Math.sin((x + y) * 0.5) * 15;
      t[y * S + x] = rgba(clamp(200 + n + glow), clamp(180 + n), clamp(100 + n));
    }
  }
  return t;
}

/* ── Bullet: bright yellow-orange glowing orb ─────────────────── */
function gen_bulletSprite(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2;
  const R = 6;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < R * 2.5) {
      const f = 1 - d / (R * 2.5);
      const core = d < R ? 1 : 0;
      const r = clamp(Math.floor(255 * core + 255 * f * 0.7));
      const g = clamp(Math.floor(200 * core + 160 * f * 0.5));
      const b = clamp(Math.floor(50 * core + 40 * f * 0.3));
      const a = clamp(Math.floor(255 * f * f + 180 * core));
      t[y * S + x] = rgba(r, g, b, a);
    }
  }
  return t;
}

/* ── Pellet: small bright orange spark ────────────────────────── */
function gen_pelletSprite(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2;
  const R = 4;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < R * 2) {
      const f = 1 - d / (R * 2);
      const core = d < R ? 1 : 0;
      const r = clamp(Math.floor(255 * core + 220 * f * 0.8));
      const g = clamp(Math.floor(120 * core + 80 * f * 0.5));
      const b = clamp(Math.floor(30 * core + 20 * f * 0.3));
      const a = clamp(Math.floor(255 * f * f + 200 * core));
      t[y * S + x] = rgba(r, g, b, a);
    }
  }
  return t;
}

/* ── Nail: thin bright metallic streak ────────────────────────── */
function gen_nailSprite(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
    // Thin vertical nail shape with glow
    if (dx < 2 && dy < 8) {
      const f = 1 - dy / 8;
      t[y * S + x] = rgba(clamp(200 + 55 * f), clamp(200 + 55 * f), clamp(220 + 35 * f));
    } else if (dx < 5 && dy < 10) {
      const d = Math.sqrt(dx * dx + dy * dy);
      const f = Math.max(0, 1 - d / 10);
      const a = clamp(Math.floor(120 * f));
      if (a > 10) t[y * S + x] = rgba(180, 160, 100, a);
    }
  }
  return t;
}
