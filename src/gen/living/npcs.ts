/* ── NPC and item spawning for the living floor ──────────────── */

import {
  W, Cell,
  type Entity,
  EntityType, Faction, RoomType,
} from '../../core/types';
import { World } from '../../core/world';
import { ITEMS, NOTES } from '../../data/catalog';
import { spawnCount } from '../../data/items';
import { pick, weightedPick } from '../shared';
import { Spr } from '../../entities/sprite_index';
import type { AptPlan } from './apartments';
import { rng, irand } from '../../core/rand';



/* ── Spawn items in every room (zone-level dependent) ────────── */
export function spawnRoomItems(
  world: World, entities: Entity[], nextIdStart: number,
): number {
  let nextId = nextIdStart;
  for (const room of world.rooms) {
    if (!room || room.w < 3 || room.h < 3 || room.tags?.includes('tutorial')) continue;
    // Get zone level for this room
    const ci = world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2));
    const zid = world.zoneMap[ci];
    const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 1) : 1;
    // Filter items by room type, then adjust weights by zone level (expensive items rarer in low-level zones)
    const valueThreshold = zoneLevel * 15 + 10;
    const adjusted = Object.values(ITEMS)
      .filter(it => it.spawnRooms.includes(room.type))
      .map(it => ({ ...it, spawnW: (1000 / (it.value + 10)) * Math.min(1, (valueThreshold + 5) / Math.max(1, it.value)) }))
      .filter(it => it.spawnW >= 0.01);
    const numItems = irand(0, 2);  // slightly rarer (was 0-3)
    for (let n = 0; n < numItems; n++) {
      const def = weightedPick(adjusted);
      if (!def) continue;
      const ix = room.x + irand(1, Math.max(1, room.w - 2));
      const iy = room.y + irand(1, Math.max(1, room.h - 2));
      entities.push({
        id: nextId++, type: EntityType.ITEM_DROP,
        x: ix + 0.5, y: iy + 0.5, angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
        inventory: [{ defId: def.id, count: irand(1, spawnCount(def)), data: def.id === 'note' ? pick(NOTES) : undefined }],
      });
    }
  }

  // ── Story items: 128 idol_chernobog scattered across the world ──
  const eligibleRooms = world.rooms.filter(r => r && r.w >= 3 && r.h >= 3 &&
    !r.tags?.includes('tutorial') &&
    [RoomType.COMMON, RoomType.STORAGE, RoomType.OFFICE, RoomType.SMOKING].includes(r.type));
  for (let i = 0; i < 128 && eligibleRooms.length > 0; i++) {
    const room = eligibleRooms[Math.floor(rng() * eligibleRooms.length)];
    const ix = room.x + irand(1, Math.max(1, room.w - 2));
    const iy = room.y + irand(1, Math.max(1, room.h - 2));
    entities.push({
      id: nextId++, type: EntityType.ITEM_DROP,
      x: ix + 0.5, y: iy + 0.5, angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
      inventory: [{ defId: 'idol_chernobog', count: 1 }],
    });
  }

  return nextId;
}



/* ── Spawn NPC families — one per apartment ──────────────────── */
export function spawnFamilies(
  _world: World, apartments: AptPlan[], entities: Entity[], nextIdStart: number,
  residentQuota: number, _npcFactions: readonly { value: Faction; weight: number }[]
): number {
  let nextId = nextIdStart;
  const familySize = Math.max(1, Math.round(residentQuota / Math.max(1, apartments.length)));

  for (let a = 0; a < apartments.length; a++) {
    const apt = apartments[a];
    for (let f = 0; f < familySize; f++) {
      const room = apt.living;
      entities.push({
        id: nextId++, type: EntityType.NPC,
        x: room.x + irand(1, Math.max(1, room.w - 2)) + 0.5,
        y: room.y + irand(1, Math.max(1, room.h - 2)) + 0.5,
        angle: rng() * Math.PI * 2,
        pitch: 0,
        alive: true,
        speed: 1, sprite: undefined as unknown as number, familyId: a, questId: -1,
      });
    }
  }

  return nextId;
}



/* ── Spawn traveler NPCs — путники, паломники, охотники ──────── */
export function spawnTravelers(
  world: World, entities: Entity[], nextIdStart: number,
  travelerQuota: number, _npcFactions: readonly { value: Faction; weight: number }[]
): number {
  let nextId = nextIdStart;

  const corridorSpawns: number[] = [];
  for (let i = 0; i < Math.max(10000, travelerQuota * 20); i++) {
    const ci = Math.floor(rng() * W * W);
    if (world.cells[ci] === Cell.FLOOR) {
      const roomId = world.roomMap[ci];
      if (roomId >= 0 && world.rooms[roomId]?.tags?.includes('tutorial')) continue;
      corridorSpawns.push(ci);
    }
    if (corridorSpawns.length >= Math.max(500, travelerQuota * 2)) break;
  }

  for (let i = 0; i < travelerQuota && corridorSpawns.length > 0; i++) {
    const randIdx = Math.floor(rng() * corridorSpawns.length);
    const ci = corridorSpawns[randIdx];
    corridorSpawns[randIdx] = corridorSpawns[corridorSpawns.length - 1];
    corridorSpawns.pop();
    const sx = (ci % W) + 0.5;
    const sy = Math.floor(ci / W) + 0.5;
    entities.push({
      id: nextId++, type: EntityType.NPC,
      x: sx, y: sy,
      angle: rng() * Math.PI * 2,
      pitch: 0,
      alive: true,
      speed: 1, sprite: undefined as unknown as number, isTraveler: true, questId: -1,
    });
  }

  return nextId;
}
