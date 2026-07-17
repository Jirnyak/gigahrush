import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  Occupation,
  Tex,
  W,
  type Entity,
  type Item,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { HUMAN_TERRITORY_OWNERS, factionToTerritoryOwner } from '../../data/factions';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { registerCellHazardSite } from '../../systems/cell_hazards';
import { randomRPG } from '../../systems/rpg';
import { HARMONIC_BATHHOUSE_ROUTE_ID, HARMONIC_BATHHOUSE_BASE_FLOOR, BathhouseThermalBands, BathhouseRooms, HarmonicField, NextId, FIELD_W, FIELD_H, FIELD_STEP, FIELD_ORIGIN_X, FIELD_ORIGIN_Y } from "./meta";
import { idxField, carveDisc, setFeature, forRoomCells, roomWaterCells } from "./geometry";

export function hash01(seed: number, x: number, y: number, salt: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(x + salt, 0xc2b2ae35);
  h ^= Math.imul(y - salt, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) & 0xffff) / 0x10000;
}

export function solveHarmonicBathhouseField(seed: number): HarmonicField {
  const values = new Float32Array(FIELD_W * FIELD_H);
  const next = new Float32Array(values.length);
  const fixed = new Uint8Array(values.length);

  const hot = [
    { x: FIELD_W * 0.54, y: FIELD_H * 0.10, v: 1.0, r: 14 },
    { x: FIELD_W * 0.86, y: FIELD_H * 0.43, v: 0.82, r: 18 },
  ];
  const cold = [
    { x: FIELD_W * 0.12, y: FIELD_H * 0.56, v: -0.92, r: 20 },
    { x: FIELD_W * 0.58, y: FIELD_H * 0.94, v: -0.42, r: 16 },
  ];

  for (let y = 0; y < FIELD_H; y++) {
    for (let x = 0; x < FIELD_W; x++) {
      const i = idxField(x, y);
      let weighted = 0;
      let weight = 0;
      for (const src of [...hot, ...cold]) {
        const dx = x - src.x;
        const dy = y - src.y;
        const d2 = dx * dx + dy * dy;
        const w = 1 / (8 + d2);
        weighted += src.v * w;
        weight += w;
        if (d2 <= src.r * src.r) {
          fixed[i] = 1;
          values[i] = src.v;
        }
      }
      if (!fixed[i]) values[i] = weight > 0 ? weighted / weight : 0;
      if (x === 0 || y === 0 || x === FIELD_W - 1 || y === FIELD_H - 1) {
        fixed[i] = 1;
        values[i] = y < FIELD_H * 0.35 ? 0.44 : x < FIELD_W * 0.5 ? -0.38 : 0.08;
      }
    }
  }

  for (let iter = 0; iter < 72; iter++) {
    next.set(values);
    for (let y = 1; y < FIELD_H - 1; y++) {
      for (let x = 1; x < FIELD_W - 1; x++) {
        const i = idxField(x, y);
        if (fixed[i]) continue;
        const bias = (hash01(seed, x, y, iter) - 0.5) * 0.002;
        next[i] = (
          values[idxField(x - 1, y)] +
          values[idxField(x + 1, y)] +
          values[idxField(x, y - 1)] +
          values[idxField(x, y + 1)]
        ) * 0.25 + bias;
      }
    }
    values.set(next);
  }

  return {
    originX: FIELD_ORIGIN_X,
    originY: FIELD_ORIGIN_Y,
    step: FIELD_STEP,
    width: FIELD_W,
    height: FIELD_H,
    values,
  };
}

export function carveLevelSetCorridors(world: World, field: HarmonicField, seed: number): void {
  const levels = [0.54, 0.32, 0.1, -0.16, -0.38] as const;
  for (let gy = 3; gy < field.height - 3; gy++) {
    for (let gx = 3; gx < field.width - 3; gx++) {
      const v = field.values[idxField(gx, gy)];
      let nearest = 1;
      for (const level of levels) nearest = Math.min(nearest, Math.abs(v - level));
      const noise = hash01(seed, gx, gy, 31);
      const levelSet = nearest < 0.018 + noise * 0.012;
      const pressure = Math.abs(field.values[idxField(gx + 1, gy)] - field.values[idxField(gx - 1, gy)])
        + Math.abs(field.values[idxField(gx, gy + 1)] - field.values[idxField(gx, gy - 1)]);
      if (!levelSet && pressure < 0.105) continue;
      if (!levelSet && noise < 0.86) continue;
      carveDisc(world, field.originX + gx * field.step, field.originY + gy * field.step, levelSet ? 2 : 1, Tex.F_CONCRETE);
    }
  }
}

