import {
  Faction,
  Occupation,
  Tex,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { hashSeed } from '../../core/rand';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('pioneer_camp');

export const PIONEER_CAMP_DESIGN_FLOOR_ID = 'pioneer_camp' as const;

export const PIONEER_CAMP_ROUTE_Z = 38;

export const PIONEER_CAMP_BASE_FLOOR = 100;

export const PIONEER_CAMP_DISPLAY_NAME = 'Пионерлагерь';

export const CAMP_SEED = hashSeed(PIONEER_CAMP_DESIGN_FLOOR_ID);

export const CX = W >> 1;

export const CY = W >> 1;

export const CAMP_GATE_X = CX - 34;

export const CAMP_GATE_Y = CY - 126;

export const CAMP_GATE_W = 68;

export const CAMP_GATE_H = 20;

export const CAMP_SAFE_TRAIL_STEPS = 220;

export const CAMP_BUFFER_TRAIL_STEPS = 340;

export const NPC_IDS = {
  shift: 'camp_shift_tamara',
  radio: 'camp_radio_egor',
  medic: 'camp_medic_ira',
  cook: 'camp_canteen_zoya',
} as const;

export type CampNpcId = (typeof NPC_IDS)[keyof typeof NPC_IDS];

export interface CampRooms {
  square: Room;
  gate: Room;
  loudspeaker: Room;
  canteen: Room;
  infirmary: Room;
  library: Room;
  radioClub: Room;
  musicClub: Room;
  storage: Room;
  stage: Room;
  bathhouse: Room;
  boat: Room;
  sport: Room;
  oldCabin: Room;
}

export interface CampClusterSpec {
  name: string;
  x: number;
  y: number;
  linkX: number;
  linkY: number;
  floorTex: Tex;
}

export interface CampHqSite {
  owner: TerritoryOwner;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  linkX: number;
  linkY: number;
  wallTex: Tex;
  floorTex: Tex;
}

export interface CampTerritoryTarget {
  owner: TerritoryOwner;
  share: number;
}

export interface CampTerritorySeed {
  owner: TerritoryOwner;
  x: number;
  y: number;
  radius: number;
  weight: number;
}

export const CAMP_OWNER_BUCKETS = 8;

export const CAMP_TERRITORY_ITERATIONS = 8;

export const CAMP_TERRITORY_TARGETS: readonly CampTerritoryTarget[] = [
  { owner: ZoneFaction.CITIZEN, share: 0.58 },
  { owner: ZoneFaction.LIQUIDATOR, share: 0.12 },
  { owner: ZoneFaction.CULTIST, share: 0.07 },
  { owner: ZoneFaction.SCIENTIST, share: 0.09 },
  { owner: ZoneFaction.WILD, share: 0.14 },
] as const;

export const CAMP_CLUSTER_SPECS: readonly CampClusterSpec[] = [
  { name: 'Северо-западный парк бетонных берёз', x: 238, y: 236, linkX: 210, linkY: 210, floorTex: Tex.F_CONCRETE },
  { name: 'Северная линейка спальных бараков', x: 516, y: 178, linkX: 512, linkY: 132, floorTex: Tex.F_WOOD },
  { name: 'Северо-восточный двор зарядки', x: 778, y: 238, linkX: 800, linkY: 210, floorTex: Tex.F_CONCRETE },
  { name: 'Восточный парк неподвижных качелей', x: 842, y: 520, linkX: 864, linkY: 512, floorTex: Tex.F_CONCRETE },
  { name: 'Юго-восточная костровая поляна', x: 764, y: 784, linkX: 790, linkY: 790, floorTex: Tex.F_WOOD },
  { name: 'Южный двор тихого часа', x: 514, y: 850, linkX: 512, linkY: 888, floorTex: Tex.F_WOOD },
  { name: 'Юго-западный парк мокрых турников', x: 246, y: 800, linkX: 210, linkY: 756, floorTex: Tex.F_CONCRETE },
  { name: 'Западная площадка кружков', x: 154, y: 512, linkX: 160, linkY: 512, floorTex: Tex.F_WOOD },
] as const;

export const CAMP_LANDSCAPE_COURTS: readonly { name: string; x: number; y: number; w: number; h: number; linkX: number; linkY: number; floorTex: Tex }[] = [
  { name: 'Большой парк бетонных берёз', x: 124, y: 148, w: 96, h: 72, linkX: 210, linkY: 210, floorTex: Tex.F_CONCRETE },
  { name: 'Двор утренней зарядки', x: 744, y: 132, w: 118, h: 78, linkX: 800, linkY: 210, floorTex: Tex.F_CONCRETE },
  { name: 'Поляна костровой сирены', x: 710, y: 624, w: 136, h: 86, linkX: 790, linkY: 790, floorTex: Tex.F_WOOD },
  { name: 'Парк мокрых качелей', x: 116, y: 690, w: 126, h: 88, linkX: 210, linkY: 756, floorTex: Tex.F_CONCRETE },
] as const;

export const CAMP_HQ_SITES: readonly CampHqSite[] = [
  { owner: ZoneFaction.CITIZEN, x: 438, y: 616, w: 30, h: 18, name: 'Штаб гражданской смены', linkX: 512, linkY: 590, wallTex: Tex.PANEL, floorTex: Tex.F_WOOD },
  { owner: ZoneFaction.LIQUIDATOR, x: 804, y: 156, w: 28, h: 18, name: 'Пост ликвидаторов у ворот лагеря', linkX: 800, linkY: 210, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { owner: ZoneFaction.SCIENTIST, x: 644, y: 360, w: 28, h: 18, name: 'НИИ-штаб радиосмены', linkX: 602, linkY: 446, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { owner: ZoneFaction.WILD, x: 244, y: 326, w: 30, h: 18, name: 'Дикий штаб старшего отряда', linkX: 332, linkY: 375, wallTex: Tex.ROTTEN, floorTex: Tex.F_WOOD },
  { owner: ZoneFaction.CULTIST, x: 164, y: 744, w: 28, h: 18, name: 'Скрытый культовый штаб костра', linkX: 160, linkY: 756, wallTex: Tex.ROTTEN, floorTex: Tex.F_MEAT },
] as const;

export const CAMP_TERRITORY_SEEDS: readonly CampTerritorySeed[] = [
  { owner: ZoneFaction.CITIZEN, x: CX, y: CY, radius: 330, weight: 2.8 },
  { owner: ZoneFaction.CITIZEN, x: 438, y: 625, radius: 210, weight: 1.35 },
  { owner: ZoneFaction.CITIZEN, x: 570, y: 552, radius: 180, weight: 1.2 },
  { owner: ZoneFaction.LIQUIDATOR, x: 818, y: 165, radius: 210, weight: 1.4 },
  { owner: ZoneFaction.LIQUIDATOR, x: CX, y: 132, radius: 150, weight: 0.95 },
  { owner: ZoneFaction.SCIENTIST, x: 658, y: 370, radius: 200, weight: 1.35 },
  { owner: ZoneFaction.SCIENTIST, x: 592, y: 458, radius: 150, weight: 0.95 },
  { owner: ZoneFaction.CULTIST, x: 178, y: 752, radius: 180, weight: 1.3 },
  { owner: ZoneFaction.CULTIST, x: 764, y: 784, radius: 150, weight: 0.65 },
  { owner: ZoneFaction.WILD, x: 252, y: 340, radius: 210, weight: 1.45 },
  { owner: ZoneFaction.WILD, x: CX, y: CY - 380, radius: 150, weight: 0.9 },
  { owner: ZoneFaction.WILD, x: CX - 352, y: CY, radius: 150, weight: 0.9 },
  { owner: ZoneFaction.WILD, x: CX + 352, y: CY, radius: 150, weight: 0.8 },
  { owner: ZoneFaction.WILD, x: CX, y: CY + 376, radius: 150, weight: 0.8 },
] as const;

export const NPC_DEFS: Record<CampNpcId, PlotNpcDef> = {
  camp_shift_tamara: {
    name: 'Тамара Сменная',
    isFemale: true,
    faction: Faction.SCIENTIST,
    occupation: Occupation.DIRECTOR,
    sprite: Occupation.DIRECTOR,
    hp: 150, maxHp: 150, money: 70, speed: 0.82,
    inventory: [
      { defId: 'blank_form', count: 2 },
      { defId: 'emergency_roster', count: 1 },
      { defId: 'kompot', count: 1 },
    ],
    talkLines: [
      'Смена не заканчивается. По расписанию уже тридцать седьмой тихий час, а дети всё ещё числятся в строю.',
      'Площадь держит лагерь вместе. Если список укрытия врёт, линейка станет очередью в гермодверь.',
      'Не называйте это Совёнком. У нас другая птица, бетонная, и она не спит.',
    ],
    talkLinesPost: [
      'Список сверили. Теперь хотя бы понятно, кого нет, когда все стоят перед нами.',
      'Если услышите горн после сирены, идите не на звук, а к ближайшей двери.',
    ],
  },
  camp_radio_egor: {
    name: 'Егор Радиокружок',
    isFemale: false,
    faction: Faction.SCIENTIST,
    occupation: Occupation.ELECTRICIAN,
    sprite: Occupation.ELECTRICIAN,
    hp: 105, maxHp: 105, money: 44, speed: 0.9,
    inventory: [
      { defId: 'radio', count: 1 },
      { defId: 'wire_coil', count: 1 },
      { defId: 'circuit_board', count: 1 },
    ],
    talkLines: [
      'Радиорубка ловит не эфир, а соседние версии этого лагеря. Все говорят одно и то же с разной задержкой.',
      'Два мотка проволоки, и я заведу громкоговоритель. Можно предупредить столовую, а можно заманить то, что слушает.',
      'Песни лучше не ставить. Последний раз хор подпевал из старого корпуса.',
    ],
    talkLinesPost: [
      'Линия живая. Когда она щёлкает три раза, значит кто-то отвечает из леса.',
      'Громкоговоритель теперь наш. Пока он не решил наоборот.',
    ],
  },
  camp_medic_ira: {
    name: 'Ира Медпункт',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.DOCTOR,
    sprite: Occupation.DOCTOR,
    hp: 115, maxHp: 115, money: 38, speed: 0.88,
    inventory: [
      { defId: 'bandage', count: 2 },
      { defId: 'iodine', count: 1 },
      { defId: 'pills', count: 1 },
    ],
    talkLines: [
      'Ссадины обычные. Следы строем - нет. После отбоя сюда приходят те, кто должен был спать.',
      'Санитарный набор нужен не для героизма. Для выбора: лечить беглеца из леса или держать запас для линейки.',
      'В медпункте тихо, потому что стены здесь слушают пульс.',
    ],
    talkLinesPost: [
      'Перевязочный запас есть. Это не безопасность, но уже не голые руки.',
      'Если кто-то улыбается одинаково долго, ведите ко мне или сразу к Егору.',
    ],
  },
  camp_canteen_zoya: {
    name: 'Зоя Столовая',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.COOK,
    sprite: Occupation.COOK,
    hp: 125, maxHp: 125, money: 58, speed: 0.8,
    inventory: [
      { defId: 'kasha', count: 3 },
      { defId: 'kompot', count: 2 },
      { defId: 'knife', count: 1 },
    ],
    talkLines: [
      'Перловка держит строй лучше вожатых. Главное - не спрашивать, кто стоял в кастрюле до крупы.',
      'Сахар принеси. Сделаю компот для живых или сироп для тех, кто притворяется детьми.',
      'Из столовой проще всего украсть. Потом весь лагерь знает, кто ел слишком тихо.',
    ],
    talkLinesPost: [
      'Компот есть. Дежурные спорят, кому положен первый ковш.',
      'Если в каше что-то шевелится, не мешайте вообще. Зовите дежурного и отходите от котла.',
    ],
  },
};

