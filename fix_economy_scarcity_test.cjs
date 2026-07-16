const fs = require('fs');
let content = fs.readFileSync('tests/economy-scarcity.test.ts', 'utf8');

// Replace "import { getResourceScarcity, ensureEconomyState } from '../src/systems/economy';"
// with "import { getResourceScarcity, ensureEconomyState } from '../src/systems/economy';\nimport { createEconomyFloorState } from '../src/data/economy';"
if (!content.includes('createEconomyFloorState')) {
  content = content.replace("from '../src/systems/economy';", "from '../src/systems/economy';\nimport { createEconomyFloorState } from '../src/data/economy';");
}

// Replace econ.floors['living']! with (econ.floors[0] || (econ.floors[0] = createEconomyFloorState(0)))
content = content.replace(/econ\.floors\['living'\]!/g, '(econ.floors[0] || (econ.floors[0] = createEconomyFloorState(0)))');

fs.writeFileSync('tests/economy-scarcity.test.ts', content);
console.log('Fixed economy-scarcity.test.ts');
