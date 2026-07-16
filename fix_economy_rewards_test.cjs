const fs = require('fs');
let content = fs.readFileSync('tests/economy-rewards.test.ts', 'utf8');

content = content.replace(/setResourceStock\(0, /g, 'setResourceStock(state, 0, ');
content = content.replace(/getScarcityAdjustedReward\((state, '[^']+', \d+), 'living'/g, 'getScarcityAdjustedReward($1, 0');

fs.writeFileSync('tests/economy-rewards.test.ts', content);
console.log('Fixed economy-rewards.test.ts');
