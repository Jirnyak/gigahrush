const fs = require('fs');
let content = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

// Remove imports
const importsToRemove = [
  "import { expandChthonicAtticRootNetwork, retuneExpandedChthonicAtticEcology } from './chthonic_attic';",
  "import { expandAntennaCourtRouteGeometry, retuneAntennaCourtRouteZones } from './antenna_court';",
  "import { expandRaionsovetArchiveGeometry, reinforceRaionsovetArchiveAuthoredHqTerritory } from './raionsovet_archive';",
  "import { expandRegistryMorgueGeometry, reinforceRegistryMorgueAuthoredTerritory } from './registry_morgue';"
];
for (const imp of importsToRemove) {
  content = content.replace(imp + '\n', '');
}

// Case statements
content = content.replace(/    case 'chthonic_attic':[\s\S]*?break;\n/g, '');
content = content.replace(/    case 'antenna_court':[\s\S]*?break;\n/g, '');
content = content.replace(/    case 'raionsovet_archive':[\s\S]*?break;\n/g, '');
content = content.replace(/    case 'registry_morgue':[\s\S]*?break;\n/g, '');

// If statements
content = content.replace(/  if \(route\.id === 'chthonic_attic'\) retuneExpandedChthonicAtticEcology\(generation\.world\);\n/g, '');
content = content.replace(/  if \(route\.id === 'registry_morgue'\) reinforceRegistryMorgueAuthoredTerritory\(generation\.world\);\n/g, '');
content = content.replace(/  if \(route\.id === 'antenna_court'\) retuneAntennaCourtRouteZones\(generation\.world\);\n/g, '');
content = content.replace(/  if \(routeId === 'raionsovet_archive'\) retuneRaionsovetArchiveZones\(world\);\n/g, '');
content = content.replace(/  if \(routeId === 'raionsovet_archive'\) reinforceRaionsovetArchiveAuthoredHqTerritory\(world\);\n/g, '');

// Registry morgue specific block
content = content.replace(/    if \(routeId === 'registry_morgue'\) \{[\s\S]*?\}\n/, '');

fs.writeFileSync('src/gen/design_floors/full_floor.ts', content);
console.log("Cleaned full_floor.ts");
