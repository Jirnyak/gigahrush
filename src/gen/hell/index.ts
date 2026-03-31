/* ── Hell level generator (Floor 2) — organic ising caves ────── */

import {
  W, Cell, Tex, Feature, Faction, Occupation, LiftDirection,
  type Entity,
  EntityType, AIGoal, MonsterKind, FloorLevel, ZoneFaction,
} from '../../core/types';
import { World } from '../../core/world';
import { randomName, freshNeeds, monsterName } from '../../data/catalog';
import { rng, pick, ensureConnectivity, placeLifts, generateZones } from '../shared';
import { calcZoneLevel, randomRPG, scaleMonsterHp, scaleMonsterSpeed, gaussianLevel, getMaxHp } from '../../systems/rpg';
import { monsterSpr } from '../../render/sprite_index';

const PSI_IDS = ['psi_strike', 'psi_rupture', 'psi_madness', 'psi_storm', 'psi_brainburn'];

export const HELL_MONSTER_SOFT_CAP = 10_000;
export const HELL_CULTIST_SOFT_CAP = 1_000;
export const HELL_LIQUIDATOR_SOFT_CAP = 100;

const INITIAL_MONSTER_COUNT = 240;
const INITIAL_CULTIST_COUNT = 180;
const INITIAL_LIQUIDATOR_COUNT = 18;

const HELL_MONSTER_INTERVAL = 0.4;
const HELL_CULTIST_INTERVAL = 1.5;
const HELL_LIQUIDATOR_INTERVAL = 4.5;

let hellMonsterAccum = 0;
let hellCultistAccum = 0;
let hellLiquidatorAccum = 0;

type SpawnFaction = Faction.CULTIST | Faction.LIQUIDATOR;

const HELL_MONSTER_BASE: Record<number, { hp: number; speed: number; sprite: number }> = {
  [MonsterKind.SBORKA]:    { hp: 10, speed: 2.8, sprite: monsterSpr(MonsterKind.SBORKA) },
  [MonsterKind.TVAR]:      { hp: 60, speed: 2.0, sprite: monsterSpr(MonsterKind.TVAR) },
  [MonsterKind.POLZUN]:    { hp: 120, speed: 1.2, sprite: monsterSpr(MonsterKind.POLZUN) },
  [MonsterKind.BETONNIK]:  { hp: 2000, speed: 1.0, sprite: monsterSpr(MonsterKind.BETONNIK) },
  [MonsterKind.ZOMBIE]:    { hp: 45, speed: 1.7, sprite: monsterSpr(MonsterKind.ZOMBIE) },
  [MonsterKind.EYE]:       { hp: 55, speed: 2.4, sprite: monsterSpr(MonsterKind.EYE) },
  [MonsterKind.NIGHTMARE]: { hp: 85, speed: 1.8, sprite: monsterSpr(MonsterKind.NIGHTMARE) },
  [MonsterKind.SHADOW]:    { hp: 70, speed: 2.6, sprite: monsterSpr(MonsterKind.SHADOW) },
  [MonsterKind.REBAR]:     { hp: 130, speed: 1.15, sprite: monsterSpr(MonsterKind.REBAR) },
  [MonsterKind.MATKA]:     { hp: 340, speed: 0.45, sprite: monsterSpr(MonsterKind.MATKA) },
};

export function resetHellPopulationState(): void {
  hellMonsterAccum = 0;
  hellCultistAccum = 0;
  hellLiquidatorAccum = 0;
}

export function generateHell(): { world: World; entities: Entity[]; spawnX: number; spawnY: number } {
  const world = new World();
  const entities: Entity[] = [];
  let nextId = 1;

  const field = buildIsingCaveField();
  paintHellTerrain(world, field);

  const spawnCell = findNearestFloor(world, W >> 1, W >> 1) ?? world.idx(W >> 1, W >> 1);
  const spawnX = (spawnCell % W) + 0.5;
  const spawnY = ((spawnCell / W) | 0) + 0.5;

  ensureConnectivity(world, spawnX, spawnY);
  paintOrganicTextures(world);

  placeLifts(world, 12, LiftDirection.UP);
  generateZones(world);
  retuneHellZones(world);
  for (const z of world.zones) z.level = calcZoneLevel(z.id, FloorLevel.HELL) + 2;

  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.FLOOR && Math.random() < 0.0035) {
      world.features[i] = Feature.LAMP;
    }
  }
  world.bakeLights();

  seedHellPopulation(world, entities, { v: nextId }, INITIAL_MONSTER_COUNT, INITIAL_CULTIST_COUNT, INITIAL_LIQUIDATOR_COUNT, 0);
  nextId = entities.reduce((mx, e) => Math.max(mx, e.id), nextId) + 1;

  seedLoot(world, entities, { v: nextId });

  return { world, entities, spawnX, spawnY };
}

