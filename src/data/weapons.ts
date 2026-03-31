/* ── Weapon stats registry — melee & ranged physical weapons ─── */

import { Spr } from '../render/sprite_index';
import { ProjType } from '../core/types';

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
  projType?: ProjType;  // special projectile behaviour
  soundId?: string;     // weapon sound id (for dispatching)
}

export const PHYS_WEAPON_STATS: Record<string, WeaponStats> = {
  '':       { dmg: 3,  durability: 0,  range: 1.3, speed: 0.3,  isRanged: false },
  knife:    { dmg: 8,  durability: 40, range: 1.3, speed: 0.25, isRanged: false },
  wrench:   { dmg: 12, durability: 60, range: 1.4, speed: 0.4,  isRanged: false },
  pipe:     { dmg: 18, durability: 50, range: 1.5, speed: 0.5,  isRanged: false },
  rebar:    { dmg: 25, durability: 80, range: 1.6, speed: 0.6,  isRanged: false },
  axe:      { dmg: 30, durability: 70, range: 1.5, speed: 0.7,  isRanged: false },
  chainsaw: { dmg: 100, durability: 30, range: 1.4, speed: 0.2, isRanged: false, soundId: 'chainsaw' },
  makarov:  { dmg: 20, durability: 0,  range: 0,   speed: 0.4,  isRanged: true, ammoType: 'ammo_9mm',    projSpeed: 20, pellets: 1, spread: 0.02, projSprite: Spr.BULLET },
  ppsh:     { dmg: 10, durability: 0,  range: 0,   speed: 0.08, isRanged: true, ammoType: 'ammo_9mm',    projSpeed: 18, pellets: 1, spread: 0.06, projSprite: Spr.BULLET, soundId: 'ppsh' },
  shotgun:  { dmg: 8,  durability: 0,  range: 0,   speed: 1.0,  isRanged: true, ammoType: 'ammo_shells', projSpeed: 18, pellets: 6, spread: 0.15, projSprite: Spr.PELLET },
  nailgun:  { dmg: 12, durability: 0,  range: 0,   speed: 0.12, isRanged: true, ammoType: 'ammo_nails',  projSpeed: 15, pellets: 1, spread: 0.04, projSprite: Spr.NAIL },
  ak47:     { dmg: 25, durability: 0,  range: 0,   speed: 0.15, isRanged: true, ammoType: 'ammo_762',   projSpeed: 22, pellets: 1, spread: 0.03, projSprite: Spr.BULLET },
  machinegun:{ dmg: 15, durability: 0, range: 0,   speed: 0.07, isRanged: true, ammoType: 'ammo_belt',  projSpeed: 20, pellets: 1, spread: 0.10, projSprite: Spr.BULLET, soundId: 'machinegun' },
  grenade:  { dmg: 80, durability: 0,  range: 0,   speed: 1.2,  isRanged: true, ammoType: 'grenade',    projSpeed: 10, pellets: 1, spread: 0,    projSprite: Spr.GRENADE, projType: ProjType.GRENADE, aoeRadius: 4, soundId: 'grenade' },
  gauss:    { dmg: 120, durability: 0, range: 0,   speed: 1.5,  isRanged: true, ammoType: 'ammo_energy', projSpeed: 40, pellets: 1, spread: 0,    projSprite: Spr.GAUSS_BOLT, soundId: 'gauss' },
  plasma:   { dmg: 35, durability: 0,  range: 0,   speed: 0.15, isRanged: true, ammoType: 'ammo_energy', projSpeed: 16, pellets: 1, spread: 0.08, projSprite: Spr.PLASMA_BOLT, soundId: 'plasma' },
  bfg:      { dmg: 200, durability: 0, range: 0,   speed: 3.0,  isRanged: true, ammoType: 'ammo_energy', projSpeed: 8,  pellets: 1, spread: 0,    projSprite: Spr.BFG_BOLT, projType: ProjType.BFG, aoeRadius: 8, soundId: 'bfg' },
  flamethrower:{ dmg: 5, durability: 0, range: 0,  speed: 0.05, isRanged: true, ammoType: 'ammo_fuel',  projSpeed: 8,  pellets: 1, spread: 0.15, projSprite: Spr.FLAME_BOLT, projType: ProjType.FLAME, soundId: 'flame' },
};
