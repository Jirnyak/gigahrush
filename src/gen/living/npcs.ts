/* ── NPC and item spawning for the living floor ──────────────── */

import {
  W, Cell,
  type Entity,
  EntityType, AIGoal, Faction, Occupation,
} from '../../core/types';
import { World } from '../../core/world';
import { ITEMS, randomName, freshNeeds, NOTES } from '../../data/catalog';
import { randomFaction, randomOccupation, initRelations } from '../../data/relations';
import { rng, pick, weightedPick } from '../shared';
import type { AptPlan } from './apartments';

/* ── Spawn items in every room ───────────────────────────────── */
export function spawnRoomItems(
  world: World, entities: Entity[], nextIdStart: number,
): number {
  let nextId = nextIdStart;
  for (const room of world.rooms) {
    if (!room || room.w < 3 || room.h < 3) continue;
    const itemDefs = Object.values(ITEMS).filter(it => it.spawnRooms.includes(room.type) && it.spawnW > 0);
    const numItems = rng(0, 3);
    for (let n = 0; n < numItems; n++) {
      const def = weightedPick(itemDefs);
      if (!def) continue;
      const ix = room.x + rng(1, Math.max(1, room.w - 2));
      const iy = room.y + rng(1, Math.max(1, room.h - 2));
      entities.push({
        id: nextId++, type: EntityType.ITEM_DROP,
        x: ix + 0.5, y: iy + 0.5, angle: 0, pitch: 0, alive: true, speed: 0, sprite: 16,
        inventory: [{ defId: def.id, count: rng(1, def.stack), data: def.id === 'note' ? pick(NOTES) : undefined }],
      });
    }
  }
  return nextId;
}

/* ── Spawn NPC families — one per apartment ──────────────────── */
export function spawnFamilies(
  _world: World, apartments: AptPlan[], entities: Entity[], nextIdStart: number,
): number {
  let nextId = nextIdStart;
  const npcSlots: { relIdx: number; familyId: number; faction: number }[] = [];
  let relIdx = 1;

  for (let a = 0; a < apartments.length; a++) {
    const apt = apartments[a];
    const familySize = 8;
    const familyFaction = randomFaction();
    for (let f = 0; f < familySize; f++) {
      const room = apt.living;
      const faction = f === 0 ? familyFaction : (Math.random() < 0.8 ? familyFaction : randomFaction());
      const occupation = randomOccupation(faction);
      entities.push({
        id: nextId++, type: EntityType.NPC,
        x: room.x + rng(1, Math.max(1, room.w - 2)) + 0.5,
        y: room.y + rng(1, Math.max(1, room.h - 2)) + 0.5,
        angle: Math.random() * Math.PI * 2,
        pitch: 0,
        alive: true,
        speed: occupation === Occupation.CHILD ? 0.8 : occupation === Occupation.ALCOHOLIC ? 0.9 : 1.2,
        sprite: occupation,
        spriteScale: occupation === Occupation.CHILD ? 0.6 : 1.0,
        name: randomName(), needs: freshNeeds(),
        hp: 100, maxHp: 100,
        money: occupation === Occupation.DIRECTOR ? rng(200, 500) : occupation === Occupation.CHILD ? rng(0, 10) : rng(20, 100),
        ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
        inventory: [], familyId: a, faction, occupation, questId: -1,
      });
      npcSlots.push({ relIdx, familyId: a, faction });
      relIdx++;
    }
  }

  initRelations(npcSlots);
  return nextId;
}

/* ── Spawn traveler NPCs — путники, паломники, охотники ──────── */
export function spawnTravelers(
  world: World, entities: Entity[], nextIdStart: number,
): number {
  let nextId = nextIdStart;

  const TRAVELER_DEFS: { faction: Faction; occupation: Occupation; count: number }[] = [
    { faction: Faction.CITIZEN,    occupation: Occupation.TRAVELER, count: 128 },
    { faction: Faction.CULTIST,    occupation: Occupation.PILGRIM,  count: 64 },
    { faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER,   count: 32 },
  ];

  const corridorSpawns: number[] = [];
  for (let i = 0; i < 10000; i++) {
    const ci = Math.floor(Math.random() * W * W);
    if (world.cells[ci] === Cell.FLOOR) corridorSpawns.push(ci);
    if (corridorSpawns.length >= 500) break;
  }

  for (const def of TRAVELER_DEFS) {
    for (let i = 0; i < def.count && corridorSpawns.length > 0; i++) {
      const ci = corridorSpawns.splice(Math.floor(Math.random() * corridorSpawns.length), 1)[0];
      const sx = (ci % W) + 0.5;
      const sy = Math.floor(ci / W) + 0.5;
      entities.push({
        id: nextId++, type: EntityType.NPC,
        x: sx, y: sy,
        angle: Math.random() * Math.PI * 2,
        pitch: 0,
        alive: true, speed: 1.4, sprite: def.occupation,
        name: randomName(), needs: freshNeeds(),
        hp: 120, maxHp: 120,
        money: rng(10, 80),
        ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
        inventory: [], faction: def.faction, occupation: def.occupation,
        isTraveler: true, questId: -1,
      });
    }
  }

  return nextId;
}
