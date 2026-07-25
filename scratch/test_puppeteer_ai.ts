import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173/arena.html', { waitUntil: 'networkidle2' });
  
  const result = await page.evaluate(async () => {
    const w = (window as any).__gigahrushWorld();
    const entities = (window as any).__gigahrushEntities();
    const state = (window as any).__gigahrushState();
    
    // Clear entities
    entities.length = 0;
    
    const applyMapEditorOp = (window as any).__gigahrushApplyMapEditorOp;
    const EntityType = (window as any).__gigahrushEntityType;
    const AIGoal = (window as any).__gigahrushAIGoal;
    
    // Spawn NPC at 5,5
    applyMapEditorOp(w, entities, { type: 'spawn', entityType: EntityType.NPC, npcKind: 'stalker', x: 5.5, y: 5.5, angle: 0 });
    const npc = entities[entities.length - 1];
    npc.ai.goal = AIGoal.WANDER;
    npc.ai.tx = 15.5;
    npc.ai.ty = 5.5;
    
    // Spawn Monster at 10,5
    applyMapEditorOp(w, entities, { type: 'spawn', entityType: EntityType.MONSTER, monsterKind: 'sborka', x: 10.5, y: 5.5, angle: 0 });
    const monster = entities[entities.length - 1];
    
    const updateNPC = (window as any).__gigahrushUpdateNPC;
    const updateMonster = (window as any).__gigahrushUpdateMonster;
    
    let logs = [];
    let encountered = false;
    let time = 0;
    
    for (let i = 0; i < 300; i++) {
      time += 0.016;
      updateNPC(w, entities, npc, 0.016, time, state.msgs, state, 0);
      updateMonster(w, entities, monster, 0.016, time, state.msgs, 0, state.nextId, state);
      
      if (!encountered && npc.ai.goal === AIGoal.FLEE) {
        logs.push(`[Frame ${i}] NPC spotted the monster and started fleeing! (NPC at ${npc.x.toFixed(2)}, ${npc.y.toFixed(2)})`);
        encountered = true;
      }
      if (monster.ai.goal === AIGoal.COMBAT && monster.ai.targetId === npc.id) {
        if (i % 50 === 0) {
          logs.push(`[Frame ${i}] Monster is attacking/chasing NPC! (Monster at ${monster.x.toFixed(2)}, ${monster.y.toFixed(2)})`);
        }
      }
    }
    
    return {
      logs,
      npc: { x: npc.x, y: npc.y, goal: npc.ai.goal, hp: npc.hp },
      monster: { x: monster.x, y: monster.y, goal: monster.ai.goal, hp: monster.hp }
    };
  });
  
  console.log("=== Scenario: NPC moving to distant point, encountering Monster ===");
  console.log(result.logs.join('\n'));
  console.log(`\nEnd of simulation:`);
  console.log(`NPC: x=${result.npc.x.toFixed(2)}, y=${result.npc.y.toFixed(2)}, goal=${result.npc.goal}, HP=${result.npc.hp}`);
  console.log(`Monster: x=${result.monster.x.toFixed(2)}, y=${result.monster.y.toFixed(2)}, goal=${result.monster.goal}, HP=${result.monster.hp}`);
  
  await browser.close();
})();
