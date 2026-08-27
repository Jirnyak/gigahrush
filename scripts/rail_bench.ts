#!/usr/bin/env tsx
/* Рельсовый этаж: кого давит состав и остаётся ли этаж проходимым.
 *
 * Отличие от `hazard_bench.ts` одно: в кадр добавлен `updateRailTrains`. Без
 * него состав стоит на месте и переезд не случается ни разу.
 *
 * Мерится два разных вопроса, и путать их нельзя:
 *   · СМЕРТНОСТЬ — сколько жильцов и тварей состав переехал за прогон;
 *   · ПРОХОДИМОСТЬ — сколько времени клетка пути занята составом. Это и есть
 *     цена перехода через рельсы: доля прогона, в которую переход смертелен.
 *     Она НЕ зависит от величины урона и потому честно сравнивает варианты
 *     симметризации между собой.
 *
 * Ловушка A-Life та же: `buildFloor` отдаёт NPC без оружия и брони.
 *
 * Запуск: npx tsx scripts/rail_bench.ts <designFloorId> <seed> <seconds>
 */
import '../src/content';
import { EntityType, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { updateAI } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { updatePerceptionFields } from '../src/systems/fields';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { updateRailTrains } from '../src/systems/rail_trains';
import { setActorDeathHandler } from '../src/systems/actor_damage';

const floorId = process.argv[2] ?? 'dark_metro';
const seed = Number(process.argv[3] ?? 1337);
const seconds = Number(process.argv[4] ?? 60);
const dt = 1 / 60;
const ticks = Math.round(seconds / dt);
const WARMUP = Math.round(10 / dt);

seedGlobalRng(seed);
const scene = buildFloor(floorId, seed);
const state: GameState = createArenaGameState();
ensureAlifeState(state);
materializeAlifeFloorPopulation(state, scene.world, scene.entities, scene.nextId, `design:${floorId}`);

/* Игрока на этаже нет: состав принимает тело только ради предупреждения и
 * привязки пассажира. Ставим его далеко от любых рельсов. */
const ghost: Entity = {
  id: -1, type: EntityType.NPC, x: 0.5, y: 0.5, angle: 0, pitch: 0,
  alive: true, speed: 0, hp: 1_000_000, maxHp: 1_000_000, sprite: 0,
};

let crushedNpc = 0;
let crushedMonster = 0;
let hits = 0;      // тактов урона составом
let survived = 0;  // из них пережитых
const hpBefore = new Map<number, number>();
/* Обработчик смерти обязан быть поставлен: без него переехавший не доходит до
 * общей обработки вовсе. Считать по нему нельзя — он ловит и гибель в бою. */
setActorDeathHandler(() => {});

function alive(list: Entity[], type: EntityType): number {
  let n = 0;
  for (const e of list) if (e.alive && e.type === type) n++;
  return n;
}

const trackCells = new Set<number>();
for (const track of scene.world.railTracks) for (const ci of track.cells) trackCells.add(ci);

const msgs: unknown[] = [];
let simTime = 0;
const frames: number[] = [];
let npc0 = 0, mon0 = 0;
/* Занятость пути: сколько клеток пути накрыто составом в каждом кадре.
 * Отдельно по КАЖДОМУ пути: средняя по этажу прячет короткое кольцо, где
 * состав стоит на трети клеток, за длинной линией, где он занимает процент. */
let occupiedCellTicks = 0;
let measuredTicks = 0;
const perTrackOccupied = new Map<string, number>();
/* Смертельная доля: клетки, накрытые ДВИЖУЩИМСЯ составом. Стоящий на станции
 * состав никого не давит (`trainStopped` отсекает столкновения раньше урона),
 * поэтому в цену перехода он не входит. */
const perTrackLethal = new Map<string, number>();
const cellTrack = new Map<number, string>();
for (const track of scene.world.railTracks) for (const ci of track.cells) cellTrack.set(ci, track.id);

for (let tick = 0; tick < ticks; tick++) {
  rebuildEntityIndexForSimulation(scene.entities, tick);
  updatePerceptionFields(scene.world, dt);
  const t0 = performance.now();
  updateAI(
    scene.world, scene.entities, dt, simTime, msgs as never[], 0,
    state.clock, false, scene.nextId, 0, state,
  );
  /* Переезд считается ЗДЕСЬ, а не по обработчику смерти: тот ловит и гибель в
   * бою, и на нём одном 641 смерть выглядела как 35 переездов. Снимок здоровья
   * вокруг одного вызова отделяет состав от всего остального. */
  hpBefore.clear();
  for (const e of scene.entities) if (e.alive && e.hp !== undefined) hpBefore.set(e.id, e.hp);
  updateRailTrains(scene.world, scene.entities, ghost, state, dt);
  if (tick >= WARMUP) {
    for (const e of scene.entities) {
      const before = hpBefore.get(e.id);
      if (before === undefined || (e.hp ?? before) >= before) continue;
      hits++;
      if (!e.alive) { if (e.type === EntityType.MONSTER) crushedMonster++; else crushedNpc++; }
      else survived++;
    }
  }
  const ms = performance.now() - t0;
  simTime += dt;
  state.time = simTime;
  if (tick === WARMUP) {
    npc0 = alive(scene.entities, EntityType.NPC);
    mon0 = alive(scene.entities, EntityType.MONSTER);
  }
  if (tick >= WARMUP) {
    frames.push(ms);
    occupiedCellTicks += scene.world.railTrainCells.size;
    for (const [ci, trainIndex] of scene.world.railTrainCells) {
      const id = cellTrack.get(ci);
      if (!id) continue;
      perTrackOccupied.set(id, (perTrackOccupied.get(id) ?? 0) + 1);
      const t = scene.world.railTrains[trainIndex];
      if (t && !(t.stopUntil < 0 || state.time <= t.stopUntil)) perTrackLethal.set(id, (perTrackLethal.get(id) ?? 0) + 1);
    }
    measuredTicks++;
  }
  if (scene.entities.some(e => !e.alive)) scene.entities = scene.entities.filter(e => e.alive);
}

frames.sort((a, b) => a - b);
const npc1 = alive(scene.entities, EntityType.NPC);
const mon1 = alive(scene.entities, EntityType.MONSTER);
const trackLen = trackCells.size;
const occupancy = trackLen > 0 && measuredTicks > 0
  ? occupiedCellTicks / measuredTicks / trackLen
  : 0;

console.log(JSON.stringify({
  floorId, seed, seconds,
  trains: scene.world.railTrains.length,
  trackCells: trackLen,
  npc0, npc1, npcDeaths: npc0 - npc1,
  mon0, mon1, monDeaths: mon0 - mon1,
  crushedNpc, crushedMonster, railHits: hits, railSurvived: survived,
  trackOccupancy: +(occupancy * 100).toFixed(3),
  perTrack: scene.world.railTracks.map(t => ({
    id: t.id,
    cells: t.cells.length,
    occupancyPct: +(((perTrackOccupied.get(t.id) ?? 0) / Math.max(1, measuredTicks) / Math.max(1, t.cells.length)) * 100).toFixed(2),
    lethalPct: +(((perTrackLethal.get(t.id) ?? 0) / Math.max(1, measuredTicks) / Math.max(1, t.cells.length)) * 100).toFixed(2),
  })),
  frameMedianMs: +(frames[Math.floor(frames.length / 2)] ?? 0).toFixed(3),
}, null, 2));
