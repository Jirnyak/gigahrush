const fs = require('fs');

const part1 = fs.readFileSync('scratch/ai_pathfinding_part1.ts', 'utf8');

const code = `
export function updateAiPath(world: World, e: Entity, targetX: number, targetY: number): PathSteering | null {
  const ai = e.ai!;
  const start = subcellIdx(e.x, e.y);
  const target = subcellIdx(targetX, targetY);

  if (start === target) {
    _steeringPathAssignments.delete(e);
    return null;
  }

  let assignment = _steeringPathAssignments.get(e);
  if (!assignment || assignment.world !== world || assignment.cellVersion !== world.cellVersion || assignment.pathBlockerVersion !== world.pathBlockerVersion || assignment.target !== target || assignment.pi >= assignment.path.length) {
    const status = tryAssignPathToCell(world, e, targetX, targetY);
    if (status === 'not_found') {
      _steeringPathAssignments.delete(e);
      return null;
    }
    assignment = _steeringPathAssignments.get(e);
  }

  if (!assignment) return null;

  while (assignment.pi < assignment.path.length) {
    const cell = assignment.path[assignment.pi];
    const [cx, cy] = subcellToWorld(cell);
    if (world.dist(e.x, e.y, cx, cy) >= 0.3) break;
    assignment.pi++;
  }

  if (assignment.pi >= assignment.path.length) {
    const status = tryAssignPathToCell(world, e, targetX, targetY);
    if (status === 'not_found') {
      _steeringPathAssignments.delete(e);
      return null;
    }
    assignment = _steeringPathAssignments.get(e)!;
  }

  const nextCell = assignment.path[assignment.pi];
  const cx = nextCell % W;
  const cy = (nextCell / W) | 0;
  const mCell = subcellToCell(nextCell);
  
  // Actually we need the door opener from old logic, let's keep it simple
  // door opening is done locally
  if (world.cells[mCell] === Cell.DOOR) {
      const door = world.doors.get(mCell);
      if (door && door.state === DoorState.CLOSED) {
          setDoorState(world, mCell, door, DoorState.OPEN);
      }
  }

  const [nextX, nextY] = subcellToWorld(nextCell);
  const dx = world.delta(e.x, nextX);
  const dy = world.delta(e.y, nextY);
  const stepDistance = Math.sqrt(dx * dx + dy * dy);
  if (stepDistance < 0.01) return null;
  return {
    x: dx / stepDistance,
    y: dy / stepDistance,
    nextCell,
    distance: stepDistance,
    targetCell: target
  };
}

function wrapFloat(v: number): number {
  return ((v % W) + W) % W;
}

export function followPath(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  let assignment = _steeringPathAssignments.get(e);
  
  if (!assignment || assignment.pi >= assignment.path.length) {
    if (ai.path && ai.path.length > 0) { // Keep old api fallback
        ai.path = [];
    }
    if (ai.tx !== undefined && ai.ty !== undefined) {
      const current = world.idx(Math.floor(e.x), Math.floor(e.y));
      const destination = world.idx(Math.floor(ai.tx), Math.floor(ai.ty));
      ai.stuck = 0;
      
      if (current !== destination) {
        // Just rely on the AI system to call tryAssignPathToCell or gotoNearestRoomType
      } else {
        if (e.type === EntityType.NPC && ai.goal === AIGoal.WORK) {
          emitMarkovBark(e, _barkMsgs, _barkTime, 'ambient', 'Пришли.', BARK_CHANCE_ARRIVE, '#aac');
        }
      }
    }
    
    if (e.type === EntityType.NPC && ai.goal !== AIGoal.HIDE && ai.goal !== AIGoal.FLEE) {
      ai.stuck += dt;
      if (ai.stuck > 3 + rng() * 2) {
        wanderInRoom(world, e);
        assignment = _steeringPathAssignments.get(e);
        if (!assignment || assignment.path.length === 0) wanderNearby(world, e);
        ai.stuck = 0;
      }
    }
    return;
  }

  while (assignment.pi < assignment.path.length) {
    const [cx, cy] = subcellToWorld(assignment.path[assignment.pi]);
    if (world.dist2(e.x, e.y, cx, cy) >= PATH_WAYPOINT_REACH_SQ) break;
    assignment.pi++;
    ai.stuck = 0;
  }
  
  if (assignment.pi >= assignment.path.length) return;

  // No complex string pulling needed if macro fields are very direct! 
  // Let's just go to the next subcell.
  let targetSubcell = assignment.path[assignment.pi];

  // Open door
  const mCell = subcellToCell(targetSubcell);
  if (world.cells[mCell] === Cell.DOOR) {
      const door = world.doors.get(mCell);
      if (door && door.state === DoorState.CLOSED) {
          setDoorState(world, mCell, door, DoorState.OPEN);
      }
  }

  const [tx, ty] = subcellToWorld(targetSubcell);
  const dx = world.delta(e.x, tx);
  const dy = world.delta(e.y, ty);
  const distSq = dx * dx + dy * dy;
  if (distSq < 0.0001) { assignment.pi++; ai.stuck = 0; return; }

  const speed = aiPathMoveSpeed(e) * getCellHazardMoveMultiplier(world, e) * dt;
  const prevX = e.x;
  const prevY = e.y;

  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;
  
  const step = Math.min(speed, dist);
  const opt = { ignoreFineBlockers: entityIgnoresFineBlockers(e) };
  
  const testX = wrapFloat(e.x + nx * step);
  if (canActorOccupy(world, testX, e.y, 0, opt)) {
    e.x = testX;
  }
  
  const testY = wrapFloat(e.y + ny * step);
  if (canActorOccupy(world, e.x, testY, 0, opt)) {
    e.y = testY;
  }

  const moved = (e.x !== prevX || e.y !== prevY);
  ai.stuck = moved ? 0 : ai.stuck + dt;
  if (ai.stuck > 2 && assignment.pi < assignment.path.length - 1) {
    assignment.pi++;
    ai.stuck = 0;
  } else if (ai.stuck > 4) {
    _steeringPathAssignments.delete(e);
    ai.stuck = 0;
    ai.goal = AIGoal.IDLE;
    ai.timer = 2;
  }
}

export function findNearest(world: World, e: Entity, type: RoomType): number {
  let best = -1, bestD = Infinity;
  for (const room of world.rooms) {
    if (!room || room.type !== type) continue;
    const d = world.dist2(e.x, e.y, room.x + room.w / 2, room.y + room.h / 2);
    if (d < bestD) { bestD = d; best = room.id; }
  }
  return best;
}

export function findFamilyRoom(world: World, e: Entity, type: RoomType): number {
  if (e.familyId !== undefined) {
    for (const room of world.rooms) {
      if (!room || room.apartmentId !== e.familyId || room.type !== type) continue;
      return room.id;
    }
  }
  return findNearest(world, e, type);
}

export function gotoSpecificRoom(world: World, e: Entity, targetRoomId: number): AssignPathStatus {
  return gotoRoom(world, e, targetRoomId);
}

export function wanderNearby(world: World, e: Entity): void {
  const ai = e.ai!;
  for (let attempt = 0; attempt < ROUTINE_WANDER_ATTEMPTS; attempt++) {
    const wx = Math.floor(e.x) + Math.floor(rng() * 20 - 10);
    const wy = Math.floor(e.y) + Math.floor(rng() * 20 - 10);
    const tx = world.wrap(wx);
    const ty = world.wrap(wy);
    if (world.solid(tx, ty)) continue;

    const status = tryAssignPathToCell(world, e, tx, ty);
    if (status !== 'not_found') return;
  }
}

export function wanderInRoom(world: World, e: Entity): void {
  const room = world.roomAt(e.x, e.y);
  if (!room || room.w < 3 || room.h < 3) return;
  for (let attempt = 0; attempt < ROUTINE_WANDER_ATTEMPTS; attempt++) {
    const rx = room.x + 1 + Math.floor(rng() * (room.w - 2));
    const ry = room.y + 1 + Math.floor(rng() * (room.h - 2));
    if (!world.solid(rx, ry)) {
      const status = tryAssignPathToCell(world, e, rx, ry);
      if (status !== 'not_found') return;
    }
  }
}

export function wanderFar(world: World, e: Entity): void {
  if (world.rooms.length > 0) {
    for (let attempt = 0; attempt < ROUTINE_FAR_ATTEMPTS; attempt++) {
      const room = world.rooms[Math.floor(rng() * world.rooms.length)];
      if (!room || room.w < 2 || room.h < 2) continue;
      const tx = room.x + Math.floor(room.w / 2);
      const ty = room.y + Math.floor(room.h / 2);
      const status = tryAssignPathToCell(world, e, tx, ty);
      if (status !== 'not_found') return;
    }
  }
  wanderNearby(world, e);
}
`;

fs.writeFileSync('src/systems/ai/pathfinding.ts', part1 + code);
