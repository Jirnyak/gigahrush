import {
  AIGoal, Cell, EntityType, Feature, 
  MonsterKind, Tex, W, ZoneFaction,
  type Entity, type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { rng, irand } from '../../core/rand';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { calcZoneLevel, randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { entitySpawnSlots } from '../../systems/entity_limits';
import {
  carveCorridor,
  stampRoom,
} from '../shared';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { SPAWN_X, SPAWN_Y, LIVING_TUNNEL_TAG, HERALD_GATE_TAG, PodadRooms, ROOM_SPECS } from "./meta";
import { repaintRoom, markWallSnakeRoom, markSectionShiftRoom, paintCapillaryDisc, dropItems, roomCenter, carveFieldDisc, countNeighbors, hash32, wrapCoord } from "./geometry";

export function spawnPodadPlotNpcs(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  rooms: Pick<PodadRooms, 'contact' | 'threshold'>,
): void {
  spawnPlotNpc(world, rooms.contact, 'hell_contact', entities, nextId);
  spawnPlotNpc(world, rooms.threshold, 'herald_clue', entities, nextId);
}

export function buildPodadField(seed: number): Uint8Array {
  const field = new Uint8Array(W * W);

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const coarse = hash2(x >> 5, y >> 5, seed + 1) * 0.52;
      const medium = hash2(x >> 3, y >> 3, seed + 2) * 0.31;
      const fine = hash2(x >> 1, y >> 1, seed + 3) * 0.17;
      field[y * W + x] = coarse + medium + fine > 0.69 ? 1 : 0;
    }
  }

  for (let pass = 0; pass < 5; pass++) {
    const next = field.slice();
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const n4 = countNeighbors(field, x, y, false);
        const n8 = countNeighbors(field, x, y, true);
        const ci = y * W + x;
        next[ci] = field[ci]
          ? (n4 >= 1 && n8 >= 3 ? 1 : 0)
          : (n4 >= 3 || n8 >= 6 ? 1 : 0);
      }
    }
    field.set(next);
  }

  for (let i = 0; i < 180; i++) {
    let x = irand(0, W - 1);
    let y = irand(0, W - 1);
    let dir = irand(0, 3);
    const len = irand(48, 170);
    for (let step = 0; step < len; step++) {
      carveFieldDisc(field, x, y, step % 19 === 0 ? 3 : step % 7 === 0 ? 2 : 1);
      if (hash2(x + step, y - step, seed + 40 + i) > 0.83) dir = (dir + (rng() < 0.5 ? 1 : 3)) & 3;
      if (dir === 0) x = wrapCoord(x + 1);
      else if (dir === 1) x = wrapCoord(x - 1);
      else if (dir === 2) y = wrapCoord(y + 1);
      else y = wrapCoord(y - 1);
    }
  }

  carveFieldDisc(field, SPAWN_X, SPAWN_Y, 10);
  return field;
}

export function carvePodadSpines(world: World): void {
  const points = [
    { x: SPAWN_X, y: SPAWN_Y },
    { x: world.wrap(SPAWN_X + 118), y: world.wrap(SPAWN_Y - 28) },
    { x: world.wrap(SPAWN_X - 112), y: world.wrap(SPAWN_Y - 50) },
    { x: world.wrap(SPAWN_X - 72), y: world.wrap(SPAWN_Y + 108) },
    { x: world.wrap(SPAWN_X + 100), y: world.wrap(SPAWN_Y + 108) },
    { x: world.wrap(SPAWN_X + 16), y: world.wrap(SPAWN_Y + 180) },
  ];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    carveCorridor(world, a.x, a.y, b.x, b.y);
    carveCorridor(world, world.wrap(a.x + 2), world.wrap(a.y - 2), world.wrap(b.x + 2), world.wrap(b.y - 2));
  }
}

export function buildPodadRooms(world: World, seed: number): PodadRooms {
  const out = {} as PodadRooms;
  for (const spec of ROOM_SPECS) {
    const room = stampRoom(
      world,
      world.rooms.length,
      spec.type,
      world.wrap(SPAWN_X + spec.dx),
      world.wrap(SPAWN_Y + spec.dy),
      spec.w,
      spec.h,
      -1,
    );
    room.name = spec.key === 'threshold' ? `${spec.name} ${HERALD_GATE_TAG}` : spec.name;
    room.wallTex = spec.wallTex;
    room.floorTex = spec.floorTex;
    repaintRoom(world, room, spec.wallTex, spec.floorTex);
    out[spec.key] = room;
  }

  markLivingTunnelRoom(world, out.livingTunnel, seed);
  markWallSnakeRoom(world, out.wallSnake);
  markSectionShiftRoom(world, out.sectionShift);
  return out;
}

export function markLivingTunnelRoom(world: World, room: Room, seed: number): void {
  const x = world.wrap(room.x + (room.w >> 1));
  const y = world.wrap(room.y + (room.h >> 1));
  const rootSeed = hash32(seed ^ Math.imul(room.id + 11, 0x45d9f3b));
  const maxLen = 124;
  room.name = `${room.name} [living_tunnels] ${LIVING_TUNNEL_TAG}${x},${y},${rootSeed},${maxLen}]`;
  const ci = world.idx(x, y);
  world.features[ci] = Feature.APPARATUS;
  world.floorTex[ci] = Tex.F_GUT;
  world.fog[ci] = 42;
}

