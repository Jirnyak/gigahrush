/* ── Faction-to-faction relation system ───────────────────────── */

import { Faction, Occupation } from '../core/types';

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

/* ── Legacy FACTION_MATRIX (Record form for backward compat) ─── */
export const FACTION_MATRIX: Record<Faction, Record<Faction, number>> = {
  [Faction.CITIZEN]:    { [Faction.CITIZEN]: 100, [Faction.LIQUIDATOR]: 50, [Faction.CULTIST]: 0,   [Faction.SCIENTIST]: 50, [Faction.WILD]: -50, [Faction.PLAYER]: 50 },
  [Faction.LIQUIDATOR]: { [Faction.CITIZEN]: 50, [Faction.LIQUIDATOR]: 100, [Faction.CULTIST]: -50, [Faction.SCIENTIST]: 50, [Faction.WILD]: -50, [Faction.PLAYER]: 50 },
  [Faction.CULTIST]:    { [Faction.CITIZEN]: 0, [Faction.LIQUIDATOR]: -50, [Faction.CULTIST]: 100,  [Faction.SCIENTIST]: -20, [Faction.WILD]: -50, [Faction.PLAYER]: 0 },
  [Faction.SCIENTIST]:  { [Faction.CITIZEN]: 50, [Faction.LIQUIDATOR]: 50, [Faction.CULTIST]: -20, [Faction.SCIENTIST]: 100, [Faction.WILD]: -50, [Faction.PLAYER]: 50 },
  [Faction.WILD]:       { [Faction.CITIZEN]: -50, [Faction.LIQUIDATOR]: -50, [Faction.CULTIST]: -50, [Faction.SCIENTIST]: -50, [Faction.WILD]: 100, [Faction.PLAYER]: -50 },
  [Faction.PLAYER]:     { [Faction.CITIZEN]: 50, [Faction.LIQUIDATOR]: 50, [Faction.CULTIST]: 0, [Faction.SCIENTIST]: 50, [Faction.WILD]: -50, [Faction.PLAYER]: 100 },
};

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
  [Occupation.HOUSEWIFE]:   'Домохозяйка',
  [Occupation.LOCKSMITH]:   'Слесарь',
  [Occupation.SECRETARY]:   'Секретарь',
  [Occupation.ELECTRICIAN]: 'Электрик',
  [Occupation.COOK]:        'Повар',
  [Occupation.DOCTOR]:      'Врач',
  [Occupation.TURNER]:      'Токарь',
  [Occupation.MECHANIC]:    'Механик',
  [Occupation.STOREKEEPER]: 'Кладовщик',
  [Occupation.ALCOHOLIC]:   'Алкоголик',
  [Occupation.SCIENTIST]:   'Учёный',
  [Occupation.CHILD]:       'Ребёнок',
  [Occupation.DIRECTOR]:    'Директор',
  [Occupation.TRAVELER]:    'Путник',
  [Occupation.PILGRIM]:     'Паломник',
  [Occupation.HUNTER]:      'Охотник',
};

/* ── Weighted faction/occupation assignment ────────────────────── */
export function randomFaction(): Faction {
  const r = Math.random();
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
const OCC_WEIGHTS: [Occupation, number][] = [
  [Occupation.HOUSEWIFE,   10],
  [Occupation.LOCKSMITH,   10],
  [Occupation.SECRETARY,   10],
  [Occupation.ELECTRICIAN, 10],
  [Occupation.COOK,         5],
  [Occupation.DOCTOR,       5],
  [Occupation.TURNER,      10],
  [Occupation.MECHANIC,    10],
  [Occupation.STOREKEEPER, 10],
  [Occupation.ALCOHOLIC,    5],
  [Occupation.SCIENTIST,    5],
  [Occupation.CHILD,       10],
  [Occupation.DIRECTOR,     1],
];
const OCC_TOTAL = OCC_WEIGHTS.reduce((s, [, w]) => s + w, 0);

export function randomOccupation(_faction: Faction): Occupation {
  let r = Math.random() * OCC_TOTAL;
  for (const [occ, w] of OCC_WEIGHTS) {
    r -= w;
    if (r <= 0) return occ;
  }
  return Occupation.HOUSEWIFE;
}
