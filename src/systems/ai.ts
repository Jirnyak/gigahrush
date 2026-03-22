/* ── AI system: NPC A-Life FSM + monster hunting ─────────────── */

import {
  W, Cell, DoorState,
  type Entity, type Msg, type GameClock,
  EntityType, AIGoal, RoomType, NpcState, Occupation, Faction,
} from '../core/types';
import { World } from '../core/world';
import { MONSTERS } from '../data/catalog';
import { playGrowl } from './audio';

const BFS_LIMIT = 800;

/* ── Main AI update ───────────────────────────────────────────── */
export function updateAI(world: World, entities: Entity[], dt: number, time: number, msgs: Msg[], playerId: number, clock: GameClock, samosborActive: boolean): void {
  for (const e of entities) {
    if (!e.alive || !e.ai) continue;
    if (e.type === EntityType.NPC) updateNPC(world, entities, e, dt, time, clock, samosborActive);
    if (e.type === EntityType.MONSTER) updateMonster(world, entities, e, dt, time, msgs, playerId);
  }
}

/* ── Schedule → NpcState mapping ──────────────────────────────── */
function getScheduledState(hour: number, samosborActive: boolean, e?: Entity): NpcState {
  // Travelers always travel (except citizen travelers hide during samosbor)
  if (e?.isTraveler) {
    if (samosborActive && e.faction === Faction.CITIZEN) return NpcState.HIDING;
    return NpcState.TRAVELING;
  }
  if (samosborActive) return NpcState.HIDING;
  if (hour >= 22 || hour < 6)  return NpcState.SLEEPING;
  if (hour >= 6  && hour < 8)  return NpcState.MORNING;
  if (hour >= 8  && hour < 12) return NpcState.WORKING;
  if (hour >= 12 && hour < 13) return NpcState.LUNCH;
  if (hour >= 13 && hour < 18) return NpcState.WORKING;
  return NpcState.FREE_TIME; // 18-22
}

/* ── Work room types by occupation ────────────────────────────── */
function getWorkRoomTypes(occ: Occupation | undefined): RoomType[] {
  switch (occ) {
    case Occupation.COOK:        return [RoomType.KITCHEN];
    case Occupation.DOCTOR:      return [RoomType.MEDICAL];
    case Occupation.LOCKSMITH:
    case Occupation.ELECTRICIAN:
    case Occupation.TURNER:
    case Occupation.MECHANIC:    return [RoomType.PRODUCTION];
    case Occupation.SECRETARY:   return [RoomType.OFFICE];
    case Occupation.STOREKEEPER: return [RoomType.STORAGE];
    case Occupation.SCIENTIST:   return [RoomType.OFFICE, RoomType.MEDICAL];
    case Occupation.DIRECTOR:    return [RoomType.OFFICE, RoomType.COMMON];
    case Occupation.HOUSEWIFE:   return [RoomType.LIVING, RoomType.KITCHEN];
    case Occupation.CHILD:       return [RoomType.LIVING, RoomType.COMMON];
    case Occupation.ALCOHOLIC:   return [RoomType.SMOKING, RoomType.COMMON, RoomType.KITCHEN];
    case Occupation.HUNTER:      return [RoomType.CORRIDOR, RoomType.COMMON];
    default:                     return [RoomType.PRODUCTION, RoomType.OFFICE];
  }
}

