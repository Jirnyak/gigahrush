import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIGoal, Cell, EntityType, Faction, Occupation, RoomType,
  type Entity, type GameState, type Room,
} from '../src/core/types';
import { World } from '../src/core/world';
import {
  ALIFE_ARENA_CHAMPION_PLAYER,
  alifeForSave,
  alifeNpcRecordCount,
  createPrefilledAlifeState,
  getAlifeArenaChampion,
  getAlifeNpcRecordSnapshot,
  isAlifeArenaFighter,
  listAlifeArenaFighters,
  recordAlifeNpcDeath,
  selectAlifeArenaLadderIds,
  setAlifeArenaChampion,
  setAlifeArenaFighter,
  setAlifeState,
  type AlifePopulationPlan,
} from '../src/systems/alife';
import {
  isArenaPlayerBoutActive,
  requestArenaChallenge,
  requestArenaMutantBout,
  resetArenaLadderRuntime,
  updateArenaLadder,
} from '../src/systems/arena_ladder';
import { getRecentCombatThreat, isDuelLocked } from '../src/systems/combat_stimulus';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { getPlotNpcCount } from '../src/data/npc_packages';
import { setFloorRunState } from '../src/systems/procedural_floors';

/* Боец арены — свойство ЛИЧНОСТИ A-Life, а не спавна: он остаётся бойцом, пока
 * жив, где бы ни находился, и переживает перезагрузку. Титул при этом ровно
 * один и хранится указателем, а не копией в каждом бойце — иначе возможны два
 * чемпиона сразу. Обе половины правила и проверяются здесь. */

const ARENA_FLOOR = 'design:liquidatorbase';

function arenaState(): GameState {
  const state = {
    currentZ: 0, time: 0, msgs: [], msgLog: [], clock: { hour: 8, minute: 0, totalMinutes: 0 },
  } as unknown as GameState;
  setFloorRunState(state, undefined);
  const plan: AlifePopulationPlan = {
    buckets: [{
      floorKey: ARENA_FLOOR,
      z: -16,
      targetCount: 6,
      majorityFaction: Faction.LIQUIDATOR,
      reserved: [
        { name: 'Слабый Боец', faction: Faction.LIQUIDATOR, occupation: Occupation.GUARD, level: 2, maxHp: 200, hp: 200 },
        { name: 'Средний Боец', faction: Faction.LIQUIDATOR, occupation: Occupation.GUARD, level: 5, maxHp: 500, hp: 500 },
        { name: 'Чемпион Песка', faction: Faction.LIQUIDATOR, occupation: Occupation.GUARD, level: 9, maxHp: 900, hp: 900 },
      ],
    }],
  };
  createPrefilledAlifeState(state, 4242, 6, plan);
  return state;
}

/** Сюда попадают только объявленные выше трое: у них заданы уровни. */
function reservedIds(state: GameState): number[] {
  const ids: number[] = [];
  for (let id = 1; id <= alifeNpcRecordCount(state); id++) {
    const snapshot = getAlifeNpcRecordSnapshot(state, id);
    if (snapshot?.name.endsWith('Боец') || snapshot?.name === 'Чемпион Песка') ids.push(id);
  }
  return ids;
}

/* Ростер покрывает ДИАПАЗОН силы мира, а не его край. Обе крайности замерены и
 * отвергнуты: набор из гарнизона базы дал восемь ур.1, буквальный топ — восемь
 * ур.99..100. Ни то, ни другое лестницей не является. */
test('ростер берёт по представителю на ступень, а не восемь сильнейших подряд', () => {
  const state = arenaState();
  const total = alifeNpcRecordCount(state);
  assert.ok(total >= 6, 'нужен пул, по которому есть что раскладывать');

  const ids = selectAlifeArenaLadderIds(state, 3);
  assert.ok(ids.length > 0);
  const levels = ids.map(id => getAlifeNpcRecordSnapshot(state, id)!.level);
  // Ступени идут вверх и не повторяют одно и то же число.
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] > levels[i - 1], `ступени растут: ${levels}`);
  // Верхняя ступень — сильнейший мира: слабее него в пуле никого выше нет.
  let peak = 0;
  for (let id = 1; id <= total; id++) {
    const s = getAlifeNpcRecordSnapshot(state, id);
    if (s && !s.dead && !s.reservedKind && s.level > peak) peak = s.level;
  }
  assert.equal(levels[levels.length - 1], peak, 'вершина лестницы = потолок силы мира');
  // Сюжетные и авторские личности на песок не выходят: их смерть запирает цепочки.
  for (const id of ids) assert.equal(getAlifeNpcRecordSnapshot(state, id)?.reservedKind, undefined);
});

