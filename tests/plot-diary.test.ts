import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, EntityType, QuestType, type Entity, type Quest } from '../src/core/types';
import { World } from '../src/core/world';
import { PLOT_CHAIN } from '../src/data/plot';
import { alifeForSave, plotNpcDeathSpot, recordAlifeNpcDeath, setAlifeState } from '../src/systems/alife';
import {
  PLOT_DIARY_ITEM,
  attachPlotDiary,
  holdsPlotDiary,
  plotDiaryItem,
  plotDiaryOwnerId,
} from '../src/systems/plot_trace';
import { checkQuests } from '../src/systems/quests';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';
import '../src/content';

/* Смерть авторской личности не имеет права оборвать цепочку. Она оставляет
 * дневник, и дневник в рюкзаке говорит за покойного: выдаёт его шаг, закрывает
 * его разговор, принимает его дело. Проверяем механику, а не номера шагов —
 * цепочка вправе расти. */

/** Первый шаг цепочки с дающим: на нём и ставим опыты. */
const STEP_INDEX = PLOT_CHAIN.findIndex(step => step.giverId !== undefined);
const GIVER_ID = PLOT_CHAIN[STEP_INDEX]?.giverId as number;

function doneQuestsBefore(index: number): Quest[] {
  const out: Quest[] = [];
  for (let i = 0; i < index; i++) {
    out.push({
      id: i + 1, type: QuestType.FETCH, giverId: 1, giverName: 'тест',
      desc: 'сделано', plotStepIndex: i, done: true,
    } as Quest);
  }
  return out;
}

function openFloor(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  return world;
}

function killPlotNpc(state: ReturnType<typeof makeGameState>, plotNpcId: number, x = 20.5, y = 20.5): Entity {
  const npc = makeTestNpc({ id: plotNpcId, alifeId: plotNpcId, x, y, name: 'Покойный' });
  npc.alive = false;
  recordAlifeNpcDeath(state, npc);
  attachPlotDiary(npc);
  return npc;
}

test('сюжетный NPC уносит с собой дневник, привязанный к нему', () => {
  const state = makeGameState();
  const npc = killPlotNpc(state, GIVER_ID);
  const diary = (npc.inventory ?? []).find(slot => slot.defId === PLOT_DIARY_ITEM);
  assert.ok(diary, 'дневник не появился в инвентаре покойного');
  assert.equal(plotDiaryOwnerId(diary), GIVER_ID, 'дневник не привязан к личности');
  // Второй раз тот же дневник не добавляется.
  attachPlotDiary(npc);
  assert.equal((npc.inventory ?? []).filter(s => s.defId === PLOT_DIARY_ITEM).length, 1);
});

test('обычный NPC дневника не оставляет', () => {
  const npc = makeTestNpc({ id: 900_001, alifeId: 900_001, x: 5.5, y: 5.5 });
  attachPlotDiary(npc);
  assert.equal((npc.inventory ?? []).some(s => s.defId === PLOT_DIARY_ITEM), false);
});

test('шаг мёртвого дающего не выдаётся без дневника и выдаётся с ним', () => {
  const world = openFloor();
  const player = makeTestPlayer({ x: 10.5, y: 10.5 });
  const state = makeGameState({ quests: doneQuestsBefore(STEP_INDEX) });
  killPlotNpc(state, GIVER_ID);

  checkQuests(player, world, [player], state, []);
  assert.equal(
    state.quests.some(q => q.plotStepIndex === STEP_INDEX), false,
    'шаг выдался, хотя дающий мёртв, а дневника на руках нет',
  );

  player.inventory = [plotDiaryItem(GIVER_ID, 'Покойный')!];
  assert.equal(holdsPlotDiary(player, GIVER_ID), true);
  checkQuests(player, world, [player], state, []);

  const granted = state.quests.find(q => q.plotStepIndex === STEP_INDEX);
  assert.ok(granted, 'дневник не открыл шаг мёртвого дающего');
  assert.equal(granted.giverless, true, 'сдавать поручение некому — оно должно закрываться делом');
  assert.equal(granted.giverId, GIVER_ID, 'авторство шага теряться не должно');

  // Повторный тик не выдаёт его второй раз.
  checkQuests(player, world, [player], state, []);
  assert.equal(state.quests.filter(q => q.plotStepIndex === STEP_INDEX).length, 1);
});

test('разговор с мёртвой целью закрывается дневником, а не самим фактом смерти', () => {
  const world = openFloor();
  const targetId = GIVER_ID;
  const talkQuest = {
    id: 500, type: QuestType.TALK, giverId: 1, giverName: 'тест',
    desc: 'поговорить', targetNpcId: targetId, plotStepIndex: 999,
    relationDelta: 0, xpReward: 0, done: false,
  } as Quest;

  const player = makeTestPlayer({ x: 10.5, y: 10.5 });
  const state = makeGameState({ quests: [talkQuest] });
  killPlotNpc(state, targetId);

  checkQuests(player, world, [player], state, []);
  assert.equal(talkQuest.done, false, 'смерть цели закрыла разговор сама — телепатия вернулась');

  player.inventory = [plotDiaryItem(targetId, 'Покойный')!];
  checkQuests(player, world, [player], state, []);
  assert.equal(talkQuest.done, true, 'дневник не закрыл разговор с покойным');
});

