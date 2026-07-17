const fs = require('fs');

let darkness = fs.readFileSync('src/gen/darkness/index.ts', 'utf8');
darkness = darkness.replace(/import { rng } from '\.\.\/\.\.\/core\/rand';/, "import { rng, seededRandom, hashSeed } from '../../core/rand';");
darkness = darkness.replace(/expandDarknessRouteGeometry\(world, rngFn, entities\);/, 'expandDarknessRouteGeometry(world, rngFn, []);');
fs.writeFileSync('src/gen/darkness/index.ts', darkness);

let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');
full = full.replace(/if \(routeId === 'darkness'\) \{\n\s*reinforceDarknessAuthoredHqTerritory\(world\);\n\s*}\n/g, '');
full = full.replace(/function expandUnderhell\(world: World, entities: Entity\[], rng: \(\) => number\): void \{\n\s*world;\n\s*entities;\n\s*rng;\n\s*}\n/g, '');
full = full.replace(/function expandUnderhell\([^}]*\n\}\n/g, '');
fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);

let prod = fs.readFileSync('src/gen/production_belt/index.ts', 'utf8');
prod = prod.replace(/, withSeededRandom/g, '');
fs.writeFileSync('src/gen/production_belt/index.ts', prod);

let silicon = fs.readFileSync('src/gen/silicon_net_well/index.ts', 'utf8');
if (silicon.includes('import { applyDesignFloorPopulationField } from "../design_floors/population";') && !silicon.includes('applyDesignFloorPopulationField(generation')) {
    silicon = silicon.replace(/import \{ applyDesignFloorPopulationField \} from "\.\.\/design_floors\/population";\n/, '');
}
fs.writeFileSync('src/gen/silicon_net_well/index.ts', silicon);

let underhell = fs.readFileSync('src/gen/underhell/index.ts', 'utf8');
if (underhell.includes('import { applyDesignFloorPopulationField } from "../design_floors/population";') && !underhell.includes('applyDesignFloorPopulationField(generation')) {
    underhell = underhell.replace(/import \{ applyDesignFloorPopulationField \} from "\.\.\/design_floors\/population";\n/, '');
}
fs.writeFileSync('src/gen/underhell/index.ts', underhell);

console.log('Fixed more batch 3 errors!');