export function applyThermalBands(world: World, field: HarmonicField, rooms: BathhouseRooms, seed: number): BathhouseThermalBands {
  let hotFogCells = 0;
  let coldWaterCells = 0;
  let pressureCells = 0;
  for (let gy = 1; gy < field.height - 1; gy++) {
    for (let gx = 1; gx < field.width - 1; gx++) {
      const wx = field.originX + gx * field.step;
      const wy = field.originY + gy * field.step;
      const ci = world.idx(wx, wy);
      if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) continue;
      const v = field.values[idxField(gx, gy)];
      const n = hash01(seed, gx, gy, 97);
      if (v > 0.34) {
        world.fog[ci] = Math.max(world.fog[ci], Math.floor(48 + v * 92 + n * 24));
        world.floorTex[ci] = Tex.F_TILE;
        hotFogCells++;
      } else if (v < -0.24 && n > 0.18) {
        world.cells[ci] = Cell.WATER;
        world.floorTex[ci] = Tex.F_WATER;
        world.fog[ci] = Math.max(world.fog[ci], Math.floor(18 + Math.abs(v) * 44));
        coldWaterCells++;
      } else if (Math.abs(v) < 0.08) {
        world.fog[ci] = Math.max(world.fog[ci], 14);
        pressureCells++;
      }
    }
  }
  coldWaterCells += floodRoom(world, rooms.coldBypass, 0.72, seed ^ 0x77);
  hotFogCells += steamRoom(world, rooms.hotGallery, 96, seed ^ 0x88);
  return { hotFogCells, coldWaterCells, pressureCells };
}

export function floodRoom(world: World, room: Room, chance: number, seed: number): number {
  let changed = 0;
  forRoomCells(world, room, (ci, x, y) => {
    if (world.features[ci] !== Feature.NONE) return;
    if (hash01(seed, x, y, 5) > chance) return;
    world.cells[ci] = Cell.WATER;
    world.floorTex[ci] = Tex.F_WATER;
    world.fog[ci] = Math.max(world.fog[ci], 28);
    changed++;
  });
  return changed;
}

export function steamRoom(world: World, room: Room, fog: number, seed: number): number {
  let changed = 0;
  forRoomCells(world, room, (ci, x, y) => {
    if ((x + y + seed) % 5 !== 0) return;
    world.fog[ci] = Math.max(world.fog[ci], fog);
    changed++;
  });
  return changed;
}

