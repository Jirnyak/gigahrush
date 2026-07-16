const fs = require('fs');

const filesToFix = [
  'tests/rail-trains.test.ts',
  'tests/runtime-topology.test.ts',
  'tests/safeguard.test.ts',
  'tests/samosbor-director-migration.test.ts',
  'tests/scripted-arrivals-migration.test.ts'
];

for (const file of filesToFix) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('import { getPlotNpcCount }')) {
    content = "import { getPlotNpcCount } from '../src/data/npc_packages';\n" + content;
    fs.writeFileSync(file, content);
    console.log('Added import to', file);
  }
}
