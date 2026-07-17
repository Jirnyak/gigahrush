const fs = require('fs');
const path = require('path');

const floors = [
  'pioneer_camp',
  'oranzhereya_betona',
  'dark_metro',
  'attractor_dvor'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 1. Move and update floor files
for (const floor of floors) {
  const oldPath = `src/gen/design_floors/${floor}.ts`;
  const newDir = `src/gen/${floor}`;
  const newPath = `${newDir}/index.ts`;

  if (fs.existsSync(oldPath)) {
    ensureDir(newDir);
    let content = fs.readFileSync(oldPath, 'utf8');

    // Add applyDesignFloorPopulationField import if needed
    if (!content.includes('applyDesignFloorPopulationField')) {
      content = content.replace(
        "import type { FloorGeneration } from '../floor_manifest';",
        "import type { FloorGeneration } from '../floor_manifest';\nimport { applyDesignFloorPopulationField } from '../design_floors/population';"
      );
    }
    if (!content.includes('applyDesignFloorPopulationField')) {
      content = content.replace(
        "import type { FloorGeneration } from '../../gen/floor_manifest';",
        "import type { FloorGeneration } from '../../gen/floor_manifest';\nimport { applyDesignFloorPopulationField } from '../design_floors/population';"
      );
    }

    fs.writeFileSync(newPath, content);
    fs.unlinkSync(oldPath);
    console.log(`Moved ${oldPath} to ${newPath}`);
  }
}

// 2. Update manifest.ts
const manifestPath = 'src/gen/design_floors/manifest.ts';
let manifest = fs.readFileSync(manifestPath, 'utf8');
for (const floor of floors) {
  manifest = manifest.replace(`'./${floor}'`, `'../${floor}'`);
}
fs.writeFileSync(manifestPath, manifest);
console.log('Updated manifest.ts');

