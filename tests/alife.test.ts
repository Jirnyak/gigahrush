import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world';
import {
  AIGoal,
  Cell,
  EntityType,
  Faction,
  FloorLevel,
  Occupation,
  type Entity,
  type GameState,
} from '../src/core/types';
import {
  assignPersistentAlifeNpcFromEntity,
  alifeForSave,
  captureAlifeFloorState,
  createPrefilledAlifeState,
  currentAlifeFloorRecordIds,
  forEachAlifeNpcRecordSlice,
  defaultAlifePopulation,
  getAlifeNpcRecordSnapshot,
  getAlifeNpcTotalMoney,
  getAlifeLeaderboardSnapshot,
  materializeAlifeArrival,
  materializeAlifeFloorPopulation,
  moveAlifeNpcRecord,
  recordAlifeNpcDeath,
  sampleAlifeFloorRecordIds,
  setAlifeState,
  type AlifePopulationPlan,
} from '../src/systems/alife';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { getFactionRel, initFactionRelations } from '../src/data/relations';
import { freshRPG, RPG_LEVEL_CAP } from '../src/systems/rpg';
import { NPC_VISUAL_FLOOR69_FEMALE } from '../src/entities/npc_visuals';

function minimalState(): GameState {
  const state = { currentFloor: FloorLevel.LIVING } as GameState;
  setFloorRunState(state, { runSeed: 1 }, FloorLevel.LIVING);
  return state;
}

function restoreGlobalProperty(name: 'navigator' | 'performance' | 'window', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete (globalThis as Record<string, unknown>)[name];
}

function ambientTemplate(id: number, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.NPC,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1.2,
    sprite: Occupation.TRAVELER,
    name: `template ${id}`,
    hp: 10,
    maxHp: 10,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    faction: Faction.CITIZEN,
    occupation: Occupation.TRAVELER,
    isTraveler: true,
    questId: -1,
  };
}

test('A-Life default population baseline ignores runtime memory', () => {
  assert.equal(defaultAlifePopulation(), 100_000);
});

test('A-Life population plan pre-fills records, reserved identities and empty buckets', () => {
  const state = minimalState();
  const plan: AlifePopulationPlan = {
    buckets: [
      {
        floorKey: 'story:living',
        floor: FloorLevel.LIVING,
        targetCount: 3,
        reserved: [{
          name: 'Резервная Ольга',
          female: true,
          faction: Faction.SCIENTIST,
          occupation: Occupation.SCIENTIST,
          canGiveQuest: true,
          level: 9,
          maxHp: 3000,
          hp: 2700,
          money: 10_000,
          accountRubles: 1_000_000,
        }],
      },
      { floorKey: 'design:black_market_88', floor: FloorLevel.LIVING, targetCount: 2 },
      { floorKey: 'story:void', floor: FloorLevel.VOID, targetCount: 0 },
    ],
  };

  const alife = createPrefilledAlifeState(state, 12345, 5, plan) as {
    total: number;
    npcs: Array<{ id: number; floorKey: string; name: string; faction: Faction; occupation: Occupation; canGiveQuest: boolean }>;
    floorIndex: Record<string, number[]>;
  };

  assert.equal(alife.total, 5);
  assert.equal(alife.npcs.length, 5);
  assert.deepEqual(currentAlifeFloorRecordIds(state, 'story:living'), [1, 2, 3]);
  assert.deepEqual(currentAlifeFloorRecordIds(state, 'design:black_market_88'), [4, 5]);
  assert.deepEqual(currentAlifeFloorRecordIds(state, 'story:void'), []);
  const reserved = getAlifeNpcRecordSnapshot(state, 1);
  assert.equal(reserved?.name, 'Резервная Ольга');
  assert.equal(reserved?.faction, Faction.SCIENTIST);
  assert.equal(reserved?.occupation, Occupation.SCIENTIST);
  assert.equal(reserved?.canGiveQuest, true);
  assert.equal(reserved?.level, 9);
  assert.equal(reserved?.hp, 2700);
  assert.equal(reserved?.maxHp, 3000);
  assert.equal(reserved?.money, 10_000);
  assert.equal(reserved?.accountRubles, 1_000_000);
  for (const columnField of ['floorKey', 'floor', 'danger', 'faction', 'occupation', 'female', 'level', 'hp', 'maxHp', 'money', 'accountRubles', 'familyId', 'canGiveQuest', 'sprite', 'spriteSeed', 'weapon', 'inventory', 'kills', 'npcKills', 'monsterKills', 'dead', 'touched']) {
    assert.equal(Object.hasOwn(alife.npcs[0], columnField), false, `${columnField} should not live as a per-record object field`);
  }
});

