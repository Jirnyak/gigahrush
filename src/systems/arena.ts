import { Entity, EntityType, GameState, LiftDirection, msg } from '../core/types';
import { World } from '../core/world';
import { getPlotNpcNumericId } from '../data/npc_packages';
import { NpcInteractionContext } from './npc_interaction_options';
import { placeBet, calculateOdds, onArenaDuelEnded, refundActiveBet, getCurrentActiveBet } from './arena_betting';
import {
  findArenaRoom, getArenaLadderView, isArenaPlayerBoutActive,
  requestArenaChallenge, requestArenaMutantBout,
} from './arena_ladder';
import { forceCombatThreat } from './combat_stimulus';
import { getEntityIndex } from './entity_index';

/* Что предлагает распорядитель песка. Список СОБИРАЕТСЯ при открытии меню, а не
 * задан номерами: ступень лестницы зависит от того, кто сейчас жив, а прежняя
 * нумерация «6 значит выйти» ломалась от любой новой строки. */
type ArenaAction =
  | { kind: 'bet'; onA: boolean; amount: number }
  | { kind: 'challenge'; alifeId: number }
  | { kind: 'mutants' }
  | { kind: 'enter' };

interface ArenaMenuEntry {
  label: string;
  action: ArenaAction;
}

export interface ArenaOverlaySnapshot {
  open: boolean;
  selection: number;
  championLine: string;
  options: readonly string[];
}

export const arenaRuntime: {
  open: boolean;
  selection: number;
  npcId: number;
  fighterA: Entity | null;
  fighterB: Entity | null;
  oddsA: number;
  oddsB: number;
  championLine: string;
  entries: ArenaMenuEntry[];
  ctx: NpcInteractionContext | null;
} = {
  open: false,
  selection: 0,
  npcId: -1,
  fighterA: null,
  fighterB: null,
  oddsA: 1.1,
  oddsB: 1.1,
  championLine: '',
  entries: [],
  ctx: null,
};

export function isArenaOverlayOpen(): boolean {
  return arenaRuntime.open;
}

/**
 * Двое на ставочный бой.
 *
 * Сначала — бойцы лестницы, стоящие на этаже: ставят на тех, кто и так дерётся
 * за место. Если их меньше двух, берётся кто есть, кроме распорядителя песка.
 * Слоты приходят из замороженного списка npc_plot_ids.ts, поэтому числа
 * определены всегда, независимо от того, загружен ли контент. Сравнивается СЛОТ
 * личности (`alifeId`): номер сущности личности больше не равен слоту.
 */
function findFighters(state: GameState, entities: readonly Entity[]): { fighterA: Entity | null, fighterB: Entity | null } {
  const markoId = getPlotNpcNumericId('marko_lolo');
  const ladder = new Set(getArenaLadderView(state).fighters.map(f => f.id));
  const picked: Entity[] = [];

  for (const pass of [true, false]) {
    for (const e of entities) {
      if (picked.length >= 2) break;
      if (!e.alive || e.type !== EntityType.NPC || e.alifeId === markoId) continue;
      if (pass !== (e.alifeId !== undefined && ladder.has(e.alifeId))) continue;
      if (picked.includes(e)) continue;
      picked.push(e);
    }
  }

  return { fighterA: picked[0] ?? null, fighterB: picked[1] ?? null };
}

const BET_AMOUNTS = [50, 100, 500] as const;

