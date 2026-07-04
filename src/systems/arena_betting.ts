import { Entity, GameState } from '../core/types';
import { getWeaponStats } from './inventory';
import { publishEvent } from './events';
import { transferMoney } from './inventory';
import { ITEMS } from '../data/catalog';
import { getCurrentPlayerEntity } from './player_actor';

export interface ArenaBet {
  amount: number;
  targetEntityId: string;
  odds: number;
}

let currentActiveBet: ArenaBet | null = null;

export function calculateCombatScore(fighter: Entity): number {
  let score = Math.max(0, fighter.hp || 0);
  if (fighter.armorDefId) {
    const armorDef = ITEMS[fighter.armorDefId];
    if (armorDef) {
       score += 50;
    }
  }
  if (fighter.weapon) {
    const stats = getWeaponStats(fighter, fighter.weapon);
    if (stats) {
      score += (stats.dmg || 0) * 10;
    }
  }
  return score;
}

export function calculateOdds(fighterA: Entity, fighterB: Entity): { oddsA: number; oddsB: number } {
  const scoreA = calculateCombatScore(fighterA);
  const scoreB = calculateCombatScore(fighterB);

  if (scoreA <= 0 || scoreB <= 0 || isNaN(scoreA) || isNaN(scoreB)) {
    return { oddsA: 1.1, oddsB: 1.1 };
  }

  const total = scoreA + scoreB;
  const margin = 0.90; // Casino takes 10%

  return {
    oddsA: Math.max(1.1, (total / scoreA) * margin),
    oddsB: Math.max(1.1, (total / scoreB) * margin),
  };
}

export function placeBet(state: GameState, player: Entity, amount: number, fighterId: string, odds: number): boolean {
  if (amount <= 0) return false;
  if ((player.money ?? 0) >= amount && currentActiveBet === null) {
    if (transferMoney(player, null, amount)) {
      currentActiveBet = { amount, targetEntityId: fighterId, odds };
      publishEvent(state, {
        type: 'arena_bet_placed' as any,
        tags: ['arena', 'betting'],
        severity: 2,
        privacy: 'public',
        data: { amount, odds, fighterId },
      });
      return true;
    }
  }
  return false;
}

export function onArenaDuelEnded(state: GameState, entities: readonly Entity[], winnerId: string): void {
  if (!currentActiveBet) return;

  if (currentActiveBet.targetEntityId === winnerId) {
    const payout = Math.floor(currentActiveBet.amount * currentActiveBet.odds);
    const player = getCurrentPlayerEntity(entities);
    if (player && transferMoney(null, player, payout)) {
      publishEvent(state, {
        type: 'arena_bet_won' as any,
        tags: ['arena', 'betting'],
        severity: 3,
        privacy: 'private',
        data: { payout },
      });
    }
  } else {
    publishEvent(state, {
      type: 'arena_bet_lost' as any,
      tags: ['arena', 'betting'],
      severity: 2,
      privacy: 'private',
      data: { lostAmount: currentActiveBet.amount },
    });
  }

  currentActiveBet = null;
}

export function clearActiveBet(): void {
  currentActiveBet = null;
}

export function getCurrentActiveBet(): ArenaBet | null {
  return currentActiveBet;
}
