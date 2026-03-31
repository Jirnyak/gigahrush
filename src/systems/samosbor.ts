/* ── САМОСБОР — the maze restructures itself ─────────────────── */
/*   Apartments (жилые) are INVARIANT. Everything else is        */
/*   destroyed and regenerated. Hide in жилая or die.            */

import {
  W, Cell, DoorState, ZoneFaction, FloorLevel,
  type Entity, type GameState, type Msg,
  EntityType, AIGoal, MonsterKind,
} from '../core/types';
import { World } from '../core/world';
import { ITEMS, NOTES, monsterName } from '../data/catalog';
import { spawnCount } from '../data/items';
import { MONSTERS } from '../entities/monster';
import { forceHide } from './ai';
import { playSamosborAlarm } from './audio';
import { reassignQuestGivers } from './quests';
import { regrowMaze } from '../gen/living';
import { generateMaintenance } from '../gen/maintenance';
import { generateHell } from '../gen/hell';
import { rng, pick, weightedPick } from '../gen/shared';
import { scaleMonsterHp, scaleMonsterSpeed, randomRPG } from './rpg';

// Floor-dependent samosbor intervals (seconds)
function samosborInterval(floor: FloorLevel): number {
  switch (floor) {
    case FloorLevel.LIVING:      return 300 + Math.random() * 300;  // 5-10 min
    case FloorLevel.MAINTENANCE: return 180 + Math.random() * 240;  // 3-7 min
    case FloorLevel.HELL:        return 60  + Math.random() * 240;  // 1-5 min
    default:                     return 300 + Math.random() * 300;
  }
}
const SAMOSBOR_DUR_MIN = 12;      // min duration (0.2 game hours = 12 real sec)
const SAMOSBOR_DUR_MAX = 90;      // max duration (1.5 game hours = 90 real sec)
const MONSTERS_PER_SAMOSBOR = 6;
const FOG_SPREAD_INTERVAL = 0.15; // seconds between fog spread ticks
const FOG_SPAWN_INTERVAL  = 1.0;  // seconds between monster spawns in fog (~100 at max 90s samosbor)
const MONSTER_CAP = 10_000;       // soft cap for auto-spawned monsters on the map

/* ── Update samosbor timer and trigger ────────────────────────── */
export function updateSamosbor(
  world: World, entities: Entity[], state: GameState, dt: number, nextId: { v: number },
): boolean {
  if (state.gameOver) return false;

  state.samosborTimer -= dt;

  if (!state.samosborActive && state.samosborTimer <= 0) {
    // ── START samosbor: seal + capture zone + spawn mobs ──
    state.samosborActive = true;
    state.samosborTimer = SAMOSBOR_DUR_MIN + Math.random() * (SAMOSBOR_DUR_MAX - SAMOSBOR_DUR_MIN);
    state.samosborCount++;
    state.fogSpreadTimer = 0;
    fogSpawnAccum = 0;
    state.msgs.push({ text: '⚠ САМОСБОР НАЧАЛСЯ ⚠', time: state.time, color: '#f44' });
    playSamosborAlarm();

    // NPCs hide (citizens/scientists only — handled by forceHide)
    forceHide(entities, state.msgs, state.time);

    // Seal apartment living rooms
    sealApartments(world, entities);

    // Capture a zone with фиолетовый туман + spawn fog boss
    captureZone(world, entities, nextId, state);

    // Spawn monsters in corridors
    spawnMonsters(world, entities, nextId, state.samosborCount);

    // Spawn ~10 monsters at random map locations (scaled by zone level)
    spawnRandomMapMonsters(world, entities, nextId, state.samosborCount);
  }

  // ── Fog spread tick (during active samosbor) ──
  if (state.samosborActive) {
    state.fogSpreadTimer -= dt;
    if (state.fogSpreadTimer <= 0) {
      state.fogSpreadTimer = FOG_SPREAD_INTERVAL;
      spreadFog(world);
      // Spawn monsters in fogged areas periodically
      spawnFogMonsters(world, entities, nextId, state.samosborCount);
    }
  }

  if (state.samosborActive && state.samosborTimer <= 0) {
    // ── END samosbor: unseal, mark for rebuild ──
    state.samosborActive = false;
    state.samosborTimer = samosborInterval(state.currentFloor);
    state.msgs.push({ text: 'Самосбор закончился... мир перестраивается.', time: state.time, color: '#aa4' });

    // Unseal apartment doors
    unsealApartments(world);

    // Re-roll which NPCs can give quests (10%)
    reassignQuestGivers(entities);

    return true; // signal: heavy rebuild needed
  }

  return false;
}

