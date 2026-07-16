const fs = require('fs');
let content = fs.readFileSync('src/data/economy_rules.ts', 'utf8');

content = content.replace(/floor: 'ministry'/g, 'z: 30');
content = content.replace(/floor: 'kvartiry'/g, 'z: 14');
content = content.replace(/floor: 'living'/g, 'z: 0');
content = content.replace(/floor: 'maintenance'/g, 'z: -26');
content = content.replace(/floor: 'hell'/g, 'z: -36');
content = content.replace(/floor: 'void'/g, 'z: -50');

// Remove @ts-ignore if we no longer need them
content = content.replace(/\/\/ @ts-ignore\n\s*\{ z:/g, '{ z:');

fs.writeFileSync('src/data/economy_rules.ts', content);
console.log('Fixed economy_rules.ts');
