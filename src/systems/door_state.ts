import { DoorState, EntityType, type Door, type Entity } from '../core/types';
import type { World } from '../core/world';
import { markNavigationCellsDirty } from './ai/pathfinding';
import { MONSTERS } from '../entities/monster';

function blocksNavigation(state: DoorState): boolean {
  // Ordinary closed doors are actor/interaction state, not navigation topology.
  return state === DoorState.LOCKED || state === DoorState.HERMETIC_CLOSED;
}

export function setDoorState(world: World, door: Door | undefined, state: DoorState): boolean {
  if (!door || door.state === state) return false;
  const oldBlocks = blocksNavigation(door.state);
  door.state = state;
  // Картинке важна ЛЮБАЯ смена створки, а не только та, что меняет топологию:
  // ниже `cellVersion` бампится лишь на переходах через LOCKED/HERMETIC.
  world.markDoorsDirty();
  if (oldBlocks !== blocksNavigation(state)) {
    markNavigationCellsDirty([door.idx]);
    world.markCellsDirty();
  }
  return true;
}

/**
 * Base HP a door gets on first damage, by state. Explicit so future data can
 * override per-door (armor, material) without touching callers.
 */
function defaultDoorMaxHp(state: DoorState): number {
  if (state === DoorState.HERMETIC_CLOSED) return 500;
  if (state === DoorState.LOCKED) return 150;
  return 50;
}

/**
 * Apply `amount` damage to a door. A broken door is DESTROYED (removed → floor),
 * not opened — everything in the structure is destructible, and a smashed door
 * leaves a real hole, not a swinging leaf that auto-closes behind the attacker.
 * Returns true if this hit broke the door.
 */
export function damageDoor(world: World, door: Door, amount: number): boolean {
  if (door.state === DoorState.OPEN || door.state === DoorState.HERMETIC_OPEN) {
    return false; // Cannot damage open doors
  }

  if (door.maxHp === undefined || door.hp === undefined) {
    door.maxHp = defaultDoorMaxHp(door.state);
    door.hp = door.maxHp;
  }

  door.hp -= amount;
  // Треснувшая створка рисуется иначе — рендер держит признак «hp ниже
  // половины» отдельным битом, и заметить его он может только по версии.
  world.markDoorsDirty();

  if (door.hp <= 0) {
    // Destroy: DOOR cell → FLOOR, drop from room.doors, bump dirty versions.
    // removeDoorAt() calls markCellsDirty() (cellVersion++), so the accept-stale
    // nav layer re-syncs on the next query; the live subcell mask reads the new
    // FLOOR immediately, so actors path through the hole with no rebake.
    world.removeDoorAt(door.idx);
    markNavigationCellsDirty([door.idx]);
    return true; // Door was broken
  }
  return false; // Door damaged but not broken
}

/**
 * Universal actor↔door interaction dispatcher. Every actor that walks into a
 * door goes through here, so "who may open what" lives in ONE place:
 *
 *  - People (NPC / player-kind) OPEN an ordinary CLOSED door. LOCKED and
 *    HERMETIC doors are barriers — they need a key or a panel, never auto-open.
 *  - Monsters cannot operate a handle: if they are pressed against a blocking
 *    door they BASH it on their own attack cadence (attackCd), dealing melee
 *    damage until it breaks (or they get distracted and path elsewhere).
 *
 * The subcell nav layer already treats a CLOSED door as passable, so pathing is
 * unchanged; this only decides what physically happens on contact. Returns true
 * if the contact resolved into a state change (opened / bashed / broken).
 */
export function actorContactDoor(world: World, e: Entity, doorIdx: number): boolean {
  const door = world.doors.get(doorIdx);
  if (!door) return false;
  if (door.state === DoorState.OPEN || door.state === DoorState.HERMETIC_OPEN) return false;

  if (e.type === EntityType.MONSTER) {
    // Monsters bash. Only a blocking leaf is worth hitting (a plain CLOSED door
    // still physically blocks them via world.solid()).
    if ((e.attackCd ?? 0) > 0) return false;
    const def = e.monsterKind !== undefined ? MONSTERS[e.monsterKind] : undefined;
    if (!def) return false;
    e.attackCd = def.attackRate;
    return damageDoor(world, door, def.dmg);
  }

  // People operate the handle: ordinary closed doors only.
  if (door.state === DoorState.CLOSED) {
    setDoorState(world, door, DoorState.OPEN);
    door.timer = 5;
    return true;
  }
  return false;
}
