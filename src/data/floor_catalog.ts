import { } from '../core/types';

export type FloorCatalogRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type FloorContentStatus = 'catalog_only' | 'design_doc' | 'needs_generator';

export interface FloorCatalogDef {
  readonly id: string;
  readonly displayName: string;
  readonly themeTags: readonly string[];
  readonly tags: ReadonlySet<string>;
  readonly rarity: FloorCatalogRarity;
  readonly minDepth: number;
  readonly unlockHint: string;
  readonly contentStatus: FloorContentStatus;
}

export const FLOOR_CATALOG: readonly FloorCatalogDef[] = [
  {
    id: 'pocket_404_lift_loop',
    displayName: 'Лифтовая петля 404',
    // @ts-ignore
    baseFloor: 140,
    tags: new Set(['numbered', 'elevator', 'map_lie', 'lost_property']),
    rarity: 'rare',
    minDepth: 2,
    unlockHint: 'Лифт приезжает не туда, карта врёт, потерянные вещи можно вернуть один раз.',
    contentStatus: 'design_doc',
  },
  {
    id: 'pocket_556_pressure_queue',
    displayName: 'П-46/556: очередь давления',
    // @ts-ignore
    baseFloor: 30,
    tags: new Set(['numbered', 'documents', 'queue', 'pressure']),
    rarity: 'rare',
    minDepth: 3,
    unlockHint: 'Давление в трубах меняет номер талона и открывает чужой кабинет.',
    contentStatus: 'needs_generator',
  },
  {
    id: 'pocket_666_red_service',
    displayName: 'Красная служба 666',
    // @ts-ignore
    baseFloor: 180,
    tags: new Set(['numbered', 'cult', 'combat', 'samosbor']),
    rarity: 'legendary',
    minDepth: 4,
    unlockHint: 'Служебный коридор Мясного низа требует плату у порога или бой с усиленным самосбором.',
    contentStatus: 'needs_generator',
  },
  {
    id: 'pocket_777_lucky_landing',
    displayName: 'Счастливая высадка 777',
    // @ts-ignore
    baseFloor: 60,
    tags: new Set(['numbered', 'luck', 'containers', 'trap']),
    rarity: 'rare',
    minDepth: 2,
    unlockHint: 'Контейнеры богаты, но каждый удачный вскрытый шкаф закрывает выход.',
    contentStatus: 'needs_generator',
  },
  {
    id: 'pocket_1337_radio_data',
    displayName: 'Радио DATA 1337',
    // @ts-ignore
    baseFloor: 100,
    tags: new Set(['numbered', 'radio', 'data', 'psi']),
    rarity: 'legendary',
    minDepth: 4,
    unlockHint: 'Шум радиокружка превращается в ПСИ-сигнал с выбором: записать, продать или заглушить.',
    contentStatus: 'needs_generator',
  },
  {
    id: 'pocket_088_black_market',
    displayName: 'Черный рынок 88',
    // @ts-ignore
    baseFloor: 60,
    tags: new Set(['market', 'economy', 'debt', 'stealth']),
    rarity: 'uncommon',
    minDepth: 1,
    unlockHint: 'Торговый карман даёт долги и контрабанду, но крупная сделка может привести облаву.',
    contentStatus: 'design_doc',
  },
  {
    id: 'pocket_school_obzh',
    displayName: 'Школа ОБЖ имени гермодвери',
    // @ts-ignore
    baseFloor: 60,
    tags: new Set(['school', 'escort', 'evacuation', 'perk']),
    rarity: 'uncommon',
    minDepth: 1,
    unlockHint: 'Группа учеников должна дойти до гермодвери, а награда зависит от потерь.',
    contentStatus: 'design_doc',
  },
  {
    id: 'pocket_hospital_quarantine',
    displayName: 'Больничный блок карантина',
    // @ts-ignore
    baseFloor: 100,
    tags: new Set(['hospital', 'medicine', 'quarantine', 'documents']),
    rarity: 'uncommon',
    minDepth: 1,
    unlockHint: 'Медкарта открывает лечение, но карантин может запереть пациента и игрока.',
    contentStatus: 'design_doc',
  },
  {
    id: 'pocket_raionsovet_archive',
    displayName: 'Райсовет и Живой архив',
    // @ts-ignore
    baseFloor: 30,
    tags: new Set(['archive', 'documents', 'memory', 'access']),
    rarity: 'uncommon',
    minDepth: 1,
    unlockHint: 'Архивные карточки меняют доступ, слухи и доверие к игроку.',
    contentStatus: 'design_doc',
  },
  {
    id: 'pocket_concentrate_industry',
    displayName: 'Промзона концентрата',
    // @ts-ignore
    baseFloor: 140,
    tags: new Set(['industry', 'production', 'defect', 'resource']),
    rarity: 'uncommon',
    minDepth: 2,
    unlockHint: 'Линия выпускает полезный концентрат или брак в зависимости от ремонта.',
    contentStatus: 'design_doc',
  },
  {
    id: 'pocket_service_roof',
    displayName: 'Служебная крыша',
    // @ts-ignore
    baseFloor: 100,
    tags: new Set(['roof', 'signal', 'weather_fake', 'sniper']),
    rarity: 'rare',
    minDepth: 2,
    unlockHint: 'Открытый верх даёт радиосигнал и обзор, но делает игрока видимым.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_gulagium_shift',
    displayName: 'Гулагий: сменный барак',
    // @ts-ignore
    baseFloor: 60,
    tags: new Set(['labor', 'schedule', 'punishment', 'faction']),
    rarity: 'rare',
    minDepth: 3,
    unlockHint: 'Рабочая смена выдаёт пайки за труд или штрафы за побег.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_mushroom_cellar',
    displayName: 'Грибная смена',
    // @ts-ignore
    baseFloor: 100,
    tags: new Set(['mushroom', 'food', 'mold', 'production']),
    rarity: 'common',
    minDepth: 0,
    unlockHint: 'Грядка требует воды и субстрата, затем кормит или заражает кладовку.',
    contentStatus: 'design_doc',
  },
  {
    id: 'pocket_metro_wrong_station',
    displayName: 'Станция ошибочной линии',
    // @ts-ignore
    baseFloor: 140,
    tags: new Set(['metro', 'route', 'wrong_exit', 'travel']),
    rarity: 'rare',
    minDepth: 2,
    unlockHint: 'Маршрут обещает короткий путь, но может высадить в безопасный или плохой карман.',
    contentStatus: 'design_doc',
  },
  {
    id: 'pocket_heatline_zero',
    displayName: 'Теплотрасса Ноль',
    // @ts-ignore
    baseFloor: 140,
    tags: new Set(['heat', 'valve', 'steam', 'repair']),
    rarity: 'common',
    minDepth: 1,
    unlockHint: 'Вентили открывают проходы, охлаждают зоны или выпускают опасный пар.',
    contentStatus: 'design_doc',
  },
  {
    id: 'pocket_void_afterprotocol',
    displayName: 'Пустотный протокол',
    // @ts-ignore
    baseFloor: 200,
    tags: new Set(['void', 'protocol', 'backlash', 'late_game']),
    rarity: 'legendary',
    minDepth: 5,
    unlockHint: 'Поздний протокол меняет правило комнаты и оставляет штраф после выхода.',
    contentStatus: 'design_doc',
  },
  {
    id: 'pocket_courtyard_well',
    displayName: 'Внутренний двор-колодец',
    // @ts-ignore
    baseFloor: 100,
    tags: new Set(['courtyard', 'vertical', 'falling_debris', 'scout']),
    rarity: 'uncommon',
    minDepth: 1,
    unlockHint: 'Двор даёт редкий обзор и шум сверху, но обломки падают по слышимому ритму.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_laundry_flood',
    displayName: 'Прачечная с обратной водой',
    // @ts-ignore
    baseFloor: 60,
    tags: new Set(['laundry', 'water', 'contamination', 'noise']),
    rarity: 'common',
    minDepth: 0,
    unlockHint: 'Стирка очищает одежду и бинты, но шум привлекает соседей и тварей.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_black_staircase',
    displayName: 'Черная лестница',
    // @ts-ignore
    baseFloor: 100,
    tags: new Set(['staircase', 'stealth', 'shortcut', 'locked_doors']),
    rarity: 'uncommon',
    minDepth: 1,
    unlockHint: 'Тихий обход между зонами работает, пока игрок не включает свет.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_kindergarten_nap',
    displayName: 'Детсад тихого часа',
    // @ts-ignore
    baseFloor: 60,
    tags: new Set(['children', 'quiet', 'escort', 'supplies']),
    rarity: 'uncommon',
    minDepth: 1,
    unlockHint: 'Игрок выбирает: красть припасы тихо или будить группу для эвакуации.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_morgue_registry',
    displayName: 'Морг регистраций',
    // @ts-ignore
    baseFloor: 30,
    tags: new Set(['morgue', 'identity', 'records', 'corpse']),
    rarity: 'rare',
    minDepth: 2,
    unlockHint: 'Бирки тел можно подделать, чтобы сменить доступ или вызвать родственников.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_print_tunnel',
    displayName: 'Печатный тоннель',
    // @ts-ignore
    baseFloor: 30,
    tags: new Set(['printing', 'counterfeit', 'documents', 'heat']),
    rarity: 'uncommon',
    minDepth: 1,
    unlockHint: 'Станок печатает пропуска, пока перегрев не портит бумагу и не зовёт охрану.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_chapel_switchboard',
    displayName: 'Часовня коммутатора',
    // @ts-ignore
    baseFloor: 180,
    tags: new Set(['chapel', 'signal', 'cult', 'reroute']),
    rarity: 'rare',
    minDepth: 3,
    unlockHint: 'Молитва или взлом коммутатора меняет, куда отвечает лифт.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_elevator_machine_room',
    displayName: 'Машинное отделение лифта',
    // @ts-ignore
    baseFloor: 140,
    tags: new Set(['elevator', 'repair', 'access', 'noise']),
    rarity: 'common',
    minDepth: 1,
    unlockHint: 'Ремонт открывает маршрут, но шум машины запускает ограниченное нападение.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_lost_property_depot',
    displayName: 'Склад потерянных вещей',
    // @ts-ignore
    baseFloor: 100,
    tags: new Set(['lost_property', 'inventory', 'theft', 'memory']),
    rarity: 'common',
    minDepth: 0,
    unlockHint: 'Чужую вещь можно вернуть за доверие или украсть с риском, что свидетели запомнят кражу.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_canteen_underpass',
    displayName: 'Подход к столовой',
    // @ts-ignore
    baseFloor: 60,
    tags: new Set(['ration', 'crowd', 'smuggling', 'hunger']),
    rarity: 'common',
    minDepth: 0,
    unlockHint: 'Толпа скрывает контрабанду, но голодные NPC могут сорвать очередь.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_pump_orchestra',
    displayName: 'Оркестр насосов',
    // @ts-ignore
    baseFloor: 140,
    tags: new Set(['pump', 'rhythm', 'water', 'ambush']),
    rarity: 'uncommon',
    minDepth: 2,
    unlockHint: 'Ритм насосов подсказывает, когда пройти сухо и когда ждать засаду из воды.',
    contentStatus: 'catalog_only',
  },
  {
    id: 'pocket_planned_demolition',
    displayName: 'Плановый снос секции',
    // @ts-ignore
    baseFloor: 100,
    tags: new Set(['demolition', 'timer', 'walls', 'escape']),
    rarity: 'rare',
    minDepth: 2,
    unlockHint: 'Секция рушится по таймеру, оставляя выбор между хабаром и выходом.',
    contentStatus: 'catalog_only',
  },
];
