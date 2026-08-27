#!/usr/bin/env tsx
/* Играбельность Головного слизня на живом этаже: успевает ли он добить.
 *
 * Считает по каждой особи: сколько раз сорвался с шеи, сколько раз переполз,
 * сколько секунд провёл сорванным и была ли у него в этот момент СВОЯ жертва.
 * Последнее число и есть ответ на вопрос «не делает ли новое правило тварь
 * неиграбельной»: сорванный слизень без своей жертвы переползти не может.
 *
 * Ловушка стенда закрыта как в `floor_bench.ts`: A-Life материализуется, иначе
 * NPC выходят без оружия и брони и слизня никто не сбивает с носителя.
 *
 * Запуск: npx tsx scripts/head_slug_bench.ts <designFloorId> <seconds> <seed…>
 */
import '../src/content';
import { EntityType, MonsterKind, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { updateAI } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { updatePerceptionFields } from '../src/systems/fields';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { headSlugVictimOf } from '../src/systems/ai/monster';
import { HEAD_SLUG_DETACHED_STAGE } from '../src/entities/head_slug';

const floorId = process.argv[2] ?? 'bolnichny_korpus';
const seconds = Number(process.argv[3] ?? 120);
const seeds = process.argv.slice(4).map(Number);
const dt = 1 / 60;
const ticks = Math.round(seconds / dt);

interface Row {
  seed: number;
  slugs: number;
  detaches: number;
  rehosts: number;
  detachedSec: number;
  detachedWithVictimSec: number;
  victimsRemembered: number;
  slugDeaths: number;
}

const rows: Row[] = [];

for (const seed of seeds.length > 0 ? seeds : [1337]) {
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

  const msgs: unknown[] = [];
  let simTime = 0;
  const prevStage = new Map<number, number>();
  const seenVictim = new Map<number, Set<number>>();
  const row: Row = { seed, slugs: 0, detaches: 0, rehosts: 0, detachedSec: 0, detachedWithVictimSec: 0, victimsRemembered: 0, slugDeaths: 0 };
  const slugIds = new Set<number>();
  for (const e of scene.entities) if (e.monsterKind === MonsterKind.HEAD_SLUG) slugIds.add(e.id);
  row.slugs = slugIds.size;

  for (let tick = 0; tick < ticks; tick++) {
    rebuildEntityIndexForSimulation(scene.entities, tick);
    updatePerceptionFields(scene.world, dt);
    updateAI(
      scene.world, scene.entities, dt, simTime, msgs as never[], 0,
      state.clock, false, scene.nextId, 0, state,
    );
    simTime += dt;
    state.time = simTime;
    for (const e of scene.entities) {
      if (e.monsterKind !== MonsterKind.HEAD_SLUG || !e.alive) continue;
      const stage = e.monsterStage ?? 0;
      const prev = prevStage.get(e.id);
      if (prev !== undefined && prev !== stage) {
        if (stage === HEAD_SLUG_DETACHED_STAGE) row.detaches++;
        else row.rehosts++;
      }
      prevStage.set(e.id, stage);
      const victim: Entity | undefined = headSlugVictimOf(e);
      if (victim) {
        let set = seenVictim.get(e.id);
        if (!set) seenVictim.set(e.id, set = new Set());
        if (!set.has(victim.id)) { set.add(victim.id); row.victimsRemembered++; }
      }
      if (stage === HEAD_SLUG_DETACHED_STAGE) {
        row.detachedSec += dt;
        if (victim) row.detachedWithVictimSec += dt;
      }
    }
    if (scene.entities.some(e => !e.alive && e.type === EntityType.PROJECTILE)) {
      scene.entities = scene.entities.filter(e => e.alive || e.type !== EntityType.PROJECTILE);
    }
  }
  for (const id of slugIds) {
    const e = scene.entities.find(x => x.id === id);
    if (!e || !e.alive) row.slugDeaths++;
  }
  rows.push(row);
}

const sum = <K extends keyof Row>(k: K): number => rows.reduce((a, r) => a + (r[k] as number), 0);
console.log(JSON.stringify({
  floor: floorId, seconds, seeds: rows.map(r => r.seed),
  perSeed: rows,
  total: {
    slugs: sum('slugs'), detaches: sum('detaches'), rehosts: sum('rehosts'),
    detachedSec: +sum('detachedSec').toFixed(1),
    detachedWithVictimSec: +sum('detachedWithVictimSec').toFixed(1),
    victimsRemembered: sum('victimsRemembered'), slugDeaths: sum('slugDeaths'),
  },
}, null, 1));
