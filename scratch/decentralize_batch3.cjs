const fs = require('fs');

function fixFloor(floor, seedStr, seedVal, hookContent) {
  let code = fs.readFileSync('src/gen/' + floor + '/index.ts', 'utf8');
  
  // replace final return with isDecentralized: true
  // We need to inject hooks before ensureConnectivity/sanitizeDoors/bakeLights.
  
  // If it's not already modified:
  if (!code.includes('isDecentralized: true')) {
    // 1. the population call
    code = code.replace(
      /const generation = { world, entities, spawnX(.*?)};\n\s*return generation;\n\s*}\);/,
      `const generation = { world, entities, spawnX$1};\n    applyDesignFloorPopulationField(generation as any, { id: '${floor}', z: ${seedVal} } as any);\n    return { ...generation, isDecentralized: true } as any;\n  });`
    );
    // some generators might return directly
    code = code.replace(
      /return { world, entities, spawnX(.*?)\n\s*}\);/,
      `const generation = { world, entities, spawnX$1};\n    applyDesignFloorPopulationField(generation as any, { id: '${floor}', z: ${seedVal} } as any);\n    return { ...generation, isDecentralized: true } as any;\n  });`
    );
    
    // 2. inject hooks
    // Find the finalize block
    let finalizeMatch = code.match(/ensureConnectivity\(world, (.*?)\);\n\s*sanitizeDoors\(world\);/);
    if (finalizeMatch) {
      let finalizeStr = finalizeMatch[0];
      code = code.replace(
        finalizeStr,
        `// Hooks moved from full_floor.ts\n    const rngFn = seededRandom(hashSeed('${seedStr}', ${seedVal}));\n    ${hookContent}\n    \n    ${finalizeStr}`
      );
    } else {
      finalizeMatch = code.match(/sanitizeDoors\(world\);/);
      if (finalizeMatch) {
        let finalizeStr = finalizeMatch[0];
        code = code.replace(
          finalizeStr,
          `// Hooks moved from full_floor.ts\n    const rngFn = seededRandom(hashSeed('${seedStr}', ${seedVal}));\n    ${hookContent}\n    \n    ${finalizeStr}`
        );
      }
    }
    
    if (!code.includes('applyDesignFloorPopulationField')) {
      code = 'import { applyDesignFloorPopulationField } from "../design_floors/population";\n' + code;
    }
    if (!code.includes('seededRandom') || !code.includes('hashSeed')) {
      code = code.replace(/import { rng } from '\.\.\/\.\.\/core\/rand';/, "import { rng, seededRandom, hashSeed } from '../../core/rand';");
    }
  }
  
  fs.writeFileSync('src/gen/' + floor + '/index.ts', code);
}

fixFloor('production_belt', 'design-full:production_belt:-20', -20, 'expandProductionBeltGeometry(world, rngFn);');
fixFloor('silicon_net_well', 'design-full:silicon_net_well:-25', -25, 'expandSiliconNetWellRouteGeometry(world, rngFn);\n    tuneSiliconNetWellRouteZones(world);');
fixFloor('underhell', 'design-full:underhell:-33', -33, 'expandUnderhellRouteGeometry(world, rngFn);\n    reinforceUnderhellAuthoredHqTerritory(world);');
fixFloor('darkness', 'design-full:darkness:-52', -52, 'expandDarknessRouteGeometry(world, rngFn);\n    reinforceDarknessAuthoredHqTerritory(world);\n    blackoutDarknessLights(world);');

console.log('Fixed batch 3 floors');
