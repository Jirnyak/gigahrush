const fs = require('fs');

// 1. full_floor.ts
let fullFloor = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');
fullFloor = fullFloor.replace(/scatterAmbientLights\(generation\.world, rng, lightCount\);/, 'scatterAmbientLights(generation.world, rng, 260);');
fs.writeFileSync('src/gen/design_floors/full_floor.ts', fullFloor);

// 2. dark_metro
let dark = fs.readFileSync('src/gen/dark_metro/index.ts', 'utf8');
dark = dark.replace(/, scatterAmbientLights/, '');
fs.writeFileSync('src/gen/dark_metro/index.ts', dark);

// 3. attractor_dvor
let attractor = fs.readFileSync('src/gen/attractor_dvor/index.ts', 'utf8');
attractor = attractor.replace(/import { rng } from '\.\.\/\.\.\/core\/rand';\n/, '');
fs.writeFileSync('src/gen/attractor_dvor/index.ts', attractor);

console.log('Fixed lints.');
