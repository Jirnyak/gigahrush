import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { auditReachability, REACH_GATE_KEY } from '../src/core/world';
import {
  Cell,
  DoorState,
  EntityType,
  Faction,
  LiftDirection,
  MonsterKind,
  Occupation,
  RoomType,
  W,
  ZoneFaction,
} from '../src/core/types';
import {
  designFloorAtZ,
  designFloorById,
} from '../src/data/design_floors';
import { designFloorPopulationProfile } from '../src/data/design_floor_population';
import { PROCEDURAL_FLOOR_ZS } from '../src/data/procedural_floors';
import { SIDE_QUESTS } from '../src/data/plot';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import {
  BOLNICHNY_KORPUS_ROUTE_ID,
  BOLNICHNY_KORPUS_Z,
  BOLNICHNY_ROOM_NAMES,
} from '../src/gen/bolnichny_korpus';
import { countTerritoryCells, territoryHqAnchors } from '../src/systems/territory';

let cachedGeneration: ReturnType<typeof generateDesignFloor> | undefined;

function generatedBolnichnyKorpus(): ReturnType<typeof generateDesignFloor> {
  cachedGeneration ??= generateDesignFloor(BOLNICHNY_KORPUS_ROUTE_ID);
  return cachedGeneration;
}

/**
 * Закон сохранения дверей: сколько бы дверей ни насыпал генератор, каждая запись
 * world.doors обязана стоять на клетке Cell.DOOR и быть известной хотя бы одной комнате
 * через room.doors, и наоборот — каждая клетка DOOR имеет запись. Двери вообще есть.
 */
function assertDoorRegistryIsConsistent(world: ReturnType<typeof generateDesignFloor>['world']): void {
  const roomDoorIdx = new Set<number>();
  for (const room of world.rooms) for (const idx of room.doors) roomDoorIdx.add(idx);

  let doorCells = 0;
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] !== Cell.DOOR) continue;
    doorCells++;
    assert.equal(world.doors.has(i), true, `door cell ${i} without world.doors record`);
  }

  assert.equal(world.doors.size > 0, true, 'floor must ship at least one door');
  assert.equal(doorCells, world.doors.size, `door cells ${doorCells} vs records ${world.doors.size}`);
  for (const idx of world.doors.keys()) {
    assert.equal(world.cells[idx], Cell.DOOR, `door record ${idx} not on a DOOR cell`);
    assert.equal(roomDoorIdx.has(idx), true, `door record ${idx} not referenced by any room.doors`);
  }
}

function passableCellCount(world: ReturnType<typeof generateDesignFloor>['world']): number {
  let count = 0;
  for (const cell of world.cells) {
    if (cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.WATER || cell === Cell.LIFT) count++;
  }
  return count;
}

function reachableRoomCells(gen: ReturnType<typeof generateDesignFloor>, roomName: string): number {
  const room = gen.world.rooms.find(candidate => candidate.name === roomName);
  assert.ok(room, `missing room ${roomName}`);
  const audit = auditReachability(gen.world, gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
  let cells = 0;
  for (let i = 0; i < W * W; i++) {
    if (gen.world.roomMap[i] === room.id && audit.reachable[i]) cells++;
  }
  return cells;
}

function reachableLiftGate(gen: ReturnType<typeof generateDesignFloor>, direction: LiftDirection): number | undefined {
  const audit = auditReachability(gen.world, gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
  let best: number | undefined;
  for (let i = 0; i < W * W; i++) {
    if (gen.world.cells[i] !== Cell.LIFT || gen.world.liftDir[i] !== direction) continue;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const ni = gen.world.idx(x + dx, y + dy);
      if (!audit.reachable[ni]) continue;
      const gate = audit.gateMask[ni];
      best = best === undefined ? gate : Math.min(best, gate);
    }
  }
  return best;
}

function hermeticShellCells(gen: ReturnType<typeof generateDesignFloor>, roomId: number): number {
  const room = gen.world.rooms[roomId];
  assert.ok(room);
  let cells = 0;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      if (gen.world.hermoWall[gen.world.idx(room.x + dx, room.y + dy)]) cells++;
    }
  }
  return cells;
}

test('bolnichny_korpus is registered as a Kvartiry-band authored hospital route', () => {
  const route = designFloorById(BOLNICHNY_KORPUS_ROUTE_ID);
  assert.equal(route?.z, BOLNICHNY_KORPUS_Z);
  assert.equal(route?.themeTags?.includes('kvartiry'), true);
  assert.equal(route?.displayName, 'Больничный корпус');
  assert.equal(designFloorAtZ(BOLNICHNY_KORPUS_Z)?.id, BOLNICHNY_KORPUS_ROUTE_ID);
  assert.equal(PROCEDURAL_FLOOR_ZS.includes(BOLNICHNY_KORPUS_Z), false);
});

