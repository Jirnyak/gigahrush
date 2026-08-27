#!/usr/bin/env tsx
/* Успевает ли Головной слизень добить: замкнутая палата, слизень против людей.
 *
 * Живой этаж отвечает на этот вопрос нулями — там слизень гибнет за две минуты
 * и до переползания не доходит НИ ПРИ СТАРОМ, НИ ПРИ НОВОМ правиле. Здесь тот
 * же вопрос задан в лучшей для твари обстановке: комната, N безоружных людей,
 * никого больше. Считается, кого он положил и переполз ли.
 *
 * Запуск: npx tsx scripts/head_slug_duel.ts <людей> <секунд> <сид…>
 */
import '../src/content';
import { AIGoal, Cell, EntityType, Faction, MonsterKind, RoomType, type Entity, type GameState } from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { DEF, HEAD_SLUG_DETACHED_STAGE, HEAD_SLUG_HOSTED_STAGE } from '../src/entities/head_slug';
import { updateAI } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { updatePerceptionFields } from '../src/systems/fields';
import { headSlugVictimOf } from '../src/systems/ai/monster';
import { createArenaGameState } from '../src/arena_scenarios';
import { benchNpc } from './bench_actors';

const people = Number(process.argv[2] ?? 4);
const seconds = Number(process.argv[3] ?? 120);
const seeds = process.argv.slice(4).map(Number);
const dt = 1 / 60;
const ticks = Math.round(seconds / dt);

function ward(): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let y = 200; y < 216; y++) for (let x = 200; x < 216; x++) world.cells[world.idx(x, y)] = Cell.FLOOR;
  world.roomMap.fill(0);
  world.zoneMap.fill(0);
  world.light.fill(0.5);
  world.zones[0] = { id: 0, cx: 208, cy: 208, faction: 0, hasLift: false, fogged: false, level: 1, hqRoomId: -1 };
  world.rooms[0] = {
    id: 0, type: RoomType.MEDICAL, x: 200, y: 200, w: 16, h: 16, doors: [], sealed: false,
    name: 'Палата', apartmentId: -1, wallTex: 0, floorTex: 0,
  };
  return world;
}

const rows: Record<string, number | string>[] = [];

for (const seed of seeds.length > 0 ? seeds : [1337]) {
  seedGlobalRng(seed);
  const world = ward();
  const slug: Entity = {
    id: 2, type: EntityType.MONSTER, x: 204, y: 204, angle: 0, pitch: 0, alive: true,
    speed: DEF.speed, sprite: DEF.sprite, hp: DEF.hp, maxHp: DEF.hp,
    monsterKind: MonsterKind.HEAD_SLUG, monsterStage: HEAD_SLUG_HOSTED_STAGE,
    attackCd: 0, currentMag: 1, faction: Faction.WILD,
    ai: { goal: AIGoal.WANDER, tx: 204, ty: 204, path: [], pi: 0, stuck: 0, timer: 0 },
  };
  const crowd = Array.from({ length: people }, (_, i) => benchNpc({
    id: 10 + i, name: `Пациент ${i}`, x: 206 + (i % 4) * 1.5, y: 206 + Math.floor(i / 4) * 1.5,
    hp: 60, maxHp: 60, speed: 0.9, faction: Faction.CITIZEN,
    ai: { goal: AIGoal.WANDER, tx: 208, ty: 208, path: [], pi: 0, stuck: 0, timer: 0 },
  }));
  let entities = [slug, ...crowd];
  const state: GameState = createArenaGameState();
  const msgs: unknown[] = [];
  let simTime = 0;
  let detaches = 0, rehosts = 0, prevStage = slug.monsterStage ?? 0;
  let firstKillSec = -1, firstDetachSec = -1, deathSec = -1;
  const victims = new Set<number>();

  for (let tick = 0; tick < ticks; tick++) {
    rebuildEntityIndexForSimulation(entities, tick);
    updatePerceptionFields(world, dt);
    updateAI(world, entities, dt, simTime, msgs as never[], 0, state.clock, false, { v: 900 }, 0, state);
    simTime += dt;
    state.time = simTime;
    if (slug.alive) {
      const stage = slug.monsterStage ?? 0;
      if (stage !== prevStage) {
        if (stage === HEAD_SLUG_DETACHED_STAGE) { detaches++; if (firstDetachSec < 0) firstDetachSec = simTime; }
        else rehosts++;
        prevStage = stage;
      }
      const victim = headSlugVictimOf(slug);
      if (victim && !victims.has(victim.id)) { victims.add(victim.id); if (firstKillSec < 0) firstKillSec = simTime; }
    } else if (deathSec < 0) {
      deathSec = simTime;
    }
  }

  rows.push({
    seed, people,
    людейЖивых: entities.filter(e => e.alive && e.type === EntityType.NPC).length,
    слизеньЖив: slug.alive ? 'да' : 'нет',
    смертьСек: deathSec < 0 ? '—' : deathSec.toFixed(1),
    своихЖертв: victims.size,
    перваяЖертваСек: firstKillSec < 0 ? '—' : firstKillSec.toFixed(1),
    срывов: detaches,
    первыйСрывСек: firstDetachSec < 0 ? '—' : firstDetachSec.toFixed(1),
    переползаний: rehosts,
  });
}

console.log(JSON.stringify(rows, null, 1));
