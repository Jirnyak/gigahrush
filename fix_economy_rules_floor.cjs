const fs = require('fs');
let content = fs.readFileSync('src/data/economy_rules.ts', 'utf8');

content = content.replace(/\{ z: 30, /g, "{ floor: 30, ");
content = content.replace(/\{ z: 14, /g, "{ floor: 14, ");
content = content.replace(/\{ z: 0, /g, "{ floor: 0, ");
content = content.replace(/\{ z: -26, /g, "{ floor: -26, ");
content = content.replace(/\{ z: -36, /g, "{ floor: -36, ");
content = content.replace(/\{ z: -50, /g, "{ floor: -50, ");

// Also fix ECONOMY_ROUTE_BLACK_MARKET_88 if it got mangled to z:
content = content.replace(/\{ z: ECONOMY_ROUTE_BLACK_MARKET_88,/g, "{ floor: ECONOMY_ROUTE_BLACK_MARKET_88,");

fs.writeFileSync('src/data/economy_rules.ts', content);
console.log('Fixed economy_rules.ts floor');
