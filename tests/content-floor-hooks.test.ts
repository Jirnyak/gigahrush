import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  EntityType, Faction, MonsterKind,
  type Entity,
} from '../src/core/types';
import { World } from '../src/core/world';
import {
  runContentEntityDeathHooks, runContentFloorArrivalHooks,
} from '../src/systems/content_hooks';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { QuestType, type Quest } from '../src/core/types';
import { PLOT_CHAIN } from '../src/data/plot';
import { makeGameState, makeTestPlayer } from './helpers';

/* Сюжетные последствия переехали из `main.ts` в пакеты своих этажей (§2.12).
 * Импорт — и есть регистрация: генератора у этих модулей нет. */
import '../src/gen/hell/arrival';
import '../src/gen/void/arrival';
import '../src/gen/podad/herald_gate';

const nextEntityId = { v: 1000 };

function ctxFor(designFloorId: string | undefined, z: number, insideFloorInstance = false) {
  const state = makeGameState({ currentZ: z });
  const player = makeTestPlayer({ x: 30.5, y: 30.5 });
  return {
    ctx: {
      world: new World(), entities: [player], player, state, nextEntityId,
      designFloorId, z, insideFloorInstance,
    },
    state,
  };
}

/* Реплика Ада — не безусловная: она подсказывает НЕНАЧАТОЕ поручение про зону
 * закрепления, и без поручения этаж молчит по замыслу.
 *
 * Отсюда ловушка: если не выдать поручение и в ОТРИЦАТЕЛЬНЫХ случаях, замок
 * выйдет пустым — молчание обеспечит сам `onHellArrival`, а не страж этажа.
 * Проверено: со снятым стражем такой замок оставался зелёным. */
function withHoldoutQuest(state: ReturnType<typeof ctxFor>['state']): void {
  state.quests.push({
    id: 1, type: QuestType.VISIT, desc: 'зона закрепления', done: false,
    eventTags: ['hell_holdout'], holdProgressSeconds: 0,
  } as unknown as Quest);
}

test('Ад встречает высадку своими репликами', () => {
  const hell = ctxFor('hell', -36);
  withHoldoutQuest(hell.state);
  runContentFloorArrivalHooks(hell.ctx);
  assert.ok(hell.state.msgs.length > 0, 'Ад молчит на прибытии');
  assert.match(hell.state.msgs.map(m => m.text).join('\n'), /Мясной низ принял высадку|зону закрепления|Громного/);
});

test('Пустота раскрывает ловушку Творца на входе', () => {
  const voidArrival = ctxFor('void', -50);
  runContentFloorArrivalHooks(voidArrival.ctx);
  const texts = voidArrival.state.msgs.map(m => m.text).join('\n');
  assert.match(texts, /Творец/);
});

test('чужой этаж и экземпляр этажа молчат', () => {
  // У каждого отрицательного случая ВСЁ готово для реплики, кроме адреса:
  // молчать его обязан заставить страж этажа, а не отсутствие поручения.
  const living = ctxFor('living', 0);
  withHoldoutQuest(living.state);
  runContentFloorArrivalHooks(living.ctx);
  assert.equal(living.state.msgs.length, 0, 'жилой этаж поймал чужую реплику');

  const procedural = ctxFor(undefined, -3);
  withHoldoutQuest(procedural.state);
  runContentFloorArrivalHooks(procedural.ctx);
  assert.equal(procedural.state.msgs.length, 0, 'процедурный этаж поймал чужую реплику');

  // Аномалия лифта — не «настоящее» прибытие: тот же этаж внутри экземпляра молчит.
  const instance = ctxFor('hell', -36, true);
  withHoldoutQuest(instance.state);
  runContentFloorArrivalHooks(instance.ctx);
  assert.equal(instance.state.msgs.length, 0, 'экземпляр этажа поймал реплику прибытия');

  const voidInstance = ctxFor('void', -50, true);
  runContentFloorArrivalHooks(voidInstance.ctx);
  assert.equal(voidInstance.state.msgs.length, 0, 'экземпляр Пустоты поймал реплику прибытия');
});

function heraldDeath(designFloorId: string, z: number) {
  const state = makeGameState({ currentZ: z });
  const player = makeTestPlayer({ x: 30.5, y: 30.5 });
  const world = new World();
  const herald: Entity = {
    id: 5, type: EntityType.MONSTER, monsterKind: MonsterKind.HERALD,
    x: 32.5, y: 32.5, angle: 0, alive: false, speed: 1, sprite: 0,
    hp: 0, maxHp: 100, faction: Faction.MONSTER, name: 'Вестник',
  } as Entity;
  // Маршрут ставится ЯВНО: ворота открываются только на самом Подаде.
  setFloorRunState(state, { runSeed: 7, currentZ: z, specs: {}, visited: {} });
  /* Ворота открывает ЗАКРЫТЫЙ счёт, а не сам факт смерти: сюжетный шаг про трёх
   * Вестников должен быть выдан и добит. Иначе `onHeraldKilled` отказывает. */
  const heraldStepIndex = PLOT_CHAIN.findIndex(step =>
    step.type === QuestType.KILL
    && step.targetMonsterKind === MonsterKind.HERALD
    && (step.killNeeded ?? 1) === 3);
  assert.ok(heraldStepIndex >= 0, 'шага про трёх Вестников нет в цепочке');
  state.quests.push({
    id: 2, type: QuestType.KILL, desc: 'три Вестника', done: false,
    plotStepIndex: heraldStepIndex, killCount: 3, killNeeded: 3,
    targetMonsterKind: MonsterKind.HERALD,
  } as unknown as Quest);
  return {
    state,
    result: runContentEntityDeathHooks({
      world, entities: [player], player, state, nextEntityId,
      killed: herald, killerIsPlayer: true,
    }),
    designFloorId,
  };
}

test('смерть Вестника открывает нижний маршрут только на Подаде', () => {
  const onPodad = heraldDeath('podad', -40);
  assert.equal(onPodad.result.worldChanged, true, 'ворота Подада не открылись');
  assert.match(onPodad.state.msgs.map(m => m.text).join('\n'), /Марфа Пороговая|Нижний маршрут/);

  const elsewhere = heraldDeath('living', 0);
  assert.equal(elsewhere.result.worldChanged, false, 'Вестник открыл ворота на чужом этаже');
  assert.equal(elsewhere.state.msgs.length, 0);
});

test('main.ts зовёт общий шов прибытия, а не этажи поимённо', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  /* Хук, который никто не зовёт, — мёртвый контент: ровно тот класс, ради
   * которого переезд и делался. Замок держит вызывающую сторону. */
  assert.equal(main.includes('runContentFloorArrivalHooks'), true, 'шов прибытия не вызывается из main.ts');
  assert.equal(main.includes('onHellArrival'), false, 'Ад всё ещё вызывается поимённо');
  assert.equal(main.includes('onVoidEntry'), false, 'Пустота всё ещё вызывается поимённо');
  assert.equal(main.includes('onHeraldKilled'), false, 'Вестник всё ещё вызывается поимённо');
  assert.equal(main.includes('openVoidReturnPortalFromCreator'), false, 'портал Пустоты всё ещё открывается из main.ts');
  assert.equal(main.includes('FLAME_COLLATERAL_ITEMS'), false, 'список горючего всё ещё живёт в main.ts');
});
