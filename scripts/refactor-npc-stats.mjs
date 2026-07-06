import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: './tsconfig.json',
});

// Add all TS files in src
project.addSourceFilesAtPaths('src/**/*.ts');

const sourceFiles = project.getSourceFiles();

let modifiedFiles = 0;

for (const sourceFile of sourceFiles) {
  let fileModified = false;
  
  // Find all Object Literal Expressions
  const objectLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
  
  for (const obj of objectLiterals) {
    // Check if this object looks like a PlotNpcDef
    const propNames = obj.getProperties()
      .filter(p => p.isKind(SyntaxKind.PropertyAssignment))
      .map(p => p.getName());
      
    // It's a PlotNpcDef if it has `talkLines` or `homeFloorKey`
    if (propNames.includes('talkLines') || propNames.includes('homeFloorKey') || propNames.includes('talkLinesPost') || propNames.includes('spawnRoomAlias')) {
      const hpProp = obj.getProperty('hp');
      const maxHpProp = obj.getProperty('maxHp');
      const speedProp = obj.getProperty('speed');
      
      if (hpProp) {
        hpProp.remove();
        fileModified = true;
      }
      if (maxHpProp) {
        maxHpProp.remove();
        fileModified = true;
      }
      if (speedProp) {
        speedProp.remove();
        fileModified = true;
      }
    }
  }

  // Also catch variable declarations typed as PlotNpcDef directly, just in case
  const varDecls = sourceFile.getVariableDeclarations();
  for (const decl of varDecls) {
    const typeNode = decl.getTypeNode();
    if (typeNode && typeNode.getText() === 'PlotNpcDef') {
      const init = decl.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
      if (init) {
        const hpProp = init.getProperty('hp');
        const maxHpProp = init.getProperty('maxHp');
        const speedProp = init.getProperty('speed');
        if (hpProp) { hpProp.remove(); fileModified = true; }
        if (maxHpProp) { maxHpProp.remove(); fileModified = true; }
        if (speedProp) { speedProp.remove(); fileModified = true; }
      }
    }
  }

  if (fileModified) {
    sourceFile.saveSync();
    modifiedFiles++;
  }
}

console.log(`Successfully updated ${modifiedFiles} files.`);
