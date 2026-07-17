const fs = require('fs');

let attractor = fs.readFileSync('src/gen/attractor_dvor/index.ts', 'utf8');
attractor = attractor.replace(/import { rng, seededRandom, hashSeed } from "\.\.\/\.\.\/core\/rand";/, 'import { seededRandom, hashSeed } from "../../core/rand";');
fs.writeFileSync('src/gen/attractor_dvor/index.ts', attractor);

console.log('Fixed lints.');
