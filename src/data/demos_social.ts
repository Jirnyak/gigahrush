import {
  DEMOS_EDGE_DEBT,
  DEMOS_EDGE_ENEMY,
  DEMOS_EDGE_FACTION,
  DEMOS_EDGE_FAMILY,
  DEMOS_EDGE_FRIEND,
  DEMOS_EDGE_HIDDEN,
  DEMOS_EDGE_QUEST,
  DEMOS_EDGE_WORK,
} from './demos_posts';
// Шкала отношений — общая для фракций, людей и игрока; определена один раз
// в `relations.ts`, здесь только реэкспорт, как и флаги рёбер выше.
import {
  RELATION_FRIENDLY_THRESHOLD,
  RELATION_HOSTILE_THRESHOLD,
  RELATION_MAX,
  RELATION_MIN,
  RELATION_UNSET,
} from './relations';

export const DEMOS_SOCIAL_PLAYER_SLOT = 0;
export const DEMOS_SOCIAL_NPC_SLOT_START = 1;
export const DEMOS_PLAYER_SOCIAL_SLOT = DEMOS_SOCIAL_PLAYER_SLOT;
/* Строка человека — степень двойки: ячейка 0 отдана игроку, 1..7 — живым
 * людям. Ровно столько же байт (восемь) занимает его отношение к фракциям в
 * колонках A-Life, и обе строки индексируются одним и тем же `alifeId`. */
export const DEMOS_SOCIAL_NPC_SLOTS = 7;
export const DEMOS_SOCIAL_INITIAL_NPC_SLOTS = 4;
export const DEMOS_SOCIAL_PUBLIC_SLOTS = 8;
export const DEMOS_SOCIAL_SLOTS = DEMOS_SOCIAL_PUBLIC_SLOTS;
export const DEMOS_SOCIAL_CANDIDATE_TRIES = 24;
export const DEMOS_SOCIAL_OVERRIDE_CAP = 8192;

export {
  DEMOS_EDGE_DEBT,
  DEMOS_EDGE_ENEMY,
  DEMOS_EDGE_FACTION,
  DEMOS_EDGE_FAMILY,
  DEMOS_EDGE_FRIEND,
  DEMOS_EDGE_HIDDEN,
  DEMOS_EDGE_QUEST,
  DEMOS_EDGE_WORK,
  RELATION_FRIENDLY_THRESHOLD,
  RELATION_HOSTILE_THRESHOLD,
  RELATION_MAX,
  RELATION_MIN,
  RELATION_UNSET,
};

export type DemosRelationBandId = 'enemy' | 'cold' | 'neutral' | 'warm' | 'friend';

export enum DemosSocialRoleId {
  ACQUAINTANCE = 0,
  FRIEND = 1,
  RIVAL = 2,
  ENEMY = 3,
  PARENT = 4,
  CHILD = 5,
  PARTNER = 6,
  WORK = 7,
  DEBT = 8,
  QUEST = 9,
}

export type DemosSocialEdgeFlagId =
  | 'family'
  | 'friend'
  | 'enemy'
  | 'work'
  | 'faction'
  | 'debt'
  | 'quest'
  | 'hidden';

export const DEMOS_SOCIAL_EDGE_FLAG_BY_ID: Readonly<Record<DemosSocialEdgeFlagId, number>> = {
  family: DEMOS_EDGE_FAMILY,
  friend: DEMOS_EDGE_FRIEND,
  enemy: DEMOS_EDGE_ENEMY,
  work: DEMOS_EDGE_WORK,
  faction: DEMOS_EDGE_FACTION,
  debt: DEMOS_EDGE_DEBT,
  quest: DEMOS_EDGE_QUEST,
  hidden: DEMOS_EDGE_HIDDEN,
};

export const DEMOS_SOCIAL_ROLE_BY_ID: Readonly<Record<string, DemosSocialRoleId>> = {
  acquaintance: DemosSocialRoleId.ACQUAINTANCE,
  friend: DemosSocialRoleId.FRIEND,
  rival: DemosSocialRoleId.RIVAL,
  enemy: DemosSocialRoleId.ENEMY,
  parent: DemosSocialRoleId.PARENT,
  child: DemosSocialRoleId.CHILD,
  partner: DemosSocialRoleId.PARTNER,
  work: DemosSocialRoleId.WORK,
  debt: DemosSocialRoleId.DEBT,
  quest: DemosSocialRoleId.QUEST,
};