/* ── Seal all apartment clusters (hermetic doors) ─────────────── */
function sealApartments(world: World, entities: Entity[]): void {
  // Build set of apartmentIds that have alive resident NPCs
  const occupiedApts = new Set<number>();
  for (const e of entities) {
    if (e.type === EntityType.NPC && e.alive && e.familyId !== undefined && e.familyId >= 0) {
      occupiedApts.add(e.familyId);
    }
  }

  const aptCount = world.apartmentRoomCount;
  for (let i = 0; i < aptCount; i++) {
    const room = world.rooms[i];
    if (!room) continue;
    // Only seal apartments that have living residents
    if (room.apartmentId < 0 || !occupiedApts.has(room.apartmentId)) continue;
    room.sealed = true;
    for (const di of room.doors) {
      const door = world.doors.get(di);
      if (door) door.state = DoorState.HERMETIC_CLOSED;
    }
  }
}

/* ── Unseal all apartment rooms ───────────────────────────────── */
function unsealApartments(world: World): void {
  const aptCount = world.apartmentRoomCount;
  for (let i = 0; i < aptCount; i++) {
    const room = world.rooms[i];
    if (!room || !room.sealed) continue;
    room.sealed = false;
    for (const di of room.doors) {
      const door = world.doors.get(di);
      if (door && door.state === DoorState.HERMETIC_CLOSED) {
        door.state = DoorState.HERMETIC_OPEN;
      }
    }
  }
}

/* ── Full world rebuild (except apartments) — runs AFTER samosbor ends ── */
const ITEM_SOFT_CAP = 10_000;  // soft cap: only spawn new items up to this count

function countItemDrops(entities: Entity[]): number {
  let n = 0;
  for (const e of entities) if (e.type === EntityType.ITEM_DROP && e.alive) n++;
  return n;
}

