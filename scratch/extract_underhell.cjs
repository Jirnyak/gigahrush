const fs = require('fs');

let fullFloor = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

// The underhell block seems to start at reinforceUnderhellAuthoredHqTerritory and end around line 1250.
const lines = fullFloor.split('\n');
const startIdx = lines.findIndex(l => l.includes('export function reinforceUnderhellAuthoredHqTerritory'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('export function reinforceHyperbolicSwitchyardAuthoredHqTerritory'));

if (startIdx !== -1 && endIdx !== -1) {
  const underhellCode = lines.slice(startIdx, endIdx).join('\n');
  
  // write to src/gen/underhell/hq.ts
  fs.writeFileSync('src/gen/underhell/hq.ts', `import type { World } from '../../core/world';\nimport type { Room } from '../../core/rooms';\nimport { RoomType, TerritoryOwner, Tex, Cell, DoorState, Feature } from '../../core/types';\nimport { irand, rng } from '../../core/rand';\nimport { addRoomDoor } from '../procedural_geometry';\nimport { carveDisc, connectRooms } from '../procedural_geometry_recipes';\n\n` + underhellCode);
  
  // remove from full_floor.ts
  lines.splice(startIdx, endIdx - startIdx);
  fs.writeFileSync('src/gen/design_floors/full_floor.ts', lines.join('\n'));
  console.log('Extracted underhell to hq.ts');
} else {
  console.log('Could not find bounds', startIdx, endIdx);
}

