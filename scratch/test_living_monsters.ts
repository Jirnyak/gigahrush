import { generateWorld } from '../src/gen/living/index.js';
import { EntityType } from '../src/core/types.js';

const { world, entities } = generateWorld(1234, false); // isTutorial = false
const monsters = entities.filter(e => e.type === EntityType.MONSTER);
const npcs = entities.filter(e => e.type === EntityType.NPC);
const wild = npcs.filter(e => e.faction === 2); // Faction.WILD = 2 (wait, let me check Faction.WILD)

console.log('Monsters:', monsters.length);
console.log('NPCs:', npcs.length);
console.log('Wild NPCs:', wild.length);
