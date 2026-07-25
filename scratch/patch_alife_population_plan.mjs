import fs from 'fs';
const path = 'src/data/alife_population_plan.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Add getPlotNpcNumericId to imports from npc_packages
code = code.replace(
  /import \{\s*allNpcPackages,\s*npcPackageDisplayName,\s*type NpcPackageDef,\s*\} from '\.\/npc_packages';/,
  "import { allNpcPackages, npcPackageDisplayName, type NpcPackageDef, getPlotNpcNumericId } from './npc_packages';"
);

// 2. Add plotNpcId to the returned object
code = code.replace(
  /floorKey: pack\.placement\.homeFloorKey,\n    npcPackageId: pack\.id,\n    name: npcPackageDisplayName\(pack\),/,
  "floorKey: pack.placement.homeFloorKey,\n    npcPackageId: pack.id,\n    plotNpcId: pack.content?.plotNpcId ? getPlotNpcNumericId(pack.content.plotNpcId) : undefined,\n    name: npcPackageDisplayName(pack),"
);

fs.writeFileSync(path, code);
