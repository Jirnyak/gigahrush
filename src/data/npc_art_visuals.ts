import { Faction, Occupation } from '../core/types';
import {
  NPC_VISUAL_ALCOHOLIC_MALE,
  NPC_VISUAL_CULTIST_MALE,
  NPC_VISUAL_LIQUIDATOR_MALE,
  NPC_VISUAL_SCIENTIST_FEMALE,
  NPC_VISUAL_SCIENTIST_MALE,
  NPC_VISUAL_WILD_MALE,
} from './art_sprite_manifest';

export interface NpcArtVisualContext {
  faction?: Faction;
  occupation?: Occupation;
  isFemale?: boolean;
}

export function resolveNpcArtVisualId(ctx: NpcArtVisualContext): string | undefined {
  if (ctx.occupation === Occupation.ALCOHOLIC && ctx.isFemale !== true) return NPC_VISUAL_ALCOHOLIC_MALE;
  if (ctx.faction === Faction.SCIENTIST) return ctx.isFemale ? NPC_VISUAL_SCIENTIST_FEMALE : NPC_VISUAL_SCIENTIST_MALE;
  if (ctx.faction === Faction.LIQUIDATOR) return NPC_VISUAL_LIQUIDATOR_MALE;
  if (ctx.faction === Faction.CULTIST) return NPC_VISUAL_CULTIST_MALE;
  if (ctx.faction === Faction.WILD) return NPC_VISUAL_WILD_MALE;
  return undefined;
}