/* ── NPC behavior: schedule-driven FSM with needs ─────────────── */
function updateNPC(world: World, _entities: Entity[], e: Entity, dt: number, _time: number, clock: GameClock, samosborActive: boolean): void {
  const ai = e.ai!;
  const n = e.needs;

  // Initialize NPC state if not set
  if (ai.npcState === undefined) {
    ai.npcState = getScheduledState(clock.hour, samosborActive, e);
    ai.stateTimer = 0;
  }

  // ── Ольга Дмитриевна: tutor → doctor transition after 1 game hour ──
  if (e.isTutor && !e.tutorDone && clock.totalMinutes >= 60) {
    e.tutorDone = true;
    // Switch to normal doctor AI schedule
    ai.npcState = getScheduledState(clock.hour, samosborActive, e);
    ai.path = [];
    ai.pi = 0;
    ai.goal = AIGoal.IDLE;
    ai.stateTimer = 0;
  }
  // While tutoring, stay idle in start room
  if (e.isTutor && !e.tutorDone) {
    ai.goal = AIGoal.IDLE;
    ai.timer = 1;
    return;
  }

  // Check for schedule transition
  const scheduled = getScheduledState(clock.hour, samosborActive, e);
  if (ai.npcState !== scheduled && ai.npcState !== NpcState.HIDING) {
    // Travelers: only transition from TRAVELING if scheduled differs (e.g. citizen → HIDING)
    if (!e.isTraveler || scheduled !== NpcState.TRAVELING) {
      ai.npcState = scheduled;
      ai.path = [];
      ai.pi = 0;
      ai.goal = AIGoal.IDLE;
      ai.stateTimer = 0;
    }
  }
  // If was hiding and samosbor ended, transition
  if (ai.npcState === NpcState.HIDING && !samosborActive) {
    ai.npcState = scheduled;
    ai.path = [];
    ai.pi = 0;
    ai.goal = AIGoal.IDLE;
    ai.stateTimer = 0;
  }

  ai.timer -= dt;
  ai.stateTimer = (ai.stateTimer ?? 0) + dt;

  // NPC needs restoration when in relevant room
  const currentRoom = world.roomAt(e.x, e.y);
  if (n && currentRoom) {
    // Food: kitchen
    if (currentRoom.type === RoomType.KITCHEN) {
      n.food = Math.min(100, n.food + 8 * dt);
      n.water = Math.min(100, n.water + 10 * dt);
    }
    // Water: kitchen or bathroom
    if (currentRoom.type === RoomType.BATHROOM) {
      n.water = Math.min(100, n.water + 12 * dt);
    }
    // Sleep: living room
    if (currentRoom.type === RoomType.LIVING && ai.npcState === NpcState.SLEEPING) {
      n.sleep = Math.min(100, n.sleep + 6 * dt);
    }
    // Toilet: bathroom
    if (currentRoom.type === RoomType.BATHROOM) {
      n.pee = Math.max(0, n.pee - 20 * dt);
      n.poo = Math.max(0, n.poo - 15 * dt);
    }
    // Health: medical
    if (currentRoom.type === RoomType.MEDICAL && e.hp !== undefined && e.maxHp !== undefined) {
      e.hp = Math.min(e.maxHp, e.hp + 3 * dt);
    }
  }

  // FSM behavior per state
  switch (ai.npcState) {
    case NpcState.SLEEPING:
      handleSleeping(world, e, dt);
      break;
    case NpcState.MORNING:
      handleMorning(world, e, dt);
      break;
    case NpcState.WORKING:
      handleWorking(world, e, dt);
      break;
    case NpcState.LUNCH:
      handleLunch(world, e, dt);
      break;
    case NpcState.FREE_TIME:
      handleFreeTime(world, e, dt);
      break;
    case NpcState.HIDING:
      handleHiding(world, e, dt);
      break;
    case NpcState.TRAVELING:
      handleTraveling(world, e, dt);
      break;
  }
}

/* ── State handlers ──────────────────────────────────────────── */

function handleSleeping(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  // Go to own living room and stay
  if (ai.goal === AIGoal.IDLE || ai.timer <= 0) {
    const targetRoom = findFamilyRoom(world, e, RoomType.LIVING);
    if (targetRoom >= 0 && ai.path.length === 0) {
      gotoRoom(world, e, targetRoom);
    }
    ai.goal = AIGoal.SLEEP;
    ai.timer = 10;
  }
  followPath(world, e, dt);
}

function handleMorning(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  const n = e.needs;

  if (ai.timer <= 0 || ai.goal === AIGoal.IDLE) {
    // Priority: toilet → eat/drink → wander near home
    if (n && (n.pee > 50 || n.poo > 50)) {
      ai.goal = AIGoal.TOILET;
      const r = findNearest(world, e, RoomType.BATHROOM);
      if (r >= 0) gotoRoom(world, e, r);
    } else if (n && n.food < 60) {
      ai.goal = AIGoal.EAT;
      const r = findNearest(world, e, RoomType.KITCHEN);
      if (r >= 0) gotoRoom(world, e, r);
    } else if (n && n.water < 60) {
      ai.goal = AIGoal.DRINK;
      const r = findNearest(world, e, RoomType.KITCHEN);
      if (r >= 0) gotoRoom(world, e, r);
    } else {
      ai.goal = AIGoal.WANDER;
      wanderNearby(world, e);
    }
    ai.timer = 8 + Math.random() * 8;
  }

  // Check if need satisfied → idle to re-evaluate
  if (n && ai.goal === AIGoal.TOILET) {
    const cr = world.roomAt(e.x, e.y);
    if (cr && cr.type === RoomType.BATHROOM && n.pee < 15 && n.poo < 15) {
      ai.goal = AIGoal.IDLE; ai.timer = 1;
    }
  }
  if (n && ai.goal === AIGoal.EAT) {
    const cr = world.roomAt(e.x, e.y);
    if (cr && cr.type === RoomType.KITCHEN && n.food > 80) {
      ai.goal = AIGoal.IDLE; ai.timer = 1;
    }
  }

  followPath(world, e, dt);
}

