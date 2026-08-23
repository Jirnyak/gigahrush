import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, Occupation, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { initFactionRelations, RELATION_HOSTILE_THRESHOLD, RELATION_MAX, RELATION_MIN } from '../src/data/relations';
import { seedGlobalRng } from '../src/core/rand';
import { addAlifeFactionAttitude, createPrefilledAlifeState } from '../src/systems/alife';
import { floorKeyForDesign } from '../src/systems/floor_keys';
import {
  clearDemosNpcSocialEdges,
  getDemosNpcOnlySocialEdges,
  isDemosPersonalEnemy,
  setDemosSocialEdge,
} from '../src/systems/demos_social';
import { isHostile, isPersonalFeudEnemy, setFactionsSocialContext } from '../src/systems/factions';
import {
  isDuelLocked,
  notifyActorDamaged,
  resetCombatStimulus,
  isRecentCombatThreat,
} from '../src/systems/combat_stimulus';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { feudRoomHoldsEnemy, getFeudDebugStats, resetFeudDuels } from '../src/systems/npc_feud';
import { makeGameState, makeTestNpc, addTestRoom } from './helpers';

/* Личная вражда меняет ПОВЕДЕНИЕ, а не убивает: боевой целью она не делает,
   помогать врагу никто не идёт, его комнату обходят, а копится она до одной
   разборки один на один. */

function openWorld(): World {
  const world = new World();
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) world.set(x, y, Cell.FLOOR);
  return world;
}

function aiState() {
  return { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 10 };
}

