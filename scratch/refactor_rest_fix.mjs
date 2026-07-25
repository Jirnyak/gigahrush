import fs from 'fs';

const files = [
  'src/gen/bolnichny_korpus/index.ts',
  'src/gen/silicon_net_well/npcs.ts',
  'src/gen/communal_ring/index.ts',
  'src/gen/turing_nursery/npcs.ts',
  'src/gen/slime_nii/index.ts',
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    let changed = false;

    if (content.includes('spawnSocialNpc(')) {
       content = content.replace(/spawnSocialNpc\(([\w,\s]+),\s*AMBIENT_NPC_\d+,\s*'([^']+)',\s*([^,]+),\s*([^,\)]+)(?:,\s*\{\s*weapon:\s*'([^']+)'\s*\})?\s*\);/g, (match, prefix, id, x, y, weapon) => {
          let call = `requireSpawnedPlotNpcFromPackage(${prefix}, '${id}', ${x} + 0.5, ${y} + 0.5, { angle: 0`;
          if (weapon) {
             call += `, weapon: '${weapon}'`;
          }
          call += `});`;
          return call;
       });
       
       if (!content.includes('requireSpawnedPlotNpcFromPackage')) {
           content = content.replace(/(\nimport.*?;)+\n/, `$&import { requireSpawnedPlotNpcFromPackage } from '../shared';\n`);
       }
       changed = true;
    }

    if (content.includes('spawnAmbientNpc,') && !content.match(/spawnAmbientNpc\(/)) {
      content = content.replace(/spawnAmbientNpc,\s*/g, '');
      changed = true;
    }
    
    // Sometimes it's function spawnAmbientNpc( ... )
    if (content.match(/function spawnAmbientNpc\(/)) {
       // if we don't call it anywhere, we should remove the function definition or ignore it
       // for now let's just let TS complain and we can manually delete them
    }

    if (changed) {
      fs.writeFileSync(f, content);
      console.log('Fixed TS errors in ' + f);
    }
  }
});
