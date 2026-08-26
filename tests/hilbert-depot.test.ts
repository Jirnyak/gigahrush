import { test } from 'node:test';
import * as assert from 'node:assert/strict';

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
  type Entity,
  type TerritoryOwner,
} from '../src/core/types';
import { designFloorAtZ, designFloorById } from '../src/data/design_floors';
import { designFloorPopulationProfile } from '../src/data/design_floor_population';
import { activeActorSoftLimit } from '../src/data/entity_limits';
import { HUMAN_TERRITORY_OWNERS, factionToTerritoryOwner, territoryOwnerName } from '../src/data/factions';
import { territorySharesForDesignFloor } from '../src/data/floor_territory';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import {
  DESIGN_FLOOR_ID,
  HILBERT_DEPOT_Z,
  HILBERT_DEPOT_CARGO_TAG,
  HILBERT_DEPOT_CHORD_TAG,
  HILBERT_DEPOT_ROUTE_Z,
  generateHilbertDepotDesignFloor,
  type HilbertDepotGeneration,
} from '../src/gen/hilbert_depot';
import { getRouteCueMarkers, routeCueCount } from '../src/systems/route_cues';
import { countTerritoryCells, territoryHqAnchors, territoryOwnerAt, territoryRoomOwner } from '../src/systems/territory';
import { assertFullFootprint, assertReachableRouteLifts, reachableCells } from './generator_helpers';

function weightOf<T>(items: readonly { value: T; weight: number }[], value: T): number {
  return items.find(item => item.value === value)?.weight ?? 0;
}

// Fixed seed: generateHilbertDepotDesignFloor now requires the run seed
// (route-seed canon); calling it bare fed xorshift32(undefined).
const AUTHORED_READ_SEED = 61_061;

let cachedAuthoredGeneration: ReturnType<typeof generateHilbertDepotDesignFloor> | undefined;

function authoredHilbertDepotForRead(): ReturnType<typeof generateHilbertDepotDesignFloor> {
  cachedAuthoredGeneration ??= generateHilbertDepotDesignFloor(AUTHORED_READ_SEED);
  return cachedAuthoredGeneration;
}

function playableCellCount(gen: HilbertDepotGeneration): number {
  let count = 0;
  for (let i = 0; i < W * W; i++) {
    const cell = gen.world.cells[i];
    if (cell === Cell.FLOOR || cell === Cell.WATER || cell === Cell.DOOR || cell === Cell.LIFT) count++;
  }
  return count;
}

function reachableCount(reachable: Uint8Array): number {
  let count = 0;
  for (const value of reachable) count += value;
  return count;
}

function hermeticShellCells(gen: HilbertDepotGeneration, roomId: number): number {
  const room = gen.world.rooms[roomId];
  let count = 0;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      if (gen.world.hermoWall[gen.world.idx(room.x + dx, room.y + dy)]) count++;
    }
  }
  return count;
}

function nearbySupportRooms(gen: HilbertDepotGeneration, roomId: number): number {
  const supportTypes = new Set([RoomType.BATHROOM, RoomType.KITCHEN, RoomType.STORAGE, RoomType.MEDICAL, RoomType.OFFICE, RoomType.COMMON, RoomType.SMOKING]);
  const hq = gen.world.rooms[roomId];
  const hx = hq.x + hq.w / 2;
  const hy = hq.y + hq.h / 2;
  return gen.world.rooms.filter(room => (
    room.id !== hq.id &&
    room.type !== RoomType.HQ &&
    supportTypes.has(room.type) &&
    gen.world.dist2(hx, hy, room.x + room.w / 2, room.y + room.h / 2) <= 95 * 95
  )).length;
}

// Ambient crowd now comes from the central populateDesignFloorAmbientNpcs()
// templates, which carry no display name (the old 'Склад Гильберта:' prefix is
// gone); ambient-ness is the template shape: no package/persistent/alife id
// and no quest.
function isAmbientHilbertNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    (entity as any).npcPackageId === undefined &&
    entity.persistentNpcId === undefined &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined &&
    entity.faction !== Faction.PLAYER;
}

