const fs = require('fs');

function fixFinal(floor, seedStr, seedVal, hookContent) {
  let file = 'src/gen/' + floor + '/index.ts';
  let code = fs.readFileSync(file, 'utf8');
  
  // 1. Remove applyDesignFloorPopulationField at top if unused and just inject it at the bottom.
  code = code.replace(/import \{ applyDesignFloorPopulationField \} from "\.\.\/design_floors\/population";\n/, '');
  
  // Clean up any double injected generation blocks
  while (code.includes('applyDesignFloorPopulationField(generation as any,')) {
    code = code.replace(/const generation = \{ world, entities, spawnX:?([^\n]*)\n\s*applyDesignFloorPopulationField\([^\n]*\n\s*return \{ \.\.\.generation, isDecentralized: true \} as any;\n\s*}\);/,
                        'return { world, entities, spawnX:$1\n  });');
  }
  
  // Inject exactly once
  code = code.replace(/return \{\s*world,\s*entities,\s*spawnX:?([^\n]*)\s*}\);/,
      `const generation = { world, entities, spawnX:$1};\n    applyDesignFloorPopulationField(generation as any, { id: '${floor}', z: ${seedVal} } as any);\n    return { ...generation, isDecentralized: true } as any;\n  });`);

  code = 'import { applyDesignFloorPopulationField } from "../design_floors/population";\n' + code;
  
  // Fix darkness unused stuff
  if (floor === 'darkness') {
    code = code.replace(/import { (.*?) } from '\.\.\/\.\.\/core\/rand';/, "import { $1, seededRandom, hashSeed } from '../../core/rand';");
    code = code.replace(/expandDarknessRouteGeometry\(world, rngFn\);/, 'expandDarknessRouteGeometry(world, rngFn, entities);');
  }
  
  // Fix unused seededRandom/hashSeed in underhell
  if (floor === 'underhell') {
     code = code.replace(/, seededRandom, hashSeed/g, ''); // we already had it maybe? wait, if it's unused we shouldn't add it or if it is used...
     // wait, the error said "seededRandom is declared but its value is never read".
     // Why would it be never read if we injected hooks? Because my previous script failed to inject the hooks!
     // Let's inject hooks for real if they are missing
     if (!code.includes(hookContent.split('\n')[0])) {
         code = code.replace(/sanitizeDoors\(world\);/,
          `// Hooks moved from full_floor.ts\n    const rngFn = seededRandom(hashSeed('${seedStr}', ${seedVal}));\n    ${hookContent}\n    \n    sanitizeDoors(world);`);
     }
  }

  // Same for production_belt and silicon_net_well if they missed it
  if (!code.includes(hookContent.split('\n')[0])) {
      code = code.replace(/sanitizeDoors\(world\);/,
       `// Hooks moved from full_floor.ts\n    const rngFn = seededRandom(hashSeed('${seedStr}', ${seedVal}));\n    ${hookContent}\n    \n    sanitizeDoors(world);`);
  }
  
  fs.writeFileSync(file, code);
}

fixFinal('production_belt', 'design-full:production_belt:-20', -20, 'expandProductionBeltGeometry(world, rngFn);');
fixFinal('silicon_net_well', 'design-full:silicon_net_well:-25', -25, 'expandSiliconNetWellRouteGeometry(world, rngFn);\n    tuneSiliconNetWellRouteZones(world);');
fixFinal('underhell', 'design-full:underhell:-33', -33, 'expandUnderhellRouteGeometry(world, rngFn);\n    reinforceUnderhellAuthoredHqTerritory(world);');
fixFinal('darkness', 'design-full:darkness:-52', -52, 'expandDarknessRouteGeometry(world, rngFn, entities);\n    reinforceDarknessAuthoredHqTerritory(world);\n    blackoutDarknessLights(world);');

// fix full_floor.ts
let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');
full = full.replace(/if \(route\.id === 'darkness'\) reinforceDarknessAuthoredHqTerritory\(generation\.world\);\n/, '');
full = full.replace(/export function expandPodadRouteGeometry\(world: World, entities: Entity\[], rng: \(\) => number\): void \{/g, 'export function expandPodadRouteGeometry(world: World, entities: Entity[], rng: () => number): void {\n  world; entities; rng;');
fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);

console.log('Fixed batch 3 fully');
