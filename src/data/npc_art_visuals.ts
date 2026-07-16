import { Faction, Occupation } from '../core/types';
import { ART_SPRITE_MANIFEST } from './art_sprite_manifest';
import { getPlotNpcNumericId } from './npc_packages';

export type NpcAgeCategory = 'child' | 'young' | 'adult' | 'old';

export function categorizeNpcAge(age?: number): NpcAgeCategory {
  if (age === undefined) return 'adult'; // default
  if (age <= 14) return 'child';
  if (age >= 60) return 'old';
  if (age <= 25) return 'young';
  return 'adult';
}

export interface NpcArtVisualContext {
  faction?: Faction;
  occupation?: Occupation;
  isFemale?: boolean;
  age?: number;
  plotNpcId?: number;
}

export function resolveNpcArtVisualId(ctx: NpcArtVisualContext): string | undefined {
  if (ctx.plotNpcId) {
    for (const row of ART_SPRITE_MANIFEST) {
      for (const mapping of row.intendedMappings) {
        if (mapping.type === 'npc_exact' && mapping.plotNpcId && getPlotNpcNumericId(mapping.plotNpcId) === ctx.plotNpcId) {
          return mapping.visualId;
        }
      }
    }
  }

  let ageCat = categorizeNpcAge(ctx.age);
  if (ctx.occupation === Occupation.CHILD) {
    ageCat = 'child';
  }

  const sex = ctx.isFemale ? 'female' : 'male';
  const factionStr = ctx.faction !== undefined ? Faction[ctx.faction] : undefined;
  const occupationStr = ctx.occupation !== undefined ? Occupation[ctx.occupation] : undefined;

  let bestScore = -1;
  let bestVisualId: string | undefined;

  for (const row of ART_SPRITE_MANIFEST) {
    for (const mapping of row.intendedMappings) {
      if (mapping.type !== 'npc_family') continue;
      
      let score = 0;
      let conflict = false;

      if (mapping.faction) {
        if (mapping.faction === factionStr) score += 10;
        else conflict = true;
      }
      if (mapping.occupation) {
        if (mapping.occupation === occupationStr) score += 15;
        else conflict = true;
      }
      if (mapping.sex) {
        if (mapping.sex === sex) score += 2;
        else conflict = true;
      }
      if (mapping.ageCategory) {
        if (mapping.ageCategory === ageCat) score += 5;
        else conflict = true;
      }

      if (!conflict && score > bestScore && score > 0) {
        bestScore = score;
        bestVisualId = mapping.visualId;
      }
    }
  }

  return bestVisualId;
}
