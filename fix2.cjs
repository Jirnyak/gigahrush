const fs = require('fs');

// Fix unused imports
const log = fs.readFileSync('/Users/jirnyak/.gemini/antigravity-ide/brain/90a70129-6f7d-4e03-b90d-69991ea1efaf/.system_generated/tasks/task-180.log', 'utf8');
const files = [...new Set([...log.matchAll(/src\/gen\/([^/]+)\/index\.ts/g)].map(m => `src/gen/${m[1]}/index.ts`))];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/import type \{ DesignFloorGeneration \} from '\.\.\/floor_manifest';\n/g, '');
  content = content.replace(/import type \{ DesignFloorGeneration \} from "\.\.\/floor_manifest";\n/g, '');
  fs.writeFileSync(file, content);
}

// Fix Chthonic Attic
let ch = fs.readFileSync('src/gen/chthonic_attic/index.ts', 'utf8');
ch = ch.replace(/applyDesignFloorPopulationField\(generation, route\)/, 'applyDesignFloorPopulationField({ ...generation, isDecentralized: true }, route)');
fs.writeFileSync('src/gen/chthonic_attic/index.ts', ch);

// Fix Moebius Podezd
let mb = fs.readFileSync('src/gen/moebius_podezd/index.ts', 'utf8');
mb = mb.replace(/applyDesignFloorPopulationField\(generation,/, 'applyDesignFloorPopulationField({ ...generation, isDecentralized: true as const },');
mb = mb.replace(/return generation;/, 'return { ...generation, isDecentralized: true as const };');
fs.writeFileSync('src/gen/moebius_podezd/index.ts', mb);

// Fix population.ts
let pop = fs.readFileSync('src/gen/design_floors/population.ts', 'utf8');
pop = pop.replace(/function makeAmbientNpcTemplate\([\s\S]*?generation: FloorGeneration\s*\)/, match => match.replace('FloorGeneration', "Pick<FloorGeneration, 'world' | 'entities'>"));
fs.writeFileSync('src/gen/design_floors/population.ts', pop);
