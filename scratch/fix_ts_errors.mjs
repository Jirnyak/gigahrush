import fs from 'fs';
import path from 'path';

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
    let content = fs.readFileSync(f, 'utf8');
    let changed = false;

    // Add talkLines and talkLinesPost to injected PlotNpcDefs
    if (content.includes('hp: 50, maxHp: 50, money: 5, speed: 0.9,')) {
      content = content.replace(/inventory: (\[[^\]]+\]|\[\]),(\s*)\};/g, `inventory: $1,$2talkLines: ['Проходи своей дорогой.', 'Мне не до разговоров.'],$2talkLinesPost: ['...'],$2};`);
      changed = true;
    }

    // Remove unused spawnAmbientNpc import
    if (content.includes('spawnAmbientNpc,') && !content.match(/spawnAmbientNpc\(/)) {
      content = content.replace(/spawnAmbientNpc,\s*/g, '');
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(f, content);
      console.log('Fixed TS errors in ' + f);
    }
  }
});