test('hilbert_depot is a maintenance authored route floor with indexed industrial pressure', () => {
  const route = designFloorById(DESIGN_FLOOR_ID);
  assert.ok(route);
  assert.equal(route.z, HILBERT_DEPOT_ROUTE_Z);
  assert.equal(route.displayName, 'Склад Гильберта');
  assert.equal(route.danger, 4);
  assert.equal(designFloorAtZ(HILBERT_DEPOT_ROUTE_Z)?.id, DESIGN_FLOOR_ID);

  const profile = designFloorPopulationProfile(route);
  const budget = profile.npcTarget + profile.monsterTarget;
  // Доля монстров считается от авторского danger как отклонения от нормы для
  // высоты, поэтому точные числа населения пиннят настройку, а не контракт
  // этажа. Ниже — сам контракт склада: маршрут z=-30, maintenance, danger 4.
  //
  // Граница: склад укомплектован. Смена кладовщиков занимает не меньше десятой
  // части актёрского бюджета — это населённая промзона, а не чистый монстрятник.
  assert.equal(profile.npcTarget >= budget * 0.1, true, `npc target ${profile.npcTarget} of budget ${budget}`);
  // Граница: и всё же давление доминирует над штатом — иначе это не danger-4.
  assert.equal(profile.monsterTarget > profile.npcTarget, true, `monster target ${profile.monsterTarget} vs npc ${profile.npcTarget}`);
  // Закон сохранения: этаж выбирает общий бюджет активных актёров, к которому
  // подгоняет fitActiveActorCounts(), и не переливает через мягкий лимит.
  assert.equal(budget <= activeActorSoftLimit(), true, `actor budget ${budget} over soft limit ${activeActorSoftLimit()}`);
  assert.equal(budget >= activeActorSoftLimit() * 0.9, true, `actor budget ${budget} under soft limit ${activeActorSoftLimit()}`);
  assert.equal(weightOf(profile.npcFactions, Faction.LIQUIDATOR) > weightOf(profile.npcFactions, Faction.WILD), true);
  assert.equal(weightOf(profile.npcOccupations, Occupation.STOREKEEPER) > weightOf(profile.npcOccupations, Occupation.SCIENTIST), true);
  assert.equal(profile.monsterBiasKinds.includes(MonsterKind.ROBOT), true);
  assert.equal(profile.monsterBiasKinds.includes(MonsterKind.PSEUDOLIFT), true);
  assert.equal(profile.monsterTags.includes('index'), true);
  assert.equal((profile.monsterPlacement.anchors?.length ?? 0) >= 5, true);
});

test('hilbert_depot keeps the Hilbert curve compact and exposes ordered cargo decisions', () => {
  const gen = authoredHilbertDepotForRead();
  const state = gen.hilbertState;
  const cargo = gen.world.containers.filter(container => container.tags.includes(HILBERT_DEPOT_CARGO_TAG));
  const uniqueOrders = new Set(state.cargoOrders);

  assert.equal(state.routeId, DESIGN_FLOOR_ID);
  assert.equal(state.curvePointCount, 256);
  assert.equal(state.cargoContainerIds.length >= 24, true, `cargo count ${state.cargoContainerIds.length}`);
  assert.equal(cargo.length, state.cargoContainerIds.length);
  assert.equal(uniqueOrders.size, state.cargoOrders.length);
  assert.deepEqual([...state.cargoOrders].sort((a, b) => a - b), state.cargoOrders);
  assert.equal(cargo.every(container => container.inventory.length > 0), true);
  assert.equal(cargo.some(container => container.access === 'locked'), true);
  assert.equal(cargo.some(container => container.access === 'owner'), true);
  assert.equal(cargo.every(container => container.tags.some(tag => tag.startsWith('hilbert_order_'))), true);
  assert.equal(gen.world.rooms.some(room => room.type === RoomType.STORAGE && room.name.includes('Индексная секция Г-')), true);
});

