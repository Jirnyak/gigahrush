/* ── Monster shared types & registry ──────────────────────────── */

import { MonsterKind } from '../core/types';

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  attackRate: number;
  sprite: number;
}

// Import all monsters
import { DEF as SBORKA_DEF, generateSprite as genSborka } from './sborka';
import { DEF as TVAR_DEF, generateSprite as genTvar } from './tvar';
import { DEF as POLZUN_DEF, generateSprite as genPolzun } from './polzun';
import { DEF as BETONNIK_DEF, generateSprite as genBetonnik } from './betonnik';

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  [MonsterKind.SBORKA]:   SBORKA_DEF,
  [MonsterKind.TVAR]:     TVAR_DEF,
  [MonsterKind.POLZUN]:   POLZUN_DEF,
  [MonsterKind.BETONNIK]: BETONNIK_DEF,
};

export const MONSTER_SPRITES: (() => Uint32Array)[] = [
  genSborka,   // sprite index 4
  genTvar,     // sprite index 5
  genPolzun,   // sprite index 6
  genBetonnik, // sprite index 7
];
