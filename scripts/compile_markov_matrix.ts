/* ── Offline Markov Matrix & Skeleton Compiler ────────────────── */
/* Generates src/data/markov_compiled_matrix.ts at build-time.       */
/* Zero runtime filesystem (node:fs) or text parsing in browser.     */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../src/data/items';
import { ItemType, Faction, RoomType, MonsterKind } from '../src/core/types';
import { ROOM_DEFS } from '../src/data/rooms';
import { MONSTERS } from '../src/entities/monster';
import { OCCUPATION_PROFILES } from '../src/data/occupation_profiles';
import { DOCUMENT_ACCESS_ITEMS } from '../src/data/documents_access';
import { PERMIT_DEFS } from '../src/data/permits';
import { FLOOR_ANOMALIES } from '../src/data/procedural_floors';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Alien franchise words strictly banned from the compiled browser matrix
const ALIEN_FRANCHISE_BLACKLIST = new Set([
  'чаэс', 'припять', 'чернобыль', 'сидорович', 'контролер', 'контролёр',
  'снорк', 'меченый', 'стрелок', 'вднх', 'полис', 'ганза', 'орден',
  'монолит', 'долг', 'свобода', 'артем', 'артём', 'родрик', 'шухарт',
  'сталкер', 'сталкеры', 'кордон', 'радар', 'саркофаг', 'янтарь',
  'снаут', 'перец', 'хартмонт'
]);


function isSanitizedWord(word: string): boolean {
  const lower = word.toLocaleLowerCase('ru-RU');
  for (const alien of ALIEN_FRANCHISE_BLACKLIST) {
    const re = new RegExp(`(?:^|\\s|[,;.!?«»"'])${alien}(?:$|\\s|[,;.!?«»"'])`, 'i');
    if (re.test(lower)) return false;
  }
  return true;
}

interface CategoryItem {
  text: string;
  weight: number;
  tags: string[];
  mask?: number;
  pcaDanger?: number;
  pcaWealth?: number;
  pcaNeed?: number;
}

/* ── Канонический словарь тегов ────────────────────────────────────
   Классы эквивалентности из markov_plan.md §2.1 плюс семантические оси.
   Ровно 32 имени = один int32 на ребро графа: bitCount(A & C) вместо
   перебора строковых ключей в горячем цикле. Порядок здесь ничего не
   значит для рантайма — словарь выпускается в матрицу как
   COMPILED_TAG_BITS (имя → маска), рантайм читает имена оттуда.
   Расширение: новый тег добавляется сюда или в TAG_ALIASES, не в генератор. */
const CANONICAL_TAGS = [
  'danger', 'samosbor', 'monster', 'anomaly', 'combat', 'weapon', 'fear', 'need',
  'water', 'food', 'wound', 'medical', 'repair', 'door', 'room', 'zone',
  'trade', 'wealth', 'item', 'document', 'bureaucracy', 'guard', 'liquidator', 'science',
  'faction', 'person', 'relation', 'hostile', 'theft', 'shelter', 'survival', 'action',
] as const;

if (CANONICAL_TAGS.length > 32) {
  throw new Error(`Канонических тегов ${CANONICAL_TAGS.length}, в int32 влезает 32`);
}

const TAG_BIT = new Map<string, number>();
/* Беззнаково: 1 << 31 в JS отрицательное, а маска едет в JSON и в тесты. */
CANONICAL_TAGS.forEach((name, i) => TAG_BIT.set(name, (1 << i) >>> 0));

/* Сырые теги игровых данных (475 штук) сворачиваются в канонические классы.
   Гранулярность rifle/shotgun/shells не несёт смысла для выбора реплики —
   несёт «оружие». Всё неучтённое даёт нулевой вклад, это не ошибка. */
const TAG_ALIASES: Record<string, readonly string[]> = {
  // оружие и бой
  rifle: ['weapon'], shotgun: ['weapon'], shells: ['weapon'], ammo: ['weapon'],
  ammo_762: ['weapon'], ammo_shells: ['weapon'], ammo_burn: ['weapon', 'danger'],
  grenade: ['weapon', 'danger'], precision: ['weapon'], flame: ['weapon', 'danger'],
  breach: ['combat', 'door'], counterplay: ['combat'], bait: ['combat'],
  // угрозы
  slime: ['monster'], slime_counterplay: ['monster', 'combat'],
  mystic: ['anomaly'], topology: ['anomaly'], aftermath: ['samosbor'],
  // нужда и тело
  thirst: ['water', 'need'], hunger: ['food', 'need'],
  medicine: ['medical'], concentrate: ['food'], brewing: ['water', 'trade'],
  // ремонт и инфраструктура
  maintenance: ['repair'], tool: ['repair'], engineer: ['repair', 'person'],
  repair_input: ['repair', 'trade'], filter: ['repair', 'survival'],
  electronics: ['science', 'repair'], metal: ['item', 'trade'], fuel: ['item', 'trade'],
  lift: ['zone'], route: ['zone'], corridor_stop: ['room'],
  kvartiry: ['zone'], ministry: ['zone', 'bureaucracy'],
  // наука
  nii: ['science'], sample: ['science'], reagent: ['science'],
  // порядок, бумаги, торговля
  permit: ['document', 'bureaucracy'], paper: ['document'], access: ['document'],
  evidence: ['document', 'theft'], audit: ['bureaucracy', 'document'],
  official: ['bureaucracy'], control: ['bureaucracy'], order: ['bureaucracy'],
  queue: ['bureaucracy', 'relation'], issue_stash: ['document', 'trade'],
  black_market: ['trade', 'theft'], production: ['trade'], factory_input: ['trade'],
  shortage: ['trade', 'need'], contraband: ['theft', 'trade'],
  currency: ['wealth', 'trade'], valuable: ['wealth'], resource: ['item'],
  expensive_item: ['wealth', 'item'], cheap_item: ['item'],
  // люди и стороны
  cleanup: ['guard'], security: ['guard'], citizen: ['faction', 'person'],
  wild: ['faction'], cult: ['faction', 'anomaly'], resident_good: ['person'],
  help: ['relation'], anger: ['hostile'], panic: ['fear'], sadness: ['fear'],
  emotion: ['fear'], relief: ['shelter'], safe: ['shelter'],
  // среда
  air: ['survival'], dark: ['survival'], water_hazard: ['water', 'danger'],
  urgent: ['need', 'danger'], spoiled: ['food'], trophy: ['wealth'],
  documents: ['document'], contract: ['document', 'trade'],
};

