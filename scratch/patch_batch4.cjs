const fs = require('fs');

const floors = [
  { id: 'chthonic_attic', z: 46 },
  { id: 'antenna_court', z: 42 },
  { id: 'raionsovet_archive', z: 22 },
  { id: 'registry_morgue', z: 18 }
];

for (const floor of floors) {
  const file = `src/gen/${floor.id}/index.ts`;
  let content = fs.readFileSync(file, 'utf8');

  // Add imports
  if (!content.includes('applyDesignFloorPopulationField')) {
    content = "import { applyDesignFloorPopulationField } from '../design_floors/population';\n" + content;
  }
  
  // Replace the return statement.
  // The return statement is like `return { world, entities, spawnX, spawnY };`
  // Or `return { world, entities, spawnX: 512.5, spawnY: 507.5 };`
  
  // We'll use a regex that matches `return { world, entities, ... };`
  const returnRegex = /return\s+\{\s*world,\s*entities,\s*spawnX(?:[:\s0-9\.]+)?,\s*spawnY(?:[:\s0-9\.]+)?\s*\}\s*;/;
  const match = content.match(returnRegex);
  
  if (match) {
    const originalReturn = match[0];
    const generationObj = originalReturn.replace(/return\s+/, 'const generation = ').replace(';', '');
    const replacement = `  ${generationObj};
  applyDesignFloorPopulationField(generation as any, { id: '${floor.id}', z: ${floor.z} } as any);
  return { ...generation, isDecentralized: true } as any;`;
    
    content = content.replace(returnRegex, replacement);
  } else {
    // Maybe they return something slightly different
    console.log(`Could not find standard return in ${floor.id}`);
  }
  
  fs.writeFileSync(file, content);
}

// Now update manifest.ts imports
let manifest = fs.readFileSync('src/gen/design_floors/manifest.ts', 'utf8');
manifest = manifest.replace(/import \{ ([a-zA-Z0-9_, ]+) \} from '\.\/chthonic_attic'/g, "import { $1 } from '../chthonic_attic'");
manifest = manifest.replace(/import \{ ([a-zA-Z0-9_, ]+) \} from '\.\/antenna_court'/g, "import { $1 } from '../antenna_court'");
manifest = manifest.replace(/import \{ ([a-zA-Z0-9_, ]+) \} from '\.\/raionsovet_archive'/g, "import { $1 } from '../raionsovet_archive'");
manifest = manifest.replace(/import \{ ([a-zA-Z0-9_, ]+) \} from '\.\/registry_morgue'/g, "import { $1 } from '../registry_morgue'");
fs.writeFileSync('src/gen/design_floors/manifest.ts', manifest);

console.log("Patched Batch 4 files and manifest");
