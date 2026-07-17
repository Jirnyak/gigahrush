import { rng } from '../../core/rand';
import { getPlotNpcNumericId } from '../../data/npc_packages';
import { AIGoal, ContainerKind, EntityType, Faction, Occupation, QuestType, RoomType, W, ZoneFaction, type ContainerAccess, type Entity, type Room, type WorldContainer } from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { NPC_VISUAL_FLOOR69_FEMALE } from '../../entities/npc_visuals';
import { Spr } from '../../render/sprite_index';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { shouldPromoteFloor69Worker, isFloor69Worker, promoteFloor69Worker, floor69ControlAt, Floor69Rooms } from './geometry';
import { HOME_FLOOR_KEY, FLOOR_69_CHECKPOINT_CROWD_CAP, IRA_WORKER_LINES, IRA_WORKER_POST_LINES, floor69EventTags, floor69RouteEventData, FLOOR_69_BASE_FLOOR } from './meta';
export function applyFloor69AmbientSpriteTemplates(entities: Entity[]): void {
  for (const entity of entities) {
    if (shouldPromoteFloor69Worker(entity)) promoteFloor69Worker(entity);
    else if (isFloor69Worker(entity)) promoteFloor69Worker(entity);
  }
}

export function applyFloor69OwnershipVisibilityHeatmap(world: World, writeCells = true): void {
  if (world.zones.length > 0) {
    for (const zone of world.zones) {
      const samples = [
        [zone.cx, zone.cy],
        [zone.cx + 31, zone.cy],
        [zone.cx - 31, zone.cy],
        [zone.cx, zone.cy + 31],
        [zone.cx, zone.cy - 31],
      ] as const;
      const counts = new Int16Array(6);
      let visibility = 0;
      let danger = 0;
      for (const [sx, sy] of samples) {
        const idx = world.idx(sx, sy);
        const roomId = world.roomMap[idx];
        const heat = floor69ControlAt(world, world.wrap(sx), world.wrap(sy), roomId >= 0 ? world.rooms[roomId] : undefined);
        counts[heat.faction]++;
        visibility += heat.visibility;
        danger = Math.max(danger, heat.danger);
      }
      let faction = ZoneFaction.CITIZEN;
      let best = counts[faction];
      if (writeCells) {
        for (const candidate of [ZoneFaction.LIQUIDATOR, ZoneFaction.CULTIST, ZoneFaction.WILD, ZoneFaction.SCIENTIST, ZoneFaction.SAMOSBOR] as const) {
          if (counts[candidate] > best) {
            best = counts[candidate];
            faction = candidate;
          }
        }
        zone.faction = faction;
      }
      zone.level = Math.max(zone.level, Math.min(5, 2 + danger + (visibility / samples.length > 0.82 ? 1 : 0)));
      zone.fogged = false;
    }
  }

  if (!writeCells) return;
  for (let i = 0; i < W * W; i++) {
    const roomId = world.roomMap[i];
    const heat = floor69ControlAt(world, i % W, (i / W) | 0, roomId >= 0 ? world.rooms[roomId] : undefined);
    world.factionControl[i] = heat.faction;
  }
}

/*
 * Adult-only constraint: Floor 69 is an optional 18+ route floor about adult
 * vice, social crime and harm reduction. It is not mandatory progression
 * content and should not be sanitized into generic residential material.
 * Do not add minors, child sprites, graphic sex text, or explicit mechanics here.
 */
