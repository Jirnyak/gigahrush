const fs = require('fs');

let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

const floorsToRemove = [
  'Roof', 'Floor69', 'MoebiusPodezd', 'CommunalRing', 'PioneerCamp', 'OranzhereyaBetona', 'DarkMetro', 'AttractorDvor',
  'ProductionBelt', 'SiliconNetWell', 'Underhell', 'Darkness'
];

for (const f of floorsToRemove) {
    full = full.replace(new RegExp(`function expand${f}[\\s\\S]*?\\n\\}\\n`, 'g'), '');
    full = full.replace(new RegExp(`function expand${f}[a-zA-Z0-9_]*\\([\\s\\S]*?\\n\\}\\n`, 'g'), '');
}

// Any helper functions like `generateDarknessState`, etc.
full = full.replace(/function tuneBlackMarket88Zone[\s\S]*?\n\}\n/g, ''); // no wait, black_market_88 isn't decentralized yet!
full = full.replace(/function blackoutDarknessLights[\s\S]*?\n\}\n/g, '');
full = full.replace(/function reinforceDarknessAuthoredHqTerritory[\s\S]*?\n\}\n/g, '');
full = full.replace(/function buildDarknessTopologyPlan[\s\S]*?\n\}\n/g, '');
full = full.replace(/function registerDarknessRouteCues[\s\S]*?\n\}\n/g, '');
full = full.replace(/function applyDarknessZones[\s\S]*?\n\}\n/g, '');

fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);