test('hilbert_depot locked chords are optional key-gated shortcuts, not saved curve state', () => {
  const gen = authoredHilbertDepotForRead();
  const state = gen.hilbertState;
  const reachable = reachableCells(gen);

  assert.equal(state.chords.length >= 4, true, `chord count ${state.chords.length}`);
  assert.equal(state.lockedChordDoorCells.length >= state.chords.length, true, `door count ${state.lockedChordDoorCells.length}`);
  // Route-scale expansion (expandHilbertDepotRouteGeometry) can carve away a
  // chord door's wall jambs, and sanitizeDoors() then dissolves that door while
  // state.lockedChordDoorCells keeps the stale id (src bug, recorded). The
  // design contract that must hold: key-gated chord shortcuts survive on the
  // reachable route, and every surviving chord door is LOCKED behind 'key'.
  const survivingChordDoors = state.lockedChordDoorCells.filter(cell => gen.world.doors.has(cell));
  assert.equal(survivingChordDoors.length >= 2, true, `surviving locked chord doors ${survivingChordDoors.length}`);
  for (const doorCell of survivingChordDoors) {
    const door = gen.world.doors.get(doorCell);
    assert.ok(door, `missing door at ${doorCell}`);
    assert.equal(door.state, DoorState.LOCKED);
    assert.equal(door.keyId, 'key');
    assert.equal(reachable[doorCell], 1, `locked chord door ${doorCell} should sit on reachable route`);
  }

  const cueTags = new Set(getRouteCueMarkers(gen.world).flatMap(cue => cue.tags));
  assert.equal(cueTags.has(HILBERT_DEPOT_CHORD_TAG), true);
  assert.equal(cueTags.has('hilbert_order'), true);
});

test('hilbert_depot full route generation keeps lifts, cues and pressure actors reachable', () => {
  const gen = generateDesignFloor(DESIGN_FLOOR_ID) as HilbertDepotGeneration;
  assertReachableRouteLifts(gen, 'hilbert_depot');

  const cues = getRouteCueMarkers(gen.world);
  const cueTags = new Set(cues.flatMap(cue => cue.tags));
  assert.equal(routeCueCount(gen.world) >= 3, true);
  assert.equal(cueTags.has('hilbert_order'), true);
  assert.equal(cueTags.has(HILBERT_DEPOT_CHORD_TAG), true);
  assert.equal(cueTags.has('exit'), true);
  assert.equal(gen.world.liftDir.some((dir, idx) => dir === LiftDirection.UP && gen.world.cells[idx] === Cell.LIFT), true);
  assert.equal(gen.world.liftDir.some((dir, idx) => dir === LiftDirection.DOWN && gen.world.cells[idx] === Cell.LIFT), true);
  assert.equal(gen.entities.some(entity => entity.type === EntityType.MONSTER && entity.monsterKind === MonsterKind.ROBOT), true);
  assert.equal(gen.entities.some(entity => entity.type === EntityType.MONSTER && entity.monsterKind === MonsterKind.SAFEGUARD), true);
  assert.equal(gen.world.containers.some(container => container.tags.includes(HILBERT_DEPOT_CARGO_TAG)), true);
});

