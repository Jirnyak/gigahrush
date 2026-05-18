import {
  Faction, Occupation, ZoneFaction,
  type Item, type WorldEventPrivacy, type WorldEventSeverity,
} from '../core/types';

export type FactionEventKind =
  | 'patrol'
  | 'relief_caravan'
  | 'tax_raid'
  | 'chernobog_recruitment'
  | 'black_hand_marks'
  | 'external_supply_cell'
  | 'cult_procession'
  | 'cult_liquidator_clash'
  | 'chernobog_archive_evidence'
  | 'wild_looters'
  | 'liquidator_sweep'
  | 'nii_sample_audit';

export type FactionResidueMarkKind =
  | 'blood'
  | 'gore'
  | 'bullet'
  | 'scorch'
  | 'psi'
  | 'ash'
  | 'chalk'
  | 'water'
  | 'scuff';

export interface FactionResidueMarkDef {
  kind: FactionResidueMarkKind;
  count: number;
  radius: number;
  intensity?: number;
}

export interface FactionPressureDef {
  radius: number;
  strength: number;
  text: string;
}

export interface CultProcessionDef {
  activeSec: number;
  actionRadius: number;
  fearRadius: number;
  controlRadius: number;
  coverSec: number;
}

export type FactionClashOutcome =
  | 'liquidators_win'
  | 'cultists_win'
  | 'mutual_ruin'
  | 'unresolved';

export interface FactionClashSideDef {
  label: string;
  faction: Faction;
  occupation: Occupation;
  minGroup: number;
  maxGroup: number;
  weapons?: readonly string[];
  npcInventory?: readonly Item[];
}

export interface FactionClashOutcomeDef {
  outcome: FactionClashOutcome;
  text: string;
  winnerFaction?: Faction;
  items: readonly Item[];
  rumorIds: readonly string[];
}

export interface FactionClashDef {
  sides: readonly [FactionClashSideDef, FactionClashSideDef];
  reportFaction: Faction;
  reportRewardMoney: number;
  reportText: string;
  outcomes: readonly FactionClashOutcomeDef[];
}

export interface FactionEventDef {
  id: FactionEventKind;
  name: string;
  zoneFactions: readonly ZoneFaction[];
  actorFaction?: Faction;
  occupation: Occupation;
  weight: number;
  cooldownSec: number;
  minGroup: number;
  maxGroup: number;
  weapons?: readonly string[];
  npcInventory?: readonly Item[];
  drops?: readonly Item[];
  containerDrops?: readonly Item[];
  economyDeltas?: readonly { resourceId: string; count: number }[];
  marks: readonly FactionResidueMarkDef[];
  pressure: FactionPressureDef;
  residueText: string;
  message: string;
  itemId?: string;
  severity: WorldEventSeverity;
  privacy: WorldEventPrivacy;
  tags: readonly string[];
  procession?: CultProcessionDef;
  clash?: FactionClashDef;
}

const CIVIL_ZONES = [ZoneFaction.CITIZEN] as const;
const LIQUIDATOR_ZONES = [ZoneFaction.LIQUIDATOR] as const;
const CULTIST_ZONES = [ZoneFaction.CULTIST] as const;
const CULT_CONFLICT_ZONES = [ZoneFaction.CULTIST, ZoneFaction.LIQUIDATOR] as const;
const WILD_ZONES = [ZoneFaction.WILD] as const;
const OWNED_ZONES = [
  ZoneFaction.CITIZEN,
  ZoneFaction.LIQUIDATOR,
  ZoneFaction.CULTIST,
  ZoneFaction.WILD,
] as const;

