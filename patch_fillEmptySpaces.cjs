const fs = require('fs');

const path = 'src/gen/procedural_floor.ts';
let code = fs.readFileSync(path, 'utf8');

const newVoidFillers = `function applyVoidFillers(world: World, rooms: Room[]): void {
  const minBlockSize = 8;
  const padding = 0; // minimum distance from edge
  const maxVoids = 2000;
  let filled = 0;

  for (let y = padding; y < W - padding - minBlockSize; y += 1) {
    for (let x = padding; x < W - padding - minBlockSize; x += 1) {
      if (filled >= maxVoids) return;

      // Check if we have a solid block of minBlockSize x minBlockSize
      let isVoid = true;
      for (let dy = 0; dy < minBlockSize; dy++) {
        for (let dx = 0; dx < minBlockSize; dx++) {
          const ci = world.idx(x + dx, y + dy);
          if (world.cells[ci] !== Cell.WALL || world.aptMask[ci] || world.roomMap[ci] !== -1) {
            isVoid = false;
            break;
          }
        }
        if (!isVoid) break;
      }

      if (isVoid) {
        // Carve a new room
        const roomW = Math.floor(Math.random() * (minBlockSize - 2 - 4 + 1)) + 4;
        const roomH = Math.floor(Math.random() * (minBlockSize - 2 - 4 + 1)) + 4;
        const rx = x + Math.floor((minBlockSize - roomW) / 2);
        const ry = y + Math.floor((minBlockSize - roomH) / 2);

        // Fill with mostly utility/corridor
        const roomType = chance(0.7) ? RoomType.STORAGE : (chance(0.5) ? RoomType.STORAGE : RoomType.CORRIDOR);

        const room = stampRoom(world, rooms.length, roomType, rx, ry, roomW, roomH, -1);
        rooms.push(room);
        filled++;

        // Connect to nearest corridor/room
        let nearestFloorCellX = -1;
        let nearestFloorCellY = -1;
        let bestDist = Infinity;

        const cx = rx + Math.floor(roomW / 2);
        const cy = ry + Math.floor(roomH / 2);

        // Find nearest floor cell
        for (let searchRadius = 2; searchRadius < 48; searchRadius++) {
          for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
               // Only check perimeter
               if (Math.abs(dx) !== searchRadius && Math.abs(dy) !== searchRadius) continue;

               const wx = world.wrap(cx + dx);
               const wy = world.wrap(cy + dy);
               const ci = world.idx(wx, wy);

               // Found a reachable floor cell not inside our new room
               if (world.cells[ci] === Cell.FLOOR && world.roomMap[ci] !== room.id) {
                 const dist = Math.abs(dx) + Math.abs(dy);
                 if (dist < bestDist) {
                   bestDist = dist;
                   nearestFloorCellX = wx;
                   nearestFloorCellY = wy;
                 }
               }
            }
          }
          if (nearestFloorCellX !== -1) break; // found nearest in this radius
        }

        if (nearestFloorCellX !== -1) {
           carveCorridor(world, cx, cy, nearestFloorCellX, nearestFloorCellY);

           // We need to place a door at the boundary to not break ALife
           // Simplest: place door at nearest point on room boundary
           let doorX = cx, doorY = cy;
           let doorDist = Infinity;

           // Find boundary cell of our room that is closest to nearestFloorCell
           for (let dy = -1; dy <= room.h; dy++) {
             for (let dx = -1; dx <= room.w; dx++) {
               // Must be a wall cell on boundary
               if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;

               const bndX = world.wrap(room.x + dx);
               const bndY = world.wrap(room.y + dy);
               const bndIdx = world.idx(bndX, bndY);

               // Only consider cells that were carved into floor/door by the corridor
               if (world.cells[bndIdx] === Cell.FLOOR || world.cells[bndIdx] === Cell.DOOR) {
                 const d = Math.abs(bndX - nearestFloorCellX) + Math.abs(bndY - nearestFloorCellY);
                 if (d < doorDist) {
                   doorDist = d;
                   doorX = bndX;
                   doorY = bndY;
                 }
               }
             }
           }

           if (doorDist < Infinity) {
             placeDoorAt(world, doorX, doorY, room.id);
           }
        }
      }
    }
  }
}`;

const startIdx = code.indexOf('function applyVoidFillers(world: World, rooms: Room[]): void {');
let endIdx = startIdx;
let bracketCount = 0;
let started = false;

for (let i = startIdx; i < code.length; i++) {
  if (code[i] === '{') {
    bracketCount++;
    started = true;
  } else if (code[i] === '}') {
    bracketCount--;
  }

  if (started && bracketCount === 0) {
    endIdx = i;
    break;
  }
}

const oldVoidFillers = code.substring(startIdx, endIdx + 1);
code = code.replace(oldVoidFillers, newVoidFillers);
fs.writeFileSync(path, code);
