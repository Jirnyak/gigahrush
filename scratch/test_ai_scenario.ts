import { World } from '../src/core/world';
import { Cell, W, EntityType, AIGoal, type Entity, MonsterKind, Faction, type GameState, type Msg } from '../src/core/types';
import { setPathContext } from '../src/systems/ai/pathfinding';
import { clearPathBlockersAtCell } from '../src/core/path_blockers';
import { MONSTERS } from '../src/entities/monster';
import { randomRPG } from '../src/systems/rpg';
import { updateMonster } from '../src/systems/ai/monster';
import { updateNPC } from '../src/systems/ai/npc_fsm';

function createNPC(id: number, x: number, y: number): Entity {
  return {
    id, type: EntityType.NPC,
    x, y, angle: 0, pitch: 0, speed: 2, alive: true,
    radius: 0.18, hp: 100, maxHp: 100,
    faction: Faction.NEUTRAL,
    rpg: randomRPG(1),
    inventory: [],
    needs: { sleep: 1, hunger: 1, thirst: 1, bladder: 1, stress: 0, dirt: 0 },
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 }
  } as unknown as Entity;
}

function createMonster(id: number, x: number, y: number, kind: MonsterKind = MonsterKind.SBORKA): Entity {
  const def = MONSTERS[kind]!;
  return {
    id, type: EntityType.MONSTER,
    x, y, angle: 0, pitch: 0, speed: def.speed, alive: true, sprite: def.sprite,
    radius: def.radius || 0.18, hp: Math.max(1, def.hp), maxHp: Math.max(1, def.hp),
    monsterKind: kind, faction: Faction.MONSTERS,
    rpg: randomRPG(1),
    inventory: [],
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 }
  } as unknown as Entity;
}

function runScenario() {
  console.log("=== Scenario: NPC moving to distant point, encountering Monster ===");
  
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  setPathContext([], 0);
  for (let i = 0; i < W*W; i++) clearPathBlockersAtCell(world, i);
  
  const state = { clock: { totalMinutes: 0 }, msgLog: [], msgs: [] } as unknown as GameState; // Mock state if needed
  const msgs: Msg[] = [];
  const nextId = { v: 100 };
  
  const entities: Entity[] = [];
  
  // NPC starts at 5, 5. Wants to go to 15, 5.
  const npc = createNPC(1, 5.5, 5.5);
  // Manually force NPC to pathfind to 15, 5
  npc.ai!.goal = AIGoal.WANDER;
  npc.ai!.tx = 15.5;
  npc.ai!.ty = 5.5;
  entities.push(npc);
  
  // Monster placed in the middle at 10, 5
  const monster = createMonster(2, 10.5, 5.5);
  entities.push(monster);
  
  // Mock player id to 0 (non-existent)
  const playerId = 0;
  
  let time = 0;
  let encountered = false;
  
  for (let i = 0; i < 300; i++) {
    time += 0.016;
    
    // Update AI for both
    updateNPC(world, entities, npc, 0.016, time, msgs, state, playerId);
    updateMonster(world, entities, monster, 0.016, time, msgs, playerId, nextId, state);
    
    if (!encountered && npc.ai!.goal === AIGoal.FLEE) {
      console.log(`[Frame ${i}] NPC spotted the monster and started fleeing! (NPC at ${npc.x.toFixed(2)}, ${npc.y.toFixed(2)})`);
      encountered = true;
    }
    if (monster.ai!.goal === AIGoal.COMBAT && monster.ai!.targetId === npc.id) {
      if (i % 50 === 0) {
        console.log(`[Frame ${i}] Monster is attacking/chasing NPC! (Monster at ${monster.x.toFixed(2)}, ${monster.y.toFixed(2)})`);
      }
    }
  }
  
  console.log(`\nEnd of simulation:`);
  console.log(`NPC: x=${npc.x.toFixed(2)}, y=${npc.y.toFixed(2)}, goal=${AIGoal[npc.ai!.goal]}, HP=${npc.hp}`);
  console.log(`Monster: x=${monster.x.toFixed(2)}, y=${monster.y.toFixed(2)}, goal=${AIGoal[monster.ai!.goal]}`);
}

runScenario();
