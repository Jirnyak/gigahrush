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
  deletionBeam?: boolean; // instant bounded beam that deletes cells/entities
  beamRange?: number;   // max deletion beam range in cells
  beamWidth?: number;   // half-width of deletion beam in cells
  soundId?: string;     // weapon sound id (for dispatching)
  knockback?: number;   // melee stop distance in cells, capped by systems
}

export type WeaponRoleTier =
  | 'unarmed'
  | 'melee_emergency'
  | 'industrial_tool'
  | 'melee_reach'
  | 'melee_heavy'
  | 'melee_control'
  | 'makarov_precise'
  | 'pistol_sidegrade'
  | 'shotgun_corridor_stop'
  | 'ammo_burn'
  | 'grenade'
  | 'rare_energy'
  | 'fuel_clear'
  | 'psi';

export const WEAPON_ROLE_LABELS: Record<WeaponRoleTier, string> = {
  unarmed: 'кулаки',
  melee_emergency: 'авар. ближ.',
  industrial_tool: 'индустр.',
  melee_reach: 'длинн. ближ.',
  melee_heavy: 'тяж. ближ.',
  melee_control: 'стоп-ближ.',
  makarov_precise: 'точный ПМ',
  pistol_sidegrade: 'особ. пист.',
  shotgun_corridor_stop: 'стоппер',
  ammo_burn: 'расход патр.',
  grenade: 'взрыв',
  rare_energy: 'редк. энерго',
  fuel_clear: 'зачистка',
  psi: 'ПСИ',
};

