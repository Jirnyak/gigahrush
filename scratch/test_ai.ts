import { World } from '../src/core/world';
import { Cell, W, EntityType, AIGoal, type Entity, MonsterKind, Faction } from '../src/core/types';
import { followPath, tryAssignPathToCell, setPathContext } from '../src/systems/ai/pathfinding';
import { clearPathBlockersAtCell } from '../src/core/path_blockers';
import { MONSTERS } from '../src/entities/monster';
import { randomRPG } from '../src/systems/rpg';

function createMonster(world: World, entities: Entity[], id: number, x: number, y: number, kind: MonsterKind = MonsterKind.SBORKA): Entity {
  const def = MONSTERS[kind]!;
  const hp = Math.max(1, def.hp);
  const m = {
    id,
    type: EntityType.MONSTER,
    x, y,
    angle: 0, pitch: 0, speed: def.speed, alive: true, sprite: def.sprite,
    radius: def.radius || 0.18,
    hp, maxHp: hp,
    monsterKind: kind,
    rpg: randomRPG(1),
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 }
  };
  entities.push(m);
  return m;
}

function runSimulation(name: string, setup: (w: World, e: Entity[]) => void, frames: number, targetEntityIdx: number, expectedDx: number, expectedDy: number) {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  setPathContext([], 0);
  for (let i = 0; i < W*W; i++) clearPathBlockersAtCell(world, i);
  const entities: Entity[] = [];
  
  setup(world, entities);
  const target = entities[targetEntityIdx];
  const startX = target.x;
  const startY = target.y;

  let stuckCount = 0;
  for (let i = 0; i < frames; i++) {
    for (const e of entities) {
      if (e.ai && e.ai.path.length > 0) {
        followPath(world, e, 0.016);
        if (e.ai.stuck > 0) stuckCount++;
      }
    }
  }

  const dx = Math.abs((target.x - startX) - expectedDx);
  const dy = Math.abs((target.y - startY) - expectedDy);
  
  console.log(`[TEST] ${name}`);
  console.log(`  - Moved: X: ${(target.x - startX).toFixed(2)}, Y: ${(target.y - startY).toFixed(2)}`);
  console.log(`  - Stuck frames: ${stuckCount}`);
  if (dx < 0.5 && dy < 0.5) {
    console.log(`  - STATUS: OK`);
  } else {
    console.log(`  - STATUS: FAIL (Expected dX=${expectedDx}, dY=${expectedDy})`);
  }
}

// Scenarios

runSimulation('1. Tangential Wall (The Corner Bug)', (world, entities) => {
  // A straight wall that the monster grazes to go horizontally
  world.cells[5*W + 5] = Cell.WALL;
  world.cells[5*W + 6] = Cell.WALL;
  world.cells[6*W + 5] = Cell.WALL;
  world.cells[6*W + 6] = Cell.WALL;
  
  const m = createMonster(world, entities, 1, 4.5, 7.5);
  tryAssignPathToCell(world, m, 6.5, 4.5);
}, 300, 0, 2, -3);

runSimulation('2. Narrow Corridor', (world, entities) => {
  // Corridor at Y=10, from X=5 to X=15
  for (let i = 5; i < 15; i++) {
    world.cells[9*W + i] = Cell.WALL;
    world.cells[11*W + i] = Cell.WALL;
  }
  const m = createMonster(world, entities, 1, 6, 10.5);
  tryAssignPathToCell(world, m, 14, 10.5);
}, 300, 0, 8, 0);

runSimulation('3. Open Space Diagonal Intention', (world, entities) => {
  const m = createMonster(world, entities, 1, 5.5, 5.5);
  tryAssignPathToCell(world, m, 10.5, 10.5); 
}, 300, 0, 5, 5);

runSimulation('4. Unreachable Target (Dead End)', (world, entities) => {
  // Wall box around the target
  world.cells[5*W + 5] = Cell.WALL;
  world.cells[5*W + 6] = Cell.WALL;
  world.cells[5*W + 7] = Cell.WALL;
  world.cells[6*W + 5] = Cell.WALL;
  world.cells[6*W + 7] = Cell.WALL;
  world.cells[7*W + 5] = Cell.WALL;
  world.cells[7*W + 6] = Cell.WALL;
  world.cells[7*W + 7] = Cell.WALL;

  const m = createMonster(world, entities, 1, 2.5, 2.5);
  tryAssignPathToCell(world, m, 6.5, 6.5);
}, 100, 0, 0, 0);
