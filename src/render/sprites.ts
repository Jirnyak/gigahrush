/* ── Procedural sprite generator ──────────────────────────────── */

import { NPC_SPRITE_GENERATORS, generateTravelerSprite, generatePilgrimSprite, generateHunterSprite, generatePriestSprite } from '../entities/npc';
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
  sprites.push(generateTravelerSprite());
  sprites.push(generatePilgrimSprite());
  sprites.push(generateHunterSprite());
  // Priest: Батюшка
  sprites.push(generatePriestSprite());
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
      def.projSprite = k === MonsterKind.EYE ? Spr.EYE_BOLT
                     : k === MonsterKind.ROBOT ? Spr.PLASMA_BOLT
                     : Spr.PSI_BOLT;
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
  // New projectiles
  sprites.push(gen_plasmaBoltSprite());
  sprites.push(gen_gaussBoltSprite());
  sprites.push(gen_bfgBoltSprite());
  sprites.push(gen_flameBoltSprite());
  sprites.push(gen_grenadeSprite());
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
  const R = 7;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < R * 2.5) {
      const f = 1 - d / (R * 2.5);
      const core = d < R ? 1 : 0;
      const r = clamp(Math.floor(255 * core + 255 * f * 0.8));
      const g = clamp(Math.floor(220 * core + 180 * f * 0.6));
      const b = clamp(Math.floor(80 * core + 60 * f * 0.3));
      const a = clamp(Math.floor(255 * f * f + 200 * core));
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
  const R = 8;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < R * 3) {
      const f = 1 - d / (R * 3);
      const core = d < R ? 1 : 0;
      const n = noise(x, y, 77) * 0.3;
      const r = clamp(Math.floor(220 * core + 180 * f * 0.7 + n * 50));
      const g = clamp(Math.floor(100 * core + 60 * f * 0.4));
      const b = clamp(Math.floor(255 * core + 240 * f * 0.9 + n * 30));
      const a = clamp(Math.floor(255 * f * f + 240 * core));
      t[y * S + x] = rgba(r, g, b, a);
    }
  }
  return t;
}

/* ── Plasma bolt: bright cyan-green crackling energy ─────────── */
function gen_plasmaBoltSprite(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2;
  const R = 8;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < R * 2.5) {
      const f = 1 - d / (R * 2.5);
      const core = d < R ? 1 : 0;
      const n = noise(x * 3, y * 3, 42) * 0.4;
      const r = clamp(Math.floor(30 * core + 60 * f * 0.3 + n * 30));
      const g = clamp(Math.floor(255 * core + 200 * f * 0.7 + n * 40));
      const b = clamp(Math.floor(220 * core + 180 * f * 0.6 + n * 20));
      const a = clamp(Math.floor(255 * f * f + 230 * core));
      t[y * S + x] = rgba(r, g, b, a);
    }
  }
  return t;
}

/* ── Gauss bolt: electric blue-white thin streak with lightning ── */
function gen_gaussBoltSprite(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2;
  const R = 5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < R * 3) {
      const f = 1 - d / (R * 3);
      const core = d < R ? 1 : 0;
      const n = noise(x * 2 + 7, y * 2, 99) * 0.3;
      const ang = Math.atan2(dy, dx);
      const tendril = Math.sin(ang * 6 + d * 1.5) * 0.3;
      const ff = clamp(Math.floor((f + tendril) * 255));
      const r = clamp(Math.floor(200 * core + ff * 0.7 + n * 50));
      const g = clamp(Math.floor(220 * core + ff * 0.8 + n * 30));
      const b = clamp(Math.floor(255 * core + ff * 1.0));
      const a = clamp(Math.floor(255 * f * f * f + 240 * core));
      if (a > 5) t[y * S + x] = rgba(r, g, b, a);
    }
  }
  return t;
}

/* ── BFG bolt: massive green glowing orb with pulsing rings ───── */
function gen_bfgBoltSprite(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2;
  const R = 14;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < R * 2.2) {
      const f = 1 - d / (R * 2.2);
      const core = d < R ? 1 : 0;
      const n = noise(x * 2, y * 2, 666) * 0.3;
      const ring = Math.sin(d * 1.2) * 0.25 + 0.75;
      const r = clamp(Math.floor(60 * core * ring + 50 * f * 0.4));
      const g = clamp(Math.floor(255 * core * ring + 240 * f * 0.9 + n * 50));
      const b = clamp(Math.floor(100 * core * ring + 80 * f * 0.5 + n * 20));
      const a = clamp(Math.floor(255 * f * f + 250 * core));
      t[y * S + x] = rgba(r, g, b, a);
    }
  }
  return t;
}

/* ── Flame bolt: orange-yellow-red flickering fire ────────────── */
function gen_flameBoltSprite(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2;
  const R = 8;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < R * 2.5) {
      const f = 1 - d / (R * 2.5);
      const core = d < R ? 1 : 0;
      const n = noise(x * 5, y * 5, 55) * 0.5;
      const heat = core + f * 0.7 + n * 0.4;
      const r = clamp(Math.floor(255 * Math.min(1, heat * 1.4)));
      const g = clamp(Math.floor(255 * Math.min(1, heat * 0.85)));
      const b = clamp(Math.floor(100 * Math.min(1, heat * 0.4)));
      const a = clamp(Math.floor(255 * f * f + 240 * core));
      t[y * S + x] = rgba(r, g, b, a);
    }
  }
  return t;
}

/* ── Grenade: small dark-green sphere with cross-hatch ────────── */
function gen_grenadeSprite(): SpriteData {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2, cy = S / 2;
  const R = 7;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < R) {
      const n = noise(x, y, 123) * 10;
      const shade = 1 - d / R * 0.4;
      const hatch = ((x + y) % 4 < 1 || (x - y + 64) % 4 < 1) ? 0.85 : 1;
      const r = clamp(Math.floor((50 + n) * shade * hatch));
      const g = clamp(Math.floor((70 + n) * shade * hatch));
      const b = clamp(Math.floor((35 + n) * shade * hatch));
      t[y * S + x] = rgba(r, g, b);
    }
  }
  for (let y = cy - R - 3; y < cy - R + 1; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    if (y >= 0 && y < S && x >= 0 && x < S) {
      t[y * S + x] = rgba(90, 85, 75);
    }
  }
  return t;
}
