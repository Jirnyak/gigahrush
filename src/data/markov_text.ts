/* ── Template-first Markov NPC text definitions ───────────────── */
/* Data only: no world mutation, frame logic or runtime state.      */

import {
  FACTION_LINES,
  GENERAL_LINES,
  OLD_WORLD_MEMORY_LINES,
  ROOM_MEMORY_COMBAT_LINES,
  ROOM_MEMORY_HELP_LINES,
  ROOM_MEMORY_REPAIR_LINES,
  ROOM_MEMORY_SAMOSBOR_LINES,
  ROOM_MEMORY_THEFT_LINES,
} from './dialogue';
import {
  CONTEXT_ACTIVE_CONTRACT_LINES,
  CONTEXT_BARK_FACTION_AMBIENT,
  CONTEXT_BARK_FEAR,
  CONTEXT_BARK_HUNGER,
  CONTEXT_BARK_SAMOSBOR_HIDE,
  CONTEXT_BARK_SHORTAGE,
  CONTEXT_BARK_THIRST,
  CONTEXT_BARK_WOUNDED,
  CONTEXT_DANGEROUS_ZONE_LINES,
  CONTEXT_FACTION_EVENT_LINES,
  CONTEXT_HIGH_TRUST_LINES,
  CONTEXT_HUNGER_LINES,
  CONTEXT_LIFT_ANOMALY_LINES,
  CONTEXT_LOW_TRUST_LINES,
  CONTEXT_MONSTER_KILL_LINES,
  CONTEXT_NEAR_CONTAINER_LINES,
  CONTEXT_PRODUCTION_LINES,
  CONTEXT_PRODUCTION_OUTPUT_LINES,
  CONTEXT_PRODUCTION_SHORTAGE_LINES,
  CONTEXT_REPEATED_HELP_LINES,
  CONTEXT_SAFE_OWN_ZONE_LINES,
  CONTEXT_SAMOSBOR_AFTER_LINES,
  CONTEXT_SAMOSBOR_WARNING_LINES,
  CONTEXT_STOLEN_GOODS_LINES,
  CONTEXT_THEFT_FEAR_LINES,
  CONTEXT_THIRST_LINES,
  CONTEXT_WOUND_LINES,
} from './context_lines';

export type MarkovIntent =
  | 'talk_ambient'
  | 'talk_context'
  | 'log_speech'
  | 'bark_ambient'
  | 'procedural_quest'
  | 'rumor_flavor'
  | 'demos_post'
  | 'demos_reaction'
  | 'locked_author_text';

export type MarkovSource = 'generated_markov' | 'curated_pool' | 'locked_author_text';

export type MarkovAtomClass =
  | 'address'
  | 'place_ref'
  | 'need_ref'
  | 'event_ref'
  | 'item_ref'
  | 'faction_ref'
  | 'state_fact'
  | 'severity_ref'
  | 'order_marker'
  | 'action_advice'
  | 'action_ban'
  | 'trade_rule'
  | 'relation_fact'
  | 'terminal';

export interface MarkovAtomDef {
  readonly id: string;
  readonly text: string;
  readonly class: MarkovAtomClass;
  readonly tags?: readonly string[];
  readonly anchorKind?: string;
  readonly weight?: number;
}

export type MarkovTemplatePart =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'arg'; readonly key: string; readonly fallback: string; readonly anchor?: string }
  | {
      readonly kind: 'slot';
      readonly domain: string;
      readonly minAtoms: number;
      readonly maxAtoms: number;
      readonly allowedClassPaths: readonly (readonly MarkovAtomClass[])[];
      readonly requiredAnchors?: readonly string[];
    };

export interface MarkovTemplate {
  readonly id: string;
  readonly intent: MarkovIntent;
  readonly source: MarkovSource;
  readonly domains: readonly string[];
  readonly requiredTags?: readonly string[];
  readonly blockedTags?: readonly string[];
  readonly requiredAnchors?: readonly string[];
  readonly weight: number;
  readonly scoreBias?: number;
  readonly maxChars: number;
  readonly parts: readonly MarkovTemplatePart[];
  readonly fallback: string;
}

export interface MarkovCorpusLine {
  readonly id: string;
  readonly domain: string;
  readonly intent: MarkovIntent;
  readonly source: Exclude<MarkovSource, 'locked_author_text'>;
  readonly text: string;
  readonly weight?: number;
  readonly styleTags?: readonly string[];
  readonly contextTags?: readonly string[];
  readonly anchorKinds?: readonly string[];
  readonly blockedTags?: readonly string[];
}

