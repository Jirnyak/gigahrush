const fs = require('fs');

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 100_000 \}\)/g, "setAlifeState(state, { seed: 12345, total: 100_000 }, { buckets: [] })");
  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 20_000 \}\)/g, "setAlifeState(state, { seed: 12345, total: 20_000 }, { buckets: [] })");
  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 1_000 \}\)/g, "setAlifeState(state, { seed: 12345, total: 1_000 }, { buckets: [] })");
  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 100_000, overrides: \[\{ id: 1, money: 640, accountRubles: 999_360 \}\] \}\)/g, "setAlifeState(state, { seed: 12345, total: 100_000, overrides: [{ id: 1, money: 640, accountRubles: 999_360 }] }, { buckets: [] })");
  content = content.replace(/setAlifeState\(deadState, \{ seed: 12345, total: 100_000, deadIds: \[1\] \}\)/g, "setAlifeState(deadState, { seed: 12345, total: 100_000, deadIds: [1] }, { buckets: [] })");
  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 64, deadIds: overrides\.gameOver \? \[1\] : \[\] \}\)/g, "setAlifeState(state, { seed: 12345, total: 64, deadIds: overrides.gameOver ? [1] : [] }, { buckets: [] })");
  fs.writeFileSync(file, content);
}

['tests/alife.test.ts', 'tests/alife-migration.test.ts', 'tests/alife-migration-active.test.ts', 'tests/demos-social-feedback.test.ts'].forEach(fixFile);