export function decorateRooms(world: World, rooms: BathhouseRooms, seed: number): void {
  for (let x = rooms.centralBath.x + 14; x < rooms.centralBath.x + rooms.centralBath.w - 12; x += 18) {
    setFeature(world, x, rooms.centralBath.y + 14, Feature.SINK);
    setFeature(world, x, rooms.centralBath.y + rooms.centralBath.h - 12, Feature.CHAIR);
  }
  for (let y = rooms.boiler.y + 10; y < rooms.boiler.y + rooms.boiler.h - 8; y += 11) {
    setFeature(world, rooms.boiler.x + 10, y, Feature.MACHINE);
    setFeature(world, rooms.boiler.x + rooms.boiler.w - 10, y, Feature.APPARATUS);
  }
  for (let y = rooms.hotGallery.y + 12; y < rooms.hotGallery.y + rooms.hotGallery.h - 8; y += 18) {
    setFeature(world, rooms.hotGallery.x + 12, y, Feature.APPARATUS);
    setFeature(world, rooms.hotGallery.x + rooms.hotGallery.w - 10, y + 4, Feature.LAMP);
  }
  for (let y = rooms.coldBypass.y + 14; y < rooms.coldBypass.y + rooms.coldBypass.h - 8; y += 20) {
    setFeature(world, rooms.coldBypass.x + 10, y, Feature.SINK);
  }
  for (let x = rooms.repairGallery.x + 12; x < rooms.repairGallery.x + rooms.repairGallery.w - 8; x += 22) {
    setFeature(world, x, rooms.repairGallery.y + 8, Feature.APPARATUS);
    setFeature(world, x + 5, rooms.repairGallery.y + 18, Feature.SCREEN);
  }
  setFeature(world, rooms.mixingHall.x + 12, rooms.mixingHall.y + 12, Feature.TABLE);
  setFeature(world, rooms.mixingHall.x + rooms.mixingHall.w - 12, rooms.mixingHall.y + 12, Feature.SHELF);
  setFeature(world, rooms.entry.x + rooms.entry.w - 14, rooms.entry.y + 13, Feature.LAMP);
  setFeature(world, rooms.lowerLift.x + 14, rooms.lowerLift.y + 13, Feature.LAMP);

  stampRoomSurface(world, rooms.centralBath, seed ^ 0xa1, [82, 132, 155]);
  stampRoomSurface(world, rooms.hotGallery, seed ^ 0xa2, [190, 102, 54]);
  stampRoomSurface(world, rooms.coldBypass, seed ^ 0xa3, [70, 120, 170]);
}

export function stampRoomSurface(world: World, room: Room, seed: number, tint: [number, number, number]): void {
  stampSurfaceSplat(world, room.x + room.w / 2, room.y + room.h / 2, 0.5, 0.5, Math.max(room.w, room.h) / 86, 0.62, seed, tint[0], tint[1], tint[2], false);
}

export function alignHarmonicBathhouseAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = bathhouseTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isHarmonicBathhouseAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 149 + offset * 431) % list.length];
    entity.x = (cell % W) + 0.5;
    entity.y = ((cell / W) | 0) + 0.5;
    entity.assignedRoomId = world.roomMap[cell] >= 0 ? world.roomMap[cell] : -1;
    if (entity.ai) {
      entity.ai.tx = cell % W;
      entity.ai.ty = (cell / W) | 0;
      entity.ai.path = [];
      entity.ai.pi = 0;
      entity.ai.stuck = 0;
    }
  }
}

export function isHarmonicBathhouseAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    entity.name?.startsWith('Гармоническая баня:') === true &&
    entity.id === undefined &&
    entity.persistentNpcId === undefined &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

export function bathhouseTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
  const cells = new Map<TerritoryOwner, number[]>();
  for (const owner of HUMAN_TERRITORY_OWNERS) cells.set(owner, []);
  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (cell !== Cell.FLOOR && cell !== Cell.WATER) continue;
    if (world.aptMask[i] || world.hermoWall[i] || world.containerMap.has(i) || world.features[i] === Feature.LIFT_BUTTON) continue;
    const owner = world.factionControl[i] as TerritoryOwner;
    const list = cells.get(owner);
    if (list) list.push(i);
  }
  return cells;
}

