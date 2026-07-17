const fs = require('fs');

let content = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

const thingsToExport = [
  'interface FloorStyle',
  'function style\\(',
  'function setFeature\\(',
  'function addRoom\\(',
  'function carveLine\\(',
  'function protectedMask\\(',
  'function finalizeExpandedFloor\\(',
];

for (const thing of thingsToExport) {
  const regex = new RegExp(`^${thing}`, 'gm');
  content = content.replace(regex, 'export ' + thing.replace('\\(', '('));
}

// Ensure 'export function style(' is exported if it was caught. The regex 'gm' matches start of line.
// Wait, FloorStyle might be 'type FloorStyle'
content = content.replace(/^type FloorStyle/gm, 'export type FloorStyle');
content = content.replace(/^interface FloorStyle/gm, 'export interface FloorStyle');
content = content.replace(/^const style =/gm, 'export const style =');

fs.writeFileSync('src/gen/design_floors/full_floor.ts', content);
console.log("Exported necessary things from full_floor.ts");
