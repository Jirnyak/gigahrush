import fs from 'fs';
import path from 'path';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const matches = [...content.matchAll(/spawnAmbientNpc\(([\w,\s]+),\s*'([^']+)',\s*(Faction\.[A-Z_]+),\s*(Occupation\.[A-Z_]+),\s*([^,]+),\s*([^,]+),\s*(\[[^\]]+\])(?:,\s*'([^']+)')?\);/g)];

  if (matches.length > 0) {
    let injectedDefs = '';
    let replacements = [];

    matches.forEach((match, index) => {
      const [fullText, argsPrefix, name, faction, occupation, x, y, inventoryStr, weaponStr] = match;
      const defId = `kv_ambient_${index}_${Math.random().toString(36).substring(2, 7)}`;
      const constName = `AMBIENT_NPC_${index}`;
      
      injectedDefs += `\nconst ${constName}: PlotNpcDef = {
  name: '${name}',
  isFemale: ${name.match(/[аяийь]$/i) && !name.match(/Мальчик|Пациент|Витя|Тимур|Леня|Женя|Ира Свидетель|Костыль|Семён/i) ? 'true' : 'false'},
  faction: ${faction},
  occupation: ${occupation},
  sprite: ${occupation},
  hp: 50, maxHp: 50, money: 5, speed: 0.9,
  inventory: ${inventoryStr},
};
registerAuthoredNpc({ id: '${defId}', npc: ${constName} });\n`;
      // Replace
      let spawnCall = `spawnSocialNpc(${argsPrefix}, ${constName}, '${defId}', ${x}, ${y}`;
      if (weaponStr) {
        spawnCall += `, { weapon: '${weaponStr}' }`;
      }
      spawnCall += `);`;
      
      replacements.push({ old: fullText, new: spawnCall });
    });

    // Replace the calls
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
  'src/gen/kvartiry/barricade.ts',
  'src/gen/kvartiry/cult_supply_kitchen.ts',
  'src/gen/kvartiry/water_riot.ts',
  'src/gen/kvartiry/lost_child_corner.ts',
  'src/gen/kvartiry/kv08_route_assembly.ts',
  'src/gen/kvartiry/print_room.ts',
  'src/gen/kvartiry/chernobozhiy_svod.ts',
  'src/gen/kvartiry/medicine_swap.ts',
  'src/gen/kvartiry/ration_queue.ts',
  'src/gen/kvartiry/communal_kitchen_feud.ts',
  'src/gen/kvartiry/ammo_smelter.ts',
  'src/gen/kvartiry/false_neighbor.ts',
  'src/gen/kvartiry/ocherednik.ts'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    processFile(f);
  } else {
    console.log('Not found: ' + f);
  }
});
