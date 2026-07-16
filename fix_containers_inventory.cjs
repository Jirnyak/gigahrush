const fs = require('fs');
let code = fs.readFileSync('src/systems/containers.ts', 'utf8');
code = code.replace(/inventory: seedInventory\(kind, room.id, z\),/g, "inventory: seedInventory(kind, room.id, 10),");
fs.writeFileSync('src/systems/containers.ts', code, 'utf8');
