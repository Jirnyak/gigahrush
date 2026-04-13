/* ── Zone Content Module Registry ────────────────────────────── */
/*   Modular system for placing hand-crafted content in zones.   */
/*   Each module registers a generator function for a specific   */
/*   zone (by HUD number, 1-indexed).                           */
/*                                                               */
/*   Runs AFTER volatile maze generation — modules can bulldoze  */
/*   maze corridors and stamp their own rooms / NPCs / items.    */
/*   Created rooms get aptMask → survive samosbor.               */

import { type Entity } from '../../core/types';
import { World } from '../../core/world';

/* ── Generator function signature ────────────────────────────── */
export type ZoneContentGenerator = (
  world: World,
  nextRoomId: number,
  entities: Entity[],
  nextId: { v: number },
  /** Zone center X (cell coords, from zone.cx) */
  zoneCx: number,
  /** Zone center Y (cell coords, from zone.cy) */
  zoneCy: number,
) => { nextRoomId: number };

/* ── Internal registry ───────────────────────────────────────── */
interface ZoneContentEntry {
  /** Zone HUD number (1-indexed, as shown on screen) */
  zoneHudId: number;
  /** Human-readable label for debug logs */
  label: string;
  /** Generator function */
  generate: ZoneContentGenerator;
}

const registry: ZoneContentEntry[] = [];

/* ── Register a zone content module ──────────────────────────── */
/**
 * Call at module top-level (side-effect import).
 * @param zoneHudId Zone number as shown on HUD (1-indexed)
 * @param label     Debug label (e.g. "Orthodox temple")
 * @param generate  Generator function
 */
export function registerZoneContent(
  zoneHudId: number,
  label: string,
  generate: ZoneContentGenerator,
): void {
  registry.push({ zoneHudId, label, generate });
}

/* ── Run all registered zone content modules ─────────────────── */
/**
 * Called from index.ts after generateVolatileMaze().
 * Iterates registered modules, resolves zone, invokes generator.
 */
export function runZoneContentModules(
  world: World,
  entities: Entity[],
  nextId: { v: number },
): void {
  for (const entry of registry) {
    const zoneIdx = entry.zoneHudId - 1; // HUD is 1-indexed, array is 0-indexed
    const zone = world.zones[zoneIdx];
    if (!zone) {
      console.warn(`[ZONE_CONTENT] zone HUD #${entry.zoneHudId} (idx ${zoneIdx}) not found, skipping "${entry.label}"`);
      continue;
    }
    console.log(`[ZONE_CONTENT] running "${entry.label}" in zone HUD #${entry.zoneHudId} center=(${zone.cx}, ${zone.cy})`);
    const result = entry.generate(
      world, world.rooms.length, entities, nextId,
      zone.cx, zone.cy,
    );
    // Update nextId from entities array
    nextId.v = entities.reduce((mx, e) => Math.max(mx, e.id), nextId.v - 1) + 1;
    // Protect new rooms from volatile wipe
    world.apartmentRoomCount = Math.max(world.apartmentRoomCount, result.nextRoomId);
  }
}