test('лестница арены строится по силе и не берёт мёртвых', () => {
  const state = arenaState();
  const ids = reservedIds(state);
  assert.equal(ids.length, 3, 'три объявленных бойца должны найтись');
  for (const id of ids) assert.equal(setAlifeArenaFighter(state, id, true), true);

  const ladder = listAlifeArenaFighters(state);
  assert.equal(ladder.length, 3);
  assert.deepEqual(ladder.map(f => f.name), ['Слабый Боец', 'Средний Боец', 'Чемпион Песка']);
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i].level >= ladder[i - 1].level, 'от слабейшего к сильнейшему');
  }

  // Этаж — фильтр, а не условие существования флага.
  assert.equal(listAlifeArenaFighters(state, ARENA_FLOOR).length, 3);
  assert.equal(listAlifeArenaFighters(state, 'design:living').length, 0);
});

test('флаг бойца и титул чемпиона переживают сохранение', () => {
  const state = arenaState();
  const ids = reservedIds(state);
  for (const id of ids) setAlifeArenaFighter(state, id, true);
  const championId = ids[ids.length - 1];
  setAlifeArenaChampion(state, championId);

  const saved = JSON.parse(JSON.stringify(alifeForSave(state)));
  const restored = { currentZ: 0 } as GameState;
  setFloorRunState(restored, undefined);
  setAlifeState(restored, saved);

  assert.equal(getAlifeArenaChampion(restored), championId);
  assert.deepEqual(
    listAlifeArenaFighters(restored).map(f => f.name),
    ['Слабый Боец', 'Средний Боец', 'Чемпион Песка'],
  );
  for (const id of ids) assert.equal(isAlifeArenaFighter(restored, id), true);
});

test('титул игрока переживает сохранение и не путается со слотом личности', () => {
  const state = arenaState();
  setAlifeArenaChampion(state, ALIFE_ARENA_CHAMPION_PLAYER);
  const saved = JSON.parse(JSON.stringify(alifeForSave(state)));
  const restored = { currentZ: 0 } as GameState;
  setFloorRunState(restored, undefined);
  setAlifeState(restored, saved);
  assert.equal(getAlifeArenaChampion(restored), ALIFE_ARENA_CHAMPION_PLAYER);

  // Мусор в payload означает «титул свободен», а не случайного чемпиона.
  const dirty = { currentZ: 0 } as GameState;
  setFloorRunState(dirty, undefined);
  setAlifeState(dirty, { ...saved, arenaChampionAlifeId: 999_999 });
  assert.equal(getAlifeArenaChampion(dirty), undefined);
});

test('смерть чемпиона освобождает титул, но не стирает прожитого', () => {
  const state = arenaState();
  const ids = reservedIds(state);
  for (const id of ids) setAlifeArenaFighter(state, id, true);
  const championId = ids[ids.length - 1];
  setAlifeArenaChampion(state, championId);

  const corpse = { id: 4001, alifeId: championId, alive: false, x: 10, y: 10 } as unknown as Entity;
  recordAlifeNpcDeath(state, corpse);

  assert.equal(getAlifeArenaChampion(state), undefined, 'мёртвый титул не носит');
  assert.equal(isAlifeArenaFighter(state, championId), false, 'мёртвый не стоит в лестнице');
  assert.equal(listAlifeArenaFighters(state).length, 2);
  // Флаг остаётся частью записи: по нему видно, кем человек был при жизни.
  assert.equal(getAlifeNpcRecordSnapshot(state, championId)?.arenaFighter, true);
});