export const NPC_DEFS: Record<string, PlotNpcDef> = {
  f69_madam_roza: {
    name: 'Роза Красная',
    isFemale: true,
    age: 42,
    sex: 'female',
    faction: Faction.CITIZEN,
    occupation: Occupation.DIRECTOR,
    sprite: Spr.F69_FEMALE_NPC_0,
    npcVisualId: NPC_VISUAL_FLOOR69_FEMALE,
    hp: 160, maxHp: 160, money: 340, speed: 0.75,
    inventory: [
      { defId: 'fake_pass', count: 1 },
      { defId: 'voluntary_receipt', count: 2 },
      { defId: 'cigs', count: 4 },
    ],
    talkLines: [
      'Этаж держится на взрослых сделках и закрытых дверях. Кто путает тишину с правом, быстро знакомится с долгом.',
      'Рейд приходит не за правдой. Он приходит за списком, который можно продать дважды.',
      'Если нашел чужой компромат, реши сразу: прятать, сдавать или считать прибыль.',
      'Комната стоит тихо, пока у нее есть ключ, строка и человек, который платит процент вовремя.',
      'Охрана не спасает. Охрана решает, кого не трогать первым.',
    ],
    talkLinesPost: [
      'Долги любят порядок. Люди порядок любят меньше.',
      'Тихая комната стоит дороже, когда сирена уже близко.',
      'Книга сегодня легче. Это не милость, это кто-то успел погасить строку.',
    ],
  },

  f69_guard_venya: {
    name: 'Веня Шлагбаум',
    isFemale: false,
    age: 34,
    sex: 'male',
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 240, maxHp: 240, money: 55, speed: 0.9,
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 12 },
      { defId: 'emergency_roster', count: 1 },
    ],
    talkLines: [
      'Пост простой: оружие видно, бумаги на стол, чужие двери не трогать.',
      'Я не добрый и не инспектор. Я считаю, кто успеет в тихие комнаты до рейда.',
      'Список рейда стоит дороже патрона, потому что стреляет до выстрела.',
      'Тарелка расписок у входа решает быстро: платишь бумагой, идешь через пост; крадешь ключ - идешь через глаза.',
      'В книге ты легче, чем в коридоре. В коридоре спорят, в книге платят.',
      'Ключ дам. Дверь потом сама спросит, кто тебя пустил.',
      'Рейд любит шумных. Тихие платят заранее.',
      'Черный вход не тайна. Тайна - кто записал тебя вошедшим.',
    ],
    talkLinesPost: [
      'Сегодня проход мягче. Не путай это с доверием.',
      'Если список пропал, значит кто-то уже выбрал сторону.',
      'Не вовремя здесь значит дороже. Больше в этой фразе угрозы нет.',
      'Свидетеля не прячут бесплатно. Бесплатно его потом находят другие.',
    ],
  },

  f69_performer_ira: {
    name: 'Ира Сцена',
    isFemale: true,
    age: 22,
    sex: 'female',
    faction: Faction.CITIZEN,
    occupation: Occupation.TRAVELER,
    sprite: Spr.F69_FEMALE_NPC_3,
    npcVisualId: NPC_VISUAL_FLOOR69_FEMALE,
    hp: 90, maxHp: 90, money: 28, speed: 1.0,
    inventory: [
      { defId: 'sealed_complaint', count: 1 },
      { defId: 'tea', count: 1 },
    ],
    talkLines: [...IRA_WORKER_LINES],
    talkLinesPost: [...IRA_WORKER_POST_LINES],
  },

  f69_doctor_sima: {
    name: 'Доктор Сима',
    isFemale: true,
    age: 29,
    sex: 'female',
    faction: Faction.SCIENTIST,
    occupation: Occupation.DOCTOR,
    sprite: Spr.F69_FEMALE_NPC_5,
    npcVisualId: NPC_VISUAL_FLOOR69_FEMALE,
    hp: 130, maxHp: 130, money: 85, speed: 0.8,
    inventory: [
      { defId: 'bandage', count: 4 },
      { defId: 'pills', count: 2 },
      { defId: 'clean_health_cert', count: 1 },
    ],
    talkLines: [
      'Клиника не спрашивает профессию. Клиника спрашивает пульс, воду и чем перевязать.',
      'Антибиотик закончился быстрее морали. Фильтры тоже уходят в долг.',
      'Кто прячется от рейда, сначала дышит. Потом уже объясняет.',
    ],
    talkLinesPost: [
      'Запасы пополнили. Теперь можно лечить, а не только выбирать очередь.',
      'Тихая комната открыта для взрослых, которым нужен врач, а не протокол.',
    ],
    talkQuestResponse: 'Передай Ире: тихая комната готова. Вход через служебный ход, без лишних имен.',
  },

  f69_accountant_nil: {
    name: 'Нил Расписочный',
    isFemale: false,
    age: 31,
    sex: 'male',
    faction: Faction.CITIZEN,
    occupation: Occupation.STOREKEEPER,
    sprite: Occupation.STOREKEEPER,
    hp: 105, maxHp: 105, money: 210, speed: 0.7,
    inventory: [
      { defId: 'blank_form', count: 2 },
      { defId: 'ink_bottle', count: 1 },
      { defId: 'official_permit_slip', count: 1 },
    ],
    talkLines: [
      'Долг без подписи - просьба. Долг с подписью - маршрут.',
      'Рынок 88 покупает не людей, а сроки. Это звучит приличнее только в книге учета.',
      'Черная строка в журнале лечится тремя способами: оплатить, подделать, сжечь.',
      'Процент не злой. Он просто просыпается раньше должника.',
      'Строку можно сжечь. Долг дымом не считается, но люди верят, пока темно.',
      'Расписку выкупают рублем, подделывают бланком, крадут ключом или продают тем, кто любит рейды.',
    ],
    talkLinesPost: [
      'Строка закрыта. Человек пока нет.',
      'Чем меньше листов в сейфе, тем тише этот этаж.',
      'В книге учета благодарность не пишут. Там видны только пустые клетки и сроки.',
    ],
  },

  f69_asya_pryanikova: {
    name: 'Ася Пряникова',
    isFemale: true,
    age: 35,
    sex: 'female',
    faction: Faction.CITIZEN,
    occupation: Occupation.PERFORMER,
    sprite: Occupation.PERFORMER,
    npcVisualId: NPC_VISUAL_FLOOR69_FEMALE,
    hp: 90, maxHp: 90, money: 12, speed: 0.8,
    inventory: [
      { defId: 'govnyak_roll', count: 2 },
      { defId: 'metal_water', count: 1 },
    ],
    talkLines: [
      'Я вещатель Инфосети. Транслирую эстетику распада и ужаса. Мои абоненты слушают голос из темноты.',
      'Здесь элита социального дна. У нас своя атмосфера безысходности, ты со своим узким кругозором не поймешь.',
      'Боря ковыряет терминал, ищет свободный канал связи. Моя кабельная макака с допуском.',
      'Знаешь, почему я пачкаюсь? По слизи хожу. Огромные слепые псы без привязи.',
      'Тот, кто завёл тварь с нижних ярусов, раскрыл перед собой чудесный мир говна. Оно теперь будет сопровождать вас всегда.',
    ],
    talkLinesPost: [
      'Говняк зашел отлично. Абоненты скинули талонов.',
      'Перфокарты судьбы говорят, что завтра мы опять будем курить.',
    ],
    talkQuestResponse: 'Принес? Давай сюда, а то меня уже ломает без вдохновения.',
  },

  f69_borya_pryanikov: {
    name: 'Боря Пряников',
    isFemale: false,
    age: 30,
    sex: 'male',
    faction: Faction.CITIZEN,
    occupation: Occupation.ENGINEER,
    sprite: Occupation.ENGINEER,
    hp: 110, maxHp: 110, money: 85, speed: 0.9,
    inventory: [
      { defId: 'govnyak_brick', count: 1 },
      { defId: 'siren_energy', count: 2 },
    ],
    talkLines: [
      'Я сетевой обходчик, ищу свободные кабеля. Можешь звать меня барыгой связи.',
      'Ася там опять про свою слизь в эфир вещает? Нормально, пусть абоненты талоны скидывают.',
      'Говняка бы сейчас с нижних гидропоник, а не вот это всё железное.',
    ],
    talkLinesPost: [
      'Канал открыт, говняк скурен. Жизнь удалась.',
    ],
  },

  f69_venya_pryanikov: {
    name: 'Веня Пряников',
    isFemale: false,
    age: 5,
    sex: 'male',
    faction: Faction.CITIZEN,
    occupation: Occupation.CHILD,
    sprite: Occupation.CHILD,
    hp: 40, maxHp: 40, money: 0, speed: 0.7,
    inventory: [
      { defId: 'tea', count: 1 },
    ],
    talkLines: [
      'Мама опять ругается в микрофон про слепых собак...',
      'Папа стучит по старой клавиатуре и пьет вонючую воду.',
    ],
    talkLinesPost: [
      'Хочу играть.',
    ],
  },
};

