/* -- Design z: Черный рынок 88 --------------------------------
 * Standalone future-floor slice. It deliberately does not add a new
 * number; route integration belongs to the floor manifest owner.
 */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  Occupation,
  QuestType,
  W,
  ZoneFaction,
  type ContainerAccess,
  type Entity,
  type Item,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { factionToTerritoryOwner } from '../../data/factions';
import { type PlotNpcDef, type SideQuestStep, registerFloorSideQuest } from '../../data/plot';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { rng } from '../../core/rand';
import './living_zone';


import { MarketRooms, Market88ServiceGutPlacement, Market88BazaarRooms, market88OwnerFaction } from './geometry';
import { DESIGN_NPC_HOME_FLOOR_KEY, BLACK_MARKET_88_ROUTE_ID, BLACK_MARKET_88_CONTAINER_FLOOR } from './index';
export const MARKET88_QUEUE_CROWD_CAP = 16;

export const NPC_DEFS: Record<string, PlotNpcDef> = {
  market88_marta_broker: {
    name: 'Марта Восьмая',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.STOREKEEPER,
    sprite: Occupation.STOREKEEPER,
    hp: 160, maxHp: 160, money: 140, speed: 0.75,
    inventory: [
      { defId: 'antibiotic', count: 1 },
      { defId: 'pills', count: 2 },
      { defId: 'bandage', count: 3 },
      { defId: 'fake_pass', count: 1 },
      { defId: 'govnyak_roll', count: 3 },
      { defId: 'govnyak_brick', count: 1 },
    ],
    talkLines: [
      'Восемьдесят восьмой не продает спасение. Он продает отсрочку.',
      'Цена растет от дефицита, от жара и от того, как громко ты платишь.',
      'Берешь товар в долг - оставляешь имя. Имя здесь стоит дороже рубля.',
      'Фильтр сухой? Цена одна. Фильтр сухой и без фамилии? Цена другая.',
      'Сдать пробу можно мне, НИИ или Министерству. Я плачу быстрее, они дольше оформляют.',
      'Нужен товар без вопросов - плати до сирены. После сирены вопросы идут сами.',
    ],
    talkLinesPost: [
      'Запас не бесконечный. У прилавка считают каждую руку.',
      'После рейда ящики пустеют сами. Так дешевле, чем объяснять.',
      'Кухня берет водой, этаж 69 - деталями, НИИ - пробами. Рынок берет всем, что дойдет.',
    ],
  },
  market88_mikhail_debt: {
    name: 'Михаил Долговой',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.SECRETARY,
    sprite: Occupation.SECRETARY,
    hp: 120, maxHp: 120, money: 88, speed: 0.7,
    inventory: [
      { defId: 'voluntary_receipt', count: 2 },
      { defId: 'blank_form', count: 1 },
      { defId: 'cigs', count: 2 },
    ],
    talkLines: [
      'Долг без владельца - слух. Долг с владельцем - расписание.',
      'Погаси восемьдесят восемь сейчас, пока охрана считает это арифметикой.',
      'Просрочка не убивает сразу. Она ставит охрану ближе к твоей двери.',
      'Долг можно закрыть деньгами, бумагой или человеком. Лучше деньгами.',
      'Мокрый талон идет в полцены. Мокрый должник идет в отдельную колонку.',
      'Не проси скидку при лампе. Лампа потом свидетель.',
    ],
    talkLinesPost: [
      'Сегодня тетрадь закрыта. Завтра Миша снова откроет ее на твоей строке.',
      'Если рейд пришел раньше срока, значит кто-то заплатил чужим временем.',
      'Твой корешок лежит тихо. Так и держи его: сухо, ровно, без героизма.',
    ],
  },
  market88_zlata_silence: {
    name: 'Злата Тишина',
    isFemale: true,
    faction: Faction.WILD,
    occupation: Occupation.SECRETARY,
    sprite: Occupation.SECRETARY,
    hp: 95, maxHp: 95, money: 70, speed: 0.9,
    inventory: [
      { defId: 'fake_pass', count: 1 },
      { defId: 'blank_form', count: 2 },
      { defId: 'denunciation', count: 1 },
      { defId: 'metro_ticket', count: 1 },
    ],
    talkLines: [
      'Пароль не говорят. Его теряют рядом с тем, кто умеет слушать.',
      'Чистая печать открывает грязные двери. Грязная печать открывает быстрее.',
      'Курьера прячут не потому, что он важный. Потому что он еще не заговорил.',
      'Документ мокрый - скидка. Печать целая - разговор продолжается.',
      'Подделать можно корешок, очередь и маршрут. Свидетеля лучше не подделывать.',
      'Министерский бланк не продавай у лампы. При свете видно, где печать липовая.',
    ],
    talkLinesPost: [
      'Если бумага молчит, значит сделка еще жива.',
      'Неправильный маршрут тоже маршрут, просто он берет больше.',
      'Кто сдал доказательство наверх, тот продал не вещь, а след за собой.',
    ],
  },
  market88_zhoka_knife: {
    name: 'Жока Нож',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 240, maxHp: 240, money: 60, speed: 0.95,
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 18 },
      { defId: 'ammo_shells', count: 3 },
      { defId: 'liquidator_token', count: 1 },
      { defId: 'ip4_gasmask', count: 1 },
      { defId: 'shock_baton', count: 1 },
    ],
    talkLines: [
      'Оружейный ряд не любит скидки. Скидка звучит как донос.',
      'Патроны продаю поштучно, потому что очередь умирает не пачками.',
      'Рейд не грабит рынок. Рейд прячет товар так, что он перестает быть товаром.',
      'Ликвидаторский жетон купишь дешевле крови, но дороже честного объяснения.',
      'Девятку бери до сирены. Во время сирены торгуется только дверь.',
      'Украл из ящика - считай патроны вслух, я по голосу найду остаток.',
    ],
    talkLinesPost: [
      'Стволы закрыты, если жара выше нормы. Норма тут маленькая.',
      'Если взял из ящика без спроса, беги до того, как я досчитаю.',
      'Этаж 69 присылает детали, когда ему страшно. Я беру деталями, если они не пищат.',
    ],
  },
  market88_uliana_cash: {
    name: 'Ульяна Касса',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.STOREKEEPER,
    sprite: Occupation.STOREKEEPER,
    hp: 115, maxHp: 115, money: 120, speed: 0.75,
    inventory: [
      { defId: 'water', count: 3 },
      { defId: 'bread', count: 2 },
      { defId: 'canned', count: 1 },
      { defId: 'bandage', count: 2 },
    ],
    talkLines: [
      'Касса не покупает обратно то, что сама испугалась продать.',
      'Хочешь дешевле - принеси товар, снизь жар или закрой чей-нибудь долг.',
      'После мокрого самосбора сухой хлеб идет как документ.',
      'Входная касса стоит у самой двери: берешь честный талон или идешь через люк с долгом.',
      'Воду меняю на фильтр, фильтр на проход, проход на молчание. Деньги просто короче.',
      'Кухня просит крупу, НИИ просит банку, Министерство просит подпись. Мне хватит цены.',
      'Если покупаешь спасение, не торгуйся так, будто его можно вернуть.',
    ],
    talkLinesPost: [
      'Касса открыта. Ящик закрыт. Это разные новости.',
      'Если товар пропал, пропажа найдет свидетеля сама.',
      'Чужая проблема сегодня свежая. Завтра она дешевеет, если доживет.',
    ],
  },
  market88_courier_sasha: {
    name: 'Саша Люк',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.TRAVELER,
    sprite: Occupation.TRAVELER,
    hp: 75, maxHp: 75, money: 12, speed: 1.15,
    inventory: [
      { defId: 'gasmask_filter', count: 1 },
      { defId: 'note', count: 1 },
    ],
    talkLines: [
      'Я не видел рейд. Я видел, как прилавки стали пустыми за минуту до него.',
      'Люк ведет вниз, если проводник трезвый. Если нет - все равно вниз.',
      'Спрячешь меня до отбоя - получишь маршрут, который еще не успели продать.',
      'На этаж 69 ходят за деталями, назад - за ценой. Я знаю короткий путь, но он берет фильтр.',
      'Если несешь пробу НИИ, не ставь рядом с хлебом. Хлеб потом слишком ученый.',
      'У кухни слухи дешевые, зато горячие. У рынка дорогие, зато с адресом.',
    ],
    talkLinesPost: [
      'Спасибо. Я теперь тише, чем был должен.',
      'Люк мокрый, но живой. Пока.',
      'Маршрут не бесплатный. Просто сегодня я плачу тишиной.',
    ],
  },
};