export const FACTION_EVENT_DEFS: readonly FactionEventDef[] = [
  {
    id: 'patrol',
    name: 'Патруль зоны',
    zoneFactions: OWNED_ZONES,
    occupation: Occupation.TRAVELER,
    weight: 28,
    cooldownSec: 180,
    minGroup: 2,
    maxGroup: 3,
    npcInventory: [{ defId: 'bread', count: 1 }],
    drops: [{ defId: 'cigs', count: 1 }],
    economyDeltas: [{ resourceId: 'labor', count: -1 }],
    marks: [{ kind: 'scuff', count: 3, radius: 0.18, intensity: 90 }],
    pressure: { radius: 5, strength: 0.35, text: 'После патруля граница зоны стала строже.' },
    residueText: 'окурок, свежие следы ботинок и сдвинутая граница патруля',
    message: 'В зоне проходит малый фракционный патруль.',
    severity: 2,
    privacy: 'local',
    tags: ['faction', 'patrol'],
  },
  {
    id: 'relief_caravan',
    name: 'Караван взаимопомощи',
    zoneFactions: CIVIL_ZONES,
    actorFaction: Faction.CITIZEN,
    occupation: Occupation.TRAVELER,
    weight: 16,
    cooldownSec: 260,
    minGroup: 2,
    maxGroup: 3,
    npcInventory: [{ defId: 'water', count: 1 }, { defId: 'bread', count: 1 }],
    drops: [{ defId: 'water', count: 2 }, { defId: 'bread', count: 2 }, { defId: 'bandage', count: 1 }],
    containerDrops: [{ defId: 'water', count: 1 }, { defId: 'bread', count: 1 }],
    economyDeltas: [{ resourceId: 'drink_water', count: 6 }, { resourceId: 'food', count: 5 }, { resourceId: 'medicine', count: 1 }],
    marks: [{ kind: 'water', count: 2, radius: 0.22, intensity: 80 }, { kind: 'chalk', count: 1, radius: 0.28, intensity: 95 }],
    pressure: { radius: 6, strength: 0.45, text: 'Очередь тянется к оставленным пайкам.' },
    residueText: 'бутылки воды, хлеб, мокрые следы и пополненный местный контейнер',
    message: 'Караван взаимопомощи оставил пайки и воду.',
    itemId: 'water',
    severity: 3,
    privacy: 'local',
    tags: ['faction', 'caravan', 'relief'],
  },
  {
    id: 'tax_raid',
    name: 'Налоговый рейд',
    zoneFactions: LIQUIDATOR_ZONES,
    actorFaction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    weight: 13,
    cooldownSec: 300,
    minGroup: 2,
    maxGroup: 3,
    weapons: ['makarov', 'tt_pistol', 'entrenching_spade'],
    npcInventory: [{ defId: 'ammo_9mm', count: 8 }, { defId: 'liquidator_token', count: 1 }],
    drops: [{ defId: 'note', count: 1, data: 'Опись ликвидаторов: изъято за долги секции.' }],
    containerDrops: [{ defId: 'note', count: 1, data: 'Квитанция рейда: шкаф проверен, недостача записана.' }],
    economyDeltas: [{ resourceId: 'documents', count: -4 }, { resourceId: 'food', count: -2 }],
    marks: [{ kind: 'bullet', count: 2, radius: 0.16, intensity: 180 }, { kind: 'blood', count: 2, radius: 0.2, intensity: 160 }],
    pressure: { radius: 7, strength: 0.65, text: 'Ликвидаторы прижали кладовые и бумаги в этой секции.' },
    residueText: 'дырки от пуль, кровь, квитанция рейда и просевшие бумажные запасы',
    message: 'Ликвидаторы проводят налоговый рейд по кладовым.',
    itemId: 'liquidator_token',
    severity: 4,
    privacy: 'local',
    tags: ['faction', 'raid', 'tax'],
  },
  {
    id: 'chernobog_recruitment',
    name: 'Вербовка Чернобога',
    zoneFactions: CIVIL_ZONES,
    actorFaction: Faction.CULTIST,
    occupation: Occupation.TRAVELER,
    weight: 8,
    cooldownSec: 420,
    minGroup: 1,
    maxGroup: 2,
    weapons: ['knife'],
    npcInventory: [{ defId: 'bread', count: 1 }, { defId: 'cigs', count: 1 }],
    drops: [{ defId: 'note', count: 1, data: 'Записка без подписи: хлеб вечером, вопрос про Чернобога не вслух.' }],
    containerDrops: [{ defId: 'note', count: 1, data: 'Список соседей: кому нужна вода, кому можно предложить смысл.' }],
    economyDeltas: [{ resourceId: 'food', count: -1 }, { resourceId: 'documents', count: 1 }],
    marks: [{ kind: 'chalk', count: 2, radius: 0.2, intensity: 105 }, { kind: 'scuff', count: 2, radius: 0.18, intensity: 90 }],
    pressure: { radius: 4, strength: 0.3, text: 'После тихой вербовки люди в секции начинают говорить через соседей.' },
    residueText: 'хлебная крошка, окурок, меловая ладонь и список бытовых долгов',
    message: 'В жилой секции прошла тихая вербовка Чернобога.',
    itemId: 'note',
    severity: 3,
    privacy: 'witnessed',
    tags: ['faction', 'cult', 'chernobog', 'external_cell', 'witness'],
  },
  {
    id: 'black_hand_marks',
    name: 'Черные ладони',
    zoneFactions: OWNED_ZONES,
    actorFaction: Faction.CULTIST,
    occupation: Occupation.PILGRIM,
    weight: 9,
    cooldownSec: 360,
    minGroup: 0,
    maxGroup: 1,
    weapons: ['knife'],
    drops: [{ defId: 'note', count: 1, data: 'Оборот листка замазан черной ладонью. На лицевой стороне только номер подъезда.' }],
    economyDeltas: [{ resourceId: 'paper', count: -1 }],
    marks: [{ kind: 'ash', count: 3, radius: 0.26, intensity: 160 }, { kind: 'chalk', count: 2, radius: 0.22, intensity: 120 }, { kind: 'scuff', count: 2, radius: 0.18, intensity: 90 }],
    pressure: { radius: 5, strength: 0.35, text: 'Черная ладонь делает обычный коридор чужим ориентиром.' },
    residueText: 'сажные отпечатки ладони, меловой край и листок с номером подъезда',
    message: 'На стенах появились черные ладони.',
    itemId: 'note',
    severity: 3,
    privacy: 'local',
    tags: ['faction', 'cult', 'chernobog', 'black_hand', 'witness'],
  },
  {
    id: 'external_supply_cell',
    name: 'Внешняя ячейка снабжения',
    zoneFactions: CIVIL_ZONES,
    actorFaction: Faction.CULTIST,
    occupation: Occupation.STOREKEEPER,
    weight: 7,
    cooldownSec: 460,
    minGroup: 1,
    maxGroup: 2,
    weapons: ['knife', 'pipe'],
    npcInventory: [{ defId: 'bread', count: 1 }, { defId: 'water', count: 1 }, { defId: 'note', count: 1, data: 'Пайки передать через кухню. Черную метку не показывать.' }],
    drops: [{ defId: 'bread', count: 1 }, { defId: 'water', count: 1 }],
    containerDrops: [{ defId: 'bread', count: 1 }, { defId: 'water', count: 1 }, { defId: 'note', count: 1, data: 'Снабжение внешней ячейки: вода, хлеб, смена курьера после сирены.' }],
    economyDeltas: [{ resourceId: 'food', count: -2 }, { resourceId: 'drink_water', count: -2 }, { resourceId: 'documents', count: 1 }],
    marks: [{ kind: 'water', count: 2, radius: 0.2, intensity: 80 }, { kind: 'chalk', count: 2, radius: 0.24, intensity: 110 }],
    pressure: { radius: 5, strength: 0.4, text: 'Кладовые вокруг ячейки пустеют без шума и без свидетелей.' },
    residueText: 'пайковый узел, мокрый след, кухонная меловая метка и список курьеров',
    message: 'Внешняя ячейка Чернобога перетаскивает припасы через жилые кухни.',
    itemId: 'bread',
    severity: 3,
    privacy: 'witnessed',
    tags: ['faction', 'cult', 'chernobog', 'external_cell', 'contraband'],
  },
  {
    id: 'cult_procession',
    name: 'Культовая процессия',
    zoneFactions: CULTIST_ZONES,
    actorFaction: Faction.CULTIST,
    occupation: Occupation.PILGRIM,
    weight: 7,
    cooldownSec: 560,
    minGroup: 3,
    maxGroup: 4,
    weapons: ['knife', 'psi_madness', 'psi_strike'],
    npcInventory: [{ defId: 'meat_rune', count: 1 }],
    drops: [{ defId: 'meat_rune', count: 1 }],
    economyDeltas: [{ resourceId: 'psi', count: 1 }],
    marks: [{ kind: 'psi', count: 3, radius: 0.28, intensity: 190 }, { kind: 'gore', count: 1, radius: 0.32, intensity: 190 }],
    pressure: { radius: 6, strength: 0.6, text: 'Процессия давит на коридор: лучше не идти ей в лоб.' },
    residueText: 'мясная руна, фиолетовые ожоги пола и темный сгусток крови',
    message: 'В зоне идет культовая процессия. Коридор лучше уступить.',
    itemId: 'meat_rune',
    severity: 4,
    privacy: 'local',
    tags: ['faction', 'cult', 'chernobog', 'procession'],
    procession: { activeSec: 70, actionRadius: 9, fearRadius: 18, controlRadius: 7, coverSec: 35 },
  },
  {
    id: 'cult_liquidator_clash',
    name: 'Стычка ликвидаторов и культа',
    zoneFactions: CULT_CONFLICT_ZONES,
    actorFaction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    weight: 10,
    cooldownSec: 420,
    minGroup: 2,
    maxGroup: 3,
    weapons: ['makarov', 'shotgun', 'entrenching_spade'],
    npcInventory: [{ defId: 'ammo_9mm', count: 8 }, { defId: 'bandage', count: 1 }],
    drops: [{ defId: 'ammo_9mm', count: 6 }, { defId: 'meat_rune', count: 1 }],
    containerDrops: [{ defId: 'note', count: 1, data: 'Протокол столкновения: черные ладони, один свидетель, изъять без огласки.' }],
    economyDeltas: [{ resourceId: 'ammo', count: -4 }, { resourceId: 'medicine', count: -1 }, { resourceId: 'documents', count: 1 }],
    marks: [{ kind: 'bullet', count: 3, radius: 0.17, intensity: 210 }, { kind: 'blood', count: 3, radius: 0.22, intensity: 175 }, { kind: 'ash', count: 2, radius: 0.26, intensity: 150 }],
    pressure: { radius: 7, strength: 0.62, text: 'После стычки коридор делят приказ, страх и черная ладонь на стене.' },
    clash: {
      reportFaction: Faction.LIQUIDATOR,
      reportRewardMoney: 45,
      reportText: 'Ликвидатор принял свидетельство о схватке и записал ваш номер.',
      sides: [
        {
          label: 'ликвидаторы',
          faction: Faction.LIQUIDATOR,
          occupation: Occupation.HUNTER,
          minGroup: 2,
          maxGroup: 2,
          weapons: ['makarov', 'shotgun', 'entrenching_spade'],
          npcInventory: [{ defId: 'ammo_9mm', count: 10 }, { defId: 'bandage', count: 1 }],
        },
        {
          label: 'чернобожники',
          faction: Faction.CULTIST,
          occupation: Occupation.PILGRIM,
          minGroup: 2,
          maxGroup: 3,
          weapons: ['knife', 'psi_strike', 'psi_madness'],
          npcInventory: [{ defId: 'meat_rune', count: 1 }],
        },
      ],
      outcomes: [
        {
          outcome: 'liquidators_win',
          winnerFaction: Faction.LIQUIDATOR,
          text: 'Ликвидаторы добили ячейку, но оставили на полу мясной знак и гильзы.',
          items: [
            { defId: 'note', count: 1, data: 'Свидетельство схватки: ликвидаторы зачистили культовую ячейку, один знак пропал.' },
            { defId: 'ammo_9mm', count: 7 },
            { defId: 'meat_rune', count: 1 },
          ],
          rumorIds: ['faction_liquidator_ammo'],
        },
        {
          outcome: 'cultists_win',
          winnerFaction: Faction.CULTIST,
          text: 'Чернобожники утащили тела, оставив жетон в крови и чужую молитву на бетоне.',
          items: [
            { defId: 'note', count: 1, data: 'Свидетельство схватки: культовая ячейка пережила зачистку, жетон найден в крови.' },
            { defId: 'liquidator_token', count: 1 },
            { defId: 'meat_rune', count: 1 },
          ],
          rumorIds: ['faction_zone_border'],
        },
        {
          outcome: 'mutual_ruin',
          text: 'Обе стороны легли рядом, и теперь доказательства можно забрать до чужого патруля.',
          items: [
            { defId: 'note', count: 1, data: 'Свидетельство схватки: обе стороны погибли, знаки Чернобога и гильзы остались рядом.' },
            { defId: 'ammo_9mm', count: 5 },
            { defId: 'meat_rune', count: 1 },
          ],
          rumorIds: ['faction_zone_border'],
        },
        {
          outcome: 'unresolved',
          text: 'Схватка распалась на отдельные выстрелы, оставив следы без ясного победителя.',
          items: [
            { defId: 'note', count: 1, data: 'Свидетельство схватки: стороны разошлись, но пол сохранил гильзы и культовый знак.' },
            { defId: 'ammo_9mm', count: 4 },
          ],
          rumorIds: ['faction_zone_border'],
        },
      ],
    },
    residueText: 'пули, кровь, сажа от ладоней, мясная руна и протокол без фамилий',
    message: 'Ликвидаторы сцепились с чернобожниками в ближайшем коридоре.',
    itemId: 'meat_rune',
    severity: 5,
    privacy: 'local',
    tags: ['faction', 'cult', 'chernobog', 'liquidator', 'witness'],
  },
  {
    id: 'chernobog_archive_evidence',
    name: 'Архивное свидетельство Чернобога',
    zoneFactions: [ZoneFaction.CITIZEN, ZoneFaction.LIQUIDATOR],
    actorFaction: Faction.LIQUIDATOR,
    occupation: Occupation.SECRETARY,
    weight: 5,
    cooldownSec: 520,
    minGroup: 0,
    maxGroup: 1,
    weapons: ['makarov'],
    drops: [{ defId: 'note', count: 1, data: 'Архивная выписка: внешние ячейки, черные ладони, свидетели не совпадают.' }],
    containerDrops: [{ defId: 'note', count: 1, data: 'Копия дела Чернобога: центральная ячейка не подтверждена, внешние ячейки активны.' }],
    economyDeltas: [{ resourceId: 'documents', count: 2 }, { resourceId: 'paper', count: -1 }],
    marks: [{ kind: 'chalk', count: 2, radius: 0.2, intensity: 115 }, { kind: 'scuff', count: 2, radius: 0.18, intensity: 95 }],
    pressure: { radius: 4, strength: 0.28, text: 'Архивная копия делает бытовой слух доказательством, но не объяснением.' },
    residueText: 'архивная выписка, стертая подпись, меловая ладонь и следы поспешной описи',
    message: 'В зоне всплыло архивное свидетельство о ячейках Чернобога.',
    itemId: 'note',
    severity: 4,
    privacy: 'witnessed',
    tags: ['faction', 'cult', 'chernobog', 'external_cell', 'witness'],
  },
  {
    id: 'wild_looters',
    name: 'Налет диких',
    zoneFactions: WILD_ZONES,
    actorFaction: Faction.WILD,
    occupation: Occupation.TRAVELER,
    weight: 16,
    cooldownSec: 240,
    minGroup: 2,
    maxGroup: 4,
    weapons: ['pipe', 'knife', 'crowbar'],
    npcInventory: [{ defId: 'cigs', count: 2 }, { defId: 'bread', count: 1 }],
    drops: [{ defId: 'cigs', count: 2 }],
    containerDrops: [{ defId: 'note', count: 1, data: 'Кривая метка: здесь уже вскрывали чужой запас.' }],
    economyDeltas: [{ resourceId: 'food', count: -4 }, { resourceId: 'tools', count: -2 }],
    marks: [{ kind: 'blood', count: 2, radius: 0.18, intensity: 145 }, { kind: 'scuff', count: 3, radius: 0.2, intensity: 100 }],
    pressure: { radius: 5, strength: 0.55, text: 'После налета люди обходят шкафы стороной.' },
    residueText: 'окурки, кровь, следы вскрытия и метка на ближайшем контейнере',
    message: 'Дикие вскрывают чужие нычки и тащат припасы.',
    itemId: 'cigs',
    severity: 4,
    privacy: 'local',
    tags: ['faction', 'looters', 'theft'],
  },
  {
    id: 'liquidator_sweep',
    name: 'Зачистка ликвидаторов',
    zoneFactions: LIQUIDATOR_ZONES,
    actorFaction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    weight: 14,
    cooldownSec: 320,
    minGroup: 3,
    maxGroup: 4,
    weapons: ['makarov', 'shotgun', 'ppsh'],
    npcInventory: [{ defId: 'ammo_9mm', count: 12 }, { defId: 'bandage', count: 1 }],
    drops: [{ defId: 'ammo_9mm', count: 8 }],
    economyDeltas: [{ resourceId: 'ammo', count: -3 }],
    marks: [{ kind: 'bullet', count: 3, radius: 0.17, intensity: 210 }, { kind: 'scorch', count: 1, radius: 0.3, intensity: 170 }, { kind: 'blood', count: 2, radius: 0.22, intensity: 170 }],
    pressure: { radius: 8, strength: 0.7, text: 'Коридор после зачистки слушается ликвидаторов.' },
    residueText: 'рассыпанные патроны, пулевые отметины, копоть и кровь у коридора',
    message: 'Ликвидаторы начали зачистку ближайших коридоров.',
    itemId: 'ammo_9mm',
    severity: 4,
    privacy: 'local',
    tags: ['faction', 'sweep', 'liquidator'],
  },
  {
    id: 'nii_sample_audit',
    name: 'Ревизия проб НИИ',
    zoneFactions: [ZoneFaction.CITIZEN, ZoneFaction.LIQUIDATOR],
    actorFaction: Faction.SCIENTIST,
    occupation: Occupation.SCIENTIST,
    weight: 7,
    cooldownSec: 420,
    minGroup: 1,
    maxGroup: 2,
    npcInventory: [{ defId: 'nii_sample_container', count: 1 }, { defId: 'nii_market_receipt', count: 1 }],
    drops: [{ defId: 'nii_market_receipt', count: 1 }],
    containerDrops: [{ defId: 'nii_contraband_manifest', count: 1 }],
    economyDeltas: [{ resourceId: 'documents', count: -2 }],
    marks: [{ kind: 'chalk', count: 2, radius: 0.24, intensity: 105 }, { kind: 'scuff', count: 2, radius: 0.18, intensity: 110 }],
    pressure: { radius: 5, strength: 0.45, text: 'После ревизии НИИ шкафы стали тише, а подписи дороже.' },
    residueText: 'меловые номера проб, рыночная расписка и пропавшая строка в ведомости',
    message: 'Учёные НИИ сверяют пробы по чужим шкафам.',
    itemId: 'nii_market_receipt',
    severity: 4,
    privacy: 'local',
    tags: ['faction', 'nii', 'sample', 'contraband', 'ministry', 'audit'],
  },
];
