const fs = require('fs');

// 1. Fix full_floor.ts
let fullFloor = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');
fullFloor = fullFloor.replace(/\s*if \(route\.id === 'attractor_dvor'\) tuneAttractorDvorRouteZones\(generation\.world\);\n/g, '\n');
fullFloor = fullFloor.replace(/\s*if \(route\.id === 'dark_metro'\) reinforceDarkMetroAuthoredHqTerritory\(generation\.world\);\n/g, '\n');
fullFloor = fullFloor.replace(/const lightCount = 260;\s*const lightCount = 260;/g, 'const lightCount = 260;');
fullFloor = fullFloor.replace(/\s*if \(routeId === 'attractor_dvor'\) tuneAttractorDvorRouteZones\(zone\);\n/g, '\n');
fullFloor = fullFloor.replace(/\s*if \(route\.id === 'attractor_dvor'\) tuneAttractorDvorRouteZones\(generation\.world\);\n/g, '\n');
fullFloor = fullFloor.replace(/\s*tuneAttractorDvorRouteZones\(world\);\n/g, '\n');

// Wait, let's just grep and remove these lines directly:
const lines = fullFloor.split('\n');
const newLines = lines.filter(l => 
  !l.includes('tuneAttractorDvorRouteZones') && 
  !l.includes('reinforceDarkMetroAuthoredHqTerritory') &&
  !l.includes('tuneDarkMetroRouteZone')
);
fs.writeFileSync('src/gen/design_floors/full_floor.ts', newLines.join('\n'));

// 2. Fix attractor_dvor
let attractor = fs.readFileSync('src/gen/attractor_dvor/index.ts', 'utf8');
if (!attractor.includes('seededRandom, hashSeed')) attractor = attractor.replace(/import { rng, seededRandom, hashSeed }/, 'import { rng, seededRandom, hashSeed } from "../../core/rand";'); // wait, the previous replace was bad
attractor = attractor.replace(/import { rng, seededRandom, hashSeed }/, 'import { rng, seededRandom, hashSeed } from "../../core/rand";');
attractor = attractor.replace(/import { rng, withSeededRandom }/, 'import { rng, withSeededRandom, seededRandom, hashSeed }');
attractor = attractor.replace(/import { scatterAmbientLights, ensureConnectivity/, 'import { scatterAmbientLights, ensureConnectivity } from "../shared";\nimport { ensureConnectivity');
attractor = attractor.replace(/tuneAttractorDvorRouteZones\(zone\);/, 'tuneAttractorDvorRouteZones(world);');
fs.writeFileSync('src/gen/attractor_dvor/index.ts', attractor);

// 3. Fix dark_metro
let dark = fs.readFileSync('src/gen/dark_metro/index.ts', 'utf8');
dark = dark.replace(/import { rng, withSeededRandom }/, 'import { rng, withSeededRandom, seededRandom, hashSeed }');
dark = dark.replace(/import { ensureConnectivity, generateZones, sanitizeDoors, stampRoom }/, 'import { scatterAmbientLights, ensureConnectivity, generateZones, sanitizeDoors, stampRoom }');
fs.writeFileSync('src/gen/dark_metro/index.ts', dark);

// 4. Fix oranzhereya_betona
let oran = fs.readFileSync('src/gen/oranzhereya_betona/index.ts', 'utf8');
oran = oran.replace(/import { rng, hashSeed }/, 'import { rng, hashSeed, seededRandom }');
oran = oran.replace(/import { ensureConnectivity, generateZones, sanitizeDoors, stampRoom }/, 'import { scatterAmbientLights, ensureConnectivity, generateZones, sanitizeDoors, stampRoom }');
fs.writeFileSync('src/gen/oranzhereya_betona/index.ts', oran);

// 5. Fix pioneer_camp
let pioneer = fs.readFileSync('src/gen/pioneer_camp/index.ts', 'utf8');
pioneer = pioneer.replace(/import { rng, hashSeed, withSeededRandom }/, 'import { rng, hashSeed, withSeededRandom, seededRandom }');
fs.writeFileSync('src/gen/pioneer_camp/index.ts', pioneer);

console.log('Fixed errors.');