function tagMask(tags: readonly string[]): number {
  let mask = 0;
  for (const raw of tags) {
    const direct = TAG_BIT.get(raw);
    if (direct !== undefined) { mask |= direct; continue; }
    const aliases = TAG_ALIASES[raw];
    if (!aliases) continue;
    for (const name of aliases) mask |= TAG_BIT.get(name) ?? 0;
  }
  return mask >>> 0;
}

/* Упаковка ребра: count * 2^14 + индекс маски в COMPILED_MASK_TABLE.
   Различных масок ~10 тысяч на 125 тысяч рёбер, поэтому в ребро едет индекс,
   а не сама 32-битная маска: число остаётся коротким (влезает в SMI, значит
   лежит в объекте без боксинга) и хорошо жмётся, тогда как полная упаковка
   count * 2^32 + mask давала десятизначные уникальные числа и раздувала gzip. */
const MASK_INDEX_BITS = 14;
const EDGE_COUNT_SCALE = 1 << MASK_INDEX_BITS;

function popcount(v: number): number {
  let x = v - ((v >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}

/* Оси PCA — это не таблица чисел, а объявление того, какие классы лежат на
   какой оси. Величина по оси выводится из состава маски, а где у источника
   есть настоящее число (цена предмета, урон монстра, вес аномалии) — из него. */
const AXIS_DANGER = tagMask(['danger', 'samosbor', 'monster', 'anomaly', 'combat', 'weapon', 'fear', 'hostile']);
const AXIS_WEALTH = tagMask(['trade', 'wealth', 'item', 'document']);
const AXIS_NEED = tagMask(['need', 'water', 'food', 'wound', 'medical']);

function axisFromMask(mask: number, axis: number): number {
  return Math.min(1, popcount(mask & axis) / 2);
}

function withDerivedAxes(item: CategoryItem): CategoryItem {
  const mask = tagMask(item.tags);
  item.mask = mask;
  item.pcaDanger = round2(item.pcaDanger ?? axisFromMask(mask, AXIS_DANGER));
  item.pcaWealth = round2(item.pcaWealth ?? axisFromMask(mask, AXIS_WEALTH));
  item.pcaNeed = round2(item.pcaNeed ?? axisFromMask(mask, AXIS_NEED));
  return item;
}

function round2(v: number): number {
  return Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
}

const ITEM_TYPE_TAGS: Partial<Record<ItemType, readonly string[]>> = {
  [ItemType.WEAPON]: ['weapon', 'combat'],
  [ItemType.AMMO]: ['weapon'],
  [ItemType.FOOD]: ['food', 'need'],
  [ItemType.DRINK]: ['water', 'need'],
  [ItemType.MEDICINE]: ['medical', 'wound'],
  [ItemType.TOOL]: ['repair'],
  [ItemType.NOTE]: ['document'],
};

function buildItemCategories(): Record<string, CategoryItem[]> {
  const categories: Record<string, CategoryItem[]> = {
    ITEM: [],
    WEAPON: [],
    FOOD: [],
    MEDICINE: [],
    INSTRUMENT: [],
    DOCUMENT: [],
    RESOURCE: []
  };
  
  /* Шкала ценности берётся из самого реестра, а не константой: ось Ценности
     растянута между «пустые карманы» и самым дорогим предметом игры. */
  const maxValue = Math.max(1, ...Object.values(ITEMS).map(d => d.value || 0));
  const valueSpan = Math.log10(maxValue + 1);

  for (const def of Object.values(ITEMS)) {
    if (!isSanitizedWord(def.name)) continue;

    const weight = Math.max(10, def.value || 10);
    /* Тип предмета — такой же источник смысла, как его теги: у брони и пайка
       в реестре тегов может не быть вовсе, а класс эквивалентности есть. */
    const tags = def.tags ? [...def.tags] : [];
    tags.push('item', ...(ITEM_TYPE_TAGS[def.type] ?? []));

    const catItem: CategoryItem = {
      text: def.name.toLowerCase(),
      weight,
      tags,
      pcaWealth: round2((Math.log10((def.value || 0) + 1) / valueSpan) * 2 - 1),
    };

    categories.ITEM.push(catItem);
    
    switch (def.type) {
      case ItemType.WEAPON:
      case ItemType.AMMO:
        categories.WEAPON.push(catItem);
        break;
      case ItemType.FOOD:
      case ItemType.DRINK:
        categories.FOOD.push(catItem);
        break;
      case ItemType.MEDICINE:
        categories.MEDICINE.push(catItem);
        break;
      case ItemType.TOOL:
        categories.INSTRUMENT.push(catItem);
        break;
      case ItemType.NOTE:
        categories.DOCUMENT.push(catItem);
        break;
      case ItemType.MISC:
        if (catItem.tags.includes('resource') || catItem.tags.includes('currency') || catItem.tags.includes('valuable')) {
          categories.RESOURCE.push(catItem);
        }
        break;
    }
  }
  
  return categories;
}

function buildFactionCategories(): CategoryItem[] {
  const mapping: Partial<Record<Faction, { text: string; extraTags: string[] }>> = {
    [Faction.CITIZEN]: { text: 'гражданские', extraTags: ['citizen'] },
    [Faction.LIQUIDATOR]: { text: 'ликвидаторы', extraTags: ['liquidator', 'combat'] },
    [Faction.CULTIST]: { text: 'культисты', extraTags: ['cult', 'mystic'] },
    [Faction.WILD]: { text: 'дикие', extraTags: ['wild'] },
    [Faction.SCIENTIST]: { text: 'учёные', extraTags: ['science', 'bureaucracy'] },
  };

  const items: CategoryItem[] = [];
  for (const f of [Faction.CITIZEN, Faction.LIQUIDATOR, Faction.CULTIST, Faction.WILD, Faction.SCIENTIST]) {
    const meta = mapping[f]!;
    items.push({
      text: meta.text,
      weight: 50,
      tags: ['faction', `faction_id_${f}`, ...meta.extraTags]
    });
  }
  return items;
}

function buildThreatCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  /* Опасность монстра — его собственные урон и живучесть, нормированные по
     самому опасному в реестре. Таблицы «кто страшнее» не заводим. */
  const defs = Object.keys(MONSTERS).map(k => MONSTERS[Number(k) as MonsterKind]).filter(d => d && d.name);
  const maxDmg = Math.max(1, ...defs.map(d => d.dmg || 0));
  const maxHp = Math.max(1, ...defs.map(d => d.hp || 0));
  for (const def of defs) {
    items.push({
      text: def.name.toLowerCase(),
      weight: 50,
      tags: ['danger', 'monster'],
      pcaDanger: round2(((def.dmg || 0) / maxDmg + (def.hp || 0) / maxHp) / 2),
    });
  }
  items.push({ text: 'самосбор', weight: 100, tags: ['samosbor', 'danger'], pcaDanger: 1 });
  items.push({ text: 'аномалия', weight: 50, tags: ['mystic', 'danger'] });
  return items;
}

function buildPlaceCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  for (const key of Object.keys(ROOM_DEFS)) {
    const def = ROOM_DEFS[Number(key) as RoomType];
    if (def && def.name) {
      items.push({ text: def.name.toLowerCase(), weight: 20, tags: ['room'] });
    }
  }
  items.push({ text: 'гермодверь', weight: 10, tags: ['door', 'safe'] });
  items.push({ text: 'вентиляционная шахта', weight: 45, tags: ['danger', 'repair'] });
  return items;
}

function buildSubjCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  for (const prof of Object.values(OCCUPATION_PROFILES)) {
    items.push({ text: prof.demosLabel.toLowerCase(), weight: prof.defaultGenerationWeight * 5, tags: ['person', ...prof.routineTags || []] });
  }
  return items;
}

function buildOrganizationCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  const added = new Set<string>();
  
  const add = (text: string, tags: string[]) => {
    const txt = text.toLowerCase();
    if (!added.has(txt)) {
      items.push({ text: txt, weight: 60, tags });
      added.add(txt);
    }
  };

  add('Служба ликвидации', ['guard', 'combat', 'liquidator']);
  add('Гражданская оборона', ['guard', 'combat', 'security']);
  add('Районсовет', ['bureaucracy']);
  add('Комендатура', ['guard', 'bureaucracy']);
  add('НИИ "Щит"', ['science', 'bureaucracy']);
  add('Служба герметизации', ['door', 'repair']);

  return items;
}

function buildDocumentCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  for (const def of Object.values(DOCUMENT_ACCESS_ITEMS)) {
    if (def.type === ItemType.MISC || def.type === ItemType.NOTE) {
      items.push({ text: def.name.toLowerCase(), weight: def.value || 30, tags: ['document'] });
    }
  }
  for (const def of PERMIT_DEFS) {
    items.push({ text: def.title.toLowerCase(), weight: 60, tags: ['document', 'permit'] });
  }
  return items;
}

function buildAnomalyCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  /* Вес аномалии в раскладке этажа — готовая мера её редкости/тяжести;
     редкая аномалия звучит опаснее частой. */
  const maxWeight = Math.max(1, ...FLOOR_ANOMALIES.filter(d => d.id !== 'none').map(d => d.weight));
  for (const def of FLOOR_ANOMALIES) {
    if (def.id !== 'none') {
      items.push({
        text: def.title.toLowerCase(),
        weight: def.weight * 5,
        tags: ['danger', 'anomaly', ...def.tags],
        pcaDanger: round2(1 - def.weight / (maxWeight + 1)),
      });
    }
  }
  return items;
}

function buildZoneCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  for (const route of DESIGN_FLOOR_ROUTES) {
    /* Поле `themeTags` вырезано из маршрутов целиком (коммит e690df77, «тем нет,
     * каждый этаж сам по себе»), а эта строка его пережила — скрипты не входили
     * в tsc-скоуп, и `route.themeTags` молча читался как undefined. То есть теги
     * зон и так собирались пустыми; правка возвращает коду честность, а не
     * меняет матрицу. */
    items.push({ text: route.displayName.toLowerCase(), weight: 30, tags: ['zone'] });
  }
  return items;
}

