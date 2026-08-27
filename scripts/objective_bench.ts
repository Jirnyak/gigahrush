#!/usr/bin/env tsx
/* Цена строки цели в кадре. HUD зовёт `getCurrentObjective` каждый кадр (и не
 * по разу), а адрес цели искался перебором всего этажа.
 *
 * Три случая, и все три реальны: цель жива (перебор находит её в середине),
 * цели на этаже нет (перебор доходит до конца — худший случай), задание без
 * адресата (перебора нет вовсе, контрольная строка).
 *
 * Запуск: npx tsx scripts/objective_bench.ts <designFloorId> <seed> <rounds>
 */
import '../src/content';
import { EntityType, QuestType, type Entity, type GameState, type Quest } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { getCurrentObjective } from '../src/systems/quests';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';

const floorId = process.argv[2] ?? 'living';
const seed = Number(process.argv[3] ?? 1337);
const rounds = Number(process.argv[4] ?? 2000);

seedGlobalRng(seed);
const scene = buildFloor(floorId, seed);
const state: GameState = createArenaGameState();
state.currentZ = 0;
ensureAlifeState(state);
materializeAlifeFloorPopulation(state, scene.world, scene.entities, scene.nextId, `design:${floorId}`);
rebuildEntityIndexForSimulation(scene.entities, 0);

const npcs = scene.entities.filter(e => e.type === EntityType.NPC && e.alive);
const mid: Entity = npcs[npcs.length >> 1];

function quest(targetNpcId: number | undefined): Quest {
  return {
    id: 1, type: QuestType.TALK, desc: 'проба', done: false,
    giverId: -1, giverName: 'проба', targetNpcId,
  } as unknown as Quest;
}

function run(label: string, q: Quest): string {
  state.quests = [q];
  state.activeQuestId = q.id;
  let sink = 0;
  for (let i = 0; i < 200; i++) sink += getCurrentObjective(state, scene.entities) ? 1 : 0;
  const per: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const t0 = performance.now();
    sink += getCurrentObjective(state, scene.entities) ? 1 : 0;
    per.push(performance.now() - t0);
  }
  const s = per.sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return `${label}\tmean=${(sum / s.length).toFixed(5)}\tmedian=${s[s.length >> 1].toFixed(5)}\tp95=${s[Math.floor(s.length * 0.95)].toFixed(5)}\tsink=${sink > 0 ? 1 : 0}`;
}

console.log(JSON.stringify({ entities: scene.entities.length, npcs: npcs.length }));
console.log(run('liveTarget', quest(mid.id)));
console.log(run('missingTarget', quest(9_000_000)));
console.log(run('noTarget', quest(undefined)));
