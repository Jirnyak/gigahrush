const fs = require('fs');
const child_process = require('child_process');

const floors = [
  { id: 'chthonic_attic', z: 46, func: 'generateChthonicAtticDesignFloor' },
  { id: 'antenna_court', z: 42, func: 'generateAntennaCourtDesignFloor' },
  { id: 'raionsovet_archive', z: 22, func: 'generateRaionsovetArchiveDesignFloor' },
  { id: 'registry_morgue', z: 18, func: 'generateRegistryMorgueDesignFloor' }
];

const hooks = {
  'chthonic_attic': `
  const rngFn = seededRandom(hashSeed('design-full:chthonic_attic:46', 46));
  expandChthonicAtticRootNetwork(world, rngFn);
  retuneExpandedChthonicAtticEcology(world);
`,
  'antenna_court': `
  const rngFn = seededRandom(hashSeed('design-full:antenna_court:42', 42));
  expandAntennaCourtRouteGeometry(world, rngFn);
  retuneAntennaCourtRouteZones(world);
`,
  'raionsovet_archive': `
  const rngFn = seededRandom(hashSeed('design-full:raionsovet_archive:22', 22));
  expandRaionsovetArchiveGeometry(world, rngFn);
  retuneRaionsovetArchiveZones(world);
  reinforceRaionsovetArchiveAuthoredHqTerritory(world);
`,
  'registry_morgue': `
  const rngFn = seededRandom(hashSeed('design-full:registry_morgue:18', 18));
  expandRegistryMorgueGeometry(world, rngFn);
  reinforceRegistryMorgueAuthoredTerritory(world);
`
};

for (const floor of floors) {
  child_process.execSync(`mkdir -p src/gen/${floor.id}`);
  child_process.execSync(`mv src/gen/design_floors/${floor.id}.ts src/gen/${floor.id}/index.ts`);
  
  const file = `src/gen/${floor.id}/index.ts`;
  let content = fs.readFileSync(file, 'utf8');

  // Insert imports at the top
  const imports = [
    "import { applyDesignFloorPopulationField } from '../design_floors/population';",
    "import { seededRandom, hashSeed } from '../../core/rand';"
  ];
  content = imports.join('\n') + '\n' + content;
  
  // Find where the generator function starts
  const funcStart = content.indexOf(`export function ${floor.func}`);
  if (funcStart === -1) {
    console.log(`Could not find ${floor.func} in ${floor.id}`);
    continue;
  }
  
  // Find the return statement inside this function
  const returnStart = content.indexOf('return {', funcStart);
  let braceCount = 0;
  let returnEnd = -1;
  for (let i = returnStart + 'return {'.length - 1; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        returnEnd = content.indexOf(';', i);
        if (returnEnd === -1 || returnEnd > i + 10) returnEnd = i;
        break;
      }
    }
  }
  
  if (returnEnd !== -1) {
    const originalReturn = content.substring(returnStart, returnEnd + 1);
    const replacement = originalReturn.replace('return {', 'const generation = {');
    const newReturn = `  ${replacement}
${hooks[floor.id]}
  applyDesignFloorPopulationField(generation as any, { id: '${floor.id}', z: ${floor.z} } as any);
  return { ...generation, isDecentralized: true } as any;`;
    
    content = content.substring(0, returnStart) + newReturn + content.substring(returnEnd + 1);
    fs.writeFileSync(file, content);
    console.log(`Patched ${floor.id}`);
  } else {
    console.log(`Could not parse return in ${floor.id}`);
  }
}

// Now update manifest.ts imports
let manifest = fs.readFileSync('src/gen/design_floors/manifest.ts', 'utf8');
manifest = manifest.replace(/import \{ ([a-zA-Z0-9_, ]+) \} from '\.\/chthonic_attic'/g, "import { $1 } from '../chthonic_attic'");
manifest = manifest.replace(/import \{ ([a-zA-Z0-9_, ]+) \} from '\.\/antenna_court'/g, "import { $1 } from '../antenna_court'");
manifest = manifest.replace(/import \{ ([a-zA-Z0-9_, ]+) \} from '\.\/raionsovet_archive'/g, "import { $1 } from '../raionsovet_archive'");
manifest = manifest.replace(/import \{ ([a-zA-Z0-9_, ]+) \} from '\.\/registry_morgue'/g, "import { $1 } from '../registry_morgue'");
fs.writeFileSync('src/gen/design_floors/manifest.ts', manifest);

// Clean full_floor.ts
let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');
const importsToRemove = [
  "import { expandChthonicAtticRootNetwork, retuneExpandedChthonicAtticEcology } from './chthonic_attic';",
  "import { expandAntennaCourtRouteGeometry, retuneAntennaCourtRouteZones } from './antenna_court';",
  "import { expandRaionsovetArchiveGeometry, reinforceRaionsovetArchiveAuthoredHqTerritory } from './raionsovet_archive';",
  "import { expandRegistryMorgueGeometry, reinforceRegistryMorgueAuthoredTerritory } from './registry_morgue';"
];
for (const imp of importsToRemove) {
  full = full.replace(imp + '\n', '');
}
full = full.replace(/case 'chthonic_attic':[\s\S]*?break;/g, '');
full = full.replace(/case 'antenna_court':[\s\S]*?break;/g, '');
full = full.replace(/case 'raionsovet_archive':[\s\S]*?break;/g, '');
full = full.replace(/case 'registry_morgue':[\s\S]*?break;/g, '');

full = full.replace(/if \(route\.id === 'chthonic_attic'\) retuneExpandedChthonicAtticEcology\(generation\.world\);\n?/g, '');
full = full.replace(/if \(route\.id === 'registry_morgue'\) reinforceRegistryMorgueAuthoredTerritory\(generation\.world\);\n?/g, '');
full = full.replace(/if \(route\.id === 'antenna_court'\) retuneAntennaCourtRouteZones\(generation\.world\);\n?/g, '');
full = full.replace(/if \(routeId === 'raionsovet_archive'\) retuneRaionsovetArchiveZones\(world\);\n?/g, '');
full = full.replace(/if \(routeId === 'raionsovet_archive'\) reinforceRaionsovetArchiveAuthoredHqTerritory\(world\);\n?/g, '');
full = full.replace(/if \(routeId === 'registry_morgue'\) \{[\s\S]*?\}\n/g, '');
fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);

console.log("Patched Batch 4 completely");
