import { Faction, type Entity } from '../core/types';
import {
  RELATION_FRIENDLY_THRESHOLD,
  RELATION_HOSTILE_THRESHOLD,
  RELATION_MAX,
  RELATION_MIN,
  clampRelation,
  getFactionRel,
} from '../data/relations';

// Шкала и пороги — общие, определены в `data/relations.ts`. Здесь только
// личная половина: отношение конкретного человека к игроку.
export { RELATION_FRIENDLY_THRESHOLD, RELATION_HOSTILE_THRESHOLD, RELATION_MAX, RELATION_MIN, clampRelation };
export const NPC_PLAYER_RELATION_FLUCTUATION = 12;
export const QUEST_FACTION_RELATION_DELTA = 1;

export function getFactionPlayerRelation(faction: Faction | undefined): number {
  return getFactionRel(faction ?? Faction.CITIZEN, Faction.PLAYER);
}

export function getNpcPlayerRelation(npc: Entity): number {
  return npc.playerRelation ?? getFactionPlayerRelation(npc.faction);
}

export function setNpcPlayerRelation(npc: Entity, value: number): number {
  const relation = clampRelation(value);
  npc.playerRelation = relation;
  return relation;
}

export function addNpcPlayerRelation(npc: Entity, delta: number): number {
  return setNpcPlayerRelation(npc, getNpcPlayerRelation(npc) + delta);
}

export function isNpcPlayerHostile(npc: Entity): boolean {
  return getNpcPlayerRelation(npc) <= RELATION_HOSTILE_THRESHOLD;
}

export function completedQuestFactionRelationDelta(authoredDelta: number | undefined): number {
  if (authoredDelta === undefined) return QUEST_FACTION_RELATION_DELTA;
  if (authoredDelta > 0) return QUEST_FACTION_RELATION_DELTA;
  return Math.max(RELATION_MIN, Math.min(0, Math.trunc(authoredDelta)));
}

export function completedQuestGiverRelationDelta(authoredDelta: number | undefined, difficulty: number | undefined): number {
  const source = authoredDelta !== undefined
    ? Math.abs(authoredDelta)
    : 8 + Math.max(0, Math.floor(difficulty ?? 0));
  return Math.max(2, Math.min(8, Math.round(source * 0.45)));
}
