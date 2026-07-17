const fs = require('fs');
let code = fs.readFileSync('src/data/alife_population_plan.ts', 'utf8');
console.log(code.split('\n').find(l => l.includes('TOTAL_PERSISTENT_POOL_CAP')));
