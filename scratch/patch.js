const fs = require('fs');
let code = fs.readFileSync('src/systems/demos_social.ts', 'utf8');

const dumpCode = `
  // DUMP OLGA AND BARNI
  const npcs = state.alife.npcs;
  const searchIds = [4, 5];
  const targets = npcs.filter(n => (n.plotNpcId && searchIds.includes(n.plotNpcId)));
  console.log("=== AUTO DUMP ===");
  targets.forEach(npc => {
    const alifeId = npc.id;
    console.log("[ID: " + alifeId + "] plotId=" + npc.plotNpcId);
    console.log("graph.initialized: " + graph.initialized[alifeId]);
    for (let slot = 1; slot < 10; slot++) {
      const offset = (alifeId - 1) * 10 + slot;
      const tId = graph.targets[offset];
      const rel = graph.relations[offset];
      if (tId !== 0) console.log("  Slot " + slot + ": targetId=" + tId + ", rel=" + rel);
    }
  });
  console.log("=================");
`;

code = code.replace(
  "return graph;\n}",
  dumpCode + "\n  return graph;\n}"
);

fs.writeFileSync('src/systems/demos_social.ts', code);
