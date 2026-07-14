const fs = require('fs');

function patchFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/setAlifeState\(([^,]+), ([^,]+, [^,]+(total: 100_000|total: 64)[^)]*)\)/g, "setAlifeState($1, $2, { populationPlan: 'empty_packages' })");
  // Some don't have total inline, let's just do a simpler replace.
  // Actually, all these failing tests call setAlifeState with 2 arguments.
  
  // Wait, let's be more precise.
  content = content.replace(/setAlifeState\((state|deadState|journeyState), (\{[^}]+\})\)/g, "setAlifeState($1, $2, { populationPlan: 'empty_packages' })");
  // For multi-line:
  content = content.replace(/setAlifeState\((state|deadState|journeyState), (\{[\s\S]*?\})\)/g, "setAlifeState($1, $2, { populationPlan: 'empty_packages' })");
  
  fs.writeFileSync(file, content);
}

patchFile('tests/alife.test.ts');
patchFile('tests/alife-migration.test.ts');
patchFile('tests/alife-migration-active.test.ts');
patchFile('tests/demos-social-feedback.test.ts');