test('чемпионом нельзя назначить мёртвого или несуществующего', () => {
  const state = arenaState();
  const ids = reservedIds(state);
  const victim = ids[0];
  recordAlifeNpcDeath(state, { id: 4002, alifeId: victim, alive: false, x: 1, y: 1 } as unknown as Entity);

  setAlifeArenaChampion(state, victim);
  assert.equal(getAlifeArenaChampion(state), undefined);
  setAlifeArenaChampion(state, alifeNpcRecordCount(state) + 50);
  assert.equal(getAlifeArenaChampion(state), undefined);
  assert.equal(setAlifeArenaFighter(state, victim, true), false, 'мёртвый на песок не выходит');
});

test('флаг бойца не рождает людей: население не растёт', () => {
  const state = arenaState();
  const before = alifeNpcRecordCount(state);
  for (const id of reservedIds(state)) setAlifeArenaFighter(state, id, true);
  setAlifeArenaChampion(state, ALIFE_ARENA_CHAMPION_PLAYER);
  assert.equal(alifeNpcRecordCount(state), before);
});

/* ── Поединок игрока ──────────────────────────────────────────────
 * Игрок дерётся САМ, и дерётся обычным боевым AI: противник получает
 * принудительную боевую память с реакцией `fight`, которая обходит и матрицу
 * фракций, и бегство. Убил чемпиона — сам чемпион. Ушёл с песка — бой окончен.
 */

const RING_X = 40;
const RING_Y = 40;
const RING_SIDE = 12;

function arenaWorld(): World {
  const world = new World();
  for (let y = RING_Y; y < RING_Y + RING_SIDE; y++) {
    for (let x = RING_X; x < RING_X + RING_SIDE; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.roomMap[idx] = 0;
    }
  }
  const ring: Room = {
    id: 0, type: RoomType.COMMON, x: RING_X, y: RING_Y, w: RING_SIDE, h: RING_SIDE,
    doors: [], sealed: false, name: 'Арена Базы', tags: ['arena'],
    apartmentId: -1, wallTex: 0, floorTex: 0,
  };
  world.rooms.push(ring);
  return world;
}

function playerEntity(): Entity {
  return {
    id: 1, type: EntityType.NPC, x: RING_X + 6.5, y: RING_Y + 6.5,
    angle: 0, pitch: 0, alive: true, speed: 1.2, sprite: 0,
    hp: 5000, maxHp: 5000, faction: Faction.PLAYER, questId: -1,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  } as unknown as Entity;
}

function runBoutTicks(
  world: World, entities: Entity[], player: Entity, state: GameState, nextId: { v: number }, ticks: number,
): void {
  for (let i = 0; i < ticks; i++) {
    rebuildEntityIndexForSimulation(entities, player.id);
    updateArenaLadder(world, entities, player, state, nextId, 0.1);
  }
}

test('вызов ступени выводит бойца на песок и натравливает его на игрока', () => {
  resetArenaLadderRuntime();
  const state = arenaState();
  state.msgs = [];
  state.time = 0;
  const ids = reservedIds(state);
  for (const id of ids) setAlifeArenaFighter(state, id, true);

  const world = arenaWorld();
  const player = playerEntity();
  const entities: Entity[] = [player];
  const nextId = { v: getPlotNpcCount() + 100 };

  requestArenaChallenge(ids[0]);
  runBoutTicks(world, entities, player, state, nextId, 2);

  const opponent = entities.find(e => e.alifeId === ids[0]);
  assert.ok(opponent, 'противник вышел на песок');
  assert.equal(isArenaPlayerBoutActive(), true);
  // Обычный боевой AI: цель принудительная, реакция — драться, а не бежать.
  const threat = getRecentCombatThreat(opponent, state.time);
  assert.equal(threat?.attackerId, player.id);
  assert.equal(threat?.reaction, 'fight');
  // Поединок объявлен: гарнизон в него не вступается.
  assert.equal(isDuelLocked(opponent), true);
  assert.equal(isDuelLocked(player), true);
});

