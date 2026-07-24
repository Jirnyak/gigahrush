const fs = require('fs');

function fix() {
  const log = fs.readFileSync('/Users/jirnyak/.gemini/antigravity-ide/brain/90a70129-6f7d-4e03-b90d-69991ea1efaf/.system_generated/tasks/task-154.log', 'utf8');

  const files = [...new Set([...log.matchAll(/src\/gen\/([^/]+)\/index\.ts/g)].map(m => `src/gen/${m[1]}/index.ts`))];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');

    // Remove unused DesignFloorGeneration imports
    if (content.includes("error TS6133: 'DesignFloorGeneration' is declared but its value is never read.")) {
      // not needed, we can just replace the imports where not used
    }

    // Fix: const generation: DesignFloorGeneration = { isDecentralized: true, world, entities };
    // To: const generation = { isDecentralized: true as const, world, entities };
    content = content.replace(/const generation: DesignFloorGeneration = \{\s*isDecentralized:\s*true,\s*world,\s*entities\s*\};/g, 'const generation = { isDecentralized: true as const, world, entities };');

    // Fix: applyDesignFloorPopulationField({ world, entities }, { ... })
    // To: applyDesignFloorPopulationField({ world, entities, isDecentralized: true }, { ... })
    content = content.replace(/applyDesignFloorPopulationField\(\{\s*world,\s*entities\s*\},/g, 'applyDesignFloorPopulationField({ world, entities, isDecentralized: true },');
    
    // Fix returning generation when it needs to be extended
    content = content.replace(/return generation;/g, 'return { ...generation, isDecentralized: true as const };');
    
    // Actually, in some files it was:
    // return { ...generation, isDecentralized: true } as any;
    // Which my script turned into `return generation;`
    // And in `const generation: DesignFloorGeneration = { isDecentralized: true, ... }`, it became a DesignFloorGeneration.
    // If it's `return { ...generation, isDecentralized: true as const };` we need to be careful.

    // Let's just fix the specific type errors.
    // Error: Argument of type '{ world: World; entities: Entity[]; spawnX: number; spawnY: number; isDecentralized: boolean; }' is not assignable to parameter of type 'DesignFloorGeneration' or Omit<DesignFloorGeneration, 'spawnX' | 'spawnY'>
    content = content.replace(/isDecentralized: true/g, 'isDecentralized: true as const');
    content = content.replace(/isDecentralized:\s*true\s*as\s*const\s*as\s*const/g, 'isDecentralized: true as const');

    content = content.replace(/const generation: DesignFloorGeneration = /g, 'const generation = ');
    
    // Fix: applyDesignFloorPopulationField(generation as any, route as any) - done by previous script, but maybe missed some?
    content = content.replace(/applyDesignFloorPopulationField\(generation as any, route as any\)/g, 'applyDesignFloorPopulationField(generation, route)');
    
    // Fix missing isDecentralized in return objects
    content = content.replace(/return\s+\{\s*world,\s*entities,\s*spawnX,\s*spawnY(,[^\}]*)?\}/g, (match, p1) => {
      if (match.includes('isDecentralized')) return match;
      return `return { world, entities, spawnX, spawnY, isDecentralized: true as const${p1 || ''} }`;
    });

    fs.writeFileSync(file, content);
  }
}
fix();
