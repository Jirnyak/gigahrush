import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityType, Faction, type Entity } from '../src/core/types';
import { EntityIndex, ENTITY_MASK_ITEM_DROP } from '../src/systems/entity_index';
import { killEntity } from '../src/systems/entity_death';

function entity(id: number, type: EntityType, x: number, y: number, alive = true): Entity {
  return {
    id, type, x, y,
    angle: 0, pitch: 0, alive, speed: 0, sprite: 0,
    faction: type === EntityType.NPC ? Faction.CITIZEN : undefined,
  };
}

/**
 * Кадр симуляции обязан трогать ТОЛЬКО то, что изменилось.
 *
 * Раньше он стирал `byId`/`byAlifeId`/`entityOrder` и набивал их заново — по три
 * операции Map на каждую живую сущность, включая тысячи неподвижных дропов,
 * ради восстановления неизменившихся связей. Проверяем не «стало быстрее», а
 * то, что сами связи после этого правильные.
 */
function countingMapOps(index: EntityIndex): () => number {
  let ops = 0;
  for (const name of ['byId', 'byAlifeId'] as const) {
    const map = index[name] as Map<number, Entity>;
    const set = map.set.bind(map);
    const del = map.delete.bind(map);
    const clear = map.clear.bind(map);
    map.set = (k: number, v: Entity) => { ops++; return set(k, v); };
    map.delete = (k: number) => { ops++; return del(k); };
    map.clear = () => { ops++; clear(); };
  }
  return () => ops;
}

test('спокойный кадр симуляции не переписывает адреса живых сущностей', () => {
  const index = new EntityIndex();
  const npc = entity(1, EntityType.NPC, 10, 10);
  npc.ai = { goal: 0, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 };
  const drops = Array.from({ length: 200 }, (_, i) => entity(100 + i, EntityType.ITEM_DROP, 20 + (i % 40), 20 + ((i / 40) | 0)));
  const entities = [npc, ...drops];
  index.rebuild(entities, 'load');

  const ops = countingMapOps(index);
  index.rebuildForSimulation(entities, 1);
  npc.x += 1;
  index.rebuildForSimulation(entities, 2);
  index.rebuildForSimulation(entities, 3);

  assert.equal(ops(), 0, 'живые сущности своих адресов не меняли — трогать их нечего');
  assert.equal(index.byId.get(1), npc);
  assert.equal(index.byId.get(100), drops[0]);
  assert.equal(index.byId.size, entities.length);
});

test('смерть снимает адрес в том же кадре — и у динамики, и у статики', () => {
  const index = new EntityIndex();
  const npc = entity(1, EntityType.NPC, 10, 10);
  npc.alifeId = 7;
  const drop = entity(2, EntityType.ITEM_DROP, 12, 10);
  const billboard = entity(3, EntityType.BILLBOARD, 14, 10);
  const entities = [npc, drop, billboard];
  index.rebuild(entities, 'load');
  assert.equal(index.byAlifeId.get(7), npc);

  /* Оба через единый путь. Сырое присваивание здесь ПРОШЛО БЫ, но по
   * случайности: полная пересборка сбрасывает эпоху, и первый же кадр делает
   * честный обход статики. На втором кадре тот же дроп остался бы призраком в
   * бакете — тест давал бы ложную уверенность. */
  killEntity(npc);
  killEntity(drop);
  index.rebuildForSimulation(entities, 1);

  assert.equal(index.byId.has(1), false);
  assert.equal(index.byAlifeId.has(7), false);
  assert.equal(index.byId.has(2), false);
  assert.equal(index.byId.get(3), billboard);
  assert.deepEqual(index.actors.map(e => e.id), []);

  // Мёртвый дроп уходит и из бакетов: радиусный запрос его больше не видит.
  const out: Entity[] = [];
  index.queryRadius(12, 10, 4, out, ENTITY_MASK_ITEM_DROP);
  assert.deepEqual(out.map(e => e.id), []);
});

test('дописанная в хвост сущность получает адреса на кадровом пути', () => {
  const index = new EntityIndex();
  const npc = entity(1, EntityType.NPC, 10, 10);
  const entities: Entity[] = [npc];
  index.rebuild(entities, 'load');

  const drop = entity(2, EntityType.ITEM_DROP, 11, 10);
  drop.alifeId = 42;
  const billboard = entity(3, EntityType.BILLBOARD, 12, 10);
  entities.push(drop, billboard);
  index.rebuildForSimulation(entities, 1);

  assert.equal(index.byId.get(2), drop);
  assert.equal(index.byAlifeId.get(42), drop);
  assert.deepEqual(index.billboards.map(e => e.id), [3]);

  const out: Entity[] = [];
  index.queryRadius(11, 10, 2, out, ENTITY_MASK_ITEM_DROP);
  assert.deepEqual(out.map(e => e.id), [2]);
});

test('срез билбордов держит только живых и переживает кадр симуляции', () => {
  const index = new EntityIndex();
  const car = entity(1, EntityType.BILLBOARD, 10, 10);
  const prop = entity(2, EntityType.BILLBOARD, 300, 300);
  const npc = entity(3, EntityType.NPC, 11, 10);
  const entities = [car, prop, npc];
  index.rebuild(entities, 'load');
  assert.deepEqual(index.billboards.map(e => e.id).sort(), [1, 2]);

  index.rebuildForSimulation(entities, 1);
  assert.deepEqual(index.billboards.map(e => e.id).sort(), [1, 2]);

  /* Смерть идёт через `killEntity`, и это не косметика вызова.
   *
   * Обход статики больше не патрулирует каждый кадр — он ждёт сдвига эпохи
   * смертей, потому что на жилом этаже это 9795 сущностей ради события раз в
   * несколько секунд. Значит статику убивает единый путь, и другого способа у
   * игры нет: `npm run check:invariants` считает сырые `alive = false` вне
   * `systems/entity_death.ts` и разрешает ноль.
   *
   * Динамику (актёров, снаряды) кадр по-прежнему перебирает целиком, поэтому
   * там сырое присваивание сработало бы и сейчас. Единый путь всё равно один
   * на всех: две породы смерти — это ровно та развилка, из которой потом
   * вырастает призрак в бакете. */
  killEntity(prop);
  index.rebuildForSimulation(entities, 2);
  assert.deepEqual(index.billboards.map(e => e.id), [1]);
});

test('мёртвая динамика выбывает из обхода, а не остаётся в нём до полной пересборки', () => {
  const index = new EntityIndex();
  const alive = entity(1, EntityType.NPC, 10, 10);
  const doomed = Array.from({ length: 50 }, (_, i) => entity(10 + i, EntityType.MONSTER, 12 + i, 10));
  const entities = [alive, ...doomed];
  index.rebuild(entities, 'load');
  index.rebuildForSimulation(entities, 1);
  assert.equal(index.getDebugStats().actorCount, 51);

  for (const e of doomed) e.alive = false;
  index.rebuildForSimulation(entities, 2);
  assert.equal(index.getDebugStats().actorCount, 1);

  // Второй кадр подряд уже не должен снимать те же адреса: их больше нет.
  const ops = countingMapOps(index);
  index.rebuildForSimulation(entities, 3);
  assert.equal(ops(), 0);
  assert.equal(index.getDebugStats().actorCount, 1);
});
