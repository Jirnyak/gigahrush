/* ── Game data catalogue — barrel re-export ──────────────────── */
/*  Отдельные модули:
 *    weapons.ts  — WeaponStats + физ. оружие
 *    psi.ts      — ПСИ-сгустки
 *    rooms.ts    — RoomDef + ROOM_DEFS
 *    items.ts    — ITEMS
 *    names.ts    — randomName, freshNeeds
 *    notes.ts    — NOTES (лор-записки)
 */

import { PHYS_WEAPON_STATS, type WeaponStats } from './weapons';
import { PSI_WEAPON_STATS } from './psi';

// Merged weapon registry (physical + PSI)
export const WEAPON_STATS: Record<string, WeaponStats> = {
  ...PHYS_WEAPON_STATS,
  ...PSI_WEAPON_STATS,
};

export type { WeaponStats } from './weapons';
export { ROOM_DEFS, type RoomDef } from './rooms';
export { ITEMS } from './items';
export { randomName, type NameResult, freshNeeds } from './names';
export { NOTES } from './notes';
export { PLOT_NPCS, PLOT_CHAIN, isPlotNpc, getPlotDef, type PlotNpcDef, type PlotStep } from './plot';
export { PLOT_ROOMS, type PlotRoomDef } from './plot_rooms';
export { generateTalkText, generateNpcTradeItems } from './dialogue';
