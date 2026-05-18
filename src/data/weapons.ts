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
  '':       { dmg: 3,  durability: 0,   range: 1.3,  speed: 0.35, isRanged: false },
  knife:    { dmg: 8,  durability: 35,  range: 1.25, speed: 0.28, isRanged: false },
  wrench:   { dmg: 14, durability: 85,  range: 1.35, speed: 0.48, isRanged: false },
  pipe:     { dmg: 20, durability: 55,  range: 1.65, speed: 0.62, isRanged: false },
  rebar:    { dmg: 27, durability: 90,  range: 1.8,  speed: 0.72, isRanged: false },
  axe:      { dmg: 34, durability: 70,  range: 1.45, speed: 0.82, isRanged: false },
  chainsaw: { dmg: 80, durability: 18,  range: 1.35, speed: 0.22, isRanged: false, soundId: 'chainsaw' },
  makarov:  { dmg: 18, durability: 0,   range: 0,    speed: 0.45, isRanged: true, ammoType: 'ammo_9mm',      projSpeed: 20, pellets: 1, spread: 0.025, projSprite: Spr.BULLET },
  ppsh:     { dmg: 8,  durability: 0,   range: 0,    speed: 0.09, isRanged: true, ammoType: 'ammo_9mm',      projSpeed: 18, pellets: 1, spread: 0.09,  projSprite: Spr.BULLET, soundId: 'ppsh' },
  shotgun:  { dmg: 9,  durability: 0,   range: 0,    speed: 1.05, isRanged: true, ammoType: 'ammo_shells',   projSpeed: 17, pellets: 6, spread: 0.22,  projSprite: Spr.PELLET },
  nailgun:  { dmg: 14, durability: 0,   range: 0,    speed: 0.22, isRanged: true, ammoType: 'ammo_nails',    projSpeed: 16, pellets: 1, spread: 0.025, projSprite: Spr.NAIL },
  ak47:     { dmg: 30, durability: 0,   range: 0,    speed: 0.24, isRanged: true, ammoType: 'ammo_762',      projSpeed: 24, pellets: 1, spread: 0.045, projSprite: Spr.BULLET },
  machinegun:{ dmg: 16, durability: 0,  range: 0,    speed: 0.08, isRanged: true, ammoType: 'ammo_belt',     projSpeed: 20, pellets: 1, spread: 0.12,  projSprite: Spr.BULLET, soundId: 'machinegun' },
  grenade:  { dmg: 90, durability: 0,   range: 0,    speed: 1.5,  isRanged: true, ammoType: 'grenade',       projSpeed: 10, pellets: 1, spread: 0,     projSprite: Spr.GRENADE, projType: ProjType.GRENADE, aoeRadius: 4, soundId: 'grenade' },
  gauss:    { dmg: 140, durability: 0,  range: 0,    speed: 1.8,  isRanged: true, ammoType: 'ammo_energy',   projSpeed: 40, pellets: 1, spread: 0,     projSprite: Spr.GAUSS_BOLT, soundId: 'gauss' },
  plasma:   { dmg: 30, durability: 0,   range: 0,    speed: 0.22, isRanged: true, ammoType: 'ammo_energy',   projSpeed: 15, pellets: 1, spread: 0.10,  projSprite: Spr.PLASMA_BOLT, soundId: 'plasma' },
  bfg:      { dmg: 240, durability: 0,  range: 0,    speed: 3.5,  isRanged: true, ammoType: 'ammo_energy',   projSpeed: 7,  pellets: 1, spread: 0,     projSprite: Spr.BFG_BOLT, projType: ProjType.BFG, aoeRadius: 9, soundId: 'bfg' },
  flamethrower:{ dmg: 6, durability: 0, range: 0,    speed: 0.08, isRanged: true, ammoType: 'ammo_fuel',     projSpeed: 7,  pellets: 1, spread: 0.18,  projSprite: Spr.FLAME_BOLT, projType: ProjType.FLAME, soundId: 'flame' },
  hammer:   { dmg: 13, durability: 70,  range: 1.3,  speed: 0.38, isRanged: false },
  crowbar:  { dmg: 28, durability: 105, range: 1.55, speed: 0.68, isRanged: false },
  sledgehammer:{ dmg: 50, durability: 90, range: 1.6, speed: 1.25, isRanged: false },
  fire_hook:{ dmg: 21, durability: 80,  range: 2.05, speed: 0.78, isRanged: false },
  entrenching_spade:{ dmg: 18, durability: 90, range: 1.35, speed: 0.48, isRanged: false },
  bayonet:  { dmg: 16, durability: 60,  range: 1.55, speed: 0.35, isRanged: false },
  chain:    { dmg: 18, durability: 75,  range: 1.85, speed: 0.52, isRanged: false },
  metal_chair:{ dmg: 24, durability: 32, range: 1.55, speed: 0.85, isRanged: false },
  tt_pistol:{ dmg: 26, durability: 0, range: 0, speed: 0.42, isRanged: true, ammoType: 'ammo_762tt', projSpeed: 22, pellets: 1, spread: 0.04, projSprite: Spr.BULLET },
  nagant:   { dmg: 34, durability: 0, range: 0, speed: 0.9, isRanged: true, ammoType: 'ammo_nagant', projSpeed: 21, pellets: 1, spread: 0.012, projSprite: Spr.BULLET },
  homemade_pistol:{ dmg: 22, durability: 0, range: 0, speed: 0.9, isRanged: true, ammoType: 'ammo_9mm', projSpeed: 16, pellets: 1, spread: 0.14, projSprite: Spr.BULLET },
  toz_shotgun:{ dmg: 8, durability: 0, range: 0, speed: 1.35, isRanged: true, ammoType: 'ammo_shells', projSpeed: 20, pellets: 8, spread: 0.09, projSprite: Spr.PELLET, soundId: 'shotgun' },
  harpoon_gun:{ dmg: 70, durability: 0, range: 0, speed: 1.7, isRanged: true, ammoType: 'ammo_harpoon', projSpeed: 16, pellets: 1, spread: 0.005, projSprite: Spr.NAIL, soundId: 'nailgun' },
};