test('смерть чемпиона от руки игрока отдаёт песок игроку и выдаёт награду', () => {
  resetArenaLadderRuntime();
  const state = arenaState();
  state.msgs = [];
  state.time = 0;
  const ids = reservedIds(state);
  for (const id of ids) setAlifeArenaFighter(state, id, true);
  const championId = ids[ids.length - 1];
  setAlifeArenaChampion(state, championId);

  const world = arenaWorld();
  const player = playerEntity();
  const entities: Entity[] = [player];
  const nextId = { v: getPlotNpcCount() + 100 };

  requestArenaChallenge(championId);
  runBoutTicks(world, entities, player, state, nextId, 2);
  const champion = entities.find(e => e.alifeId === championId);
  assert.ok(champion);

  champion.alive = false;
  runBoutTicks(world, entities, player, state, nextId, 2);

  assert.equal(getAlifeArenaChampion(state), ALIFE_ARENA_CHAMPION_PLAYER, 'песок перешёл игроку');
  assert.equal(isArenaPlayerBoutActive(), false);
  assert.equal(isDuelLocked(player), false, 'поединок закрыт — замок снят');
  // Награда чемпиона написана давно и ждала ровно этого условия победы.
  assert.ok(player.inventory?.some(item => item.defId === 'arena_gold_trophy'), 'Золотой Кубок выдан');
});

test('бои с мутантами идут волнами и платят за очищенную, а не за пустую', () => {
  resetArenaLadderRuntime();
  const state = arenaState();
  const world = arenaWorld();
  const player = playerEntity();
  player.money = 0;
  const entities: Entity[] = [player];
  const nextId = { v: getPlotNpcCount() + 100 };

  requestArenaMutantBout();
  runBoutTicks(world, entities, player, state, nextId, 1);
  const firstWave = entities.filter(e => e.type === EntityType.MONSTER);
  assert.ok(firstWave.length > 0, 'первая волна вышла на песок');
  assert.equal(isArenaPlayerBoutActive(), true);
  assert.equal(player.money, 0, 'до победы касса закрыта');

  for (const monster of firstWave) monster.alive = false;
  runBoutTicks(world, entities, player, state, nextId, 1);
  assert.ok((player.money ?? 0) > 0, 'за очищенную волну заплатили');
  const secondWave = entities.filter(e => e.type === EntityType.MONSTER && e.alive);
  assert.ok(secondWave.length > 0, 'следующая волна вышла');
  assert.ok(secondWave.length >= firstWave.length, 'волна не слабеет');
});

test('волне некуда встать — песок закрывается, а не платит каждый кадр', () => {
  resetArenaLadderRuntime();
  const state = arenaState();
  // Кольцо есть, пола под спавн нет: волна не встаёт ни одной клеткой.
  const world = arenaWorld();
  for (let y = RING_Y; y < RING_Y + RING_SIDE; y++) {
    for (let x = RING_X; x < RING_X + RING_SIDE; x++) {
      if (x === RING_X + 6 && y === RING_Y + 6) continue;
      world.cells[world.idx(x, y)] = Cell.WALL;
    }
  }
  const player = playerEntity();
  player.money = 0;
  const entities: Entity[] = [player];
  const nextId = { v: getPlotNpcCount() + 100 };

  requestArenaMutantBout();
  runBoutTicks(world, entities, player, state, nextId, 4);
  assert.equal(isArenaPlayerBoutActive(), false, 'пустой песок закрыт, а не крутится');
  assert.equal(player.money, 0, 'касса за несостоявшуюся волну не открывается');
  assert.equal(isDuelLocked(player), false);
});

test('уход с песка закрывает бой, а не оставляет его за спиной', () => {
  resetArenaLadderRuntime();
  const state = arenaState();
  state.msgs = [];
  state.time = 0;
  const ids = reservedIds(state);
  for (const id of ids) setAlifeArenaFighter(state, id, true);

  const world = arenaWorld();
  const player = playerEntity();
  const entities: Entity[] = [player];
  const nextId = { v: getPlotNpcCount() + 100 };

  requestArenaChallenge(ids[0]);
  runBoutTicks(world, entities, player, state, nextId, 2);
  assert.equal(isArenaPlayerBoutActive(), true);

  player.x = 5.5;
  player.y = 5.5;
  runBoutTicks(world, entities, player, state, nextId, 1);
  assert.equal(isArenaPlayerBoutActive(), false);
  assert.equal(isDuelLocked(player), false);
  // Титул при этом не переходит: игрок ушёл, а не победил.
  assert.notEqual(getAlifeArenaChampion(state), ALIFE_ARENA_CHAMPION_PLAYER);
});
