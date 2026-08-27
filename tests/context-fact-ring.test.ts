/**
 * Замок на кольца контекстных фактов и мировых событий.
 *
 * Замер на живом этаже (`production_belt`, 1973 актора, 180 c): 1396 мировых
 * событий в минуту дают 435 контекстных фактов в минуту, из них 86% — род
 * `death` (NPC режут монстров пачками). Кольцо на 512 ячеек оборачивалось за
 * 71 c при обещанном сроке жизни факта кражи 720 c, а окно читателя из 12
 * записей покрывало 1.7 c: одна кража, положенная в кольцо на первой секунде,
 * переставала быть видимой снимку контекста НА ВТОРОЙ.
 *
 * Оба конца закрыты без поднятия капа: читатель считает бюджет по фактам
 * своего рода, а вытеснение уносит самый старый факт самого многочисленного
 * рода. Здесь стоят обе стороны правила.
 *
 * Кольцо мировых событий болело тем же: 1396 событий в минуту против окна в 12
 * записей — 0.5 c. Хуже всего было трём охранникам, у которых опоры на факты
 * нет вовсе (`hasRecentMetroEvent`, `hasRecentLiftAnomaly`,
 * `hasRecentContainerOpen`): их типы событий фактов не порождают, и на людном
 * этаже они не срабатывали НИКОГДА, хотя издатели у всех десяти типов живые
 * (`systems/metro.ts`, `gen/dark_metro/meta.ts`, `systems/lift_arachna.ts`,
 * `systems/floor_instances.ts`, `systems/debug.ts`, `systems/containers.ts`,
 * `gen/service_floor/meta.ts`, `gen/void/perestanovshchik.ts`,
 * `gen/maintenance/cult_held_workshop.ts`).
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Faction, WORLD_EVENT_IMPORTANT_CAPACITY } from '../src/core/types';
import { buildContextSnapshot } from '../src/systems/context';
import {
  createWorldEventState,
  getContextFactStreamStats,
  publishEvent,
  resetContextFactStreamStats,
} from '../src/systems/events';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

function floodMonsterKills(state: ReturnType<typeof makeGameState>, count: number, time: number): void {
  for (let i = 0; i < count; i++) {
    publishEvent(state, {
      type: 'npc_kill_monster',
      actorId: 5000 + i,
      targetId: 6000 + i,
      severity: 2,
      privacy: 'public',
      tags: ['kill'],
      time,
    });
  }
}

function stealWater(state: ReturnType<typeof makeGameState>, playerId: number, time: number): void {
  publishEvent(state, {
    type: 'item_stolen',
    roomId: 7,
    actorId: playerId,
    actorName: 'Игрок',
    actorFaction: Faction.PLAYER,
    itemId: 'water',
    itemName: 'Вода',
    itemValue: 30,
    containerId: 91,
    severity: 4,
    privacy: 'witnessed',
    tags: ['container', 'theft', 'witnessed'],
    time,
  });
}

test('поток чужого рода не прячет редкий факт от снимка контекста', () => {
  const state = makeGameState({ currentZ: 0, time: 0, worldEvents: createWorldEventState() });
  const player = makeTestPlayer({ id: 0, name: 'Игрок' });
  const npc = makeTestNpc({ id: 50501, name: 'Свидетель' });

  stealWater(state, player.id, 1);
  /* Вдвое больше записей, чем старое окно читателя, но далеко до капа кольца:
   * здесь проверяется именно бюджет читателя, а не вытеснение. */
  floodMonsterKills(state, 64, 2);

  const now = 3;
  const snapshot = buildContextSnapshot(npc, { state, player, time: now });
  assert.equal(snapshot.hasRecentPlayerTheft, true, 'кража с TTL 720 c обязана пережить 64 чужих факта');
  assert.equal(snapshot.hasRecentMonsterKill, true, 'поток убийств при этом читается по-прежнему');
});

test('срок жизни факта соблюдается, а не подменяется числом записей', () => {
  const state = makeGameState({ currentZ: 0, time: 0, worldEvents: createWorldEventState() });
  const player = makeTestPlayer({ id: 0, name: 'Игрок' });
  const npc = makeTestNpc({ id: 50502, name: 'Свидетель' });

  stealWater(state, player.id, 1);
  floodMonsterKills(state, 64, 2);

  /* TTL факта кражи — 720 c. За его пределами он обязан замолчать даже без
   * вытеснения: иначе «недавно» перестаёт значить что-либо. */
  const snapshot = buildContextSnapshot(npc, { state, player, time: 1_000 });
  assert.equal(snapshot.hasRecentPlayerTheft, false);
});