export function rebuildWorld(
  world: World, entities: Entity[], nextId: { v: number }, _samosborCount: number,
  floor: FloorLevel = FloorLevel.LIVING,
): void {
  if (floor === FloorLevel.MAINTENANCE || floor === FloorLevel.HELL) {
    // Non-living floors: full regeneration, preserve alive monsters + NPCs + player
    const kept: Entity[] = [];
    for (const e of entities) {
      if (!e.alive) continue;
      if (e.type === EntityType.MONSTER || e.type === EntityType.NPC || e.type === EntityType.PLAYER) {
        kept.push(e);
      }
    }
    entities.length = 0;
    const gen = floor === FloorLevel.MAINTENANCE ? generateMaintenance() : generateHell();
    // Overwrite world arrays in-place
    world.cells.set(gen.world.cells);
    world.wallTex.set(gen.world.wallTex);
    world.floorTex.set(gen.world.floorTex);
    world.roomMap.set(gen.world.roomMap);
    world.features.set(gen.world.features);
    world.light.set(gen.world.light);
    world.zoneMap.set(gen.world.zoneMap);
    world.aptMask.fill(0);
    world.hermoWall.fill(0);
    world.factionControl.set(gen.world.factionControl);
    world.fog.fill(0);
    world.rooms = gen.world.rooms;
    world.zones = gen.world.zones;
    world.doors = gen.world.doors;
    world.liftDir.set(gen.world.liftDir);
    world.surfaceMap = gen.world.surfaceMap;
    world.slideCells = gen.world.slideCells;
    world.apartmentRoomCount = 0;
    // Restore kept entities + merge new entities from generator
    for (const e of kept) entities.push(e);
    for (const e of gen.entities) {
      e.id = nextId.v++;
      entities.push(e);
    }
    // Relocate kept entities that ended up in walls
    for (const e of kept) {
      const ci = world.idx(Math.floor(e.x), Math.floor(e.y));
      if (world.cells[ci] !== Cell.FLOOR) {
        // Find nearest floor cell
        for (let r = 1; r < 20; r++) {
          let found = false;
          for (let dy = -r; dy <= r && !found; dy++) {
            for (let dx = -r; dx <= r && !found; dx++) {
              const ni = world.idx(world.wrap(Math.floor(e.x) + dx), world.wrap(Math.floor(e.y) + dy));
              if (world.cells[ni] === Cell.FLOOR) {
                e.x = world.wrap(Math.floor(e.x) + dx) + 0.5;
                e.y = world.wrap(Math.floor(e.y) + dy) + 0.5;
                found = true;
              }
            }
          }
          if (found) break;
        }
      }
    }
    return;
  }

  // Living floor: only rebuild volatile maze, keep apartments
  const aptCount = world.apartmentRoomCount;

  // Kill projectiles and remove item drops outside apartments
  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    if (e.type === EntityType.PROJECTILE) {
      entities.splice(i, 1);
      continue;
    }
    if (e.type === EntityType.ITEM_DROP) {
      const rid = world.roomMap[world.idx(Math.floor(e.x), Math.floor(e.y))];
      if (rid < 0 || rid >= aptCount) {
        entities.splice(i, 1);
      }
    }
  }

  // Regenerate the entire volatile maze
  regrowMaze(world);

  // Spawn new items in volatile rooms (zone-level dependent, soft cap 10k)
  let itemCount = countItemDrops(entities);
  for (let ri = aptCount; ri < world.rooms.length; ri++) {
    if (itemCount >= ITEM_SOFT_CAP) break;
    const room = world.rooms[ri];
    if (!room || room.w < 3 || room.h < 3) continue;
    const ci = world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2));
    const zid = world.zoneMap[ci];
    const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 1) : 1;
    const valueThreshold = zoneLevel * 15 + 10;
    const adjusted = Object.values(ITEMS)
      .filter(it => it.spawnRooms.includes(room.type) && it.spawnW > 0)
      .map(it => ({ ...it, spawnW: it.spawnW * Math.min(1, (valueThreshold + 5) / Math.max(1, it.value)) }))
      .filter(it => it.spawnW >= 0.05);
    const numItems = rng(0, 1);
    for (let n = 0; n < numItems; n++) {
      if (itemCount >= ITEM_SOFT_CAP) break;
      const def = weightedPick(adjusted);
      if (!def) continue;
      const ix = room.x + rng(1, Math.max(1, room.w - 2));
      const iy = room.y + rng(1, Math.max(1, room.h - 2));
      entities.push({
        id: nextId.v++, type: EntityType.ITEM_DROP,
        x: ix + 0.5, y: iy + 0.5, angle: 0, pitch: 0, alive: true, speed: 0, sprite: 16,
        inventory: [{ defId: def.id, count: rng(1, spawnCount(def)), data: def.id === 'note' ? pick(NOTES) : undefined }],
      });
      itemCount++;
    }
  }
}

/* ── Shared helpers for monster creation ───────────────────────── */
function getKindsForWave(samosborCount: number): MonsterKind[] {
  const kinds = [MonsterKind.SBORKA, MonsterKind.TVAR, MonsterKind.POLZUN];
  if (samosborCount >= 2) kinds.push(MonsterKind.ZOMBIE, MonsterKind.SHADOW);
  if (samosborCount >= 3) kinds.push(MonsterKind.BETONNIK, MonsterKind.EYE, MonsterKind.NIGHTMARE, MonsterKind.IDOL);
  if (samosborCount >= 5) kinds.push(MonsterKind.REBAR);
  return kinds;
}

function createMonster(world: World, nextId: { v: number }, kind: MonsterKind, x: number, y: number): Entity {
  const def = MONSTERS[kind];
  const ci = world.idx(Math.floor(x), Math.floor(y));
  const zid = world.zoneMap[ci];
  const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 1) : 1;
  const rpg = randomRPG(zoneLevel);
  const hpBase = scaleMonsterHp(def.hp, zoneLevel);
  const hpFinal = Math.round(hpBase * (1 + 0.1 * rpg.str));
  return {
    id: nextId.v++,
    type: EntityType.MONSTER,
    x, y,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, zoneLevel),
    sprite: def.sprite,
    name: monsterName(),
    hp: hpFinal,
    maxHp: hpFinal,
    monsterKind: kind,
    attackCd: def.attackRate,
    ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg,
  };
}

