import { makeGameState, makeTestNpc, makeTestPlayer } from './tests/helpers';
import { getEntityIndex, rebuildEntityIndex } from './src/systems/entity_index';
import { EntityType, Entity } from './src/core/types';
import { World } from './src/core/world';

const entities: Entity[] = [];
for (let i = 0; i < 5000; i++) {
  entities.push(makeTestNpc({ id: i + 1, name: `NPC ${i}`, canGiveQuest: true, type: EntityType.NPC }));
}

const targetId = 4999;
const state = makeGameState({ npcMenuTarget: targetId, showNpcMenu: true });

// rebuild entity index
rebuildEntityIndex(entities);

const BENCH_RUNS = 100000;

let start = performance.now();
for (let i = 0; i < BENCH_RUNS; i++) {
  const npc = entities.find(e => e.id === state.npcMenuTarget);
}
let end = performance.now();
console.log(`find: ${end - start} ms`);

start = performance.now();
for (let i = 0; i < BENCH_RUNS; i++) {
  const npc = getEntityIndex().byId.get(state.npcMenuTarget);
}
end = performance.now();
console.log(`byId: ${end - start} ms`);
