const fs = require('fs');

let full = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

// Export types and functions
full = full.replace(/type FloorStyle =/g, 'export type FloorStyle =');
full = full.replace(/function setFeature\(/g, 'export function setFeature(');
full = full.replace(/function addRoom\(/g, 'export function addRoom(');
full = full.replace(/function carveLine\(/g, 'export function carveLine(');
full = full.replace(/function protectedMask\(/g, 'export function protectedMask(');
full = full.replace(/function finalizeExpandedFloor\(/g, 'export function finalizeExpandedFloor(');
full = full.replace(/function style\(/g, 'export function style(');
full = full.replace(/function reinforceUnderhellAuthoredHqTerritory\(/g, 'export function reinforceUnderhellAuthoredHqTerritory(');

// Remove batch 1, 2, 3 cases
const floorsToRemove = [
  'roof', 'floor_69', 'moebius_podezd', 'communal_ring', 'pioneer_camp', 'oranzhereya_betona', 'dark_metro', 'attractor_dvor',
  'production_belt', 'silicon_net_well', 'underhell', 'darkness'
];

for (const f of floorsToRemove) {
    full = full.replace(new RegExp(`case '${f}':\\s*expand[A-Za-z0-9_]+\\(generation(\\.world)?(, generation\\.entities)?(, rng)?(, style\\(route\\))?\\);\\s*break;\\n`, 'g'), '');
    full = full.replace(new RegExp(`if \\(routeId === '${f}'\\) \\{[\\s\\S]*?\\}\\n`, 'g'), '');
    full = full.replace(new RegExp(`else if \\(route\\.id === '${f}'\\) [\\s\\S]*?;\\n`, 'g'), '');
    full = full.replace(new RegExp(`if \\(route\\.id === '${f}'\\) [\\s\\S]*?;\\n`, 'g'), '');
    full = full.replace(new RegExp(`import \\{[\\s\\S]*?\\} from '\\.\\/${f}';\\n`, 'g'), '');
}

// Remove the expand* functions for the removed floors that might be leftover
// Some were local functions in full_floor.ts that we want to keep? No, they were moved to their own folders!
// Actually, in the original file, expandDarkness, expandUnderhell, etc., were defined in full_floor.ts. Wait, if they were moved, they shouldn't be in full_floor.ts at all.
// The previous agent moved them by creating the new files. I should remove them.
// But some regexes are hard. I will just let the TS compiler complain if they are unused and then I'll remove them or ignore them?
// Actually, since I reverted `full_floor.ts` to the state *before* the previous agent touched it, ALL the logic for Batches 1, 2, and 3 is back in `full_floor.ts`!
// Wait! If `git checkout` reverted to the last commit, it means `full_floor.ts` contains `expandRoof`, `expandMoebius`, etc.!
// I MUST remove them all!

fs.writeFileSync('src/gen/design_floors/full_floor.ts', full);
