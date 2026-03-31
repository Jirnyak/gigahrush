/* ── Sprite index registry — auto-computed, zero hardcoding ──── */
/*   Adding a new monster? Just add to MonsterKind enum and       */
/*   monster.ts registry. All sprite indices adjust automatically.*/
/*                                                                 */
/*   Layout: [NPCs | Travelers | ItemDrop | Monsters | EyeBolt | */
/*            Desk | Bullet | Pellet | Nail | PsiBolt |          */
/*            PlasmaBolt | GaussBolt | BfgBolt | FlameBolt |     */
/*            Grenade ]                                           */

import { MonsterKind } from '../core/types';
import { NPC_SPRITE_GENERATORS } from '../entities/npc';

const NPC_COUNT     = NPC_SPRITE_GENERATORS.length;
const TRAVELER_COUNT = 3;
// MonsterKind is a regular enum — Object.values has both string keys and numeric values
const MONSTER_COUNT  = Object.values(MonsterKind).filter(v => typeof v === 'number').length;

let _i = 0;
_i += NPC_COUNT;          // occupation NPC sprites
_i += TRAVELER_COUNT;     // traveler sprites
const _ITEM_DROP = _i++;
const _MON_BASE  = _i; _i += MONSTER_COUNT;
const _EYE_BOLT  = _i++;
const _DESK      = _i++;
const _BULLET    = _i++;
const _PELLET    = _i++;
const _NAIL      = _i++;
const _PSI_BOLT  = _i++;
const _PLASMA_BOLT = _i++;
const _GAUSS_BOLT  = _i++;
const _BFG_BOLT    = _i++;
const _FLAME_BOLT  = _i++;
const _GRENADE     = _i++;

/** Named sprite indices — import these instead of magic numbers */
export const Spr = {
  ITEM_DROP: _ITEM_DROP,
  EYE_BOLT:  _EYE_BOLT,
  DESK:      _DESK,
  BULLET:    _BULLET,
  PELLET:    _PELLET,
  NAIL:      _NAIL,
  PSI_BOLT:  _PSI_BOLT,
  PLASMA_BOLT: _PLASMA_BOLT,
  GAUSS_BOLT:  _GAUSS_BOLT,
  BFG_BOLT:    _BFG_BOLT,
  FLAME_BOLT:  _FLAME_BOLT,
  GRENADE:     _GRENADE,
  TOTAL:     _i,
};

/** Compute sprite index for a monster kind — always correct regardless of monster count */
export function monsterSpr(kind: MonsterKind): number {
  return _MON_BASE + kind;
}