function socialState() {
  seedGlobalRng(20260823);
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  createPrefilledAlifeState(state, 4242, 3, {
    buckets: [{
      floorKey: floorKeyForDesign('living'),
      z: 0,
      targetCount: 3,
      reserved: [
        { name: 'Сосед Первый', female: false, faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
        { name: 'Сосед Второй', female: false, faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
        { name: 'Сосед Третий', female: true, faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
      ],
    }],
  });
  for (const id of [1, 2, 3]) clearDemosNpcSocialEdges(state, id);
  return state;
}

function neighbour(id: number, alifeId: number, x: number, y: number, weapon?: string): Entity {
  return makeTestNpc({
    id, alifeId, faction: Faction.CITIZEN, name: `Сосед ${alifeId}`,
    x, y, hp: 60, maxHp: 60, ai: aiState(), occupation: Occupation.WORKER, weapon,
  });
}

test.beforeEach(() => {
  initFactionRelations();
  resetCombatStimulus();
  resetFeudDuels();
});

test.afterEach(() => {
  setFactionsSocialContext(undefined);
  resetFeudDuels();
  resetCombatStimulus();
});

test('личная вражда больше не делает соседей боевой целью', () => {
  const state = socialState();
  setFactionsSocialContext(state);
  const a = neighbour(101, 1, 10, 10);
  const b = neighbour(102, 2, 12, 10);

  assert.equal(setDemosSocialEdge(state, 1, 2, RELATION_MIN), true);
  assert.equal(isDemosPersonalEnemy(state, 1, 2), true, 'ребро вражды в графе есть');
  // Канал жив и читается — но отдельно от боевой цели.
  assert.equal(isPersonalFeudEnemy(a, b), true);
  assert.equal(isPersonalFeudEnemy(b, a), true);
  assert.equal(isHostile(a, b), false, 'дружественные фракции — не враги');
  assert.equal(isHostile(b, a), false);
});

test('вражду с дикими решает личное число, а без личности — база таблицы', () => {
  const state = socialState();
  setFactionsSocialContext(state);
  const citizen = neighbour(101, 1, 10, 10);
  // У налётчика личности нет — он процедурный, и за него отвечает база матрицы.
  const wild = makeTestNpc({ id: 103, alifeId: undefined, faction: Faction.WILD, name: 'Дикий', ai: aiState() });
  assert.equal(isHostile(wild, citizen), true, 'без личности решает база таблицы');
  // У жителя личность есть, и решает его собственная ячейка, а не фракция:
  // база «житель → дикие» лежит ниже порога вражды, но не на нём, и разброс
  // разводит соседей по разные стороны.
  addAlifeFactionAttitude(state, 1, Faction.WILD, RELATION_MIN);
  assert.equal(isHostile(citizen, wild), true);
  addAlifeFactionAttitude(state, 1, Faction.WILD, RELATION_MAX - RELATION_MIN);
  assert.equal(isHostile(citizen, wild), false, 'личное число сильнее базы фракций');
});

test('ударивший с чужой стороны всё равно становится врагом', () => {
  const state = socialState();
  setFactionsSocialContext(state);
  const world = openWorld();
  const victim = neighbour(101, 1, 10, 10);
  const stranger = makeTestNpc({
    id: 104, alifeId: 3, faction: Faction.SCIENTIST, name: 'Чужой',
    x: 11, y: 10, hp: 60, maxHp: 60, ai: aiState(),
  });
  rebuildEntityIndexForSimulation([victim, stranger], 1);
  notifyActorDamaged(world, victim, stranger, 9, 'projectile', 1, state);
  assert.equal(isRecentCombatThreat(victim, stranger, 1), true, 'шальная пуля с чужой стороны делает врагом');
});

test('личный враг не приходит на помощь, когда бьют его недруга', () => {
  const state = socialState();
  setFactionsSocialContext(state);
  const world = openWorld();
  addTestRoom(world, { id: 0, x: 8, y: 8, w: 10, h: 10 });
  // Отзыв своих идёт только с реакции «драться»: безоружный бежит, и звать
  // некого. Все трое вооружены, чтобы мерялась именно личная неприязнь.
  const victim = neighbour(101, 1, 10, 10, 'makarov');
  const hater = neighbour(102, 2, 11, 10, 'makarov');
  const friend = neighbour(103, 3, 12, 10, 'makarov');
  const attacker = makeTestNpc({
    id: 105, alifeId: undefined, faction: Faction.WILD, name: 'Налётчик',
    x: 13, y: 10, hp: 60, maxHp: 60, ai: aiState(),
  });
  setDemosSocialEdge(state, 2, 1, RELATION_MIN);
  rebuildEntityIndexForSimulation([victim, hater, friend, attacker], 1);

  notifyActorDamaged(world, victim, attacker, 12, 'npc_melee', 1, state);

  assert.equal(isRecentCombatThreat(friend, attacker, 1), true, 'обычный сосед вступается');
  assert.equal(isRecentCombatThreat(hater, attacker, 1), false, 'личный враг — нет');
});

test('комната, где стоит личный враг, теряет вес', () => {
  const state = socialState();
  setFactionsSocialContext(state);
  const world = openWorld();
  addTestRoom(world, { id: 0, x: 4, y: 4, w: 6, h: 6 });
  addTestRoom(world, { id: 1, x: 20, y: 20, w: 6, h: 6, zoneId: 1 });
  const actor = neighbour(101, 1, 5, 5);
  const enemy = neighbour(102, 2, 22, 22);
  rebuildEntityIndexForSimulation([actor, enemy], 1);

  assert.equal(feudRoomHoldsEnemy(world, actor, 1), false, 'без ребра комната обычная');
  setDemosSocialEdge(state, 1, 2, RELATION_MIN);
  state.time += 10; // кэш избегания живёт тактом распорядителя
  assert.equal(feudRoomHoldsEnemy(world, actor, 1), true, 'враг стоит в комнате 1');
  assert.equal(feudRoomHoldsEnemy(world, actor, 0), false, 'своя комната не наказана');
});

/* ── Разборка ─────────────────────────────────────────────────────── */

function runFeudHook(world: World, entities: Entity[], state: GameStateLike, dt: number): void {
  rebuildEntityIndexForSimulation(entities, Math.floor(state.time * 60));
  setFactionsSocialContext(state as never);
  updateContentRuntimeHooks({
    world,
    entities,
    player: entities[0],
    state: state as never,
    nextEntityId: { v: 900 },
    dt,
    phase: 'floor_activity',
    gameOver: false,
  });
  state.time += dt;
}

type GameStateLike = { time: number };

test('накопившаяся вражда разрешается разборкой: вызов, ринг, исход, событие', () => {
  const state = socialState();
  setFactionsSocialContext(state);
  const world = openWorld();
  addTestRoom(world, { id: 0, x: 8, y: 8, w: 12, h: 12 });
  // Двое стоят почти вплотную: дорога к месту занимает считанные такты.
  const a = neighbour(101, 1, 13, 13);
  const b = neighbour(102, 2, 14, 13);
  const bystander = neighbour(103, 3, 15, 13);
  setDemosSocialEdge(state, 1, 2, RELATION_MIN);
  const entities = [a, b, bystander];

  let called = false;
  for (let i = 0; i < 200 && !called; i++) {
    runFeudHook(world, entities, state as never, 4);
    called = getFeudDebugStats().called > 0;
  }
  assert.equal(called, true, 'вызов состоялся');
  const challenge = getRecentEvents(state, { tags: ['feud'], limit: 8 });
  assert.ok(challenge.some(e => e.type === 'npc_feud_challenge'), 'вызов опубликован событием');

  // Пока разборка идёт — оба под замком поединка, свои не вмешиваются.
  if (getFeudDebugStats().active) {
    assert.equal(isDuelLocked(a), true);
    assert.equal(isDuelLocked(b), true);
    assert.equal(isDuelLocked(bystander), false);
  }

  for (let i = 0; i < 200 && getFeudDebugStats().resolved === 0; i++) {
    runFeudHook(world, entities, state as never, 4);
  }
  const stats = getFeudDebugStats();
  assert.equal(stats.resolved, 1, 'разборка разрешилась');
  assert.equal(stats.active, false);
  assert.equal(isDuelLocked(a), false, 'замок снят');
  assert.equal(isDuelLocked(b), false);

  // Любой исход разряжает вражду: пара перестаёт быть враждебной.
  assert.equal(isDemosPersonalEnemy(state, 1, 2), false, 'вражда разряжена');
  assert.equal(isDemosPersonalEnemy(state, 2, 1), false, 'встречное ребро тоже');
  const settled = getDemosNpcOnlySocialEdges(state, 1).find(e => e.targetAlifeId === 2);
  assert.ok(settled && settled.relation > RELATION_HOSTILE_THRESHOLD, 'ребро выше порога вражды');
  assert.ok(
    getRecentEvents(state, { tags: ['feud'], limit: 8 }).some(e => e.type === 'npc_feud_resolved'),
    'исход опубликован событием',
  );
});

test('на ринге разборка идёт обычным боевым путём, а сдаётся тот, кому нечем драться', () => {
  const state = socialState();
  setFactionsSocialContext(state);
  const world = openWorld();
  addTestRoom(world, { id: 0, x: 8, y: 8, w: 12, h: 12 });
  const a = neighbour(101, 1, 13, 13, 'makarov');
  const b = neighbour(102, 2, 14, 13, 'makarov');
  setDemosSocialEdge(state, 1, 2, RELATION_MIN);
  const entities = [a, b];

  for (let i = 0; i < 20 && !getFeudDebugStats().active; i++) runFeudHook(world, entities, state as never, 4);
  assert.equal(getFeudDebugStats().active, true, 'разборка идёт');
  // Оба стоят на ринге — следующий такт переводит в бой и наводит их друг на друга
  // штатной боевой памятью. Своего оружия у разборки нет.
  runFeudHook(world, entities, state as never, 4);
  runFeudHook(world, entities, state as never, 4);
  assert.equal(isRecentCombatThreat(a, b, state.time), true, 'наведён через боевую память');
  assert.equal(isRecentCombatThreat(b, a, state.time), true);

  // Раненый до потери храбрости уступает — смерть не обязательна.
  b.hp = 4;
  runFeudHook(world, entities, state as never, 4);
  const stats = getFeudDebugStats();
  assert.equal(stats.lastOutcome, 'yield', 'исход — уступил, а не погиб');
  assert.equal(b.alive, true, 'проигравший жив');
  assert.equal(isDemosPersonalEnemy(state, 1, 2), false, 'вражда разряжена уступкой');
});

test('разборка снимается самосбором и не заводится во время него', () => {
  const state = socialState();
  const world = openWorld();
  addTestRoom(world, { id: 0, x: 8, y: 8, w: 12, h: 12 });
  const a = neighbour(101, 1, 13, 13);
  const b = neighbour(102, 2, 14, 13);
  setDemosSocialEdge(state, 1, 2, RELATION_MIN);
  const entities = [a, b];

  state.samosborActive = true;
  for (let i = 0; i < 10; i++) runFeudHook(world, entities, state as never, 4);
  assert.equal(getFeudDebugStats().called, 0, 'во время самосбора разборок не заводят');

  state.samosborActive = false;
  for (let i = 0; i < 200 && getFeudDebugStats().called === 0; i++) {
    runFeudHook(world, entities, state as never, 4);
  }
  assert.equal(getFeudDebugStats().called, 1);
  if (getFeudDebugStats().active) {
    state.samosborActive = true;
    runFeudHook(world, entities, state as never, 4);
    assert.equal(getFeudDebugStats().active, false, 'самосбор снял разборку');
  }
});

test('сущность без личности не попадает в разборку', () => {
  const state = socialState();
  const world = openWorld();
  addTestRoom(world, { id: 0, x: 8, y: 8, w: 12, h: 12 });
  const nameless = makeTestNpc({
    id: 108, alifeId: undefined, faction: Faction.CITIZEN, name: 'Безымянный',
    x: 13, y: 13, hp: 60, maxHp: 60, ai: aiState(),
  });
  const other = neighbour(102, 2, 14, 13);
  for (let i = 0; i < 20; i++) runFeudHook(world, [nameless, other], state as never, 4);
  assert.equal(getFeudDebugStats().called, 0);
  assert.equal(feudRoomHoldsEnemy(world, nameless, 0), false);
});

test('элемент типа "монстр" мимо разборок и мимо личного канала', () => {
  const state = socialState();
  setFactionsSocialContext(state);
  const world = openWorld();
  const npc = neighbour(101, 1, 10, 10);
  const monster = makeTestNpc({ id: 200, alifeId: 2, name: 'Тварь', x: 11, y: 10, ai: aiState() });
  monster.type = EntityType.MONSTER;
  setDemosSocialEdge(state, 1, 2, RELATION_MIN);
  assert.equal(feudRoomHoldsEnemy(world, monster, 0), false, 'монстр не ведёт список личных врагов');
});
