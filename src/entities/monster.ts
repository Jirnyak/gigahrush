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
  isRanged?: boolean;       // shoots projectiles instead of melee
  projSpeed?: number;       // projectile speed (cells/sec)
  projSprite?: number;      // projectile sprite index
}

// Import all monsters
import { DEF as SBORKA_DEF, generateSprite as genSborka } from './sborka';
import { DEF as TVAR_DEF, generateSprite as genTvar } from './tvar';
import { DEF as POLZUN_DEF, generateSprite as genPolzun } from './polzun';
import { DEF as BETONNIK_DEF, generateSprite as genBetonnik } from './betonnik';
import { DEF as ZOMBIE_DEF, generateSprite as genZombie } from './zombie';
import { DEF as EYE_DEF, generateSprite as genEye, generateBoltSprite as genEyeBolt } from './eye';
import { DEF as NIGHTMARE_DEF, generateSprite as genNightmare } from './nightmare';
import { DEF as SHADOW_DEF, generateSprite as genShadow } from './shadow';
import { DEF as REBAR_DEF, generateSprite as genRebar } from './rebar';
import { DEF as MATKA_DEF, generateSprite as genMatka } from './matka';

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  [MonsterKind.SBORKA]:    SBORKA_DEF,
  [MonsterKind.TVAR]:      TVAR_DEF,
  [MonsterKind.POLZUN]:    POLZUN_DEF,
  [MonsterKind.BETONNIK]:  BETONNIK_DEF,
  [MonsterKind.ZOMBIE]:    ZOMBIE_DEF,
  [MonsterKind.EYE]:       EYE_DEF,
  [MonsterKind.NIGHTMARE]: NIGHTMARE_DEF,
  [MonsterKind.SHADOW]:    SHADOW_DEF,
  [MonsterKind.REBAR]:     REBAR_DEF,
  [MonsterKind.MATKA]:     MATKA_DEF,
};

export const MONSTER_SPRITES: Record<MonsterKind, () => Uint32Array> = {
  [MonsterKind.SBORKA]:    genSborka,
  [MonsterKind.TVAR]:      genTvar,
  [MonsterKind.POLZUN]:    genPolzun,
  [MonsterKind.BETONNIK]:  genBetonnik,
  [MonsterKind.ZOMBIE]:    genZombie,
  [MonsterKind.EYE]:       genEye,
  [MonsterKind.NIGHTMARE]: genNightmare,
  [MonsterKind.SHADOW]:    genShadow,
  [MonsterKind.REBAR]:     genRebar,
  [MonsterKind.MATKA]:     genMatka,
};

export const EYE_BOLT_SPRITE: () => Uint32Array = genEyeBolt;
