const fs = require('fs');
let code = fs.readFileSync('tests/alife.test.ts', 'utf8');
code = code.replace(/'0'/g, "'design:living'");
code = code.replace(/currentZ: 0/g, "currentZ: 60");
fs.writeFileSync('tests/alife.test.ts', code, 'utf8');
