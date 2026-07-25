import fs from 'fs';
const path = 'src/data/alife_population_plan.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /export interface AlifeReservedIdentityDef \{/,
  "export interface AlifeReservedIdentityDef {\n  plotNpcId?: number;"
);

fs.writeFileSync(path, code);