/* ── Count alive monsters ─────────────────────────────────────── */
function countMonsters(entities: Entity[]): number {
  let n = 0;
  for (const e of entities) if (e.type === EntityType.MONSTER && e.alive) n++;
  return n;
}

/* ── Spawn monsters in corridors ──────────────────────────────── */
function spawnMonsters(world: World, entities: Entity[], nextId: { v: number }, samosborCount: number): void {
  let mc = countMonsters(entities);
  if (mc >= MONSTER_CAP) return;

  const kinds = getKindsForWave(samosborCount);

  const corridorCells: number[] = [];
  for (let i = 0; i < 5000; i++) {
    const ci = Math.floor(Math.random() * W * W);
    if (world.cells[ci] === Cell.FLOOR && world.roomMap[ci] < 0) {
      corridorCells.push(ci);
    }
  }

  const count = MONSTERS_PER_SAMOSBOR + Math.floor(samosborCount * 1.5);
  for (let i = 0; i < count && corridorCells.length > 0; i++) {
    if (mc >= MONSTER_CAP) break;
    const ci = corridorCells.splice(Math.floor(Math.random() * corridorCells.length), 1)[0];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    entities.push(createMonster(world, nextId, kind, (ci % W) + 0.5, Math.floor(ci / W) + 0.5));
    mc++;
  }
}

/* ── Spawn ~10 monsters at random map locations ──────────────── */
function spawnRandomMapMonsters(world: World, entities: Entity[], nextId: { v: number }, samosborCount: number): void {
  let mc = countMonsters(entities);
  if (mc >= MONSTER_CAP) return;

  const kinds = getKindsForWave(samosborCount);
  const target = 10;
  let spawned = 0;

  for (let attempt = 0; attempt < 5000 && spawned < target; attempt++) {
    const ci = Math.floor(Math.random() * W * W);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    // Skip apartment rooms
    const rid = world.roomMap[ci];
    if (rid >= 0 && rid < world.apartmentRoomCount) continue;

    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    entities.push(createMonster(world, nextId, kind, (ci % W) + 0.5, Math.floor(ci / W) + 0.5));
    spawned++;
    mc++;
    if (mc >= MONSTER_CAP) break;
  }
}

/* ── Capture a random non-samosbor zone with фиолетовый туман ── */
function captureZone(world: World, entities: Entity[], nextId: { v: number }, state: GameState): void {
  // Pick a random non-SAMOSBOR zone
  const candidates = world.zones.filter(z => z.faction !== ZoneFaction.SAMOSBOR);
  if (candidates.length === 0) return;

  const zone = candidates[Math.floor(Math.random() * candidates.length)];
  zone.faction = ZoneFaction.SAMOSBOR;
  zone.fogged = true;

  // Seed fog at zone center
  const ci = world.idx(zone.cx, zone.cy);
  if (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.DOOR) {
    world.fog[ci] = 255;
  }
  // Seed fog in a small radius around center
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      if (dx * dx + dy * dy > 25) continue;
      const fi = world.idx(world.wrap(zone.cx + dx), world.wrap(zone.cy + dy));
      if (world.cells[fi] === Cell.FLOOR) {
        world.fog[fi] = 200;
      }
    }
  }

  // Spawn fog boss at zone center (10% chance Матка, otherwise random boss)
  const isMatka = Math.random() < 0.1;
  const bossKind = isMatka ? MonsterKind.MATKA :
    [MonsterKind.BETONNIK, MonsterKind.REBAR, MonsterKind.NIGHTMARE][Math.floor(Math.random() * 3)];
  const bossDef = MONSTERS[bossKind];
  const zoneLevel = zone.level ?? 1;
  const rpg = randomRPG(zoneLevel + 3); // boss is stronger
  const hpBase = scaleMonsterHp(bossDef.hp, zoneLevel + 3);
  const hpFinal = Math.round(hpBase * (1 + 0.1 * rpg.str) * 2); // 2x HP for boss
  // Find a walkable cell near zone center for boss spawn
  let bx = zone.cx, by = zone.cy;
  for (let r = 0; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const bi = world.idx(world.wrap(zone.cx + dx), world.wrap(zone.cy + dy));
        if (world.cells[bi] === Cell.FLOOR) { bx = world.wrap(zone.cx + dx); by = world.wrap(zone.cy + dy); r = 99; break; }
      }
      if (r >= 99) break;
    }
  }
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: bx + 0.5, y: by + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(bossDef.speed, zoneLevel),
    sprite: bossDef.sprite,
    spriteScale: 1.5,
    name: '⚡ ' + monsterName(),
    hp: hpFinal,
    maxHp: hpFinal,
    monsterKind: bossKind,
    attackCd: bossDef.attackRate,
    ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg,
    isFogBoss: true,
    fogBossZone: zone.id,
  });

  const zoneNames = ['', '', '', ''];
  zoneNames[ZoneFaction.CITIZEN] = 'гражданской';
  zoneNames[ZoneFaction.LIQUIDATOR] = 'ликвидаторской';
  zoneNames[ZoneFaction.CULTIST] = 'культистской';
  state.msgs.push({
    text: `☠ Зона ${zone.id} захвачена самосбором! Фиолетовый туман распространяется...`,
    time: state.time, color: '#a3f',
  });
  state.msgs.push({
    text: `Босс тумана появился в зоне ${zone.id}! Убейте его чтобы остановить туман.`,
    time: state.time, color: '#f4a',
  });
}

