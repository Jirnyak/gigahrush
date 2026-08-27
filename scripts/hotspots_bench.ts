#!/usr/bin/env tsx
/* Стенд трёх горячих мест кадра: поля восприятия, боевой профиль (через updateAI),
 * фракционные события и проверка заданий.
 *
 * Тот же живой этаж, что у `floor_bench.ts`, и та же ловушка: `buildFloor` отдаёт
 * NPC без стволов, поэтому A-Life материализуется явно.
 *
 * Запуск: npx tsx scripts/hotspots_bench.ts <designFloorId> <seed> <seconds>
 * Печатает JSON: медиана/среднее/худший кадр по каждому месту.
 */
import '../src/content';
import { AIGoal, EntityType, Faction, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { updateAI } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { updatePerceptionFields } from '../src/systems/fields';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { updateFactionActivity } from '../src/systems/factions';
import { checkQuests } from '../src/systems/quests';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';

const floorId = process.argv[2] ?? 'living';
const seed = Number(process.argv[3] ?? 1337);
const seconds = Number(process.argv[4] ?? 40);
const dt = 1 / 60;
const ticks = Math.round(seconds / dt);
const WARMUP = Math.round(10 / dt);

seedGlobalRng(seed);
const scene = buildFloor(floorId, seed);
const state: GameState = createArenaGameState();
state.currentZ = 0;
ensureAlifeState(state);
try {
  materializeAlifeFloorPopulation(state, scene.world, scene.entities, scene.nextId, `design:${floorId}`);
} catch (err) {
  console.error('materialize failed:', (err as Error).message);
}

/* Тело игрока стенду нужно только как аргумент: фракционные события и проверка
 * заданий его читают. В массив сущностей оно НЕ кладётся — иначе стенд начал бы
 * мерить другой мир. */
const player: Entity = {
  id: scene.nextId.v++,
  type: EntityType.NPC,
  x: scene.camX + 0.5, y: scene.camY + 0.5,
  hp: 100, maxHp: 100, alive: true, speed: 3,
  faction: Faction.PLAYER,
  persistentNpcId: 'player',
  inventory: [],
  ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
} as unknown as Entity;
setCurrentPlayerEntity(player);

const msgs: unknown[] = [];
let simTime = 0;
const perception: number[] = [];
const ai: number[] = [];
const faction: number[] = [];
const quests: number[] = [];
let factionErr = '';
let questErr = '';

for (let tick = 0; tick < ticks; tick++) {
  state.tick = tick;
  rebuildEntityIndexForSimulation(scene.entities, tick);

  const p0 = performance.now();
  updatePerceptionFields(scene.world, dt);
  const pMs = performance.now() - p0;

  const a0 = performance.now();
  updateAI(
    scene.world, scene.entities, dt, simTime, msgs as never[], 0,
    state.clock, false, scene.nextId, 0, state,
  );
  const aMs = performance.now() - a0;

  let fMs = 0;
  const f0 = performance.now();
  try {
    updateFactionActivity(scene.world, scene.entities, player, state, scene.nextId, dt, false);
  } catch (err) { factionErr = (err as Error).message; }
  fMs = performance.now() - f0;

  let qMs = 0;
  if (tick % 30 === 0) {
    const q0 = performance.now();
    try {
      checkQuests(player, scene.world, scene.entities, state, state.msgs, scene.nextId);
    } catch (err) { questErr = (err as Error).message; }
    qMs = performance.now() - q0;
  }

  simTime += dt;
  state.time = simTime;
  if (tick >= WARMUP) {
    perception.push(pMs);
    ai.push(aMs);
    faction.push(fMs);
    quests.push(qMs);
  }
  if (scene.entities.some(e => !e.alive)) scene.entities = scene.entities.filter(e => e.alive);
}

function stats(a: number[]): Record<string, number> {
  if (a.length === 0) return { n: 0 };
  const s = [...a].sort((x, y) => x - y);
  const sum = s.reduce((m, v) => m + v, 0);
  return {
    n: s.length,
    mean: +(sum / s.length).toFixed(4),
    median: +s[s.length >> 1].toFixed(4),
    p95: +s[Math.floor(s.length * 0.95)].toFixed(4),
    p99: +s[Math.floor(s.length * 0.99)].toFixed(4),
    max: +s[s.length - 1].toFixed(4),
    /* Сколько кадров дороже 5 мс — «пила» видна именно здесь. */
    over5ms: a.filter(v => v > 5).length,
  };
}

const alive = { npc: 0, mon: 0 };
for (const e of scene.entities) {
  if (!e.alive) continue;
  if (e.type === EntityType.NPC) alive.npc++;
  else if (e.type === EntityType.MONSTER) alive.mon++;
}

console.log(JSON.stringify({
  floor: floorId, seed, seconds, alive,
  perception: stats(perception),
  ai: stats(ai),
  faction: stats(faction),
  quests: stats(quests),
  factionErr, questErr,
}));