function handleWorking(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  const n = e.needs;

  if (ai.timer <= 0 || ai.goal === AIGoal.IDLE) {
    // Urgent needs interrupt work
    if (n && (n.pee > 80 || n.poo > 80)) {
      ai.goal = AIGoal.TOILET;
      const r = findNearest(world, e, RoomType.BATHROOM);
      if (r >= 0) gotoRoom(world, e, r);
      ai.timer = 10;
    } else if (n && e.hp !== undefined && e.maxHp !== undefined && e.hp < e.maxHp * 0.5) {
      // Injured NPC goes to medical
      ai.goal = AIGoal.GOTO;
      const r = findNearest(world, e, RoomType.MEDICAL);
      if (r >= 0) gotoRoom(world, e, r);
      ai.timer = 15;
    } else {
      // Go to workplace
      ai.goal = AIGoal.WORK;
      const workTypes = getWorkRoomTypes(e.occupation);
      let bestRoom = -1;
      for (const rt of workTypes) {
        bestRoom = findNearest(world, e, rt);
        if (bestRoom >= 0) break;
      }
      if (bestRoom >= 0) gotoRoom(world, e, bestRoom);
      ai.timer = 15 + Math.random() * 20;
    }
  }

  // If at work, just stay (needs restore handled above)
  if (ai.goal === AIGoal.TOILET) {
    const cr = world.roomAt(e.x, e.y);
    if (cr && cr.type === RoomType.BATHROOM && n && n.pee < 15 && n.poo < 15) {
      ai.goal = AIGoal.IDLE; ai.timer = 1;
    }
  }

  followPath(world, e, dt);
}

function handleLunch(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;

  if (ai.timer <= 0 || ai.goal === AIGoal.IDLE) {
    ai.goal = AIGoal.EAT;
    const r = findNearest(world, e, RoomType.KITCHEN);
    if (r >= 0) gotoRoom(world, e, r);
    ai.timer = 20 + Math.random() * 10;
  }

  followPath(world, e, dt);
}

function handleFreeTime(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  const n = e.needs;

  if (ai.timer <= 0 || ai.goal === AIGoal.IDLE) {
    // Urgent needs
    if (n && (n.pee > 70 || n.poo > 70)) {
      ai.goal = AIGoal.TOILET;
      const r = findNearest(world, e, RoomType.BATHROOM);
      if (r >= 0) gotoRoom(world, e, r);
    } else if (n && n.food < 40) {
      ai.goal = AIGoal.EAT;
      const r = findNearest(world, e, RoomType.KITCHEN);
      if (r >= 0) gotoRoom(world, e, r);
    } else if (n && e.hp !== undefined && e.maxHp !== undefined && e.hp < e.maxHp * 0.7) {
      ai.goal = AIGoal.GOTO;
      const r = findNearest(world, e, RoomType.MEDICAL);
      if (r >= 0) gotoRoom(world, e, r);
    } else {
      // Random free-time activity
      const roll = Math.random();
      if (roll < 0.3) {
        // Go to smoking room
        ai.goal = AIGoal.WANDER;
        const r = findNearest(world, e, RoomType.SMOKING);
        if (r >= 0) gotoRoom(world, e, r);
        else wanderNearby(world, e);
      } else if (roll < 0.55) {
        // Go to kitchen (social)
        ai.goal = AIGoal.WANDER;
        const r = findNearest(world, e, RoomType.KITCHEN);
        if (r >= 0) gotoRoom(world, e, r);
        else wanderNearby(world, e);
      } else if (roll < 0.7) {
        // Go to common hall
        ai.goal = AIGoal.WANDER;
        const r = findNearest(world, e, RoomType.COMMON);
        if (r >= 0) gotoRoom(world, e, r);
        else wanderNearby(world, e);
      } else {
        // Wander corridors
        ai.goal = AIGoal.WANDER;
        wanderNearby(world, e);
      }
    }
    ai.timer = 8 + Math.random() * 12;
  }

  // Check need satisfied
  if (n && ai.goal === AIGoal.TOILET) {
    const cr = world.roomAt(e.x, e.y);
    if (cr && cr.type === RoomType.BATHROOM && n.pee < 15 && n.poo < 15) {
      ai.goal = AIGoal.IDLE; ai.timer = 1;
    }
  }

  followPath(world, e, dt);
}