export function updateHellPopulation(
  world: World, entities: Entity[], nextId: { v: number }, dt: number, samosborCount: number,
): void {
  hellMonsterAccum += dt;
  hellCultistAccum += dt;
  hellLiquidatorAccum += dt;

  if (hellMonsterAccum >= HELL_MONSTER_INTERVAL) {
    hellMonsterAccum -= HELL_MONSTER_INTERVAL;
    const deficit = HELL_MONSTER_SOFT_CAP - countLivingMonsters(entities);
    if (deficit > 0) {
      const batch = Math.min(16, Math.max(2, Math.ceil(deficit / 900)));
      for (let i = 0; i < batch; i++) {
        if (!spawnHellMonster(world, entities, nextId, samosborCount)) break;
      }
    }
  }

  if (hellCultistAccum >= HELL_CULTIST_INTERVAL) {
    hellCultistAccum -= HELL_CULTIST_INTERVAL;
    const deficit = HELL_CULTIST_SOFT_CAP - countFactionNPCs(entities, Faction.CULTIST);
    if (deficit > 0) {
      const batch = Math.min(6, Math.max(1, Math.ceil(deficit / 180)));
      for (let i = 0; i < batch; i++) {
        if (!spawnFactionAgent(world, entities, nextId, Faction.CULTIST)) break;
      }
    }
  }

  if (hellLiquidatorAccum >= HELL_LIQUIDATOR_INTERVAL) {
    hellLiquidatorAccum -= HELL_LIQUIDATOR_INTERVAL;
    const deficit = HELL_LIQUIDATOR_SOFT_CAP - countFactionNPCs(entities, Faction.LIQUIDATOR);
    if (deficit > 0) {
      const squad = Math.min(4, Math.max(2, Math.ceil(deficit / 25)));
      for (let i = 0; i < squad; i++) {
        if (!spawnFactionAgent(world, entities, nextId, Faction.LIQUIDATOR)) break;
      }
    }
  }
}

function buildIsingCaveField(): Uint8Array {
  const field = new Uint8Array(W * W);

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const coarse = hash2(x >> 5, y >> 5, 100) * 0.55;
      const medium = hash2(x >> 3, y >> 3, 101) * 0.3;
      const fine = hash2(x >> 1, y >> 1, 102) * 0.15;
      field[y * W + x] = coarse + medium + fine > 0.72 ? 1 : 0;
    }
  }

  for (let iter = 0; iter < 4; iter++) {
    for (let parity = 0; parity < 2; parity++) {
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          if (((x + y) & 1) !== parity) continue;
          const idx = y * W + x;
          const n4 = countNeighbors(field, x, y, false);
          const n8 = countNeighbors(field, x, y, true);
          const localField = (hash2(x, y, 110 + iter) - 0.5) * 0.85;
          const energy = (n4 - 2.75) * 1.75 + (n8 - 4.5) * 0.1 + localField;
          field[idx] = energy >= 0 ? 1 : 0;
        }
      }
    }
  }

  carveOrganicBranches(field);

  for (let pass = 0; pass < 2; pass++) {
    const next = field.slice();
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const n4 = countNeighbors(field, x, y, false);
        const n8 = countNeighbors(field, x, y, true);
        if (field[idx]) next[idx] = (n4 >= 1 && n8 >= 2) ? 1 : 0;
        else next[idx] = (n4 >= 3 && n8 >= 5) ? 1 : 0;
      }
    }
    field.set(next);
  }

  for (let pass = 0; pass < 2; pass++) {
    const next = field.slice();
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (!field[idx]) continue;
        const n4 = countNeighbors(field, x, y, false);
        const n8 = countNeighbors(field, x, y, true);
        if (n4 <= 1 || n8 <= 2) next[idx] = 0;
      }
    }
    field.set(next);
  }

  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      if (dx * dx + dy * dy > 25) continue;
      field[((W >> 1) + dy) * W + ((W >> 1) + dx)] = 1;
    }
  }

  return field;
}