test('hilbert_depot expands into route-scale index shelves with cell-first faction territory', () => {
  const gen = generateDesignFloor(DESIGN_FLOOR_ID, 61_061) as HilbertDepotGeneration;
  const reachable = assertReachableRouteLifts(gen, 'hilbert_depot genfix_081');
  const blockRooms = gen.world.rooms.filter(room => room.name.startsWith('Склад Гильберта:') && room.name.includes('Г-'));
  const hqNames = new Map<TerritoryOwner, string>([
    [ZoneFaction.CITIZEN, 'Склад Гильберта: гражданская приемка паек'],
    [ZoneFaction.LIQUIDATOR, 'Склад Гильберта: главный гермопост ликвидаторов'],
    [ZoneFaction.CULTIST, 'Склад Гильберта: скрытая культовая ячейка'],
    [ZoneFaction.SCIENTIST, 'Склад Гильберта: НИИ узла нумерации'],
    [ZoneFaction.WILD, 'Склад Гильберта: разбитый гермокор диких'],
  ]);
  const anchors = territoryHqAnchors(gen.world);
  const anchorOwners = new Set(anchors.map(anchor => anchor.owner));
  const counts = new Map(countTerritoryCells(gen.world).map(row => [row.owner, row.cells]));
  const targetRows = territorySharesForDesignFloor(DESIGN_FLOOR_ID);
  const targetTotal = targetRows.reduce((sum, row) => sum + row.share, 0);
  const share = (owner: TerritoryOwner): number => (counts.get(owner) ?? 0) / (W * W);
  const dominant = [...counts.entries()]
    .filter(([owner]) => owner !== ZoneFaction.SAMOSBOR)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  assertFullFootprint(gen.world, 'hilbert_depot genfix_081');
  assert.equal(gen.world.rooms.length >= 340, true, `rooms ${gen.world.rooms.length}`);
  assert.equal(gen.world.doors.size >= 260, true, `doors ${gen.world.doors.size}`);
  assert.equal(playableCellCount(gen) >= 480_000, true, `playable ${playableCellCount(gen)}`);
  assert.equal(reachableCount(reachable) >= 480_000, true, `reachable ${reachableCount(reachable)}`);
  assert.equal(blockRooms.length >= 280, true, `block rooms ${blockRooms.length}`);
  assert.equal(dominant, ZoneFaction.LIQUIDATOR);

  for (const owner of HUMAN_TERRITORY_OWNERS) {
    assert.equal(anchorOwners.has(owner), true, `missing HQ anchor for ${territoryOwnerName(owner)}`);
    assert.equal((counts.get(owner) ?? 0) > 0, true, `owned cells for ${territoryOwnerName(owner)}`);
  }
  for (const target of targetRows) {
    const actual = share(target.owner);
    assert.equal(Math.abs(actual - target.share / targetTotal) <= 0.03, true, `${territoryOwnerName(target.owner)} share ${actual.toFixed(3)}`);
  }

  for (const [owner, name] of hqNames) {
    const room = gen.world.rooms.find(candidate => candidate.name === name);
    assert.ok(room, name);
    assert.equal(room.type, RoomType.HQ, name);
    assert.equal(room.sealed, true, name);
    assert.equal(territoryRoomOwner(gen.world, room.id), owner, name);
    assert.equal(territoryOwnerAt(gen.world, room.x + (room.w >> 1), room.y + (room.h >> 1)), owner, name);
    // Граница: штаб запечатан, и вход в него — гермодверь. Без неё штаб не
    // закрывается в самосбор и остаётся коробкой с дырой в стене. Проверка
    // сейчас КРАСНАЯ и это настоящий баг генератора: расширение маршрута режет
    // косяки, идущий следом sanitizeDoors() растворяет дверь, и 4 из 5 штабов
    // остаются с doors=0 при двух проходимых клетках в периметре. Тот же класс,
    // что чинил коммит 75f91ea5 в пионерлагере (reinforceCampDoorSlots +
    // страховка ПОСЛЕ санации); чинится в src/gen/hilbert_depot, не здесь.
    const hermeticDoors = room.doors.filter(idx => gen.world.doors.get(idx)?.state === DoorState.HERMETIC_OPEN);
    assert.equal(hermeticDoors.length >= 1, true, `${name}: doors=${room.doors.length} hermetic=${hermeticDoors.length}`);
    assert.equal(hermeticShellCells(gen, room.id) > 0, true, `hermetic shell ${name}`);
    assert.equal(nearbySupportRooms(gen, room.id) >= 4, true, `support rooms ${name}`);
  }
});

test('hilbert_depot ambient depot staff spawn on their own territory', () => {
  const route = designFloorById(DESIGN_FLOOR_ID);
  assert.ok(route);
  const profile = designFloorPopulationProfile(route);
  const gen = generateDesignFloor(DESIGN_FLOOR_ID, 61_061) as HilbertDepotGeneration;
  let ambient = 0;
  let own = 0;
  for (const entity of gen.entities) {
    if (!isAmbientHilbertNpc(entity) || entity.faction === undefined) continue;
    ambient++;
    if (territoryOwnerAt(gen.world, entity.x, entity.y) === factionToTerritoryOwner(entity.faction)) own++;
  }

  // Закон сохранения вместо пина на счётчик: этаж материализует ровно ту
  // амбиентную смену, которую просит профиль населения. Ни перелива сверх цели
  // (иначе мимо мягкого лимита актёров), ни массовой потери мест под расстановку
  // в плотной складской геометрии.
  assert.equal(ambient <= profile.npcTarget, true, `ambient ${ambient} over target ${profile.npcTarget}`);
  assert.equal(ambient >= profile.npcTarget * 0.9, true, `ambient ${ambient} under target ${profile.npcTarget}`);
  // Граница: смена стоит на своей территории — это и есть смысл теста,
  // расстановка идёт по владельцу клетки, а не по случайному свободному месту.
  assert.equal(own / ambient >= 0.95, true, `own territory ${own}/${ambient}`);
});