test('вытесняет самый старый факт самого многочисленного рода', () => {
  const state = makeGameState({ currentZ: 0, time: 0, worldEvents: createWorldEventState() });
  const player = makeTestPlayer({ id: 0, name: 'Игрок' });
  const npc = makeTestNpc({ id: 50503, name: 'Свидетель' });
  resetContextFactStreamStats();

  stealWater(state, player.id, 1);
  floodMonsterKills(state, WORLD_EVENT_IMPORTANT_CAPACITY * 2, 2);

  const store = state.worldEvents!;
  assert.equal(store.facts.length, WORLD_EVENT_IMPORTANT_CAPACITY, 'кап кольца остаётся прежним');
  assert.equal(
    store.facts.some(fact => fact.kind === 'theft'),
    true,
    'редкий факт переживает вытеснение, потому что уходит давящий род',
  );

  const stats = getContextFactStreamStats();
  const deathSlot = stats.kinds.indexOf('death');
  const theftSlot = stats.kinds.indexOf('theft');
  assert.ok(stats.dropped > 0, 'потери должны быть посчитаны, а не молча случиться');
  assert.equal(stats.droppedUnexpiredByKind[theftSlot], 0);
  assert.equal(stats.droppedUnexpiredByKind[deathSlot], stats.droppedUnexpired);

  const snapshot = buildContextSnapshot(npc, { state, player, time: 3 });
  assert.equal(snapshot.hasRecentPlayerTheft, true);
});

/* ── Кольцо мировых событий ───────────────────────────────────── */

function floodSightings(state: ReturnType<typeof makeGameState>, count: number, time: number): void {
  for (let i = 0; i < count; i++) {
    publishEvent(state, {
      type: 'monster_sighted',
      actorId: 7000 + i,
      severity: 1,
      privacy: 'local',
      tags: ['sighted'],
      time,
    });
  }
}

test('поток чужого рода не прячет охранников без опоры на факты', () => {
  const state = makeGameState({ currentZ: 0, time: 0, worldEvents: createWorldEventState() });
  const player = makeTestPlayer({ id: 0, name: 'Игрок' });
  const npc = makeTestNpc({ id: 50504, name: 'Свидетель' });

  publishEvent(state, {
    type: 'container_opened', roomId: 7, actorId: player.id,
    actorFaction: Faction.PLAYER, containerId: 92, severity: 2, privacy: 'local',
    tags: ['container'], time: 1,
  });
  publishEvent(state, {
    type: 'elevator_anomaly', roomId: 7, severity: 3, privacy: 'public', tags: ['lift'], time: 1,
  });
  publishEvent(state, {
    type: 'metro_route_taken', roomId: 7, severity: 2, privacy: 'public', tags: ['metro'], time: 1,
  });

  /* Вдвое больше записей, чем старое окно читателя, но втрое меньше кольца
   * событий: проверяется бюджет читателя, а не вытеснение из кольца. */
  floodSightings(state, 64, 2);

  const snapshot = buildContextSnapshot(npc, { state, player, time: 3 });
  assert.equal(snapshot.hasRecentContainerOpen, true, 'открытый ящик обязан пережить 64 чужих события');
  assert.equal(snapshot.hasRecentLiftAnomaly, true, 'аномалия лифта обязана пережить 64 чужих события');
  assert.equal(snapshot.hasRecentMetroEvent, true, 'поездка метро обязана пережить 64 чужих события');
});

test('горизонт событий остаётся конечным: за окном охранник молчит', () => {
  const state = makeGameState({ currentZ: 0, time: 0, worldEvents: createWorldEventState() });
  const player = makeTestPlayer({ id: 0, name: 'Игрок' });
  const npc = makeTestNpc({ id: 50505, name: 'Свидетель' });

  publishEvent(state, {
    type: 'container_opened', roomId: 7, actorId: player.id,
    actorFaction: Faction.PLAYER, containerId: 92, severity: 2, privacy: 'local',
    tags: ['container'], time: 1,
  });
  floodSightings(state, 8, 2);

  /* Окно `RECENT_EVENT_WINDOW_S` — 360 c. «Недавно» не должно стать «когда-то». */
  const snapshot = buildContextSnapshot(npc, { state, player, time: 1_000 });
  assert.equal(snapshot.hasRecentContainerOpen, false);
});

test('событие без времени не обрывает обход кольца', () => {
  const state = makeGameState({ currentZ: 0, time: 0, worldEvents: createWorldEventState() });
  const player = makeTestPlayer({ id: 0, name: 'Игрок' });
  const npc = makeTestNpc({ id: 50506, name: 'Свидетель' });

  publishEvent(state, {
    type: 'container_opened', roomId: 7, actorId: player.id,
    actorFaction: Faction.PLAYER, containerId: 92, severity: 2, privacy: 'local',
    tags: ['container'], time: 100,
  });
  /* Событие с нулевым временем встаёт НОВЕЕ цели: выход по возрасту обязан его
   * пропустить, а не принять за край окна и оборвать обход. */
  publishEvent(state, {
    type: 'monster_sighted', actorId: 7777, severity: 1, privacy: 'local', tags: ['sighted'], time: 0,
  });

  const snapshot = buildContextSnapshot(npc, { state, player, time: 110 });
  assert.equal(snapshot.hasRecentContainerOpen, true);
});
