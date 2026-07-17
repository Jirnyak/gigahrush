const fs = require('fs');
let content = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');
content = content.replace(/^function finalizeExpandedFloor/gm, 'export function finalizeExpandedFloor');
fs.writeFileSync('src/gen/design_floors/full_floor.ts', content);
console.log("Exported finalizeExpandedFloor");