test('A-Life movement updates floor buckets once, clears stale coordinates and saves override', () => {
  const state = minimalState();
  createPrefilledAlifeState(state, 12345, 3, {
    buckets: [
      { floorKey: 'story:living', floor: FloorLevel.LIVING, targetCount: 2 },
      { floorKey: 'design:black_market_88', floor: FloorLevel.LIVING, targetCount: 1 },
    ],
  });

  assert.equal(moveAlifeNpcRecord(state, 1, 'design:black_market_88', { x: 5.25, y: 6.75, angle: -0.5 }), true);
  assert.equal(moveAlifeNpcRecord(state, 1, 'design:black_market_88', { preservePosition: true }), true);

  assert.deepEqual(currentAlifeFloorRecordIds(state, 'story:living'), [2]);
  assert.deepEqual(currentAlifeFloorRecordIds(state, 'design:black_market_88'), [3, 1]);
  const snapshot = getAlifeNpcRecordSnapshot(state, 1);
  assert.ok(snapshot);
  assert.equal(snapshot.floorKey, 'design:black_market_88');
  assert.equal(snapshot.floor, FloorLevel.LIVING);
  assert.equal(snapshot.x, 5.25);
  assert.equal(snapshot.y, 6.75);
  assert.equal(snapshot.angle !== undefined && snapshot.angle > 0, true);
  assert.equal(alifeForSave(state).overrides.some(item => item.id === 1 && item.floorKey === 'design:black_market_88'), true);

  const dead = ambientTemplate(99, 5.25, 6.75);
  dead.alifeId = 1;
  dead.persistentNpcId = 'alife:1';
  recordAlifeNpcDeath(state, dead);
  assert.equal(moveAlifeNpcRecord(state, 1, 'story:living'), false);
  assert.deepEqual(currentAlifeFloorRecordIds(state, 'design:black_market_88'), [3, 1]);
});

test('A-Life floor sampling is cursor based, bounded and skips dead records', () => {
  const state = minimalState();
  createPrefilledAlifeState(state, 12345, 4, {
    buckets: [{ floorKey: 'story:living', floor: FloorLevel.LIVING, targetCount: 4 }],
  });
  const dead = ambientTemplate(100, 10.5, 10.5);
  dead.alifeId = 2;
  dead.persistentNpcId = 'alife:2';
  recordAlifeNpcDeath(state, dead);

  assert.deepEqual(sampleAlifeFloorRecordIds(state, 'story:living', 0, 10), { ids: [1, 3, 4], nextCursor: 0 });
  assert.deepEqual(sampleAlifeFloorRecordIds(state, 'story:living', 2, 2), { ids: [3, 4], nextCursor: 0 });
});

test('A-Life snapshots are copies, not mutable record access', () => {
  const state = minimalState();
  createPrefilledAlifeState(state, 12345, 1, {
    buckets: [{
      floorKey: 'story:living',
      floor: FloorLevel.LIVING,
      targetCount: 1,
      reserved: [{ name: 'Копия без доступа' }],
    }],
  });

  const snapshot = getAlifeNpcRecordSnapshot(state, 1);
  assert.ok(snapshot);
  snapshot.name = 'Мутировало снаружи';

  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.name, 'Копия без доступа');
});

