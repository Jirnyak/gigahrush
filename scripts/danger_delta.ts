#!/usr/bin/env tsx
/* Что тянет за собой объявленная опасность этажа: до и после гипотетической
 * правки, по чистым данным, без генерации. Каждая строка — отдельный
 * потребитель поля `danger` в `DESIGN_FLOOR_ROUTES`.
 *
 * Запуск: npx tsx scripts/danger_delta.ts <floorId> <dangerBefore> <dangerAfter>
 */
import '../src/content';
import { Faction } from '../src/core/types';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import {
  monsterShareForRouteZ, populationLevelForRouteZ,
} from '../src/data/population_profiles';
import {
  ECONOMY_PROCEDURAL_LOOT_VALUE_CAP_BY_DANGER,
  economyProgressBandForRoute, proceduralLootValueCap, proceduralContainerValueCap,
} from '../src/data/economics';
import { ContainerKind } from '../src/core/types';
import { calculateMaxLootValue } from '../src/systems/procedural_loot';
import { ITEMS } from '../src/data/items';

const floorId = process.argv[2] ?? 'maintenance';
const before = Number(process.argv[3] ?? 3) as 1 | 2 | 3 | 4 | 5;
const after = Number(process.argv[4] ?? 4) as 1 | 2 | 3 | 4 | 5;
const route = DESIGN_FLOOR_ROUTES.find(r => r.id === floorId);
if (!route) throw new Error(`нет маршрута ${floorId}`);
const z = route.z;
const OZK = ITEMS['armor_ozk'].value;

function row(label: string, a: unknown, b: unknown): void {
  const same = String(a) === String(b);
  console.log(`${label.padEnd(46)} ${String(a).padStart(12)} → ${String(b).padStart(12)}${same ? '   (без изменений)' : ''}`);
}

console.log(`# ${floorId}  z=${z}  опасность ${before} → ${after}\n`);

console.log('## Население');
row('доля монстров в бюджете', monsterShareForRouteZ(z, before).toFixed(4), monsterShareForRouteZ(z, after).toFixed(4));
row('множитель монстров (0.92 + d*0.045)', (0.92 + before * 0.045).toFixed(3), (0.92 + after * 0.045).toFixed(3));
row('уровень населения (populationLevelForRouteZ)', populationLevelForRouteZ(z, before), populationLevelForRouteZ(z, after));

console.log('\n## Экономика');
row('полоса маршрута (квесты)', economyProgressBandForRoute(before, z), economyProgressBandForRoute(after, z));
row('потолок процедурного лута (по опасности)', ECONOMY_PROCEDURAL_LOOT_VALUE_CAP_BY_DANGER[before], ECONOMY_PROCEDURAL_LOOT_VALUE_CAP_BY_DANGER[after]);
row('потолок процедурного лута НА ЭТОЙ ГЛУБИНЕ', proceduralLootValueCap(before, z), proceduralLootValueCap(after, z));
for (const [name, kind] of [
  ['ящик обычный (шкаф/сундук)', ContainerKind.METAL_CABINET],
  ['ящик публичный (аптечка/бак)', ContainerKind.EMERGENCY_BOX],
  ['сейф / тайник', ContainerKind.SAFE],
] as const) {
  row(`  ${name}`, proceduralContainerValueCap(kind, before, z), proceduralContainerValueCap(kind, after, z));
}

console.log('\n## Потолок снаряжения NPC (calculateMaxLootValue)');
for (const [fname, f] of [['гражданин', Faction.CITIZEN], ['ликвидатор', Faction.LIQUIDATOR], ['учёный', Faction.SCIENTIST]] as const) {
  for (const level of [1, 5, 8, 20, 50, 100]) {
    row(`${fname}, ур.${level}`, calculateMaxLootValue(level, before, f), calculateMaxLootValue(level, after, f));
  }
}

console.log(`\n## Порог ОЗК (${OZK} ₽): минимальный уровень, на котором комплект по карману`);
for (const [fname, f] of [['гражданин', Faction.CITIZEN], ['ликвидатор', Faction.LIQUIDATOR], ['учёный', Faction.SCIENTIST]] as const) {
  const find = (d: 1 | 2 | 3 | 4 | 5): string => {
    for (let l = 1; l <= 100; l++) if (calculateMaxLootValue(l, d, f) >= OZK) return String(l);
    return 'недостижим';
  };
  row(fname, find(before), find(after));
}
