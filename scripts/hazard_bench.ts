#!/usr/bin/env tsx
/* Живой этаж без игрока: кто гибнет на опасных клетках и спасает ли броня.
 *
 * Отличие от `floor_bench.ts` ровно одно: здесь в кадр добавлен
 * `tickCellHazards`. Без него кислота, пар и разряд не тикают вовсе, и замер
 * средового урона показывает побайтово одинаковые числа до и после правки.
 *
 * Ловушка A-Life та же, что у соседнего стенда: `buildFloor` отдаёт NPC БЕЗ
 * оружия и БЕЗ брони. Материализация обязательна, иначе доля химзащиты — ноль
 * в обоих прогонах.
 *
 * Запуск: npx tsx scripts/hazard_bench.ts <designFloorId> <seed> <seconds>
 */
import '../src/content';
import { DamageType, EntityType, Faction, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { updateAI } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { updatePerceptionFields } from '../src/systems/fields';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { entityInActiveCellHazard, tickCellHazards } from '../src/systems/cell_hazards';
import { setActorDeathHandler } from '../src/systems/actor_damage';
import { ITEMS } from '../src/data/items';

const floorId = process.argv[2] ?? 'maintenance';
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

/* Игрока на этаже нет. Пустое тело нужно только затем, что такт опасности
 * принимает его для строк журнала и радиуса сообщений; на опасной клетке оно
 * не стоит и в индексе сущностей не числится. */
const ghost: Entity = {
  id: -1, type: EntityType.NPC, x: 0.5, y: 0.5, angle: 0, pitch: 0,
  alive: true, speed: 0, hp: 1_000_000, maxHp: 1_000_000, sprite: 0,
};

const FACTION_NAME = ['граждане', 'ликвидаторы', 'культисты', 'учёные', 'дикие', 'игрок'];
const OCCUPATION_NAME = [
  'домохозяйка', 'слесарь', 'секретарь', 'электрик', 'повар', 'врач', 'токарь',
  'механик', 'кладовщик', 'алкоголик', 'учёный', 'ребёнок', 'директор', 'путник',
  'паломник', 'охотник', 'батюшка', 'перформер', 'уборщица', 'работница-69',
  'инженер', 'учитель', 'гражданская оборона',
];
const CHEM_MIN_BIO_RESIST = 35;

function bioResist(e: Entity): number {
  const def = e.armorDefId ? ITEMS[e.armorDefId] : undefined;
  return def?.resistances?.[DamageType.BIO] ?? 0;
}
function wearsChem(e: Entity): boolean {
  return bioResist(e) >= CHEM_MIN_BIO_RESIST;
}
function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

const deathsByFaction = new Map<string, number>();
const deathsByOccupation = new Map<string, number>();
const hazardDeathsByFaction = new Map<string, number>();
const hazardDeathsByOccupation = new Map<string, number>();
let npcDeaths = 0;
let monsterDeaths = 0;
let hazardDeaths = 0;
let hazardDeathsInChem = 0;
/* Смерть от среды считается ДВУМЯ независимыми способами, потому что ни один
 * не полон сам по себе:
 *   1. обработчик смерти ловит ровно тех, кого добила дверь без автора, — но
 *      боевые пути его минуют по `deathByCaller`, поэтому по нему не посчитать
 *      общую смертность;
 *   2. разностью живых считается ВСЯ смертность, но без причины.
 * Пересечение и даёт ответ «мир схлопнулся или нет». */
let envDoorDeaths = 0;

setActorDeathHandler((victim, killer) => {
  if (killer !== undefined || victim.type !== EntityType.NPC) return;
  envDoorDeaths++;
});

interface RosterEntry { faction: string; occupation: string; chem: boolean; lastHazardT: number }
const roster = new Map<number, RosterEntry>();
function enrol(e: Entity): void {
  roster.set(e.id, {
    faction: FACTION_NAME[e.faction ?? Faction.CITIZEN] ?? String(e.faction),
    occupation: e.occupation === undefined ? 'без занятия' : (OCCUPATION_NAME[e.occupation] ?? String(e.occupation)),
    chem: wearsChem(e),
    lastHazardT: -Infinity,
  });
}
/** Умер, стоя в опасности или сразу после неё: такт опасности идёт раз в 0.25 с,
 *  окно взято с запасом в одну секунду. */
const HAZARD_ATTRIBUTION_WINDOW = 1;

function alive(list: Entity[], type: EntityType): Entity[] {
  return list.filter(e => e.alive && e.type === type);
}

let npc0: Entity[] = [];
let mon0 = 0;
let chem0 = 0;
let simTime = 0;
const frames: number[] = [];
/* Сколько акторов ОДНОВРЕМЕННО стоят на активной опасной клетке: прямая цена
 * правки в кадре и прямая мера того, насколько среда вообще достижима. */
const standing: number[] = [];
const msgs: unknown[] = [];

for (let tick = 0; tick < ticks; tick++) {
  rebuildEntityIndexForSimulation(scene.entities, tick);
  updatePerceptionFields(scene.world, dt);
  const t0 = performance.now();
  updateAI(
    scene.world, scene.entities, dt, simTime, msgs as never[], 0,
    state.clock, false, scene.nextId, 0, state,
  );
  tickCellHazards(scene.world, scene.entities, state, dt, ghost, false);
  const ms = performance.now() - t0;
  simTime += dt;
  state.time = simTime;
  if (tick === WARMUP) {
    npc0 = alive(scene.entities, EntityType.NPC);
    mon0 = alive(scene.entities, EntityType.MONSTER).length;
    chem0 = npc0.filter(wearsChem).length;
    for (const e of npc0) enrol(e);
    envDoorDeaths = 0;
  }
  if (tick >= WARMUP) {
    frames.push(ms);
    /* Такт опасности идёт раз в 0.25 с; отметка присутствия снимается тем же
     * шагом, иначе перебор всего этажа каждый кадр сам станет замером. */
    if (tick % 15 === 0) {
      let onHazard = 0;
      for (const e of scene.entities) {
        if (!e.alive || (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER)) continue;
        if (!entityInActiveCellHazard(scene.world, e)) continue;
        onHazard++;
        const entry = roster.get(e.id);
        if (entry) entry.lastHazardT = simTime;
      }
      standing.push(onHazard);
    }
    for (const e of scene.entities) {
      if (e.alive) continue;
      if (e.type === EntityType.MONSTER) { monsterDeaths++; continue; }
      const entry = roster.get(e.id);
      if (!entry) continue;
      roster.delete(e.id);
      npcDeaths++;
      bump(deathsByFaction, entry.faction);
      bump(deathsByOccupation, entry.occupation);
      if (simTime - entry.lastHazardT <= HAZARD_ATTRIBUTION_WINDOW) {
        hazardDeaths++;
        if (entry.chem) hazardDeathsInChem++;
        bump(hazardDeathsByFaction, entry.faction);
        bump(hazardDeathsByOccupation, entry.occupation);
      }
    }
  }
  if (scene.entities.some(e => !e.alive)) scene.entities = scene.entities.filter(e => e.alive);
}

const npcAlive = alive(scene.entities, EntityType.NPC);
const chemAlive = npcAlive.filter(wearsChem).length;
const median = (a: number[]): number => {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const top = (m: Map<string, number>, n = 8): Record<string, number> =>
  Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n));

console.log(JSON.stringify({
  floor: floorId, seed, seconds,
  npc0: npc0.length, npcAlive: npcAlive.length, npcDeaths,
  npcMortality: npc0.length ? npcDeaths / npc0.length : 0,
  mon0, monsterDeaths,
  hazardDeaths, hazardDeathsInChem, envDoorDeaths,
  chemShareStart: npc0.length ? chem0 / npc0.length : 0,
  chemShareSurvivors: npcAlive.length ? chemAlive / npcAlive.length : 0,
  standingOnHazardMedian: median(standing), standingOnHazardMax: Math.max(0, ...standing),
  frameMedianMs: median(frames),
  deathsByFaction: top(deathsByFaction),
  hazardDeathsByFaction: top(hazardDeathsByFaction),
  hazardDeathsByOccupation: top(hazardDeathsByOccupation),
}, null, 1));