test('A-Life arrival materializes one persistent record through the shared NPC constructor', () => {
  const state = minimalState();
  createPrefilledAlifeState(state, 12345, 1, {
    buckets: [{
      floorKey: 'design:black_market_88',
      floor: FloorLevel.LIVING,
      targetCount: 1,
      reserved: [{ money: 77, accountRubles: 1234, karma: 12 }],
    }],
  });
  const world = new World();
  world.cells[world.idx(15, 15)] = Cell.FLOOR;
  const entities: Entity[] = [];
  const nextId = { v: 10 };

  const entity = materializeAlifeArrival(state, world, entities, nextId, 1, {
    x: 15.5,
    y: 15.5,
    angle: 1,
    isTraveler: false,
    goalX: 20,
    goalY: 20,
  });

  assert.ok(entity);
  assert.equal(entity.alifeId, 1);
  assert.equal(entity.persistentNpcId, 'alife:1');
  assert.equal(entity.money, 77);
  assert.equal(entity.accountRubles, 1234);
  assert.equal(entity.karma, 12);
  assert.equal(typeof entity.playerRelation, 'number');
  assert.equal(entity.isTraveler, false);
  assert.equal(entity.ai?.goal, AIGoal.GOTO);
  assert.equal(entities.length, 1);
  assert.equal(materializeAlifeArrival(state, world, entities, nextId, 1, { x: 15.5, y: 15.5 }), null);
  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.floorKey, 'story:living');
});

test('A-Life mobile runtime keeps the same baseline despite large memory hints', () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36',
        maxTouchPoints: 5,
        deviceMemory: 16,
      },
    });
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: { memory: { jsHeapSizeLimit: 4 * 1024 * 1024 * 1024 } },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { innerWidth: 844, innerHeight: 390 },
    });

    assert.equal(defaultAlifePopulation(), 100_000);
  } finally {
    restoreGlobalProperty('navigator', navigatorDescriptor);
    restoreGlobalProperty('performance', performanceDescriptor);
    restoreGlobalProperty('window', windowDescriptor);
  }
});

test('A-Life materializes ambient slots and leaves killed slots empty', () => {
  initFactionRelations();
  const state = minimalState();
  setAlifeState(state, { seed: 12345, total: 100_000 });
  const world = new World();
  world.cells[world.idx(10, 10)] = Cell.FLOOR;
  world.cells[world.idx(11, 10)] = Cell.FLOOR;
  const entities = [ambientTemplate(1, 10.5, 10.5), ambientTemplate(2, 11.5, 10.5)];
  const nextId = { v: 3 };

  materializeAlifeFloorPopulation(state, world, entities, nextId, 'story:living');

  assert.equal(entities.length, 2);
  assert.equal(entities.every(entity => entity.alifeId !== undefined), true);
  const firstRelation = entities[0].playerRelation;
  assert.equal(typeof firstRelation, 'number');
  assert.ok(Math.abs((firstRelation ?? 0) - getFactionRel(entities[0].faction ?? Faction.CITIZEN, Faction.PLAYER)) <= 12);
  assert.equal(typeof entities[0].karma, 'number');
  assert.ok((entities[0].karma ?? 0) >= -127 && (entities[0].karma ?? 0) <= 127);
  const killedAlifeId = entities[0].alifeId;
  assert.ok(killedAlifeId);

  recordAlifeNpcDeath(state, entities[0]);

  const regenerated = [ambientTemplate(10, 10.5, 10.5), ambientTemplate(11, 11.5, 10.5)];
  materializeAlifeFloorPopulation(state, world, regenerated, { v: 20 }, 'story:living');

  assert.equal(regenerated.length, 1);
  assert.notEqual(regenerated[0].alifeId, killedAlifeId);
  assert.equal(regenerated[0].x, 11.5);
  assert.equal(alifeForSave(state).deadIds.includes(killedAlifeId), true);
});