test('bolnichny_korpus population profile targets medical staff and infected pressure', () => {
  const route = designFloorById(BOLNICHNY_KORPUS_ROUTE_ID);
  assert.ok(route);
  const profile = designFloorPopulationProfile(route);

  assert.ok(profile.npcTarget > 0 && profile.npcTarget < 4000);
  assert.ok(profile.monsterTarget > 0 && profile.monsterTarget < 4000);
  assert.equal(profile.npcNoun, 'санработник');
  assert.equal(profile.npcFactions.some(entry => entry.value === Faction.SCIENTIST && entry.weight >= 30), true);
  assert.equal(profile.npcFactions.some(entry => entry.value === Faction.LIQUIDATOR && entry.weight >= 25), true);
  assert.equal(profile.npcOccupations.some(entry => entry.value === Occupation.DOCTOR && entry.weight >= 30), true);
  assert.equal(profile.monsterBiasKinds.includes(MonsterKind.HEAD_SLUG), true);
  assert.equal(profile.monsterBiasKinds.includes(MonsterKind.CHERNOSLIZ), true);
  assert.equal(profile.monsterTags.includes('quarantine'), true);
  assert.equal((profile.npcPlacement.roomWeights?.[RoomType.MEDICAL] ?? 0) > 1.5, true);
  assert.equal((profile.monsterPlacement.anchors?.length ?? 0) >= 4, true);
});

test('bolnichny_korpus generator ships clean and dirty routes without trapping lifts', () => {
  const gen = generatedBolnichnyKorpus();
  const spawnCell = gen.world.cells[gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY))];
  const hermeticDoors = [...gen.world.doors.values()].filter(door => door.state === DoorState.HERMETIC_CLOSED);
  const lockedDoors = [...gen.world.doors.values()].filter(door => door.state === DoorState.LOCKED);

  assert.equal(spawnCell, Cell.FLOOR);
  assert.equal(reachableLiftGate(gen, LiftDirection.UP), 0);
  assert.equal(reachableLiftGate(gen, LiftDirection.DOWN), 0);
  assert.equal(hermeticDoors.length >= 2, true);
  assert.equal(lockedDoors.some(door => door.keyId === 'official_quarantine_clearance'), true);
  assert.equal(lockedDoors.some(door => door.keyId === 'forged_quarantine_clearance'), true);

  for (const name of [
    BOLNICHNY_ROOM_NAMES.cleanLoopSouth,
    BOLNICHNY_ROOM_NAMES.cleanLoopNorth,
    BOLNICHNY_ROOM_NAMES.ventilationSpine,
    BOLNICHNY_ROOM_NAMES.feverWard,
    BOLNICHNY_ROOM_NAMES.redWard,
    BOLNICHNY_ROOM_NAMES.blackWard,
  ]) {
    assert.equal(reachableRoomCells(gen, name) > 0, true, name);
  }
});

