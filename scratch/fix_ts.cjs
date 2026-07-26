const fs = require('fs');
const path = '/Users/jirnyak/Mirror/gigahrush/src/systems/ai/pathfinding.ts';
let code = fs.readFileSync(path, 'utf8');

// Fix 'any' type in passable
code = code.replace(/const passable = \(x, y\)/g, "const passable = (x: number, y: number)");

// Add missing functions before getMacroParent
const missingFuncs = `
function ensureNavigationTree(world: World): void {
  if (_navWorld === world) {
    _pathCacheHits++;
    return;
  }
  bakeNavigationTree(world, world.cellVersion, world.pathBlockerVersion);
}

function flowFieldValid(field: BehaviorFlowField, world: World): boolean {
  return field.world === world && field.roomCount === navigationCacheRoomCount(world);
}

function ensureBehaviorFlowField(
  world: World,
  key: string,
  sourceProvider: BehaviorFlowFieldSourceProvider,
): BehaviorFlowField | null {
  const cached = _behaviorFlowFields.get(key);
  if (cached && flowFieldValid(cached, world)) {
    cached.lastUsed = ++_flowFieldTouch;
    _pathCacheHits++;
    return cached;
  }
  const sources = sourceProvider();
  if (sources.length === 0) return null;
  return bakeBehaviorFlowField(world, key, sources);
}

`;

code = code.replace(/function getMacroParent\(/, missingFuncs + "function getMacroParent(");

fs.writeFileSync(path, code);
console.log("Fixed functions.");
