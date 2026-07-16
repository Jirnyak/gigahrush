const fs = require('fs');
const content = fs.readFileSync('tests/economy-rewards.test.ts', 'utf8');

const updated = content
  .replace(/setResourceStock\(0, /g, 'setResourceStock(state, 0, ')
  .replace(/getScarcityAdjustedReward\((state, '[^']+', \d+), 'living'/g, 'getScarcityAdjustedReward($1, 0');

fs.writeFileSync('tests/economy-rewards.test.ts', updated);
console.log('Fixed economy-rewards.test.ts');
