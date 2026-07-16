const fs = require('fs');
const glob = require('glob');

const files = glob.sync('tests/**/*.test.ts');
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  if (content.includes('getNpcPackageByPlotNpcId(') && !content.includes('getPlotNpcNumericId')) {
    content = content.replace(/import \{.*getNpcPackageByPlotNpcId.*\} from '\.\.\/src\/data\/npc_packages';/, (match) => {
      return match.replace('{', '{ getPlotNpcNumericId,');
    });
  }

  content = content.replace(/getNpcPackageByPlotNpcId\((['`][^'`]+['`])\)/g, "getNpcPackageByPlotNpcId(getPlotNpcNumericId($1)!)");
  // Also plotNpcName might need it?
  // Let's see `plotNpcName` definition: function plotNpcName(plotNpcId: string)
  // `plotNpcName` takes a string, then calls `getNpcPackageByPlotNpcId(plotNpcId)`!
  // So inside the tests that define `plotNpcName`, we need to change `plotNpcId: string` to `number` or wrap it.
  
  if (content !== fs.readFileSync(file, 'utf8')) {
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
  }
}
