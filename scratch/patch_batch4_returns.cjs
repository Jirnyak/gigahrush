const fs = require('fs');

const floors = [
  { id: 'chthonic_attic', z: 46, func: 'generateChthonicAtticDesignFloor' },
  { id: 'antenna_court', z: 42, func: 'generateAntennaCourtDesignFloor' }
];

for (const floor of floors) {
  const file = `src/gen/${floor.id}/index.ts`;
  let content = fs.readFileSync(file, 'utf8');

  if (!content.includes('applyDesignFloorPopulationField')) {
    content = "import { applyDesignFloorPopulationField } from '../design_floors/population';\n" + content;
  }
  
  // Find where the generator function starts
  const funcStart = content.indexOf(`export function ${floor.func}`);
  if (funcStart === -1) {
    console.log(`Could not find ${floor.func} in ${floor.id}`);
    continue;
  }
  
  // Find the return statement inside this function
  const returnStart = content.indexOf('return {', funcStart);
  let braceCount = 0;
  let returnEnd = -1;
  for (let i = returnStart + 'return {'.length - 1; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        returnEnd = content.indexOf(';', i);
        if (returnEnd === -1 || returnEnd > i + 10) returnEnd = i;
        break;
      }
    }
  }
  
  if (returnEnd !== -1) {
    const originalReturn = content.substring(returnStart, returnEnd + 1);
    const replacement = originalReturn.replace('return {', 'const generation = {');
    const newReturn = `  ${replacement}
  applyDesignFloorPopulationField(generation as any, { id: '${floor.id}', z: ${floor.z} } as any);
  return { ...generation, isDecentralized: true } as any;`;
    
    content = content.substring(0, returnStart) + newReturn + content.substring(returnEnd + 1);
    fs.writeFileSync(file, content);
    console.log(`Patched ${floor.id}`);
  } else {
    console.log(`Could not parse return in ${floor.id}`);
  }
}