// Canonical Gigahrush & Samosbor dictionary categories with PCA-like weights
const CANONICAL_CATEGORIES: Record<string, CategoryItem[]> = {
  ...buildItemCategories(),
  FACTION_NAME: buildFactionCategories(),
  THREAT: buildThreatCategories(),
  PLACE: buildPlaceCategories(),
  SUBJ: buildSubjCategories(),
  FACTION: buildOrganizationCategories(),
  DOCUMENT: buildDocumentCategories(),
  ANOMALY: buildAnomalyCategories(),
  ZONE_TYPE: buildZoneCategories(),
  ACTION: [
    { text: 'смазывали поворотные механизмы', weight: 30, tags: ['repair', 'door'] },
    { text: 'задраили шлюз', weight: 70, tags: ['guard', 'door', 'samosbor'] },
    { text: 'сдали карточки', weight: 40, tags: ['bureaucracy', 'survival'] },
    { text: 'записали показания манометра', weight: 20, tags: ['repair', 'science'] },
    { text: 'проверили герметик', weight: 50, tags: ['repair', 'door'] },
    { text: 'опечатали сектор', weight: 85, tags: ['guard', 'danger'] },
    { text: 'оставили заметку на стене', weight: 15, tags: ['document', 'lore'] }
  ],
  STATE_FACT: [
    { text: 'дверь набухла снизу', weight: 60, tags: ['door', 'water'] },
    { text: 'этаж сегодня врёт номером', weight: 40, tags: ['lift', 'route', 'danger'] },
    { text: 'кухня стала за шкафом', weight: 50, tags: ['room', 'food'] },
    { text: 'дверь слушает громче людей', weight: 60, tags: ['room', 'danger'] },
    { text: 'завтра говорит кладовщик', weight: 50, tags: ['trade', 'production'] },
    { text: 'стены сырые', weight: 45, tags: ['water', 'room'] },
    { text: 'воздух плохой', weight: 55, tags: ['air', 'danger'] },
    { text: 'руки держи на виду', weight: 60, tags: ['relation', 'theft'] },
    { text: 'цену назовут мягче', weight: 50, tags: ['trade', 'help'] },
    { text: 'список укрытых опять не сошёлся', weight: 70, tags: ['shelter', 'event'] },
    { text: 'цены не стоят', weight: 60, tags: ['trade', 'shortage'] },
    { text: 'дверь держится лучше', weight: 40, tags: ['repair', 'door'] },
    { text: 'сначала считают своих', weight: 70, tags: ['faction', 'order'] },
    { text: 'держат сектор, пока есть патроны', weight: 70, tags: ['faction', 'danger', 'combat'] },
    { text: 'имя запоминают', weight: 55, tags: ['relation', 'help'] },
    { text: 'свидетель уже у двери', weight: 60, tags: ['relation', 'theft'] }
  ],
  NEED: [
    { text: 'Воды мало', weight: 90, tags: ['need', 'water'] },
    { text: 'Хлеб кончается', weight: 80, tags: ['need', 'food'] },
    { text: 'Кровь пошла сильнее', weight: 70, tags: ['need', 'wound', 'medical'] },
    { text: 'горло пересохло', weight: 85, tags: ['need', 'water'] },
    { text: 'ноги тяжелеют', weight: 50, tags: ['need', 'wound'] },
    { text: 'в глазах рябит', weight: 60, tags: ['need', 'wound', 'danger'] }
  ],
  ACTION_VERB: [
    { text: 'перехватил лом', weight: 40, tags: ['combat', 'action'] },
    { text: 'шагнул в темноту', weight: 50, tags: ['danger', 'action'] },
    { text: 'замер у гермы', weight: 60, tags: ['door', 'danger'] },
    { text: 'выругался', weight: 30, tags: ['neutral', 'emotion'] },
    { text: 'проверил дозиметр', weight: 70, tags: ['science', 'survival'] },
    { text: 'закашлялся', weight: 45, tags: ['wound', 'danger'] },
    { text: 'перезарядил', weight: 80, tags: ['combat'] },
    { text: 'схватился за голову', weight: 65, tags: ['fear', 'panic'] }
  ],
  EMOTION: [
    { text: 'глухой страх', weight: 80, tags: ['fear', 'danger'] },
    { text: 'холодная паника', weight: 90, tags: ['panic', 'danger'] },
    { text: 'нервная дрожь', weight: 60, tags: ['fear'] },
    { text: 'бетонная тоска', weight: 50, tags: ['sadness', 'survival'] },
    { text: 'вспышка ярости', weight: 70, tags: ['anger', 'combat'] },
    { text: 'тяжелое облегчение', weight: 40, tags: ['relief', 'safe'] }
  ],
  SEVERITY: [
    { text: 'это уже срочно', weight: 70, tags: ['urgent'] },
    { text: 'терпит недолго', weight: 50, tags: ['low'] },
    { text: 'паника ближе драки', weight: 40, tags: ['panic', 'danger'] },
    { text: 'хуже не бывает', weight: 80, tags: ['urgent', 'danger'] },
    { text: 'пока держится', weight: 30, tags: ['low'] }
  ],
  TRADE_RULE: [
    { text: 'плати водой или маршрутом', weight: 70, tags: ['trade', 'water'] },
    { text: 'торгуйся при свидетеле', weight: 50, tags: ['trade', 'queue'] },
    { text: 'платить будут претензиями', weight: 40, tags: ['contract'] },
    { text: 'без свидетелей не берут', weight: 60, tags: ['trade', 'theft'] },
    { text: 'цена по карточке и ни литра сверху', weight: 55, tags: ['trade', 'water', 'bureaucracy'] }
  ],
  BAN: [
    { text: 'не шагай первым', weight: 50, tags: ['danger'] },
    { text: 'не открывай на знакомый голос', weight: 80, tags: ['door', 'samosbor', 'danger'] },
    { text: 'не показывай пайку очереди', weight: 50, tags: ['food', 'queue'] },
    { text: 'не выноси молча', weight: 70, tags: ['theft'] },
    { text: 'не спорь у чужой гермы', weight: 50, tags: ['faction', 'shelter'] },
    { text: 'не верь голосу за стеной', weight: 60, tags: ['danger', 'samosbor'] },
    { text: 'не лезь без фонаря', weight: 40, tags: ['danger', 'survival'] }
  ],
  NPC_NAME: [
    { text: 'один знакомый', weight: 50, tags: ['neutral'] },
    { text: 'тот парень', weight: 50, tags: ['neutral'] }
  ],
  TERMINAL: [
    { text: 'верят на одну карту больше', weight: 40, tags: ['relation'] },
    { text: 'и точка', weight: 20, tags: [] },
    { text: 'так и живём', weight: 30, tags: ['survival'] },
    { text: 'без вариантов', weight: 35, tags: ['danger'] },
    { text: 'пока не забыли', weight: 25, tags: ['relation', 'event'] }
  ]
};

// Mined syntax skeletons grouped by intent
interface SyntaxSkeleton {
  id: string;
  pattern: string[]; // e.g. ['SUBJ', 'ACTION', 'PLACE']
  intent: string;    // e.g. 'talk_context', 'document_flavor', 'lore_note', 'bark_ambient'
  weight: number;
}