export interface MarkovDomain {
  readonly id: string;
  readonly maxOrder: 1 | 2 | 3;
  readonly tags: readonly string[];
  readonly allowedIntents: readonly MarkovIntent[];
  readonly corpus: readonly MarkovCorpusLine[];
  readonly atoms?: readonly MarkovAtomDef[];
  readonly fallback: string;
}

export interface MarkovTextDefinitions {
  readonly domains: readonly MarkovDomain[];
  readonly templates: readonly MarkovTemplate[];
  readonly intentFallbacks: Readonly<Record<MarkovIntent, string>>;
  readonly terminalClasses: readonly MarkovAtomClass[];
  readonly toneBlacklist: readonly string[];
  readonly internalBlacklist: readonly string[];
  readonly spoilerBlacklist: readonly string[];
}

export const MARKOV_TERMINAL_CLASSES = [
  'action_advice',
  'action_ban',
  'trade_rule',
  'relation_fact',
  'terminal',
] as const satisfies readonly MarkovAtomClass[];

export const MARKOV_TONE_BLACKLIST = [
  'избранный',
  'пророк',
  'спаситель',
  'носитель судьбы',
  'мироздание',
  'вечность',
  'бездна',
  'сингулярность',
  'нейроны дома',
  'алгоритм страдания',
] as const;

export const MARKOV_INTERNAL_BLACKLIST = [
  '1024x1024',
  'toroid',
  'тороид',
  'seed',
  'debug',
  'todo',
  'persistentnpcid',
  'alife:',
] as const;

export const MARKOV_SPOILER_BLACKLIST = [
  'творец',
  'пустота зовёт',
  'конец маршрута',
] as const;

export const MARKOV_INTENT_FALLBACKS: Readonly<Record<MarkovIntent, string>> = {
  talk_ambient: 'Кушайте вовремя.',
  talk_context: 'Сначала дело, потом разговоры.',
  log_speech: 'В коридоре кто-то говорит коротко и по делу.',
  bark_ambient: 'Дверь держит. Пока тихо.',
  procedural_quest: 'Нужна работа с понятным адресом и платой.',
  rumor_flavor: 'Слух короткий: проверь место, потом верь.',
  demos_post: 'В Инфосети пишут: факт есть, подробности позже.',
  demos_reaction: 'Записал. Проверю по списку.',
  locked_author_text: 'Слова оставлены как есть.',
};

const SPACE_PATHS = [
  ['place_ref', 'state_fact', 'action_advice'],
  ['place_ref', 'state_fact', 'action_ban'],
] as const satisfies readonly (readonly MarkovAtomClass[])[];

const NEED_PATHS = [
  ['need_ref', 'severity_ref', 'action_advice'],
  ['need_ref', 'item_ref', 'action_advice'],
  ['item_ref', 'state_fact', 'action_ban'],
] as const satisfies readonly (readonly MarkovAtomClass[])[];

const DANGER_PATHS = [
  ['event_ref', 'state_fact', 'action_ban'],
  ['place_ref', 'state_fact', 'action_advice'],
  ['event_ref', 'severity_ref', 'action_advice'],
] as const satisfies readonly (readonly MarkovAtomClass[])[];

const WEALTH_PATHS = [
  ['item_ref', 'state_fact', 'trade_rule'],
  ['event_ref', 'state_fact', 'trade_rule'],
] as const satisfies readonly (readonly MarkovAtomClass[])[];

const ITEM_PATHS = [
  ['item_ref', 'state_fact', 'action_advice'],
  ['item_ref', 'action_ban', 'action_advice'],
] as const satisfies readonly (readonly MarkovAtomClass[])[];

const TIME_PATHS = [
  ['event_ref', 'state_fact', 'action_advice'],
  ['event_ref', 'severity_ref', 'action_ban'],
] as const satisfies readonly (readonly MarkovAtomClass[])[];

const RELATION_PATHS = [
  ['relation_fact', 'state_fact', 'action_advice'],
  ['event_ref', 'relation_fact', 'terminal'],
] as const satisfies readonly (readonly MarkovAtomClass[])[];

const FACTION_PATHS = [
  ['faction_ref', 'state_fact', 'action_advice'],
  ['place_ref', 'faction_ref', 'action_ban'],
] as const satisfies readonly (readonly MarkovAtomClass[])[];