registerFloorSideQuest(HOME_FLOOR_KEY, 'f69_madam_roza', NPC_DEFS.f69_madam_roza, [
  {
    id: 'f69_blackmail_profit',
    giverId: getPlotNpcNumericId('f69_madam_roza')!,
    type: QuestType.FETCH,
    desc: 'Роза: «В сейфе лежит донос на чиновника. Принесешь мне - риск поста станет твоей премией, а не чужим поводком.»',
    targetItem: 'denunciation', targetCount: 1,
    rewardItem: 'fake_pass', rewardCount: 1,
    extraRewards: [{ defId: 'cigs', count: 3 }],
    relationDelta: -3, xpReward: 65, moneyReward: 190,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.OFFICE,
    targetZoneTag: 'blackmail',
    targetHint: 'Этаж 69: сейф компромата за постом. Риск: охрана и рейдовая строка. Награда: фальшивый пропуск, деньги или рычаг защиты.',
    eventTargetName: 'Донос из сейфа компромата 69',
    eventSeverity: 4,
    eventPrivacy: 'local',
    eventTags: floor69EventTags('blackmail', 'profit', 'evidence'),
    eventData: floor69RouteEventData('profit_blackmail', 'locked safe and guard checkpoint', 'fake pass, cash and leverage'),
  },
]);

registerFloorSideQuest(HOME_FLOOR_KEY, 'f69_guard_venya', NPC_DEFS.f69_guard_venya, [
  {
    id: 'f69_raid_choice',
    giverId: getPlotNpcNumericId('f69_guard_venya')!,
    type: QuestType.FETCH,
    desc: 'Веня: «В посту лежит список рейда. Заберешь его - предупредим тихие комнаты. Продашь или сдашь инспекторам - это уже твой риск и твоя награда.»',
    targetItem: 'emergency_roster', targetCount: 1,
    rewardItem: 'key', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 10 }],
    relationDelta: 8, xpReward: 60, moneyReward: 55,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.HQ,
    targetZoneTag: 'raid',
    targetHint: 'Этаж 69: ящик поста досмотра. Риск: ликвидаторы узнают, кто держал список. Награда: ключ и время для тихих комнат.',
    eventTargetName: 'Список рейда 69',
    eventSeverity: 4,
    eventPrivacy: 'local',
    eventTags: floor69EventTags('raid', 'security', 'refuge'),
    eventData: floor69RouteEventData('warn_or_sell_roster', 'liquidator audit and checkpoint violence', 'key, ammo and refuge warning'),
  },
  {
    id: 'f69_guard_key_deposit',
    giverId: getPlotNpcNumericId('f69_guard_venya')!,
    type: QuestType.FETCH,
    desc: 'Веня: «Нужен ключ из тарелки расписок. Вернешь на пост - черный вход откроется по делу, но долг запомнит руку.»',
    targetItem: 'key', targetCount: 1,
    rewardItem: 'ammo_9mm', rewardCount: 8,
    extraRewards: [{ defId: 'water_coupon', count: 1 }],
    relationDelta: 6, xpReward: 45, moneyReward: 45,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.HQ,
    targetZoneTag: 'toll',
    targetHint: 'Этаж 69: тарелка входных расписок у поста. Риск: кража у очереди. Награда: черный вход, патроны и водный талон.',
    eventTargetName: 'Ключ из тарелки расписок 69',
    eventSeverity: 3,
    eventPrivacy: 'local',
    eventTags: floor69EventTags('checkpoint', 'debt', 'access'),
    eventData: floor69RouteEventData('checkpoint_key', 'theft witness and checkpoint debt', 'service route access and supplies'),
  },
]);

