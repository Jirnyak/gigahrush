/* ── Generic route gate predicates and direction guards ───────── */

import { QuestType, GameState, Quest } from '../core/types';
import { ROUTE_GATE_DEFS, type RouteGateDef, type RouteGatePredicate } from '../data/route_gates';

function questKillPredicateOpen(quest: Quest, predicate: Extract<RouteGatePredicate, { kind: 'quest_kill' }>): boolean {
  if (quest.type !== QuestType.KILL) return false;
  if (quest.targetMonsterKind !== predicate.monsterKind) return false;
  if ((quest.killNeeded ?? 0) < predicate.killNeeded) return false;
  if (predicate.eventTag && !quest.eventTags?.includes(predicate.eventTag)) return false;
  if (quest.done && predicate.doneCounts !== false) return true;
  return (quest.killCount ?? 0) >= predicate.killNeeded;
}

export function routeGatePredicateOpen(state: GameState, predicate: RouteGatePredicate): boolean {
  if (predicate.kind === 'quest_kill') {
    return state.quests.some(quest => questKillPredicateOpen(quest, predicate));
  }
  return false;
}

export function routeGateOpen(state: GameState, gate: RouteGateDef): boolean {
  return routeGatePredicateOpen(state, gate.predicate);
}

export function openRouteGateIds(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const gate of ROUTE_GATE_DEFS) {
    if (routeGateOpen(state, gate)) out.add(gate.id);
  }
  return out;
}

export function routeGateMatchesDirection(gate: RouteGateDef, floorKey: string, direction: number): boolean {
  return gate.targetFloorKey === floorKey && gate.blockedDirection === direction;
}

export function routeGateDirectionIsClosed(
  floorKey: string,
  direction: number,
  openGateIds: ReadonlySet<string> | undefined,
): boolean {
  return ROUTE_GATE_DEFS.some(gate =>
    routeGateMatchesDirection(gate, floorKey, direction) &&
    !openGateIds?.has(gate.id));
}

export function routeDirectionBlockedByClosedGate(
  floorKey: string,
  direction: number,
  state: GameState,
): boolean {
  const open = openRouteGateIds(state);
  return routeGateDirectionIsClosed(floorKey, direction, open);
}

export function openRouteGatesForFloor(floorKey: string, state: GameState): RouteGateDef[] {
  const open = openRouteGateIds(state);
  return ROUTE_GATE_DEFS.filter(gate => gate.targetFloorKey === floorKey && open.has(gate.id));
}
