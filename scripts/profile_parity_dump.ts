#!/usr/bin/env tsx
/* Дамп боевых справок всего населения этажа: побайтовая сверка кэша с прямым счётом.
 *
 * Прогон живого этажа, снимок профиля КАЖДОГО NPC на контрольных тактах, плюс
 * отдельная проба на смену оружия, брони и уровня прямо посреди прогона —
 * кэш обязан отдать новое число тем же тактом.
 *
 * Запуск: npx tsx scripts/profile_parity_dump.ts <designFloorId> <seed> <seconds>
 */
import '../src/content';
import { EntityType, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { updateAI } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { updatePerceptionFields } from '../src/systems/fields';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { npcCombatProfile } from '../src/systems/combat_stimulus';

const floorId = process.argv[2] ?? 'living';
const seed = Number(process.argv[3] ?? 1337);
const seconds = Number(process.argv[4] ?? 20);
const dt = 1 / 60;
const ticks = Math.round(seconds / dt);

seedGlobalRng(seed);
const scene = buildFloor(floorId, seed);
const state: GameState = createArenaGameState();
state.currentZ = 0;
ensureAlifeState(state);
materializeAlifeFloorPopulation(state, scene.world, scene.entities, scene.nextId, `design:${floorId}`);

const out: string[] = [];

function fmt(v: number): string {
  return Number.isFinite(v) ? v.toPrecision(17) : String(v);
}

function dumpAll(tag: string): void {
  const npcs = scene.entities.filter(e => e.type === EntityType.NPC).sort((a, b) => a.id - b.id);
  for (const e of npcs) {
    const p = npcCombatProfile(e);
    out.push(`${tag}\t${e.id}\t${p.brave ? 1 : 0}\t${p.armed ? 1 : 0}\t${p.ranged ? 1 : 0}\t${fmt(p.hpRatio)}\t${fmt(p.threatScore)}`);
  }
}

/** Проба смены снаряжения: те же личности, меняем вход за входом и печатаем
 *  профиль СРАЗУ после мутации, без единого такта между. */
function mutationProbe(tag: string, sample: Entity[]): void {
  const weapons = ['', 'knife', 'pmm', 'ppsh', 'gauss', 'boltcutter'];
  for (const e of sample) {
    for (const w of weapons) {
      e.weapon = w;
      const p = npcCombatProfile(e);
      out.push(`${tag}:w=${w}\t${e.id}\t${p.brave ? 1 : 0}\t${p.armed ? 1 : 0}\t${p.ranged ? 1 : 0}\t${fmt(p.hpRatio)}\t${fmt(p.threatScore)}`);
    }
    // Броня входом справки не является: профиль обязан НЕ измениться.
    const before = npcCombatProfile(e);
    e.armorDefId = 'kombez';
    e.monsterArmorStacks = 3;
    const afterArmor = npcCombatProfile(e);
    out.push(`${tag}:armorNoop\t${e.id}\t${before.threatScore === afterArmor.threatScore ? 'same' : 'CHANGED'}`);
    // Уровень входом является.
    if (e.rpg) {
      e.rpg.level = (e.rpg.level ?? 1) + 7;
      const p = npcCombatProfile(e);
      out.push(`${tag}:lvl+7\t${e.id}\t${fmt(p.threatScore)}`);
    }
    // Здоровье — тоже, и без всякого ключа.
    e.hp = Math.max(1, Math.round((e.hp ?? 20) / 3));
    const ph = npcCombatProfile(e);
    out.push(`${tag}:hp/3\t${e.id}\t${fmt(ph.hpRatio)}\t${fmt(ph.threatScore)}`);
  }
}

const msgs: unknown[] = [];
let simTime = 0;
for (let tick = 0; tick < ticks; tick++) {
  state.tick = tick;
  rebuildEntityIndexForSimulation(scene.entities, tick);
  updatePerceptionFields(scene.world, dt);
  updateAI(
    scene.world, scene.entities, dt, simTime, msgs as never[], 0,
    state.clock, false, scene.nextId, 0, state,
  );
  simTime += dt;
  state.time = simTime;
  if (tick % 300 === 0) dumpAll(`t${tick}`);
  if (scene.entities.some(e => !e.alive)) scene.entities = scene.entities.filter(e => e.alive);
}
dumpAll('final');
mutationProbe('probe', scene.entities.filter(e => e.type === EntityType.NPC).sort((a, b) => a.id - b.id).slice(0, 120));
dumpAll('afterProbe');

process.stdout.write(out.join('\n') + '\n');
