import fs from 'fs';
import path from 'path';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const matches = [...content.matchAll(/spawnAmbientNpc\(\s*([\w,\s]+),\s*'([^']+)',\s*(Faction\.[A-Z_]+),\s*(Occupation\.[A-Z_]+),\s*([^,]+),\s*([^,]+),\s*(\[[^\]]*\])(?:,\s*'([^']+)')?\s*\);/g)];

  if (matches.length > 0) {
    let injectedDefs = '';
    let replacements = [];

    matches.forEach((match, index) => {
      const [fullText, argsPrefix, name, faction, occupation, x, y, inventoryStr, weaponStr] = match;
      const defId = `maintenance_ambient_${index}_${Math.random().toString(36).substring(2, 7)}`;
      const constName = `AMBIENT_NPC_${index}`;
      
      injectedDefs += `\nconst ${constName}: PlotNpcDef = {
  name: '${name}',
  isFemale: ${name.match(/[аяийь]$/i) && !name.match(/Мальчик|Пациент|Витя|Тимур|Леня|Женя|Ира Свидетель|Костыль|Семён|Лаборант|Санитар|Ликвидатор|Техник|Секретарь|Проверяющий|Администратор|Врач|Патрульный|Инга|Прилипло/i) ? 'true' : 'false'},
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
      // For maintenance, the argsPrefix is usually `ctx` (MaintGenCtx)
      // We will need to use requireSpawnedPlotNpcFromPackage(ctx.entities, ctx.nextId, ...)
      const prefixClean = argsPrefix.trim();
      let spawnCall = `requireSpawnedPlotNpcFromPackage(${prefixClean}.entities, ${prefixClean}.nextId, '${defId}', ${x.trim()} + 0.5, ${y.trim()} + 0.5, { angle: 0`;
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
    
    // Cleanup spawnAmbientNpc import
    if (content.includes('spawnAmbientNpc,') && !content.match(/spawnAmbientNpc\(/)) {
      content = content.replace(/spawnAmbientNpc,\s*/g, '');
    }

    fs.writeFileSync(filePath, content);
    console.log(`Refactored ${filePath}`);
  }
}

const dir = 'src/gen/maintenance';
fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.ts') && file !== 'content_helpers.ts') {
    processFile(path.join(dir, file));
  }
});
