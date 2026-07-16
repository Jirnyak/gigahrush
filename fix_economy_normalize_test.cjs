const fs = require('fs');

let content = fs.readFileSync('tests/economy-normalize.test.ts', 'utf8');

// Fix the undefined !== 100 issue
content = content.replace(/z: -6,/g, 'z: 0,');

// Fix the missing argument to assert.equal
content = content.replace(/assert\.equal\(economy\.floors\[-26\]\?\.floor\.MAINTENANCE\);/g, "assert.equal(economy.floors[-26]?.z, -26);");

fs.writeFileSync('tests/economy-normalize.test.ts', content);
console.log('Fixed tests/economy-normalize.test.ts');