export const SIDE_QUESTS: readonly SideQuestStep[] = [
  {
    id: 'market88_deliver_night_stock',
    giverId: getPlotNpcNumericId('market88_marta_broker')!,
    type: QuestType.FETCH,
    desc: 'Марта Восьмая: «Принеси антибиотик в ночной запас. Деньги будут, но главный товар - доверие.»',
    targetItem: 'antibiotic',
    targetCount: 1,
    rewardItem: 'fake_pass',
    rewardCount: 1,
    extraRewards: [{ defId: 'cigs', count: 2 }],
    relationDelta: 10,
    xpReward: 55,
    moneyReward: 80,
    targetRoute: { designFloorId: BLACK_MARKET_88_ROUTE_ID, label: 'Z-10 Черный рынок 88' },
    targetZoneTag: 'black_market_88',
    targetHint: 'Z-10 Черный рынок 88: антибиотик для ночного запаса у рядов и лекарственного шкафа.',
    eventTags: ['black_market_88', 'trade', 'supplier_delivery', 'market_scarcity'],
    eventData: { routeId: BLACK_MARKET_88_ROUTE_ID, marketAction: 'supplier_delivery', scarcityLane: 'medicine' },
  },
  {
    id: 'market88_hide_courier',
    giverId: getPlotNpcNumericId('market88_zlata_silence')!,
    type: QuestType.TALK,
    desc: 'Злата Тишина: «Найди Сашу Люка и скажи, что люк сегодня спит. Не геройствуй, просто доведи слова.»',
    targetNpcId: getPlotNpcNumericId('market88_courier_sasha')!,
    rewardItem: 'blank_form',
    rewardCount: 1,
    extraRewards: [{ defId: 'water', count: 1 }],
    relationDelta: 9,
    xpReward: 45,
    moneyReward: 45,
    targetRoute: { designFloorId: BLACK_MARKET_88_ROUTE_ID, label: 'Z-10 Черный рынок 88' },
    targetZoneTag: 'black_market_88',
    targetHint: 'Z-10 Черный рынок 88: Саша Люк прячется в курьерской щели у служебного люка.',
    eventTags: ['black_market_88', 'caravan', 'protect_courier', 'black_route_papers'],
    eventData: { routeId: BLACK_MARKET_88_ROUTE_ID, marketAction: 'protect_courier', laneId: 'production_black_market_88' },
    blockedBySideQuestIds: ['market88_betray_supplier'],
  },
  {
    id: 'market88_steal_stamp',
    giverId: getPlotNpcNumericId('market88_zlata_silence')!,
    type: QuestType.FETCH,
    desc: 'Злата Тишина: «Нужна печать ЖЭК. Купить нельзя: продавца сдадут вместе с тобой, и печать сгорит до первого окна.»',
    targetItem: 'zhek_seal',
    targetCount: 1,
    rewardItem: 'fake_pass',
    rewardCount: 1,
    relationDelta: 8,
    xpReward: 60,
    moneyReward: 70,
    targetRoute: { designFloorId: BLACK_MARKET_88_ROUTE_ID, label: 'Z-10 Черный рынок 88' },
    targetZoneTag: 'black_market_88',
    targetHint: 'Z-10 Черный рынок 88: печать ЖЭК нужна Злате для черного маршрута и поддельных окон.',
    eventTags: ['black_market_88', 'forgery', 'theft', 'black_route_papers'],
    eventData: { routeId: BLACK_MARKET_88_ROUTE_ID, marketAction: 'forge_route_papers', permitRisk: 'zhek_seal' },
  },
  {
    id: 'market88_settle_bad_debt',
    giverId: getPlotNpcNumericId('market88_mikhail_debt')!,
    type: QuestType.FETCH,
    desc: 'Михаил Долговой: «Восемьдесят восемь рублей - и я вычеркиваю твою строку до вечерней проверки.»',
    targetItem: 'money',
    targetCount: 88,
    rewardItem: 'voluntary_receipt',
    rewardCount: 1,
    extraRewards: [{ defId: 'bread', count: 1 }],
    relationDelta: 6,
    xpReward: 35,
    targetRoute: { designFloorId: BLACK_MARKET_88_ROUTE_ID, label: 'Z-10 Черный рынок 88' },
    targetZoneTag: 'black_market_88',
    targetHint: 'Z-10 Черный рынок 88: Михаил закрывает долг только у долговой конторы 88.',
    eventTags: ['black_market_88', 'debt_settlement', 'bank_debt', 'market_scarcity'],
    eventData: { routeId: BLACK_MARKET_88_ROUTE_ID, marketAction: 'debt_settlement', debtRubles: 88 },
  },
  {
    id: 'market88_return_ammo_crate',
    giverId: getPlotNpcNumericId('market88_zhoka_knife')!,
    type: QuestType.FETCH,
    desc: 'Жока Нож: «Верни двадцать четыре девятки в ряд. За полный ряд дам дробь и скажу, какой шкаф сегодня без охраны.»',
    targetItem: 'ammo_9mm',
    targetCount: 24,
    rewardItem: 'ammo_shells',
    rewardCount: 3,
    extraRewards: [{ defId: 'liquidator_token', count: 1 }],
    relationDelta: 8,
    xpReward: 50,
    moneyReward: 30,
    targetRoute: { designFloorId: BLACK_MARKET_88_ROUTE_ID, label: 'Z-10 Черный рынок 88' },
    targetZoneTag: 'black_market_88',
    targetHint: 'Z-10 Черный рынок 88: Жока считает патроны у оружейного ряда и рейдовых задвижек.',
    eventTags: ['black_market_88', 'trade', 'weapons', 'supplier_delivery'],
    eventData: { routeId: BLACK_MARKET_88_ROUTE_ID, marketAction: 'ammo_supplier_return', scarcityLane: 'weapons' },
  },
  {
    id: 'market88_betray_supplier',
    giverId: getPlotNpcNumericId('market88_zhoka_knife')!,
    type: QuestType.TALK,
    desc: 'Жока Нож: «Саша ведет поставщика мимо моей задвижки. Скажи ему, что маршрут продан, и не стой между мной и люком.»',
    targetNpcId: getPlotNpcNumericId('market88_courier_sasha')!,
    rewardItem: 'ammo_9mm',
    rewardCount: 12,
    extraRewards: [{ defId: 'liquidator_token', count: 1 }],
    relationDelta: 7,
    xpReward: 45,
    moneyReward: 40,
    targetRoute: { designFloorId: BLACK_MARKET_88_ROUTE_ID, label: 'Z-10 Черный рынок 88' },
    targetZoneTag: 'black_market_88',
    targetHint: 'Z-10 Черный рынок 88: предать поставщика можно через Сашу Люка в курьерской щели.',
    eventTags: ['black_market_88', 'supplier_betrayal', 'caravan', 'crime', 'black_route_papers'],
    eventData: { routeId: BLACK_MARKET_88_ROUTE_ID, marketAction: 'supplier_betrayal', laneId: 'production_black_market_88' },
    blockedBySideQuestIds: ['market88_hide_courier'],
    abandonsSideQuestIds: ['market88_hide_courier'],
  },
];

