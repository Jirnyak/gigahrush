/* ── Intro Atrium — Актовый зал + Оружейная (Стрельбище) ───────── */
/*   Self-contained content module:                               */
/*     • Актовый зал — briefing room with slides & desks          */
/*     • Оружейная — armory / shooting range with targets          */
/*     • NPCs: Ольга Дмитриевна (tutor), Барни (armory)           */
/*     • Quest chain: Ольга→Барни→Ольга                           */
/*     • Item drops: makarov, ammo, supplies near counters         */
/*                                                                 */
/*   To add a new hand-crafted room, create a similar file and     */
/*   call it from the living/index.ts orchestrator.                */

import {
  Cell, Tex, RoomType, Feature,
  type Room, type Entity,
  EntityType, AIGoal, Faction, Occupation,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { stampRoom } from '../shared';

/* ── Helper: set wall textures and aptMask around a room ──────── */
function protectRoom(world: World, rx: number, ry: number, w: number, h: number, wallTex: Tex, floorTex: Tex): void {
  for (let dy = -1; dy <= h; dy++)
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      world.aptMask[ci] = 1;
      if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = wallTex;
    }
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      world.floorTex[world.idx(rx + dx, ry + dy)] = floorTex;
}

export function generateStartRoom(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number },
): { room: Room; spawnX: number; spawnY: number; nextRoomId: number } {

  /* ================================================================
   *  A. Актовый зал (briefing hall) — existing tutorial room
   * ================================================================ */
  const hallW = 11, hallH = 9;
  const hallX = 512 - Math.floor(hallW / 2);   // 507
  const hallY = 512 - Math.floor(hallH / 2);   // 508

  const room = stampRoom(world, nextRoomId++, RoomType.COMMON, hallX, hallY, hallW, hallH, -1);
  room.name = 'Актовый зал';
  room.wallTex = Tex.PANEL;
  room.floorTex = Tex.F_LINO;
  protectRoom(world, hallX, hallY, hallW, hallH, Tex.PANEL, Tex.F_LINO);

  // Desks: rows of half-height desk sprites
  const DESK_SPRITE = 21;
  for (let dy = 2; dy <= hallH - 3; dy += 2)
    for (let dx = 1; dx < hallW - 1; dx++)
      if (dx % 2 === 1) {
        entities.push({
          id: nextId.v++, type: EntityType.ITEM_DROP,
          x: hallX + dx + 0.5, y: hallY + dy + 0.5,
          angle: 0, pitch: 0, alive: true, speed: 0,
          sprite: DESK_SPRITE, spriteScale: 0.5, inventory: [],
        });
      }

  // Slide walls: 2 cells on the north wall
  const slideX1 = hallX + Math.floor(hallW / 2) - 1;
  const slideX2 = hallX + Math.floor(hallW / 2);
  const slideY = hallY - 1;
  for (const sx of [slideX1, slideX2]) {
    const si = world.idx(sx, slideY);
    world.wallTex[si] = Tex.SLIDE_1;
    world.features[si] = Feature.SLIDE;
    world.slideCells.push(si);
  }

  // Lamps
  world.features[world.idx(hallX + Math.floor(hallW / 2), hallY + Math.floor(hallH / 2))] = Feature.LAMP;
  world.features[world.idx(hallX + 2, hallY + 2)] = Feature.LAMP;
  world.features[world.idx(hallX + hallW - 3, hallY + 2)] = Feature.LAMP;

  // Tutorial NPC: Ольга Дмитриевна
  entities.push({
    id: nextId.v++, type: EntityType.NPC,
    x: hallX + Math.floor(hallW / 2) + 0.5, y: hallY + 1 + 0.5,
    angle: Math.PI / 2, pitch: 0, alive: true, speed: 1.2,
    sprite: Occupation.DOCTOR,
    name: 'Ольга Дмитриевна',
    needs: freshNeeds(), hp: 100, maxHp: 100, money: 50,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: [{ defId: 'bandage', count: 3 }, { defId: 'pills', count: 1 }, { defId: 'water', count: 2 }, { defId: 'bread', count: 2 }],
    faction: Faction.SCIENTIST, occupation: Occupation.DOCTOR,
    isTutor: true, canGiveQuest: true, questId: -1,
  });

  /* ================================================================
   *  B. Оружейная / Стрельбище (armory + shooting range)
   * ================================================================ */
  // Placed east of Актовый зал, connected by a door in shared wall
  //
  //  Layout (south = increasing Y):
  //
  //  y=hallY+1  ┌──────────────────────┐
  //             │  Барни   Makarov  Ammo│  reception area
  //  y+3       │ ═══════════════════   │  counter line (desk sprites)
  //             │                       │
  //             │   shooting lanes      │
  //             │                       │
  //  y+13      │  TARGET TARGET TARGET │  targets on south wall
  //             └──────────────────────┘

  const armW = 7, armH = 14;
  const armX = hallX + hallW + 1;   // 519 — one wall gap east of hall
  const armY = hallY + 1;           // 509

  const armory = stampRoom(world, nextRoomId++, RoomType.PRODUCTION, armX, armY, armW, armH, -1);
  armory.name = 'Оружейная';
  armory.wallTex = Tex.METAL;
  armory.floorTex = Tex.F_CONCRETE;
  protectRoom(world, armX, armY, armW, armH, Tex.METAL, Tex.F_CONCRETE);

  // ── Connecting corridor (2 cells between halls) + door ──
  const doorY = hallY + Math.floor(hallH / 2);    // y=512  mid-height of hall
  // Carve the wall cells between the two rooms
  const gapX = hallX + hallW;                       // 518 — the wall cell
  world.cells[world.idx(gapX, doorY)] = Cell.FLOOR;
  world.roomMap[world.idx(gapX, doorY)] = room.id;
  world.floorTex[world.idx(gapX, doorY)] = Tex.F_LINO;
  world.aptMask[world.idx(gapX, doorY)] = 1;
  // Also protect the wall cells around the gap
  world.aptMask[world.idx(gapX, doorY - 1)] = 1;
  world.aptMask[world.idx(gapX, doorY + 1)] = 1;

  // ── Targets on far (south) wall ──
  for (let dx = 0; dx < armW; dx++) {
    const ci = world.idx(armX + dx, armY + armH);   // south wall row
    if (world.cells[ci] === Cell.WALL) {
      world.wallTex[ci] = Tex.TARGET;
    }
  }

  // ── Counter/barrier line at y offset 3 (separates reception from range) ──
  const counterY = armY + 3;
  for (let dx = 1; dx < armW - 1; dx++) {
    entities.push({
      id: nextId.v++, type: EntityType.ITEM_DROP,
      x: armX + dx + 0.5, y: counterY + 0.5,
      angle: 0, pitch: 0, alive: true, speed: 0,
      sprite: DESK_SPRITE, spriteScale: 0.5, inventory: [],
    });
  }

  // ── Lamps in armory ──
  world.features[world.idx(armX + Math.floor(armW / 2), armY + 1)] = Feature.LAMP;
  world.features[world.idx(armX + Math.floor(armW / 2), armY + armH - 3)] = Feature.LAMP;
  world.features[world.idx(armX + 1, armY + 7)] = Feature.LAMP;
  world.features[world.idx(armX + armW - 2, armY + 7)] = Feature.LAMP;

  // ── Item drops: Makarov + ammo on counter ──
  entities.push({
    id: nextId.v++, type: EntityType.ITEM_DROP,
    x: armX + 3 + 0.5, y: armY + 1 + 0.5,
    angle: 0, pitch: 0, alive: true, speed: 0,
    sprite: 16, spriteScale: 1.0,
    inventory: [{ defId: 'ammo_9mm', count: 16 }],
  });

  // ── NPC: Барни — armory instructor ──
  entities.push({
    id: nextId.v++, type: EntityType.NPC,
    x: armX + 2 + 0.5, y: armY + 1 + 0.5,
    angle: Math.PI, pitch: 0, alive: true, speed: 1.4,
    sprite: Occupation.HUNTER,
    name: 'Барни',
    needs: freshNeeds(), hp: 120, maxHp: 120, money: 80,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: [{ defId: 'makarov', count: 1 }, { defId: 'ammo_9mm', count: 8 }, { defId: 'canned', count: 1 }],
    faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER,
    isTutorBarni: true, canGiveQuest: true, questId: -1,
  });

  // ── Player spawn: back of the hall, facing north ──
  const spawnX = hallX + Math.floor(hallW / 2) + 0.5;
  const spawnY = hallY + hallH - 2 + 0.5;

  return { room, spawnX, spawnY, nextRoomId };
}
