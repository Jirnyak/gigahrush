const fs = require('fs');

let prod = fs.readFileSync('src/gen/production_belt/index.ts', 'utf8');
if (!prod.includes('seededRandom') || !prod.includes('hashSeed') || prod.includes("import { rng } from '../../core/rand';")) {
  prod = prod.replace(/import { rng, withSeededRandom } from '\.\.\/\.\.\/core\/rand';/, "import { rng, withSeededRandom, seededRandom, hashSeed } from '../../core/rand';");
}
prod = prod.replace(/return \{ world, entities, spawnX, spawnY, productionState \};/,
  `const generation = { world, entities, spawnX, spawnY, productionState };\n    applyDesignFloorPopulationField(generation as any, { id: 'production_belt', z: -20 } as any);\n    return { ...generation, isDecentralized: true } as any;`);
fs.writeFileSync('src/gen/production_belt/index.ts', prod);

let silicon = fs.readFileSync('src/gen/silicon_net_well/index.ts', 'utf8');
if (!silicon.includes('seededRandom') || !silicon.includes('hashSeed')) {
  silicon = silicon.replace(/import { rng, withSeededRandom } from '\.\.\/\.\.\/core\/rand';/, "import { rng, withSeededRandom, seededRandom, hashSeed } from '../../core/rand';");
}
silicon = silicon.replace(/return \{ world, entities, spawnX, spawnY, siliconState \};/,
  `const generation = { world, entities, spawnX, spawnY, siliconState };\n    applyDesignFloorPopulationField(generation as any, { id: 'silicon_net_well', z: -25 } as any);\n    return { ...generation, isDecentralized: true } as any;`);
fs.writeFileSync('src/gen/silicon_net_well/index.ts', silicon);

let underhell = fs.readFileSync('src/gen/underhell/index.ts', 'utf8');
if (!underhell.includes('seededRandom, hashSeed')) {
  underhell = underhell.replace(/import { rng, irand } from '\.\.\/\.\.\/core\/rand';/, "import { rng, irand, seededRandom, hashSeed } from '../../core/rand';");
}
underhell = underhell.replace(/return \{ world, entities, spawnX, spawnY, underhellState \};/,
  `const generation = { world, entities, spawnX, spawnY, underhellState };\n    applyDesignFloorPopulationField(generation as any, { id: 'underhell', z: -33 } as any);\n    return { ...generation, isDecentralized: true } as any;`);
fs.writeFileSync('src/gen/underhell/index.ts', underhell);

let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');
full = full.replace(/world; entities; rng;/g, 'world; entities; rng; return;');
fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);

console.log('Fixed more batch 3 errors');