export function registerHazards(world: World, rooms: BathhouseRooms, seed: number): string[] {
  const hotCells = roomCellsByHash(world, rooms.hotGallery, seed ^ 0x5100, 0.58);
  const coldCells = roomWaterCells(world, rooms.coldBypass);
  const pressureCells = roomCellsByHash(world, rooms.boiler, seed ^ 0x5200, 0.22);

  registerCellHazardSite(world, {
    id: 'harmonic_bathhouse_hot_fast_path',
    kind: 'steam_pressure',
    displayName: 'Паровой сброс',
    cells: hotCells,
    tags: [HARMONIC_BATHHOUSE_ROUTE_ID, 'hot_fast_path', 'steam', 'pressure'],
    sticky: false,
    cleanable: true,
    slowMult: 0.62,
    trappedMult: 0.34,
    pulsePeriodSeconds: 7.5,
    pulseActiveSeconds: 4.2,
    activeFog: 132,
    inactiveFog: 44,
    playerDamagePerSecond: 2.2,
    monsterDamagePerSecond: 1.2,
    roomId: rooms.hotGallery.id,
    centerX: rooms.hotGallery.x + rooms.hotGallery.w / 2,
    centerY: rooms.hotGallery.y + rooms.hotGallery.h / 2,
    warning: 'Пар режет быстрый ход. Идите рывком, чините вытяжку или уходите в холодный обход.',
    inactiveWarning: 'Пар ушёл в стояк. Горячий ход открыт на короткий такт.',
    warningColor: '#ff8a45',
  });
  registerCellHazardSite(world, {
    id: 'harmonic_bathhouse_cold_flooded_bypass',
    kind: 'cold_flood',
    displayName: 'Холодный затопленный обход',
    cells: coldCells,
    tags: [HARMONIC_BATHHOUSE_ROUTE_ID, 'cold_flooded_bypass', 'water', 'slow'],
    sticky: false,
    cleanable: false,
    slowMult: 0.66,
    trappedMult: 0.42,
    activeFog: 32,
    roomId: rooms.coldBypass.id,
    centerX: rooms.coldBypass.x + rooms.coldBypass.w / 2,
    centerY: rooms.coldBypass.y + rooms.coldBypass.h / 2,
    warning: 'Вода ледяная и тянет обувь. Безопаснее пара, но медленнее.',
    warningColor: '#79c8ff',
  });
  registerCellHazardSite(world, {
    id: 'harmonic_bathhouse_boiler_pressure_leak',
    kind: 'pressure_leak',
    displayName: 'Срыв давления',
    cells: pressureCells,
    tags: [HARMONIC_BATHHOUSE_ROUTE_ID, 'turn_valve', 'repair_pressure_route', 'pressure'],
    sticky: false,
    cleanable: true,
    slowMult: 0.72,
    pulsePeriodSeconds: 9,
    pulseActiveSeconds: 2.5,
    activeFog: 118,
    inactiveFog: 34,
    playerDamagePerSecond: 1.4,
    monsterDamagePerSecond: 0.6,
    roomId: rooms.boiler.id,
    centerX: rooms.boiler.x + rooms.boiler.w / 2,
    centerY: rooms.boiler.y + rooms.boiler.h / 2,
    warning: 'Котёл бьёт обратным давлением. Вентиль просит бирку, герметик и терпение.',
    inactiveWarning: 'Стрелка манометра упала. Можно проскочить к котлу.',
    warningColor: '#ffd16f',
  });

  return [
    'harmonic_bathhouse_hot_fast_path',
    'harmonic_bathhouse_cold_flooded_bypass',
    'harmonic_bathhouse_boiler_pressure_leak',
  ];
}

export function roomCellsByHash(world: World, room: Room, seed: number, chance: number): number[] {
  const out: number[] = [];
  forRoomCells(world, room, (ci, x, y) => {
    if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
    if (hash01(seed, x, y, 19) <= chance) out.push(ci);
  });
  return out;
}

export function placeContainers(world: World, rooms: BathhouseRooms): void {
  addContainer(world, rooms.repairGallery, rooms.repairGallery.x + 132, rooms.repairGallery.y + 13, ContainerKind.TOOL_LOCKER, 'Шкаф галереи манометров', 'locked', [
    { defId: 'valve_tag', count: 1 },
    { defId: 'sealant_tube', count: 1 },
    { defId: 'manometer', count: 1 },
    { defId: 'asbestos_cord', count: 1 },
  ], ['harmonic_bathhouse', 'repair_pressure_route', 'pressure', 'tool']);
  addContainer(world, rooms.boiler, rooms.boiler.x + rooms.boiler.w - 12, rooms.boiler.y + 12, ContainerKind.METAL_CABINET, 'Горячий шкаф котельной', 'secret', [
    { defId: 'pressure_logbook', count: 1 },
    { defId: 'boiler_water', count: 2 },
    { defId: 'burn_gel', count: 1 },
  ], ['harmonic_bathhouse', 'turn_valve', 'steam', 'theft']);
  addContainer(world, rooms.coldBypass, rooms.coldBypass.x + 12, rooms.coldBypass.y + rooms.coldBypass.h - 14, ContainerKind.EMERGENCY_BOX, 'Мокрый ящик холодного обхода', 'public', [
    { defId: 'filtered_water', count: 2 },
    { defId: 'gasmask_filter', count: 1 },
    { defId: 'bandage', count: 1 },
  ], ['harmonic_bathhouse', 'cold_flooded_bypass', 'water', 'public']);
  addContainer(world, rooms.hotGallery, rooms.hotGallery.x + rooms.hotGallery.w - 14, rooms.hotGallery.y + rooms.hotGallery.h - 16, ContainerKind.TOOL_LOCKER, 'Сухой шкаф горячего хода', 'locked', [
    { defId: 'fuse', count: 1 },
    { defId: 'relay_diagram', count: 1 },
    { defId: 'gasmask_filter', count: 1 },
  ], ['harmonic_bathhouse', 'hot_fast_path', 'vent', 'tool']);
}

