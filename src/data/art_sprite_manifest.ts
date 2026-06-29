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
    sex?: 'male' | 'female';
    ageCategory?: 'child' | 'young' | 'adult' | 'old';
    plotNpcId?: string;
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
export const NPC_VISUAL_WILD_MALE = 'wild_male';
export const NPC_VISUAL_WILD_FEMALE = 'wild_female';
export const NPC_VISUAL_CULTIST_MALE = 'cultist_male';
export const NPC_VISUAL_CULTIST_FEMALE = 'cultist_female';
export const NPC_VISUAL_LIQUIDATOR_MALE = 'liquidator_male';
export const NPC_VISUAL_LIQUIDATOR_FEMALE = 'liquidator_female';
export const NPC_VISUAL_SCIENTIST_MALE = 'scientist_male';
export const NPC_VISUAL_SCIENTIST_FEMALE = 'scientist_female';
export const NPC_VISUAL_WORKER69 = 'worker69';
export const NPC_VISUAL_CITIZEN_MALE = 'citizen_male';
export const NPC_VISUAL_CITIZEN_FEMALE = 'citizen_female';
export const NPC_VISUAL_CITIZEN_OLD_MALE = 'citizen_old_male';
export const NPC_VISUAL_CITIZEN_OLD_FEMALE = 'citizen_old_female';
export const NPC_VISUAL_CITIZEN_CHILD_MALE = 'citizen_child_male';
export const NPC_VISUAL_CITIZEN_CHILD_FEMALE = 'citizen_child_female';

