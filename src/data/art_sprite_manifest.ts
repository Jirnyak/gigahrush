export type ArtSpriteKind = 'npc' | 'monster';
export type ArtSpriteSource = 'first_party_art' | 'community_art';

export type ArtSpriteMapping =
  | {
    type: 'npc_exact';
    visualId: string;
    packageId: string;
    plotNpcId?: string;
  }
  | {
    type: 'npc_family';
    visualId: string;
    faction?: string;
    occupation?: string;
    variant?: string;
    note?: string;
  }
  | {
    type: 'monster_kind';
    visualId: string;
    monsterKind: string;
    note?: string;
  }
  | {
    type: 'unbound';
    reason: string;
  };

export interface ArtSpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArtSpriteAnchor {
  x: number;
  y: number;
}

export interface ArtSpriteManifestRow {
  id: string;
  kind: ArtSpriteKind;
  source: ArtSpriteSource;
  sourcePath: string;
  sha256: string;
  width: 64;
  height: 64;
  anchorFeet: ArtSpriteAnchor;
  portraitCrop?: ArtSpriteRect;
  author?: string;
  sourceNote?: string;
  consent?: string;
  intendedMappings: readonly ArtSpriteMapping[];
}

export const NPC_VISUAL_OLGA_DMITRIEVNA = 'olga_dmitrievna';
export const NPC_VISUAL_ALCOHOLIC_MALE = 'alcoholic_male';
export const NPC_VISUAL_WILD_MALE = 'wild_male';
export const NPC_VISUAL_CULTIST_MALE = 'cultist_male';
export const NPC_VISUAL_LIQUIDATOR_MALE = 'liquidator_male';
export const NPC_VISUAL_SCIENTIST_MALE = 'scientist_male';

export const ART_SPRITE_MANIFEST: readonly ArtSpriteManifestRow[] = [
  {
    id: 'olga_dmitrievna',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/ольга_дмитриевна.png',
    sha256: '43fd9a5a67e378bf6354376457e80170dd036d8d3e743b35fb233bf9890c7d42',
    width: 64,
    height: 64,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_exact',
      visualId: NPC_VISUAL_OLGA_DMITRIEVNA,
      packageId: 'olga',
      plotNpcId: 'olga',
    }],
  },
  {
    id: 'ulyana_lager',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/ульяна_лагерь.png',
    sha256: '226fa736c77be77a0b46d38c487496bcf62896f68f703d68c745f13bb3e07185',
    width: 64,
    height: 64,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{ type: 'unbound', reason: 'needs_owner_decision' }],
  },
  {
    id: 'alcoholic_male',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/алкоголик_м.png',
    sha256: '211f5c0f29d38f890686e4f11ef00b382b1cc1be12a1ad62c60c9ba605362b3f',
    width: 64,
    height: 64,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_ALCOHOLIC_MALE,
      occupation: 'ALCOHOLIC',
    }],
  },
  {
    id: 'wild_male',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/дикий_м.png',
    sha256: '63a7996847cbf2f32c4b783e843b69216e168905b84e11e544767d73c8d3c921',
    width: 64,
    height: 64,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_WILD_MALE,
      faction: 'WILD',
      note: 'explicitly mapped to wild NPCs, not MonsterKind.DIKIY_MERTVYAK',
    }],
  },
  {
    id: 'cultist_male',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/культист_м.png',
    sha256: 'e01aafa47d74aaa52c14e2e926f75495f4294245464936d48cb59ce7bb9046ab',
    width: 64,
    height: 64,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_CULTIST_MALE,
      faction: 'CULTIST',
    }],
  },
  {
    id: 'liquidator_male_b',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/ликвидатор_м_b.png',
    sha256: 'dcace70166361bca362b71e29bafb6722129c537b69ba4fd1e1ee6a76b27e47f',
    width: 64,
    height: 64,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_MALE,
      faction: 'LIQUIDATOR',
      variant: 'b',
    }],
  },
  {
    id: 'liquidator_male_d',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/ликвидатор_м_d.png',
    sha256: '996b904874aa611dd21e5d5e9a0d8a4f1ac3f8c91e5cee64120241db8b6cfdab',
    width: 64,
    height: 64,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_MALE,
      faction: 'LIQUIDATOR',
      variant: 'd',
    }],
  },
  {
    id: 'scientist_male',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/учёный_м.png',
    sha256: '48d4a816741745a57f3f21bf4635f246dfd32bb37e15f408530d54a7dec9ec18',
    width: 64,
    height: 64,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_SCIENTIST_MALE,
      faction: 'SCIENTIST',
    }],
  },
] as const;

export function artSpriteManifestRow(id: string | undefined): ArtSpriteManifestRow | undefined {
  if (!id) return undefined;
  return ART_SPRITE_MANIFEST.find(row => row.id === id);
}
