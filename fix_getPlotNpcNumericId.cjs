const fs = require('fs');
const glob = require('glob');

function addImport(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('getPlotNpcNumericId') && !content.includes('getPlotNpcNumericId } from')) {
    let importPath = '';
    if (file.includes('src/data/')) importPath = "import { getPlotNpcNumericId } from './npc_packages';\n";
    else if (file.includes('src/systems/')) importPath = "import { getPlotNpcNumericId } from '../data/npc_packages';\n";
    else if (file.includes('src/gen/')) importPath = "import { getPlotNpcNumericId } from '../../data/npc_packages';\n";
    else importPath = "import { getPlotNpcNumericId } from './data/npc_packages';\n";

    // Wait, src/gen/design_floors/ vs src/gen/ministry/ ... might need deeper paths.
    const depth = file.split('/').length - 2;
    let prefix = '../'.repeat(depth);
    if(file.includes('src/data/')) prefix = './';
    importPath = `import { getPlotNpcNumericId } from '${prefix}data/npc_packages';\n`;
    if (file.includes('src/data/')) importPath = "import { getPlotNpcNumericId } from './npc_packages';\n";

    const lines = content.split('\n');
    let inserted = false;
    for(let i=0; i<lines.length; i++) {
        if(lines[i].startsWith('import ')) {
            lines.splice(i, 0, importPath.trim());
            inserted = true;
            break;
        }
    }
    if(!inserted) {
        lines.unshift(importPath.trim());
    }
    fs.writeFileSync(file, lines.join('\n'));
    console.log('Fixed imports in', file);
  }
}

glob.sync('src/**/*.ts').forEach(addImport);
