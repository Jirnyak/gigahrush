/* ── Hell level generator (Floor 2) — orchestrator ───────────── */
/*   Corrupted meat areas. Permanent samosbor atmosphere.        */
/*   Dense cultist presence, strong monsters.                    */
/*                                                               */
/*   Content modules can be added as sibling files:              */
/*     boss_arena.ts  — dedicated boss encounter room            */
/*     shrine.ts      — cultist shrine with rituals              */
/*   Each module exports a generate function called from here.   */

import {
  W, Cell, Tex, RoomType, Feature, Faction, Occupation,
  type Room, type Entity,
  EntityType, AIGoal, MonsterKind,
} from '../../core/types';
import { World } from '../../core/world';
import { randomName, freshNeeds } from '../../data/catalog';
import {
  rng, pick, canPlaceRoom, connectRoomsMST,
  ensureConnectivity, placeLifts, repairRoomWalls, sanitizeDoors,
} from '../shared';

export function generateHell(): { world: World; entities: Entity[]; spawnX: number; spawnY: number } {
  const world = new World();
  const entities: Entity[] = [];
  let nextId = 1;
  let nextRoomId = 0;

  /* ── Phase 1: organic/corrupted rooms ───────────────── */
  const rooms: Room[] = [];

  for (let gy = 0; gy < W; gy += 8) {
    for (let gx = 0; gx < W; gx += 8) {
      if (Math.random() < 0.35) continue;
      const area = Math.exp(1.5 + Math.random() * 3.0);
      const logAspect = (Math.random() - 0.5) * 3.0;
      const aspect = Math.exp(logAspect);
      let rw = Math.round(Math.sqrt(area * aspect));
      let rh = Math.round(Math.sqrt(area / aspect));
      rw = Math.max(2, Math.min(18, rw));
      rh = Math.max(2, Math.min(18, rh));
      const rx = gx + rng(0, 4), ry = gy + rng(0, 4);

      if (!canPlaceRoom(world, rx, ry, rw, rh)) continue;

      const room: Room = {
        id: nextRoomId, type: RoomType.COMMON,
        x: world.wrap(rx), y: world.wrap(ry), w: rw, h: rh,
        doors: [], sealed: false,
        name: `Преисподняя #${nextRoomId}`,
        apartmentId: -1,
        wallTex: Tex.MEAT,
        floorTex: Tex.F_MEAT,
      };
      for (let dy = -1; dy <= rh; dy++) {
        for (let dx = -1; dx <= rw; dx++) {
          const i = world.idx(room.x + dx, room.y + dy);
          world.cells[i] = Cell.WALL;
          world.wallTex[i] = Tex.MEAT;
        }
      }
      world.carveRect(room.x, room.y, rw, rh, nextRoomId);
      for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
          const i = world.idx(room.x + dx, room.y + dy);
          world.floorTex[i] = Tex.F_MEAT;
        }
      }
      world.rooms[nextRoomId] = room;
      rooms.push(room);
      nextRoomId++;
    }
  }

  /* ── Phase 2: MST corridors (organic) ───────────────── */
  if (rooms.length >= 2) {
    connectRoomsMST(world, rooms);
  }

  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.FLOOR && world.roomMap[i] < 0) {
      world.floorTex[i] = Tex.F_MEAT;
    }
    if (world.cells[i] === Cell.WALL) {
      world.wallTex[i] = Tex.MEAT;
    }
  }

  /* ── Phase 3: connectivity ──────────────────────────── */
  let spawnX = W / 2, spawnY = W / 2;
  if (rooms.length > 0) {
    const r0 = rooms[0];
    spawnX = r0.x + Math.floor(r0.w / 2) + 0.5;
    spawnY = r0.y + Math.floor(r0.h / 2) + 0.5;
  }
  ensureConnectivity(world, spawnX, spawnY);
  repairRoomWalls(world);
  sanitizeDoors(world);

  /* ── Phase 4: lifts ────────────────────────────────── */
  placeLifts(world, 3);

  /* ── Phase 5: lights (very sparse) ──────────────────── */
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.FLOOR && Math.random() < 0.008) {
      world.features[i] = Feature.LAMP;
    }
  }
  world.bakeLights();

  /* ── Phase 6: cultists (aggressive NPCs) ────────────── */
  for (let c = 0; c < 80; c++) {
    const ci = rng(0, W * W - 1);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    const cx = (ci % W) + 0.5, cy = ((ci / W) | 0) + 0.5;
    entities.push({
      id: nextId++, type: EntityType.NPC,
      x: cx, y: cy,
      angle: Math.random() * Math.PI * 2, pitch: 0,
      alive: true, speed: 1.5, sprite: Occupation.PILGRIM,
      name: randomName(), needs: freshNeeds(),
      hp: 120, maxHp: 120,
      ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
      inventory: [],
      familyId: -1,
      faction: Faction.CULTIST,
      occupation: Occupation.PILGRIM,
      questId: -1,
    });
  }

  /* ── Phase 7: strong monsters ───────────────────────── */
  for (let m = 0; m < 80; m++) {
    const ci = rng(0, W * W - 1);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    const mx = (ci % W) + 0.5, my = ((ci / W) | 0) + 0.5;
    const kind = pick([MonsterKind.TVAR, MonsterKind.TVAR, MonsterKind.POLZUN, MonsterKind.BETONNIK]);
    const stats: Record<MonsterKind, { hp: number; speed: number; sprite: number; name: string }> = {
      [MonsterKind.SBORKA]:  { hp: 10, speed: 2.8, sprite: 17, name: 'Сборка' },
      [MonsterKind.TVAR]:    { hp: 60, speed: 2.0, sprite: 18, name: 'Тварь' },
      [MonsterKind.POLZUN]:  { hp: 120, speed: 1.2, sprite: 19, name: 'Ползун' },
      [MonsterKind.BETONNIK]:{ hp: 2000, speed: 1.0, sprite: 20, name: 'Бетонник' },
    };
    const def = stats[kind];
    entities.push({
      id: nextId++, type: EntityType.MONSTER,
      x: mx, y: my, angle: Math.random() * Math.PI * 2, pitch: 0,
      alive: true, speed: def.speed, sprite: def.sprite,
      name: def.name, hp: def.hp, maxHp: def.hp,
      monsterKind: kind, attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    });
  }

  /* ── Phase 8: items (good loot but rare) ────────────── */
  for (const room of rooms) {
    if (Math.random() > 0.4) continue;
    const defs = ['canned', 'bandage', 'pills', 'pipe', 'knife', 'water', 'ammo_9mm', 'ammo_nails', 'rebar'];
    const defId = pick(defs);
    const ix = room.x + rng(0, Math.max(0, room.w - 1));
    const iy = room.y + rng(0, Math.max(0, room.h - 1));
    entities.push({
      id: nextId++, type: EntityType.ITEM_DROP,
      x: ix + 0.5, y: iy + 0.5, angle: 0, pitch: 0,
      alive: true, speed: 0, sprite: 16,
      inventory: [{ defId, count: rng(1, 2) }],
    });
  }

  return { world, entities, spawnX, spawnY };
}