export let contentRegistered = false;

export function registerBlackMarket88DesignFloorContent(): void {
  if (contentRegistered) return;
  const questsByNpcId: Record<string, typeof SIDE_QUESTS[number][]> = {};
  for (const q of SIDE_QUESTS) {
    if (!questsByNpcId[q.giverId]) questsByNpcId[q.giverId] = [];
    questsByNpcId[q.giverId].push(q);
  }
  for (const npcId of Object.keys(NPC_DEFS)) {
    const quests = questsByNpcId[npcId] || [];
    registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, npcId, NPC_DEFS[npcId], quests);
  }
  contentRegistered = true;
}

export function seedBazaarCaches(world: World, rooms: Market88BazaarRooms, serviceGuts: readonly Market88ServiceGutPlacement[]): void {
  if (rooms.tunnelCacheWest) {
    addContainer(world, rooms.tunnelCacheWest, 9, 5, ContainerKind.SECRET_STASH, 'Тайник западного обхода 88', 'secret', 5, [
      { defId: 'fake_pass', count: 1 },
      { defId: 'blank_form', count: 1 },
      { defId: 'cigs', count: 3 },
    ], ['market88', 'contraband_cache', 'smuggling_tunnel'], undefined, Faction.WILD, 4, false);
  }
  if (rooms.tunnelCacheEast) {
    addContainer(world, rooms.tunnelCacheEast, 8, 5, ContainerKind.SECRET_STASH, 'Тайник восточного обхода 88', 'secret', 6, [
      { defId: 'ammo_9mm', count: 10 },
      { defId: 'gasmask_filter', count: 1 },
      { defId: 'voluntary_receipt', count: 1 },
    ], ['market88', 'contraband_cache', 'raid_bypass'], undefined, Faction.WILD, 5, false);
  }
  if (rooms.coldStorage) {
    addContainer(world, rooms.coldStorage, 11, 6, ContainerKind.METAL_CABINET, 'Холодный шкаф без накладной 88', 'locked', 7, [
      { defId: 'pills', count: 2 },
      { defId: 'water', count: 2 },
      { defId: 'door_kit', count: 1 },
    ], ['market88', 'contraband_cache', 'cold_storage'], undefined, Faction.CITIZEN, 4);
  }
  const cacheDefs: readonly {
    name: string;
    kind: ContainerKind;
    access: ContainerAccess;
    capacitySlots: number;
    inventory: Item[];
    tags: string[];
    faction?: Faction;
    lockDifficulty?: number;
    discovered?: boolean;
  }[] = [
    {
      name: 'Серый тюк поставщика 88',
      kind: ContainerKind.SECRET_STASH,
      access: 'faction',
      capacitySlots: 6,
      inventory: [
        { defId: 'caravan_route', count: 1 },
        { defId: 'ration_registry_extract', count: 1 },
        { defId: 'govnyak_bad_batch', count: 1 },
      ],
      tags: ['market88', 'contraband_cache', 'supplier_betrayal', 'caravan', 'theft'],
      faction: Faction.WILD,
      lockDifficulty: 5,
    },
    {
      name: 'Сейф черного маршрута 88',
      kind: ContainerKind.SAFE,
      access: 'locked',
      capacitySlots: 7,
      inventory: [
        { defId: 'metro_ticket', count: 1 },
        { defId: 'forged_bank_debt_paper', count: 1 },
        { defId: 'container_key_label', count: 1 },
      ],
      tags: ['market88', 'black_route_papers', 'debt', 'documents', 'contraband_cache'],
      faction: Faction.WILD,
      lockDifficulty: 7,
    },
    {
      name: 'Шкаф панической медицины 88',
      kind: ContainerKind.MEDICAL_CABINET,
      access: 'faction',
      capacitySlots: 6,
      inventory: [
        { defId: 'antibiotic', count: 1 },
        { defId: 'pills', count: 2 },
        { defId: 'morphine_ampoule', count: 1 },
      ],
      tags: ['market88', 'medicine', 'scarcity', 'panic_buying', 'theft'],
      faction: Faction.CITIZEN,
      lockDifficulty: 4,
    },
    {
      name: 'Ящик рейдовой задвижки 88',
      kind: ContainerKind.TOOL_LOCKER,
      access: 'locked',
      capacitySlots: 6,
      inventory: [
        { defId: 'door_kit', count: 1 },
        { defId: 'gasmask_filter', count: 1 },
        { defId: 'fuse', count: 2 },
      ],
      tags: ['market88', 'raid_shutter', 'samosbor', 'service_guts'],
      faction: Faction.LIQUIDATOR,
      lockDifficulty: 6,
    },
  ];
  for (let i = 0; i < Math.min(cacheDefs.length, serviceGuts.length); i++) {
    const room = serviceGuts[i].room;
    const def = cacheDefs[i];
    addContainer(world, room, Math.max(2, room.w - 4), Math.max(2, Math.floor(room.h / 2)), def.kind, def.name, def.access, def.capacitySlots, def.inventory, def.tags, undefined, def.faction, def.lockDifficulty, def.discovered ?? true);
  }
}