const EVENT_PATHS = [
  ['event_ref', 'state_fact', 'action_advice'],
  ['event_ref', 'state_fact', 'trade_rule'],
] as const satisfies readonly (readonly MarkovAtomClass[])[];

const INTERACTION_PATHS = [
  ['event_ref', 'relation_fact', 'action_advice'],
  ['item_ref', 'state_fact', 'action_ban'],
] as const satisfies readonly (readonly MarkovAtomClass[])[];

const SPACE_ATOMS = [
  atom('space.herma', 'У гермы', 'place_ref', ['room', 'door', 'shelter'], 'room', 8),
  atom('space.kitchen', 'Кухня', 'place_ref', ['room', 'food'], 'room', 6),
  atom('space.wet_corridor', 'Мокрый коридор', 'place_ref', ['room', 'water', 'danger'], 'room', 5),
  atom('space.lift', 'Лифт', 'place_ref', ['lift', 'route'], 'route', 5),
  atom('space.door_swells', 'дверь набухла снизу', 'state_fact', ['door', 'water'], 'room', 6),
  atom('space.floor_lies', 'этаж сегодня врёт номером', 'state_fact', ['lift', 'route'], 'route', 4),
  atom('space.go_dry_wall', 'иди по сухой стене', 'action_advice', ['water', 'safe'], 'action', 6),
  atom('space.ask_last', 'спроси, кто вышел последним', 'action_advice', ['route', 'talk'], 'action', 4),
  atom('space.do_not_step', 'не шагай первым', 'action_ban', ['danger'], 'action', 5),
] as const satisfies readonly MarkovAtomDef[];

const NEED_ATOMS = [
  atom('needs.water_low', 'Воды мало', 'need_ref', ['need', 'water'], 'need', 9),
  atom('needs.food_low', 'Хлеб кончается', 'need_ref', ['need', 'food'], 'need', 8),
  atom('needs.wound', 'Кровь пошла сильнее', 'need_ref', ['need', 'wound'], 'need', 7),
  atom('needs.urgent', 'это уже срочно', 'severity_ref', ['urgent'], 'need', 7),
  atom('needs.low', 'терпит недолго', 'severity_ref', ['low'], 'need', 5),
  atom('needs.filter', 'фильтр', 'item_ref', ['item', 'water'], 'item', 5),
  atom('needs.bandage', 'бинт', 'item_ref', ['item', 'medical'], 'item', 7),
  atom('needs.eat_first', 'сначала поешь, потом спорь', 'action_advice', ['food'], 'action', 8),
  atom('needs.find_water', 'найди воду до разговора', 'action_advice', ['water'], 'action', 8),
  atom('needs.press_wound', 'рану прижми и иди к столу', 'action_advice', ['medical'], 'action', 6),
  atom('needs.no_show_food', 'не показывай пайку очереди', 'action_ban', ['food', 'queue'], 'action', 5),
] as const satisfies readonly MarkovAtomDef[];

const DANGER_ATOMS = [
  atom('danger.siren', 'Сирена пошла глухо', 'event_ref', ['danger', 'samosbor'], 'event', 9),
  atom('danger.monster', 'Тварь рядом', 'event_ref', ['danger', 'monster'], 'event', 7),
  atom('danger.lift_wrong', 'Лифт недавно соврал этажом', 'event_ref', ['danger', 'lift'], 'event', 5),
  atom('danger.by_door', 'за дверью шаги', 'state_fact', ['door', 'danger'], 'room', 8),
  atom('danger.bad_air', 'воздух плохой', 'state_fact', ['air', 'danger'], 'event', 5),
  atom('danger.panic', 'паника ближе драки', 'severity_ref', ['panic'], 'danger', 4),
  atom('danger.find_shelter', 'ищи герму без споров', 'action_advice', ['shelter'], 'action', 9),
  atom('danger.close_door', 'закрой дверь и уходи', 'action_advice', ['door'], 'action', 7),
  atom('danger.do_not_open', 'не открывай на знакомый голос', 'action_ban', ['door', 'samosbor'], 'action', 8),
] as const satisfies readonly MarkovAtomDef[];

