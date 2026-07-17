import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  Faction,
  Occupation,
  QuestType,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { hashSeed } from '../../core/rand';
import { designNpcFloorKey, type PlotNpcDef, type SideQuestStep } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('silicon_net_well');

export const DESIGN_FLOOR_ID = 'silicon_net_well' as const;

export const SILICON_NET_WELL_Z = -22;

export const SILICON_NET_WELL_BASE_FLOOR = 140;

export const SEED = hashSeed(DESIGN_FLOOR_ID);

export const CX = W >> 1;

export const CY = W >> 1;

export type SiliconNpcId =
  | 'silicon_cibo'
  | 'silicon_cyborg_scientist'
  | 'silicon_admin_checker';

export interface SiliconRooms {
  entry: Room;
  well: Room;
  terminal: Room;
  cibo: Room;
  lab: Room;
  checkpoint: Room;
  vault: Room;
  lowerLift: Room;
}

export interface SiliconPoint {
  x: number;
  y: number;
}

export type SiliconDoorSide = 'north' | 'south' | 'west' | 'east';

export interface SiliconHqSite {
  owner: TerritoryOwner;
  x: number;
  y: number;
  w: number;
  h: number;
  linkX: number;
  linkY: number;
  name: string;
  wallTex: Tex;
  floorTex: Tex;
}

export interface SiliconSupportSpec {
  type: RoomType;
  name: string;
  wallTex: Tex;
  floorTex: Tex;
}

export const SILICON_GRAPH_X = [72, 160, 248, 336, 424, 512, 600, 688, 776, 864, 952] as const;

export const SILICON_GRAPH_Y = [96, 184, 272, 360, 448, 576, 664, 752, 840, 928] as const;

export const SILICON_HQ_SITES: readonly SiliconHqSite[] = [
  {
    owner: ZoneFaction.SCIENTIST,
    x: CX - 54,
    y: CY - 406,
    w: 108,
    h: 36,
    linkX: CX,
    linkY: CY - 242,
    name: 'Главный НИИ-штаб кремниевого колодца',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_TILE,
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    x: CX + 270,
    y: CY - 214,
    w: 60,
    h: 26,
    linkX: CX + 348,
    linkY: CY - 242,
    name: 'Миништаб ликвидаторов протокола НЕТ',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_CONCRETE,
  },
  {
    owner: ZoneFaction.CITIZEN,
    x: CX - 308,
    y: CY + 86,
    w: 58,
    h: 24,
    linkX: CX - 352,
    linkY: CY + 226,
    name: 'Гражданский убежищный пост старых кабелей',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_LINO,
  },
  {
    owner: ZoneFaction.WILD,
    x: CX + 284,
    y: CY + 244,
    w: 58,
    h: 24,
    linkX: CX + 348,
    linkY: CY + 226,
    name: 'Дикий штаб срезанных серверных стоек',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_CONCRETE,
  },
  {
    owner: ZoneFaction.CULTIST,
    x: CX - 286,
    y: CY + 300,
    w: 56,
    h: 24,
    linkX: CX - 352,
    linkY: CY + 226,
    name: 'Скрытый культовый штаб кремниевого следа',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_RED_CARPET,
  },
] as const;

