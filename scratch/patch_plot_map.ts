import fs from 'fs';
let code = fs.readFileSync('src/systems/demos_social.ts', 'utf8');

code = code.replace(
  "    const plotNpcId = snapshot.plotNpcId;\n    if (plotNpcId !== undefined && !out.has(plotNpcId)) out.set(plotNpcId, id);",
  "    let plotNpcId = snapshot.plotNpcId;\n    if (plotNpcId === undefined && snapshot.reservedIdentityId?.startsWith('npc:')) {\n      plotNpcId = getPlotNpcNumericId(snapshot.reservedIdentityId.slice(4));\n    }\n    if (plotNpcId !== undefined && !out.has(plotNpcId)) out.set(plotNpcId, id);"
);

fs.writeFileSync('src/systems/demos_social.ts', code);
