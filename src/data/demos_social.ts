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

export const DEMOS_SOCIAL_PLAYER_SLOT = 0;
export const DEMOS_SOCIAL_NPC_SLOT_START = 1;
export const DEMOS_PLAYER_SOCIAL_SLOT = DEMOS_SOCIAL_PLAYER_SLOT;
export const DEMOS_SOCIAL_NPC_SLOTS = 6;
export const DEMOS_SOCIAL_PUBLIC_SLOTS = 7;
export const DEMOS_SOCIAL_SLOTS = DEMOS_SOCIAL_PUBLIC_SLOTS;
export const DEMOS_SOCIAL_CANDIDATE_TRIES = 24;
export const DEMOS_RELATION_EMPTY = -128;
export const DEMOS_RELATION_MIN = -127;
export const DEMOS_RELATION_MAX = 127;
export const DEMOS_RELATION_HOSTILE_THRESHOLD = -64;
export const DEMOS_RELATION_FRIENDLY_THRESHOLD = 64;
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

export interface DemosAuthoredRelationDef {
  fromPlotNpcId: string;
  toPlotNpcId: string;
  relation: number;
  role: DemosSocialRoleId;
  flags?: number;
  bidirectional?: boolean;
}

export const DEMOS_AUTHORED_RELATIONS: readonly DemosAuthoredRelationDef[] = [
  {
    fromPlotNpcId: 'olga',
    toPlotNpcId: 'yakov',
    relation: 88,
    role: DemosSocialRoleId.FRIEND,
    flags: DEMOS_EDGE_FRIEND,
    bidirectional: true,
  },
  {
    fromPlotNpcId: 'barni',
    toPlotNpcId: 'olga',
    relation: 98,
    role: DemosSocialRoleId.PARTNER,
    flags: DEMOS_EDGE_FRIEND,
    bidirectional: true,
  },
  {
    fromPlotNpcId: 'vanka',
    toPlotNpcId: 'yakov',
    relation: 22,
    role: DemosSocialRoleId.ACQUAINTANCE,
    bidirectional: true,
  },
  {
    fromPlotNpcId: 'major_grom',
    toPlotNpcId: 'yakov',
    relation: 34,
    role: DemosSocialRoleId.ACQUAINTANCE,
    flags: DEMOS_EDGE_WORK,
    bidirectional: true,
  },
  {
    fromPlotNpcId: 'rotenbergov',
    toPlotNpcId: 'f69_accountant_nil',
    relation: -96,
    role: DemosSocialRoleId.ENEMY,
    flags: DEMOS_EDGE_ENEMY | DEMOS_EDGE_DEBT,
    bidirectional: true,
  },
] as const;
