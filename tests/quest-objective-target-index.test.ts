import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, QuestType, type Entity, type GameState, type Quest } from '../src/core/types';
import { getCurrentObjective } from '../src/systems/quests';
import { markEntityIndexDirty, rebuildEntityIndex } from '../src/systems/entity_index';
import { makeTestEntity } from './helpers';

/**
 * Замок адресации цели задания.
 *
 * Строку цели рисует HUD каждый кадр, и адресат искался перебором ВСЕГО этажа
 * (`entities.find`) — 9600 сравнений на кадр ради одного номера. Теперь отвечает
 * общий индекс сущностей, который и так собирается раз в кадр.
 *
 * Ответ обязан остаться прежним, а он тут неочевиден трижды: цель может быть не
 * человеком (предмет, монстр), может быть мёртвой — и тогда цели НЕТ, — и может
 * адресоваться слотом, а не номером сущности; последняя ветка этой правки не
 * касалась и обязана это доказать.
 */

function questWithTarget(targetNpcId: number | undefined, bySlot = false): Quest {
  const q: Record<string, unknown> = {
    id: 1, type: QuestType.TALK, desc: 'проба', done: false,
    giverId: -1, giverName: 'проба', targetNpcId,
  };
  if (bySlot) q.sideQuestId = 'probe_side_quest';
  return q as unknown as Quest;
}

function stateWith(q: Quest): GameState {
  return { quests: [q], activeQuestId: q.id, time: 0 } as unknown as GameState;
}

function indexed(entities: Entity[]): Entity[] {
  markEntityIndexDirty();
  rebuildEntityIndex(entities, 'ensure');
  return entities;
}

test('цель задания: живой адресат находится по номеру сущности', () => {
  const npc = makeTestEntity({ id: 42, type: EntityType.NPC });
  const drop = makeTestEntity({ id: 43, type: EntityType.ITEM_DROP });
  const entities = indexed([drop, npc]);

  const objective = getCurrentObjective(stateWith(questWithTarget(42)), entities);
  assert.equal(objective?.targetEntityId, 42);
});

test('цель задания: адресатом может быть не человек', () => {
  const drop = makeTestEntity({ id: 7, type: EntityType.ITEM_DROP });
  const mon = makeTestEntity({ id: 8, type: EntityType.MONSTER });
  const entities = indexed([drop, mon]);

  assert.equal(getCurrentObjective(stateWith(questWithTarget(7)), entities)?.targetEntityId, 7);
  assert.equal(getCurrentObjective(stateWith(questWithTarget(8)), entities)?.targetEntityId, 8);
});

test('цель задания: мёртвый адресат целью не считается', () => {
  const npc = makeTestEntity({ id: 5, type: EntityType.NPC });
  const entities = indexed([npc]);
  assert.equal(getCurrentObjective(stateWith(questWithTarget(5)), entities)?.targetEntityId, 5);

  npc.alive = false;
  npc.hp = 0;
  indexed(entities);
  assert.equal(
    getCurrentObjective(stateWith(questWithTarget(5)), entities)?.targetEntityId, undefined,
    'индекс держит только живых — мёртвый адресат обязан пропасть, как и раньше по `.alive`',
  );
});

test('цель задания: несуществующего номера нет и в индексе', () => {
  const entities = indexed([makeTestEntity({ id: 5, type: EntityType.NPC })]);
  for (const id of [0, -1, 9_000_000]) {
    assert.equal(getCurrentObjective(stateWith(questWithTarget(id)), entities)?.targetEntityId, undefined, `номер ${id}`);
  }
  assert.equal(getCurrentObjective(stateWith(questWithTarget(undefined)), entities)?.targetEntityId, undefined);
});

test('цель задания: адресация по слоту идёт своей веткой', () => {
  // Слот и номер сущности нарочно РАЗНЫЕ: ветка по слоту обязана отвечать по
  // `alifeId`, и подмена одного другим тут же вылезет.
  const npc = makeTestEntity({ id: 900, type: EntityType.NPC });
  npc.alifeId = 11;
  const entities = indexed([npc]);

  assert.equal(getCurrentObjective(stateWith(questWithTarget(11, true)), entities)?.targetEntityId, 900);
  assert.equal(
    getCurrentObjective(stateWith(questWithTarget(900, true)), entities)?.targetEntityId, undefined,
    'по слоту номер сущности адресом не является',
  );
});

test('цель задания: свежедобавленная сущность находится', () => {
  const entities = indexed([makeTestEntity({ id: 1, type: EntityType.NPC })]);
  const late = makeTestEntity({ id: 77, type: EntityType.NPC });
  entities.push(late);
  indexed(entities);
  assert.equal(getCurrentObjective(stateWith(questWithTarget(77)), entities)?.targetEntityId, 77);
});
