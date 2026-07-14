const fs = require('fs');

function patch(file) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Safe targeted replacements
  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 100_000, overrides: \[\{ id: 1, money: 640, accountRubles: 999_360 \}\] \}\)/g, 
    "setAlifeState(state, { seed: 12345, total: 100_000, overrides: [{ id: 1, money: 640, accountRubles: 999_360 }] }, { populationPlan: 'empty_packages' })");

  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 100_000 \}\)/g, 
    "setAlifeState(state, { seed: 12345, total: 100_000 }, { populationPlan: 'empty_packages' })");

  content = content.replace(/setAlifeState\(deadState, \{ seed: 12345, total: 100_000, deadIds: \[1\] \}\)/g, 
    "setAlifeState(deadState, { seed: 12345, total: 100_000, deadIds: [1] }, { populationPlan: 'empty_packages' })");

  content = content.replace(/setAlifeState\(journeyState, \{ seed: 12345, total: 100_000 \}\)/g, 
    "setAlifeState(journeyState, { seed: 12345, total: 100_000 }, { populationPlan: 'empty_packages' })");

  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 64, deadIds: overrides\.gameOver \? \[1\] : \[\] \}\)/g, 
    "setAlifeState(state, { seed: 12345, total: 64, deadIds: overrides.gameOver ? [1] : [] }, { populationPlan: 'empty_packages' })");

  content = content.replace(/setAlifeState\(deadState, \{ seed: 12345, total: 64, deadIds: \[1\] \}\)/g, 
    "setAlifeState(deadState, { seed: 12345, total: 64, deadIds: [1] }, { populationPlan: 'empty_packages' })");
    
  fs.writeFileSync(file, content);
}

patch('tests/alife.test.ts');
patch('tests/alife-migration.test.ts');
patch('tests/alife-migration-active.test.ts');
patch('tests/demos-social-feedback.test.ts');