export function seedBazaarExpansionCaches(world: World): void {
  const cacheDefs: readonly {
    roomDefId: string;
    name: string;
    kind: ContainerKind;
    access: ContainerAccess;
    inventory: Item[];
    tags: string[];
    owner: ZoneFaction;
    lockDifficulty?: number;
    discovered?: boolean;
  }[] = [
    {
      roomDefId: 'Склад честных талонов 88',
      name: 'Ящик гражданских талонов 88',
      kind: ContainerKind.METAL_CABINET,
      access: 'faction',
      inventory: [{ defId: 'water_coupon', count: 2 }, { defId: 'bread', count: 2 }, { defId: 'voluntary_receipt', count: 1 }],
      tags: ['market88', 'hq_support', 'citizen', 'ration'],
      owner: ZoneFaction.CITIZEN,
      lockDifficulty: 3,
    },
    {
      roomDefId: 'Оружейная рейдового досмотра 88',
      name: 'Шкаф рейдового досмотра 88',
      kind: ContainerKind.TOOL_LOCKER,
      access: 'faction',
      inventory: [{ defId: 'ammo_9mm', count: 12 }, { defId: 'door_kit', count: 1 }, { defId: 'liquidator_token', count: 1 }],
      tags: ['market88', 'hq_support', 'liquidator', 'raid'],
      owner: ZoneFaction.LIQUIDATOR,
      lockDifficulty: 5,
    },
    {
      roomDefId: 'Склад копченых расписок 88',
      name: 'Коптилка долговых расписок 88',
      kind: ContainerKind.SECRET_STASH,
      access: 'secret',
      inventory: [{ defId: 'voluntary_receipt', count: 2 }, { defId: 'cigs', count: 2 }, { defId: 'denunciation', count: 1 }],
      tags: ['market88', 'hq_support', 'cultist', 'debt'],
      owner: ZoneFaction.CULTIST,
      lockDifficulty: 4,
      discovered: false,
    },
    {
      roomDefId: 'Склад мерных фильтров 88',
      name: 'Холодный ящик мерных фильтров 88',
      kind: ContainerKind.MEDICAL_CABINET,
      access: 'faction',
      inventory: [{ defId: 'gasmask_filter', count: 1 }, { defId: 'antibiotic', count: 1 }, { defId: 'blank_form', count: 1 }],
      tags: ['market88', 'hq_support', 'scientist', 'measurement'],
      owner: ZoneFaction.SCIENTIST,
      lockDifficulty: 5,
    },
    {
      roomDefId: 'Склад грязной партии 88',
      name: 'Тюк грязной партии 88',
      kind: ContainerKind.SECRET_STASH,
      access: 'secret',
      inventory: [{ defId: 'stolen_filter_pack', count: 1 }, { defId: 'ammo_9mm', count: 8 }, { defId: 'metro_ticket', count: 1 }],
      tags: ['market88', 'hq_support', 'wild', 'contraband'],
      owner: ZoneFaction.WILD,
      lockDifficulty: 5,
      discovered: false,
    },
    {
      roomDefId: 'Южный архив без накладных 88',
      name: 'Архивный сейф без накладных 88',
      kind: ContainerKind.SAFE,
      access: 'locked',
      inventory: [{ defId: 'fake_pass', count: 1 }, { defId: 'caravan_route', count: 1 }, { defId: 'forged_bank_debt_paper', count: 1 }],
      tags: ['market88', 'mid_block', 'documents', 'contraband_cache'],
      owner: ZoneFaction.WILD,
      lockDifficulty: 7,
    },
  ];
  for (const def of cacheDefs) {
    const room = world.rooms.find(candidate => candidate.name === def.roomDefId);
    if (!room) continue;
    addContainer(
      world,
      room,
      Math.max(2, room.w - 4),
      Math.max(2, Math.floor(room.h / 2)),
      def.kind,
      def.name,
      def.access,
      6,
      def.inventory,
      def.tags,
      undefined,
      market88OwnerFaction(def.owner),
      def.lockDifficulty,
      def.discovered ?? true,
    );
  }
}

