import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs';

const project = new Project({
  tsConfigFilePath: './tsconfig.json',
});

project.addSourceFilesAtPaths('src/gen/**/*.ts');

const sourceFiles = project.getSourceFiles();
const npcs = [];

for (const sourceFile of sourceFiles) {
  const filePath = sourceFile.getFilePath();
  
  const objectLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
  
  for (const obj of objectLiterals) {
    const propNames = obj.getProperties()
      .filter(p => p.isKind(SyntaxKind.PropertyAssignment))
      .map(p => p.getName());
      
    if (propNames.includes('talkLines') || propNames.includes('homeFloorKey') || propNames.includes('talkLinesPost') || propNames.includes('spawnRoomAlias')) {
      const nameProp = obj.getProperty('name');
      const factionProp = obj.getProperty('faction');
      const occupationProp = obj.getProperty('occupation');
      const levelProp = obj.getProperty('level');
      
      let name = nameProp?.getInitializer()?.getText() || 'Unknown';
      let faction = factionProp?.getInitializer()?.getText() || 'Unknown';
      let occupation = occupationProp?.getInitializer()?.getText() || 'Unknown';
      let level = levelProp?.getInitializer()?.getText() || undefined;
      
      npcs.push({
        file: filePath.split('src/gen/')[1],
        name,
        faction,
        occupation,
        level,
      });
    }
  }
}

fs.writeFileSync('scripts/npc_analysis.json', JSON.stringify(npcs, null, 2));
console.log(`Extracted ${npcs.length} NPCs.`);
