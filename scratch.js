// 1. First, find a procedural NPC
const npc = world.entities.find(e => e.type === 2 && !getPlotNpcDef(e.id));
console.log("Procedural NPC:", npc);
console.log("A-Life record:", window.gameState.alife.npcs[npc.alifeId - 1]);
