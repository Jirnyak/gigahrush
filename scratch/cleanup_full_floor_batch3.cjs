const fs = require('fs');

let fullFloor = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

// Remove cases from switch
fullFloor = fullFloor.replace(/case 'production_belt':\s*expandProductionBeltGeometry\(generation\.world, rng\);\n\s*break;\n/g, '');
fullFloor = fullFloor.replace(/case 'silicon_net_well':\s*expandSiliconNetWellRouteGeometry\(generation\.world, rng\);\n\s*break;\n/g, '');
fullFloor = fullFloor.replace(/case 'underhell':\s*expandUnderhellRouteGeometry\(generation\.world, rng\);\n\s*break;\n/g, '');
fullFloor = fullFloor.replace(/case 'darkness':\s*expandDarknessRouteGeometry\(generation\.world, rng\);\n\s*break;\n/g, '');

// Remove reinforce
fullFloor = fullFloor.replace(/if \(route\.id === 'darkness'\) reinforceDarknessAuthoredHqTerritory\(generation\.world\);\n/g, '');

// Remove if blocks
fullFloor = fullFloor.replace(/if \(routeId === 'underhell'\) \{\n\s*reinforceUnderhellAuthoredHqTerritory\(world\);\n\s*return;\n\s*}\n/g, '');
fullFloor = fullFloor.replace(/if \(routeId === 'silicon_net_well'\) \{\n\s*tuneSiliconNetWellRouteZones\(world\);\n\s*return;\n\s*}\n/g, '');
fullFloor = fullFloor.replace(/if \(routeId === 'darkness'\) \{\n\s*reinforceDarknessAuthoredHqTerritory\(world\);\n\s*return;\n\s*}\n/g, '');
fullFloor = fullFloor.replace(/if \(routeId === 'silicon_net_well'\) \{\n\s*tuneSiliconNetWellRouteZones\(world\);\n\s*return;\n\s*}\n/g, '');
fullFloor = fullFloor.replace(/if \(routeId === 'underhell'\) \{\n\s*reinforceUnderhellAuthoredHqTerritory\(world\);\n\s*return;\n\s*}\n/g, '');

// Remove lights blackout
fullFloor = fullFloor.replace(/else if \(route\.id === 'darkness'\) blackoutDarknessLights\(generation\.world\);\n/g, '');

// Remove imports
fullFloor = fullFloor.replace(/import \{ blackoutDarknessLights, expandDarknessRouteGeometry, reinforceDarknessAuthoredHqTerritory \} from '\.\.\/darkness';\n/, '');
fullFloor = fullFloor.replace(/import \{ expandProductionBeltGeometry \} from '\.\.\/production_belt';\n/, '');
fullFloor = fullFloor.replace(/import \{ expandSiliconNetWellRouteGeometry, tuneSiliconNetWellRouteZones \} from '\.\.\/silicon_net_well';\n/, '');
fullFloor = fullFloor.replace(/import \{ expandUnderhellRouteGeometry \} from '\.\.\/underhell';\n/, '');

fs.writeFileSync('src/gen/design_floors/full_floor.ts', fullFloor);
console.log('Cleaned up full_floor.ts for Batch 3');