registerFloorSideQuest(HOME_FLOOR_KEY, 'f69_performer_ira', NPC_DEFS.f69_performer_ira, [
  {
    id: 'f69_blackmail_protect',
    giverId: getPlotNpcNumericId('f69_performer_ira')!,
    type: QuestType.FETCH,
    desc: 'Ира: «Найди донос из сейфа и отдай мне. Риск - охрана и чиновник. Награда - одна дверь перестанет держать человека строкой.»',
    targetItem: 'denunciation', targetCount: 1,
    rewardItem: 'clean_health_cert', rewardCount: 1,
    extraRewards: [{ defId: 'bandage', count: 2 }],
    relationDelta: 16, xpReward: 75, moneyReward: 35,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.OFFICE,
    targetZoneTag: 'blackmail',
    targetHint: 'Этаж 69: сейф компромата в долговой конторе. Риск: охрана и чиновничий хвост. Награда: доверие Иры, справка и меньше власти у сейфа.',
    eventTargetName: 'Донос передан Ире',
    eventSeverity: 4,
    eventPrivacy: 'secret',
    eventTags: floor69EventTags('blackmail', 'protect', 'evidence'),
    eventData: floor69RouteEventData('protect_worker_from_blackmail', 'guard checkpoint and official retaliation', 'trust, clean health certificate and safer door'),
  },
  {
    id: 'f69_hide_worker',
    giverId: getPlotNpcNumericId('f69_performer_ira')!,
    type: QuestType.TALK,
    desc: 'Ира: «Договорись с доктором Симой о тихой комнате. Риск - рейдовый список. Награда - безопасный вход через служебный ход.»',
    targetNpcId: getPlotNpcNumericId('f69_doctor_sima')!,
    rewardItem: 'pills', rewardCount: 1,
    extraRewards: [{ defId: 'water', count: 1 }],
    relationDelta: 12, xpReward: 50, moneyReward: 40,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.MEDICAL,
    targetZoneTag: 'clinic',
    targetHint: 'Этаж 69: клиника Сима и тихая комната рядом. Риск: рейд придет по списку. Награда: убежище, таблетки и доверие.',
    eventTargetName: 'Тихая комната для Иры',
    eventSeverity: 4,
    eventPrivacy: 'secret',
    eventTags: floor69EventTags('refuge', 'protect', 'clinic'),
    eventData: floor69RouteEventData('secure_refuge_route', 'raid roster and witness exposure', 'clinic refuge and service access'),
  },
]);

registerFloorSideQuest(HOME_FLOOR_KEY, 'f69_doctor_sima', NPC_DEFS.f69_doctor_sima, [
  {
    id: 'f69_clinic_supply',
    giverId: getPlotNpcNumericId('f69_doctor_sima')!,
    type: QuestType.FETCH,
    desc: 'Доктор Сима: «Нужен антибиотик. Не спрашиваю, купишь, выкрадешь или выменяешь. Риск - дефицит, награда - дверь, где сначала лечат.»',
    targetItem: 'antibiotic', targetCount: 1,
    rewardItem: 'sanitary_kit', rewardCount: 1,
    extraRewards: [{ defId: 'gasmask_filter', count: 1 }],
    relationDelta: 14, xpReward: 70, moneyReward: 45,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.MEDICAL,
    targetZoneTag: 'clinic',
    targetHint: 'Этаж 69: тихая клиника Симы. Риск: лекарство считают долгом. Награда: санитарный набор, фильтр и медицинское доверие.',
    eventTargetName: 'Запас тихой клиники 69',
    eventSeverity: 3,
    eventPrivacy: 'local',
    eventTags: floor69EventTags('clinic', 'medicine', 'harm_reduction'),
    eventData: floor69RouteEventData('supply_clinic', 'medicine scarcity and debt pressure', 'sanitary kit, filter and clinic trust'),
  },
]);

