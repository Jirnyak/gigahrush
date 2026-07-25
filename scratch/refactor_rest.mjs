import fs from 'fs';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const matches = [...content.matchAll(/spawnAmbientNpc\(([\w,\s]+),\s*'([^']+)',\s*(Faction\.[A-Z_]+),\s*(Occupation\.[A-Z_]+),\s*([^,]+),\s*([^,]+),\s*(\[[^\]]+\])(?:,\s*'([^']+)')?\);/g)];

  if (matches.length > 0) {
    let injectedDefs = '';
    let replacements = [];

    matches.forEach((match, index) => {
      const [fullText, argsPrefix, name, faction, occupation, x, y, inventoryStr, weaponStr] = match;
      const defId = `ambient_${index}_${Math.random().toString(36).substring(2, 7)}`;
      const constName = `AMBIENT_NPC_${index}`;
      
      injectedDefs += `\nconst ${constName}: PlotNpcDef = {
  name: '${name}',
  isFemale: ${name.match(/[аяийь]$/i) && !name.match(/Мальчик|Пациент|Витя|Тимур|Леня|Женя|Ира Свидетель|Костыль|Семён|Лаборант|Санитар|Ликвидатор|Техник|Секретарь|Проверяющий|Администратор|Врач/i) ? 'true' : 'false'},
  faction: ${faction},
  occupation: ${occupation},
  sprite: ${occupation},
  hp: 50, maxHp: 50, money: 5, speed: 0.9,
  inventory: ${inventoryStr},
  talkLines: ['Проходи.', 'Не мешай.'],
  talkLinesPost: ['...']
};
registerAuthoredNpc({ id: '${defId}', npc: ${constName} });\n`;
      // Replace
      // Since spawnSocialNpc might not be defined, let's just generate a spawnPlotNpc equivalent or see if they have it
      let spawnCall = `spawnSocialNpc(${argsPrefix}, ${constName}, '${defId}', ${x}, ${y}`;
      if (weaponStr) {
        spawnCall += `, { weapon: '${weaponStr}' }`;
      }
      spawnCall += `);`;
      
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
       content = content.replace(/(\nimport.*?;)+\n/, `$&import { type PlotNpcDef, registerAuthoredNpc } from '../../data/plot';\n${injectedDefs}`);
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`Refactored ${filePath}`);
  }
}

const files = [
  'src/gen/bolnichny_korpus/index.ts',
  'src/gen/silicon_net_well/npcs.ts',
  'src/gen/communal_ring/index.ts',
  'src/gen/turing_nursery/npcs.ts',
  'src/gen/slime_nii/index.ts',
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    processFile(f);
  } else {
    console.log('Not found: ' + f);
  }
});