export const ART_SPRITE_MANIFEST: readonly ArtSpriteManifestRow[] = [
  {
    id: 'olga_dmitrievna',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/olga_dmitrievna.png',
    sha256: '385613997d3b82cb30ee255bc98cd3db7b976b2ab79a5093d5ae186fe3c674a5',
    width: 147,
    height: 213,
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
    id: 'bandit_m_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/bandit_m_1.png',
    sha256: 'a911ac855d21c8d80169230a2e494cc6cd3cb1932cf142256be3f1c84c406b8b',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_WILD_MALE,
      faction: 'WILD',
      sex: 'male',
      variant: '1',
      note: 'explicitly mapped to wild NPCs, not MonsterKind.DIKIY_MERTVYAK',
    }],
  },
  {
    id: 'bandit_m_2',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/bandit_m_2.png',
    sha256: '7602f7e1401936a63308ecbba3adbb59a634992437a72931d88d6c7d13e0cf39',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_WILD_MALE,
      faction: 'WILD',
      sex: 'male',
      variant: '2',
      note: 'explicitly mapped to wild NPCs, not MonsterKind.DIKIY_MERTVYAK',
    }],
  },
  {
    id: 'bandit_f_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/bandit_f_1.png',
    sha256: '9d647266c7316f233e04485274d8c22c9d4615e337fe0917108410f8b86070fd',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_WILD_FEMALE,
      faction: 'WILD',
      sex: 'female',
      variant: '1',
      note: 'explicitly mapped to wild NPCs, not MonsterKind.DIKIY_MERTVYAK',
    }],
  },
  {
    id: 'cultist_m_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/cultist_m_1.png',
    sha256: '8ae706bb326fc6adc78c3fa721236e5f7b75b7cb48984f0441e3243771a90a99',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_CULTIST_MALE,
      faction: 'CULTIST',
      sex: 'male',
    }],
  },
  {
    id: 'cultist_f_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/cultist_f_1.png',
    sha256: '04ef78a6cfdb895ee9057d801e54a2b3a971b2d92351fdd1a8658036188c0f01',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_CULTIST_FEMALE,
      faction: 'CULTIST',
      sex: 'female',
    }],
  },
  {
    id: 'liquidator_m_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/liquidator_m_1.png',
    sha256: '93994e5e5831e10e97e050c0f386214c9390c64969e6264baa9e7b36d03f3c4a',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_MALE,
      faction: 'LIQUIDATOR',
      sex: 'male',
      variant: '1',
    }],
  },
  {
    id: 'liquidator_m_2',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/liquidator_m_2.png',
    sha256: '5b7e746b456ff4cf8cccc20568142136962a5ef287a280ac554cc388f37d48d1',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_MALE,
      faction: 'LIQUIDATOR',
      sex: 'male',
      variant: '2',
    }],
  },
  {
    id: 'liquidator_m_3',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/liquidator_m_3.png',
    sha256: '06ca4f7d04db1b173bafb4765f10a01703718586c35ff497461f6ee298ee874c',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_MALE,
      faction: 'LIQUIDATOR',
      sex: 'male',
      variant: '3',
    }],
  },
  {
    id: 'liquidator_m_4',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/liquidator_m_4.png',
    sha256: '9d7285d64dfd5a0ad23db628e45af51a46542e5cc1c328781e294001b4d87950',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_MALE,
      faction: 'LIQUIDATOR',
      sex: 'male',
      variant: '4',
    }],
  },
  {
    id: 'liquidator_m_5',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/liquidator_m_5.png',
    sha256: '54b572e223fd99a8e98cfcec794b7ca811319cc1212075e82c3da29b33e702cb',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_MALE,
      faction: 'LIQUIDATOR',
      sex: 'male',
      variant: '5',
    }],
  },
  {
    id: 'liquidator_m_6',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/liquidator_m_6.png',
    sha256: '8602d4680ff45ccc2d680f8fa9579ed2127095a0bb529ddb8684e75c405a705b',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_MALE,
      faction: 'LIQUIDATOR',
      sex: 'male',
      variant: '6',
    }],
  },
  {
    id: 'liquidator_f_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/liquidator_f_1.png',
    sha256: '7344f1f5b199133afae30ec66a4116951ecd7d31cd7140b5d47c8c84e5fd1e18',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_LIQUIDATOR_FEMALE,
      faction: 'LIQUIDATOR',
      sex: 'female',
      variant: '1',
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
      sex: 'male',
      variant: '1',
    }],
  },
  {
    id: 'scientist_m_2',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/scientist_m_2.png',
    sha256: 'faf3228098dcef97b9fc7343a1326969e98262fe88126a696ec032c21c0a97da',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_SCIENTIST_MALE,
      faction: 'SCIENTIST',
      sex: 'male',
      variant: '2',
    }],
  },
  {
    id: 'scientist_m_3',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/scientist_m_3.png',
    sha256: '1cf526d8800017eb4fc5428cb2d0cf132614c9f956985bb8ea7df0d0a8ae951d',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_SCIENTIST_MALE,
      faction: 'SCIENTIST',
      sex: 'male',
      variant: '3',
    }],
  },
  {
    id: 'scientist_m_4',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/scientist_m_4.png',
    sha256: '745d8986d9d7a6f41b233f93bf987f7c3b24d69e07618c43f99c659aaab5fd21',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_SCIENTIST_MALE,
      faction: 'SCIENTIST',
      sex: 'male',
      variant: '4',
    }],
  },
  {
    id: 'scientist_f_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/scientist_f_1.png',
    sha256: '402865075d0d7597824e41f49addedf3d1613f76579050f26dd61c76a694a9ea',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_SCIENTIST_FEMALE,
      faction: 'SCIENTIST',
      sex: 'female',
      variant: '1',
    }],
  },
  {
    id: 'worker69_f_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/69worker_f_1.png',
    sha256: '7200d8f3275e69397a8c0f6e9d919974758c5f438dd9e8666d095c3fe7e2197c',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_WORKER69,
      occupation: 'WORKER69',
      sex: 'female',
      variant: '1',
    }],
  },
  {
    id: 'worker69_f_2',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/69worker_f_2.png',
    sha256: '7f246b91865833228fcf7763596f8bbc02bf1ceba435a4fc0be73d96a5453198',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_WORKER69,
      occupation: 'WORKER69',
      sex: 'female',
      variant: '2',
    }],
  },
  {
    id: 'worker69_f_3',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/69worker_f_3.png',
    sha256: 'ab70083d82353361d1c10bce2bf4ca82fad0335ebece0a6c0136f23d46e398cf',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_WORKER69,
      occupation: 'WORKER69',
      sex: 'female',
      variant: '3',
    }],
  },
  {
    id: 'worker69_f_4',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/69worker_f_4.png',
    sha256: '844c21f0f0d75f1475ad298d0477a40da4134508ca7933b5f4c740575399193a',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_WORKER69,
      occupation: 'WORKER69',
      sex: 'female',
      variant: '4',
    }],
  },
  {
    id: 'worker69_m_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/69worker_m_1.png',
    sha256: '5a6033e763d0d550950f443da522f0ae4e345babbc9aa83022c3f381646e6da0',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_WORKER69,
      occupation: 'WORKER69',
      sex: 'male',
      variant: '1',
    }],
  },
  {
    id: 'scientist_f_2',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/scientist_f_2.png',
    sha256: '37b234d5158ff4c7e04f1ac1586799a9907d2e9ca6e01ee189411ae43707b83a',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_SCIENTIST_FEMALE,
      faction: 'SCIENTIST',
      sex: 'female',
      variant: '2',
    }],
  },
  {
    id: 'citizen_m_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/citizen_m_1.png',
    sha256: '876b1071029a4c1c86090d780cd4ee9a3e2132d295b8412842acd2eaa6d9d309',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_CITIZEN_MALE,
      faction: 'CITIZEN',
      sex: 'male',
      ageCategory: 'adult',
      variant: '1',
    }],
  },
  {
    id: 'citizen_f_1',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/citizen_f_1.png',
    sha256: 'fd36f7426e8af5893af91fc657ca088c0afb0595fea067ab9a7560219a8c3216',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_CITIZEN_FEMALE,
      faction: 'CITIZEN',
      sex: 'female',
      ageCategory: 'adult',
      variant: '1',
    }],
  },
  {
    id: 'citizen_old_m',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/citizen_old_m.png',
    sha256: '1e6fed57eb6c2874217cb32ecabd1b7587737b8152bc0fb67f0b35726c765a39',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_CITIZEN_OLD_MALE,
      faction: 'CITIZEN',
      sex: 'male',
      ageCategory: 'old',
      variant: '1',
    }],
  },
  {
    id: 'citizen_old_f',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/citizen_old_f.png',
    sha256: 'a99cc04c4e808f0cc3ca88f83a57f993d4791e3611078f22bb278465290b17e5',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_CITIZEN_OLD_FEMALE,
      faction: 'CITIZEN',
      sex: 'female',
      ageCategory: 'old',
      variant: '1',
    }],
  },
  {
    id: 'citizen_child_m',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/citizen_child_m.png',
    sha256: '42f75ba9b778c6370f5c7a3e267749f2ff59e8429eec7985b6b20513919368e5',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_CITIZEN_CHILD_MALE,
      faction: 'CITIZEN',
      sex: 'male',
      ageCategory: 'child',
      variant: '1',
    }],
  },
  {
    id: 'citizen_child_f',
    kind: 'npc',
    source: 'first_party_art',
    sourcePath: 'arts/ctizen_child_f.png',
    sha256: '003c00b4041d73b53d4c09bbe9b8876a08767c1a607a09ef204baa1c31ae0a16',
    width: 147,
    height: 213,
    anchorFeet: { x: 32, y: 61 },
    portraitCrop: { x: 16, y: 4, w: 32, h: 40 },
    author: 'first_party',
    sourceNote: 'manual pixel art',
    consent: 'project_owned',
    intendedMappings: [{
      type: 'npc_family',
      visualId: NPC_VISUAL_CITIZEN_CHILD_FEMALE,
      faction: 'CITIZEN',
      sex: 'female',
      ageCategory: 'child',
      variant: '1',
    }],
  },
] as const;

export function artSpriteManifestRow(id: string | undefined): ArtSpriteManifestRow | undefined {
  if (!id) return undefined;
  return ART_SPRITE_MANIFEST.find(row => row.id === id);
}