registerFloorSideQuest(HOME_FLOOR_KEY, 'f69_accountant_nil', NPC_DEFS.f69_accountant_nil, [
  {
    id: 'f69_debt_ledger',
    giverId: getPlotNpcNumericId('f69_accountant_nil')!,
    type: QuestType.FETCH,
    desc: 'Нил: «Две добровольные расписки из долговой картотеки. Риск - книга заметит пустую клетку. Награда - строку можно оплатить, переписать или потерять.»',
    targetItem: 'voluntary_receipt', targetCount: 2,
    rewardItem: 'official_permit_slip', rewardCount: 1,
    extraRewards: [{ defId: 'blank_form', count: 1 }],
    relationDelta: 6, xpReward: 65, moneyReward: 80,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.OFFICE,
    targetZoneTag: 'ledger',
    targetHint: 'Этаж 69: картотека долгов. Риск: пустая строка зовет охрану. Награда: официальный корешок, бланк и снятый поводок.',
    eventTargetName: 'Расписки из картотеки 69',
    eventSeverity: 4,
    eventPrivacy: 'local',
    eventTags: floor69EventTags('debt', 'ledger', 'documents'),
    eventData: floor69RouteEventData('clear_or_forge_debt_line', 'locked ledger and witness debt', 'permit slip, blank form and cleared line'),
  },
  {
    id: 'f69_debt_forgery_kit',
    giverId: getPlotNpcNumericId('f69_accountant_nil')!,
    type: QuestType.FETCH,
    desc: 'Нил: «Принеси пустой бланк и чернила. Риск - подделка держится до первой проверки. Награда - одна строка станет похожей на погашенную.»',
    targetItem: 'blank_form', targetCount: 1,
    rewardItem: 'voluntary_receipt', rewardCount: 1,
    extraRewards: [{ defId: 'fake_pass', count: 1 }],
    relationDelta: 3, xpReward: 55, moneyReward: 70,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.OFFICE,
    targetZoneTag: 'ledger',
    targetHint: 'Этаж 69: картотека и стол Нила. Риск: проверка бумаги у поста. Награда: расписка, фальшивый пропуск и проход через долг.',
    eventTargetName: 'Поддельная строка долга 69',
    eventSeverity: 3,
    eventPrivacy: 'secret',
    eventTags: floor69EventTags('debt', 'forgery', 'access'),
    eventData: floor69RouteEventData('forge_debt_line', 'paper audit and checkpoint suspicion', 'receipt, fake pass and debt access'),
  },
  {
    id: 'f69_blackmail_expose',
    giverId: getPlotNpcNumericId('f69_accountant_nil')!,
    type: QuestType.FETCH,
    desc: 'Нил: «Принеси акт о пропавшей записи. Риск - наверху спросят свидетеля. Награда - компромат перестанет быть товаром.»',
    targetItem: 'record_exposure_notice', targetCount: 1,
    rewardItem: 'blank_form', rewardCount: 2,
    extraRewards: [{ defId: 'ink_bottle', count: 1 }],
    relationDelta: 4, xpReward: 70, moneyReward: 60,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.OFFICE,
    targetZoneTag: 'evidence',
    targetHint: 'Этаж 69: сейф компромата. Риск: акт потянет свидетелей наверх. Награда: бланки, чернила и меньше шантажа у охраны.',
    eventTargetName: 'Акт о пропавшей записи 69',
    eventSeverity: 4,
    eventPrivacy: 'local',
    eventTags: floor69EventTags('blackmail', 'expose', 'documents'),
    eventData: floor69RouteEventData('expose_blackmail_record', 'official witness audit', 'blank forms, ink and weaker blackmail'),
  },
]);

registerFloorSideQuest(HOME_FLOOR_KEY, 'f69_asya_pryanikova', NPC_DEFS.f69_asya_pryanikova, [
  {
    id: 'f69_asya_weed',
    giverId: getPlotNpcNumericId('f69_asya_pryanikova')!,
    type: QuestType.FETCH,
    desc: 'Ася: «Мои абоненты скидывают талоны медленно, а вещать в Инфосеть без говняка я не могу. Принеси 10 самокруток, а то у меня творческий кризис. И без подстав, я раскидываю перфокарты судьбы и всё вижу.»',
    targetItem: 'govnyak_roll', targetCount: 10,
    rewardItem: 'pills', rewardCount: 2,
    extraRewards: [{ defId: 'tea', count: 3 }],
    relationDelta: 10, xpReward: 80, moneyReward: 50,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.SMOKING,
    targetZoneTag: 'weed',
    targetHint: 'Этаж 69: маргинальная квартира Аси. Риск: послушать лекцию про искусство распада. Награда: таблетки и спокойный эфир.',
    eventTargetName: 'Говняк для Аси',
    eventSeverity: 2,
    eventPrivacy: 'local',
    eventTags: floor69EventTags('weed', 'art', 'broadcast'),
    eventData: floor69RouteEventData('supply_asya_weed', 'art criticism', 'pills and broadcaster gratitude'),
  },
]);

registerFloorSideQuest(HOME_FLOOR_KEY, 'f69_borya_pryanikov', NPC_DEFS.f69_borya_pryanikov, [
  {
    id: 'f69_borya_camera',
    giverId: getPlotNpcNumericId('f69_borya_pryanikov')!,
    type: QuestType.FETCH,
    desc: 'Боря: «Слышь, мне тут шепнули, что в Инфосети можно задвинуть пару пленок. Найди фотик, а я отсыплю талонов. Только не тащи мусор, мне нужны хорошие кадры.»',
    targetItem: 'camera', targetCount: 1,
    rewardItem: 'cigs', rewardCount: 5,
    extraRewards: [],
    relationDelta: 15, xpReward: 100, moneyReward: 80,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.OFFICE,
    targetZoneTag: 'contraband',
    targetHint: 'Этаж 69: Боря ищет фотик для пленок.',
    eventTargetName: 'Фотик для Бори',
    eventSeverity: 1,
    eventPrivacy: 'local',
    eventTags: floor69EventTags('camera', 'contraband'),
    eventData: floor69RouteEventData('supply_borya_camera', 'photo job', 'cigarettes'),
  },
]);

