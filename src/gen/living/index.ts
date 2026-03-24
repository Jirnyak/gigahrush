/* ── Living floor generator (Floor 0) — orchestrator ─────────── */
/*   PARADIGM: Apartments are PERMANENT. Everything else is      */
/*   VOLATILE — regenerated every samosbor.                      */
/*                                                               */
/*   generateWorld()  = apartments(once) + volatile maze + NPCs  */
/*   regrowMaze()     = wipe volatile + regenerate volatile maze  */
/*                                                               */
/*   Content modules live in sibling files:                      */
/*     apartments.ts  — permanent apartment clusters             */
/*     volatile.ts    — volatile gigastructure maze              */
/*     start_room.ts  — tutorial briefing room (Актовый зал)     */
/*     yakov_lab.ts   — Yakov's lab (PSI researcher, story quest)*/
/*     slides.ts      — slide texture generation                 */
/*     npcs.ts        — NPC & item spawning                      */
/*                                                               */
/*   To add a new hand-crafted room, create a .ts file here      */
/*   and call it from generateWorld() below.                     */

import { type Entity, FloorLevel } from '../../core/types';
import { World } from '../../core/world';
import { reassignQuestGivers } from '../../systems/quests';
import { calcZoneLevel } from '../../systems/rpg';
import { generateZones, stampHQRooms } from '../shared';
import { generateApartments } from './apartments';
import { generateVolatileMaze, wipeVolatile } from './volatile';
import { generateStartRoom } from './start_room';
import { generateYakovLab } from './yakov_lab';
import { spawnRoomItems, spawnFamilies, spawnTravelers } from './npcs';

export { generateSlideTextures } from './slides';

/* ── generateWorld — called once at game start ───────────────── */
export function generateWorld(): { world: World; entities: Entity[]; spawnX: number; spawnY: number } {
  const world = new World();
  const entities: Entity[] = [];
  let nextId = 1;

  /* ── A: Permanent apartments ───────────────────────── */
  const apartments = generateApartments(world);

  /* ── A1: Start room (briefing hall) ─────────────── */
  const startRoom = generateStartRoom(world, world.rooms.length, entities, { v: nextId });
  nextId = entities.reduce((mx, e) => Math.max(mx, e.id), nextId) + 1;

  /* ── A1b: Yakov's lab (at distance from spawn) ──── */
  generateYakovLab(world, world.rooms.length, entities, { v: nextId }, startRoom.spawnX, startRoom.spawnY);
  nextId = entities.reduce((mx, e) => Math.max(mx, e.id), nextId) + 1;
  world.apartmentRoomCount = world.rooms.length;

  /* ── A2: Permanent zones (64 macro-regions) ─────── */
  generateZones(world);  // Assign zone levels for living floor
  for (const z of world.zones) z.level = calcZoneLevel(z.id, FloorLevel.LIVING);

  /* ── A3: HQ rooms for faction zones ─────────────── */
  stampHQRooms(world);

  /* ── B: Volatile gigastructure ─────────────────────── */
  generateVolatileMaze(world);

  /* ── C: Items in all rooms ─────────────────────────── */
  nextId = spawnRoomItems(world, entities, nextId);

  /* ── D: NPCs — families + travelers ────────────────── */
  nextId = spawnFamilies(world, apartments, entities, nextId);
  nextId = spawnTravelers(world, entities, nextId);

  /* ── E: Quest givers + spawn ───────────────────────── */
  reassignQuestGivers(entities);
  return {
    world, entities,
    spawnX: startRoom.spawnX,
    spawnY: startRoom.spawnY,
  };
}

/* ── regrowMaze — called every samosbor ──────────────────────── */
export function regrowMaze(world: World): void {
  wipeVolatile(world);
  generateVolatileMaze(world);
}
