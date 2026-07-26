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

  return subcellPath;
}

`;
replaceBlock(buildStart, buildEnd, newBuild);

// Update calls to constructPathFromTree in buildBakedTreePath
code = code.replace(/constructPathFromTree\(bestTree, mStart, mEnd\)/g, "constructPathFromTree(bestTree, mStart, mEnd, world)");

fs.writeFileSync(path, code);
console.log("Path construction fixed!");