const WEALTH_ATOMS = [
  atom('wealth.water', 'Вода', 'item_ref', ['item', 'water', 'trade'], 'item', 9),
  atom('wealth.bread', 'хлеб', 'item_ref', ['item', 'food', 'trade'], 'item', 8),
  atom('wealth.shop_silent', 'кладовщик молчит', 'state_fact', ['trade', 'shortage'], 'event', 5),
  atom('wealth.price_up', 'цены не стоят', 'state_fact', ['trade', 'shortage'], 'event', 6),
  atom('wealth.contract', 'контракт тяжелее патронов', 'event_ref', ['contract'], 'event', 5),
  atom('wealth.pay_water', 'плати водой или маршрутом', 'trade_rule', ['trade', 'water'], 'action', 7),
  atom('wealth.ask_witness', 'торгуйся при свидетеле', 'trade_rule', ['trade', 'queue'], 'action', 5),
] as const satisfies readonly MarkovAtomDef[];

const ITEM_ATOMS = [
  atom('items.filter', 'Фильтр', 'item_ref', ['item', 'water'], 'item', 8),
  atom('items.bandage', 'Бинт', 'item_ref', ['item', 'medical'], 'item', 8),
  atom('items.ammo', 'Патроны', 'item_ref', ['item', 'ammo'], 'item', 7),
  atom('items.sealant', 'уплотнитель', 'item_ref', ['item', 'repair'], 'item', 6),
  atom('items.must_be_dry', 'должен быть сухим', 'state_fact', ['repair', 'water'], 'item', 7),
  atom('items.count_before', 'считай до лифта', 'state_fact', ['ammo', 'route'], 'item', 5),
  atom('items.use_now', 'используй сейчас, не после гермы', 'action_advice', ['need'], 'action', 6),
  atom('items.no_lamp', 'не суши у лампы', 'action_ban', ['fire', 'paper'], 'action', 5),
] as const satisfies readonly MarkovAtomDef[];

const TIME_ATOMS = [
  atom('time.after_samosbor', 'После самосбора', 'event_ref', ['event', 'samosbor'], 'event', 9),
  atom('time.after_shift', 'После смены', 'event_ref', ['event', 'work'], 'event', 5),
  atom('time.shelter_list', 'список укрытых опять не сошёлся', 'state_fact', ['shelter', 'event'], 'event', 7),
  atom('time.kitchen_moved', 'кухня стала за шкафом', 'state_fact', ['room', 'food'], 'room', 5),
  atom('time.first_door', 'сначала дверь проверь', 'action_advice', ['door'], 'action', 7),
  atom('time.number_check', 'номер сверяй у дверей', 'action_advice', ['route', 'door'], 'action', 5),
  atom('time.no_voice', 'не верь голосу за стеной', 'action_ban', ['danger'], 'action', 5),
] as const satisfies readonly MarkovAtomDef[];

const RELATION_ATOMS = [
  atom('rel.trust_water', 'за принесённую воду имя помнят', 'relation_fact', ['relation', 'water'], 'relation', 8),
  atom('rel.theft_loud', 'после кражи шкаф закрывают громче', 'relation_fact', ['relation', 'theft'], 'relation', 7),
  atom('rel.low_trust', 'тебя пока знают по слуху', 'relation_fact', ['relation', 'cold'], 'relation', 5),
  atom('rel.helped', 'помощь у общего ящика слышали', 'relation_fact', ['relation', 'help'], 'relation', 6),
  atom('rel.hands_visible', 'руки держи на виду', 'state_fact', ['relation', 'theft'], 'action', 6),
  atom('rel.price_soft', 'цену назовут мягче', 'state_fact', ['trade', 'help'], 'relation', 5),
  atom('rel.ask_quiet', 'спроси тихо и без чужого кармана', 'action_advice', ['talk'], 'action', 5),
  atom('rel.one_map_more', 'верят на одну карту больше', 'terminal', ['relation'], 'relation', 4),
] as const satisfies readonly MarkovAtomDef[];

const FACTION_ATOMS = [
  atom('faction.citizen', 'Гражданские', 'faction_ref', ['faction', 'citizen'], 'faction', 6),
  atom('faction.liquidator', 'Ликвидаторы', 'faction_ref', ['faction', 'liquidator'], 'faction', 8),
  atom('faction.cult', 'Культисты', 'faction_ref', ['faction', 'cult'], 'faction', 5),
  atom('faction.wild', 'Дикие', 'faction_ref', ['faction', 'wild'], 'faction', 6),
  atom('faction.count_first', 'сначала считают своих', 'state_fact', ['faction', 'order'], 'faction', 7),
  atom('faction.keep_sector', 'держат сектор, пока есть патроны', 'state_fact', ['faction', 'danger'], 'faction', 7),
  atom('faction.report_then_shoot', 'доклад, выстрел, отход', 'action_advice', ['faction', 'danger'], 'action', 7),
  atom('faction.do_not_argue', 'не спорь у чужой гермы', 'action_ban', ['faction', 'shelter'], 'action', 5),
] as const satisfies readonly MarkovAtomDef[];

