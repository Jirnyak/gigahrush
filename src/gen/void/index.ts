/* ── Void level generator (Floor 3) — abstract fractal geometry ─ */
/*   Green/black abstract space with fractal structures.          */
/*   Final boss: Creator (Творец) — white glowing silhouette.     */
/*   Reached via portal in Hell after killing 3 Heralds.          */

import {
  W, Cell, Tex, Feature,
  type Entity,
  EntityType, AIGoal, MonsterKind, FloorLevel,
} from '../../core/types';
import { World } from '../../core/world';

import { rng, ensureConnectivity, generateZones } from '../shared';
import { calcZoneLevel, randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { MONSTERS } from '../../entities/monster';
import { Spr, monsterSpr } from '../../render/sprite_index';

/* ── Hash utility ─────────────────────────────────────────────── */
function hash2(x: number, y: number, seed: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
  n = Math.imul(n ^ (n >> 13), 1103515245);
  n ^= n >> 16;
  return (n & 0x7fffffff) / 0x7fffffff;
}

function wrapCoord(v: number): number {
  return ((v % W) + W) % W;
}

export function generateVoid(): { world: World; entities: Entity[]; spawnX: number; spawnY: number } {
  const world = new World();
  const entities: Entity[] = [];
  let nextId = 1;

  // Default wall texture = void
  for (let i = 0; i < W * W; i++) world.wallTex[i] = Tex.VOID_WALL;

  /* ══════════════════════════════════════════════════════════════
     Phase 1: Fractal cave field — vast open spaces
     ══════════════════════════════════════════════════════════════ */
  const field = new Uint8Array(W * W);

  // Multi-octave fractal noise — creates huge open areas with strange geometry
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const coarse = hash2(x >> 6, y >> 6, 500) * 0.35;
      const medium = hash2(x >> 4, y >> 4, 501) * 0.25;
      const fine = hash2(x >> 2, y >> 2, 502) * 0.2;
      const micro = hash2(x >> 1, y >> 1, 503) * 0.2;
      const val = coarse + medium + fine + micro;

      // More open than other floors — large connected spaces
      field[y * W + x] = val > 0.42 ? 1 : 0;
    }
  }

  // Fractal structures: strange geometric pillars
  for (let i = 0; i < 300; i++) {
    const px = rng(0, W - 1);
    const py = rng(0, W - 1);
    const shape = rng(0, 4);

    if (shape === 0) {
      // Cross shape
      const size = rng(3, 8);
      for (let d = -size; d <= size; d++) {
        field[wrapCoord(py) * W + wrapCoord(px + d)] = 0;
        field[wrapCoord(py + d) * W + wrapCoord(px)] = 0;
      }
    } else if (shape === 1) {
      // Ring
      const radius = rng(5, 15);
      for (let a = 0; a < 64; a++) {
        const angle = (a / 64) * Math.PI * 2;
        const wx = wrapCoord(px + Math.round(Math.cos(angle) * radius));
        const wy = wrapCoord(py + Math.round(Math.sin(angle) * radius));
        field[wy * W + wx] = 0;
      }
    } else if (shape === 2) {
      // Spiral
      for (let step = 0; step < 80; step++) {
        const angle = step * 0.15;
        const r = step * 0.3;
        const wx = wrapCoord(px + Math.round(Math.cos(angle) * r));
        const wy = wrapCoord(py + Math.round(Math.sin(angle) * r));
        field[wy * W + wx] = 0;
        // Widen
        field[wy * W + wrapCoord(wx + 1)] = 0;
        field[wrapCoord(wy + 1) * W + wx] = 0;
      }
    } else if (shape === 3) {
      // Line fractal
      const len = rng(20, 60);
      const angle = hash2(px, py, 510) * Math.PI * 2;
      for (let s = 0; s < len; s++) {
        const wx = wrapCoord(px + Math.round(Math.cos(angle) * s));
        const wy = wrapCoord(py + Math.round(Math.sin(angle) * s));
        field[wy * W + wx] = 0;
      }
    } else {
      // Diamond
      const size = rng(4, 10);
      for (let dy = -size; dy <= size; dy++) {
        for (let dx = -size; dx <= size; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= size) {
            field[wrapCoord(py + dy) * W + wrapCoord(px + dx)] = 0;
          }
        }
      }
    }
  }

  // Clear spawn area
  const spawnCx = W >> 1;
  const spawnCy = W >> 1;
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      if (dx * dx + dy * dy <= 64) {
        field[wrapCoord(spawnCy + dy) * W + wrapCoord(spawnCx + dx)] = 1;
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════
     Phase 2: Paint terrain
     ══════════════════════════════════════════════════════════════ */
  for (let i = 0; i < W * W; i++) {
    if (field[i]) {
      world.cells[i] = Cell.FLOOR;
      world.floorTex[i] = Tex.F_VOID;
      world.wallTex[i] = 0;
    } else {
      world.cells[i] = Cell.WALL;
      world.wallTex[i] = Tex.VOID_WALL;
      world.floorTex[i] = 0;
    }
  }

  const spawnX = spawnCx + 0.5;
  const spawnY = spawnCy + 0.5;

  ensureConnectivity(world, spawnX, spawnY);

  /* ══════════════════════════════════════════════════════════════
     Phase 3: Zones
     ══════════════════════════════════════════════════════════════ */
  generateZones(world);
  for (const z of world.zones) z.level = calcZoneLevel(z.cx, z.cy, FloorLevel.VOID) + 5;

  /* ══════════════════════════════════════════════════════════════
     Phase 4: Sparse eerie lighting
     ══════════════════════════════════════════════════════════════ */
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.FLOOR && Math.random() < 0.0015) {
      world.features[i] = Feature.LAMP;
    }
  }
  world.bakeLights();

  /* ══════════════════════════════════════════════════════════════
     Phase 5: Creator boss — center of the void
     ══════════════════════════════════════════════════════════════ */
  // Place Creator at ~100-200 cells from spawn
  let bossX = spawnCx, bossY = spawnCy;
  for (let attempt = 0; attempt < 5000; attempt++) {
    const ax = rng(0, W - 1);
    const ay = rng(0, W - 1);
    if (world.cells[ay * W + ax] !== Cell.FLOOR) continue;
    const dist = world.dist(spawnCx, spawnCy, ax, ay);
    if (dist >= 100 && dist <= 250) {
      bossX = ax;
      bossY = ay;
      break;
    }
  }

  const creatorDef = MONSTERS[MonsterKind.CREATOR];
  const bossLevel = 20;
  const rpg = randomRPG(bossLevel);
  const bossHp = Math.round(scaleMonsterHp(creatorDef.hp, bossLevel));
  entities.push({
    id: nextId++, type: EntityType.MONSTER,
    x: bossX + 0.5, y: bossY + 0.5,
    angle: 0, pitch: 0, alive: true,
    speed: scaleMonsterSpeed(creatorDef.speed, bossLevel),
    sprite: monsterSpr(MonsterKind.CREATOR),
    name: 'Творец',
    hp: bossHp, maxHp: bossHp,
    monsterKind: MonsterKind.CREATOR, attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg,
    spriteScale: 1.5, // larger than normal
  });

  // Light up the boss area
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      if (dx * dx + dy * dy <= 25) {
        const ci = world.idx(bossX + dx, bossY + dy);
        if (world.cells[ci] === Cell.FLOOR) {
          world.features[ci] = Feature.LAMP;
        }
      }
    }
  }
  world.bakeLights();

  /* ══════════════════════════════════════════════════════════════
     Phase 6: Guardian monsters scattered
     ══════════════════════════════════════════════════════════════ */
  const voidKinds = [
    MonsterKind.SHADOW, MonsterKind.NIGHTMARE, MonsterKind.EYE,
    MonsterKind.REBAR, MonsterKind.BETONNIK, MonsterKind.SPIRIT,
  ];
  for (let i = 0; i < 120; i++) {
    const cell = randomFloorCell(world);
    if (cell < 0) continue;
    const kind = voidKinds[rng(0, voidKinds.length - 1)];
    const mdef = MONSTERS[kind];
    if (!mdef) continue;
    const x = (cell % W) + 0.5;
    const y = ((cell / W) | 0) + 0.5;
    const zid = world.zoneMap[cell];
    const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 15) : 15;
    const mRpg = randomRPG(zoneLevel);
    const mHp = Math.round(scaleMonsterHp(mdef.hp, zoneLevel));
    entities.push({
      id: nextId++, type: EntityType.MONSTER,
      x, y,
      angle: Math.random() * Math.PI * 2, pitch: 0,
      alive: true,
      speed: scaleMonsterSpeed(mdef.speed, zoneLevel),
      sprite: monsterSpr(kind),
      hp: mHp, maxHp: mHp,
      monsterKind: kind, attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
      rpg: mRpg,
      phasing: kind === MonsterKind.SPIRIT,
    });
  }

  /* ══════════════════════════════════════════════════════════════
     Phase 7: Loot
     ══════════════════════════════════════════════════════════════ */
  const drops = ['canned', 'bandage', 'pills', 'antidep', 'ammo_energy', 'ammo_762', 'grenade'];
  for (let i = 0; i < 80; i++) {
    const cell = randomFloorCell(world);
    if (cell < 0) continue;
    entities.push({
      id: nextId++, type: EntityType.ITEM_DROP,
      x: (cell % W) + 0.5, y: ((cell / W) | 0) + 0.5,
      angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
      inventory: [{ defId: drops[rng(0, drops.length - 1)], count: rng(1, 3) }],
    });
  }

  return { world, entities, spawnX, spawnY };
}

function randomFloorCell(world: World): number {
  for (let attempt = 0; attempt < 2048; attempt++) {
    const cell = rng(0, W * W - 1);
    if (world.cells[cell] === Cell.FLOOR) return cell;
  }
  return -1;
}
