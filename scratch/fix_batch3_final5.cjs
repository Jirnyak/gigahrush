const fs = require('fs');

let darkness = fs.readFileSync('src/gen/darkness/index.ts', 'utf8');
darkness = darkness.replace(/import type \{ FloorGeneration \} from '\.\.\/floor_manifest';/, "import type { FloorGeneration } from '../floor_manifest';\nimport { seededRandom, hashSeed } from '../../core/rand';");
darkness = darkness.replace(/expandDarknessRouteGeometry\(world, rngFn, \[]\);/, 'expandDarknessRouteGeometry(world, [], rngFn);');
fs.writeFileSync('src/gen/darkness/index.ts', darkness);

let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');
full = full.replace(/function expandUnderhell\([\s\S]*?\}\n/g, '');
fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);

console.log('Fixed more batch 3 errors!!');
