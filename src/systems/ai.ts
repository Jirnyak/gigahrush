/* ── AI system: NPC A-Life FSM + monster hunting ─────────────── */

import {
  W, Cell, DoorState,
  type Entity, type Msg, type GameClock,
  EntityType, AIGoal, RoomType, NpcState, Occupation, Faction, MonsterKind,
} from '../core/types';
import { World } from '../core/world';
import { MONSTERS, monsterName } from '../data/catalog';
import { playGrowl } from './audio';
import { isHostile, applyDamageRelationPenalty } from './factions';
import { addRelMutual } from '../data/relations';
import { scaleMonsterDmg, strMeleeDmgMult, scaleMonsterHp, scaleMonsterSpeed, randomRPG } from './rpg';
import { spawnBloodHit, spawnDeathPool } from '../render/blood';

const BFS_LIMIT = 800;

/* ── Entity lookup map — rebuilt once per AI tick ─────────────── */
let entityById = new Map<number, Entity>();

/* ── Main AI update ───────────────────────────────────────────── */
export function updateAI(world: World, entities: Entity[], dt: number, time: number, msgs: Msg[], playerId: number, clock: GameClock, samosborActive: boolean, nextId: { v: number }): void {
  // Build id→entity map once per frame for O(1) cached target lookups
  entityById.clear();
  for (const e of entities) if (e.alive) entityById.set(e.id, e);

  for (const e of entities) {
    if (!e.alive || !e.ai) continue;
    if (e.type === EntityType.NPC) {
      // Check for faction combat before normal FSM
      if (!tryFactionCombat(world, entities, e, dt, time, msgs)) {
        updateNPC(world, entities, e, dt, time, clock, samosborActive);
      }
    }
    if (e.type === EntityType.MONSTER) updateMonster(world, entities, e, dt, time, msgs, playerId, nextId);
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
      // Stamp urine on floor while relieving
      if (n.pee > 15 && Math.random() < 0.3) {
        const fx = ((e.x % 1) + 1) % 1;
        const fy = ((e.y % 1) + 1) % 1;
        world.stamp(Math.floor(e.x), Math.floor(e.y), fx, fy, 0.1, 40, Math.floor(e.id * 1000 + n.pee), 200, 180, 30);
      }
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

/* ── Shared combat target finder ──────────────────────────────── */
const MONSTER_DETECT = 20;
const MONSTER_DETECT_SQ = MONSTER_DETECT * MONSTER_DETECT;
const PREFER_PLAYER = 15;
const PREFER_SQ = PREFER_PLAYER * PREFER_PLAYER;

function findCombatTarget(
  world: World, entities: Entity[], e: Entity, dt: number,
  rangeSq: number, scanCd: number,
  typeFilter: (other: Entity) => boolean,
): Entity | null {
  const ai = e.ai!;
  let target: Entity | null = null;
  let bestDist2 = rangeSq;

  ai.combatScanCd = (ai.combatScanCd ?? 0) - dt;
  if (ai.combatTargetId !== undefined) {
    const cached = entityById.get(ai.combatTargetId);
    if (cached && cached.alive) {
      const d2 = world.dist2(e.x, e.y, cached.x, cached.y);
      if (d2 < rangeSq) { target = cached; bestDist2 = d2; }
    }
    if (!target) ai.combatTargetId = undefined;
  }

  if (!target && ai.combatScanCd! <= 0) {
    ai.combatScanCd = scanCd;
    for (const other of entities) {
      if (!other.alive || other.id === e.id) continue;
      if (!typeFilter(other)) continue;
      const d2 = world.dist2(e.x, e.y, other.x, other.y);
      if (d2 >= bestDist2) continue;
      if (!isHostile(e, other)) continue;
      bestDist2 = d2;
      target = other;
    }
    if (target) ai.combatTargetId = target.id;
  }

  return target;
}

/* ── Monster behavior: hunt player + hostile NPCs ─────────────── */
const MATKA_MAX_CHILDREN = 100;

function updateMonster(world: World, entities: Entity[], e: Entity, dt: number, time: number, msgs: Msg[], playerId: number, nextId: { v: number }): void {
  const ai = e.ai!;

  // Матка: spawn a random monster every 60 real seconds (1 game hour)
  if (e.monsterKind === MonsterKind.MATKA) {
    e.matkaTimer = (e.matkaTimer ?? 60) - dt;
    if (e.matkaTimer <= 0) {
      e.matkaTimer = 60;
      // Cap spawns: count nearby monsters within ~20 cells
      let nearby = 0;
      for (const o of entities) {
        if (o.type === EntityType.MONSTER && o.alive && o.id !== e.id && world.dist2(e.x, e.y, o.x, o.y) < 400) nearby++;
      }
      if (nearby < MATKA_MAX_CHILDREN) {
        const spawnKinds = [MonsterKind.SBORKA, MonsterKind.TVAR, MonsterKind.ZOMBIE, MonsterKind.SHADOW, MonsterKind.POLZUN];
        const kind = spawnKinds[Math.floor(Math.random() * spawnKinds.length)];
        const def = MONSTERS[kind];
        const zid = world.zoneMap[world.idx(Math.floor(e.x), Math.floor(e.y))];
        const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 1) : 1;
        const rpg = randomRPG(zoneLevel);
        const hpBase = scaleMonsterHp(def.hp, zoneLevel);
        const hpFinal = Math.round(hpBase * (1 + 0.1 * rpg.str));
        const ox = (Math.random() - 0.5) * 2;
        const oy = (Math.random() - 0.5) * 2;
        const sx = ((e.x + ox) % W + W) % W;
        const sy = ((e.y + oy) % W + W) % W;
        if (!world.solid(Math.floor(sx), Math.floor(sy))) {
          entities.push({
            id: nextId.v++,
            type: EntityType.MONSTER,
            x: sx, y: sy,
            angle: Math.random() * Math.PI * 2,
            pitch: 0,
            alive: true,
            speed: scaleMonsterSpeed(def.speed, zoneLevel),
            sprite: def.sprite,
            name: monsterName(),
            hp: hpFinal, maxHp: hpFinal,
            monsterKind: kind,
            attackCd: def.attackRate,
            ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
            rpg,
          });
          msgs.push({ text: `Матка родила ${def.name}!`, time, color: '#f4a' });
        }
      }
    }
  }

  let target = findCombatTarget(
    world, entities, e, dt,
    MONSTER_DETECT_SQ, 1.0 + Math.random() * 0.5,
    o => o.type !== EntityType.MONSTER && o.type !== EntityType.PROJECTILE && o.type !== EntityType.ITEM_DROP,
  );

  // Always prefer player if close
  const player = entityById.get(playerId);
  if (player?.alive) {
    const pd2 = world.dist2(e.x, e.y, player.x, player.y);
    if (pd2 < PREFER_SQ) { target = player; ai.combatTargetId = player.id; }
  }

  if (!target) { ai.goal = AIGoal.WANDER; ai.combatTargetId = undefined; return; }
  ai.combatTargetId = target.id;

  const bestDist = Math.sqrt(world.dist2(e.x, e.y, target.x, target.y));

  const def = e.monsterKind !== undefined ? MONSTERS[e.monsterKind] : null;

  // Ranged attack: shoot projectile if in range but not too close
  if (def?.isRanged && bestDist < 15 && bestDist > 1.5) {
    e.attackCd = (e.attackCd ?? 0) - dt;
    if (e.attackCd! <= 0) {
      const baseDmg = def.dmg ?? 10;
      const level = e.rpg?.level ?? 1;
      const strMult = e.rpg ? strMeleeDmgMult(e.rpg) : 1;
      const dmg = Math.round(scaleMonsterDmg(baseDmg, level) * strMult);
      const ang = Math.atan2(target.y - e.y, target.x - e.x);
      const spd = def.projSpeed ?? 8;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      entities.push({
        id: nextId.v++,
        type: EntityType.PROJECTILE,
        x: e.x + cos * 0.5,
        y: e.y + sin * 0.5,
        angle: ang,
        pitch: 0,
        alive: true,
        speed: 0,
        sprite: def.projSprite ?? 27,
        vx: cos * spd,
        vy: sin * spd,
        projDmg: dmg,
        projLife: 3.0,
        ownerId: e.id,
        spriteScale: 0.3,
        spriteZ: 0.5,
      });
      playGrowl();
      e.attackCd = def.attackRate ?? 2;
    }
    // Strafe sideways instead of closing in
    return;
  }

  // Melee attack if close enough
  if (bestDist < 1.2) {
    e.attackCd = (e.attackCd ?? 0) - dt;
    if (e.attackCd! <= 0) {
      const baseDmg = def?.dmg ?? 10;
      const level = e.rpg?.level ?? 1;
      const strMult = e.rpg ? strMeleeDmgMult(e.rpg) : 1;
      const dmg = Math.round(scaleMonsterDmg(baseDmg, level) * strMult);
      if (target.hp !== undefined) {
        target.hp -= dmg;
        if (target.hp <= 0) { target.alive = false; target.hp = 0; }
        // Blood splatter from monster hit
        const hitAng = Math.atan2(target.y - e.y, target.x - e.x);
        spawnBloodHit(world, target.x, target.y, hitAng, dmg, target.type === EntityType.MONSTER);
        if (target.hp <= 0) spawnDeathPool(world, target.x, target.y, target.type === EntityType.MONSTER);
      }
      msgs.push({ text: `${e.name ?? 'Монстр'} атакует ${target.name ?? 'цель'}! -${dmg}`, time, color: '#f44' });
      playGrowl();
      e.attackCd = def?.attackRate ?? 1;
    }
    return;
  }

  // Hunt: pathfind to target
  ai.timer -= dt;
  if (ai.path.length === 0 || ai.timer <= 0) {
    ai.path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), Math.floor(target.x), Math.floor(target.y));
    ai.pi = 0;
    ai.timer = 2;
  }

  followPath(world, e, dt);
}

