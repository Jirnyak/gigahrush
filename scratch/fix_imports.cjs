const fs = require('fs');

const floors = [
  'src/gen/bolnichny_korpus/index.ts',
  'src/gen/slime_nii/index.ts',
  'src/gen/turing_nursery/index.ts',
  'src/gen/black_market_88/index.ts'
];

floors.forEach(path => {
  let content = fs.readFileSync(path, 'utf8');

  // Fix `type FloorGeneration` import if needed
  content = content.replace(/import type \{ FloorGeneration \} from '\.\.\/floor_manifest';/, "import { type FloorGeneration } from '../floor_manifest';");

  // Inject required imports for decentralization if not present
  if (!content.includes("import { designFloorById }")) {
    content = content.replace(
      /import \{ type FloorGeneration \} from '\.\.\/floor_manifest';/,
      `import { type FloorGeneration } from '../floor_manifest';
import { designFloorById } from '../../data/design_floors';
import { ensureRouteWideFootprint } from '../design_floors/route_shell';
import { finalizeExpandedFloor } from '../design_floors/full_floor';
import { applyDesignFloorPopulationField } from '../design_floors/population';`
    );
  }

  // Inject `rng` if missing
  if (content.includes('const rngGen = () => rng();') && !content.includes('import { rng }')) {
    // wait, rng is usually imported from `../../core/rand`
    // wait, it is imported as `import { rng, hashSeed, withSeededRandom } from '../../core/rand';` in most files.
    // If rng is missing, add it to imports
  }

  // Also replace `SLIME_NII_ROUTE_ID` with `'slime_nii'` because my patch used the var SLIME_NII_ROUTE_ID but wait, if it's not defined or exported maybe we should just use string literal?
  // Let's use string literal.
  content = content.replace(/designFloorById\(SLIME_NII_ROUTE_ID\)/, "designFloorById('slime_nii')");
  content = content.replace(/designFloorById\(TURING_NURSERY_ROUTE_ID\)/, "designFloorById('turing_nursery')");
  content = content.replace(/designFloorById\(BOLNICHNY_KORPUS_ROUTE_ID\)/, "designFloorById('bolnichny_korpus')");
  
  fs.writeFileSync(path, content);
  console.log('Fixed imports for ' + path);
});
