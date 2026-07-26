const fs = require('fs');

const path = '/Users/jirnyak/Mirror/gigahrush/src/systems/ai/pathfinding.ts';
let code = fs.readFileSync(path, 'utf8');

function replaceBlock(startMarker, endMarker, newContent) {
    const startIndex = code.indexOf(startMarker);
    if (startIndex === -1) throw new Error("Start marker not found: " + startMarker.substring(0, 50));
    
    const endIndex = code.indexOf(endMarker, startIndex);
    if (endIndex === -1) throw new Error("End marker not found: " + endMarker.substring(0, 50));
    
    const before = code.substring(0, startIndex);
    const after = code.substring(endIndex);
    
    code = before + newContent + after;
}

const buildStart = `function constructPathFromTree(`;
const buildEnd = `function buildBakedTreePath(`;

const newBuild = `function constructPathFromTree(t: number, mStart: number, mEnd: number, world: World): number[] {
  const lca = getMacroLca(t, mStart, mEnd);
  if (lca === -1) return [];

  const forward = [];
  const reverse = [];

  let curr = mStart;
  let steps = 0;
  while (curr !== lca && steps < 2000) {
    forward.push(curr);
    curr = getMacroParent(curr, getMacroDir(t, curr));
    steps++;
  }
  
  curr = mEnd;
  steps = 0;
  while (curr !== lca && steps < 2000) {
    reverse.push(curr);
    curr = getMacroParent(curr, getMacroDir(t, curr));
    steps++;
  }

  forward.push(lca);
  for (let i = reverse.length - 1; i >= 0; i--) {
    forward.push(reverse[i]);
  }

  const subcellPath = [];
  
  for (let i = 0; i < forward.length; i++) {
    const m = forward[i];
    const cx = m % W;
    const cy = Math.floor(m / W);
    
    // Pick center if it's the very first or last, just to have an anchor,
    // though the steering will pull it anyway.
    // For intermediate cells, if we just put the border points, it's safer!
    if (i < forward.length - 1) {
       const nextM = forward[i+1];
       const ncx = nextM % W;
       const ncy = Math.floor(nextM / W);
       
       let borderSx = cx * 4 + 2;
       let borderSy = cy * 4 + 2;
       let nBorderSx = ncx * 4 + 2;
       let nBorderSy = ncy * 4 + 2;
       
       if (ncy === cy - 1) {
           // N
           for(let x=0; x<4; x++) {
               if(isSubcellNavPassable(world, (cy*4)*SW + cx*4+x) && isSubcellNavPassable(world, (ncy*4+3)*SW + ncx*4+x)) {
                   borderSx = cx*4+x; borderSy = cy*4;
                   nBorderSx = ncx*4+x; nBorderSy = ncy*4+3;
                   break;
               }
           }
       } else if (ncy === cy + 1 || (cy === W-1 && ncy === 0)) {
           // S
           for(let x=0; x<4; x++) {
               if(isSubcellNavPassable(world, (cy*4+3)*SW + cx*4+x) && isSubcellNavPassable(world, (ncy*4)*SW + ncx*4+x)) {
                   borderSx = cx*4+x; borderSy = cy*4+3;
                   nBorderSx = ncx*4+x; nBorderSy = ncy*4;
                   break;
               }
           }
       } else if (ncx === cx + 1 || (cx === W-1 && ncx === 0)) {
           // E
           for(let y=0; y<4; y++) {
               if(isSubcellNavPassable(world, (cy*4+y)*SW + cx*4+3) && isSubcellNavPassable(world, (ncy*4+y)*SW + ncx*4)) {
                   borderSx = cx*4+3; borderSy = cy*4+y;
                   nBorderSx = ncx*4; nBorderSy = ncy*4+y;
                   break;
               }
           }
       } else if (ncx === cx - 1 || (cx === 0 && ncx === W-1)) {
           // W
           for(let y=0; y<4; y++) {
               if(isSubcellNavPassable(world, (cy*4+y)*SW + cx*4) && isSubcellNavPassable(world, (ncy*4+y)*SW + ncx*4+3)) {
                   borderSx = cx*4; borderSy = cy*4+y;
                   nBorderSx = ncx*4+3; nBorderSy = ncy*4+y;
                   break;
               }
           }
       }
       
       subcellPath.push(borderSy * SW + borderSx);
       subcellPath.push(nBorderSy * SW + nBorderSx);
    } else if (forward.length === 1) {
       let bestSx = cx * 4 + 2;
       let bestSy = cy * 4 + 2;
       if (!isSubcellNavPassable(world, bestSy * SW + bestSx)) {
         let found = false;
         for (let dy = 0; dy < 4 && !found; dy++) {
           for (let dx = 0; dx < 4 && !found; dx++) {
             const sx = cx * 4 + dx;
             const sy = cy * 4 + dy;
             if (isSubcellNavPassable(world, sy * SW + sx)) {
               bestSx = sx;
               bestSy = sy;
               found = true;
             }
           }
         }
       }
       subcellPath.push(bestSy * SW + bestSx);
    }
  }

  return subcellPath;
}

`;
replaceBlock(buildStart, buildEnd, newBuild);

fs.writeFileSync(path, code);
console.log("Border Path construction fixed!");
