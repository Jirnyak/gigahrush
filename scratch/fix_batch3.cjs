const fs = require('fs');

function fix(floor) {
  let file = 'src/gen/' + floor + '/index.ts';
  let code = fs.readFileSync(file, 'utf8');
  
  // Fix applyDesignFloorPopulationField
  if (code.includes('import { applyDesignFloorPopulationField } from "../design_floors/population";') && !code.includes('applyDesignFloorPopulationField(generation')) {
    code = code.replace(/import \{ applyDesignFloorPopulationField \} from "\.\.\/design_floors\/population";\n/, '');
    
    // Inject it manually at the end
    // First remove isDecentralized
    code = code.replace(/return \{ \.\.\.generation, isDecentralized: true \} as any;\n\s*}\);/, 'return generation;\n  });');
    
    // Then re-apply
    code = code.replace(/const generation = \{ world, entities, spawnX(.*?)};\n\s*return generation;\n\s*}\);/,
      `const generation = { world, entities, spawnX$1};\n    applyDesignFloorPopulationField(generation as any, { id: '${floor}', z: -99 } as any);\n    return { ...generation, isDecentralized: true } as any;\n  });`);
    code = code.replace(/return \{ world, entities, spawnX(.*?)\n\s*}\);/,
      `const generation = { world, entities, spawnX$1};\n    applyDesignFloorPopulationField(generation as any, { id: '${floor}', z: -99 } as any);\n    return { ...generation, isDecentralized: true } as any;\n  });`);
      
    code = 'import { applyDesignFloorPopulationField } from "../design_floors/population";\n' + code;
  }
  
  // Fix imports
  if (!code.includes('import { rng, seededRandom, hashSeed }')) {
    code = code.replace(/import \{ rng.* \} from '\.\.\/\.\.\/core\/rand';/, "import { rng, seededRandom, hashSeed, withSeededRandom } from '../../core/rand';");
    code = code.replace(/import \{ hashSeed, seededRandom, withSeededRandom, rng \} from '\.\.\/\.\.\/core\/rand';/, "import { rng, seededRandom, hashSeed, withSeededRandom } from '../../core/rand';");
    // Just blindly inject it
    if (!code.includes('seededRandom') || !code.includes('hashSeed')) {
      code = code.replace(/import \{ (.*?) \} from '\.\.\/\.\.\/core\/rand';/, "import { $1, seededRandom, hashSeed } from '../../core/rand';");
    }
  }
  fs.writeFileSync(file, code);
}

['production_belt', 'silicon_net_well', 'underhell', 'darkness'].forEach(fix);

// Fix full_floor.ts
let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');
full = full.replace(/if \(routeId === 'darkness'\) \{\n\s*reinforceDarknessAuthoredHqTerritory\(world\);\n\s*return;\n\s*}\n/g, '');
full = full.replace(/function reinforceUnderhellAuthoredHqTerritory/g, 'export function reinforceUnderhellAuthoredHqTerritory');
full = full.replace(/expandDarknessRouteGeometry/g, '// expandDarknessRouteGeometry');

fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);

console.log('Fixed batch 3 errors');
