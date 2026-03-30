/* ── Weapon stats registry — melee & ranged physical weapons ─── */

import { Spr } from '../render/sprite_index';

export interface WeaponStats {
  dmg: number;
  durability: number;   // max durability for melee (0 = infinite/fists)
  range: number;        // melee reach in cells
  speed: number;        // attack cooldown seconds
  isRanged: boolean;
  ammoType?: string;    // item def id for ammo
  projSpeed?: number;   // projectile speed (cells/sec)
  pellets?: number;     // projectiles per shot (shotgun)
  spread?: number;      // spread angle in radians
  projSprite?: number;  // sprite index for projectile
  psiCost?: number;     // PSI cost per cast (if set, uses PSI instead of ammo)
  aoeRadius?: number;   // AoE explosion radius on projectile impact
  psiEffect?: string;   // instant PSI effect id (non-projectile spells)
}

export const PHYS_WEAPON_STATS: Record<string, WeaponStats> = {
  '':       { dmg: 3,  durability: 0,  range: 1.3, speed: 0.3,  isRanged: false },
  knife:    { dmg: 8,  durability: 40, range: 1.3, speed: 0.25, isRanged: false },
  wrench:   { dmg: 12, durability: 60, range: 1.4, speed: 0.4,  isRanged: false },
  pipe:     { dmg: 18, durability: 50, range: 1.5, speed: 0.5,  isRanged: false },
  rebar:    { dmg: 25, durability: 80, range: 1.6, speed: 0.6,  isRanged: false },
  axe:      { dmg: 30, durability: 70, range: 1.5, speed: 0.7,  isRanged: false },
  makarov:  { dmg: 20, durability: 0,  range: 0,   speed: 0.4,  isRanged: true, ammoType: 'ammo_9mm',    projSpeed: 20, pellets: 1, spread: 0.02, projSprite: Spr.BULLET },
  shotgun:  { dmg: 8,  durability: 0,  range: 0,   speed: 1.0,  isRanged: true, ammoType: 'ammo_shells', projSpeed: 18, pellets: 6, spread: 0.15, projSprite: Spr.PELLET },
  nailgun:  { dmg: 12, durability: 0,  range: 0,   speed: 0.12, isRanged: true, ammoType: 'ammo_nails',  projSpeed: 15, pellets: 1, spread: 0.04, projSprite: Spr.NAIL },
  ak47:     { dmg: 25, durability: 0,  range: 0,   speed: 0.15, isRanged: true, ammoType: 'ammo_762',   projSpeed: 22, pellets: 1, spread: 0.03, projSprite: Spr.BULLET },
};
