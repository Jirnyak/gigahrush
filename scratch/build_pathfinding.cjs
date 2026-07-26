const fs = require('fs');

const path = '/Users/jirnyak/Mirror/gigahrush/src/systems/ai/pathfinding.ts';
let code = fs.readFileSync(path, 'utf8');

// I will just use standard tools or AST, wait, rewriting by string replacement is safer if I know the exact boundaries.