/** Список распорядителя песка на этот заход. */
function buildArenaMenu(ctx: NpcInteractionContext): ArenaMenuEntry[] {
  const entries: ArenaMenuEntry[] = [];
  const ladder = getArenaLadderView(ctx.state);

  if (ladder.playerIsChampion) {
    entries.push({ label: 'Титул за вами — ждите претендента', action: { kind: 'enter' } });
  } else if (ladder.next) {
    const rung = `ступень ${ladder.nextRung} из ${ladder.fighters.length}`;
    entries.push({
      label: `Вызвать: ${ladder.next.name} (${rung}, ур. ${ladder.next.level})`,
      action: { kind: 'challenge', alifeId: ladder.next.id },
    });
  }

  const { fighterA, fighterB } = arenaRuntime;
  if (fighterA && fighterB) {
    for (const onA of [true, false]) {
      const fighter = onA ? fighterA : fighterB;
      const odds = onA ? arenaRuntime.oddsA : arenaRuntime.oddsB;
      for (const amount of BET_AMOUNTS) {
        entries.push({
          label: `Поставить ${amount}₽ на ${fighter.name} (x${odds.toFixed(2)})`,
          action: { kind: 'bet', onA, amount },
        });
      }
    }
  }

  entries.push({ label: 'Бой с мутантами', action: { kind: 'mutants' } });
  entries.push({ label: 'Выйти на арену', action: { kind: 'enter' } });
  return entries;
}

export function openArena(ctx: NpcInteractionContext): void {
  arenaRuntime.open = true;
  arenaRuntime.npcId = ctx.npc.id;
  arenaRuntime.ctx = ctx;
  arenaRuntime.selection = 0;

  const { fighterA, fighterB } = findFighters(ctx.state, ctx.entities ?? []);
  arenaRuntime.fighterA = fighterA;
  arenaRuntime.fighterB = fighterB;
  if (fighterA && fighterB) {
    const { oddsA, oddsB } = calculateOdds(fighterA, fighterB);
    arenaRuntime.oddsA = oddsA;
    arenaRuntime.oddsB = oddsB;
  }

  arenaRuntime.championLine = `ЧЕМПИОН: ${getArenaLadderView(ctx.state).championName}`;
  arenaRuntime.entries = buildArenaMenu(ctx);

  ctx.state.showNpcMenu = false;
  ctx.state.paused = true;
}

export function closeArena(): void {
  arenaRuntime.open = false;
  arenaRuntime.ctx = null;
}

export function moveArenaSelection(delta: number): void {
  const max = arenaRuntime.entries.length - 1;
  if (max < 0) return;
  arenaRuntime.selection += delta;
  if (arenaRuntime.selection < 0) arenaRuntime.selection = max;
  if (arenaRuntime.selection > max) arenaRuntime.selection = 0;
}

export function activateArenaSelection(ctx: { world: World; state: GameState; player?: Entity; switchFloor?: (direction: LiftDirection, message?: string, color?: string, allowElevatorAnomaly?: boolean, targetZ?: number) => void }): void {
  const entry = arenaRuntime.entries[arenaRuntime.selection];
  if (!entry) return;
  const action = entry.action;

  if (action.kind === 'enter') {
    enterArenaRing(ctx.world, ctx.state, ctx.player);
    closeArena();
    return;
  }

  if (action.kind === 'challenge' || action.kind === 'mutants') {
    if (isArenaPlayerBoutActive()) {
      ctx.state.msgs.push(msg('Бой уже идёт.', ctx.state.time, '#f44'));
      return;
    }
    if (action.kind === 'challenge') requestArenaChallenge(action.alifeId);
    else requestArenaMutantBout();
    closeArena();
    return;
  }

  const fighterA = arenaRuntime.fighterA;
  const fighterB = arenaRuntime.fighterB;
  if (!fighterA || !fighterB || !ctx.player) return;
  const fighter = action.onA ? fighterA : fighterB;
  const odds = action.onA ? arenaRuntime.oddsA : arenaRuntime.oddsB;

  if (placeBet(ctx.state, ctx.player, action.amount, String(fighter.id), odds)) {
    ctx.state.msgs.push(msg(`Ставка принята: ${action.amount}₽ на ${fighter.name} (x${odds.toFixed(2)}).`, ctx.state.time, '#4cf'));
    startArenaDuel(ctx.world, ctx.state, fighterA, fighterB);
    closeArena();
  } else {
    ctx.state.msgs.push(msg('Недостаточно средств или ставка уже сделана.', ctx.state.time, '#f44'));
  }
}

/** Просто выйти на песок, без боя. Комната ищется по тегу, а не по координатам:
 *  фиксированные числа роняли игрока в стену. */
