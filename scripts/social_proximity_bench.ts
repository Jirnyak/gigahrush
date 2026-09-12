#!/usr/bin/env tsx
/* Близость связанных: сколько объявленных связей Демоса вообще достижимо глазом.
 *
 * Меряет РАЗНИЦУ между «связь объявлена» и «оба здесь, рядом»: у всех личностей
 * связи есть, но партнёр обязан быть материализован на том же этаже и ближе
 * радиуса, который читает AI (`DEMOS_SOCIAL_NEARBY_RADIUS`). Иначе социальный слой
 * не виден в игре нигде.
 *
 * Запуск: npx tsx scripts/social_proximity_bench.ts <floorId> <seed> [seed2 ...]
 */
import '../src/content';
import { EntityType, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { createPrefilledAlifeState, materializeAlifeFloorPopulation, peekAlifeSeatingStats } from '../src/systems/alife';
import { buildAlifePopulationPlan, ALIFE_POPULATION_BASELINE } from '../src/data/alife_population_plan';
import { getDemosNpcOnlySocialEdges } from '../src/systems/demos_social';
import {
  DEMOS_EDGE_ENEMY,
  DEMOS_EDGE_FAMILY,
  DEMOS_EDGE_FRIEND,
  DEMOS_SOCIAL_NEARBY_RADIUS,
} from '../src/data/demos_social';

const floorId = process.argv[2] ?? 'living';
const seeds = process.argv.slice(3).map(Number).filter(Number.isFinite);
if (seeds.length === 0) seeds.push(4242);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

interface SeedReport {
  seed: number;
  alive: number;
  withEdges: number;
  withLocalPartner: number;
  withNearPartner: number;
  nearShare: number;
  medianNearest: number;
  familyNear: number;
  familyLocal: number;
  enemyNear: number;
  enemyLocal: number;
  buildMs: number;
  materializeMs: number;
  seating: { anchored: number; seatedNear: number; plain: number };
}

function measureSeed(seed: number): SeedReport {
  seedGlobalRng(seed);
  const t0 = performance.now();
  const scene = buildFloor(floorId, seed);
  const buildMs = performance.now() - t0;
  const state: GameState = createArenaGameState();
  state.currentZ = 0;
  const plan = buildAlifePopulationPlan({ runSeed: seed, routeKeys: [], total: ALIFE_POPULATION_BASELINE });
  createPrefilledAlifeState(state, seed, plan.total, plan);
  const t1 = performance.now();
  materializeAlifeFloorPopulation(state, scene.world, scene.entities, scene.nextId, `design:${floorId}`);
  const materializeMs = performance.now() - t1;

  const byAlifeId = new Map<number, Entity>();
  for (const entity of scene.entities) {
    if (entity.type !== EntityType.NPC || !entity.alive || entity.alifeId === undefined) continue;
    byAlifeId.set(entity.alifeId, entity);
  }

  let withEdges = 0;
  let withLocalPartner = 0;
  let withNearPartner = 0;
  let familyLocal = 0;
  let familyNear = 0;
  let enemyLocal = 0;
  let enemyNear = 0;
  const nearest: number[] = [];
  const radius2 = DEMOS_SOCIAL_NEARBY_RADIUS * DEMOS_SOCIAL_NEARBY_RADIUS;

  for (const [, entity] of byAlifeId) {
    const edges = getDemosNpcOnlySocialEdges(state, entity.alifeId!);
    if (edges.length > 0) withEdges++;
    let best = Number.POSITIVE_INFINITY;
    let local = false;
    for (const edge of edges) {
      const other = edge.targetAlifeId === undefined ? undefined : byAlifeId.get(edge.targetAlifeId);
      if (!other) continue;
      local = true;
      const d2 = scene.world.dist2(entity.x, entity.y, other.x, other.y);
      if (d2 < best) best = d2;
      const family = (edge.flags & DEMOS_EDGE_FAMILY) !== 0;
      const friend = (edge.flags & DEMOS_EDGE_FRIEND) !== 0;
      const enemy = (edge.flags & DEMOS_EDGE_ENEMY) !== 0;
      if (family || friend) {
        familyLocal++;
        if (d2 <= radius2) familyNear++;
      }
      if (enemy) {
        enemyLocal++;
        if (d2 <= radius2) enemyNear++;
      }
    }
    if (local) {
      withLocalPartner++;
      nearest.push(Math.sqrt(best));
      if (best <= radius2) withNearPartner++;
    }
  }

  const alive = byAlifeId.size;
  return {
    seed,
    alive,
    withEdges,
    withLocalPartner,
    withNearPartner,
    nearShare: alive ? withNearPartner / alive : 0,
    medianNearest: Math.round(median(nearest)),
    familyNear,
    familyLocal,
    enemyNear,
    enemyLocal,
    buildMs: Math.round(buildMs),
    materializeMs: Math.round(materializeMs),
    seating: { ...peekAlifeSeatingStats() },
  };
}

const reports = seeds.map(measureSeed);
for (const report of reports) console.log(JSON.stringify(report));