export function spawnMarketNpcs(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  rooms: MarketRooms,
): Record<string, Entity> {
  const npcs: Record<string, Entity> = {};
  npcs.market88_marta_broker = spawnNpc(world, entities, nextId, rooms.mainLane, 'market88_marta_broker', 10, 3, Math.PI / 2, true);
  npcs.market88_mikhail_debt = spawnNpc(world, entities, nextId, rooms.debtOffice, 'market88_mikhail_debt', 5, 5, Math.PI / 2, true);
  npcs.market88_zlata_silence = spawnNpc(world, entities, nextId, rooms.documentBooth, 'market88_zlata_silence', 5, 5, Math.PI, true);
  npcs.market88_zhoka_knife = spawnNpc(world, entities, nextId, rooms.weaponStall, 'market88_zhoka_knife', 6, 5, -Math.PI / 2, true, 'makarov');
  npcs.market88_uliana_cash = spawnNpc(world, entities, nextId, rooms.mainLane, 'market88_uliana_cash', 23, 12, -Math.PI / 2, false, undefined, {
    spriteScale: 0.72,
  });
  npcs.market88_courier_sasha = spawnNpc(world, entities, nextId, rooms.courierHideout, 'market88_courier_sasha', 5, 4, Math.PI, false);
  return npcs;
}