test('event-created ordinary NPC receives persistent A-Life identity', () => {
  const state = minimalState();
  setAlifeState(state, { seed: 12345, total: 100_000 });
  const npc = ambientTemplate(50, 16.5, 16.5);
  npc.name = 'Новый жилец';
  npc.faction = Faction.SCIENTIST;
  npc.occupation = Occupation.SCIENTIST;
  npc.money = 77;
  npc.canGiveQuest = true;
  npc.rpg = freshRPG(12);
  npc.maxHp = 64;
  npc.hp = 64;
  const entities: Entity[] = [];

  assert.equal(assignPersistentAlifeNpcFromEntity(state, npc, entities), true);

  assert.equal(typeof npc.alifeId, 'number');
  assert.equal(npc.persistentNpcId, `alife:${npc.alifeId}`);
  const save = alifeForSave(state);
  const override = save.overrides.find(item => item.id === npc.alifeId);
  assert.ok(override);
  assert.equal(override.name, 'Новый жилец');
  assert.equal(override.faction, Faction.SCIENTIST);
  assert.equal(override.occupation, Occupation.SCIENTIST);
  assert.equal(override.canGiveQuest, true);
});

test('event-created ordinary NPC does not inherit an existing A-Life identity or death slot', () => {
  const state = minimalState();
  const alife = setAlifeState(state, {
    seed: 12345,
    total: 1_000,
    overrides: [{
      id: 1,
      floorKey: 'story:living',
      playerRelation: -88,
      karma: -123,
      kills: 17,
      npcKills: 9,
    }],
  }) as {
    npcs: Array<{
      id: number;
      floorKey: string;
      kills?: number;
      npcKills?: number;
      dead?: boolean;
    }>;
    floorIndex: Record<string, number[]>;
  };
  const reserved = alife.npcs[0];
  alife.floorIndex['story:living'] = [0];

  const npc = ambientTemplate(60, 18.5, 18.5);
  npc.name = 'Прибытие без прошлого';
  npc.kills = undefined;
  npc.npcKills = undefined;
  npc.monsterKills = undefined;
  npc.playerRelation = undefined;
  npc.karma = undefined;

  assert.equal(assignPersistentAlifeNpcFromEntity(state, npc, []), true);

  assert.ok(npc.alifeId);
  assert.notEqual(npc.alifeId, reserved.id);
  assert.equal(getAlifeNpcRecordSnapshot(state, reserved.id)?.playerRelation, -88);
  assert.equal(getAlifeNpcRecordSnapshot(state, reserved.id)?.karma, -123);
  const reservedOverride = alifeForSave(state).overrides.find(item => item.id === reserved.id);
  assert.equal(reservedOverride?.kills, 17);
  assert.equal(reservedOverride?.npcKills, 9);
  assert.notEqual(npc.playerRelation, -88);
  assert.notEqual(npc.karma, -123);
  assert.equal(npc.kills, 0);
  assert.equal(npc.npcKills, 0);

  recordAlifeNpcDeath(state, npc);
  const save = alifeForSave(state);
  assert.equal(save.deadIds.includes(npc.alifeId), true);
  assert.equal(save.deadIds.includes(reserved.id), false);
});

test('A-Life caps sanitized and saved dead ids', () => {
  const state = minimalState();
  const deadIds = Array.from({ length: 70_000 }, (_, index) => index + 1);
  setAlifeState(state, { seed: 12345, total: 100_000, deadIds });
  const save = alifeForSave(state);
  assert.equal(save.deadIds.length, 65_536);
  assert.equal(save.deadIds[0], 1);
  assert.equal(save.deadIds[save.deadIds.length - 1], 65_536);
});

test('A-Life quest candidates are bounded instead of every persistent NPC offering work', () => {
  const state = minimalState();
  setAlifeState(state, { seed: 12345, total: 100_000 });
  let candidates = 0;
  forEachAlifeNpcRecordSlice(state, 0, defaultAlifePopulation(), snapshot => {
    if (snapshot.canGiveQuest) candidates++;
  });

  assert.ok(candidates > 4_000, 'some persistent NPCs should be quest candidates');
  assert.ok(candidates < 24_000, 'dense floors should not make every persistent NPC a quest giver');
});