export function addContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: readonly Item[],
  tags: readonly string[],
): void {
  const ci = world.idx(x, y);
  world.addContainer({
    id: world.containers.length,
    x,
    y,
    z: HARMONIC_BATHHOUSE_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[ci],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots: 8,
    access,
    lockDifficulty: access === 'locked' ? 2 : access === 'secret' ? 3 : undefined,
    discovered: access !== 'secret',
    tags: [...tags],
  });
  setFeature(world, x, y, kind === ContainerKind.TOOL_LOCKER ? Feature.SHELF : Feature.APPARATUS);
}

export function spawnBathhouseNpcs(entities: Entity[], nextId: NextId, rooms: BathhouseRooms): void {
  spawnNpc(entities, nextId, 'Смотрительница пара', Faction.LIQUIDATOR, Occupation.MECHANIC, rooms.repairGallery.x + 34, rooms.repairGallery.y + 14, [
    { defId: 'valve_tag', count: 1 },
    { defId: 'pressure_logbook', count: 1 },
  ]);
  spawnNpc(entities, nextId, 'Банщик без смены', Faction.CITIZEN, Occupation.LOCKSMITH, rooms.centralBath.x + 18, rooms.centralBath.y + 28, [
    { defId: 'boiler_water', count: 1 },
    { defId: 'asbestos_cord', count: 1 },
  ]);
  spawnNpc(entities, nextId, 'Дикий ныряльщик обхода', Faction.WILD, Occupation.HUNTER, rooms.coldBypass.x + 34, rooms.coldBypass.y + 118, [
    { defId: 'filtered_water', count: 1 },
    { defId: 'gasmask_filter', count: 1 },
  ]);
}

export function spawnNpc(
  entities: Entity[],
  nextId: NextId,
  name: string,
  faction: Faction,
  occupation: Occupation,
  x: number,
  y: number,
  inventory: Item[],
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0.86,
    sprite: occupation,
    name,
    hp: 125,
    maxHp: 125,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    faction,
    occupation,
    assignedRoomId: -1,
    questId: -1,
    canGiveQuest: false,
    inventory,
    needs: freshNeeds(),
    rpg: randomRPG(3),
  });
}

export function spawnBathhouseThreats(world: World, entities: Entity[], nextId: NextId, rooms: BathhouseRooms): void {
  spawnMonster(world, entities, nextId, MonsterKind.TUMANNIK, rooms.hotGallery.x + 46, rooms.hotGallery.y + 74, 4, 'Туманник паровой галереи');
  spawnMonster(world, entities, nextId, MonsterKind.VODYANOY_KOSHMAR, rooms.coldBypass.x + 38, rooms.coldBypass.y + 86, 4, 'Водяной кошмар холодного обхода');
  spawnMonster(world, entities, nextId, MonsterKind.TRUBNYY_AVTOMAT, rooms.boiler.x + 48, rooms.boiler.y + 34, 4, 'Трубный автомат котельной');
}

export function spawnMonster(
  world: World,
  entities: Entity[],
  nextId: NextId,
  kind: MonsterKind,
  x: number,
  y: number,
  level: number,
  name: string,
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
  const def = MONSTERS[kind];
  if (!def) return;
  const hp = Math.round(def.hp * (0.9 + level * 0.14));
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
  });
}