export function spawnNpc(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  room: Room,
  plotNpcId: string,
  dx: number,
  dy: number,
  angle: number,
  canGiveQuest: boolean,
  weapon?: string,
  extra?: Partial<Entity>,
): Entity {
  const x = world.wrap(room.x + dx);
  const y = world.wrap(room.y + dy);
  const entity = requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, x + 0.5, y + 0.5, {
    angle,
    weapon,
    canGiveQuest,
    aiTarget: { x: x + 0.5, y: y + 0.5 },
    extra,
  });
  return entity;
}

export function spawnMarketQueueCrowd(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  rooms: MarketRooms,
): void {
  const spots: readonly { name: string; faction: Faction; occupation: Occupation; x: number; y: number; item: string; weapon?: string }[] = [
    { name: 'Очередник с пустым талоном 88', faction: Faction.CITIZEN, occupation: Occupation.TRAVELER, x: rooms.publicGate.x + 2, y: rooms.publicGate.y + 2, item: 'water_coupon' },
    { name: 'Покупательница сухого пайка 88', faction: Faction.CITIZEN, occupation: Occupation.HOUSEWIFE, x: rooms.mainLane.x + 4, y: rooms.mainLane.y + 8, item: 'bread' },
    { name: 'Молчаливый должник 88', faction: Faction.CITIZEN, occupation: Occupation.SECRETARY, x: rooms.debtOffice.x + 2, y: rooms.debtOffice.y + 2, item: 'voluntary_receipt' },
    { name: 'Сторож оружейной очереди 88', faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, x: rooms.weaponStall.x + 2, y: rooms.weaponStall.y + 6, item: 'liquidator_token', weapon: 'makarov' },
    { name: 'Пациент у лекарственного долга 88', faction: Faction.CITIZEN, occupation: Occupation.TRAVELER, x: rooms.medicineLocker.x + 2, y: rooms.medicineLocker.y + 6, item: 'bandage' },
    { name: 'Слушательница бумажной будки 88', faction: Faction.WILD, occupation: Occupation.SECRETARY, x: rooms.documentBooth.x + 2, y: rooms.documentBooth.y + 6, item: 'blank_form' },
    { name: 'Человек у закрытого люка 88', faction: Faction.CITIZEN, occupation: Occupation.TRAVELER, x: rooms.serviceHatch.x + 3, y: rooms.serviceHatch.y + 2, item: 'metro_ticket' },
    { name: 'Курьер с чужим фильтром 88', faction: Faction.CITIZEN, occupation: Occupation.TRAVELER, x: rooms.courierHideout.x + 2, y: rooms.courierHideout.y + 2, item: 'gasmask_filter' },
    { name: 'Скупщик слуха 88', faction: Faction.WILD, occupation: Occupation.STOREKEEPER, x: rooms.mainLane.x + 9, y: rooms.mainLane.y + 13, item: 'cigs' },
    { name: 'Проверяющий рядов 88', faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, x: rooms.mainLane.x + 16, y: rooms.mainLane.y + 2, item: 'note', weapon: 'makarov' },
    { name: 'Женщина с пустой аптечкой 88', faction: Faction.CITIZEN, occupation: Occupation.DOCTOR, x: rooms.medicineLocker.x + 7, y: rooms.medicineLocker.y + 6, item: 'sanitary_kit' },
    { name: 'Держатель очереди 88', faction: Faction.CITIZEN, occupation: Occupation.STOREKEEPER, x: rooms.mainLane.x + 21, y: rooms.mainLane.y + 4, item: 'ration_registry_extract' },
    { name: 'Ночной свидетель 88', faction: Faction.CITIZEN, occupation: Occupation.TRAVELER, x: rooms.mainLane.x + 27, y: rooms.mainLane.y + 13, item: 'tea' },
    { name: 'Серый проводник 88', faction: Faction.WILD, occupation: Occupation.TRAVELER, x: rooms.serviceHatch.x + 8, y: rooms.serviceHatch.y + 4, item: 'door_kit' },
    { name: 'Патронный счетчик 88', faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, x: rooms.weaponStall.x + 10, y: rooms.weaponStall.y + 6, item: 'ammo_9mm', weapon: 'makarov' },
    { name: 'Последний у кассы 88', faction: Faction.CITIZEN, occupation: Occupation.TRAVELER, x: rooms.publicGate.x + 7, y: rooms.publicGate.y + 3, item: 'bread' },
  ];

  for (let i = 0; i < Math.min(MARKET88_QUEUE_CROWD_CAP, spots.length); i++) {
    const spot = spots[i];
    const x = world.wrap(spot.x);
    const y = world.wrap(spot.y);
    entities.push({
      id: nextId.v++,
      type: EntityType.NPC,
      x: x + 0.5,
      y: y + 0.5,
      angle: rng() * Math.PI * 2,
      pitch: 0,
      alive: true,
      speed: 0.72,
      sprite: spot.occupation,
      name: spot.name,
      needs: freshNeeds(),
      hp: spot.faction === Faction.LIQUIDATOR ? 120 : 80,
      maxHp: spot.faction === Faction.LIQUIDATOR ? 120 : 80,
      money: 4 + (i % 5) * 8,
      ai: { goal: AIGoal.IDLE, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
      inventory: [{ defId: spot.item, count: 1 }],
      weapon: spot.weapon,
      faction: spot.faction,
      occupation: spot.occupation,
      canGiveQuest: false,
      questId: -1,
    });
  }
}

export function seedMarketContainers(world: World, rooms: MarketRooms, npcs: Record<string, Entity>): void {
  addContainer(world, rooms.publicGate, 5, 3, ContainerKind.CASHBOX, 'Входная касса 88', 'owner', 5, [
    { defId: 'metro_ticket', count: 1 },
    { defId: 'water_coupon', count: 1 },
    { defId: 'voluntary_receipt', count: 1 },
  ], ['market88', 'entry_toll', 'crowd_pressure', 'debt'], npcs.market88_uliana_cash);

  addContainer(world, rooms.mainLane, 5, 12, ContainerKind.CASHBOX, 'Касса Ульяны 88', 'owner', 8, [
    { defId: 'water', count: 2 },
    { defId: 'bread', count: 2 },
    { defId: 'cigs', count: 4 },
    { defId: 'govnyak_roll', count: 2 },
    { defId: 'voluntary_receipt', count: 1 },
  ], ['market88', 'purchase', 'limited_stock', 'no_buyback'], npcs.market88_uliana_cash);

  addContainer(world, rooms.debtOffice, 9, 5, ContainerKind.SAFE, 'Сейф долговой тетради 88', 'locked', 6, [
    { defId: 'voluntary_receipt', count: 2 },
    { defId: 'denunciation', count: 1 },
    { defId: 'blank_form', count: 2 },
    { defId: 'govnyak_bad_batch', count: 1 },
  ], ['market88', 'debt', 'audit', 'raid_warning'], npcs.market88_mikhail_debt, Faction.CITIZEN, 4);

  addContainer(world, rooms.documentBooth, 8, 6, ContainerKind.FILING_CABINET, 'Папка чужих печатей 88', 'owner', 7, [
    { defId: 'fake_pass', count: 1 },
    { defId: 'blank_form', count: 2 },
    { defId: 'denunciation', count: 1 },
    { defId: 'note', count: 1, data: '88: документ открывает дверь один раз, потом открывает дело.' },
  ], ['market88', 'documents', 'contract', 'steal_stamp'], npcs.market88_zlata_silence);

  addContainer(world, rooms.weaponStall, 9, 5, ContainerKind.WEAPON_CRATE, 'Запертый оружейный ящик 88', 'faction', 6, [
    { defId: 'shock_baton', count: 1 },
    { defId: 'pushkin_shotgun', count: 1 },
    { defId: 'ammo_9mm', count: 18 },
    { defId: 'ammo_shells', count: 3 },
    { defId: 'liquidator_token', count: 1 },
  ], ['market88', 'weapons', 'control', 'ovb', 'raid_lock', 'theft'], npcs.market88_zhoka_knife, Faction.LIQUIDATOR, 3);

  addContainer(world, rooms.medicineLocker, 9, 5, ContainerKind.MEDICAL_CABINET, 'Лекарственный долг 88', 'owner', 6, [
    { defId: 'pills', count: 2 },
    { defId: 'antibiotic', count: 1 },
    { defId: 'morphine_ampoule', count: 1 },
    { defId: 'sanitary_kit', count: 1 },
  ], ['market88', 'medicine', 'scarcity', 'debt'], npcs.market88_marta_broker);

  addContainer(world, rooms.serviceHatch, 6, 3, ContainerKind.TOOL_LOCKER, 'Люк проводника 88', 'secret', 5, [
    { defId: 'gasmask_filter', count: 1 },
    { defId: 'metro_ticket', count: 1 },
    { defId: 'door_kit', count: 1 },
  ], ['market88', 'access', 'maintenance_hatch', 'secret'], undefined, undefined, 2, false);
}

export function addContainer(
  world: World,
  room: Room,
  dx: number,
  dy: number,
  kind: ContainerKind,
  name: string,
  access: ContainerAccess,
  capacitySlots: number,
  inventory: Item[],
  tags: string[],
  owner?: Entity,
  faction?: Faction,
  lockDifficulty?: number,
  discovered = true,
): void {
  const x = world.wrap(room.x + dx);
  const y = world.wrap(room.y + dy);
  const container: WorldContainer = {
    id: world.containers.length + 1,
    x,
    y,
    z: BLACK_MARKET_88_CONTAINER_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(i => ({ ...i })),
    capacitySlots,
    ownerNpcId: owner?.id,
    ownerName: owner?.name,
    faction: faction ?? owner?.faction,
    access,
    lockDifficulty,
    discovered,
    tags,
  };
  world.addContainer(container);
}

export function isBlackMarket88AmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    !entity.id &&
    !entity.persistentNpcId &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

export function blackMarket88TerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
  const cells = new Map<TerritoryOwner, number[]>([
    [ZoneFaction.CITIZEN, []],
    [ZoneFaction.LIQUIDATOR, []],
    [ZoneFaction.CULTIST, []],
    [ZoneFaction.SCIENTIST, []],
    [ZoneFaction.WILD, []],
  ]);
  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (cell !== Cell.FLOOR && cell !== Cell.WATER) continue;
    if (world.aptMask[i] || world.hermoWall[i] || world.containerMap.has(i) || world.features[i] === Feature.LIFT_BUTTON) continue;
    const owner = world.factionControl[i] as TerritoryOwner;
    const list = cells.get(owner);
    if (list) list.push(i);
  }
  return cells;
}

export function alignBlackMarket88AmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = blackMarket88TerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isBlackMarket88AmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 139 + offset * 487) % list.length];
    entity.x = (cell % W) + 0.5;
    entity.y = ((cell / W) | 0) + 0.5;
    entity.assignedRoomId = world.roomMap[cell] >= 0 ? world.roomMap[cell] : -1;
    if (entity.ai) {
      entity.ai.tx = cell % W;
      entity.ai.ty = (cell / W) | 0;
      entity.ai.path = [];
      entity.ai.pi = 0;
      entity.ai.stuck = 0;
    }
  }
}