export const PHYS_WEAPON_STATS: Record<string, WeaponStats> = {
  '':       { dmg: 3,  durability: 0,   range: 1.35, speed: 0.34, isRanged: false, knockback: 0.06 },
  knife:    { dmg: 7,  durability: 32,  range: 1.35, speed: 0.20, isRanged: false, knockback: 0.10 },
  wrench:   { dmg: 12, durability: 115, range: 1.45, speed: 0.43, isRanged: false, knockback: 0.20 },
  pipe:     { dmg: 19, durability: 60,  range: 1.85, speed: 0.64, isRanged: false, knockback: 0.36 },
  rebar:    { dmg: 24, durability: 95,  range: 2.1,  speed: 0.82, isRanged: false, knockback: 0.42 },
  axe:      { dmg: 34, durability: 65,  range: 1.5,  speed: 0.94, isRanged: false, knockback: 0.34 },
  chainsaw: { dmg: 42, durability: 14,  range: 1.35, speed: 0.21, isRanged: false, soundId: 'chainsaw', knockback: 0.18 },
  makarov:  { dmg: 16, durability: 0,   range: 0,    speed: 0.52, isRanged: true, ammoType: 'ammo_9mm',      projSpeed: 22, pellets: 1, spread: 0.012, projSprite: Spr.BULLET },
  ppsh:     { dmg: 6,  durability: 0,   range: 0,    speed: 0.07, isRanged: true, ammoType: 'ammo_9mm',      projSpeed: 18, pellets: 1, spread: 0.15,  projSprite: Spr.BULLET, soundId: 'ppsh' },
  shotgun:  { dmg: 9,  durability: 0,   range: 0,    speed: 1.2,  isRanged: true, ammoType: 'ammo_shells',   projSpeed: 15, pellets: 7, spread: 0.34,  projSprite: Spr.PELLET, soundId: 'shotgun' },
  nailgun:  { dmg: 11, durability: 0,   range: 0,    speed: 0.33, isRanged: true, ammoType: 'ammo_nails',    projSpeed: 20, pellets: 1, spread: 0.014, projSprite: Spr.NAIL, soundId: 'nailgun' },
  ak47:     { dmg: 19, durability: 0,   range: 0,    speed: 0.14, isRanged: true, ammoType: 'ammo_762',      projSpeed: 25, pellets: 1, spread: 0.09,  projSprite: Spr.BULLET },
  machinegun:{ dmg: 10, durability: 0,  range: 0,    speed: 0.05, isRanged: true, ammoType: 'ammo_belt',     projSpeed: 21, pellets: 1, spread: 0.20,  projSprite: Spr.BULLET, soundId: 'machinegun' },
  grenade:  { dmg: 90, durability: 0,   range: 0,    speed: 1.9,  isRanged: true, ammoType: 'grenade',       projSpeed: 9,  pellets: 1, spread: 0,     projSprite: Spr.GRENADE, projType: ProjType.GRENADE, aoeRadius: 4.5, soundId: 'grenade' },
  gauss:    { dmg: 150, durability: 0,  range: 0,    speed: 2.6,  isRanged: true, ammoType: 'ammo_energy',   projSpeed: 44, pellets: 1, spread: 0,     projSprite: Spr.GAUSS_BOLT, soundId: 'gauss' },
  plasma:   { dmg: 18, durability: 0,   range: 0,    speed: 0.16, isRanged: true, ammoType: 'ammo_energy',   projSpeed: 14, pellets: 1, spread: 0.18,  projSprite: Spr.PLASMA_BOLT, soundId: 'plasma' },
  bfg:      { dmg: 230, durability: 0,  range: 0,    speed: 4.5,  isRanged: true, ammoType: 'ammo_energy',   projSpeed: 6.5, pellets: 1, spread: 0,    projSprite: Spr.BFG_BOLT, projType: ProjType.BFG, aoeRadius: 9, soundId: 'bfg' },
  gravity_beam_emitter:{ dmg: 420, durability: 0, range: 0, speed: 7.5, isRanged: true, ammoType: 'ammo_energy', pellets: 1, spread: 0, projSprite: Spr.GAUSS_BOLT, projType: ProjType.BEAM, deletionBeam: true, beamRange: 30, beamWidth: 0.72, soundId: 'bfg' },
  flamethrower:{ dmg: 4, durability: 0, range: 0,    speed: 0.06, isRanged: true, ammoType: 'ammo_fuel',     projSpeed: 7,  pellets: 1, spread: 0.26,  projSprite: Spr.FLAME_BOLT, projType: ProjType.FLAME, soundId: 'flame' },
  hammer:   { dmg: 13, durability: 65,  range: 1.35, speed: 0.33, isRanged: false, knockback: 0.22 },
  crowbar:  { dmg: 24, durability: 120, range: 1.75, speed: 0.72, isRanged: false, knockback: 0.40 },
  sledgehammer:{ dmg: 52, durability: 85, range: 1.7, speed: 1.35, isRanged: false, knockback: 0.65 },
  fire_hook:{ dmg: 18, durability: 80,  range: 2.35, speed: 0.86, isRanged: false, knockback: 0.36 },
  entrenching_spade:{ dmg: 16, durability: 100, range: 1.45, speed: 0.43, isRanged: false, knockback: 0.20 },
  bayonet:  { dmg: 13, durability: 65,  range: 1.8,  speed: 0.29, isRanged: false, knockback: 0.12 },
  chain:    { dmg: 14, durability: 75,  range: 2.05, speed: 0.48, isRanged: false, knockback: 0.24 },
  metal_chair:{ dmg: 18, durability: 22, range: 1.65, speed: 0.90, isRanged: false, knockback: 0.58 },
  tt_pistol:{ dmg: 27, durability: 0, range: 0, speed: 0.55, isRanged: true, ammoType: 'ammo_762tt', projSpeed: 23, pellets: 1, spread: 0.050, projSprite: Spr.BULLET },
  nagant:   { dmg: 38, durability: 0, range: 0, speed: 1.25, isRanged: true, ammoType: 'ammo_nagant', projSpeed: 23, pellets: 1, spread: 0.006, projSprite: Spr.BULLET },
  homemade_pistol:{ dmg: 21, durability: 0, range: 0, speed: 0.92, isRanged: true, ammoType: 'ammo_9mm', projSpeed: 15, pellets: 1, spread: 0.20, projSprite: Spr.BULLET },
  toz_shotgun:{ dmg: 8, durability: 0, range: 0, speed: 1.6, isRanged: true, ammoType: 'ammo_shells', projSpeed: 20, pellets: 8, spread: 0.13, projSprite: Spr.PELLET, soundId: 'shotgun' },
  harpoon_gun:{ dmg: 88, durability: 0, range: 0, speed: 2.35, isRanged: true, ammoType: 'ammo_harpoon', projSpeed: 18, pellets: 1, spread: 0.003, projSprite: Spr.NAIL, soundId: 'nailgun' },
};

export const PHYS_WEAPON_ROLE_TIERS: Record<string, WeaponRoleTier> = {
  '': 'unarmed',
  knife: 'melee_emergency',
  wrench: 'industrial_tool',
  pipe: 'melee_emergency',
  rebar: 'melee_reach',
  axe: 'melee_heavy',
  chainsaw: 'industrial_tool',
  makarov: 'makarov_precise',
  ppsh: 'ammo_burn',
  shotgun: 'shotgun_corridor_stop',
  nailgun: 'industrial_tool',
  ak47: 'ammo_burn',
  machinegun: 'ammo_burn',
  grenade: 'grenade',
  gauss: 'rare_energy',
  plasma: 'rare_energy',
  bfg: 'rare_energy',
  gravity_beam_emitter: 'rare_energy',
  flamethrower: 'fuel_clear',
  hammer: 'industrial_tool',
  crowbar: 'industrial_tool',
  sledgehammer: 'melee_control',
  fire_hook: 'melee_reach',
  entrenching_spade: 'industrial_tool',
  bayonet: 'melee_reach',
  chain: 'melee_reach',
  metal_chair: 'melee_control',
  tt_pistol: 'pistol_sidegrade',
  nagant: 'pistol_sidegrade',
  homemade_pistol: 'pistol_sidegrade',
  toz_shotgun: 'shotgun_corridor_stop',
  harpoon_gun: 'industrial_tool',
};
