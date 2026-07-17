const fs = require('fs');
const file = '/Users/jirnyak/.gemini/antigravity-ide/brain/03bcdc9b-c0bd-49a9-9bde-0fe718eb264c/walkthrough.md';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/I am ready to proceed with the next-[\s\S]*?with the next!/, `I am ready to proceed with the next batch.

Completed Batches:
- **Batch 1:** roof, floor_69, moebius_podezd, communal_ring
- **Batch 2:** pioneer_camp, oranzhereya_betona, dark_metro, attractor_dvor
- **Batch 3:** production_belt, silicon_net_well, underhell, darkness
- **Batch 4:** chthonic_attic, antenna_court, raionsovet_archive, registry_morgue

Let me know if we should proceed with the next!`);

fs.writeFileSync(file, content);
console.log("Fixed walkthrough.md");
