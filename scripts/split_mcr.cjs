const fs = require('fs');

const file = 'src/gen/manhattan_crossroads/index.ts';
let content = fs.readFileSync(file, 'utf8');

// replace all "function " with "export function "
content = content.replace(/^function /gm, 'export function ');
content = content.replace(/^const /gm, 'export const ');
content = content.replace(/^type /gm, 'export type ');
content = content.replace(/^interface /gm, 'export interface ');
// some might be exported already, fix "export export"
content = content.replace(/^export export /gm, 'export ');

const lines = content.split('\n');

// imports are lines 1 to 35 roughly. Let's find the end of imports.
let importEnd = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export const MANHATTAN_CROSSROADS_SEED')) {
    importEnd = i;
    break;
  }
}

const imports = lines.slice(0, importEnd).join('\n');

let geomStart = 0, npcsStart = 0, carveStreetGridStart = 0, carveStreetGridEnd = 0, indexStart = 0;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('export function addLogicalRoom')) geomStart = i;
  if (lines[i].startsWith('export function spawnPlotNpc')) npcsStart = i;
  if (lines[i].startsWith('export function carveStreetGrid')) carveStreetGridStart = i;
  if (lines[i].startsWith('export function getManhattanCrossroadsDebugLines')) indexStart = i;
}
carveStreetGridEnd = indexStart;

const indexTop = lines.slice(importEnd, geomStart).join('\n');
const geomContent = lines.slice(geomStart, npcsStart).join('\n') + '\n' + lines.slice(carveStreetGridStart, carveStreetGridEnd).join('\n');
const npcsContent = lines.slice(npcsStart, carveStreetGridStart).join('\n');
const indexBottom = lines.slice(indexStart).join('\n');

// Find all exported identifiers in indexTop
const getExports = (text) => {
  const matches = [...text.matchAll(/export (?:const|function|type|interface) (\w+)/g)];
  return matches.map(m => m[1]);
};

const indexExports = getExports(indexTop + '\n' + indexBottom);
const geomExports = getExports(geomContent);
const npcsExports = getExports(npcsContent);

const geomFile = imports + '\n' + 
  `import { ${indexExports.join(', ')} } from './index';\n` + 
  `import { ${npcsExports.join(', ')} } from './npcs';\n\n` + 
  geomContent;

const npcsFile = imports + '\n' + 
  `import { ${indexExports.join(', ')} } from './index';\n` + 
  `import { ${geomExports.join(', ')} } from './geometry';\n\n` + 
  npcsContent;

const indexFile = imports + '\n' + 
  `import { ${geomExports.join(', ')} } from './geometry';\n` + 
  `import { ${npcsExports.join(', ')} } from './npcs';\n\n` + 
  indexTop + '\n\n' + indexBottom;

fs.writeFileSync('src/gen/manhattan_crossroads/geometry.ts', geomFile);
fs.writeFileSync('src/gen/manhattan_crossroads/npcs.ts', npcsFile);
fs.writeFileSync('src/gen/manhattan_crossroads/index.ts', indexFile);

console.log('Split complete!');