function carveOrganicBranches(field: Uint8Array): void {
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const walkers = 210;

  for (let i = 0; i < walkers; i++) {
    let x = rng(0, W - 1);
    let y = rng(0, W - 1);
    let dir = rng(0, dirs.length - 1);
    const len = rng(70, 240);
    let width = 1;
    let fatTimer = 0;

    for (let step = 0; step < len; step++) {
      if (fatTimer <= 0) {
        const swell = hash2(x + step, y - step, 120 + i);
        if (swell > 0.985) {
          width = 3;
          fatTimer = rng(6, 18);
        } else if (swell > 0.9) {
          width = 2;
          fatTimer = rng(8, 28);
        } else {
          width = 1;
        }
      } else {
        fatTimer--;
      }

      carveBubble(field, x, y, width);

      if (hash2(x + step * 3, y - step, 121) > 0.83) {
        dir = (dir + (hash2(x - step, y + step * 2, 122) > 0.5 ? 1 : 3)) & 3;
      }
      if (hash2(x + i, y + step, 123) > 0.965) {
        const branchDir = (dir + (hash2(x + step, y + i, 124) > 0.5 ? 1 : 3)) & 3;
        carveBranch(field, x, y, branchDir, rng(18, 72));
      }

      x = wrapCoord(x + dirs[dir][0]);
      y = wrapCoord(y + dirs[dir][1]);
    }
  }
}

function carveBranch(field: Uint8Array, startX: number, startY: number, dir: number, len: number): void {
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let x = startX;
  let y = startY;
  for (let step = 0; step < len; step++) {
    const widen = hash2(x + step, y - step, 126) > 0.96 ? 2 : 1;
    carveBubble(field, x, y, widen);
    if (hash2(x - step, y + step, 127) > 0.88) {
      dir = (dir + (hash2(x, y, 128) > 0.5 ? 1 : 3)) & 3;
    }
    x = wrapCoord(x + dirs[dir][0]);
    y = wrapCoord(y + dirs[dir][1]);
  }
}

function carveBubble(field: Uint8Array, x: number, y: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 1) continue;
      field[wrapCoord(y + dy) * W + wrapCoord(x + dx)] = 1;
    }
  }
}

function countNeighbors(field: Uint8Array, x: number, y: number, diagonals: boolean): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (!diagonals && dx !== 0 && dy !== 0) continue;
      count += field[wrapCoord(y + dy) * W + wrapCoord(x + dx)] ? 1 : 0;
    }
  }
  return count;
}

function paintHellTerrain(world: World, field: Uint8Array): void {
  for (let i = 0; i < W * W; i++) {
    if (field[i]) {
      world.cells[i] = Cell.FLOOR;
    } else {
      world.cells[i] = Cell.WALL;
    }
  }
  paintOrganicTextures(world);
}

function paintOrganicTextures(world: World): void {
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (world.cells[i] === Cell.FLOOR) {
        world.floorTex[i] = pickHellFloorTex(x, y);
        world.wallTex[i] = 0;
      } else if (world.cells[i] === Cell.WALL) {
        world.wallTex[i] = pickHellWallTex(x, y);
        world.floorTex[i] = 0;
      }
    }
  }
}

function pickHellWallTex(x: number, y: number): Tex {
  const gut = hash2(x >> 2, y >> 2, 130) * 0.65 + hash2(x >> 4, y >> 4, 131) * 0.35;
  return gut > 0.6 ? Tex.GUT : Tex.MEAT;
}

function pickHellFloorTex(x: number, y: number): Tex {
  const gut = hash2(x >> 1, y >> 1, 132) * 0.55 + hash2(x >> 3, y >> 3, 133) * 0.45;
  return gut > 0.67 ? Tex.F_GUT : Tex.F_MEAT;
}

function findNearestFloor(world: World, x: number, y: number): number | null {
  for (let r = 0; r < 64; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = wrapCoord(x + dx);
        const cy = wrapCoord(y + dy);
        const idx = cy * W + cx;
        if (world.cells[idx] === Cell.FLOOR) return idx;
      }
    }
  }
  return null;
}

function retuneHellZones(world: World): void {
  for (const zone of world.zones) {
    const roll = hash2(zone.cx, zone.cy, 140);
    if (roll < 0.58) zone.faction = ZoneFaction.CULTIST;
    else if (roll < 0.9) zone.faction = ZoneFaction.LIQUIDATOR;
    else zone.faction = ZoneFaction.WILD;
    zone.hqRoomId = -1;
  }
}

