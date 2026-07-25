import fs from 'fs';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const matches = [...content.matchAll(/spawnAmbientNpc\((rng),\s*(entities),\s*(nextId),\s*'([^']+)',\s*([^,]+),\s*([^,]+),\s*(Faction\.[A-Z_]+),\s*(Occupation\.[A-Z_]+),\s*(\[[^\]]+\])(?:,\s*'([^']+)')?\);/g)];

  if (matches.length > 0) {
    let injectedDefs = '';
    let replacements = [];

    matches.forEach((match, index) => {
      const [fullText, rng, entities, nextId, name, x, y, faction, occupation, inventoryStr, weaponStr] = match;
      const defId = `manhattan_ambient_${index}_${Math.random().toString(36).substring(2, 7)}`;
      const constName = `AMBIENT_NPC_${index}`;
      
      injectedDefs += `\nconst ${constName}: PlotNpcDef = {
  name: '${name}',
  isFemale: ${name.match(/[аяийь]$/i) && !name.match(/Мальчик|Пациент|Витя|Тимур|Леня|Женя|Ира Свидетель|Костыль|Семён|Лаборант|Санитар|Ликвидатор|Техник|Секретарь|Проверяющий|Администратор|Врач|Патрульный/i) ? 'true' : 'false'},
  faction: ${faction},
  occupation: ${occupation},
  sprite: ${occupation},
  hp: 50, maxHp: 50, money: 5, speed: 0.9,
  inventory: ${inventoryStr},
  talkLines: ['...'],
  talkLinesPost: ['...']
};
registerAuthoredNpc({ id: '${defId}', npc: ${constName} });\n`;
      // Replace
      let spawnCall = `requireSpawnedPlotNpcFromPackage(${entities}, ${nextId}, '${defId}', ${x} + 0.5, ${y} + 0.5, { angle: 0`;
      if (weaponStr) {
        spawnCall += `, weapon: '${weaponStr}'`;
      }
      spawnCall += `});`;
      
      replacements.push({ old: fullText, new: spawnCall });
    });

    for (const r of replacements) {
      content = content.replace(r.old, r.new);
    }
    
    // Inject at the top
    const importMatch = content.match(/import.*?from '\.\.\/\.\.\/data\/plot';/);
    if (importMatch) {
      let replacementString = importMatch[0];
      if (!replacementString.includes('registerAuthoredNpc')) {
         replacementString = replacementString.replace('}', ', registerAuthoredNpc }');
      }
      content = content.replace(importMatch[0], replacementString + '\n' + injectedDefs);
    } else {
       // Just insert after imports
       content = content.replace(/(\nimport.*?;)+\n/, `$&import { type PlotNpcDef, registerAuthoredNpc } from '../../data/plot';\nimport { requireSpawnedPlotNpcFromPackage } from '../shared';\n${injectedDefs}`);
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`Refactored ${filePath}`);
  }
}

const files = [
  'src/gen/manhattan_crossroads/npcs.ts',
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    processFile(f);
  } else {
    console.log('Not found: ' + f);
  }
});
