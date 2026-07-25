import fs from 'fs';
const path = 'src/gen/slime_nii/index.ts';
let c = fs.readFileSync(path, 'utf8');
c = c.replace(/import \{ requireSpawnedPlotNpcFromPackage \} from '\.\.\/plot_npc_spawn';\n/, '');
fs.writeFileSync(path, c);
