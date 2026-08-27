#!/usr/bin/env tsx
/* Живой этаж без игрока: смертность, убийства, длительность схваток, кадр.
 *
 * Ловушка стенда: `buildFloor` отдаёт NPC БЕЗ СТВОЛОВ — он не материализует
 * A-Life. Здесь это закрыто `ensureAlifeState` + `materializeAlifeFloorPopulation`.
 *
 * Запуск: npx tsx floor_bench.ts <designFloorId> <seed> <seconds>
 */
import '../src/content';
import { EntityType, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { updateAI } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { updatePerceptionFields } from '../src/systems/fields';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { peekDashStats } from '../src/systems/ai/dash';
import { MONSTERS } from '../src/entities/monster';
import { MonsterKind } from '../src/core/types';

const floorId = process.argv[2] ?? 'living';
const seed = Number(process.argv[3] ?? 1337);
const seconds = Number(process.argv[4] ?? 60);
const dt = 1 / 60;
const ticks = Math.round(seconds / dt);
/* Окно устойчивого режима: первые 10 с этаж «раскачивается». */
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

function alive(list: Entity[], type: EntityType): number {
  let n = 0;
  for (const e of list) if (e.alive && e.type === type) n++;
  return n;
}

const msgs: unknown[] = [];
let simTime = 0;
const frames: number[] = [];
/** Схватка: непрерывный отрезок, пока у актора стоит боевая цель. */
const fightStart = new Map<number, number>();
const fights: number[] = [];
let mon0 = 0, npc0 = 0, monAt = 0, npcAt = 0;

for (let tick = 0; tick < ticks; tick++) {
  rebuildEntityIndexForSimulation(scene.entities, tick);
  updatePerceptionFields(scene.world, dt);
  const t0 = performance.now();
  updateAI(
    scene.world, scene.entities, dt, simTime, msgs as never[], 0,
    state.clock, false, scene.nextId, 0, state,
  );
  const ms = performance.now() - t0;
  simTime += dt;
  state.time = simTime;
  if (tick === WARMUP) {
    mon0 = alive(scene.entities, EntityType.MONSTER);
    npc0 = alive(scene.entities, EntityType.NPC);
  }
  if (tick >= WARMUP) {
    frames.push(ms);
    for (const e of scene.entities) {
      if (!e.ai) continue;
      const inFight = e.alive && e.ai.combatTargetId !== undefined;
      const started = fightStart.get(e.id);
      if (inFight && started === undefined) fightStart.set(e.id, simTime);
      else if (!inFight && started !== undefined) { fights.push(simTime - started); fightStart.delete(e.id); }
    }
  }
  if (scene.entities.some(e => !e.alive)) scene.entities = scene.entities.filter(e => e.alive);
}
monAt = alive(scene.entities, EntityType.MONSTER);
npcAt = alive(scene.entities, EntityType.NPC);

const median = (a: number[]): number => {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const span = seconds - WARMUP * dt;
/* Срывы рывков о геометрию: прямая проверка, что предикаты сведены без потери.
 * До сведения то же считалось руками в пяти разных ветках. */
const dashes: Record<string, string> = {};
for (const [kind, stat] of peekDashStats()) {
  dashes[MONSTERS[kind as MonsterKind]?.name ?? String(kind)] = `${stat.breaks}/${stat.tries} (скольжений ${stat.slides})`;
}
console.log(JSON.stringify({
  floor: floorId, seed,
  mon0, monAt, monDeaths: mon0 - monAt, monMortality: mon0 ? (mon0 - monAt) / mon0 : 0,
  npc0, npcAt, npcDeaths: npc0 - npcAt, npcMortality: npc0 ? (npc0 - npcAt) / npc0 : 0,
  killsPerMin: ((mon0 - monAt) + (npc0 - npcAt)) / span * 60,
  fights: fights.length, fightMedianSec: median(fights),
  frameMedianMs: median(frames),
  dashes,
}));
