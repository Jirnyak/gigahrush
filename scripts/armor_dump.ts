#!/usr/bin/env tsx
/* Кто во что одет на этаже: доля видов брони по фракциям и занятиям.
 *
 * Ловушка та же, что у соседних стендов: `buildFloor` отдаёт NPC БЕЗ брони —
 * снаряжение раздаёт материализация A-Life, и без неё любая доля будет нулём.
 * Раздача детерминирована по `unit(alife.seed, record.id, 703/704)`, поэтому
 * числа воспроизводятся при одном сиде.
 *
 * Запуск: npx tsx scripts/armor_dump.ts <designFloorId> <seed>
 */
import '../src/content';
import { EntityType, Faction, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { occupationProfile } from '../src/data/occupation_profiles';

const floorId = process.argv[2] ?? 'living';
const seed = Number(process.argv[3] ?? 1337);

seedGlobalRng(seed);
const scene = buildFloor(floorId, seed);
const state: GameState = createArenaGameState();
ensureAlifeState(state);
materializeAlifeFloorPopulation(state, scene.world, scene.entities, scene.nextId, `design:${floorId}`);

const FACTION_NAME = ['граждане', 'ликвидаторы', 'культисты', 'учёные', 'дикие', 'игрок'];

const npcs = scene.entities.filter((e: Entity) => e.alive && e.type === EntityType.NPC);
const byArmor = new Map<string, number>();
const byOccupation = new Map<string, Map<string, number>>();
const byFaction = new Map<string, Map<string, number>>();

function bump(outer: Map<string, Map<string, number>>, key: string, armor: string): void {
  let inner = outer.get(key);
  if (!inner) { inner = new Map(); outer.set(key, inner); }
  inner.set(armor, (inner.get(armor) ?? 0) + 1);
  inner.set('ВСЕГО', (inner.get('ВСЕГО') ?? 0) + 1);
}

for (const e of npcs) {
  const armor = e.armorDefId ?? '—';
  byArmor.set(armor, (byArmor.get(armor) ?? 0) + 1);
  const occ = occupationProfile(e.occupation)?.label ?? 'без занятия';
  bump(byOccupation, occ, armor);
  bump(byFaction, FACTION_NAME[e.faction ?? Faction.CITIZEN] ?? String(e.faction), armor);
}

function render(outer: Map<string, Map<string, number>>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [key, inner] of [...outer.entries()].sort((a, b) => (b[1].get('ВСЕГО') ?? 0) - (a[1].get('ВСЕГО') ?? 0))) {
    const total = inner.get('ВСЕГО') ?? 0;
    const row: Record<string, string> = { n: String(total) };
    for (const [armor, n] of [...inner.entries()].sort((a, b) => b[1] - a[1])) {
      if (armor === 'ВСЕГО') continue;
      row[armor] = `${(n / total * 100).toFixed(1)}% (${n})`;
    }
    out[key] = row;
  }
  return out;
}

console.log(JSON.stringify({
  floor: floorId, seed, npc: npcs.length,
  byArmor: Object.fromEntries([...byArmor.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, n]) => [k, `${(n / npcs.length * 100).toFixed(1)}% (${n})`])),
  byFaction: render(byFaction),
  byOccupation: render(byOccupation),
}, null, 1));
