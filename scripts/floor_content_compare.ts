#!/usr/bin/env tsx
/* Фактическое содержание дизайн-этажа против объявленной опасности.
 *
 * Замер строится БЕЗ симуляции AI: всё, что нужно, видно сразу после генерации
 * и материализации A-Life. Сам такт опасности здесь не нужен — активные клетки
 * снимаются пульсовым окном отдельным стендом (`hazard_bench.ts`).
 *
 * Ловушка та же, что у соседних стендов: `buildFloor` отдаёт NPC БЕЗ оружия и
 * БЕЗ брони, поэтому материализация A-Life обязательна.
 *
 * Запуск: npx tsx scripts/floor_content_compare.ts <floorId,floorId,...> <seed>
 */
import '../src/content';
import { Cell, DamageType, EntityType, type Entity } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { entityInActiveCellHazard, tickCellHazards } from '../src/systems/cell_hazards';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import { MONSTERS } from '../src/entities/monster';
import { ITEMS } from '../src/data/items';
import { calculateMaxLootValue } from '../src/systems/procedural_loot';

const floors = (process.argv[2] ?? 'maintenance').split(',');
const seed = Number(process.argv[3] ?? 1337);

const CHEM_MIN_BIO_RESIST = 35;
const OZK_VALUE = ITEMS['armor_ozk'].value;

function bioResist(e: Entity): number {
  const def = e.armorDefId ? ITEMS[e.armorDefId] : undefined;
  return def?.resistances?.[DamageType.BIO] ?? 0;
}

const rows: Record<string, unknown>[] = [];

for (const floorId of floors) {
  const route = DESIGN_FLOOR_ROUTES.find(r => r.id === floorId);
  seedGlobalRng(seed);
  const scene = buildFloor(floorId, seed);
  const state = createArenaGameState();
  state.currentZ = route?.z ?? 0;
  ensureAlifeState(state);
  try {
    materializeAlifeFloorPopulation(state, scene.world, scene.entities, scene.nextId, `design:${floorId}`);
  } catch (err) {
    console.error(`${floorId}: materialize failed:`, (err as Error).message);
  }

  const npcs = scene.entities.filter(e => e.alive && e.type === EntityType.NPC);
  const monsters = scene.entities.filter(e => e.alive && e.type === EntityType.MONSTER);
  const drops = scene.entities.filter(e => e.alive && e.type === EntityType.ITEM_DROP);

  const monsterKinds = new Map<string, number>();
  for (const m of monsters) {
    const name = m.monsterKind !== undefined ? (MONSTERS[m.monsterKind]?.name ?? String(m.monsterKind)) : '?';
    monsterKinds.set(name, (monsterKinds.get(name) ?? 0) + 1);
  }

  /* Опасная среда. Пульсирующие участки гаснут и зажигаются, поэтому снимок в
   * один момент времени неполон: берём объединение по окну в 30 с с шагом
   * 0.25 с — это накрывает любой заявленный период пульса. */
  const probe: Entity = {
    id: -777, type: EntityType.NPC, x: 0.5, y: 0.5, angle: 0, pitch: 0,
    alive: true, speed: 0, hp: 1e9, maxHp: 1e9, sprite: 0,
  };
  const ghost: Entity = { ...probe, id: -778 };
  const walkable: number[] = [];
  for (let i = 0; i < scene.world.cells.length; i++) {
    const c = scene.world.cells[i];
    if (c === Cell.FLOOR || c === Cell.WATER || c === Cell.DOOR || c === Cell.LIFT) walkable.push(i);
  }
  const W = 1024;
  const unionCells = new Set<number>();
  let peakSnapshot = 0;
  const dt = 0.25;
  for (let step = 0; step < 120; step++) {
    tickCellHazards(scene.world, [], state, dt, ghost, false);
    state.time = (state.time ?? 0) + dt;
    let snapshot = 0;
    for (const i of walkable) {
      probe.x = (i % W) + 0.5;
      probe.y = Math.floor(i / W) + 0.5;
      if (entityInActiveCellHazard(scene.world, probe)) { unionCells.add(i); snapshot++; }
    }
    if (snapshot > peakSnapshot) peakSnapshot = snapshot;
  }

  /* Сколько людей СТОИТ на опасной клетке в момент генерации и сколько из них
   * при этом в химзащите. */
  let npcOnHazard = 0;
  for (const e of npcs) if (entityInActiveCellHazard(scene.world, e)) npcOnHazard++;

  const chem = npcs.filter(e => bioResist(e) >= CHEM_MIN_BIO_RESIST).length;
  const armored = npcs.filter(e => e.armorDefId).length;
  const armorKinds = new Map<string, number>();
  for (const e of npcs) if (e.armorDefId) armorKinds.set(e.armorDefId, (armorKinds.get(e.armorDefId) ?? 0) + 1);

  /* Потолок снаряжения по фактическим рангам населения этажа: главный ответ на
   * вопрос «может ли кто-то вообще купить ОЗК за 16 000 ₽». */
  const caps = npcs.map(e => calculateMaxLootValue(e.rpg?.level ?? 1, route?.danger ?? 1, e.faction ?? 0));
  const capsIf4 = npcs.map(e => calculateMaxLootValue(e.rpg?.level ?? 1, 4, e.faction ?? 0));
  const median = (a: number[]): number => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[s.length >> 1];
  };
  const levels = npcs.map(e => e.rpg?.level ?? 1);

  rows.push({
    floor: floorId,
    z: route?.z,
    danger: route?.danger,
    rooms: scene.world.rooms.length,
    npcs: npcs.length,
    monsters: monsters.length,
    monsterShare: npcs.length + monsters.length ? monsters.length / (npcs.length + monsters.length) : 0,
    monsterKinds: [...monsterKinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    drops: drops.length,
    hazardCellsUnion: unionCells.size,
    hazardCellsPeak: peakSnapshot,
    npcOnHazardAtGen: npcOnHazard,
    npcLevelMedian: median(levels),
    npcLevelMax: Math.max(0, ...levels),
    gearCapMedian: median(caps),
    gearCapMax: Math.max(0, ...caps),
    canAffordOzkNow: caps.filter(c => c >= OZK_VALUE).length,
    canAffordOzkIfDanger4: capsIf4.filter(c => c >= OZK_VALUE).length,
    armored,
    chem,
    armorKinds: [...armorKinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
  });
  console.error(`done ${floorId}`);
}

console.log(JSON.stringify(rows, null, 1));
