import fs from 'fs';
import path from 'path';

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  if (content.includes("from '../shared'") && content.includes("requireSpawnedPlotNpcFromPackage")) {
    content = content.replace(/import \{ requireSpawnedPlotNpcFromPackage \} from '\.\.\/shared';/, "import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';");
    changed = true;
  }
  
  if (content.includes("from '../../gen/shared'") && content.includes("requireSpawnedPlotNpcFromPackage")) {
    content = content.replace(/import \{ requireSpawnedPlotNpcFromPackage \} from '\.\.\/\.\.\/gen\/shared';/, "import { requireSpawnedPlotNpcFromPackage } from '../../gen/plot_npc_spawn';");
    changed = true;
  }

  // Find places where requireSpawnedPlotNpcFromPackage is used but not imported
  if (content.includes("requireSpawnedPlotNpcFromPackage(") && !content.includes("requireSpawnedPlotNpcFromPackage }")) {
      content = content.replace(/(\nimport.*?;)+\n/, `$&import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';\n`);
      changed = true;
  }
  
  // brown_slime_cleanup.ts(17,24): error TS2454: Variable 'SLIME_SCRAPER_ITEM' is used before being assigned.
  // This is a bug in how I injected the const probably.
  if (filePath.includes('brown_slime_cleanup.ts')) {
     if (content.includes("const SLIME_SCRAPER_ITEM: string;")) {
       // it's not my bug, wait, let's just see.
     }
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log("Fixed imports in " + filePath);
  }
}

function processDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
       processDir(p);
    } else if (p.endsWith('.ts')) {
       fixFile(p);
    }
  });
}

processDir('src/gen');