function seedHellPopulation(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  monsters: number,
  cultists: number,
  liquidators: number,
  samosborCount: number,
): void {
  for (let i = 0; i < monsters; i++) spawnHellMonster(world, entities, nextId, samosborCount);
  for (let i = 0; i < cultists; i++) spawnFactionAgent(world, entities, nextId, Faction.CULTIST);
  for (let i = 0; i < liquidators; i++) spawnFactionAgent(world, entities, nextId, Faction.LIQUIDATOR);
}

function seedLoot(world: World, entities: Entity[], nextId: { v: number }): void {
  const drops = ['canned', 'bandage', 'pills', 'pipe', 'knife', 'water', 'ammo_9mm', 'ammo_nails', 'rebar', 'antidep',
    'ammo_belt', 'ammo_energy', 'ammo_fuel', 'grenade'];
  for (let i = 0; i < 280; i++) {
    const cell = randomFloorCell(world);
    if (cell < 0) continue;
    entities.push({
      id: nextId.v++,
      type: EntityType.ITEM_DROP,
      x: (cell % W) + 0.5,
      y: ((cell / W) | 0) + 0.5,
      angle: 0,
      pitch: 0,
      alive: true,
      speed: 0,
      sprite: 16,
      inventory: [{ defId: pick(drops), count: rng(1, 2) }],
    });
  }
}

function spawnHellMonster(world: World, entities: Entity[], nextId: { v: number }, samosborCount: number): boolean {
  const cell = randomFloorCell(world);
  if (cell < 0) return false;
  const x = (cell % W) + 0.5;
  const y = ((cell / W) | 0) + 0.5;
  entities.push(createHellMonster(world, nextId, pickHellMonsterKind(samosborCount), x, y));
  return true;
}

function spawnFactionAgent(world: World, entities: Entity[], nextId: { v: number }, faction: SpawnFaction): boolean {
  const cell = pickFactionSpawnCell(world, faction);
  if (cell < 0) return false;
  entities.push(faction === Faction.CULTIST
    ? createHellCultist(world, nextId, cell)
    : createHellLiquidator(world, nextId, cell));
  return true;
}

function createHellMonster(world: World, nextId: { v: number }, kind: MonsterKind, x: number, y: number): Entity {
  const def = HELL_MONSTER_BASE[kind] ?? HELL_MONSTER_BASE[MonsterKind.TVAR];
  const ci = world.idx(Math.floor(x), Math.floor(y));
  const zid = world.zoneMap[ci];
  const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 10) : 10;
  const bonus = kind === MonsterKind.BETONNIK || kind === MonsterKind.MATKA ? 3 : 1;
  const rpg = randomRPG(zoneLevel + bonus);
  const hp = Math.round(scaleMonsterHp(def.hp, zoneLevel + bonus) * (1 + rpg.str * 0.1));
  return {
    id: nextId.v++,
    type: EntityType.MONSTER,
    x,
    y,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, zoneLevel + Math.max(1, bonus - 1)),
    sprite: def.sprite,
    name: monsterName(),
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg,
  };
}

function createHellCultist(world: World, nextId: { v: number }, cell: number): Entity {
  const zid = world.zoneMap[cell];
  const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 10) : 10;
  const npcLevel = gaussianLevel(zoneLevel + 3, 2);
  const rpg = randomRPG(npcLevel);
  const maxHp = Math.round(getMaxHp(rpg) * 1.55);
  const nm = randomName(Faction.CULTIST);
  const psiId = pick(PSI_IDS);
  const hasPsi = Math.random() < 0.72;
  return {
    id: nextId.v++,
    type: EntityType.NPC,
    x: (cell % W) + 0.5,
    y: ((cell / W) | 0) + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: 1.45 + Math.random() * 0.35,
    sprite: Occupation.PILGRIM,
    name: nm.name,
    isFemale: nm.female,
    needs: freshNeeds(),
    hp: maxHp,
    maxHp,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: hasPsi ? [{ defId: psiId, count: 1 }] : [{ defId: 'rebar', count: 1 }],
    weapon: hasPsi ? psiId : 'rebar',
    familyId: -1,
    faction: Faction.CULTIST,
    occupation: Occupation.PILGRIM,
    isTraveler: true,
    questId: -1,
    rpg,
  };
}

