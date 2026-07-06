import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: './tsconfig.json',
});

project.addSourceFilesAtPaths('src/gen/**/*.ts');

const sourceFiles = project.getSourceFiles();
let filesModified = 0;
let npcsUpdated = 0;

for (const sourceFile of sourceFiles) {
  const filePath = sourceFile.getFilePath();
  let fileChanged = false;
  
  let locationBonus = 0;
  if (filePath.includes('/maintenance/')) locationBonus = 4;
  else if (filePath.includes('/hell/')) locationBonus = 9;
  else if (filePath.includes('/void/')) locationBonus = 15;
  
  const objectLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
  
  for (const obj of objectLiterals) {
    const propNames = obj.getProperties()
      .filter(p => p.isKind(SyntaxKind.PropertyAssignment))
      .map(p => p.getName());
      
    // ONLY match exactly PlotNpcDef. Entity does NOT have talkLines. AlifeNpcOverride does NOT have talkLines.
    if (propNames.includes('name') && propNames.includes('faction') && propNames.includes('occupation') && propNames.includes('money') && propNames.includes('talkLines')) {
      const nameProp = obj.getProperty('name');
      const factionProp = obj.getProperty('faction');
      const occupationProp = obj.getProperty('occupation');
      const levelProp = obj.getProperty('level');
      
      const hpProp = obj.getProperty('hp');
      const maxHpProp = obj.getProperty('maxHp');
      const speedProp = obj.getProperty('speed');
      
      let isBossOrAuthored = false;
      if (levelProp) {
        const val = levelProp.getInitializer()?.getText();
        if (val && val !== '1') {
          isBossOrAuthored = true;
        }
      }
      
      let factionStr = factionProp?.getInitializer()?.getText() || '';
      let occupationStr = occupationProp?.getInitializer()?.getText() || '';
      
      let factionBonus = 0;
      if (factionStr.includes('BANDIT') || factionStr.includes('WILD')) factionBonus = 1;
      else if (factionStr.includes('LIQUIDATOR') || factionStr.includes('CULTIST') || factionStr.includes('MONSTER')) factionBonus = 2;
      else if (factionStr.includes('MILITARY')) factionBonus = 4;
      
      let occupationBonus = 0;
      if (occupationStr.includes('SCIENTIST') || occupationStr.includes('TECHNICIAN') || occupationStr.includes('MECHANIC')) occupationBonus = 1;
      else if (occupationStr.includes('THUG') || occupationStr.includes('BANDIT') || occupationStr.includes('CULTIST')) occupationBonus = 2;
      else if (occupationStr.includes('HUNTER') || occupationStr.includes('GUARD') || occupationStr.includes('SOLDIER')) occupationBonus = 3;
      else if (occupationStr.includes('LEADER') || occupationStr.includes('BOSS')) occupationBonus = 5;
      
      const newLevel = 1 + locationBonus + factionBonus + occupationBonus;
      
      if (!isBossOrAuthored) {
        if (levelProp) {
          levelProp.setInitializer(newLevel.toString());
        } else {
          const props = obj.getProperties();
          let insertIndex = props.length;
          for (let i = 0; i < props.length; i++) {
              const pName = props[i].isKind(SyntaxKind.PropertyAssignment) ? props[i].getName() : '';
              if (pName === 'money' || pName === 'inventory' || pName === 'talkLines') {
                  insertIndex = i;
                  break;
              }
          }
          obj.insertPropertyAssignment(insertIndex, {
              name: 'level',
              initializer: newLevel.toString()
          });
        }
      }
      
      if (hpProp) hpProp.remove();
      if (maxHpProp) maxHpProp.remove();
      if (speedProp) speedProp.remove();
      
      fileChanged = true;
      npcsUpdated++;
    }
  }
  
  if (fileChanged) {
    sourceFile.saveSync();
    filesModified++;
  }
}

console.log(`Updated ${npcsUpdated} NPCs in ${filesModified} files.`);
