/* ── Maintenance tunnels generator (Floor 1) — orchestrator ──── */
/*   Dense tubular corridors with pipes and water canals.        */
/*   Collectors, sewers, pipe mazes. Sparse monsters.            */
/*                                                               */
/*   Content modules can be added as sibling files:              */
/*     pump_station.ts — dedicated pump room with mechanics      */
/*   Each module exports a generate function called from here.   */

import {
  W, Cell, Tex, RoomType, Feature,
  type Room, type Entity,
  EntityType, AIGoal, MonsterKind,
} from '../../core/types';
import { World } from '../../core/world';
import { rng, pick, ensureConnectivity, placeLifts, repairRoomWalls, sanitizeDoors } from '../shared';

export function generateMaintenance(): { world: World; entities: Entity[]; spawnX: number; spawnY: number } {
  const world = new World();
  const entities: Entity[] = [];
  let nextId = 1;
  let nextRoomId = 0;

  /* ── Phase 1: dense tunnel grid ─────────────────────── */
  const carveMap = new Uint8Array(W * W);

  for (let y = 0; y < W; y += 4) {
    for (let x = 0; x < W; x++) {
      const jy = world.wrap(y + (rng(0, 1)));
      carveMap[jy * W + world.wrap(x)] = 1;
    }
  }
  for (let x = 0; x < W; x += 4) {
    for (let y = 0; y < W; y++) {
      const jx = world.wrap(x + (rng(0, 1)));
      carveMap[y * W + jx] = 1;
    }
  }

  for (let i = 0; i < W * W; i++) {
    if (carveMap[i] && Math.random() < 0.15) carveMap[i] = 0;
  }

  for (let i = 0; i < W * W; i++) {
    if (carveMap[i]) {
      world.cells[i] = Cell.FLOOR;
      world.floorTex[i] = Tex.F_CONCRETE;
      world.wallTex[i] = Tex.PIPE;
    }
  }

  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.WALL) {
      world.wallTex[i] = Tex.PIPE;
    }
  }

  /* ── Phase 2: junction rooms ─────────────────────────── */
  const rooms: Room[] = [];
  for (let gy = 0; gy < W; gy += 64) {
    for (let gx = 0; gx < W; gx += 64) {
      if (Math.random() < 0.3) continue;
      const rw = rng(4, 8), rh = rng(4, 8);
      const rx = gx + rng(8, 40), ry = gy + rng(8, 40);
      const room: Room = {
        id: nextRoomId, type: RoomType.STORAGE,
        x: world.wrap(rx), y: world.wrap(ry), w: rw, h: rh,
        doors: [], sealed: false,
        name: `Коллектор #${nextRoomId}`,
        apartmentId: -1,
        wallTex: Tex.PIPE,
        floorTex: Tex.F_CONCRETE,
      };
      for (let dy = -1; dy <= rh; dy++) {
        for (let dx = -1; dx <= rw; dx++) {
          if (dx >= 0 && dx < rw && dy >= 0 && dy < rh) continue;
          const ci = world.idx(room.x + dx, room.y + dy);
          world.cells[ci] = Cell.WALL;
          world.wallTex[ci] = Tex.PIPE;
        }
      }
      world.carveRect(room.x, room.y, rw, rh, nextRoomId);
      world.rooms[nextRoomId] = room;
      rooms.push(room);
      nextRoomId++;
    }
  }

  /* ── Phase 3: water canals ──────────────────────────── */
  for (let canal = 0; canal < 30; canal++) {
    const horiz = Math.random() < 0.5;
    const pos = rng(10, W - 10);
    const start = rng(0, W - 100);
    const len = rng(40, 200);
    const width = rng(1, 3);
    for (let d = 0; d < len; d++) {
      for (let w = 0; w < width; w++) {
        let x: number, y: number;
        if (horiz) {
          x = world.wrap(start + d);
          y = world.wrap(pos + w);
        } else {
          x = world.wrap(pos + w);
          y = world.wrap(start + d);
        }
        const ci = world.idx(x, y);
        world.cells[ci] = Cell.WATER;
        world.floorTex[ci] = Tex.F_WATER;
        world.roomMap[ci] = -1;
      }
    }
  }

  /* ── Phase 4: connectivity ──────────────────────────── */
  let spawnX = W / 2, spawnY = W / 2;
  for (let r = 0; r < 100; r++) {
    const cx = rng(W / 2 - 50, W / 2 + 50);
    const cy = rng(W / 2 - 50, W / 2 + 50);
    if (world.cells[world.idx(cx, cy)] === Cell.FLOOR) {
      spawnX = cx + 0.5;
      spawnY = cy + 0.5;
      break;
    }
  }
  ensureConnectivity(world, spawnX, spawnY);
  repairRoomWalls(world);
  sanitizeDoors(world);

  /* ── Phase 5: lifts ────────────────────────────────── */
  placeLifts(world, 4);

  /* ── Phase 6: lights (sparse, dim) ──────────────────── */
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.FLOOR && Math.random() < 0.015) {
      world.features[i] = Feature.LAMP;
    }
  }
  world.bakeLights();

  /* ── Phase 7: items (sparse) ────────────────────────── */
  for (const room of rooms) {
    const numItems = rng(0, 2);
    for (let n = 0; n < numItems; n++) {
      const defs = ['pipe', 'wrench', 'flashlight', 'bandage', 'water'];
      const defId = pick(defs);
      const ix = room.x + rng(0, Math.max(0, room.w - 1));
      const iy = room.y + rng(0, Math.max(0, room.h - 1));
      entities.push({
        id: nextId++, type: EntityType.ITEM_DROP,
        x: ix + 0.5, y: iy + 0.5, angle: 0, pitch: 0,
        alive: true, speed: 0, sprite: 16,
        inventory: [{ defId, count: 1 }],
      });
    }
  }

  /* ── Phase 8: monsters (sparse) ─────────────────────── */
  for (let m = 0; m < 30; m++) {
    const ci = rng(0, W * W - 1);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    const mx = (ci % W) + 0.5, my = ((ci / W) | 0) + 0.5;
    const kind = pick([MonsterKind.SBORKA, MonsterKind.POLZUN]);
    const mstats: Record<number, { hp: number; speed: number; sprite: number; name: string }> = {
      [MonsterKind.SBORKA]: { hp: 5, speed: 2.8, sprite: 17, name: 'Сборка' },
      [MonsterKind.POLZUN]: { hp: 80, speed: 1.0, sprite: 19, name: 'Ползун' },
    };
    const def = mstats[kind];
    entities.push({
      id: nextId++, type: EntityType.MONSTER,
      x: mx, y: my, angle: Math.random() * Math.PI * 2, pitch: 0,
      alive: true, speed: def.speed, sprite: def.sprite,
      name: def.name, hp: def.hp, maxHp: def.hp,
      monsterKind: kind, attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    });
  }

  return { world, entities, spawnX, spawnY };
}
