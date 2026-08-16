/* ── Faction-to-faction relation system ───────────────────────── */

import { Faction, Occupation } from '../core/types';
import { OCCUPATION_PROFILES } from './occupation_profiles';
import { rng } from '../core/rand';

/* ── Constants ────────────────────────────────────────────────── */
export const FACTION_COUNT = 6; // CITIZEN, LIQUIDATOR, CULTIST, SCIENTIST, WILD, PLAYER

/* ── Dynamic faction relation matrix — Int8Array flat ────────── */
// factionRels[a * FACTION_COUNT + b] = how faction a feels about faction b (-128..127)
const factionRels = new Int8Array(FACTION_COUNT * FACTION_COUNT);

/* ── Get / set / add faction relation ─────────────────────────── */
export function getFactionRel(a: number, b: number): number {
  return factionRels[a * FACTION_COUNT + b];
}

export function setFactionRel(a: number, b: number, v: number): void {
  factionRels[a * FACTION_COUNT + b] = Math.max(-128, Math.min(127, v | 0));
}

export function addFactionRel(a: number, b: number, delta: number): void {
  setFactionRel(a, b, getFactionRel(a, b) + delta);
}

export function addFactionRelMutual(a: number, b: number, delta: number): void {
  addFactionRel(a, b, delta);
  addFactionRel(b, a, delta);
}

/* ── Наборы дельт: словарь мутаций матрицы ────────────────────── */
// Живут рядом с матрицей, а не в systems/factions: это её собственный
// вокабуляр, и любой системе (пропуска, контейнеры, панели) он нужен без
// остальной фракционной логики — иначе получается импортный цикл.
export type FactionRelationDelta = readonly [Faction, number];

export function applyFactionRelationDeltas(
  deltas: readonly FactionRelationDelta[],
  actor: Faction = Faction.PLAYER,
): Record<string, number> {
  const applied: Record<string, number> = {};
  for (const [faction, delta] of deltas) {
    if (delta === 0) continue;
    addFactionRelMutual(actor, faction, delta);
    applied[Faction[faction] ?? String(faction)] = (applied[Faction[faction] ?? String(faction)] ?? 0) + delta;
  }
  return applied;
}

/* ── Узкий социальный штраф за замеченную/выявленную кражу ────── */
export function applyTheftRelationPenalty(
  victimFaction: Faction | undefined,
  witnessed: boolean,
  audited: boolean,
): number {
  if (victimFaction === undefined || victimFaction === Faction.PLAYER) return 0;
  if (!witnessed && !audited) return 0;

  const penalty = witnessed ? -4 : -2;
  addFactionRelMutual(victimFaction, Faction.PLAYER, penalty);
  return penalty;
}

export function applyRoomMemoryRelationPenalty(victimFaction: Faction | undefined, severity: number): number {
  if (victimFaction === undefined || victimFaction === Faction.PLAYER) return 0;
  const penalty = severity >= 5 ? -2 : -1;
  addFactionRelMutual(victimFaction, Faction.PLAYER, penalty);
  return penalty;
}

export function applyInfrastructureRelationResponse(
  ownerFaction: Faction | null | undefined,
  action: 'repair' | 'shutdown' | 'force' | 'overload',
): number {
  if (ownerFaction === null || ownerFaction === undefined || ownerFaction === Faction.PLAYER) return 0;
  const delta = action === 'repair'
    ? (ownerFaction === Faction.WILD ? 0 : 1)
    : action === 'shutdown'
      ? -1
      : action === 'force'
        ? -2
        : -4;
  if (delta !== 0) addFactionRelMutual(Faction.PLAYER, ownerFaction, delta);
  return delta;
}

/* ── Base faction attitudes (used for initialization) ─────────── */
// [row faction][col faction] = base attitude
// <=−50 hostile, −50..50 neutral, >=50 friendly
const BASE_FACTION_MATRIX: number[][] = [
  /*                CIT   LIQ   CUL   SCI   WILD  PLAYER */
  /* CITIZEN  */ [  100,   50,    0,   50,  -50,    50 ],
  /* LIQUID.  */ [   50,  100,  -50,   50,  -50,    50 ],
  /* CULTIST  */ [    0,  -50,  100,  -20,  -50,     0 ],
  /* SCIENTIST*/ [   50,   50,  -20,  100,  -50,    50 ],
  /* WILD     */ [  -50,  -50,  -50,  -50,  100,   -50 ],
  /* PLAYER   */ [   50,   50,    0,   50,  -50,   100 ],
];