registerFloorSideQuest(HOME_FLOOR_KEY, 'f69_venya_pryanikov', NPC_DEFS.f69_venya_pryanikov, [
  {
    id: 'f69_venya_knuckles',
    giverId: getPlotNpcNumericId('f69_venya_pryanikov')!,
    type: QuestType.FETCH,
    desc: 'Веня: «Братуха, накинь кастет, а то тут такие фраера пошли, что кулаки уже сбиты. Я тебе отсыплю мазей, чтоб шрамы не ныли.»',
    targetItem: 'brass_knuckles', targetCount: 1,
    rewardItem: 'antifungal_ointment', rewardCount: 3,
    extraRewards: [],
    relationDelta: 10, xpReward: 90, moneyReward: 60,
    targetFloorZ: FLOOR_69_BASE_FLOOR,
    targetRoomType: RoomType.LIVING,
    targetZoneTag: 'weapon',
    targetHint: 'Этаж 69: Веня просит кастет для разборок.',
    eventTargetName: 'Кастет для Вени',
    eventSeverity: 3,
    eventPrivacy: 'local',
    eventTags: floor69EventTags('weapon', 'fight'),
    eventData: floor69RouteEventData('supply_venya_knuckles', 'brawl prep', 'ointment'),
  },
]);
export function addItemDrop(entities: Entity[], nextId: { v: number }, x: number, y: number, defId: string, count = 1): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count }],
  });
}

export function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id)) id++;
  return id;
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
  inventory: WorldContainer['inventory'],
  tags: string[],
  faction?: Faction,
  lockDifficulty?: number,
): void {
  const x = world.wrap(room.x + dx);
  const y = world.wrap(room.y + dy);
  world.addContainer({
    id: nextContainerId(world),
    x,
    y,
    z: FLOOR_69_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots,
    faction,
    access,
    lockDifficulty,
    discovered: true,
    tags: ['floor_69', ...tags],
  });
}

export function seedContainers(world: World, rooms: Floor69Rooms): void {
  addContainer(
    world, rooms.clinic, 3, 2, ContainerKind.MEDICAL_CABINET, 'Шкаф тихой клиники 69',
    'owner', 8,
    [
      { defId: 'bandage', count: 3 },
      { defId: 'pills', count: 2 },
      { defId: 'antibiotic', count: 1 },
      { defId: 'gasmask_filter', count: 1 },
      { defId: 'clean_health_cert', count: 1 },
    ],
    ['clinic', 'medicine', 'harm_reduction'],
    Faction.SCIENTIST,
  );
  addContainer(
    world, rooms.debtOffice, 4, 3, ContainerKind.SAFE, 'Сейф компромата 69',
    'locked', 7,
    [
      { defId: 'denunciation', count: 1 },
      { defId: 'record_exposure_notice', count: 1 },
      { defId: 'personal_file_copy', count: 1 },
      { defId: 'sealed_complaint', count: 1 },
    ],
    ['blackmail', 'evidence', 'official'],
    Faction.CITIZEN,
    4,
  );
  addContainer(
    world, rooms.ledger, 3, 2, ContainerKind.FILING_CABINET, 'Картотека долгов 69',
    'locked', 8,
    [
      { defId: 'voluntary_receipt', count: 3 },
      { defId: 'blank_form', count: 2 },
      { defId: 'ink_bottle', count: 1 },
      { defId: 'fake_pass', count: 1 },
    ],
    ['debt', 'ledger', 'market_88'],
    Faction.CITIZEN,
    3,
  );
  addContainer(
    world, rooms.checkpoint, 9, 2, ContainerKind.WEAPON_CRATE, 'Ящик поста 69',
    'faction', 6,
    [
      { defId: 'emergency_roster', count: 1 },
      { defId: 'liquidator_token', count: 1 },
      { defId: 'ammo_9mm', count: 12 },
      { defId: 'key', count: 1 },
    ],
    ['raid', 'security', 'choice'],
    Faction.LIQUIDATOR,
  );
  addContainer(
    world, rooms.checkpoint, 3, 7, ContainerKind.CASHBOX, 'Тарелка входных расписок 69',
    'faction', 5,
    [
      { defId: 'voluntary_receipt', count: 2 },
      { defId: 'water_coupon', count: 1 },
      { defId: 'key', count: 1 },
    ],
    ['toll', 'checkpoint', 'debt', 'crowd_pressure'],
    Faction.LIQUIDATOR,
  );
  addContainer(
    world, rooms.refuge, 2, 2, ContainerKind.EMERGENCY_BOX, 'Ящик тихой комнаты 69',
    'public', 6,
    [
      { defId: 'water', count: 2 },
      { defId: 'bread', count: 2 },
      { defId: 'bandage', count: 1 },
      { defId: 'emergency_roster', count: 1 },
    ],
    ['refuge', 'samosbor', 'aid'],
    Faction.CITIZEN,
  );
  // --- НОВЫЙ ГЕЙМПЛЕЙНЫЙ КОНТЕНТ: Теневой Аукцион Расписок ---
  addContainer(
    world, rooms.ledger, 5, 5, ContainerKind.SAFE, 'Бронированный Сейф Теневого Аукциона 69',
    'locked', 8,
    [
      { defId: 'fake_pass', count: 1 },
      { defId: 'voluntary_receipt', count: 4 },
      { defId: 'clean_health_cert', count: 1 },
      { defId: 'antibiotic', count: 1 },
    ],
    ['shadow_auction', 'debt', 'blackmail_elite'],
    Faction.CITIZEN,
    5,
  );
  addContainer(
    world, rooms.refuge, 5, 2, ContainerKind.WEAPON_CRATE, 'Контрабандный Схрон Осведомителя',
    'faction', 6,
    [
      { defId: 'ammo_9mm', count: 16 },
      { defId: 'liquidator_token', count: 2 },
      { defId: 'sealed_complaint', count: 1 },
      { defId: 'blank_form', count: 2 },
    ],
    ['smuggling', 'informant', 'raid_surplus'],
    Faction.LIQUIDATOR,
  );
}

