/* ── САМОСБОР — the maze restructures itself ─────────────────── */
/*   Apartments (жилые) are INVARIANT. Everything else is        */
/*   destroyed and regenerated. Hide in жилая or die.            */

import {
  W, Cell, DoorState, ZoneFaction,
  type Entity, type GameState,
  EntityType, AIGoal, MonsterKind,
} from '../core/types';
import { World } from '../core/world';
import { ITEMS, NOTES, MONSTERS } from '../data/catalog';
import { forceHide } from './ai';
import { playSamosborAlarm } from './audio';
import { reassignQuestGivers } from './quests';
import { regrowMaze } from '../gen/living';
import { rng, pick, weightedPick } from '../gen/shared';

const SAMOSBOR_INTERVAL = 180;     // seconds between samosbors
const SAMOSBOR_DUR_MIN = 12;      // min duration (0.2 game hours = 12 real sec)
const SAMOSBOR_DUR_MAX = 90;      // max duration (1.5 game hours = 90 real sec)
const MONSTERS_PER_SAMOSBOR = 6;
const FOG_SPREAD_INTERVAL = 0.15; // seconds between fog spread ticks
const FOG_SPAWN_INTERVAL  = 2.0;  // seconds between monster spawns in fog

/* ── Update samosbor timer and trigger ────────────────────────── */
export function updateSamosbor(
  world: World, entities: Entity[], state: GameState, dt: number, nextId: { v: number },
): void {
  if (state.gameOver) return;

  state.samosborTimer -= dt;

  if (!state.samosborActive && state.samosborTimer <= 0) {
    // ── START samosbor: seal + capture zone + spawn mobs ──
    state.samosborActive = true;
    state.samosborTimer = SAMOSBOR_DUR_MIN + Math.random() * (SAMOSBOR_DUR_MAX - SAMOSBOR_DUR_MIN);
    state.samosborCount++;
    state.fogSpreadTimer = 0;
    state.msgs.push({ text: '⚠ САМОСБОР НАЧАЛСЯ ⚠', time: state.time, color: '#f44' });
    playSamosborAlarm();

    // NPCs hide (citizens/scientists only — handled by forceHide)
    forceHide(entities);

    // Seal apartment living rooms
    sealApartments(world, entities);

    // Capture a zone with фиолетовый туман
    captureZone(world, state);

    // Spawn monsters in corridors
    spawnMonsters(world, entities, nextId, state.samosborCount);
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
    // ── END samosbor: unseal, then rebuild world ──
    state.samosborActive = false;
    state.samosborTimer = SAMOSBOR_INTERVAL + Math.random() * 60;
    state.msgs.push({ text: 'Самосбор закончился... мир перестраивается.', time: state.time, color: '#aa4' });

    // Unseal apartment doors
    unsealApartments(world);

    // Re-roll which NPCs can give quests (10%)
    reassignQuestGivers(entities);

    // Now rebuild: wipe volatile maze and regenerate
    rebuildWorld(world, entities, nextId, state.samosborCount);
  }
}