function enterArenaRing(world: World, state: GameState, player: Entity | undefined): void {
  if (!player) return;
  const arena = findArenaRoom(world);
  if (arena) {
    player.x = world.wrap(arena.x + Math.floor(arena.w / 2)) + 0.5;
    player.y = world.wrap(arena.y + Math.floor(arena.h / 2)) + 0.5;
  }
  state.msgs.push(msg('Вы выходите на арену.', state.time, '#f66'));
}

/* ── Duel simulation ──────────────────────────────────────────────
 * The two fighters really fight through the normal combat AI: each gets a forced
 * 'fight' threat memory pointing at the other (re-applied on a cadence so it never
 * expires mid-duel). First death settles the active bet via onArenaDuelEnded; a
 * fizzled duel (timeout / fighter vanished off-floor) refunds the stake. Deaths are
 * real persistent A-Life facts — arena bouts are lethal by design. */
const DUEL_TIMEOUT_S = 180;
const DUEL_THREAT_CADENCE_S = 2;

let activeDuel: { aId: number; bId: number; elapsed: number; threatAccum: number } | null = null;

function startArenaDuel(world: World, state: GameState, a: Entity, b: Entity): void {
  // Teleport both fighters into the arena ring (same tag scan as the player entry).
  const arena = findArenaRoom(world);
  if (arena) {
    const cx = arena.x + Math.floor(arena.w / 2);
    const cy = arena.y + Math.floor(arena.h / 2);
    a.x = world.wrap(cx - 2) + 0.5; a.y = world.wrap(cy) + 0.5;
    b.x = world.wrap(cx + 2) + 0.5; b.y = world.wrap(cy) + 0.5;
  }
  forceCombatThreat(a, b, state.time);
  forceCombatThreat(b, a, state.time);
  activeDuel = { aId: a.id, bId: b.id, elapsed: 0, threatAccum: 0 };
  state.msgs.push(msg('Бой начался! Бойцы сходятся на арене.', state.time, '#fa4'));
}

export function updateArenaDuel(state: GameState, entities: readonly Entity[], dt: number): void {
  if (!activeDuel) return;
  activeDuel.elapsed += dt;
  activeDuel.threatAccum += dt;
  if (activeDuel.threatAccum < DUEL_THREAT_CADENCE_S) return;
  activeDuel.threatAccum = 0;

  const byId = getEntityIndex().byId;
  const a = byId.get(activeDuel.aId);
  const b = byId.get(activeDuel.bId);
  const aAlive = a?.alive === true;
  const bAlive = b?.alive === true;

  if (aAlive && bAlive) {
    if (activeDuel.elapsed >= DUEL_TIMEOUT_S) {
      // Fizzle: nobody died — return the stake.
      if (getCurrentActiveBet()) refundActiveBet(state, entities);
      state.msgs.push(msg('Бой затянулся и объявлен несостоявшимся. Ставка возвращена.', state.time, '#cc9'));
      activeDuel = null;
      return;
    }
    forceCombatThreat(a!, b!, state.time);
    forceCombatThreat(b!, a!, state.time);
    return;
  }

  if (!aAlive && !bAlive) {
    // Both gone (double kill or despawned): no winner, refund.
    if (getCurrentActiveBet()) refundActiveBet(state, entities);
    state.msgs.push(msg('Оба бойца выбыли. Ставка возвращена.', state.time, '#cc9'));
  } else {
    const winner = aAlive ? a! : b!;
    onArenaDuelEnded(state, entities, String(winner.id));
    state.msgs.push(msg(`Бой окончен. Победитель: ${winner.name ?? 'боец'}.`, state.time, '#4cf'));
  }
  activeDuel = null;
}

export function resetArenaDuel(): void {
  activeDuel = null;
}

export function getArenaOverlaySnapshot(): ArenaOverlaySnapshot {
  return {
    open: arenaRuntime.open,
    selection: arenaRuntime.selection,
    championLine: arenaRuntime.championLine,
    options: arenaRuntime.entries.map(entry => entry.label),
  };
}