test('A-Life design-floor records use Floor 69 social population mix', () => {
  const state = minimalState();
  setAlifeState(state, { seed: 12345, total: 100_000 });
  const floor69: NonNullable<ReturnType<typeof getAlifeNpcRecordSnapshot>>[] = [];
  forEachAlifeNpcRecordSlice(state, 0, defaultAlifePopulation(), snapshot => {
    if (snapshot.floorKey === 'design:floor_69') floor69.push(snapshot);
  });
  const industrialTrades = floor69.filter(npc =>
    npc.occupation === Occupation.ELECTRICIAN ||
    npc.occupation === Occupation.TURNER,
  );

  assert.ok(floor69.length > 1000, 'floor_69 should receive a dense A-Life allocation');
  assert.equal(floor69.some(npc => npc.occupation === Occupation.CHILD), false);
  assert.ok(floor69.some(npc => npc.faction === Faction.LIQUIDATOR), 'floor_69 should include guard/liquidator records');
  assert.ok(floor69.some(npc => npc.occupation === Occupation.DOCTOR), 'floor_69 should include clinic records');
  assert.ok(floor69.some(npc => npc.occupation === Occupation.SECRETARY || npc.occupation === Occupation.STOREKEEPER), 'floor_69 should include staff/accounting records');
  assert.ok(industrialTrades.length < floor69.length * 0.05, 'floor_69 should not inherit the generic Maintenance worker mix');
});

test('A-Life generation keeps broad level and account wealth tails bounded', () => {
  const state = minimalState();
  setAlifeState(state, { seed: 12345, total: 100_000 });
  let lowLevel = 0;
  let maxLevel = 0;
  let millionaires = 0;
  let richPocket = 0;
  forEachAlifeNpcRecordSlice(state, 0, defaultAlifePopulation(), snapshot => {
    if (snapshot.level <= 10) lowLevel++;
    if (snapshot.level > maxLevel) maxLevel = snapshot.level;
    if (snapshot.money + snapshot.accountRubles >= 1_000_000) millionaires++;
    if (snapshot.money > richPocket) richPocket = snapshot.money;
  });

  assert.ok(lowLevel > 50_000, 'most generated NPCs should stay in levels 1-10');
  assert.equal(maxLevel, 100);
  assert.ok(millionaires > 0 && millionaires < 10, 'procedural millionaires should exist but stay rare');
  assert.ok(richPocket <= 2_000, 'generated NPC cash stays pocket-sized while accountRubles carries wealth');
});

test('A-Life materialization preserves template sprite identity for special floors', () => {
  const state = minimalState();
  setAlifeState(state, { seed: 12345, total: 100_000 });
  const world = new World();
  world.cells[world.idx(12, 10)] = Cell.FLOOR;
  const template = ambientTemplate(1, 12.5, 10.5);
  template.sprite = 777;
  template.npcVisualId = NPC_VISUAL_FLOOR69_FEMALE;
  template.name = 'Особый шаблон';
  template.isFemale = true;
  template.occupation = Occupation.SECRETARY;
  template.faction = Faction.SCIENTIST;
  template.isTraveler = false;
  template.assignedRoomId = 42;
  template.ai = { goal: AIGoal.WANDER, tx: 12, ty: 10, path: [{ x: 12, y: 10 }], pi: 0, stuck: 2, timer: 3 };
  const entities = [template];

  materializeAlifeFloorPopulation(state, world, entities, { v: 2 }, 'story:living');

  assert.equal(entities.length, 1);
  assert.equal(entities[0].sprite, 777);
  assert.equal(entities[0].npcVisualId, NPC_VISUAL_FLOOR69_FEMALE);
  assert.equal(entities[0].name, 'Особый шаблон');
  assert.equal(entities[0].isFemale, true);
  assert.equal(entities[0].occupation, Occupation.SECRETARY);
  assert.equal(entities[0].faction, Faction.SCIENTIST);
  assert.equal(typeof entities[0].spriteSeed, 'number');
  assert.equal(typeof entities[0].canGiveQuest, 'boolean');
  assert.equal(entities[0].isTraveler, false);
  assert.equal(entities[0].assignedRoomId, 42);
  assert.equal(entities[0].ai?.goal, AIGoal.WANDER);
  assert.equal(entities[0].ai?.path.length, 0);
});