export function spawnNpc(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,
  x: number,
  y: number,
  angle: number,
  weapon?: string,
): void {
  const px = world.wrap(x) + 0.5;
  const py = world.wrap(y) + 0.5;
  requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, px, py, {
    angle,
    weapon,
    canGiveQuest: true,
    aiTarget: { x: x + 0.5, y: y + 0.5 },
  });
}

export function spawnAmbientAdult(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  name: string,
  isFemale: boolean,
  occupation: Occupation,
  faction: Faction,
  x: number,
  y: number,
  inventory: Entity['inventory'],
  weapon?: string,
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: world.wrap(x) + 0.5,
    y: world.wrap(y) + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: 0.8,
    sprite: occupation,
    name,
    isFemale,
    needs: freshNeeds(),
    hp: 85,
    maxHp: 85,
    money: 20,
    ai: { goal: AIGoal.IDLE, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: inventory?.map(item => ({ ...item })) ?? [{ defId: 'note', count: 1 }],
    weapon,
    faction,
    occupation,
    canGiveQuest: false,
    questId: -1,
  });
}

export function spawnFloor69Npcs(world: World, entities: Entity[], nextId: { v: number }, rooms: Floor69Rooms): void {
  spawnNpc(world, entities, nextId, 'f69_madam_roza', rooms.hall.x + 13, rooms.hall.y + 5, Math.PI / 2);
  spawnNpc(world, entities, nextId, 'f69_guard_venya', rooms.checkpoint.x + 7, rooms.checkpoint.y + 5, Math.PI, 'makarov');
  spawnNpc(world, entities, nextId, 'f69_performer_ira', rooms.refuge.x + 4, rooms.refuge.y + 5, 0);
  spawnNpc(world, entities, nextId, 'f69_doctor_sima', rooms.clinic.x + 8, rooms.clinic.y + 5, Math.PI / 2);
  spawnNpc(world, entities, nextId, 'f69_accountant_nil', rooms.debtOffice.x + 10, rooms.debtOffice.y + 6, Math.PI);

  spawnNpc(world, entities, nextId, 'f69_asya_pryanikova', rooms.publicCorridor.x + 15, rooms.publicCorridor.y + 3, Math.PI / 2);
  spawnNpc(world, entities, nextId, 'f69_borya_pryanikov', rooms.publicCorridor.x + 16, rooms.publicCorridor.y + 3, Math.PI / 2);
  spawnNpc(world, entities, nextId, 'f69_venya_pryanikov', rooms.publicCorridor.x + 17, rooms.publicCorridor.y + 4, 0);

  spawnAmbientAdult(world, entities, nextId, 'Раиса Гардеробная', true, Occupation.SECRETARY, Faction.CITIZEN, rooms.staffRoute.x + 2, rooms.staffRoute.y + 12, [
    { defId: 'cloth_roll', count: 1 },
    { defId: 'sealed_complaint', count: 1 },
  ]);
  spawnAmbientAdult(world, entities, nextId, 'Павел Тихий', false, Occupation.TRAVELER, Faction.CITIZEN, rooms.publicCorridor.x + 35, rooms.publicCorridor.y + 3, [
    { defId: 'water', count: 1 },
    { defId: 'voluntary_receipt', count: 1 },
  ]);
  // --- НОВЫЙ ГЕЙМПЛЕЙНЫЙ КОНТЕНТ: Участники Теневого Аукциона ---
  spawnAmbientAdult(world, entities, nextId, 'Игнат Вексельный', false, Occupation.STOREKEEPER, Faction.CITIZEN, rooms.ledger.x + 12, rooms.ledger.y + 4, [
    { defId: 'record_exposure_notice', count: 1 },
    { defId: 'voluntary_receipt', count: 2 },
  ]);
  spawnAmbientAdult(world, entities, nextId, 'Варвара Штамповочная', true, Occupation.SECRETARY, Faction.CITIZEN, rooms.debtOffice.x + 4, rooms.debtOffice.y + 10, [
    { defId: 'fake_pass', count: 1 },
    { defId: 'blank_form', count: 3 },
  ]);
  spawnAmbientAdult(world, entities, nextId, 'Клим Бесшумный', false, Occupation.HUNTER, Faction.LIQUIDATOR, rooms.refuge.x + 8, rooms.refuge.y + 12, [
    { defId: 'emergency_roster', count: 1 },
    { defId: 'liquidator_token', count: 1 },
  ], 'makarov');

  spawnCheckpointCrowd(world, entities, nextId, rooms);
}

