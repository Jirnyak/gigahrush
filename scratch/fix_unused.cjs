const fs = require('fs');

let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

// Fix expandRoof
full = full.replace(/export function expandRoof\(world: World, rng: \(\) => number\): void \{\n\}/, 'export function expandRoof(world: World, rng: () => number): void {\n  world; rng;\n}');

// Fix expandDarkness (or whatever is at 2314)
full = full.replace(/export function expandDarkness\(world: World, entities: Entity\[], rng: \(\) => number\): void \{\n\}/, 'export function expandDarkness(world: World, entities: Entity[], rng: () => number): void {\n  world; entities; rng;\n}');

// Delete reinforceUnderhellAuthoredHqTerritory
full = full.replace(/export function reinforceUnderhellAuthoredHqTerritory[\s\S]*?\n\}\n/g, '');

fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);

console.log('Fixed unused vars');