function handleHiding(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  if (ai.goal !== AIGoal.HIDE || ai.path.length === 0) {
    ai.goal = AIGoal.HIDE;
    // Travelers without a family go to nearest living room
    if (e.isTraveler) {
      const r = findNearest(world, e, RoomType.LIVING);
      if (r >= 0) gotoRoom(world, e, r);
    } else {
      const targetRoom = findFamilyRoom(world, e, RoomType.LIVING);
      if (targetRoom >= 0) gotoRoom(world, e, targetRoom);
    }
    ai.timer = 60;
  }
  followPath(world, e, dt);
}

function handleTraveling(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  const n = e.needs;

  if (ai.timer <= 0 || ai.goal === AIGoal.IDLE) {
    // Urgent needs first
    if (n && (n.pee > 70 || n.poo > 70)) {
      ai.goal = AIGoal.TOILET;
      const r = findNearest(world, e, RoomType.BATHROOM);
      if (r >= 0) gotoRoom(world, e, r);
    } else if (n && n.food < 30) {
      ai.goal = AIGoal.EAT;
      const r = findNearest(world, e, RoomType.KITCHEN);
      if (r >= 0) gotoRoom(world, e, r);
    } else if (n && e.hp !== undefined && e.maxHp !== undefined && e.hp < e.maxHp * 0.5) {
      ai.goal = AIGoal.GOTO;
      const r = findNearest(world, e, RoomType.MEDICAL);
      if (r >= 0) gotoRoom(world, e, r);
    } else {
      // Wander far across the maze
      ai.goal = AIGoal.WANDER;
      wanderFar(world, e);
    }
    ai.timer = 10 + Math.random() * 20;
  }

  // Need satisfied → re-evaluate
  if (n && ai.goal === AIGoal.TOILET) {
    const cr = world.roomAt(e.x, e.y);
    if (cr && cr.type === RoomType.BATHROOM && n.pee < 15 && n.poo < 15) {
      ai.goal = AIGoal.IDLE; ai.timer = 1;
    }
  }
  if (n && ai.goal === AIGoal.EAT) {
    const cr = world.roomAt(e.x, e.y);
    if (cr && cr.type === RoomType.KITCHEN && n.food > 80) {
      ai.goal = AIGoal.IDLE; ai.timer = 1;
    }
  }

  followPath(world, e, dt);
}

/* ── Helper: set path to room center ──────────────────────────── */
function gotoRoom(world: World, e: Entity, roomId: number): void {
  const ai = e.ai!;
  const room = world.rooms[roomId];
  if (!room) return;
  const tx = room.x + Math.floor(room.w / 2);
  const ty = room.y + Math.floor(room.h / 2);
  ai.path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), tx, ty);
  ai.pi = 0;
}

/* ── Helper: wander randomly nearby ───────────────────────────── */
function wanderNearby(world: World, e: Entity): void {
  const ai = e.ai!;
  const wx = Math.floor(e.x) + Math.floor(Math.random() * 20 - 10);
  const wy = Math.floor(e.y) + Math.floor(Math.random() * 20 - 10);
  ai.path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), world.wrap(wx), world.wrap(wy));
  ai.pi = 0;
}

/* ── Helper: roam randomly within the current room ────────────── */
function wanderInRoom(world: World, e: Entity): void {
  const ai = e.ai!;
  const room = world.roomAt(e.x, e.y);
  if (!room || room.w < 3 || room.h < 3) return;
  // Pick a random walkable tile inside the room (avoid walls at edges)
  for (let attempt = 0; attempt < 8; attempt++) {
    const rx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
    const ry = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
    if (!world.solid(rx, ry)) {
      ai.path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), rx, ry);
      ai.pi = 0;
      return;
    }
  }
}

