const fs = require('fs');

let file = 'src/gen/darkness/index.ts';
let code = fs.readFileSync(file, 'utf8');

// Fix the return
code = code.replace(/return \{ world, entities, spawnX, spawnY, darknessState \};/,
  `const generation = { world, entities, spawnX, spawnY, darknessState };\n    applyDesignFloorPopulationField(generation as any, { id: 'darkness', z: -52 } as any);\n    return { ...generation, isDecentralized: true } as any;`);

// Inject hooks BEFORE blackoutDarknessLights
code = code.replace(/blackoutDarknessLights\(world\);/,
  `// Hooks moved from full_floor.ts\n  const rngFn = seededRandom(hashSeed('design-full:darkness:-52', -52));\n  expandDarknessRouteGeometry(world, rngFn, entities);\n  reinforceDarknessAuthoredHqTerritory(world);\n\n  blackoutDarknessLights(world);`);

// Fix imports
if (!code.includes('seededRandom') || !code.includes('hashSeed')) {
    code = code.replace(/import { rng, withSeededRandom } from '\.\.\/\.\.\/core\/rand';/, "import { rng, withSeededRandom, seededRandom, hashSeed } from '../../core/rand';");
    if (!code.includes('seededRandom')) {
        code = code.replace(/import { rng } from '\.\.\/\.\.\/core\/rand';/, "import { rng, seededRandom, hashSeed } from '../../core/rand';");
    }
}

fs.writeFileSync(file, code);
console.log('Fixed darkness');
