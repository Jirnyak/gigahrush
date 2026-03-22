/* ── NPC relation matrix + faction data ───────────────────────── */

import { Faction, Occupation } from '../core/types';

export const MAX_NPC = 1024;

/* ── NxN relation array — Int8Array flat ─────────────────────── */
// relations[a * MAX_NPC + b] = how entity a feels about entity b (-128..127)
// Index 0 = player; NPC indices = 1..N
export const relations = new Int8Array(MAX_NPC * MAX_NPC);

/* ── Get / set relation ───────────────────────────────────────── */
export function getRel(a: number, b: number): number {
  return relations[a * MAX_NPC + b];
}

export function setRel(a: number, b: number, v: number): void {
  relations[a * MAX_NPC + b] = Math.max(-128, Math.min(127, v | 0));
}

export function addRel(a: number, b: number, delta: number): void {
  setRel(a, b, getRel(a, b) + delta);
}

/* ── Mutual relation change (both directions) ────────────────── */
export function addRelMutual(a: number, b: number, delta: number): void {
  addRel(a, b, delta);
  addRel(b, a, delta);
}

/* ── Initialize relations for all NPCs ────────────────────────── */
export function initRelations(
  npcSlots: { relIdx: number; familyId: number; faction: Faction }[],
): void {
  relations.fill(0);

  for (let i = 0; i < npcSlots.length; i++) {
    const a = npcSlots[i];
    for (let j = i + 1; j < npcSlots.length; j++) {
      const b = npcSlots[j];
      let base = 0;
      // Family bonus
      if (a.familyId >= 0 && a.familyId === b.familyId) base += 60;
      // Same faction bonus
      if (a.faction === b.faction) base += 20;
      // Cross-faction
      base += FACTION_MATRIX[a.faction][b.faction];

      setRel(a.relIdx, b.relIdx, base);
      setRel(b.relIdx, a.relIdx, base);
    }
    // Player starts neutral/slightly positive with everyone
    setRel(0, a.relIdx, 5);
    setRel(a.relIdx, 0, 5);
  }
}

/* ── Faction cross-relation matrix ────────────────────────────── */
// [row faction][col faction] = base attitude modifier
const FACTION_MATRIX: Record<Faction, Record<Faction, number>> = {
  [Faction.CITIZEN]:    { [Faction.CITIZEN]: 0, [Faction.LIQUIDATOR]: 10, [Faction.CULTIST]: -10, [Faction.SCIENTIST]: 5 },
  [Faction.LIQUIDATOR]: { [Faction.CITIZEN]: 10, [Faction.LIQUIDATOR]: 0, [Faction.CULTIST]: -30, [Faction.SCIENTIST]: 15 },
  [Faction.CULTIST]:    { [Faction.CITIZEN]: -10, [Faction.LIQUIDATOR]: -30, [Faction.CULTIST]: 0, [Faction.SCIENTIST]: -20 },
  [Faction.SCIENTIST]:  { [Faction.CITIZEN]: 5, [Faction.LIQUIDATOR]: 15, [Faction.CULTIST]: -20, [Faction.SCIENTIST]: 0 },
};

/* ── Faction names ────────────────────────────────────────────── */
export const FACTION_NAMES: Record<Faction, string> = {
  [Faction.CITIZEN]: 'Гражданин',
  [Faction.LIQUIDATOR]: 'Ликвидатор',
  [Faction.CULTIST]: 'Культист',
  [Faction.SCIENTIST]: 'Учёный',
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
  if (r < 0.50) return Faction.CITIZEN;
  if (r < 0.70) return Faction.LIQUIDATOR;
  if (r < 0.85) return Faction.CULTIST;
  return Faction.SCIENTIST;
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