export function stampPodadCapillaryField(world: World, rooms: PodadRooms, seed: number): number {
  const marked = new Set<number>();
  const links: readonly [Room, Room, number, number][] = [
    [rooms.entry, rooms.contact, 1, 2],
    [rooms.contact, rooms.threshold, 1, 3],
    [rooms.entry, rooms.livingTunnel, 2, 5],
    [rooms.livingTunnel, rooms.wallSnake, 2, 7],
    [rooms.wallSnake, rooms.sectionShift, 2, 11],
    [rooms.sectionShift, rooms.threshold, 2, 13],
    [rooms.threshold, rooms.upperLift, 1, 17],
  ];
  for (const [a, b, radius, salt] of links) {
    paintCapillaryLink(world, roomCenter(a), roomCenter(b), radius, seed + salt * 997, marked);
  }
  return marked.size;
}

export function paintCapillaryLink(
  world: World,
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
  seed: number,
  marked: Set<number>,
): void {
  const dx = world.delta(a.x, b.x);
  const dy = world.delta(a.y, b.y);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const len = Math.max(1, Math.hypot(dx, dy));
  const px = -dy / len;
  const py = dx / len;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pulse = Math.sin(t * Math.PI);
    const jitter = (hash2(i, seed & 1023, seed) - 0.5) * 9 * pulse;
    const x = Math.round(a.x + dx * t + px * jitter);
    const y = Math.round(a.y + dy * t + py * jitter);
    paintCapillaryDisc(world, x, y, radius + (i % 13 === 0 ? 1 : 0), marked);
  }
}

export function tunePodadZones(world: World): void {
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, SPAWN_X, SPAWN_Y);
    zone.faction = d < 120 ? ZoneFaction.CULTIST : d < 260 ? ZoneFaction.SAMOSBOR : ZoneFaction.WILD;
    zone.level = calcZoneLevel(zone.cx, zone.cy, 180) + (d > 220 ? 5 : 3);
    zone.fogged = d > 180;
  }
  for (let i = 0; i < W * W; i++) {
    const zid = world.zoneMap[i];
    world.factionControl[i] = world.zones[zid]?.faction ?? ZoneFaction.WILD;
    if (world.cells[i] === Cell.FLOOR && world.zones[zid]?.fogged) world.fog[i] = Math.max(world.fog[i], 18);
  }
}

export function spawnPlotNpc(
  world: World,
  room: Room,
  plotNpcId: 'hell_contact' | 'herald_clue',
  entities: Entity[],
  nextId: { v: number },
): void {
  const x = world.wrap(room.x + (room.w >> 1));
  const y = world.wrap(room.y + (room.h >> 1));
  requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, x + 0.5, y + 0.5, { angle: Math.PI });
}

export function spawnPodadHeralds(world: World, entities: Entity[], nextId: { v: number }, spawnX: number, spawnY: number): void {
  const heraldDef = MONSTERS[MonsterKind.HERALD];
  if (!heraldDef) return;

  let slots = entitySpawnSlots(entities, EntityType.MONSTER, 3);
  const targets = [
    { min: 90, max: 190, name: 'Вестник живого тоннеля' },
    { min: 155, max: 275, name: 'Вестник стены-змейки' },
    { min: 210, max: 380, name: 'Вестник секционного сдвига' },
  ];

  for (const target of targets) {
    if (slots <= 0) return;
    const cell = findHeraldCell(world, entities, spawnX, spawnY, target.min, target.max);
    if (cell < 0) continue;
    const x = cell % W;
    const y = (cell / W) | 0;
    const zid = world.zoneMap[cell];
    const zoneLevel = (world.zones[zid]?.level ?? 14) + 3;
    const hp = Math.round(scaleMonsterHp(heraldDef.hp, zoneLevel));
    entities.push({
      id: nextId.v++, type: EntityType.MONSTER,
      x: x + 0.5, y: y + 0.5,
      angle: rng() * Math.PI * 2, pitch: 0,
      alive: true,
      speed: scaleMonsterSpeed(heraldDef.speed, zoneLevel),
      sprite: monsterSpr(MonsterKind.HERALD),
      name: target.name,
      hp, maxHp: hp,
      monsterKind: MonsterKind.HERALD, attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
      rpg: randomRPG(zoneLevel),
    });
    slots--;
  }
}

export function findHeraldCell(
  world: World,
  entities: Entity[],
  spawnX: number,
  spawnY: number,
  minDist: number,
  maxDist: number,
): number {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const ci = irand(0, W * W - 1);
    if (world.cells[ci] !== Cell.FLOOR || world.features[ci] === Feature.LIFT_BUTTON) continue;
    const x = ci % W;
    const y = (ci / W) | 0;
    const d = world.dist(spawnX, spawnY, x + 0.5, y + 0.5);
    if (d < minDist || d > maxDist) continue;
    if (entities.some(e => e.monsterKind === MonsterKind.HERALD && e.alive && world.dist(e.x, e.y, x + 0.5, y + 0.5) < 72)) continue;
    return ci;
  }
  return -1;
}

export function seedPodadDrops(world: World, entities: Entity[], nextId: { v: number }, rooms: PodadRooms): void {
  dropItems(world, entities, nextId, rooms.contact, 2, rooms.contact.h - 3, [
    { defId: 'bandage', count: 2 },
    { defId: 'water', count: 1 },
  ]);
  dropItems(world, entities, nextId, rooms.threshold, rooms.threshold.w - 3, rooms.threshold.h - 3, [
    { defId: 'holy_water', count: 1 },
    { defId: 'siren_shard', count: 1 },
  ]);
  dropItems(world, entities, nextId, rooms.livingTunnel, 3, 3, [{ defId: 'sealant_tube', count: 1 }]);
}

export function hash2(x: number, y: number, seed: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
  n = Math.imul(n ^ (n >> 13), 1103515245);
  n ^= n >> 16;
  return (n & 0x7fffffff) / 0x7fffffff;
}

