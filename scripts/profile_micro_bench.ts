#!/usr/bin/env tsx
/* Изолированная цена боевой справки: тот же живой этаж, но без кадра AI вокруг.
 * Нужна потому, что 0.6 мс тонут в 8 мс разброса `updateAI`, а сама функция
 * измеряется чисто.
 *
 * Запуск: npx tsx scripts/profile_micro_bench.ts <designFloorId> <seed> <rounds>
 */
import '../src/content';
import { EntityType, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { npcCombatProfile } from '../src/systems/combat_stimulus';

const floorId = process.argv[2] ?? 'living';
const seed = Number(process.argv[3] ?? 1337);
const rounds = Number(process.argv[4] ?? 400);

seedGlobalRng(seed);
const scene = buildFloor(floorId, seed);
const state: GameState = createArenaGameState();
state.currentZ = 0;
ensureAlifeState(state);
materializeAlifeFloorPopulation(state, scene.world, scene.entities, scene.nextId, `design:${floorId}`);

const npcs: Entity[] = scene.entities.filter(e => e.type === EntityType.NPC && e.alive);
let sink = 0;

// Прогрев: и JIT, и кэш профиля.
for (let r = 0; r < 20; r++) for (const e of npcs) sink += npcCombatProfile(e).threatScore;

const per: number[] = [];
for (let r = 0; r < rounds; r++) {
  const t0 = performance.now();
  for (const e of npcs) sink += npcCombatProfile(e).threatScore;
  per.push(performance.now() - t0);
}

const s = [...per].sort((a, b) => a - b);
const sum = s.reduce((m, v) => m + v, 0);
console.log(JSON.stringify({
  npcs: npcs.length,
  rounds,
  /* Один «круг» — вызов на каждого живого NPC. Кадр стоит примерно 1.27 круга:
   * замерено 2304 вызова в кадр при 1812 NPC. */
  msPerRound: {
    mean: +(sum / s.length).toFixed(4),
    median: +s[s.length >> 1].toFixed(4),
    p05: +s[Math.floor(s.length * 0.05)].toFixed(4),
    p95: +s[Math.floor(s.length * 0.95)].toFixed(4),
  },
  nsPerCall: +((sum / s.length) * 1e6 / npcs.length).toFixed(1),
  sink: sink > 0 ? 1 : 0,
}));