const WORLD_EVENT_ATOMS = [
  atom('event.samosbor', 'После самосбора', 'event_ref', ['event', 'samosbor'], 'event', 9),
  atom('event.faction_clash', 'После стычки фракций', 'event_ref', ['event', 'faction'], 'event', 6),
  atom('event.production_stop', 'Когда цех молчит', 'event_ref', ['event', 'production'], 'event', 6),
  atom('event.monster_dead', 'После мёртвой твари', 'event_ref', ['event', 'monster'], 'event', 6),
  atom('event.room_wary', 'дверь слушает громче людей', 'state_fact', ['room', 'danger'], 'room', 6),
  atom('event.price_talks', 'завтра говорит кладовщик', 'state_fact', ['trade', 'production'], 'event', 5),
  atom('event.check_corridor', 'сначала слушай коридор', 'action_advice', ['danger'], 'action', 7),
  atom('event.ask_owner', 'спроси, чей сейчас сектор', 'action_advice', ['faction'], 'action', 5),
  atom('event.price_claims', 'платить будут претензиями', 'trade_rule', ['contract'], 'action', 4),
] as const satisfies readonly MarkovAtomDef[];

const INTERACTION_ATOMS = [
  atom('interaction.help', 'Ты воду носил без списка', 'event_ref', ['interaction', 'help', 'water'], 'event', 7),
  atom('interaction.theft', 'После чужой руки', 'event_ref', ['interaction', 'theft'], 'event', 7),
  atom('interaction.repair', 'После ремонта', 'event_ref', ['interaction', 'repair'], 'event', 6),
  atom('interaction.container', 'общий ящик', 'item_ref', ['container', 'trade'], 'item', 6),
  atom('interaction.name_remembered', 'имя запоминают', 'relation_fact', ['relation', 'help'], 'relation', 6),
  atom('interaction.witness', 'свидетель уже у двери', 'relation_fact', ['relation', 'theft'], 'relation', 6),
  atom('interaction.door_better', 'дверь держится лучше', 'state_fact', ['repair', 'door'], 'room', 5),
  atom('interaction.ask_list', 'спроси список до рук', 'action_advice', ['container'], 'action', 5),
  atom('interaction.no_silent_take', 'не выноси молча', 'action_ban', ['theft'], 'action', 7),
] as const satisfies readonly MarkovAtomDef[];

export const MARKOV_TEMPLATES = [
  template('space_move.talk', 'talk_context', ['space_move'], ['room'], ['room'], SPACE_PATHS, 'У гермы тихо. Иди по сухой стене.'),
  template('needs.talk', 'talk_context', ['needs'], ['need'], ['need'], NEED_PATHS, 'Кушайте вовремя.'),
  template('danger.talk', 'talk_context', ['danger'], ['danger'], ['event'], DANGER_PATHS, 'Не стой в коридоре, ищи герму.'),
  template('wealth.talk', 'talk_context', ['wealth'], ['trade'], ['item'], WEALTH_PATHS, 'Вода за хлеб, хлеб за тишину.'),
  template('items_use.talk', 'talk_context', ['items_use'], ['item'], ['item'], ITEM_PATHS, 'Фильтр держи сухим.'),
  template('time_change.log', 'log_speech', ['time_change'], ['event'], ['event'], TIME_PATHS, 'После отбоя сначала проверь дверь.'),
  template('relationships.talk', 'talk_ambient', ['relationships'], ['relation'], ['relation'], RELATION_PATHS, 'Руки покажи, потом поговорим.'),
  template('factions.talk', 'talk_ambient', ['factions'], ['faction'], ['faction'], FACTION_PATHS, 'В чужом секторе сначала спрашивают пароль.'),
  template('world_events.rumor', 'rumor_flavor', ['world_events'], ['event'], ['event'], EVENT_PATHS, 'Слух короткий: место изменилось, проверь дверь.'),
  template('interactions.talk', 'talk_context', ['interactions'], ['interaction'], ['action'], INTERACTION_PATHS, 'Общий ящик открывают при людях.'),
  template('bark.needs', 'bark_ambient', ['needs'], ['need'], ['need'], NEED_PATHS, 'Хлеб спрячь. Очередь слышит.'),
  template('bark.danger', 'bark_ambient', ['danger'], ['danger'], ['event'], DANGER_PATHS, 'К герме. Без споров.'),
  template('quest.trade', 'procedural_quest', ['wealth'], ['quest'], ['item'], WEALTH_PATHS, 'Нужен предмет, адрес и плата по списку.'),
  template('demos.event', 'demos_post', ['world_events'], ['event'], ['event'], EVENT_PATHS, 'В Инфосети пишут: событие подтвердили свидетели.'),
  template('demos.relation', 'demos_reaction', ['relationships'], ['relation'], ['relation'], RELATION_PATHS, 'Записал. Спрошу при встрече.'),
  {
    id: 'generic.talk',
    intent: 'talk_ambient',
    source: 'generated_markov',
    domains: ['space_move'],
    weight: 1,
    maxChars: 140,
    parts: [{ kind: 'slot', domain: 'space_move', minAtoms: 2, maxAtoms: 3, allowedClassPaths: SPACE_PATHS }],
    fallback: MARKOV_INTENT_FALLBACKS.talk_ambient,
  },
] as const satisfies readonly MarkovTemplate[];

