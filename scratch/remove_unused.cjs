const fs = require('fs');
const path = '/Users/jirnyak/Mirror/gigahrush/src/systems/ai/pathfinding.ts';
let code = fs.readFileSync(path, 'utf8');

// The unused variables reported by TSC:
code = code.replace(/const BEHAVIOR_FLOW_FIELD_CACHE_MAX/g, "// const BEHAVIOR_FLOW_FIELD_CACHE_MAX");
code = code.replace(/const _navQueue = new Int32Array/g, "// const _navQueue = new Int32Array");
code = code.replace(/let _navHead1 = 0;/g, "// let _navHead1 = 0;");
code = code.replace(/let _navTail1 = 0;/g, "// let _navTail1 = 0;");
code = code.replace(/let _navHead2 = 0;/g, "// let _navHead2 = 0;");
code = code.replace(/let _navTail2 = 0;/g, "// let _navTail2 = 0;");
code = code.replace(/const _navBase1 = 0;/g, "// const _navBase1 = 0;");
code = code.replace(/const _navBase2 = NAV_QUEUE_HALF;/g, "// const _navBase2 = NAV_QUEUE_HALF;");
code = code.replace(/const _flowSourceScratch: number\[\] = \[\];/g, "// const _flowSourceScratch: number[] = [];");
code = code.replace(/let _flowFieldTouch = 0;/g, "// let _flowFieldTouch = 0;");
code = code.replace(/function isMacroCellPassable/g, "function isMacroCellPassable_unused");
code = code.replace(/function getSubcellNavCost/g, "function getSubcellNavCost_unused");
code = code.replace(/function checkFlowPassable/g, "function checkFlowPassable_unused");
code = code.replace(/const rootMask = getMacroMask\(world, root\);/g, "// const rootMask = getMacroMask(world, root);");
code = code.replace(/let align = false;/g, "// let align = false;");

fs.writeFileSync(path, code);