/* ── Helper: wander far across the maze (for travelers) ───────── */
function wanderFar(world: World, e: Entity): void {
  const ai = e.ai!;
  // Pick a random room anywhere in the world and path to it
  if (world.rooms.length > 0) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const room = world.rooms[Math.floor(Math.random() * world.rooms.length)];
      if (!room || room.w < 2 || room.h < 2) continue;
      const tx = room.x + Math.floor(room.w / 2);
      const ty = room.y + Math.floor(room.h / 2);
      const path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), tx, ty);
      if (path.length > 0) {
        ai.path = path;
        ai.pi = 0;
        return;
      }
    }
  }
  // Fallback: wander nearby
  wanderNearby(world, e);
}

/* ── Monster behavior: hunt player ────────────────────────────── */
function updateMonster(world: World, entities: Entity[], e: Entity, dt: number, time: number, msgs: Msg[], playerId: number): void {
  const ai = e.ai!;
  const player = entities.find(p => p.id === playerId);
  if (!player || !player.alive) { ai.goal = AIGoal.WANDER; return; }

  const dist = world.dist(e.x, e.y, player.x, player.y);

  // Attack if close enough
  if (dist < 1.2) {
    e.attackCd = (e.attackCd ?? 0) - dt;
    if (e.attackCd! <= 0) {
      const def = e.monsterKind !== undefined ? MONSTERS[e.monsterKind] : null;
      const dmg = def?.dmg ?? 10;
      if (player.hp !== undefined) {
        player.hp -= dmg;
        if (player.hp <= 0) { player.alive = false; player.hp = 0; }
      }
      msgs.push({ text: `${e.name ?? 'Монстр'} атакует! -${dmg}`, time, color: '#f44' });
      playGrowl();
      e.attackCd = def?.attackRate ?? 1;
    }
    return;
  }

  // Hunt: pathfind to player
  ai.timer -= dt;
  if (ai.path.length === 0 || ai.timer <= 0) {
    ai.path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), Math.floor(player.x), Math.floor(player.y));
    ai.pi = 0;
    ai.timer = 2;
  }

  followPath(world, e, dt);
}

/* ── BFS pathfinding (toroidal, avoids closed doors) ──────────── */
export function bfsPath(world: World, sx: number, sy: number, ex: number, ey: number): number[] {
  sx = world.wrap(sx); sy = world.wrap(sy);
  ex = world.wrap(ex); ey = world.wrap(ey);

  if (sx === ex && sy === ey) return [];

  const visited = new Set<number>();
  const prev = new Map<number, number>();
  const queue: number[] = [];
  const start = sy * W + sx;
  const end = ey * W + ex;

  visited.add(start);
  queue.push(start);

  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  let found = false;

  for (let i = 0; i < queue.length && i < BFS_LIMIT; i++) {
    const cur = queue[i];
    if (cur === end) { found = true; break; }

    const cx = cur % W;
    const cy = (cur - cx) / W;

    for (const [dx, dy] of dirs) {
      const nx = ((cx + dx) % W + W) % W;
      const ny = ((cy + dy) % W + W) % W;
      const ni = ny * W + nx;
      if (visited.has(ni)) continue;

      const cell = world.cells[ni];
      if (cell === Cell.WALL) continue;
      if (cell === Cell.DOOR) {
        const door = world.doors.get(ni);
        if (door && (door.state === DoorState.LOCKED || door.state === DoorState.HERMETIC_CLOSED)) continue;
      }

      visited.add(ni);
      prev.set(ni, cur);
      queue.push(ni);
    }
  }

  if (!found) return [];

  // Reconstruct path
  const path: number[] = [];
  let c = end;
  while (c !== start) {
    path.push(c);
    c = prev.get(c)!;
    if (c === undefined) return [];
  }
  path.reverse();
  return path;
}