export const MARKOV_DOMAINS = [
  domain('space_move', ['room', 'route', 'door'], ['talk_ambient', 'talk_context', 'log_speech', 'bark_ambient'], SPACE_ATOMS, [
    ...corpus('space_move', 'talk_context', 'dialogue.general', GENERAL_LINES, ['room'], ['room']),
    ...corpus('space_move', 'talk_context', 'context.safe', CONTEXT_SAFE_OWN_ZONE_LINES, ['room', 'safe'], ['room']),
    ...corpus('space_move', 'talk_context', 'context.lift', CONTEXT_LIFT_ANOMALY_LINES, ['lift', 'route', 'danger'], ['event', 'route']),
  ], 'У гермы тихо. Иди по сухой стене.'),
  domain('needs', ['need', 'food', 'water', 'medical'], ['talk_context', 'log_speech', 'bark_ambient'], NEED_ATOMS, [
    ...corpus('needs', 'talk_context', 'context.hunger', CONTEXT_HUNGER_LINES, ['need', 'food'], ['need']),
    ...corpus('needs', 'talk_context', 'context.thirst', CONTEXT_THIRST_LINES, ['need', 'water'], ['need']),
    ...corpus('needs', 'talk_context', 'context.wound', CONTEXT_WOUND_LINES, ['need', 'medical'], ['need']),
    ...corpus('needs', 'bark_ambient', 'bark.hunger', CONTEXT_BARK_HUNGER, ['need', 'food'], ['need']),
    ...corpus('needs', 'bark_ambient', 'bark.thirst', CONTEXT_BARK_THIRST, ['need', 'water'], ['need']),
    ...corpus('needs', 'bark_ambient', 'bark.wounded', CONTEXT_BARK_WOUNDED, ['need', 'medical'], ['need']),
  ], 'Кушайте вовремя.'),
  domain('danger', ['danger', 'samosbor', 'monster', 'door'], ['talk_context', 'log_speech', 'bark_ambient'], DANGER_ATOMS, [
    ...corpus('danger', 'talk_context', 'context.danger', CONTEXT_DANGEROUS_ZONE_LINES, ['danger'], ['event']),
    ...corpus('danger', 'talk_context', 'context.samosbor_warning', CONTEXT_SAMOSBOR_WARNING_LINES, ['danger', 'samosbor'], ['event']),
    ...corpus('danger', 'talk_context', 'context.monster', CONTEXT_MONSTER_KILL_LINES, ['danger', 'monster'], ['event']),
    ...corpus('danger', 'bark_ambient', 'bark.fear', CONTEXT_BARK_FEAR, ['danger'], ['event']),
    ...corpus('danger', 'bark_ambient', 'bark.samosbor_hide', CONTEXT_BARK_SAMOSBOR_HIDE, ['danger', 'samosbor'], ['event']),
  ], 'Не стой в коридоре, ищи герму.'),
  domain('wealth', ['trade', 'shortage', 'production'], ['talk_context', 'log_speech', 'bark_ambient', 'procedural_quest', 'demos_post'], WEALTH_ATOMS, [
    ...corpus('wealth', 'talk_context', 'context.contract', CONTEXT_ACTIVE_CONTRACT_LINES, ['trade', 'contract'], ['event']),
    ...corpus('wealth', 'talk_context', 'context.production', CONTEXT_PRODUCTION_LINES, ['trade', 'production'], ['event']),
    ...corpus('wealth', 'talk_context', 'context.production.output', CONTEXT_PRODUCTION_OUTPUT_LINES, ['trade', 'production'], ['event']),
    ...corpus('wealth', 'talk_context', 'context.shortage', CONTEXT_PRODUCTION_SHORTAGE_LINES, ['trade', 'shortage'], ['event']),
    ...corpus('wealth', 'bark_ambient', 'bark.shortage', CONTEXT_BARK_SHORTAGE, ['trade', 'shortage'], ['event']),
  ], 'Вода за хлеб, хлеб за тишину.'),
  domain('items_use', ['item', 'container', 'repair'], ['talk_context', 'bark_ambient', 'procedural_quest'], ITEM_ATOMS, [
    ...corpus('items_use', 'talk_context', 'context.container', CONTEXT_NEAR_CONTAINER_LINES, ['item', 'container'], ['item']),
    ...corpus('items_use', 'talk_context', 'context.stolen', CONTEXT_STOLEN_GOODS_LINES, ['item', 'theft'], ['item']),
  ], 'Фильтр держи сухим.'),
  domain('time_change', ['time', 'event', 'samosbor'], ['talk_context', 'talk_ambient', 'log_speech', 'demos_post'], TIME_ATOMS, [
    ...corpus('time_change', 'talk_context', 'context.samosbor_after', CONTEXT_SAMOSBOR_AFTER_LINES, ['event', 'samosbor'], ['event']),
    ...corpus('time_change', 'talk_ambient', 'dialogue.old_world', OLD_WORLD_MEMORY_LINES, ['time'], ['event']),
  ], 'После отбоя сначала проверь дверь.'),
  domain('relationships', ['relation', 'help', 'theft', 'trust'], ['talk_ambient', 'talk_context', 'log_speech', 'demos_reaction'], RELATION_ATOMS, [
    ...corpus('relationships', 'talk_context', 'context.low_trust', CONTEXT_LOW_TRUST_LINES, ['relation', 'cold'], ['relation']),
    ...corpus('relationships', 'talk_context', 'context.high_trust', CONTEXT_HIGH_TRUST_LINES, ['relation', 'warm'], ['relation']),
    ...corpus('relationships', 'talk_context', 'context.helped', CONTEXT_REPEATED_HELP_LINES, ['relation', 'help'], ['relation']),
    ...corpus('relationships', 'talk_context', 'context.theft_fear', CONTEXT_THEFT_FEAR_LINES, ['relation', 'theft'], ['relation']),
    ...corpus('relationships', 'talk_context', 'room.help', ROOM_MEMORY_HELP_LINES, ['relation', 'help'], ['relation']),
    ...corpus('relationships', 'talk_context', 'room.theft', ROOM_MEMORY_THEFT_LINES, ['relation', 'theft'], ['relation']),
  ], 'Руки покажи, потом поговорим.'),
  domain('factions', ['faction', 'sector', 'territory'], ['talk_ambient', 'talk_context', 'log_speech', 'bark_ambient', 'demos_post'], FACTION_ATOMS, [
    ...corpusRecord('factions', 'talk_ambient', 'faction', FACTION_LINES, ['faction'], ['faction']),
    ...corpusRecord('factions', 'bark_ambient', 'bark.faction.ambient', CONTEXT_BARK_FACTION_AMBIENT, ['faction'], ['faction']),
  ], 'В чужом секторе сначала спрашивают пароль.'),
  domain('world_events', ['event', 'rumor', 'production', 'faction'], ['talk_context', 'log_speech', 'rumor_flavor', 'demos_post', 'demos_reaction'], WORLD_EVENT_ATOMS, [
    ...corpus('world_events', 'talk_context', 'context.faction_event', CONTEXT_FACTION_EVENT_LINES, ['event', 'faction'], ['event']),
    ...corpus('world_events', 'talk_context', 'room.combat', ROOM_MEMORY_COMBAT_LINES, ['event', 'combat'], ['event']),
    ...corpus('world_events', 'talk_context', 'room.samosbor', ROOM_MEMORY_SAMOSBOR_LINES, ['event', 'samosbor'], ['event']),
    ...corpus('world_events', 'talk_context', 'room.repair', ROOM_MEMORY_REPAIR_LINES, ['event', 'repair'], ['event']),
  ], 'Слух короткий: место изменилось, проверь дверь.'),
  domain('interactions', ['interaction', 'container', 'repair', 'theft'], ['talk_context', 'log_speech', 'demos_reaction'], INTERACTION_ATOMS, [
    ...corpus('interactions', 'talk_context', 'context.stolen', CONTEXT_STOLEN_GOODS_LINES, ['interaction', 'theft'], ['item', 'action']),
    ...corpus('interactions', 'talk_context', 'room.help', ROOM_MEMORY_HELP_LINES, ['interaction', 'help'], ['action']),
    ...corpus('interactions', 'talk_context', 'room.repair', ROOM_MEMORY_REPAIR_LINES, ['interaction', 'repair'], ['action']),
  ], 'Общий ящик открывают при людях.'),
] as const satisfies readonly MarkovDomain[];

