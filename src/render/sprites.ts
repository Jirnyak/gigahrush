/* ── Procedural sprite generator ──────────────────────────────── */

import { NPC_SPRITE_GENERATORS, generateTravelerSprite } from '../entities/npc';
import { MONSTERS, MONSTER_SPRITES, EYE_BOLT_SPRITE } from '../entities/monster';
import { MonsterKind } from '../core/types';
import { S, rgba, noise, clamp, CLEAR } from './pixutil';
import { Spr, monsterSpr } from './sprite_index';

export type SpriteData = Uint32Array; // S*S RGBA with alpha

/* ── Sprite sheet — indices computed automatically by sprite_index.ts ── */
export function generateSprites(): SpriteData[] {
  const sprites: SpriteData[] = [];
  // Occupation NPCs
  for (const gen of NPC_SPRITE_GENERATORS) {
    sprites.push(gen());
  }
  // Travelers: Путник, Паломник, Охотник
  sprites.push(generateTravelerSprite(130, 100, 120, 80));
  sprites.push(generateTravelerSprite(140, 80, 60, 120));
  sprites.push(generateTravelerSprite(150, 60, 80, 60));
  // Item drop
  sprites.push(gen_itemDrop());
  // Monsters (keyed by MonsterKind — auto-indexed)
  const monsterCount = Object.values(MonsterKind).filter(v => typeof v === 'number').length;
  for (let k = 0; k < monsterCount; k++) {
    sprites.push(MONSTER_SPRITES[k as MonsterKind]());
  }
  // Auto-assign sprite indices on MonsterDefs so spawn code stays simple
  for (let k = 0; k < monsterCount; k++) {
    const def = MONSTERS[k as MonsterKind];
    def.sprite = monsterSpr(k as MonsterKind);
    // Auto-assign projSprite for ranged monsters
    if (def.isRanged && (def.projSprite === undefined || def.projSprite === 0)) {
      def.projSprite = k === MonsterKind.EYE ? Spr.EYE_BOLT : Spr.PSI_BOLT;
    }
  }
  // Eye bolt projectile
  sprites.push(EYE_BOLT_SPRITE());
  // Desk
  sprites.push(gen_deskSprite());
  // Projectiles
  sprites.push(gen_bulletSprite());
  sprites.push(gen_pelletSprite());
  sprites.push(gen_nailSprite());
  // PSI bolt
  sprites.push(gen_psiBoltSprite());
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

/* ── PSI bolt: purple-violet glowing energy orb ──────────────── */
function gen_psiBoltSprite(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2;
  const R = 7;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < R * 3) {
      const f = 1 - d / (R * 3);
      const core = d < R ? 1 : 0;
      const n = noise(x, y, 77) * 0.3;
      const r = clamp(Math.floor(180 * core + 140 * f * 0.6 + n * 40));
      const g = clamp(Math.floor(60 * core + 40 * f * 0.3));
      const b = clamp(Math.floor(255 * core + 220 * f * 0.8 + n * 30));
      const a = clamp(Math.floor(255 * f * f + 220 * core));
      t[y * S + x] = rgba(r, g, b, a);
    }
  }
  return t;
}
