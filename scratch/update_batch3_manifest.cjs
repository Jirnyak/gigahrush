const fs = require('fs');

let manifest = fs.readFileSync('src/gen/design_floors/manifest.ts', 'utf8');
manifest = manifest.replace(/import { generateProductionBeltDesignFloor } from '\.\/production_belt';/, "import { generateProductionBeltDesignFloor } from '../production_belt';");
manifest = manifest.replace(/import { generateSiliconNetWellDesignFloor } from '\.\/silicon_net_well';/, "import { generateSiliconNetWellDesignFloor } from '../silicon_net_well';");
manifest = manifest.replace(/import { generateUnderhellDesignFloor } from '\.\/underhell';/, "import { generateUnderhellDesignFloor } from '../underhell';");
manifest = manifest.replace(/import { generateDarknessDesignFloor } from '\.\/darkness';/, "import { generateDarknessDesignFloor } from '../darkness';");
fs.writeFileSync('src/gen/design_floors/manifest.ts', manifest);
console.log('Updated manifest.ts');
