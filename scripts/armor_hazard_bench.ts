#!/usr/bin/env tsx
/* Спасает ли костюм того, кому он выдан.
 *
 * Отличие от `hazard_bench.ts`: смертность режется не только по занятию, но и
 * по ПОДХОДЯЩЕЙ защите — по той оси урона, которой этаж бьёт. `hazard_bench`
 * знает только химию (BIO >= 35) и поэтому огневой костюм на этаже пара видит
 * как «без брони».
 *
 * Ловушка A-Life та же: `buildFloor` отдаёт NPC без снаряжения, материализация
 * обязательна.
 *
 * Запуск: npx tsx scripts/armor_hazard_bench.ts <designFloorId> <seed> <sec> <FIRE|BIO>
 */
import '../src/content';
import { DamageType, EntityType, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { updateAI } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { updatePerceptionFields } from '../src/systems/fields';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { entityInActiveCellHazard, tickCellHazards } from '../src/systems/cell_hazards';
import { ITEMS } from '../src/data/items';
import { occupationProfile } from '../src/data/occupation_profiles';

const floorId = process.argv[2] ?? 'harmonic_bathhouse';
const seed = Number(process.argv[3] ?? 1337);
const seconds = Number(process.argv[4] ?? 40);
const axisName = (process.argv[5] ?? 'FIRE') as 'FIRE' | 'BIO';
const AXIS = axisName === 'BIO' ? DamageType.BIO : DamageType.FIRE;
/* «Подходящая защита» — та, что держит ось этажа заметно лучше лёгкой (5).
 * Порог взят у самой лёгкой брони: всё, что выше её собственного числа по этой
 * оси, уже специализация, а не общая одежда. */
const SUITED_MIN = (ITEMS.armor_light.resistances?.[AXIS] ?? 0) + 1;

const dt = 1 / 60;
const ticks = Math.round(seconds / dt);
const WARMUP = Math.round(10 / dt);

seedGlobalRng(seed);
const scene = buildFloor(floorId, seed);
const state: GameState = createArenaGameState();
ensureAlifeState(state);
materializeAlifeFloorPopulation(state, scene.world, scene.entities, scene.nextId, `design:${floorId}`);

const ghost: Entity = {
  id: -1, type: EntityType.NPC, x: 0.5, y: 0.5, angle: 0, pitch: 0,
  alive: true, speed: 0, hp: 1_000_000, maxHp: 1_000_000, sprite: 0,
};

function axisResist(e: Entity): number {
  const def = e.armorDefId ? ITEMS[e.armorDefId] : undefined;
  return def?.resistances?.[AXIS] ?? 0;
}

interface Row { n: number; suited: number; deaths: number; deathsSuited: number; hazardDeaths: number; hazardDeathsSuited: number }
const rows = new Map<string, Row>();
function row(key: string): Row {
  let r = rows.get(key);
  if (!r) { r = { n: 0, suited: 0, deaths: 0, deathsSuited: 0, hazardDeaths: 0, hazardDeathsSuited: 0 }; rows.set(key, r); }
  return r;
}

interface Entry { occ: string; suited: boolean; lastHazardT: number }
const roster = new Map<number, Entry>();
const HAZARD_WINDOW = 1;

let simTime = 0;
const msgs: unknown[] = [];
const standing: number[] = [];
let armorDefIdsAtStart = '';

for (let tick = 0; tick < ticks; tick++) {
  rebuildEntityIndexForSimulation(scene.entities, tick);
  updatePerceptionFields(scene.world, dt);
  updateAI(
    scene.world, scene.entities, dt, simTime, msgs as never[], 0,
    state.clock, false, scene.nextId, 0, state,
  );
  tickCellHazards(scene.world, scene.entities, state, dt, ghost, false);
  simTime += dt;
  state.time = simTime;

  if (tick === WARMUP) {
    const worn = new Map<string, number>();
    for (const e of scene.entities) {
      if (!e.alive || e.type !== EntityType.NPC) continue;
      const occ = occupationProfile(e.occupation)?.label ?? 'без занятия';
      const suited = axisResist(e) >= SUITED_MIN;
      roster.set(e.id, { occ, suited, lastHazardT: -Infinity });
      const r = row(occ); r.n++; if (suited) r.suited++;
      const all = row('ВСЕ'); all.n++; if (suited) all.suited++;
      if (e.armorDefId) worn.set(e.armorDefId, (worn.get(e.armorDefId) ?? 0) + 1);
    }
    armorDefIdsAtStart = JSON.stringify(Object.fromEntries([...worn.entries()].sort((a, b) => b[1] - a[1])));
  }

  if (tick >= WARMUP) {
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
      const entry = roster.get(e.id);
      if (!entry) continue;
      roster.delete(e.id);
      for (const key of [entry.occ, 'ВСЕ']) {
        const r = row(key);
        r.deaths++; if (entry.suited) r.deathsSuited++;
        if (simTime - entry.lastHazardT <= HAZARD_WINDOW) {
          r.hazardDeaths++; if (entry.suited) r.hazardDeathsSuited++;
        }
      }
    }
  }
  if (scene.entities.some(e => !e.alive)) scene.entities = scene.entities.filter(e => e.alive);
}

const pct = (a: number, b: number): string => b > 0 ? `${(a / b * 100).toFixed(1)}%` : '—';
const out: Record<string, unknown> = {};
for (const [key, r] of [...rows.entries()].sort((a, b) => b[1].n - a[1].n)) {
  if (r.n < 5 && key !== 'ВСЕ') continue;
  out[key] = {
    n: r.n,
    suitedShare: pct(r.suited, r.n),
    mortality: pct(r.deaths, r.n),
    hazardDeaths: r.hazardDeaths,
    hazardMortalitySuited: pct(r.hazardDeathsSuited, r.suited),
    hazardMortalityBare: pct(r.hazardDeaths - r.hazardDeathsSuited, r.n - r.suited),
  };
}
console.log(JSON.stringify({
  floor: floorId, seed, seconds, axis: axisName, suitedMinResist: SUITED_MIN,
  standingOnHazardMedian: [...standing].sort((a, b) => a - b)[standing.length >> 1] ?? 0,
  wornAtStart: armorDefIdsAtStart,
  rows: out,
}, null, 1));
