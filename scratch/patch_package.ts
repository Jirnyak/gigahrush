import fs from 'fs';
let code = fs.readFileSync('src/systems/demos_social.ts', 'utf8');

code = code.replace(
  "  const pack = getPlotNpcPackageByNumericId(source.plotNpcId ?? -1);",
  "  const plotNpcId = source.plotNpcId ?? (source.reservedIdentityId?.startsWith('npc:') ? getPlotNpcNumericId(source.reservedIdentityId.slice(4)) : undefined);\n  const pack = getPlotNpcPackageByNumericId(plotNpcId ?? -1);"
);

fs.writeFileSync('src/systems/demos_social.ts', code);