test('дневник возвращается на место смерти, когда цепочка в него упёрлась', () => {
  const world = openFloor();
  const player = makeTestPlayer({ x: 10.5, y: 10.5 });
  const state = makeGameState({ quests: doneQuestsBefore(STEP_INDEX) });
  killPlotNpc(state, GIVER_ID, 30.5, 40.5);

  const entities: Entity[] = [player];
  const nextId = { v: 10_000 };
  checkQuests(player, world, entities, state, [], nextId);

  const drop = entities.find(e => e.type === EntityType.ITEM_DROP
    && (e.inventory ?? []).some(slot => plotDiaryOwnerId(slot) === GIVER_ID));
  assert.ok(drop, 'дневник не воплотился на этаже, цепочка осталась запертой');
  assert.ok(Math.abs(drop.x - 30.5) < 5 && Math.abs(drop.y - 40.5) < 5, 'дневник лёг далеко от места смерти');

  // Пока он лежит — второго не появляется.
  checkQuests(player, world, entities, state, [], nextId);
  const drops = entities.filter(e => e.type === EntityType.ITEM_DROP
    && (e.inventory ?? []).some(slot => plotDiaryOwnerId(slot) === GIVER_ID));
  assert.equal(drops.length, 1, 'дневник размножается при каждом тике');
});

test('место гибели переживает сейв и загрузку', () => {
  const state = makeGameState({ quests: doneQuestsBefore(STEP_INDEX) });
  killPlotNpc(state, GIVER_ID, 30.5, 40.5);
  const before = plotNpcDeathSpot(state, GIVER_ID);
  assert.ok(before, 'место гибели не записано');

  const reloaded = makeGameState({ quests: doneQuestsBefore(STEP_INDEX) });
  setAlifeState(reloaded, alifeForSave(state));

  const after = plotNpcDeathSpot(reloaded, GIVER_ID);
  assert.ok(after, 'после перезагрузки место гибели потеряно — цепочка заперта навсегда');
  assert.equal(after.x, before.x);
  assert.equal(after.y, before.y);
  assert.equal(after.floorKey, before.floorKey);
});

test('дневник в контейнере не даёт воплотить второй', () => {
  const world = openFloor();
  const player = makeTestPlayer({ x: 10.5, y: 10.5 });
  const state = makeGameState({ quests: doneQuestsBefore(STEP_INDEX) });
  killPlotNpc(state, GIVER_ID, 30.5, 40.5);
  world.addContainer({
    id: 1, x: 12, y: 12, z: 0, roomId: -1, zoneId: 0, kind: 0 as never,
    name: 'ящик', inventory: [plotDiaryItem(GIVER_ID, 'Покойный')!],
  } as never);

  const entities: Entity[] = [player];
  checkQuests(player, world, entities, state, [], { v: 10_000 });
  assert.equal(
    entities.some(e => e.type === EntityType.ITEM_DROP), false,
    'спрятанный дневник породил второй — это ферма невытесняемых дропов',
  );
});

test('замурованное место гибели не запирает цепочку', () => {
  const world = new World();
  world.cells.fill(Cell.WALL);
  const player = makeTestPlayer({ x: 10.5, y: 10.5 });
  const state = makeGameState({ quests: doneQuestsBefore(STEP_INDEX) });
  killPlotNpc(state, GIVER_ID, 300.5, 400.5);

  const entities: Entity[] = [player];
  checkQuests(player, world, entities, state, [], { v: 10_000 });
  const drop = entities.find(e => e.type === EntityType.ITEM_DROP
    && (e.inventory ?? []).some(slot => plotDiaryOwnerId(slot) === GIVER_ID));
  assert.ok(drop, 'дневник некуда положить — цепочка молча заперта');
});

test('покойник с чужого этажа не задерживает того, кто лежит здесь', () => {
  const world = openFloor();
  const player = makeTestPlayer({ x: 10.5, y: 10.5 });
  const other = PLOT_CHAIN.find(s => s.giverId !== undefined && s.giverId !== GIVER_ID)?.giverId as number;
  assert.ok(other, 'в цепочке некому играть вторую роль');

  const state = makeGameState({
    quests: [
      ...doneQuestsBefore(STEP_INDEX),
      {
        id: 900, type: QuestType.FETCH, giverId: other, giverName: 'дальний',
        desc: 'висит', targetItem: 'bread', targetCount: 99,
        plotStepIndex: 998, done: false,
      } as Quest,
    ],
  });
  // Дальний умер на другом этаже: подменяем ему ключ этажа после регистрации.
  killPlotNpc(state, other, 50.5, 50.5);
  const farRecord = (state as { alife?: { npcs: { id: number }[]; floorKeys: string[]; columns: { floorKeyIndex: Int32Array } } }).alife;
  assert.ok(farRecord, 'нет состояния A-Life');
  farRecord.floorKeys.push('design:nowhere');
  farRecord.columns.floorKeyIndex[other - 1] = farRecord.floorKeys.length - 1;

  killPlotNpc(state, GIVER_ID, 30.5, 40.5);

  const entities: Entity[] = [player];
  checkQuests(player, world, entities, state, [], { v: 10_000 });
  const drop = entities.find(e => e.type === EntityType.ITEM_DROP
    && (e.inventory ?? []).some(slot => plotDiaryOwnerId(slot) === GIVER_ID));
  assert.ok(drop, 'первый застрявший покойник заблокировал всех остальных');
});

test('живая цепочка дневников не плодит', () => {
  const world = openFloor();
  const player = makeTestPlayer({ x: 10.5, y: 10.5 });
  const state = makeGameState({ quests: doneQuestsBefore(STEP_INDEX) });
  const entities: Entity[] = [player];
  checkQuests(player, world, entities, state, [], { v: 10_000 });
  assert.equal(entities.some(e => e.type === EntityType.ITEM_DROP), false);
});
