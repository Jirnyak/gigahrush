const fs = require('fs');
const file = 'src/gen/registry_morgue/index.ts';
let content = fs.readFileSync(file, 'utf8');

const retuneCode = `
function retuneRegistryMorgueZones(world: World): void {
  for (let i = 0; i < world.zones.length; i++) {
    const zone = world.zones[i];
    if (!zone) continue;
    const coldRows = zone.cy >= 250 && zone.cy <= 790 && (zone.cy < 455 || zone.cy > 585) && zone.cx >= 60 && zone.cx <= 965;
    const registryCore = zone.cx >= 300 && zone.cx <= 725 && zone.cy >= 455 && zone.cy <= 585;
    if (coldRows) {
      zone.faction = ZoneFaction.SAMOSBOR;
      zone.level = Math.max(zone.level, 4);
    } else if (registryCore) {
      zone.faction = zone.id % 3 === 0 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
      zone.level = Math.max(zone.level, 3);
    }
  }
}
`;
if (!content.includes('retuneRegistryMorgueZones')) {
  content += '\n' + retuneCode;
  
  // Also call it in the hook inside the generator
  content = content.replace('reinforceRegistryMorgueAuthoredTerritory(world);', 'reinforceRegistryMorgueAuthoredTerritory(world);\n  retuneRegistryMorgueZones(world);');
  fs.writeFileSync(file, content);
}
console.log("Patched retuneRegistryMorgueZones");
