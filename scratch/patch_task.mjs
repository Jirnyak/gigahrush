import fs from 'fs';
const path = '/Users/jirnyak/.gemini/antigravity-ide/brain/45df7e7c-acbd-4ffb-8b75-0dd351886c85/task.md';
let code = fs.readFileSync(path, 'utf8');

code = code.replace('- `[/]` Ensure Plot NPCs accurately map their `alifeId` when instantiated.', '- `[x]` Ensure Plot NPCs accurately map their `alifeId` when instantiated.\n- `[x]` Found and fixed missing `plotNpcId` in `AlifeReservedIdentityDef` which caused random A-Life generation instead of reservation.');
fs.writeFileSync(path, code);