const CANONICAL_SKELETONS: SyntaxSkeleton[] = [
  // talk_context
  { id: 'sk.talk.1', pattern: ['SUBJ', 'ACTION', 'PLACE'], intent: 'talk_context', weight: 10 },
  { id: 'sk.talk.2', pattern: ['PLACE', 'THREAT'], intent: 'talk_context', weight: 12 },
  { id: 'sk.talk.3', pattern: ['SUBJ', 'THREAT'], intent: 'talk_context', weight: 15 },
  { id: 'sk.talk.4', pattern: ['PLACE', 'ITEM'], intent: 'talk_context', weight: 14 },
  { id: 'sk.talk.5', pattern: ['FACTION', 'ACTION', 'PLACE'], intent: 'talk_context', weight: 11 },
  { id: 'sk.talk.6', pattern: ['SUBJ', 'ZONE_TYPE', 'ANOMALY'], intent: 'talk_context', weight: 13 },
  { id: 'sk.talk.7', pattern: ['RESOURCE', 'TRADE_RULE'], intent: 'talk_context', weight: 12 },
  // talk_ambient
  { id: 'sk.ambient.1', pattern: ['SUBJ', 'ACTION'], intent: 'talk_ambient', weight: 10 },
  { id: 'sk.ambient.2', pattern: ['PLACE', 'THREAT'], intent: 'talk_ambient', weight: 8 },
  { id: 'sk.ambient.3', pattern: ['SUBJ', 'ITEM'], intent: 'talk_ambient', weight: 10 },
  { id: 'sk.ambient.4', pattern: ['ZONE_TYPE', 'ANOMALY'], intent: 'talk_ambient', weight: 9 },
  // bark_ambient
  { id: 'sk.bark.1', pattern: ['THREAT', 'SUBJ'], intent: 'bark_ambient', weight: 10 },
  { id: 'sk.bark.2', pattern: ['PLACE', 'THREAT'], intent: 'bark_ambient', weight: 12 },
  { id: 'sk.bark.3', pattern: ['SUBJ', 'INSTRUMENT'], intent: 'bark_ambient', weight: 8 },
  { id: 'sk.bark.4', pattern: ['DOCUMENT', 'FACTION'], intent: 'bark_ambient', weight: 11 },
  // procedural_quest
  { id: 'sk.quest.1', pattern: ['PLACE', 'THREAT', 'ITEM'], intent: 'procedural_quest', weight: 15 },
  { id: 'sk.quest.2', pattern: ['FACTION', 'THREAT', 'PLACE'], intent: 'procedural_quest', weight: 12 },
  { id: 'sk.quest.3', pattern: ['SUBJ', 'DOCUMENT', 'ZONE_TYPE'], intent: 'procedural_quest', weight: 13 },
  { id: 'sk.quest.4', pattern: ['RESOURCE', 'PLACE'], intent: 'procedural_quest', weight: 11 },
  // document_flavor (записки, дневники, документы)
  { id: 'sk.doc.1', pattern: ['SUBJ', 'ACTION', 'PLACE'], intent: 'document_flavor', weight: 14 },
  { id: 'sk.doc.2', pattern: ['PLACE', 'THREAT', 'ACTION'], intent: 'document_flavor', weight: 16 },
  { id: 'sk.doc.3', pattern: ['FACTION', 'THREAT'], intent: 'document_flavor', weight: 12 },
  { id: 'sk.doc.4', pattern: ['SUBJ', 'ITEM', 'PLACE'], intent: 'document_flavor', weight: 13 },
  { id: 'sk.doc.5', pattern: ['ZONE_TYPE', 'ANOMALY'], intent: 'document_flavor', weight: 15 },
  // lore_note
  { id: 'sk.lore.1', pattern: ['PLACE', 'THREAT', 'SUBJ'], intent: 'lore_note', weight: 15 },
  { id: 'sk.lore.2', pattern: ['FACTION', 'PLACE', 'ACTION'], intent: 'lore_note', weight: 14 },
  { id: 'sk.lore.3', pattern: ['ANOMALY', 'ZONE_TYPE', 'THREAT'], intent: 'lore_note', weight: 16 },
  // rumor_flavor
  { id: 'sk.rumor.1', pattern: ['PLACE', 'THREAT'], intent: 'rumor_flavor', weight: 15 },
  { id: 'sk.rumor.2', pattern: ['THREAT', 'PLACE'], intent: 'rumor_flavor', weight: 12 },
  { id: 'sk.rumor.3', pattern: ['ZONE_TYPE', 'ANOMALY'], intent: 'rumor_flavor', weight: 14 },
  { id: 'sk.rumor.4', pattern: ['SUBJ', 'DOCUMENT', 'FACTION'], intent: 'rumor_flavor', weight: 13 }
];


const START_TOKEN = "<s>";
const END_TOKEN = "</s>";

interface TransitionInfo {
  count: number;
  /* маска → сколько предложений с ней прошло через это ребро. Свернём в один
     int32 на сериализации: бит выживает, если он был у большинства. Простой OR
     насыщает частые истории до «все теги» и убивает различимость. */
  maskCounts: Map<number, number>;
}

type MarkovGraph = Map<string, Map<string, TransitionInfo>>;

class MarkovModel {
  public graph: MarkovGraph = new Map();
  private order: number;
  public patternDistances: Map<string, Map<string, number>> = new Map();

  constructor(order: number = 2) {
    this.order = order;
  }

  private tokenize(text: string): string[] {
    const cleaned = text.trim();
    // Split keeping punctuation as separate tokens, and tags as single tokens
    const matches = cleaned.match(/(?:<[^>]+>)|(?:[a-zа-яё\-]+)|(?:[.,!?])/gi);
    if (!matches) return [];
    return matches.map(w => {
      if (w.startsWith('<') && w.includes('>')) return w;
      if (/^[.,!?]$/.test(w)) return w;
      return w;
    }).filter(w => w.length > 0);
  }

  public train(corpus: { text: string; mask: number }[]) {
    for (const item of corpus) {
      const tokens = this.tokenize(item.text);
      if (tokens.length < 3) continue;
      const sequence = Array(this.order).fill(START_TOKEN).concat(tokens).concat([END_TOKEN]);

      for (let i = 0; i < sequence.length - this.order; i++) {
        const nextToken = sequence[i + this.order];

        for (let o = 1; o <= this.order; o++) {
          const history = sequence.slice(i + this.order - o, i + this.order).join(' ');

          if (!this.graph.has(history)) {
            this.graph.set(history, new Map());
          }

          const transitions = this.graph.get(history)!;
          if (!transitions.has(nextToken)) {
            transitions.set(nextToken, { count: 0, maskCounts: new Map() });
          }

          const transInfo = transitions.get(nextToken)!;
          transInfo.count += 1;
          if (item.mask !== 0) {
            transInfo.maskCounts.set(item.mask, (transInfo.maskCounts.get(item.mask) || 0) + 1);
          }
        }
      }
    }
  }

