import {
  Faction,
  Occupation,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import { ProductionBeltLineDef, ProductionBeltPipelineDependency } from "./geometry";

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('production_belt');

export const DESIGN_FLOOR_ID = 'production_belt' as const;

export const PRODUCTION_BELT_ROUTE_Z = -14;

export const PRODUCTION_BELT_BASE_FLOOR = 140;

export const CONTENT_TAG = 'floor14_production_belt';

export const PRODUCTION_BELT_FACTORY_LINES: readonly ProductionBeltLineDef[] = [
  {
    id: 'prod_restore_line',
    factoryId: 'metal_shop',
    roomDefId: 'Цех металла: линия восстановления',
    outputTags: ['tools', 'faction'],
    state: 'repairable',
  },
  {
    id: 'prod_charge_line',
    factoryId: 'utility_room',
    roomDefId: 'Диспетчерская зарядки: линия ячеек',
    outputTags: ['utility', 'room'],
    state: 'audited',
  },
  {
    id: 'prod_illegal_ammo',
    factoryId: 'illegal_ammo_smelter',
    roomDefId: 'Патронная плавильня: нелегальная смена',
    outputTags: ['ammo', 'weapon', 'illegal'],
    state: 'bad_batch',
  },
];

export const PRODUCTION_BELT_PIPELINE_DEPENDENCIES: readonly ProductionBeltPipelineDependency[] = [
  {
    id: 'prod_to_service_door_kits',
    fromRouteId: DESIGN_FLOOR_ID,
    toRouteId: 'service_floor',
    factoryId: 'metal_shop',
    outputTag: 'tools',
    decisionId: 'repair_metal_line',
    clue: 'Дверь-комплекты с восстановительной линии питают машинный зал С-15.',
  },
  {
    id: 'prod_charge_to_service_power',
    fromRouteId: DESIGN_FLOOR_ID,
    toRouteId: 'service_floor',
    factoryId: 'utility_room',
    outputTag: 'utility',
    decisionId: 'transfer_charge_cells',
    clue: 'Энергоячейка из зарядки может уйти в обход Служебного этажа или в карман Егора.',
  },
  {
    id: 'prod_bad_batch_to_market',
    fromRouteId: DESIGN_FLOOR_ID,
    toRouteId: 'black_market_88',
    factoryId: 'illegal_ammo_smelter',
    outputTag: 'illegal',
    decisionId: 'steal_bad_batch',
    clue: 'Зеленая партия стоит денег на рынке, но дает поздний слух о браке.',
  },
  {
    id: 'prod_bad_batch_to_living_warning',
    fromRouteId: DESIGN_FLOOR_ID,
    toRouteId: 'living',
    factoryId: 'illegal_ammo_smelter',
    outputTag: 'bad_batch',
    decisionId: 'expose_bad_batch',
    clue: 'Акт БОТ-14 останавливает зеленую партию до Жилой зоны, если сдать образцы аудитору.',
  },
];

export const PRODUCTION_BELT_DEBUG_ENTRY = {
  routeId: DESIGN_FLOOR_ID,
  z: PRODUCTION_BELT_ROUTE_Z,
  spawnHint: 'Проходная смены 14',
} as const;

export const FOREMAN_DEF: PlotNpcDef = {
  name: 'Галина Нормировщица',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.DIRECTOR,
  sprite: Occupation.DIRECTOR,
  hp: 165,
  maxHp: 165,
  money: 120,
  speed: 0.95,
  inventory: [
    { defId: 'ration_stamp_pad', count: 1 },
    { defId: 'water', count: 1 },
    { defId: 'bread', count: 1 },
  ],
  talkLines: [
    'Галина Нормировщица. Тут не завод, а ремень дома: остановится - наверху начнут грызть ведомость.',
    'Работа простая: держишь линию, не суешь руку в пресс, не называешь брак браком при аудиторе.',
    'Мастер не кричит на станок. Мастер кричит на людей, которые еще могут отойти.',
    'Егор застрял между зарядкой и браком. Проведи его к проходной, пока роботы считают людей тарой.',
  ],
  talkLinesPost: [
    'Смена идет. Не идеально, но идеально тут выглядит только недостача.',
    'Выходные ящики под отчетом. Работай легально или воруй быстро.',
    'Грузчиков не вижу, но ящики двигаются. Это хуже опоздания.',
  ],
};

export const MECHANIC_DEF: PlotNpcDef = {
  name: 'Рустам Обводной',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.MECHANIC,
  sprite: Occupation.MECHANIC,
  hp: 145,
  maxHp: 145,
  money: 80,
  speed: 1.0,
  inventory: [
    { defId: 'wrench', count: 1 },
    { defId: 'fuse', count: 2 },
    { defId: 'relay_diagram', count: 1 },
  ],
  talkLines: [
    'Рустам Обводной. Линию можно чинить, можно молиться на нее, можно воровать из нее. Первое дешевле.',
    'Две шестерни на восстановительный вал - и я сниму защиту с выходного шкафа по акту.',
    'Если слышишь писк зарядки, не беги на звук. Звук обычно уже бежит на тебя.',
    'Новый парень спросил про кнопку стоп. Я показал, где лежит журнал травм.',
  ],
  talkLinesPost: [
    'Вал держит. Теперь очередь наверху будет ругаться с полным ртом.',
    'Не трогай зеленую партию голыми руками. Она спорит с кожей.',
    'Если линия снова пойдет рывком, я ее не чиню - я ее уговариваю до отбоя.',
  ],
};

export const WORKER_DEF: PlotNpcDef = {
  name: 'Егор Сменный',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.TURNER,
  sprite: Occupation.TURNER,
  hp: 115,
  maxHp: 115,
  money: 35,
  speed: 1.05,
  inventory: [
    { defId: 'metal_sheet', count: 1 },
    { defId: 'grey_briquette', count: 1 },
  ],
  talkLines: [
    'Егор Сменный. Квота опасная: зарядку гонят горячей, брак называют пайком, а нас - расходом.',
    'Укради энергоячейку из выходного шкафа. Без нее зарядка встанет на ревизию, а люди успеют уйти.',
    'Я новый только по списку. По рукаву уже старый: локоть протерт до серой нитки.',
    'Если Галина спросит, я шел не саботировать. Я шел жить.',
  ],
  talkLinesPost: [
    'Смена притормозила. Иногда саботаж - это просто тормоз, которого не дали инженеру.',
    'Не ешь зеленое из карантина. Даже если оно подписано как еда.',
    'Душевые пустые, а вода идет. Кто-то еще числится на линии без тела у проходной.',
  ],
};

export const AUDITOR_DEF: PlotNpcDef = {
  name: 'Аудитор-БОТ 14',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 220,
  maxHp: 220,
  money: 160,
  speed: 0.8,
  inventory: [
    { defId: 'clean_health_cert', count: 1 },
    { defId: 'container_key_label', count: 1 },
    { defId: 'makarov', count: 1 },
    { defId: 'ammo_9mm', count: 8 },
  ],
  talkLines: [
    'Аудитор-БОТ 14. Партия хорошая, если акт говорит хорошая. Акт хороший, если партия молчит.',
    'Две зеленые единицы из карантина докажут брак. Или докажут вашу кражу. Формально это разные графы.',
    'Свидетелей рядом не требуется. Ревизия рядом всегда.',
    'Контролер качества не нюхает страх. Только партию, фильтр и подпись мастера.',
  ],
  talkLinesPost: [
    'Брак записан. Теперь виновный будет найден из числа тех, кто еще не убежал.',
    'Справка чистая. Не значит, что чисты вы.',
    'План сохранен с пометкой о человеческом факторе. Человеческий фактор пока не сохранен.',
  ],
};

