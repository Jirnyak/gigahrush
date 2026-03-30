/* ── ПСИ сгустки — PSI weapon stats ──────────────────────────── */

import type { WeaponStats } from './weapons';
import { Spr } from '../render/sprite_index';

export const PSI_WEAPON_STATS: Record<string, WeaponStats> = {
  psi_strike:   { dmg: 10, durability: 0, range: 0, speed: 0.35, isRanged: true,  psiCost: 1,  projSpeed: 16, projSprite: Spr.PSI_BOLT },
  psi_rupture:  { dmg: 10, durability: 0, range: 0, speed: 0.6,  isRanged: true,  psiCost: 3,  projSpeed: 14, projSprite: Spr.PSI_BOLT, aoeRadius: 3 },
  psi_storm:    { dmg: 10, durability: 0, range: 0, speed: 1.0,  isRanged: false, psiCost: 10, psiEffect: 'storm' },
  psi_brainburn:{ dmg: 0,  durability: 0, range: 0, speed: 1.0,  isRanged: false, psiCost: 8,  psiEffect: 'brain_burn' },
  psi_madness:  { dmg: 0,  durability: 0, range: 0, speed: 0.8,  isRanged: false, psiCost: 5,  psiEffect: 'madness' },
  psi_control:  { dmg: 0,  durability: 0, range: 0, speed: 0.8,  isRanged: false, psiCost: 8,  psiEffect: 'control' },
  psi_phase:    { dmg: 0,  durability: 0, range: 0, speed: 0.5,  isRanged: false, psiCost: 8,  psiEffect: 'phase' },
  psi_mark:     { dmg: 0,  durability: 0, range: 0, speed: 0.3,  isRanged: false, psiCost: 3,  psiEffect: 'mark' },
  psi_recall:   { dmg: 0,  durability: 0, range: 0, speed: 0.3,  isRanged: false, psiCost: 3,  psiEffect: 'recall' },
};
