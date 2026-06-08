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
  width: number;
  height: number;
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
export const NPC_VISUAL_SCIENTIST_FEMALE = 'scientist_female';

export const ART_SPRITE_MANIFEST: readonly ArtSpriteManifestRow[] = [
  {
    id: 'olga_dmitrievna',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/olga_dmitrievna.png',
    sha256: 'cc57b59edd05d9a265dd0fa8160442bcfc45ef93a37e8986084e17f68a5cd2e6',
    width: 64,
    height: 77,
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
    id: 'ulyana',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/ulyana.png',
    sha256: 'c4ded3b47e7e675524ceaf9fddad7f654e3f8ed468bcf5f93a1a6d1547f2c330',
    width: 64,
    height: 77,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{ type: 'unbound', reason: 'needs_owner_decision' }],
  },
  {
    id: 'citizen_m_alcoholic',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/alchogolic_m_1.png',
    sha256: '69fb5d9867dc4505f92a9cb5994639975889c1c171cb79546bd11f65bc04c0c1',
    width: 64,
    height: 77,
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
    id: 'bandit_m_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/bandit_m_1.png',
    sha256: 'bcadd1827e54e54007970711fe7e0a9048c73b5fc34a86dd07c741dd4320d317',
    width: 64,
    height: 77,
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
    id: 'cultist_m_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/cultist_m_1.png',
    sha256: '18c902a1b99b13cef1b50ae4fc067e3d657cf9dcf9094b180356cbad395b56ad',
    width: 64,
    height: 77,
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
    id: 'liquidator_m_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/liquidator_m_1.png',
    sha256: '68ff11053a30b5e9b327bc581ee2f9dcf3f2f821b4638316ecc45b30928101e7',
    width: 64,
    height: 77,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_MALE,
      faction: 'LIQUIDATOR',
      variant: '1',
    }],
  },
  {
    id: 'liquidator_m_2',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/liquidator_m_2.png',
    sha256: '7092c8d82c7037763c9c6bd63d25d0f42a2c470d01bcd376d9818b9eeb04c340',
    width: 64,
    height: 77,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_MALE,
      faction: 'LIQUIDATOR',
      variant: '2',
    }],
  },
  {
    id: 'scientist_m_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/scientist_m_1.png',
    sha256: '16e130a24d5faf25f76498dbdb86870e03980684859e39a569f2caf4fa683cef',
    width: 64,
    height: 77,
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
  {
    id: 'scientist_f_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/scientist_f_1.png',
    sha256: 'fc2d0b05a67acaea9b5481b4c0a2b93a4ea4ac3a281a7c0d09dcbad8f6619fe9',
    width: 64,
    height: 77,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_SCIENTIST_FEMALE,
      faction: 'SCIENTIST',
      variant: 'female',
    }],
  },
] as const;

export function artSpriteManifestRow(id: string | undefined): ArtSpriteManifestRow | undefined {
  if (!id) return undefined;
  return ART_SPRITE_MANIFEST.find(row => row.id === id);
}