/* ── Initialize dynamic faction relations from base matrix ────── */
export function initFactionRelations(): void {
  for (let a = 0; a < FACTION_COUNT; a++) {
    for (let b = 0; b < FACTION_COUNT; b++) {
      setFactionRel(a, b, BASE_FACTION_MATRIX[a][b]);
    }
  }
}

/* ── Reset only the PLAYER row/column to base (death-continuation) ─ */
// On death-rebirth the player continues as a different body. Faction↔faction
// politics stay as persistent world state, but the player's personal standing
// resets: the reborn actor is not recognized as "the player". Only PLAYER's
// row (how the player feels) and column (how others feel about the player) revert.
export function resetPlayerFactionRelations(): void {
  const p = Faction.PLAYER;
  for (let f = 0; f < FACTION_COUNT; f++) {
    setFactionRel(p, f, BASE_FACTION_MATRIX[p][f]);
    setFactionRel(f, p, BASE_FACTION_MATRIX[f][p]);
  }
}

/* ── Snapshot / restore the dynamic matrix for save persistence ─── */
// The matrix is persistent world state that must survive save/load. Snapshot is
// a flat FACTION_COUNT² array of Int8 relation values; restore overlays a saved
// snapshot onto the current (base-initialized) matrix and ignores malformed input.
export function snapshotFactionRelations(): number[] {
  return Array.from(factionRels);
}

export function restoreFactionRelations(input: unknown): void {
  if (!Array.isArray(input) || input.length !== FACTION_COUNT * FACTION_COUNT) return;
  for (let i = 0; i < input.length; i++) {
    const v = input[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    factionRels[i] = Math.max(-128, Math.min(127, v | 0));
  }
}



/* ── Faction names ────────────────────────────────────────────── */
export const FACTION_NAMES: Record<Faction, string> = {
  [Faction.CITIZEN]: 'Гражданин',
  [Faction.LIQUIDATOR]: 'Ликвидатор',
  [Faction.CULTIST]: 'Культист',
  [Faction.SCIENTIST]: 'Учёный',
  [Faction.WILD]: 'Дикий',
  [Faction.PLAYER]: 'Игрок',
};

/* ── Occupation names ─────────────────────────────────────────── */
export const OCCUPATION_NAMES: Record<Occupation, string> = {
  ...Object.fromEntries(Object.values(OCCUPATION_PROFILES).map(profile => [profile.occupation, profile.label])),
} as Record<Occupation, string>;

/* ── Weighted faction/occupation assignment ────────────────────── */
export function randomFaction(): Faction {
  const r = rng();
  if (r < 0.40) return Faction.CITIZEN;
  if (r < 0.60) return Faction.LIQUIDATOR;
  if (r < 0.75) return Faction.CULTIST;
  if (r < 0.90) return Faction.SCIENTIST;
  return Faction.WILD;
}

/* ── Weighted occupation distribution (faction-independent) ───── */
// домохозяйка 10%, слесарь 10%, секретарь 10%, электрик 10%, повар 5%,
// врач 5%, токарь 10%, механик 10%, кладовщик 10%, алкоголик 5%,
// учёный 5%, ребёнок 10%, директор 1%
const OCC_WEIGHTS: [Occupation, number][] = Object.values(OCCUPATION_PROFILES)
  .filter(profile => profile.defaultGenerationWeight > 0)
  .map(profile => [profile.occupation, profile.defaultGenerationWeight] as [Occupation, number]);
const OCC_TOTAL = OCC_WEIGHTS.reduce((s, [, w]) => s + w, 0);

export function randomOccupation(_faction: Faction): Occupation {
  let r = rng() * OCC_TOTAL;
  for (const [occ, w] of OCC_WEIGHTS) {
    r -= w;
    if (r <= 0) return occ;
  }
  return Occupation.HOUSEWIFE;
}
