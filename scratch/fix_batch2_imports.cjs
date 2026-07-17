const fs = require('fs');

function fixFile(file, replacePairs) {
  let code = fs.readFileSync(file, 'utf8');
  for (const [search, replacement] of replacePairs) {
    code = code.replace(search, replacement);
  }
  fs.writeFileSync(file, code);
}

fixFile('src/gen/attractor_dvor/index.ts', [
  ["import { ensureConnectivity, generateZones, sanitizeDoors, stampRoom } from '../shared';", "import { ensureConnectivity, generateZones, sanitizeDoors, stampRoom, scatterAmbientLights } from '../shared';\nimport { rng, seededRandom, hashSeed } from '../../core/rand';"]
]);

fixFile('src/gen/dark_metro/index.ts', [
  ["import { hashSeed, withSeededRandom } from '../../core/rand';", "import { hashSeed, withSeededRandom, seededRandom } from '../../core/rand';"],
  ["import { ensureConnectivity, generateZones, sanitizeDoors, stampRoom } from '../shared';", "import { ensureConnectivity, generateZones, sanitizeDoors, stampRoom, scatterAmbientLights } from '../shared';"]
]);

fixFile('src/gen/oranzhereya_betona/index.ts', [
  ["import { rng, hashSeed, withSeededRandom } from '../../core/rand';", "import { rng, hashSeed, withSeededRandom, seededRandom } from '../../core/rand';"],
  ["} from '../shared';", ", scatterAmbientLights } from '../shared';"]
]);

console.log('Done fixing imports.');