/* ── Follow path ──────────────────────────────────────────────── */
function followPath(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  if (ai.pi >= ai.path.length) {
    // Path finished — clear and roam within room if NPC
    if (ai.path.length > 0) { ai.path = []; ai.pi = 0; ai.stuck = 0; }
    if (e.type === EntityType.NPC) {
      ai.stuck += dt;
      if (ai.stuck > 1.5 + Math.random() * 2) {
        wanderInRoom(world, e);
        ai.stuck = 0;
      }
    }
    return;
  }

  const target = ai.path[ai.pi];
  const tx = (target % W) + 0.5;
  const ty = Math.floor(target / W) + 0.5;

  let dx = world.delta(e.x, tx);
  let dy = world.delta(e.y, ty);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 0.3) {
    ai.pi++;
    ai.stuck = 0;
    return;
  }

  // Open doors in the way
  const nextCellI = world.idx(Math.floor(tx), Math.floor(ty));
  if (world.cells[nextCellI] === Cell.DOOR) {
    const door = world.doors.get(nextCellI);
    if (door && (door.state === DoorState.CLOSED || door.state === DoorState.HERMETIC_CLOSED)) {
      door.state = door.state === DoorState.HERMETIC_CLOSED ? DoorState.HERMETIC_OPEN : DoorState.OPEN;
      door.timer = 5; // auto-close after 5s
    }
  }

  // Move toward target
  const speed = e.speed * dt;
  const nx = e.x + (dx / dist) * speed;
  const ny = e.y + (dy / dist) * speed;

  if (!world.solid(Math.floor(nx), Math.floor(e.y))) e.x = ((nx % W) + W) % W;
  if (!world.solid(Math.floor(e.x), Math.floor(ny))) e.y = ((ny % W) + W) % W;

  // Stuck detection
  ai.stuck += dt;
  if (ai.stuck > 3) {
    ai.path = [];
    ai.pi = 0;
    ai.stuck = 0;
    ai.goal = AIGoal.IDLE;
    ai.timer = 2;
  }
}

/* ── Find nearest room of type ────────────────────────────────── */
function findNearest(world: World, e: Entity, type: RoomType): number {
  let best = -1, bestD = Infinity;
  for (const room of world.rooms) {
    if (!room || room.type !== type) continue;
    const d = world.dist(e.x, e.y, room.x + room.w / 2, room.y + room.h / 2);
    if (d < bestD) { bestD = d; best = room.id; }
  }
  return best;
}

/* ── Find family's room of type ───────────────────────────────── */
function findFamilyRoom(world: World, e: Entity, type: RoomType): number {
  if (e.familyId !== undefined) {
    for (const room of world.rooms) {
      if (!room || room.type !== type || room.apartmentId !== e.familyId) continue;
      return room.id;
    }
  }
  return findNearest(world, e, type);
}

/* ── Force NPCs to hide (called by samosbor) ─────────────────── */
/* Citizens and scientists hide. Liquidators and cultists do not. */
export function forceHide(entities: Entity[]): void {
  for (const e of entities) {
    if (e.type === EntityType.NPC && e.alive && e.ai) {
      // Liquidators and cultists don't hide during samosbor
      if (e.faction === Faction.LIQUIDATOR || e.faction === Faction.CULTIST) continue;
      e.ai.npcState = NpcState.HIDING;
      e.ai.goal = AIGoal.HIDE;
      e.ai.path = [];
      e.ai.pi = 0;
      e.ai.timer = 60;
    }
  }
}

/* ── Get human-readable NPC state description (for talk) ──────── */
const STATE_TEXTS: Record<NpcState, string[]> = {
  [NpcState.SLEEPING]:  ['Я сплю... зачем ты меня будишь?', 'Ещё рано... дай поспать.', 'Ночь на дворе...'],
  [NpcState.MORNING]:   ['Утро. Надо в туалет и перекусить.', 'Собираюсь на работу.', 'Утренняя рутина...'],
  [NpcState.WORKING]:   ['Я на работе. Много дел.', 'Работаю. Некогда болтать.', 'Смена ещё не кончилась.'],
  [NpcState.LUNCH]:     ['Обед! Наконец-то.', 'Пойдём пообедаем.', 'Перерыв на еду.'],
  [NpcState.FREE_TIME]: ['Свободное время. Можно передохнуть.', 'Отдыхаю после смены.', 'Просто гуляю.'],
  [NpcState.HIDING]:    ['Самосбор! Сиди тихо!', 'Не высовывайся! Они снаружи!', 'Закрой дверь! Быстро!'],
  [NpcState.TRAVELING]: ['Иду куда глаза глядят.', 'Путь далёк. Не останавливаюсь.', 'Вечно в дороге...', 'Лабиринт бесконечен, и я в нём.'],
};

export function getNpcStateText(state: NpcState): string {
  const texts = STATE_TEXTS[state];
  return texts[Math.floor(Math.random() * texts.length)];
}
