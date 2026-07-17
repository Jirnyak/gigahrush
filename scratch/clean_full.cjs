const fs = require('fs');
const path = 'src/gen/design_floors/full_floor.ts';
let content = fs.readFileSync(path, 'utf8');

// Remove imports
content = content.replace(/import \{ expandBolnichnyKorpusRouteGeometry, reinforceBolnichnyKorpusGates, tuneBolnichnyKorpusRouteZones \} from '\.\.\/bolnichny_korpus';\n/, '');
content = content.replace(/import \{ expandSlimeNiiRouteGeometry \} from '\.\.\/slime_nii';\n/, '');
content = content.replace(/import \{ expandTuringNurseryRouteGeometry \} from '\.\.\/turing_nursery';\n/, '');
content = content.replace(/import \{ expandBlackMarket88Bazaar \} from '\.\.\/black_market_88';\n/, '');

// Remove switch cases
content = content.replace(/    case 'bolnichny_korpus':\n      expandBolnichnyKorpusRouteGeometry\(generation\.world, rng\);\n      break;\n/s, '');
content = content.replace(/    case 'slime_nii':\n      expandSlimeNiiRouteGeometry\(generation\.world, rng\);\n      break;\n/s, '');
content = content.replace(/    case 'turing_nursery':\n      expandTuringNurseryRouteGeometry\(generation\.world, rng\);\n      break;\n/s, '');
content = content.replace(/    case 'black_market_88':\n      expandBlackMarket88Bazaar\(generation\.world, rng\);\n      break;\n/s, '');

// Remove the hardcoded checks in finalizeExpandedFloor for bolnichny
content = content.replace(/  if \(route\.id === 'bolnichny_korpus'\) reinforceBolnichnyKorpusGates\(generation\.world\);\n/g, '');

content = content.replace(/  if \(routeId === 'bolnichny_korpus'\) \{\n    tuneBolnichnyKorpusRouteZones\(generation\.world\);\n  \}\n/g, '');

fs.writeFileSync(path, content);
console.log('Cleaned full_floor');
