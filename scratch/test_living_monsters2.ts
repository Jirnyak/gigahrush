import { generateWorld } from '../src/gen/living/index.js';
import { EntityType } from '../src/core/types.js';

const { world, entities } = generateWorld(1234, true); // isTutorial = true
const monsters = entities.filter(e => e.type === EntityType.MONSTER);
const npcs = entities.filter(e => e.type === EntityType.NPC);
const wild = npcs.filter(e => e.faction === 2); // Faction.WILD = 2 

console.log('Monsters:', monsters.length);
console.log('NPCs:', npcs.length);
console.log('Wild NPCs:', wild.length);
