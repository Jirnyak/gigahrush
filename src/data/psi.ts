/* ── ПСИ сгустки — PSI weapon stats ──────────────────────────── */

import type { WeaponStats } from './weapons';
import { Spr } from '../render/sprite_index';

export const PSI_WEAPON_STATS: Record<string, WeaponStats> = {
  psi_strike:   { dmg: 14, durability: 0, range: 0, speed: 0.45, isRanged: true,  psiCost: 2,  projSpeed: 16, projSprite: Spr.PSI_BOLT },
  psi_rupture:  { dmg: 18, durability: 0, range: 0, speed: 0.9,  isRanged: true,  psiCost: 5,  projSpeed: 13, projSprite: Spr.PSI_BOLT, aoeRadius: 3 },
  psi_storm:    { dmg: 18, durability: 0, range: 0, speed: 1.4,  isRanged: false, psiCost: 12, psiEffect: 'storm' },
  psi_brainburn:{ dmg: 0,  durability: 0, range: 0, speed: 1.2,  isRanged: false, psiCost: 10, psiEffect: 'brain_burn' },
  psi_madness:  { dmg: 0,  durability: 0, range: 0, speed: 0.9,  isRanged: false, psiCost: 7,  psiEffect: 'madness' },
  psi_control:  { dmg: 0,  durability: 0, range: 0, speed: 1.0,  isRanged: false, psiCost: 12, psiEffect: 'control' },
  psi_phase:    { dmg: 0,  durability: 0, range: 0, speed: 0.7,  isRanged: false, psiCost: 12, psiEffect: 'phase' },
  psi_mark:     { dmg: 0,  durability: 0, range: 0, speed: 0.4,  isRanged: false, psiCost: 4,  psiEffect: 'mark' },
  psi_recall:   { dmg: 0,  durability: 0, range: 0, speed: 0.4,  isRanged: false, psiCost: 4,  psiEffect: 'recall' },
  psi_beam:     { dmg: 20, durability: 0, range: 0, speed: 0.35, isRanged: false, psiCost: 6,  psiEffect: 'beam' },
  psi_concrete_splinter:{ dmg: 22, durability: 0, range: 0, speed: 0.55, isRanged: true, psiCost: 3, projSpeed: 17, projSprite: Spr.PSI_BOLT },
  psi_shadow_lance:{ dmg: 42, durability: 0, range: 0, speed: 0.75, isRanged: true, psiCost: 5, projSpeed: 24, projSprite: Spr.PSI_BOLT },
  psi_order_seal:{ dmg: 30, durability: 0, range: 0, speed: 1.1, isRanged: true, psiCost: 7, projSpeed: 12, projSprite: Spr.PSI_BOLT, aoeRadius: 2 },
  psi_void_needle:{ dmg: 80, durability: 0, range: 0, speed: 1.35, isRanged: true, psiCost: 9, projSpeed: 28, projSprite: Spr.PSI_BOLT },
  psi_meat_hook:{ dmg: 34, durability: 0, range: 0, speed: 0.9, isRanged: true, psiCost: 4, projSpeed: 11, projSprite: Spr.PSI_BOLT },
  psi_siren_pulse:{ dmg: 28, durability: 0, range: 0, speed: 1.0, isRanged: true, psiCost: 6, projSpeed: 18, projSprite: Spr.PSI_BOLT, aoeRadius: 2 },
};
