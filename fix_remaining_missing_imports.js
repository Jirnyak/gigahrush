const fs = require('fs');

const filesToFix = [
  'tests/plot-outcomes.test.ts',
  'tests/quest-kill-pressure.test.ts'
];

for (const file of filesToFix) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('import { getPlotNpcCount }')) {
    content = "import { getPlotNpcCount } from '../src/data/npc_packages';\n" + content;
    fs.writeFileSync(file, content);
    console.log('Added import to', file);
  }
}