function createHellLiquidator(world: World, nextId: { v: number }, cell: number): Entity {
  const zid = world.zoneMap[cell];
  const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 10) : 10;
  const npcLevel = gaussianLevel(zoneLevel + 4, 2);
  const rpg = randomRPG(npcLevel);
  const maxHp = Math.round(getMaxHp(rpg) * 1.75);
  const nm = randomName(Faction.LIQUIDATOR);
  const roll = Math.random();
  let weapon = 'rebar';
  let inventory = [{ defId: 'rebar', count: 1 }];
  if (roll < 0.25) {
    weapon = 'makarov';
    inventory = [{ defId: 'makarov', count: 1 }, { defId: 'ammo_9mm', count: 24 }];
  } else if (roll < 0.40) {
    weapon = 'shotgun';
    inventory = [{ defId: 'shotgun', count: 1 }, { defId: 'ammo_shells', count: 10 }];
  } else if (roll < 0.55) {
    weapon = 'nailgun';
    inventory = [{ defId: 'nailgun', count: 1 }, { defId: 'ammo_nails', count: 30 }];
  } else if (roll < 0.65) {
    weapon = 'ppsh';
    inventory = [{ defId: 'ppsh', count: 1 }, { defId: 'ammo_9mm', count: 60 }];
  } else if (roll < 0.75) {
    weapon = 'machinegun';
    inventory = [{ defId: 'machinegun', count: 1 }, { defId: 'ammo_belt', count: 100 }];
  } else if (roll < 0.82) {
    weapon = 'plasma';
    inventory = [{ defId: 'plasma', count: 1 }, { defId: 'ammo_energy', count: 20 }];
  } else if (roll < 0.87) {
    weapon = 'gauss';
    inventory = [{ defId: 'gauss', count: 1 }, { defId: 'ammo_energy', count: 10 }];
  }
  return {
    id: nextId.v++,
    type: EntityType.NPC,
    x: (cell % W) + 0.5,
    y: ((cell / W) | 0) + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: 1.35 + Math.random() * 0.25,
    sprite: Occupation.HUNTER,
    name: nm.name,
    isFemale: nm.female,
    needs: freshNeeds(),
    hp: maxHp,
    maxHp,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory,
    weapon,
    familyId: -1,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    isTraveler: true,
    questId: -1,
    rpg,
  };
}

function pickHellMonsterKind(samosborCount: number): MonsterKind {
  const pool = [
    MonsterKind.TVAR, MonsterKind.TVAR,
    MonsterKind.POLZUN, MonsterKind.POLZUN,
    MonsterKind.ZOMBIE,
    MonsterKind.SHADOW, MonsterKind.SHADOW,
    MonsterKind.EYE,
    MonsterKind.NIGHTMARE, MonsterKind.NIGHTMARE,
    MonsterKind.REBAR,
    MonsterKind.BETONNIK,
  ];
  if (samosborCount >= 3 && Math.random() < 0.05) pool.push(MonsterKind.MATKA);
  return pick(pool);
}

function countLivingMonsters(entities: Entity[]): number {
  let count = 0;
  for (const entity of entities) {
    if (entity.alive && entity.type === EntityType.MONSTER) count++;
  }
  return count;
}

function countFactionNPCs(entities: Entity[], faction: Faction): number {
  let count = 0;
  for (const entity of entities) {
    if (entity.alive && entity.type === EntityType.NPC && entity.faction === faction) count++;
  }
  return count;
}

function randomFloorCell(world: World): number {
  for (let attempt = 0; attempt < 2048; attempt++) {
    const cell = rng(0, W * W - 1);
    if (world.cells[cell] === Cell.FLOOR) return cell;
  }
  return -1;
}

function pickFactionSpawnCell(world: World, faction: SpawnFaction): number {
  const target = faction === Faction.CULTIST ? ZoneFaction.CULTIST : ZoneFaction.LIQUIDATOR;
  for (let attempt = 0; attempt < 768; attempt++) {
    const zone = world.zones[rng(0, world.zones.length - 1)];
    if (!zone || zone.faction !== target) continue;
    for (let inner = 0; inner < 48; inner++) {
      const cell = world.idx(zone.cx + rng(-44, 44), zone.cy + rng(-44, 44));
      if (world.cells[cell] === Cell.FLOOR) return cell;
    }
  }
  return randomFloorCell(world);
}

function hash2(x: number, y: number, seed: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
  n = Math.imul(n ^ (n >> 13), 1103515245);
  n ^= n >> 16;
  return (n & 0x7fffffff) / 0x7fffffff;
}

function wrapCoord(v: number): number {
  return ((v % W) + W) % W;
}
