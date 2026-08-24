import { Faction, Occupation } from '../core/types';

export interface WeightedValue<T> {
  value: T;
  weight: number;
}

export interface AlifeFactionProfile {
  faction: Faction;
  id: string;
  baseWeight: number;
  dangerBias: number;
  wealthMult: number;
  floorWeights: Partial<Record<number, number>>;
  occupations: readonly WeightedValue<Occupation>[];
}

export const ALIFE_MAX_LEVEL = 100;

export const ALIFE_FACTION_PROFILES: readonly AlifeFactionProfile[] = [
  {
    id: 'citizens',
    faction: Faction.CITIZEN,
    baseWeight: 45,
    dangerBias: -0.06,
    wealthMult: 1,
    floorWeights: {
      [100]: 1.25,
      [60]: 1.15,
      [30]: 0.75,
      [140]: 0.62,
      [180]: 0.04,
    },
    occupations: [
      { value: Occupation.HOUSEWIFE, weight: 18 },
      { value: Occupation.LOCKSMITH, weight: 12 },
      { value: Occupation.COOK, weight: 10 },
      { value: Occupation.STOREKEEPER, weight: 8 },
      { value: Occupation.CLEANER, weight: 6 },
      { value: Occupation.TRAVELER, weight: 18 },
      { value: Occupation.CHILD, weight: 0 },
      { value: Occupation.SECRETARY, weight: 6 },
      { value: Occupation.DOCTOR, weight: 3 },
      { value: Occupation.PERFORMER, weight: 2 },
    ],
  },
  {
    id: 'liquidators',
    faction: Faction.LIQUIDATOR,
    baseWeight: 20,
    dangerBias: 0.18,
    wealthMult: 1.8,
    floorWeights: {
      [100]: 0.6,
      [60]: 0.95,
      [30]: 1.75,
      [140]: 1.55,
      [180]: 2.1,
    },
    occupations: [
      { value: Occupation.HUNTER, weight: 30 },
      { value: Occupation.TRAVELER, weight: 5 },
      { value: Occupation.MECHANIC, weight: 3 },
    ],
  },
  {
    id: 'wild',
    faction: Faction.WILD,
    baseWeight: 20,
    dangerBias: 0.12,
    wealthMult: 0.65,
    floorWeights: {
      [100]: 0.5,
      [60]: 1.8,
      [30]: 0.45,
      [140]: 1.15,
      [180]: 0.28,
    },
    occupations: [
      { value: Occupation.TRAVELER, weight: 16 },
      { value: Occupation.ALCOHOLIC, weight: 13 },
      { value: Occupation.LOCKSMITH, weight: 3 },
      { value: Occupation.HUNTER, weight: 2 },
    ],
  },
  {
    id: 'scientists',
    faction: Faction.SCIENTIST,
    baseWeight: 10,
    dangerBias: 0.04,
    wealthMult: 2.4,
    floorWeights: {
      [100]: 0.2,
      [60]: 0.18,
      [30]: 1.85,
      [140]: 1.35,
      [180]: 0.2,
    },
    occupations: [
      { value: Occupation.SCIENTIST, weight: 20 },
      { value: Occupation.DOCTOR, weight: 5 },
      { value: Occupation.SECRETARY, weight: 3 },
      { value: Occupation.TRAVELER, weight: 2 },
    ],
  },
  {
    id: 'cultists',
    faction: Faction.CULTIST,
    baseWeight: 8,
    dangerBias: 0.28,
    wealthMult: 0.9,
    floorWeights: {
      [100]: 0.08,
      [60]: 0.18,
      [30]: 0.55,
      [140]: 0.85,
      [180]: 9.5,
    },
    occupations: [
      { value: Occupation.PILGRIM, weight: 20 },
      { value: Occupation.PRIEST, weight: 3 },
      { value: Occupation.TRAVELER, weight: 2 },
    ],
  },
];
