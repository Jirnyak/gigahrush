const fs = require('fs');

// 1. attractor_dvor
let attractor = fs.readFileSync('src/gen/attractor_dvor/index.ts', 'utf8');
if (!attractor.includes('import { rng, seededRandom, hashSeed }')) {
  attractor = attractor.replace(/import { rng } from '\.\.\/\.\.\/core\/rand';/, 'import { rng, seededRandom, hashSeed } from "../../core/rand";');
}
attractor = attractor.replace(/for \(const zone of world\.zones\) {\n\s*tuneAttractorDvorRouteZones\(world\);\n\s*}/, 'tuneAttractorDvorRouteZones(world);');
if (!attractor.includes('scatterAmbientLights') || attractor.match(/scatterAmbientLights/g).length < 2) {
  attractor = attractor.replace(/import { ensureConnectivity } from '\.\.\/shared';/, 'import { ensureConnectivity, scatterAmbientLights } from "../shared";');
}
fs.writeFileSync('src/gen/attractor_dvor/index.ts', attractor);

// 2. dark_metro
let dark = fs.readFileSync('src/gen/dark_metro/index.ts', 'utf8');
if (!dark.includes('import { rng, withSeededRandom, seededRandom, hashSeed }')) {
  dark = dark.replace(/import { rng, withSeededRandom }/, 'import { rng, withSeededRandom, seededRandom, hashSeed }');
}
dark = dark.replace(/const lightCount = 130;\n/, '');
dark = dark.replace(/import { scatterAmbientLights, ensureConnectivity/, 'import { ensureConnectivity');
fs.writeFileSync('src/gen/dark_metro/index.ts', dark);

// 3. full_floor.ts
let fullFloor = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');
fullFloor = fullFloor.replace(/for \(let i = 0; i < lightCount; i\+\+\) {/, 'for (let i = 0; i < 260; i++) {');
fs.writeFileSync('src/gen/design_floors/full_floor.ts', fullFloor);

// 4. oranzhereya_betona
let oran = fs.readFileSync('src/gen/oranzhereya_betona/index.ts', 'utf8');
if (!oran.includes('import { rng, hashSeed, seededRandom }')) {
  oran = oran.replace(/import { rng, hashSeed }/, 'import { rng, hashSeed, seededRandom }');
}
if (!oran.includes('import { scatterAmbientLights')) {
  oran = oran.replace(/import { ensureConnectivity/, 'import { scatterAmbientLights, ensureConnectivity');
}
fs.writeFileSync('src/gen/oranzhereya_betona/index.ts', oran);

// 5. pioneer_camp
let pioneer = fs.readFileSync('src/gen/pioneer_camp/index.ts', 'utf8');
if (!pioneer.includes('import { rng, hashSeed, withSeededRandom, seededRandom }')) {
  pioneer = pioneer.replace(/import { rng, hashSeed, withSeededRandom }/, 'import { rng, hashSeed, withSeededRandom, seededRandom }');
}
fs.writeFileSync('src/gen/pioneer_camp/index.ts', pioneer);

console.log('Fixed errors again.');
