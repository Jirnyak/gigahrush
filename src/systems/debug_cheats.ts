import { EntityType, type Entity, type GameState } from '../core/types';

let debugOnePunchMan = false;

export function isDebugOnePunchManEnabled(state?: Pick<GameState, 'trailerMode'>): boolean {
  return debugOnePunchMan || (state?.trailerMode ?? false);
}

export function toggleDebugOnePunchMan(): boolean {
  debugOnePunchMan = !debugOnePunchMan;
  return debugOnePunchMan;
}

export function debugOnePunchMeleeDamage(target: Entity, normalDamage: number): number {
  if (!debugOnePunchMan) return normalDamage;
  if (target.type !== EntityType.MONSTER && target.type !== EntityType.NPC) return normalDamage;
  return Math.max(normalDamage, Math.ceil(target.hp ?? target.maxHp ?? 1));
}

export function keepDebugOnePunchManAlive(player: Entity, state?: Pick<GameState, 'trailerMode'>): void {
  if (!isDebugOnePunchManEnabled(state)) return;
  player.alive = true;
  player.maxHp = Math.max(1, player.maxHp ?? 100);
  player.hp = player.maxHp;
}

