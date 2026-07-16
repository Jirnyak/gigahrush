const fs = require('fs');

const testFiles = [
  'tests/scripted-arrivals-migration.test.ts',
  'tests/quest-death-reset.test.ts',
  'tests/samosbor-director-migration.test.ts',
  'tests/psi-system.test.ts',
  'tests/quest-kill-floor.test.ts',
  'tests/quest-kill-pressure.test.ts',
  'tests/ui-layout.test.ts',
  'tests/wrong-door.test.ts'
];

for (const file of testFiles) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');

  if (content.includes('getPlotNpcNumericId') && !content.includes('getPlotNpcNumericId } from') && !content.includes('getPlotNpcNumericId} from') && !content.includes('getPlotNpcNumericId,')) {
      content = `import { getPlotNpcNumericId } from '../src/data/npc_packages';\n` + content;
  }

  fs.writeFileSync(file, content);
}
