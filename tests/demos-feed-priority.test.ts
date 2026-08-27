/* Замок на ленте Демоса: смерть человека не теряется под рутиной.
 *
 * История. Такт ленты — 30 с, разбор — 64 события за такт, а живой жилой этаж
 * даёт сотни событий в минуту. Курсор брал 64 САМЫХ СВЕЖИХ непрочитанных и
 * прыгал на максимум их id, поэтому всё, что не влезло в окно, пропадало
 * бесследно и без счётчика. Замер на сиде 1337 (120 с, 1835 NPC): из 901
 * события до ленты доехало 17, все 13 смертей людей потерялись.
 *
 * Правило, которое сторожит этот файл: событие от `WORLD_EVENT_IMPORTANT_SEVERITY`
 * доезжает до ленты при любом объёме рутины, а то, мимо чего курсор всё-таки
 * прыгнул, попадает в счётчик потерь, а не в тишину.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, Faction, Occupation, type Entity, type GameState } from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { initFactionRelations } from '../src/data/relations';
import { createPrefilledAlifeState } from '../src/systems/alife';
import { floorKeyForDesign } from '../src/systems/floor_keys';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { createWorldEventState, publishEvent, compareEventPriority } from '../src/systems/events';
import type { WorldEvent } from '../src/core/types';
import { clearDemosNpcSocialEdges } from '../src/systems/demos_social';
import { makeGameState, makeTestNpc } from './helpers';
import '../src/systems/demos_runtime';

interface DemosHost extends GameState {
  demosSocial?: { posts: { sourceEventId?: number }[]; eventCursor: number };
  demosRuntime?: { dropped: number; droppedImportant: number; seen: number; consumed: number };
}

/** Столько рутины, что старое окно в 64 события гарантированно её не вмещало. */
const ROUTINE_BEFORE = 300;
const ROUTINE_AFTER = 300;

function openWorld(): World {
  const world = new World();
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) world.set(x, y, Cell.FLOOR);
  return world;
}

function socialState(): GameState {
  seedGlobalRng(20260827);
  initFactionRelations();
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  createPrefilledAlifeState(state, 4242, 3, {
    buckets: [{
      floorKey: floorKeyForDesign('living'),
      z: 0,
      targetCount: 3,
      reserved: [
        { name: 'Жилец Первый', female: false, faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
        { name: 'Жилец Второй', female: true, faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
        { name: 'Жилец Третий', female: false, faction: Faction.CITIZEN, occupation: Occupation.WORKER, level: 3 },
      ],
    }],
  });
  for (const id of [1, 2, 3]) clearDemosNpcSocialEdges(state, id);
  return state;
}

/** Рутина: та самая мелочь, которой на живом этаже сотни в минуту. */
function publishRoutine(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    publishEvent(state, {
      type: 'monster_sighted',
      severity: 2,
      privacy: 'local',
      tags: ['routine'],
      data: { actorAlifeId: 1 },
    });
  }
}

function publishDeath(state: GameState): number {
  return publishEvent(state, {
    type: 'npc_kill_npc',
    severity: 4,
    privacy: 'local',
    tags: ['combat', 'kill', 'npc'],
    actorId: 11,
    actorName: 'Жилец Первый',
    targetId: 12,
    targetName: 'Жилец Второй',
    data: { actorAlifeId: 1, targetAlifeId: 2, source: 'npc_ranged' },
  }).id;
}

function runFeedTick(state: GameState, world: World, entities: Entity[]): void {
  updateContentRuntimeHooks({
    world,
    entities,
    player: entities[0],
    state,
    nextEntityId: { v: 900 },
    dt: 30,
    phase: 'floor_activity',
    gameOver: false,
  });
}

test('смерть человека доезжает до ленты сквозь сотни рутинных событий', () => {
  const state = socialState();
  const world = openWorld();
  const entities: Entity[] = [
    makeTestNpc({ id: 11, alifeId: 1, faction: Faction.CITIZEN, name: 'Жилец Первый', x: 10.5, y: 10.5 }),
    makeTestNpc({ id: 12, alifeId: 2, faction: Faction.CITIZEN, name: 'Жилец Второй', x: 12.5, y: 10.5 }),
  ];

  publishRoutine(state, ROUTINE_BEFORE);
  const deathId = publishDeath(state);
  publishRoutine(state, ROUTINE_AFTER);

  runFeedTick(state, world, entities);

  const host = state as DemosHost;
  const posts = host.demosSocial?.posts ?? [];
  assert.ok(
    posts.some(post => post.sourceEventId === deathId),
    `смерть #${deathId} не попала в ленту: посты по событиям ${posts.map(p => p.sourceEventId).join(',')}`,
  );
});

test('потери курсора видимы: счётчик отброшенного растёт, важное в него не попадает', () => {
  const state = socialState();
  const world = openWorld();
  const entities: Entity[] = [
    makeTestNpc({ id: 11, alifeId: 1, faction: Faction.CITIZEN, name: 'Жилец Первый', x: 10.5, y: 10.5 }),
  ];

  publishRoutine(state, ROUTINE_BEFORE);
  const deathId = publishDeath(state);
  publishRoutine(state, ROUTINE_AFTER);

  runFeedTick(state, world, entities);

  const host = state as DemosHost;
  const runtime = host.demosRuntime;
  assert.ok(runtime, 'рантайм ленты не завёлся');
  // Счётчик важных потерь не должен быть пустым по недосмотру: важное событие в
  // такте было, и оно доехало.
  assert.ok(
    (host.demosSocial?.posts ?? []).some(post => post.sourceEventId === deathId),
    'важное событие не доехало, а счётчик важных потерь молчит',
  );
  // Бюджет такта узкий, и часть рутины он перепрыгнул — это законно. Незаконно
  // было бы, если бы перепрыгнутое не считалось вовсе.
  assert.ok(runtime.dropped > 0, 'потери есть, а счётчик их не видит');
  assert.equal(runtime.droppedImportant, 0, 'важное событие потеряно');
  assert.equal(runtime.seen, runtime.consumed + runtime.dropped, 'учёт не сходится');
});

test('порядок разбора: важное раньше рутины, внутри разряда — строго по времени', () => {
  const at = (id: number, severity: WorldEvent['severity']): WorldEvent => ({
    id, type: 'monster_sighted', time: id, day: 0, hour: 0, minute: 0, z: 0,
    severity, privacy: 'local', truth: 'fact', tags: [],
  } as WorldEvent);
  // Внутри важного разряда пятёрка НЕ обгоняет четвёрку: очередь важного
  // разбирается по возрастанию id, иначе курсор «максимум разобранного»
  // накрывает недобранное важное и теряет его молча.
  const order = [at(1, 2), at(9, 4), at(2, 3), at(7, 5), at(3, 4), at(8, 1)]
    .sort(compareEventPriority)
    .map(event => event.id);
  assert.deepEqual(order, [3, 7, 9, 1, 2, 8]);
});
