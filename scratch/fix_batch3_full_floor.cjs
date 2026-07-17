const fs = require('fs');

let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

// The switch block
full = full.replace(/case 'production_belt':\s*expandProductionBeltGeometry\(generation\.world, rng\);\n\s*break;\n/g, '');
full = full.replace(/case 'silicon_net_well':\s*expandSiliconNetWellRouteGeometry\(generation\.world, rng\);\n\s*break;\n/g, '');
full = full.replace(/case 'underhell':\s*expandUnderhell\(generation\.world, generation\.entities, rng\);\n\s*break;\n/g, '');
full = full.replace(/case 'darkness':\s*expandDarkness\(generation\.world, generation\.entities, rng\);\n\s*break;\n/g, '');

// The if blocks for reinforcement
full = full.replace(/if \(route\.id === 'darkness'\) reinforceDarknessAuthoredHqTerritory\(generation\.world\);\n/g, '');

full = full.replace(/if \(routeId === 'underhell'\) \{\n\s*reinforceUnderhellAuthoredHqTerritory\(world\);\n\s*return;\n\s*}\n/g, '');
full = full.replace(/if \(routeId === 'silicon_net_well'\) \{\n\s*tuneSiliconNetWellRouteZones\(world\);\n\s*return;\n\s*}\n/g, '');
full = full.replace(/if \(routeId === 'darkness'\) \{\n\s*reinforceDarknessAuthoredHqTerritory\(world\);\n\s*return;\n\s*}\n/g, '');

// The if block for lights
full = full.replace(/else if \(route\.id === 'darkness'\) blackoutDarknessLights\(generation\.world\);\n/g, '');

// Removing the functions:
// expandDarkness, expandUnderhell are actually not exported, let's just prefix their names to mock them or replace their bodies.
full = full.replace(/function expandDarkness\(world: World, entities: Entity\[], rng: \(\) => number\): void \{/g, 'function expandDarkness(world: World, entities: Entity[], rng: () => number): void { world; entities; rng;');
full = full.replace(/function expandUnderhell\(world: World, entities: Entity\[], rng: \(\) => number\): void \{/g, 'function expandUnderhell(world: World, entities: Entity[], rng: () => number): void { world; entities; rng;');
full = full.replace(/export function expandPodadRouteGeometry\(world: World, entities: Entity\[], rng: \(\) => number\): void \{/g, 'export function expandPodadRouteGeometry(world: World, entities: Entity[], rng: () => number): void { world; entities; rng;');

// Clean up imports manually:
full = full.replace(/import \{ blackoutDarknessLights, expandDarknessRouteGeometry, reinforceDarknessAuthoredHqTerritory \} from '\.\.\/darkness';\n/, '');
full = full.replace(/import \{ expandProductionBeltGeometry \} from '\.\.\/production_belt';\n/, '');
full = full.replace(/import \{ expandSiliconNetWellRouteGeometry, tuneSiliconNetWellRouteZones \} from '\.\.\/silicon_net_well';\n/, '');
full = full.replace(/import \{ expandUnderhellRouteGeometry \} from '\.\.\/underhell';\n/, '');

// Actually, `reinforceUnderhellAuthoredHqTerritory` was used in `underhell`, so we should export it if it's defined here, or if it was imported, we don't need it. Wait, `reinforceUnderhellAuthoredHqTerritory` is defined IN `full_floor.ts`?
// Let's check if it's exported.
full = full.replace(/function reinforceUnderhellAuthoredHqTerritory/g, 'export function reinforceUnderhellAuthoredHqTerritory');

fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);

console.log('Fixed full_floor.ts correctly');