export function demosSocialRoleIdById(input: unknown, fallback = DemosSocialRoleId.ACQUAINTANCE): DemosSocialRoleId {
  if (typeof input === 'number' && Number.isInteger(input) && input >= DemosSocialRoleId.ACQUAINTANCE && input <= DemosSocialRoleId.QUEST) {
    return input as DemosSocialRoleId;
  }
  if (typeof input !== 'string') return fallback;
  return DEMOS_SOCIAL_ROLE_BY_ID[input] ?? fallback;
}

export function demosSocialFlagsFromIds(input: readonly string[] | undefined): number {
  let out = 0;
  for (const raw of input ?? []) {
    out |= DEMOS_SOCIAL_EDGE_FLAG_BY_ID[raw as DemosSocialEdgeFlagId] ?? 0;
  }
  return out & 0xff;
}

export interface DemosAuthoredRelationDef {
  fromPlotNpcId: string;
  toPlotNpcId: string;
  relation: number;
  role: DemosSocialRoleId;
  flags?: number;
}

export const DEMOS_AUTHORED_RELATIONS: readonly DemosAuthoredRelationDef[] = [
  {
    fromPlotNpcId: 'olga',
    toPlotNpcId: 'yakov',
    relation: 88,
    role: DemosSocialRoleId.FRIEND,
    flags: DEMOS_EDGE_FRIEND,
  },
  {
    fromPlotNpcId: 'barni',
    toPlotNpcId: 'olga',
    relation: 98,
    role: DemosSocialRoleId.PARTNER,
    flags: DEMOS_EDGE_FRIEND,
  },
  {
    fromPlotNpcId: 'olevia_kiber',
    toPlotNpcId: 'valeriy_mukhin',
    relation: 75,
    role: DemosSocialRoleId.PARTNER,
    flags: DEMOS_EDGE_WORK | DEMOS_EDGE_FRIEND,
  },
  {
    fromPlotNpcId: 'viktor_argonov',
    toPlotNpcId: 'olevia_kiber',
    relation: RELATION_MIN,
    role: DemosSocialRoleId.ENEMY,
    flags: DEMOS_EDGE_ENEMY | DEMOS_EDGE_DEBT,
  },
  {
    fromPlotNpcId: 'viktor_argonov',
    toPlotNpcId: 'valeriy_mukhin',
    relation: RELATION_HOSTILE_THRESHOLD - 20,
    role: DemosSocialRoleId.ENEMY,
    flags: DEMOS_EDGE_ENEMY,
  },
  {
    fromPlotNpcId: 'vanka',
    toPlotNpcId: 'yakov',
    relation: 22,
    role: DemosSocialRoleId.ACQUAINTANCE,
  },
  {
    fromPlotNpcId: 'major_grom',
    toPlotNpcId: 'yakov',
    relation: 34,
    role: DemosSocialRoleId.ACQUAINTANCE,
    flags: DEMOS_EDGE_WORK,
  },
  {
    fromPlotNpcId: 'rotenbergov',
    toPlotNpcId: 'f69_accountant_nil',
    relation: -96,
    role: DemosSocialRoleId.ENEMY,
    flags: DEMOS_EDGE_ENEMY | DEMOS_EDGE_DEBT,
  },
  {
    fromPlotNpcId: 'f69_asya_pryanikova',
    toPlotNpcId: 'f69_borya_pryanikov',
    relation: 95,
    role: DemosSocialRoleId.PARTNER,
    flags: DEMOS_EDGE_FAMILY,
  },
  {
    fromPlotNpcId: 'f69_asya_pryanikova',
    toPlotNpcId: 'f69_venya_pryanikov',
    relation: 100,
    role: DemosSocialRoleId.PARENT,
    flags: DEMOS_EDGE_FAMILY,
  },
  {
    fromPlotNpcId: 'f69_borya_pryanikov',
    toPlotNpcId: 'f69_venya_pryanikov',
    relation: 100,
    role: DemosSocialRoleId.PARENT,
    flags: DEMOS_EDGE_FAMILY,
  },
] as const;
