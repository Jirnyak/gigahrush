import { Entity, EntityType, GameState, LiftDirection, msg } from '../core/types';
import { World } from '../core/world';
import { getPlotNpcNumericId } from '../data/npc_packages';
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
  npcId: number;
  fighterA: Entity | null;
  fighterB: Entity | null;
  oddsA: number;
  oddsB: number;
  ctx: NpcInteractionContext | null;
} = {
  open: false,
  selection: 0,
  npcId: -1,
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
  // Pick the first two alive NPCs that are not the arena runners (matched by stable plot id,
  // not display name). Unregistered ids resolve to undefined and simply never match a real NPC.
  const markoId = getPlotNpcNumericId('marko_lolo');
  const masterId = getPlotNpcNumericId('arena_master');
  let fighterA: Entity | null = null;
  let fighterB: Entity | null = null;

  for (const e of entities) {
    if (e.alive && e.type === EntityType.NPC && e.id !== markoId && e.id !== masterId) {
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
  arenaRuntime.npcId = ctx.npc.id;
  arenaRuntime.ctx = ctx;
  // Marko Lolo is the ring promoter: talking to him jumps straight to the "enter arena" action.
  const enterOnly = ctx.npc.id === getPlotNpcNumericId('marko_lolo');
  arenaRuntime.selection = enterOnly ? 6 : 0;

  if (!enterOnly) {
    const { fighterA, fighterB } = findFighters(ctx.entities ?? []);
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
  const max = 6; // selections 0..6 (see the selection legend below)
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

export function activateArenaSelection(ctx: { world: World; state: GameState; player?: Entity; switchFloor?: (direction: LiftDirection, message?: string, color?: string, allowElevatorAnomaly?: boolean, targetZ?: number) => void }): void {
  const enterOnly = arenaRuntime.npcId === getPlotNpcNumericId('marko_lolo');
  if (enterOnly || arenaRuntime.selection === 6) {
    if (ctx.player) {
      // Teleport into the middle of the arena ring by scanning for the tagged arena room on the
      // current floor (de-hardcoded from fixed coords that could land the player inside a wall).
      const arena = ctx.world.rooms.find(r => r?.tags?.includes('arena'));
      if (arena) {
        ctx.player.x = ctx.world.wrap(arena.x + Math.floor(arena.w / 2)) + 0.5;
        ctx.player.y = ctx.world.wrap(arena.y + Math.floor(arena.h / 2)) + 0.5;
      }
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