export const NPC_DEFS: Record<SiliconNpcId, PlotNpcDef> = {
  silicon_cibo: {
    name: 'Сибо',
    isFemale: true,
    faction: Faction.SCIENTIST,
    occupation: Occupation.SCIENTIST,
    sprite: Occupation.SCIENTIST,
    hp: 190, maxHp: 190, money: 180, speed: 0.95,
    inventory: [
      { defId: 'circuit_board', count: 1 },
      { defId: 'ammo_energy', count: 1 },
      { defId: 'bandage', count: 1 },
    ],
    talkLines: [
      'Я ищу НЕТ не как сеть, а как коридор. Кремний здесь помнит двери, которые бетон уже забыл.',
      'Терминалы дают обход, если их кормить аккуратно. Ошибка зовет охрану быстрее сирены.',
      'Гравитационный излучатель не оружие. Это ластик для стен, людей и оправданий.',
    ],
    talkLinesPost: [
      'НЕТ отвечает коротко. Значит, мы еще живы.',
      'Не стреляйте из излучателя в то, что хотите потом обыскать.',
    ],
  },
  silicon_cyborg_scientist: {
    name: 'Киборг-учёный Аким',
    isFemale: false,
    faction: Faction.SCIENTIST,
    occupation: Occupation.ELECTRICIAN,
    sprite: Occupation.ELECTRICIAN,
    hp: 210, maxHp: 210, money: 95, speed: 0.8,
    inventory: [
      { defId: 'relay_diagram', count: 1 },
      { defId: 'ammo_energy', count: 1 },
      { defId: 'pills', count: 1 },
    ],
    talkLines: [
      'GBE режет не материал. Он вычитает маршрут. Поэтому после выстрела пропадает и стена, и то, что лежало у стены.',
      'Если взлом сорвется, терминал вызывает Safeguard. Он быстрый, белый и не спорит с ошибкой.',
      'Администраторы хотят меня сдать за объяснения. У них хорошо получается путать причину и протокол.',
    ],
    talkLinesPost: [
      'Луч держите коротко. Дом любит длинные доказательства.',
      'Если экран начал считать вас, отходите от экрана, а не от совести.',
    ],
  },
  silicon_admin_checker: {
    name: 'Администратор НЕТ-ветки',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.SECRETARY,
    sprite: Occupation.SECRETARY,
    hp: 170, maxHp: 170, money: 140, speed: 0.9,
    weapon: 'tt_pistol',
    inventory: [
      { defId: 'tt_pistol', count: 1 },
      { defId: 'ammo_762tt', count: 10 },
      { defId: 'official_permit_slip', count: 1 },
    ],
    talkLines: [
      'Колодец закрыт для самодеятельного подключения. Сибо под наблюдением, киборг под вопросом.',
      'Сдадите ученого - получите корешок допуска и чистую запись. Украдете излучатель - получите погоню.',
      'Кремниевая жизнь не враг. Враг тот, кто не ставит подпись перед ошибкой.',
    ],
    talkLinesPost: [
      'Протокол принял вашу версию. Это не значит, что она правильная.',
      'Если экран вас узнал, стойте ровно. Экран не любит бегущих.',
    ],
  },
};

export const SIDE_QUESTS: readonly SideQuestStep[] = [
  {
    id: 'silicon_cibo_net_contact',
    giverId: getPlotNpcNumericId('silicon_cibo')!,
    type: QuestType.FETCH,
    desc: 'Сибо: «Две энергоячейки к терминальному залу. Я открою НЕТ-обход и отдам излучатель, если он не заберёт нас первым.»',
    targetItem: 'ammo_energy',
    targetCount: 2,
    rewardItem: 'gravity_beam_emitter',
    rewardCount: 1,
    relationDelta: 12,
    xpReward: 220,
    eventTags: [DESIGN_FLOOR_ID, 'net', 'cibo', 'gravity_beam'],
    eventSeverity: 4,
    eventPrivacy: 'secret',
    failOnNpcDeathId: getPlotNpcNumericId('silicon_cibo')!,
  },
  {
    id: 'silicon_scientist_warning',
    giverId: getPlotNpcNumericId('silicon_cyborg_scientist')!,
    type: QuestType.TALK,
    desc: 'Выслушай киборга-учёного о GBE и риске НЕТ-взлома до работы с терминалами.',
    targetNpcId: getPlotNpcNumericId('silicon_cibo')!,
    rewardItem: 'ammo_energy',
    rewardCount: 1,
    relationDelta: 6,
    xpReward: 90,
    eventTags: [DESIGN_FLOOR_ID, 'net', 'hack_risk', 'scientist'],
    eventPrivacy: 'local',
  },
  {
    id: 'silicon_admin_turn_in_scientist',
    giverId: getPlotNpcNumericId('silicon_admin_checker')!,
    type: QuestType.KILL,
    desc: 'Администратор: «Киборг объяснил слишком много. Уберите его или уведите от терминалов.»',
    targetNpcId: getPlotNpcNumericId('silicon_cyborg_scientist')!,
    rewardItem: 'official_permit_slip',
    rewardCount: 1,
    moneyReward: 120,
    relationDelta: 8,
    xpReward: 130,
    eventTags: [DESIGN_FLOOR_ID, 'admin', 'betrayal', 'net'],
    eventSeverity: 4,
    eventPrivacy: 'witnessed',
    blockedBySideQuestIds: ['silicon_cibo_net_contact'],
  },
];

