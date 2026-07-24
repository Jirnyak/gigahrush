const fs = require('fs');
const glob = require('glob'); // Not available? I'll use child_process
const { execSync } = require('child_process');

const files = execSync('git grep -l applyDesignFloorPopulationField src/gen | grep -v population.ts | grep -v floor_manifest.ts').toString().trim().split('\n');

for (const file of files) {
  if (!file) continue;
  let content = fs.readFileSync(file, 'utf8');

  // Add import if missing
  if (content.includes('applyDesignFloorPopulationField') && !content.includes('DesignFloorGeneration')) {
    content = content.replace(/import \{([^\}]+)applyDesignFloorPopulationField([^\}]+)\} from '..\/design_floors\/population';/g, 
      "import { $1applyDesignFloorPopulationField$2} from '../design_floors/population';\nimport type { DesignFloorGeneration } from '../floor_manifest';");
    content = content.replace(/import \{([^\}]+)applyDesignFloorPopulationField([^\}]+)\} from "\.\.\/design_floors\/population";/g, 
      "import { $1applyDesignFloorPopulationField$2} from '../design_floors/population';\nimport type { DesignFloorGeneration } from '../floor_manifest';");
  }
  
  // Replace: return { ...generation, isDecentralized: true } as any; -> return generation;
  content = content.replace(/return\s+\{\s*\.\.\.generation,\s*isDecentralized:\s*true\s*\}\s*as\s*any;/g, 'return generation;');
  
  // Replace: const generation = { ... } -> const generation: DesignFloorGeneration = { ...isDecentralized: true, ... }
  content = content.replace(/const generation = (\{[^}]+?\});/g, (match, obj) => {
    if (obj.includes('world') && obj.includes('entities') && !obj.includes('isDecentralized')) {
       return `const generation: DesignFloorGeneration = ${obj.replace('{', '{ isDecentralized: true,')};`;
    }
    return match;
  });

  // Replace: applyDesignFloorPopulationField(generation as any, route as any) -> applyDesignFloorPopulationField(generation, route)
  content = content.replace(/applyDesignFloorPopulationField\(generation\s+as\s+any,\s+route\s+as\s+any\)/g, 'applyDesignFloorPopulationField(generation, route)');
  
  // Replace: applyDesignFloorPopulationField(generation as any, { ... } as any) -> applyDesignFloorPopulationField(generation, { ... })
  content = content.replace(/applyDesignFloorPopulationField\(generation\s+as\s+any,\s+(\{[^\}]+\})\s+as\s+any\)/g, 'applyDesignFloorPopulationField(generation, $1)');

  // Replace: applyDesignFloorPopulationField({ world, entities } as any, { ... } as any)
  // Wait, if it takes DesignFloorGeneration, maybe we should change applyDesignFloorPopulationField's signature to Pick<DesignFloorGeneration, 'world' | 'entities'>?
  // Let's replace: applyDesignFloorPopulationField({ world, entities } as any, { ... } as any) -> applyDesignFloorPopulationField({ world, entities }, { ... })
  content = content.replace(/applyDesignFloorPopulationField\(\{\s*world,\s*entities\s*\}\s+as\s+any,\s+(\{[^\}]+\})\s+as\s+any\)/g, 'applyDesignFloorPopulationField({ world, entities }, $1)');
  
  // Some files have generation, route without `as any` but they might have errors if signature changes. Let's see if we covered all `as any`
  content = content.replace(/applyDesignFloorPopulationField\(\{\s*world,\s*entities\s*\}\s*as\s*any,\s+(\{[^\}]+\})\s*as\s*any\)/g, 'applyDesignFloorPopulationField({ world, entities }, $1)');

  fs.writeFileSync(file, content);
}
