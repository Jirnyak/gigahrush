const fs = require('fs');

let testCode = fs.readFileSync('tests/markov-dialogue-quests.test.ts', 'utf8');
testCode = testCode.replace(/z: 60,/g, "floorId: 'design:kvartiry',");
testCode = testCode.replace(/z: 60/g, "floorId: 'design:kvartiry'");
fs.writeFileSync('tests/markov-dialogue-quests.test.ts', testCode, 'utf8');