/* ── BFS pathfinding (toroidal, avoids closed doors) ──────────── */
// Pre-allocated buffers to avoid GC pressure from per-call Set/Map/Array
const _bfsVisitGen = new Uint16Array(W * W);
let _bfsGen = 0;
const _bfsPrev = new Int32Array(W * W);
const _bfsQueue = new Int32Array(BFS_LIMIT);

export function bfsPath(world: World, sx: number, sy: number, ex: number, ey: number): number[] {
  sx = world.wrap(sx); sy = world.wrap(sy);
  ex = world.wrap(ex); ey = world.wrap(ey);

  if (sx === ex && sy === ey) return [];

  _bfsGen = (_bfsGen + 1) & 0xFFFF;
  if (_bfsGen === 0) { _bfsGen = 1; _bfsVisitGen.fill(0); }

  const start = sy * W + sx;
  const end = ey * W + ex;

  _bfsVisitGen[start] = _bfsGen;
  _bfsQueue[0] = start;
  let head = 0, tail = 1;
  let found = false;

  while (head < tail && head < BFS_LIMIT) {
    const cur = _bfsQueue[head++];
    if (cur === end) { found = true; break; }

    const cx = cur % W;
    const cy = (cur - cx) / W;

    for (let d = 0; d < 4; d++) {
      const nx = ((cx + (d === 0 ? -1 : d === 1 ? 1 : 0)) % W + W) % W;
      const ny = ((cy + (d === 2 ? -1 : d === 3 ? 1 : 0)) % W + W) % W;
      const ni = ny * W + nx;
      if (_bfsVisitGen[ni] === _bfsGen) continue;

      const cell = world.cells[ni];
      if (cell === Cell.WALL) continue;
      if (cell === Cell.DOOR) {
        const door = world.doors.get(ni);
        if (door && (door.state === DoorState.LOCKED || door.state === DoorState.HERMETIC_CLOSED)) continue;
      }

      _bfsVisitGen[ni] = _bfsGen;
      _bfsPrev[ni] = cur;
      if (tail < BFS_LIMIT) _bfsQueue[tail++] = ni;
    }
  }

  if (!found) return [];

  // Reconstruct path
  const path: number[] = [];
  let c = end;
  while (c !== start) {
    path.push(c);
    c = _bfsPrev[c];
    if (_bfsVisitGen[c] !== _bfsGen && c !== start) return [];
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

/* ── NPC faction combat: attack nearby hostile entities ────────── */
const NPC_COMBAT_RANGE = 8;    // detection range
const NPC_ATTACK_RANGE = 1.3;  // melee distance
const NPC_COMBAT_CD = 1.2;     // attack cooldown

function tryFactionCombat(
  world: World, entities: Entity[], e: Entity, dt: number, _time: number, msgs: Msg[],
): boolean {
  // Only combatants fight: travelers, hunters, pilgrims, liquidators, cultists, wild
  const isCombatant = e.isTraveler ||
    e.occupation === Occupation.HUNTER ||
    e.occupation === Occupation.PILGRIM ||
    e.faction === Faction.LIQUIDATOR ||
    e.faction === Faction.CULTIST ||
    e.faction === Faction.WILD;
  if (!isCombatant) return false;

  const ai = e.ai!;
  const target = findCombatTarget(
    world, entities, e, dt,
    NPC_COMBAT_RANGE * NPC_COMBAT_RANGE, 0.8 + Math.random() * 0.4,
    o => o.type === EntityType.NPC || o.type === EntityType.MONSTER || o.type === EntityType.PLAYER,
  );

  if (!target) return false;
  ai.combatTargetId = target.id;

  // Move toward target
  const bestDist = Math.sqrt(world.dist2(e.x, e.y, target.x, target.y));
  if (bestDist > NPC_ATTACK_RANGE) {
    if (ai.path.length === 0 || ai.timer <= 0) {
      ai.path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), Math.floor(target.x), Math.floor(target.y));
      ai.pi = 0;
      ai.timer = 2;
    }
    followPath(world, e, dt);
    return true;
  }

  // Attack
  e.attackCd = (e.attackCd ?? 0) - dt;
  if (e.attackCd! <= 0) {
    const baseDmg = 5 + Math.floor(Math.random() * 8);
    const dmg = e.rpg ? Math.round(baseDmg * strMeleeDmgMult(e.rpg)) : baseDmg;
    if (target.hp !== undefined) {
      target.hp -= dmg;
      if (target.type === EntityType.NPC) {
        applyDamageRelationPenalty(e.id, target.id, dmg, e.faction, target.faction, { addRelMutual });
      }
      // Blood splatter from NPC hit
      const hitAng = Math.atan2(target.y - e.y, target.x - e.x);
      spawnBloodHit(world, target.x, target.y, hitAng, dmg, target.type === EntityType.MONSTER);
      if (target.hp <= 0) {
        target.alive = false;
        spawnDeathPool(world, target.x, target.y, target.type === EntityType.MONSTER);
        msgs.push({ text: `${e.name ?? 'NPC'} ${e.isFemale ? 'убила' : 'убил'} ${target.name ?? 'цель'}`, time: _time, color: '#fa4' });
        // Fog boss killed by NPC — clear fog in zone
        if (target.isFogBoss && target.fogBossZone !== undefined) {
          const zone = world.zones[target.fogBossZone];
          if (zone) {
            zone.fogged = false;
            for (let i = 0; i < W * W; i++) {
              if (world.zoneMap[i] === target.fogBossZone) world.fog[i] = 0;
            }
            msgs.push({ text: `Туман в зоне ${target.fogBossZone} рассеялся!`, time: _time, color: '#4f4' });
          }
        }
      }
    }
    e.attackCd = NPC_COMBAT_CD;
  }
  return true;
}

/* ── Force NPCs to hide (called by samosbor) ─────────────────── */
/* Citizens and scientists hide. Liquidators and cultists do not. */
export function forceHide(entities: Entity[]): void {
  for (const e of entities) {
    if (e.type === EntityType.NPC && e.alive && e.ai) {
      // Liquidators, cultists and wilds don't hide during samosbor
      if (e.faction === Faction.LIQUIDATOR || e.faction === Faction.CULTIST || e.faction === Faction.WILD) continue;
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
