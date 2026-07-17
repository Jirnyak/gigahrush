const fs = require('fs');

let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

// Remove underhell case
full = full.replace(/case 'underhell':\n\s*expandUnderhell\(generation\.world, generation\.entities, rng\);\n\s*break;\n/g, '');

// Remove darkness case
full = full.replace(/case 'darkness':\n\s*expandDarkness\(generation\.world, generation\.entities, rng\);\n\s*break;\n/g, '');

// Remove the expandDarkness function completely
full = full.replace(/function expandDarkness\(world: World, entities: Entity\[], rng: \(\) => number\): void \{\n\s*\/\/ expandDarknessRouteGeometry\(world, entities, rng\);\n\s*}\n/g, '');

// Remove expandUnderhell completely (if it exists like that)
full = full.replace(/function expandUnderhell\(world: World, entities: Entity\[], rng: \(\) => number\): void \{\n\s*\/\/ expandUnderhellRouteGeometry\(world, rng\);\n\s*}\n/g, '');
full = full.replace(/function expandUnderhell\([^}]*\}\n/g, '');

fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);

console.log('Fixed full_floor switch');
