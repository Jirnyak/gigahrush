const fs = require('fs');

let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

const badStrings = [
  'applyRoofLosShelterPockets',
  'placeAttractorDvorEmergencyPanels',
  'tunePioneerCampPopulationZones',
  'reinforceMoebiusPodezdAuthoredTerritory',
  'reinforceOranzhereyaBetonaAuthoredTerritory',
  'applyFloor69AmbientSpriteTemplates',
  'applyFloor69OwnershipVisibilityHeatmap',
  'MOEBIUS_PODEZD_ROOM_NAMES',
  'retuneRoofPressureZones',
  'tuneDarkMetroRouteZone',
  'expandRoofArchipelago',
  'reinforceUnderhellAuthoredHqTerritory',
  'expandDarknessRouteGeometry'
];

let lines = full.split('\n');
lines = lines.filter(line => {
  for (const s of badStrings) {
    if (line.includes(s)) {
      if (!line.includes('function ' + s) && !line.includes('export function ' + s)) {
        return false;
      }
    }
  }
  return true;
});

// Since `reinforceUnderhellAuthoredHqTerritory` was declared but never read, I should also delete its declaration, or just let TS not care. Wait, if it's declared and not used, TS fails.
// So let's delete the function declaration of `reinforceUnderhellAuthoredHqTerritory`
let content = lines.join('\n');
content = content.replace(/export function reinforceUnderhellAuthoredHqTerritory[\s\S]*?\n\}\n/, '');

fs.writeFileSync('src/gen/design_floors/full_floor.ts', content);

console.log('Removed leftover bad strings');