test('bolnichny_korpus expands into hospital micro rooms and cell-first territory shares', () => {
  const gen = generatedBolnichnyKorpus();
  const audit = auditReachability(gen.world, gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
  let reachable = 0;
  for (const value of audit.reachable) reachable += value;
  const microRooms = gen.world.rooms.filter(room =>
    room.name.includes('микропалата') ||
    room.name.includes('микроблок') ||
    room.name.includes('бокс') ||
    room.name.includes('шкаф стерильных') ||
    room.name.includes('шкаф заражённых'));
  const hqAnchors = territoryHqAnchors(gen.world);
  const territoryRows = countTerritoryCells(gen.world);
  const territoryTotal = territoryRows.reduce((sum, row) => sum + row.cells, 0);
  const territoryShare = (owner: ZoneFaction): number => (territoryRows.find(row => row.owner === owner)?.cells ?? 0) / territoryTotal;
  const targetShares = new Map<ZoneFaction, number>([
    [ZoneFaction.CITIZEN, 0.24],
    [ZoneFaction.LIQUIDATOR, 0.22],
    [ZoneFaction.CULTIST, 0.06],
    [ZoneFaction.SCIENTIST, 0.38],
    [ZoneFaction.WILD, 0.1],
  ]);

  // Инвариант вместо пина: этаж развёрнут на маршрутный масштаб (много комнат, а не один
  // зал), а двери проверяются законом сохранения, а не счётчиком — каждая запись в
  // world.doors стоит на клетке DOOR и известна хотя бы одной комнате через room.doors.
  assert.equal(gen.world.rooms.length >= 150, true, `rooms ${gen.world.rooms.length}`);
  assertDoorRegistryIsConsistent(gen.world);
  // Инвариант вместо пина: масштаб этажа плюс закон сохранения связности — всё проходимое
  // достижимо из спавна. Пин 170_000 был вдобавок недостижим: проходимых клеток здесь ~134k.
  // Проверка красная по существу: ensureConnectivity зовётся до
  // expandBolnichnyKorpusRouteGeometry, а finalizeExpandedFloor его не повторяет.
  const passable = passableCellCount(gen.world);
  assert.equal(passable >= 100_000, true, `passable ${passable}`);
  assert.equal(passable - reachable <= 64, true, `unreachable pockets ${passable - reachable} of ${passable}`);
  assert.equal(microRooms.length >= 80, true, `micro rooms ${microRooms.length}`);

  for (const [owner, targetShare] of targetShares) {
    const anchor = hqAnchors.find(candidate => candidate.owner === owner);
    assert.ok(anchor, `HQ anchor ${owner}`);
    const room = gen.world.rooms[anchor.roomId];
    assert.equal(room.type, RoomType.HQ, `HQ type ${owner}`);
    assert.equal(room.sealed, true, `HQ sealed ${owner}`);
    assert.equal(hermeticShellCells(gen, anchor.roomId) > 0, true, `HQ hermetic shell ${owner}`);
    assert.equal(territoryShare(owner) > 0, true, `territory cells ${owner}`);
    assert.equal(Math.abs(territoryShare(owner) - targetShare) <= 0.025, true, `owner ${owner} share ${territoryShare(owner)}`);
  }
  assert.equal(territoryShare(ZoneFaction.SCIENTIST) > territoryShare(ZoneFaction.CITIZEN), true);
  assert.equal(territoryShare(ZoneFaction.SCIENTIST) > territoryShare(ZoneFaction.LIQUIDATOR), true);
});

test('bolnichny_korpus gates pharmacy loot but keeps it reachable through clearance paths', () => {
  const gen = generatedBolnichnyKorpus();
  const pharmacy = gen.world.rooms.find(room => room.name === BOLNICHNY_ROOM_NAMES.pharmacy);
  assert.ok(pharmacy);
  const audit = auditReachability(gen.world, gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
  let reachable = 0;
  let keyGated = 0;
  for (let i = 0; i < W * W; i++) {
    if (gen.world.roomMap[i] !== pharmacy.id || !audit.reachable[i]) continue;
    reachable++;
    if ((audit.gateMask[i] & REACH_GATE_KEY) !== 0) keyGated++;
  }

  // Аптека строгого учёта заперта, но обязана быть достижима через ключевой проход.
  // Сейчас проверка красная по существу: периметр комнаты — 280 клеток сплошной стены,
  // ни одной клетки DOOR, а placeGateLine ставит шлюзы в 8 клетках снаружи, поэтому
  // комната наглухо запечатана. Это баг src (bolnichny_korpus/index.ts:583-591).
  assert.equal(reachable > 0, true, `pharmacy reachable cells ${reachable}`);
  assert.equal(keyGated > 0, true, `pharmacy key-gated cells ${keyGated}`);
  assert.equal(gen.world.containers.some(container =>
    container.tags.includes('pharmacy') &&
    container.tags.includes('theft') &&
    container.inventory.some(item => item.defId === 'morphine_ampoule')), true);
  assert.equal(gen.world.containers.some(container =>
    container.tags.includes('contaminated_papers') &&
    container.inventory.some(item => item.defId === 'contaminated_sample_act')), true);
});

test('bolnichny_korpus exposes authored NPCs and treatment, forgery, escort and exposure hooks', () => {
  const gen = generatedBolnichnyKorpus();
  const npcs = gen.entities.filter(entity => entity.type === EntityType.NPC);
  const monsters = gen.entities.filter(entity => entity.type === EntityType.MONSTER);
  const questIds = new Set(SIDE_QUESTS.map(quest => quest.id));

  for (const plotNpcId of [
    'bolnichny_doctor_galina',
    'bolnichny_pharmacist_ira',
    'bolnichny_liquidator_sazan',
    'bolnichny_patient_grisha',
    'bolnichny_clerk_nina',
  ]) {
    assert.equal(npcs.some(entity => (entity as any).npcPackageId === plotNpcId), true, plotNpcId);
  }
  assert.equal(monsters.some(entity => entity.monsterKind === MonsterKind.CHERNOSLIZ), true);
  assert.equal(questIds.has('bolnichny_treat_clean_ward'), true);
  assert.equal(questIds.has('bolnichny_treat_infected_ward'), true);
  assert.equal(questIds.has('bolnichny_forge_clearance'), true);
  assert.equal(questIds.has('bolnichny_escort_infected_patient'), true);
  assert.equal(questIds.has('bolnichny_expose_contaminated_papers'), true);
});