export const MARKOV_TEXT_DEFINITIONS: MarkovTextDefinitions = {
  domains: MARKOV_DOMAINS,
  templates: MARKOV_TEMPLATES,
  intentFallbacks: MARKOV_INTENT_FALLBACKS,
  terminalClasses: MARKOV_TERMINAL_CLASSES,
  toneBlacklist: MARKOV_TONE_BLACKLIST,
  internalBlacklist: MARKOV_INTERNAL_BLACKLIST,
  spoilerBlacklist: MARKOV_SPOILER_BLACKLIST,
};

function atom(
  id: string,
  text: string,
  atomClass: MarkovAtomClass,
  tags: readonly string[],
  anchorKind: string,
  weight = 1,
): MarkovAtomDef {
  return { id, text, class: atomClass, tags, anchorKind, weight };
}

function template(
  id: string,
  intent: MarkovIntent,
  domains: readonly string[],
  requiredTags: readonly string[],
  requiredAnchors: readonly string[],
  paths: readonly (readonly MarkovAtomClass[])[],
  fallback: string,
): MarkovTemplate {
  return {
    id,
    intent,
    source: 'generated_markov',
    domains,
    requiredTags,
    requiredAnchors,
    weight: 4 + requiredTags.length,
    maxChars: intent === 'bark_ambient' ? 96 : intent === 'demos_post' || intent === 'demos_reaction' ? 180 : 140,
    parts: [{ kind: 'slot', domain: domains[0] ?? 'space_move', minAtoms: 2, maxAtoms: 3, allowedClassPaths: paths, requiredAnchors }],
    fallback,
  };
}