/* ── Spread fog one tick — BFS-like expansion, blocked by doors ── */
function spreadFog(world: World): void {
  const dirs: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];

  // Collect fog frontier cells (cells with fog that have non-fogged walkable neighbors)
  const frontier: number[] = [];
  for (let i = 0; i < W * W; i++) {
    if (world.fog[i] < 50) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of dirs) {
      const ni = world.idx(x + dx, y + dy);
      if (world.fog[ni] > 0) continue;
      if (world.cells[ni] === Cell.DOOR) continue;  // doors block fog
      if (world.cells[ni] !== Cell.FLOOR) continue;
      frontier.push(ni);
    }
  }

  // Spread to a random subset of frontier cells (organic spread)
  for (const fi of frontier) {
    if (Math.random() < 0.3) {
      world.fog[fi] = 128 + Math.floor(Math.random() * 127);
    }
  }

  // Strengthen existing fog
  for (let i = 0; i < W * W; i++) {
    if (world.fog[i] > 0 && world.fog[i] < 255) {
      world.fog[i] = Math.min(255, world.fog[i] + 2);
    }
  }
}

/* ── Clear fog when fog boss is killed ────────────────────────── */
export function clearFogInZone(world: World, zoneId: number, msgs: Msg[], time: number): void {
  const zone = world.zones[zoneId];
  if (!zone) return;
  zone.fogged = false;
  // Clear all fog cells belonging to this zone
  for (let i = 0; i < W * W; i++) {
    if (world.zoneMap[i] === zoneId) {
      world.fog[i] = 0;
    }
  }
  msgs.push({
    text: `Туман в зоне ${zoneId} рассеялся! Босс повержен.`,
    time, color: '#4f4',
  });
}

/* ── Spawn monsters in fogged areas during samosbor ──────────── */
let fogSpawnAccum = 0;
function spawnFogMonsters(world: World, entities: Entity[], nextId: { v: number }, samosborCount: number): void {
  fogSpawnAccum += FOG_SPREAD_INTERVAL;
  if (fogSpawnAccum < FOG_SPAWN_INTERVAL) return;
  fogSpawnAccum -= FOG_SPAWN_INTERVAL;

  if (countMonsters(entities) >= MONSTER_CAP) return;

  // Find a random fogged floor cell
  const foggedCells: number[] = [];
  for (let attempt = 0; attempt < 500; attempt++) {
    const ci = Math.floor(Math.random() * W * W);
    if (world.fog[ci] > 100 && world.cells[ci] === Cell.FLOOR && world.roomMap[ci] < 0) {
      foggedCells.push(ci);
      if (foggedCells.length >= 3) break;
    }
  }
  if (foggedCells.length === 0) return;

  const ci = foggedCells[Math.floor(Math.random() * foggedCells.length)];
  const kinds = getKindsForWave(samosborCount);
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  entities.push(createMonster(world, nextId, kind, (ci % W) + 0.5, Math.floor(ci / W) + 0.5));
}