test('A-Life materializes cash and account wealth as separate NPC fields', () => {
  const state = minimalState();
  const alife = setAlifeState(state, { seed: 12345, total: 100_000, overrides: [{ id: 1, money: 640, accountRubles: 999_360 }] }) as {
    floorIndex: Record<string, number[]>;
  };
  alife.floorIndex['story:living'] = [0];
  const world = new World();
  world.cells[world.idx(12, 10)] = Cell.FLOOR;
  const entities = [ambientTemplate(1, 12.5, 10.5)];

  materializeAlifeFloorPopulation(state, world, entities, { v: 2 }, 'story:living');

  assert.equal(entities.length, 1);
  assert.equal(entities[0].money, 640);
  assert.equal(entities[0].accountRubles, 999_360);
  assert.equal(getAlifeNpcTotalMoney(state, entities[0]), 1_000_000);
  assert.equal(alifeForSave(state).overrides.some(item =>
    item.id === 1 &&
    item.money === 640 &&
    item.accountRubles === 999_360,
  ), true);
});

test('A-Life restored floor entities preserve account wealth on capture', () => {
  const state = minimalState();
  const alife = setAlifeState(state, { seed: 12345, total: 100_000, overrides: [{ id: 1, money: 640, accountRubles: 999_360 }] }) as {
    floorIndex: Record<string, number[]>;
  };
  alife.floorIndex['story:living'] = [0];
  const world = new World();
  world.cells[world.idx(12, 10)] = Cell.FLOOR;
  const restored = ambientTemplate(1, 12.5, 10.5);
  restored.alifeId = 1;
  restored.persistentNpcId = 'alife:1';
  restored.money = 640;
  const entities = [restored];

  materializeAlifeFloorPopulation(state, world, entities, { v: 2 }, 'story:living');
  captureAlifeFloorState(state, entities);

  assert.equal(alifeForSave(state).overrides.some(item =>
    item.id === 1 &&
    item.money === 640 &&
    item.accountRubles === 999_360,
  ), true);
});

test('A-Life leaderboard includes the player as a ranked actor', () => {
  const state = minimalState();
  setAlifeState(state, { seed: 12345, total: 1_000 });
  const player: Entity = {
    id: 0,
    type: EntityType.NPC, persistentNpcId: 'player',
    x: 0,
    y: 0,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 3,
    sprite: 0,
    name: 'Жилец',
    faction: Faction.PLAYER,
    playerRelation: 100,
    karma: 0,
    kills: 300,
    npcKills: 120,
    monsterKills: 180,
    money: 10_000,
    rpg: freshRPG(RPG_LEVEL_CAP),
  };

  const snapshot = getAlifeLeaderboardSnapshot(state, player, 100);

  assert.equal(snapshot.totalAlive, alifeForSave(state).total + 1);
  assert.ok(snapshot.player.rank <= 100);
  assert.equal(snapshot.entries.some(entry => entry.player), true);
});

test('A-Life leaderboard cache respects requested limits', () => {
  const state = minimalState();
  setAlifeState(state, { seed: 12345, total: 1_000 });
  const player: Entity = {
    id: 0,
    type: EntityType.NPC, persistentNpcId: 'player',
    x: 0,
    y: 0,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    name: 'Вы',
    faction: Faction.PLAYER,
  };

  assert.equal(getAlifeLeaderboardSnapshot(state, player, 5).entries.length, 5);
  assert.equal(getAlifeLeaderboardSnapshot(state, player, 10).entries.length, 10);
});