function domain(
  id: string,
  tags: readonly string[],
  allowedIntents: readonly MarkovIntent[],
  atoms: readonly MarkovAtomDef[],
  corpusLines: readonly MarkovCorpusLine[],
  fallback: string,
): MarkovDomain {
  return {
    id,
    maxOrder: 3,
    tags,
    allowedIntents,
    atoms,
    corpus: corpusLines,
    fallback,
  };
}

function corpus(
  domainId: string,
  intent: MarkovIntent,
  prefix: string,
  lines: readonly string[],
  contextTags: readonly string[],
  anchorKinds: readonly string[],
  cap = 14,
): readonly MarkovCorpusLine[] {
  const out: MarkovCorpusLine[] = [];
  for (const line of lines) {
    if (out.length >= cap) break;
    if (!lineAllowedForCorpus(line)) continue;
    out.push({
      id: `${prefix}.${out.length}`,
      domain: domainId,
      intent,
      source: 'generated_markov',
      text: line,
      weight: 1,
      contextTags,
      anchorKinds,
    });
  }
  return out;
}

function corpusRecord(
  domainId: string,
  intent: MarkovIntent,
  prefix: string,
  record: Readonly<Record<number, readonly string[]>>,
  contextTags: readonly string[],
  anchorKinds: readonly string[],
  capPerKey = 5,
): readonly MarkovCorpusLine[] {
  const out: MarkovCorpusLine[] = [];
  for (const [key, lines] of Object.entries(record)) {
    out.push(...corpus(domainId, intent, `${prefix}.${key}`, lines, [...contextTags, `${prefix}.${key}`], anchorKinds, capPerKey));
  }
  return out;
}

function lineAllowedForCorpus(line: string): boolean {
  const lower = line.toLocaleLowerCase('ru-RU');
  const blacklist = [
    ...MARKOV_TONE_BLACKLIST,
    ...MARKOV_INTERNAL_BLACKLIST,
    ...MARKOV_SPOILER_BLACKLIST,
  ];
  return !blacklist.some(word => lower.includes(word));
}