  public buildHeuristics(targets: string[]) {
    const reverseGraph = new Map<string, Set<string>>();
    
    for (const [history, transitions] of this.graph.entries()) {
      for (const nextWord of transitions.keys()) {
        const nextHistory = history.split(' ').slice(1).concat(nextWord).join(' ');
        if (!reverseGraph.has(nextHistory)) reverseGraph.set(nextHistory, new Set());
        reverseGraph.get(nextHistory)!.add(history);
      }
    }

    for (const target of targets) {
      const distMap = new Map<string, number>();
      this.patternDistances.set(target, distMap);

      const queue: { hist: string, d: number }[] = [];
      
      for (const hist of this.graph.keys()) {
        if (hist.endsWith(target)) {
          distMap.set(hist, 0);
          queue.push({ hist, d: 0 });
        }
      }

      let head = 0;
      while (head < queue.length) {
        const current = queue[head++];
        if (current.d >= 15) continue;

        const incomings = reverseGraph.get(current.hist);
        if (incomings) {
          for (const inc of incomings) {
            if (!distMap.has(inc)) {
              distMap.set(inc, current.d + 1);
              queue.push({ hist: inc, d: current.d + 1 });
            }
          }
        }
      }
    }
  }
}


const RAW_CORPUS: { text: string; mask: number }[] = [];
let rejectedMeta = 0;

/* ── Классификация предложений корпуса ─────────────────────────────
   Ручной разметки нет и быть не должно. Тег предложения выводится из двух
   механических источников: какие плейсхолдеры классов эквивалентности в нём
   стоят после абстрагирования, и какие канонические слова игры в нём есть. */
const PLACEHOLDER_TAGS: Record<string, readonly string[]> = {
  '<SUBJ>': ['person'],
  '<NPC_NAME>': ['person'],
  '<PLACE>': ['room'],
  '<THREAT>': ['danger'],
  '<ITEM>': ['item'],
  '<FACTION>': ['faction'],
  '<ACTION_VERB>': ['action'],
  '<EMOTION>': ['fear'],
};

const PLACEHOLDER_MASKS = new Map<string, number>(
  Object.entries(PLACEHOLDER_TAGS).map(([ph, tags]) => [ph, tagMask(tags)])
);

/* Словарь канонических слов строится из самих игровых категорий: у каждого
   предмета, монстра, комнаты и аномалии уже есть теги — значит есть и маска
   для слов его названия. Русская морфология срезается префиксом. */
const STEM_LEN = 5;
const CANONICAL_STEMS = new Map<string, number>();
for (const items of Object.values(CANONICAL_CATEGORIES)) {
  for (const item of items) {
    const mask = tagMask(item.tags);
    if (mask === 0) continue;
    for (const word of item.text.toLocaleLowerCase('ru-RU').split(/[^а-яё]+/)) {
      if (word.length < STEM_LEN) continue;
      const stem = word.slice(0, STEM_LEN);
      CANONICAL_STEMS.set(stem, (CANONICAL_STEMS.get(stem) || 0) | mask);
    }
  }
}

function classifySentence(sentence: string): number {
  let mask = 0;
  for (const [placeholder, phMask] of PLACEHOLDER_MASKS) {
    if (sentence.includes(placeholder)) mask |= phMask;
  }
  for (const word of sentence.toLocaleLowerCase('ru-RU').split(/[^а-яё]+/)) {
    if (word.length < STEM_LEN) continue;
    mask |= CANONICAL_STEMS.get(word.slice(0, STEM_LEN)) ?? 0;
  }
  return mask;
}

/**
 * Корпус собран из внешних текстов и содержит следы веб-скрейпа: ссылки,
 * призывы подписаться, названия площадок и движков. Такие слова попадают в
 * матрицу как обычные состояния и потом всплывают в реплике NPC, разрушая
 * иллюзию мира. Это единственная точка входа корпуса — фильтруем здесь, чтобы
 * следующий импорт не занёс мусор заново.
 */