export function spawnCheckpointCrowd(world: World, entities: Entity[], nextId: { v: number }, rooms: Floor69Rooms): void {
  const spots: readonly { name: string; isFemale: boolean; occupation: Occupation; faction: Faction; x: number; y: number; item: string; weapon?: string }[] = [
    { name: 'Гость у тарелки расписок', isFemale: false, occupation: Occupation.TRAVELER, faction: Faction.CITIZEN, x: rooms.publicCorridor.x + 14, y: rooms.publicCorridor.y + 2, item: 'voluntary_receipt' },
    { name: 'Посетительница с талоном', isFemale: true, occupation: Occupation.SECRETARY, faction: Faction.CITIZEN, x: rooms.publicCorridor.x + 18, y: rooms.publicCorridor.y + 2, item: 'water_coupon' },
    { name: 'Смотрящий за очередью 69', isFemale: false, occupation: Occupation.HUNTER, faction: Faction.LIQUIDATOR, x: rooms.checkpoint.x + 3, y: rooms.checkpoint.y + 7, item: 'liquidator_token', weapon: 'makarov' },
    { name: 'Соседка тихого входа', isFemale: true, occupation: Occupation.HOUSEWIFE, faction: Faction.CITIZEN, x: rooms.refuge.x + 2, y: rooms.refuge.y - 2, item: 'bread' },
    { name: 'Курьер без афиши', isFemale: false, occupation: Occupation.TRAVELER, faction: Faction.CITIZEN, x: rooms.staffRoute.x - 2, y: rooms.staffRoute.y + 7, item: 'metro_ticket' },
    { name: 'Дежурная клиники 69', isFemale: true, occupation: Occupation.DOCTOR, faction: Faction.SCIENTIST, x: rooms.clinic.x + 2, y: rooms.clinic.y + rooms.clinic.h + 2, item: 'bandage' },
    { name: 'Бухгалтерская очередь', isFemale: true, occupation: Occupation.SECRETARY, faction: Faction.CITIZEN, x: rooms.debtOffice.x + 2, y: rooms.debtOffice.y - 2, item: 'blank_form' },
    { name: 'Молчаливый должник', isFemale: false, occupation: Occupation.TRAVELER, faction: Faction.CITIZEN, x: rooms.ledger.x + 8, y: rooms.ledger.y - 2, item: 'voluntary_receipt' },
    { name: 'Старшая по лампам', isFemale: true, occupation: Occupation.STOREKEEPER, faction: Faction.CITIZEN, x: rooms.hall.x + 3, y: rooms.hall.y + 3, item: 'tea' },
    { name: 'Проверяющий без протокола', isFemale: false, occupation: Occupation.HUNTER, faction: Faction.LIQUIDATOR, x: rooms.publicCorridor.x + 24, y: rooms.publicCorridor.y + 2, item: 'note', weapon: 'makarov' },
    { name: 'Свидетель у красной стены', isFemale: false, occupation: Occupation.TRAVELER, faction: Faction.CITIZEN, x: rooms.publicCorridor.x + 30, y: rooms.publicCorridor.y + 2, item: 'cigs' },
    { name: 'Женщина с чистой справкой', isFemale: true, occupation: Occupation.TRAVELER, faction: Faction.CITIZEN, x: rooms.clinic.x + 12, y: rooms.clinic.y + rooms.clinic.h + 2, item: 'clean_health_cert' },
  ];
  for (let i = 0; i < Math.min(FLOOR_69_CHECKPOINT_CROWD_CAP, spots.length); i++) {
    const spot = spots[i];
    spawnAmbientAdult(
      world,
      entities,
      nextId,
      spot.name,
      spot.isFemale,
      spot.occupation,
      spot.faction,
      spot.x,
      spot.y,
      [{ defId: spot.item, count: 1 }],
      spot.weapon,
    );
  }
}

export function seedLooseItems(entities: Entity[], nextId: { v: number }, rooms: Floor69Rooms): void {
  addItemDrop(entities, nextId, rooms.publicCorridor.x + 9, rooms.publicCorridor.y + 2, 'cigs', 1);
  addItemDrop(entities, nextId, rooms.hall.x + 5, rooms.hall.y + 12, 'tea', 1);
  addItemDrop(entities, nextId, rooms.clinic.x + 12, rooms.clinic.y + 8, 'bandage', 1);
  addItemDrop(entities, nextId, rooms.staffLift.x + 3, rooms.staffLift.y + 5, 'metro_ticket', 1);
  // --- НОВЫЙ ГЕЙМПЛЕЙНЫЙ КОНТЕНТ: Теневой лут ---
  addItemDrop(entities, nextId, rooms.ledger.x + 14, rooms.ledger.y + 8, 'voluntary_receipt', 1);
  addItemDrop(entities, nextId, rooms.debtOffice.x + 6, rooms.debtOffice.y + 14, 'sealed_complaint', 1);
  addItemDrop(entities, nextId, rooms.refuge.x + 10, rooms.refuge.y + 14, 'fake_pass', 1);
  addItemDrop(entities, nextId, rooms.clinic.x + 14, rooms.clinic.y + 12, 'antibiotic', 1);
}