/* ── Seal all apartment clusters (hermetic doors) ─────────────── */
function sealApartments(world: World, _entities: Entity[]): void {
  const aptCount = world.apartmentRoomCount;
  for (let i = 0; i < aptCount; i++) {
    const room = world.rooms[i];
    if (!room) continue;
    // Seal entire apartment cluster — all rooms in same apartmentId
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
function rebuildWorld(world: World, entities: Entity[], nextId: { v: number }, _samosborCount: number): void {
  const aptCount = world.apartmentRoomCount;

  // Kill all monsters, projectiles and remove item drops outside apartments
  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    if (e.type === EntityType.MONSTER || e.type === EntityType.PROJECTILE) {
      entities.splice(i, 1);
      continue;
    }
    if (e.type === EntityType.ITEM_DROP) {
      // Keep items inside apartment rooms, remove the rest
      const rid = world.roomMap[world.idx(Math.floor(e.x), Math.floor(e.y))];
      if (rid < 0 || rid >= aptCount) {
        entities.splice(i, 1);
      }
    }
  }

  // Regenerate the entire volatile maze
  regrowMaze(world);

  // Spawn new items in volatile rooms
  for (let ri = aptCount; ri < world.rooms.length; ri++) {
    const room = world.rooms[ri];
    if (!room || room.w < 3 || room.h < 3) continue;
    const itemDefs = Object.values(ITEMS).filter(it => it.spawnRooms.includes(room.type) && it.spawnW > 0);
    const numItems = rng(0, 2);
    for (let n = 0; n < numItems; n++) {
      const def = weightedPick(itemDefs);
      if (!def) continue;
      const ix = room.x + rng(1, Math.max(1, room.w - 2));
      const iy = room.y + rng(1, Math.max(1, room.h - 2));
      entities.push({
        id: nextId.v++, type: EntityType.ITEM_DROP,
        x: ix + 0.5, y: iy + 0.5, angle: 0, pitch: 0, alive: true, speed: 0, sprite: 16,
        inventory: [{ defId: def.id, count: rng(1, def.stack), data: def.id === 'note' ? pick(NOTES) : undefined }],
      });
    }
  }
}

/* ── Spawn monsters in corridors ──────────────────────────────── */
function spawnMonsters(world: World, entities: Entity[], nextId: { v: number }, samosborCount: number): void {
  const kinds = [MonsterKind.SBORKA, MonsterKind.TVAR, MonsterKind.POLZUN];
  if (samosborCount >= 3) kinds.push(MonsterKind.BETONNIK);

  const corridorCells: number[] = [];
  for (let i = 0; i < 5000; i++) {
    const ci = Math.floor(Math.random() * W * W);
    if (world.cells[ci] === Cell.FLOOR && world.roomMap[ci] < 0) {
      corridorCells.push(ci);
    }
  }

  const count = MONSTERS_PER_SAMOSBOR + Math.floor(samosborCount * 1.5);
  for (let i = 0; i < count && corridorCells.length > 0; i++) {
    const ci = corridorCells.splice(Math.floor(Math.random() * corridorCells.length), 1)[0];
    const mx = (ci % W) + 0.5;
    const my = Math.floor(ci / W) + 0.5;

    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const def = MONSTERS[kind];
    const monster: Entity = {
      id: nextId.v++,
      type: EntityType.MONSTER,
      x: mx, y: my,
      angle: Math.random() * Math.PI * 2,
      pitch: 0,
      alive: true,
      speed: def.speed,
      sprite: def.sprite,
      name: def.name,
      hp: def.hp, maxHp: def.hp,
      monsterKind: kind,
      attackCd: def.attackRate,
      ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    };
    entities.push(monster);
  }
}

/* ── Capture a random non-samosbor zone with фиолетовый туман ── */
function captureZone(world: World, state: GameState): void {
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

  const zoneNames = ['', '', '', ''];
  zoneNames[ZoneFaction.CITIZEN] = 'гражданской';
  zoneNames[ZoneFaction.LIQUIDATOR] = 'ликвидаторской';
  zoneNames[ZoneFaction.CULTIST] = 'культистской';
  state.msgs.push({
    text: `☠ Зона ${zone.id} захвачена самосбором! Фиолетовый туман распространяется...`,
    time: state.time, color: '#a3f',
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

/* ── Spawn monsters in fogged areas during samosbor ──────────── */
let fogSpawnAccum = 0;
function spawnFogMonsters(world: World, entities: Entity[], nextId: { v: number }, samosborCount: number): void {
  fogSpawnAccum += FOG_SPREAD_INTERVAL;
  if (fogSpawnAccum < FOG_SPAWN_INTERVAL) return;
  fogSpawnAccum -= FOG_SPAWN_INTERVAL;

  // Count existing monsters to limit density
  const monsterCount = entities.filter(e => e.type === EntityType.MONSTER && e.alive).length;
  if (monsterCount > 30 + samosborCount * 5) return;

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
  const kinds = [MonsterKind.SBORKA, MonsterKind.TVAR, MonsterKind.POLZUN];
  if (samosborCount >= 3) kinds.push(MonsterKind.BETONNIK);
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const def = MONSTERS[kind];

  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: (ci % W) + 0.5, y: Math.floor(ci / W) + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    name: def.name,
    hp: def.hp, maxHp: def.hp,
    monsterKind: kind,
    attackCd: def.attackRate,
    ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  });
}