function isInWorldSentence(sentence: string): boolean {
  // Плейсхолдеры вида <SUBJ>/<PLACE> латинские по построению — снимаем их
  // перед проверкой на латиницу, иначе отбросим весь нормальный корпус.
  const body = sentence.replace(/<[A-Z_]+>/g, ' ');
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:ru|com|net|org|io|tv|me)\b/i.test(body)) return false;
  if (/[@#]\w/.test(body)) return false;
  if (/[A-Za-z]{3,}/.test(body)) return false;
  // Падежи обязательны: `тред[ыао]?` не ловил `тредах`/`тредов`, и они доходили
  // до речи NPC («в жанре сборка -тредах»). Осторожно с соседями по списку:
  // `подпись`, `канал` и `канализация` — законные внутримировые слова
  // (подпись на ведомости, вентиляционный канал), под фильтр они не идут.
  if (/подписывайт|подписк|подпишит|лайк|репост|донат|патреон|бусти|телеграм|ютуб|твитч|дискорд|стрим(?:ер|инг)|подкаст|бугурт|тред[а-я]*|форум[а-я]*|комментари[а-я]*|сайт[а-я]*|абучан[а-я]*|двач[а-я]*|имиджборд[а-я]*|пикабу|реддит|автор канала/i.test(body)) return false;
  return true;
}

try {
  const corpusDir = path.join(process.cwd(), 'src/data/training_corpus');
  if (fs.existsSync(corpusDir)) {
    const files = fs.readdirSync(corpusDir).filter(f => f.endsWith('.txt') || f.endsWith('.jsonl'));
    console.log(`[System] Loading corpus (${files.length} files: ${files.join(', ')})...`);
    let added = 0;
    
    const categoryMap: Array<[RegExp, string]> = [
      [/(Рэдрик[а-я]*|Шухарт[а-я]*|Ричард[а-я]*|Нунан[а-я]*|Артем[а-я]*|Меченый|Стрелок[а-я]*|Сидорович[а-я]*|Бармен[а-я]*|Мельник[а-я]*|Хантер[а-я]*|Бурбон[а-я]*|Сухой|Андрей[а-я]*|Воронин[а-я]*|ликвидатор[а-я]*|слесарь[а-я]*|патрульны[йеам]*|бригадир[а-я]*|мясник[а-я]*|проходчик[а-я]*|экспедитор[а-я]*|инженер[а-я]*|мусорщик[а-я]*|гражданин[а-я]*|сталкер[а-я]*|ходок[а-я]*|анон[а-я]*)/gi, '<SUBJ>'],
      [/(ЧАЭС|Чернобыль[а-я]*|Кордон[а-я]*|Свалк[аиуе]|Агропром[а-я]*|Темная Долина|Армейские Склады|Рыжий Лес|Радар[а-я]*|Припять[а-я]*|Затон[а-я]*|Юпитер[а-я]*|Выжигатель[а-я]*|ВДНХ|Полис[а-я]*|Алексеевск[а-я]*|Рижск[а-я]*|Смоленск[а-я]*|Арбатск[а-я]*|Красная Линия|Зон[ауеы]|зоной|зоне|институт[а-я]*|бункер[а-я]*|гермодвер[ьяием]*|герма[аммиуе]*|гермозатвор[а-я]*|цех[а-я]*|сектор[а-я]*|этаж[а-я]*|тупик[а-я]*|Клеть|Здания-Стен[аыеу]|Город[а-я]*)/gi, '<PLACE>'],
      [/(снорк[а-я]*|контролер[а-я]*|полтергейст[а-я]*|бюрер[а-я]*|слепые псы|слепой пес|псевдогигант[а-я]*|кровосос[а-я]*|кикимор[а-я]*|Чёрны[хеим]*|Самосбор[а-я]*|радиаци[яиюей]*|аномали[яиюей]*|слизь|бетонник[а-я]*|выброс[а-я]*|пси-излучени[яе]*|удушь[яе]*|голод[а-я]*)/gi, '<THREAT>'],
      [/(хабар[а-я]*|деньг[иами]*|пустышк[аиуей]*|фильтр[а-я]*|тушенк[аиуей]*|бинт[а-я]*|гаусс-пушк[аиуей]*|гаусс[а-я]*|дозиметр[а-я]*|патрон[а-я]*|артефакт[а-я]*|медуз[аыуей]*|ломоть мяса|мамина бусы|контейнер[а-я]*)/gi, '<ITEM>'],
      [/(Долг[а-я]*|Свобод[аыеу]|Монолит[а-я]*|Чистое Небо|Наемники|Ганз[аыеу]|Орден[а-я]*|Спарта)/gi, '<FACTION>'],
      [/(схватил[а-я]*|побежал[а-я]*|ударил[а-я]*|закричал[а-я]*|упал[а-я]*|убил[а-я]*|стрелял[а-я]*|открыл[а-я]*|закрыл[а-я]*|спрятал[а-я]*|нашел|нашёл|увидел[а-я]*|услышал[а-я]*|вспомнил[а-я]*|забыл[а-я]*|подумал[а-я]*|решил[а-я]*|спросил[а-я]*|ответил[а-я]*|сказал[а-я]*|прошептал[а-я]*|пробормотал[а-я]*|бросил[а-я]*|поднял[а-я]*)/gi, '<ACTION_VERB>'],
      [/(страх[ауеом]*|ужас[ауеом]*|паник[аиуей]*|отчаяни[яеюм]*|гнев[ауеом]*|ярость|ярост[иью]*|радост[иью]*|счасть[яеюм]*|горем*|печаль[ю]*|груст[иью]*|удивления*|шок[ауеом]*|спокойстви[яеюм]*|надежд[аыуей]*)/gi, '<EMOTION>'],
    ];

    for (const file of files) {
      const filePath = path.join(corpusDir, file);
      const text = fs.readFileSync(filePath, 'utf8');
      const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];

      for (const s of sentences) {
        let clean = s.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
        for (const [regex, replacement] of categoryMap) {
          clean = clean.replace(regex, replacement);
        }
        clean = clean
          .replace(/\bсталкер[а-я]*\b/gi, '<SUBJ>')
          .replace(/\bчаэс\b/gi, '<PLACE>')
          .replace(/\bсидорович[а-я]*\b/gi, '<SUBJ>')
          .replace(/\bконтролер[а-я]*\b/gi, '<THREAT>')
          .replace(/\bснорк[а-я]*\b/gi, '<THREAT>');

        clean = clean.replace(/(?<=[а-яё,"]\s+)[А-ЯЁ][а-яё]+/g, '<NPC_NAME>');
        clean = clean.replace(/^[А-ЯЁ][а-яё]+\b(?!\s+(?:это|был|в|на|с|от|из|к|по|за|для|о|у|и|а|но|или))\b/g, '<NPC_NAME>');

        const wordsCount = clean.split(' ').length;
        if (wordsCount >= 3 && wordsCount <= 50 && isInWorldSentence(clean)) {
          RAW_CORPUS.push({ text: clean, mask: classifySentence(clean) });
          added++;
        } else if (wordsCount >= 3 && wordsCount <= 50) {
          rejectedMeta++;
        }
      }
    }
    console.log(`[System] Loaded ${added} sentences from corpus (rejected ${rejectedMeta} out-of-world/meta sentences).`);
  }
} catch (e) {
  console.log('[System] Error loading corpus:', e);
}


function compileAndVerify(): void {
  const unknownTags = new Set<string>();
  for (const [catName, items] of Object.entries(CANONICAL_CATEGORIES)) {
    for (const item of items) {
      if (!isSanitizedWord(item.text)) {
        throw new Error(`Sanitization check failed for item in ${catName}: ${item.text}`);
      }
      for (const raw of item.tags) {
        if (!TAG_BIT.has(raw) && !TAG_ALIASES[raw]) unknownTags.add(raw);
      }
      withDerivedAxes(item);
    }
  }
  console.log(`[Compile Markov Matrix] Tag vocabulary: ${CANONICAL_TAGS.length} canonical bits, ${Object.keys(TAG_ALIASES).length} aliases, ${unknownTags.size} raw tags left unmapped.`);

  /* Словарь для рантайма: канонические имена и синонимы в одной таблице. */
  const tagDictionary: Record<string, number> = {};
  for (const name of CANONICAL_TAGS) tagDictionary[name] = TAG_BIT.get(name)!;
  for (const alias of Object.keys(TAG_ALIASES)) tagDictionary[alias] = tagMask([alias]);

  console.log('[Compile Markov Matrix] Training Markov Model...');
  const model = new MarkovModel(1);
  model.train(RAW_CORPUS);

  console.log('[Compile Markov Matrix] Building heuristics...');
  const targetTags = Object.keys(CANONICAL_CATEGORIES).map(k => `<${k}>`);
  model.buildHeuristics(targetTags);

  console.log('[Compile Markov Matrix] Serializing graph...');
  /* Ребро — одно число: старшие биты count, младшие 32 — маска тегов.
     Объект {count, tags:{...}} на 124к рёбер стоил ~37 МиБ постоянной кучи
     и ~5 МБ бандла, причём хранил одну и ту же константу. */
  const edgeMasks = new Map<string, Map<string, number>>();
  const maskFreq = new Map<number, number>();
  let maskedEdges = 0;
  for (const [hist, trans] of model.graph.entries()) {
    const row = new Map<string, number>();
    for (const [next, info] of trans.entries()) {
      let mask = 0;
      if (info.maskCounts.size > 0) {
        const majority = info.count / 2;
        for (let bit = 0; bit < CANONICAL_TAGS.length; bit++) {
          const flag = (1 << bit) >>> 0;
          let hits = 0;
          for (const [m, c] of info.maskCounts) if (m & flag) hits += c;
          if (hits >= majority) mask = (mask | flag) >>> 0;
        }
      }
      if (mask !== 0) maskedEdges++;
      row.set(next, mask);
      maskFreq.set(mask, (maskFreq.get(mask) ?? 0) + 1);
    }
    edgeMasks.set(hist, row);
  }

  /* Частые маски получают младшие индексы: короче число в JSON. */
  const maskTable = [...maskFreq.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  if (maskTable.length > EDGE_COUNT_SCALE) {
    throw new Error(`различных масок ${maskTable.length}, в ${MASK_INDEX_BITS} бит индекса влезает ${EDGE_COUNT_SCALE}`);
  }
  const maskIndex = new Map(maskTable.map((m, i) => [m, i]));

  const objGraph: Record<string, Record<string, number>> = {};
  for (const [hist, row] of edgeMasks) {
    const out: Record<string, number> = {};
    for (const [next, mask] of row) {
      const count = model.graph.get(hist)!.get(next)!.count;
      const packed = count * EDGE_COUNT_SCALE + maskIndex.get(mask)!;
      if (packed > 0x7fffffff) throw new Error(`ребро ${packed} вышло за SMI: count ${count}`);
      out[next] = packed;
    }
    objGraph[hist] = out;
  }
  console.log(`[Compile Markov Matrix] Edges with a non-empty tag mask: ${maskedEdges}; distinct masks: ${maskTable.length}.`);

  /* Пустые карты не выпускаем: категория, до которой корпус не абстрагирован,
     недостижима обходом графа, и рантайм обязан такую цель пропускать, а не
     вести к ней. Пустая карта в матрице выглядела бы как рабочая цель. */
  const objDistances: Record<string, Record<string, number>> = {};
  const unreachable: string[] = [];
  for (const [target, distMap] of model.patternDistances.entries()) {
    if (distMap.size === 0) { unreachable.push(target); continue; }
    objDistances[target] = Object.fromEntries(distMap.entries());
  }
  console.log(`[Compile Markov Matrix] Steerable skeleton targets: ${Object.keys(objDistances).length}; not present in corpus: ${unreachable.join(', ') || 'none'}.`);

  const outPath = path.resolve(__dirname, '../src/data/markov_compiled_matrix.ts');
  const fileContent = `/* ── Precompiled Markov Matrix & Categories (Build-Time Generated) ── */
/* Do not edit manually. Generated by scripts/compile_markov_matrix.ts */
/* Contains 100% canonical Gigahrush & Samosbor entities with PCA axes. */

export interface CompiledCategoryItem {
  readonly text: string;
  readonly weight: number;
  readonly tags: readonly string[];
  /** Битовая маска канонических тегов, биты — из COMPILED_TAG_BITS. */
  readonly mask: number;
  readonly pcaDanger: number;
  readonly pcaWealth: number;
  readonly pcaNeed: number;
}

export interface CompiledSyntaxSkeleton {
  readonly id: string;
  readonly pattern: readonly string[];
  readonly intent: string;
  readonly weight: number;
}

/**
 * Канонический словарь тегов: имя → маска. Единственный контракт между всем,
 * что производит контекст в игре, и корпусом. Рантайм читает биты отсюда и
 * не хардкодит порядок; синонимы («thirst») раскрываются в свои канонические
 * биты (water|need) прямо в этой таблице.
 */
export const COMPILED_TAG_BITS: Readonly<Record<string, number>> = ${JSON.stringify(tagDictionary, null, 2)} as const;

export const COMPILED_CATEGORIES: Readonly<Record<string, readonly CompiledCategoryItem[]>> = ${JSON.stringify(CANONICAL_CATEGORIES, null, 2)} as const;
export const COMPILED_SKELETONS: readonly CompiledSyntaxSkeleton[] = ${JSON.stringify(CANONICAL_SKELETONS, null, 2)} as const;

/**
 * Ребро упаковано в одно число: count * 2^${MASK_INDEX_BITS} + индекс маски
 * в COMPILED_MASK_TABLE. Распаковка — markovEdgeCount() / markovEdgeMask().
 */
export const COMPILED_MARKOV_GRAPH: Record<string, Record<string, number>> = JSON.parse(${JSON.stringify(JSON.stringify(objGraph))});

/** Таблица различных масок тегов; индекс лежит в младших битах ребра. */
export const COMPILED_MASK_TABLE: readonly number[] = JSON.parse(${JSON.stringify(JSON.stringify(maskTable))});

export const MARKOV_EDGE_COUNT_SCALE = ${EDGE_COUNT_SCALE};

export function markovEdgeCount(edge: number): number {
  return (edge / MARKOV_EDGE_COUNT_SCALE) | 0;
}

export function markovEdgeMask(edge: number): number {
  return COMPILED_MASK_TABLE[edge & ${EDGE_COUNT_SCALE - 1}] ?? 0;
}
export const COMPILED_PATTERN_DISTANCES: Record<string, Record<string, number>> = JSON.parse(${JSON.stringify(JSON.stringify(objDistances))});
`;

  fs.writeFileSync(outPath, fileContent, 'utf-8');
  console.log(`[Compile Markov Matrix] Successfully wrote ${outPath} (${(fileContent.length / 1024 / 1024).toFixed(2)} MB)`);
}
compileAndVerify();
