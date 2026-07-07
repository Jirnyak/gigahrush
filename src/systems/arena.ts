import { Entity, EntityType, GameState, LiftDirection, msg } from '../core/types';
import { NpcInteractionContext } from './npc_interaction_options';
import { placeBet, calculateOdds } from './arena_betting';

export interface ArenaFighterSnapshot {
  id: string;
  name: string;
  hp: number;
  armor: string;
  weapon: string;
  odds: number;
}

export interface ArenaOverlaySnapshot {
  open: boolean;
  selection: number;
  fighterA?: ArenaFighterSnapshot;
  fighterB?: ArenaFighterSnapshot;
}

export const arenaRuntime: {
  open: boolean;
  selection: number;
  npcName: string;
  fighterA: Entity | null;
  fighterB: Entity | null;
  oddsA: number;
  oddsB: number;
  ctx: NpcInteractionContext | null;
} = {
  open: false,
  selection: 0,
  npcName: '',
  fighterA: null,
  fighterB: null,
  oddsA: 1.1,
  oddsB: 1.1,
  ctx: null,
};

export function isArenaOverlayOpen(): boolean {
  return arenaRuntime.open;
}

function findFighters(entities: readonly Entity[]): { fighterA: Entity | null, fighterB: Entity | null } {
  // Let's pretend there are entities with "arena_fighter" tags or we just pick 2 random alife NPCs.
  // Wait, if marx_15 implemented arena battles, the combatants might have a specific property.
  // We'll just look for alive NPCs that are close, or just create mocks for now.
  let fighterA = null;
  let fighterB = null;

  // Just take any two different NPCs
  for (const e of entities) {
    if (e.alive && e.type === EntityType.NPC && e.name !== 'Мастер Арены' && e.name !== 'Марко Лоло') {
      if (!fighterA) fighterA = e;
      else if (!fighterB) {
        fighterB = e;
        break;
      }
    }
  }

  return { fighterA, fighterB };
}

export function openArena(ctx: NpcInteractionContext): void {
  arenaRuntime.open = true;
  arenaRuntime.npcName = ctx.npc.name ?? '';
  arenaRuntime.ctx = ctx;
  arenaRuntime.selection = arenaRuntime.npcName === 'Марко Лоло' ? 6 : 0; // selection up to 6 now

  if (arenaRuntime.npcName !== 'Марко Лоло') {
    const { fighterA, fighterB } = findFighters(ctx.entities ?? []); // Note: world from ctx
    arenaRuntime.fighterA = fighterA;
    arenaRuntime.fighterB = fighterB;
    if (fighterA && fighterB) {
      const { oddsA, oddsB } = calculateOdds(fighterA, fighterB);
      arenaRuntime.oddsA = oddsA;
      arenaRuntime.oddsB = oddsB;
    }
  }

  ctx.state.showNpcMenu = false;
  ctx.state.paused = true;
}

export function closeArena(): void {
  arenaRuntime.open = false;
  arenaRuntime.ctx = null;
}

export function moveArenaSelection(delta: number): void {
  const max = arenaRuntime.npcName === 'Марко Лоло' ? 6 : 6;
  arenaRuntime.selection += delta;
  if (arenaRuntime.selection < 0) arenaRuntime.selection = max;
  if (arenaRuntime.selection > max) arenaRuntime.selection = 0;
}

// selections:
// 0: Bet 50 on A
// 1: Bet 100 on A
// 2: Bet 500 on A
// 3: Bet 50 on B
// 4: Bet 100 on B
// 5: Bet 500 on B
// 6: Enter arena / Exit

export function activateArenaSelection(ctx: { state: GameState; player?: Entity; switchFloor?: (direction: LiftDirection, message?: string, color?: string, allowElevatorAnomaly?: boolean, targetZ?: number) => void }): void {
  if (arenaRuntime.npcName === 'Марко Лоло' || arenaRuntime.selection === 6) {
    if (ctx.player) {
      ctx.player.x = 100;
      ctx.player.y = 63;
      ctx.state.msgs.push(msg('Вы выходите на арену.', ctx.state.time, '#f66'));
    }
    closeArena();
  } else {
    if (arenaRuntime.fighterA && arenaRuntime.fighterB && ctx.player) {
      const amounts = [50, 100, 500];
      const fighter = arenaRuntime.selection < 3 ? arenaRuntime.fighterA : arenaRuntime.fighterB;
      const odds = arenaRuntime.selection < 3 ? arenaRuntime.oddsA : arenaRuntime.oddsB;
      const amount = amounts[arenaRuntime.selection % 3];

      const success = placeBet(ctx.state, ctx.player, amount, String(fighter.id), odds);
      if (success) {
        ctx.state.msgs.push(msg(`Ставка принята: ${amount}₽ на ${fighter.name} (x${odds.toFixed(2)}).`, ctx.state.time, '#4cf'));
        closeArena();
      } else {
        ctx.state.msgs.push(msg('Недостаточно средств или ставка уже сделана.', ctx.state.time, '#f44'));
      }
    }
  }
}

export function getArenaOverlaySnapshot(): ArenaOverlaySnapshot {
  return {
    open: arenaRuntime.open,
    selection: arenaRuntime.selection,
    fighterA: arenaRuntime.fighterA ? {
      id: String(arenaRuntime.fighterA.id),
      name: arenaRuntime.fighterA.name || 'Боец А',
      hp: arenaRuntime.fighterA.hp || 0,
      armor: arenaRuntime.fighterA.armorDefId || 'Нет',
      weapon: arenaRuntime.fighterA.weapon || 'Кулаки',
      odds: arenaRuntime.oddsA,
    } : undefined,
    fighterB: arenaRuntime.fighterB ? {
      id: String(arenaRuntime.fighterB.id),
      name: arenaRuntime.fighterB.name || 'Боец Б',
      hp: arenaRuntime.fighterB.hp || 0,
      armor: arenaRuntime.fighterB.armorDefId || 'Нет',
      weapon: arenaRuntime.fighterB.weapon || 'Кулаки',
      odds: arenaRuntime.oddsB,
    } : undefined,
  };
}
