import { Faction, Occupation } from '../core/types';
import { generateFloor69FemaleNpcSprite } from '../render/art_sprites';
import { Spr, authoredNpcSpriteGeneratorOffset } from '../render/sprite_index';

export const NPC_VISUAL_FLOOR69_FEMALE = 'floor_69_female';

export interface NpcVisualContext {
  seed: number;
  sprite?: number;
  occupation?: Occupation;
  faction?: Faction;
  isFemale?: boolean;
}

export interface NpcVisualFamily {
  id: string;
  procedural: boolean;
  generate(ctx: NpcVisualContext): Uint32Array;
}

function mix32(v: number): number {
  v >>>= 0;
  v ^= v >>> 16;
  v = Math.imul(v, 0x7feb352d) >>> 0;
  v ^= v >>> 15;
  v = Math.imul(v, 0x846ca68b) >>> 0;
  v ^= v >>> 16;
  return v >>> 0;
}

export function isFloor69FemaleSprite(sprite: number): boolean {
  return sprite >= Spr.F69_FEMALE_NPC_BASE && sprite <= Spr.F69_FEMALE_NPC_7;
}

function floor69Variant(ctx: NpcVisualContext): number {
  const atlasVariant = ctx.sprite !== undefined && isFloor69FemaleSprite(ctx.sprite)
    ? ctx.sprite - Spr.F69_FEMALE_NPC_BASE
    : 0;
  return mix32((ctx.seed || 1) ^ Math.imul(atlasVariant + 1, 0x69f69f));
}

export const NPC_VISUAL_FAMILIES: readonly NpcVisualFamily[] = [
  {
    id: NPC_VISUAL_FLOOR69_FEMALE,
    procedural: true,
    generate: ctx => generateFloor69FemaleNpcSprite(floor69Variant(ctx)),
  },
] as const;

export function npcVisualFamily(id: string | undefined): NpcVisualFamily | undefined {
  if (!id) return undefined;
  return NPC_VISUAL_FAMILIES.find(family => family.id === id);
}

export function npcVisualUsesProceduralSprite(id: string | undefined): boolean {
  return npcVisualFamily(id)?.procedural === true;
}

export function generateNpcVisualSprite(id: string | undefined, ctx: NpcVisualContext): Uint32Array | undefined {
  const family = npcVisualFamily(id);
  return family?.generate(ctx);
}

export function isNpcSpecialSprite(sprite: number | undefined): boolean {
  if (sprite === undefined) return false;
  return authoredNpcSpriteGeneratorOffset(sprite) >= 0 || isFloor69FemaleSprite(sprite);
}

export function sanitizeNpcVisualId(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const id = input.trim();
  if (!id || !/^[a-z0-9_:.-]+$/.test(id)) return undefined;
  return id.slice(0, 64);
}
